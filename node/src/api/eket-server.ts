/**
 * EKET Protocol HTTP Server
 *
 * 实现 EKET Protocol v1.0.0 定义的完整 REST API
 *
 * 功能：
 * - Agent 注册、生命周期管理
 * - 任务分配、状态更新
 * - 消息队列
 * - PR 工作流
 * - WebSocket 实时通信
 *
 * @module eket-server
 */

import express, { Express, Request, Response, NextFunction } from 'express';
import { createServer, Server as HTTPServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import cors from 'cors';
import Ajv from 'ajv';
import morgan from 'morgan';
import fs from 'fs';
import path from 'path';

import { createRedisClient, type RedisClient } from '../core/redis-client.js';
import { logger } from '../utils/logger.js';
import type { Message } from '../types/index.js';
import { RedisHelper } from './redis-helper.js';

// ============================================================================
// Types
// ============================================================================

export interface EketServerConfig {
  port: number;
  host: string;
  jwtSecret: string;
  projectRoot: string;
  enableWebSocket?: boolean;
  heartbeatInterval?: number; // seconds
  heartbeatTimeout?: number; // seconds
}

export interface AgentRegistration {
  agent_type: 'claude_code' | 'openclaw' | 'cursor' | 'windsurf' | 'gemini' | 'custom';
  agent_version?: string;
  role: 'master' | 'slaver';
  specialty?: 'frontend' | 'backend' | 'fullstack' | 'qa' | 'devops' | 'designer' | 'general';
  capabilities?: string[];
  metadata?: {
    user?: string;
    machine?: string;
    timezone?: string;
  };
  protocol_version?: string;
}

export interface AgentDetails {
  instance_id: string;
  agent_type: string;
  role: string;
  specialty?: string;
  status: 'active' | 'idle' | 'stale';
  current_task?: string;
  registered_at: string;
  last_heartbeat: string;
}

export interface Task {
  id: string;
  title: string;
  type: 'feature' | 'bugfix' | 'task' | 'test' | 'doc' | 'refactor';
  priority: 'P0' | 'P1' | 'P2' | 'P3';
  status: 'backlog' | 'ready' | 'in_progress' | 'review' | 'done';
  assigned_to?: string;
  created_at: string;
  updated_at: string;
  description?: string;
  acceptance_criteria?: Array<{ description: string; completed: boolean }>;
  tags?: string[];
  estimate?: string;
}

export interface PRSubmission {
  instance_id: string;
  task_id: string;
  branch: string;
  description: string;
  test_status: 'passed' | 'failed' | 'skipped';
}

export interface PRReview {
  reviewer: string;
  status: 'approved' | 'changes_requested' | 'rejected';
  comments?: Array<{ file: string; line: number; comment: string }>;
  summary?: string;
}

export interface PRMerge {
  merger: string;
  target_branch: string;
  squash?: boolean;
}

// ============================================================================
// EKET Server Class
// ============================================================================

export class EketServer {
  private app: Express;
  private httpServer: HTTPServer;
  private wss?: WebSocketServer;
  private config: EketServerConfig;
  private redis?: RedisClient;
  private redisHelper?: RedisHelper;
  // private sqlite?: SQLiteClient;  // Unused in MVP
  // private messageQueue: ReturnType<typeof createMessageQueue>;  // Unused in MVP
  private wsClients: Map<string, WebSocket> = new Map();
  private startTime: Date;
  private ajv: Ajv;
  private schemas: Record<string, any> = {};

  constructor(config: EketServerConfig) {
    this.config = {
      heartbeatInterval: 60,
      heartbeatTimeout: 300,
      enableWebSocket: true,
      ...config,
    };
    this.app = express();
    this.httpServer = createServer(this.app);
    this.startTime = new Date();
    this.ajv = new Ajv({ allErrors: true, strict: false });
    this.loadSchemas();
    this.initialize();
  }

  private initialize(): void {
    // Middleware - Security First
    this.setupCORS();
    this.setupRateLimiting();
    this.setupRequestLogging();

    // Standard Middleware
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));

    // Routes
    this.registerHealthRoutes();
    this.registerAgentRoutes();
    this.registerTaskRoutes();
    this.registerMessageRoutes();
    this.registerPRRoutes();

    // Error handler
    this.app.use(this.errorHandler.bind(this));

    // WebSocket
    if (this.config.enableWebSocket) {
      this.initializeWebSocket();
    }
  }

  // =========================================================================
  // Schema Loading
  // =========================================================================

  private loadSchemas(): void {
    try {
      const schemasDir = path.join(this.config.projectRoot, 'docs/protocol/schemas');

      // Load agent_registration.json
      const agentRegPath = path.join(schemasDir, 'agent_registration.json');
      if (fs.existsSync(agentRegPath)) {
        this.schemas.agentRegistration = JSON.parse(fs.readFileSync(agentRegPath, 'utf8'));
        this.ajv.addSchema(this.schemas.agentRegistration, 'agentRegistration');
        logger.info('schema_loaded', { schema: 'agent_registration' });
      }

      // Load message.json
      const messagePath = path.join(schemasDir, 'message.json');
      if (fs.existsSync(messagePath)) {
        this.schemas.message = JSON.parse(fs.readFileSync(messagePath, 'utf8'));
        this.ajv.addSchema(this.schemas.message, 'message');
        logger.info('schema_loaded', { schema: 'message' });
      }

      // Load task.json
      const taskPath = path.join(schemasDir, 'task.json');
      if (fs.existsSync(taskPath)) {
        this.schemas.task = JSON.parse(fs.readFileSync(taskPath, 'utf8'));
        this.ajv.addSchema(this.schemas.task, 'task');
        logger.info('schema_loaded', { schema: 'task' });
      }
    } catch (err) {
      logger.warn('schema_loading_failed', { error: (err as Error).message });
    }
  }

  // =========================================================================
  // Security Setup
  // =========================================================================

  private setupCORS(): void {
    const corsOrigin = process.env.CORS_ORIGIN || '*';
    this.app.use(
      cors({
        origin: corsOrigin,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
        allowedHeaders: ['Content-Type', 'Authorization'],
        credentials: true,
      })
    );
    logger.info('cors_enabled', { origin: corsOrigin });
  }

  private setupRateLimiting(): void {
    const limiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: parseInt(process.env.RATE_LIMIT_MAX || '100', 10), // Default: 100 requests per 15 min
      message: {
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests from this IP, please try again later.',
        },
      },
      standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
      legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    });

    this.app.use('/api/', limiter);
    logger.info('rate_limiting_enabled', { windowMs: 15 * 60 * 1000, max: 100 });
  }

  private setupRequestLogging(): void {
    // Custom morgan token for request body (sanitized)
    morgan.token('body', (req: Request) => {
      const body = { ...req.body };
      // Sanitize sensitive fields
      if (body.token) body.token = '[REDACTED]';
      if (body.password) body.password = '[REDACTED]';
      if (body.secret) body.secret = '[REDACTED]';
      return JSON.stringify(body);
    });

    // Morgan logging format
    const logFormat =
      ':remote-addr :method :url :status :res[content-length] - :response-time ms :body';

    this.app.use(
      morgan(logFormat, {
        stream: {
          write: (message: string) => logger.info(message.trim()),
        },
        skip: (req: Request) => req.path === '/health', // Skip health check logs
      })
    );
  }

  // =========================================================================
  // Input Validation
  // =========================================================================

  private validateBody(schemaName: string) {
    return (req: Request, res: Response, next: NextFunction): void => {
      const schema = this.ajv.getSchema(schemaName);
      if (!schema) {
        logger.warn('schema_not_found', { schemaName });
        return next(); // Skip validation if schema not loaded
      }

      const valid = schema(req.body);
      if (!valid) {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request body',
            details: schema.errors,
          },
        });
        return;
      }
      next();
    };
  }

  // =========================================================================
  // Middleware
  // =========================================================================

  private authenticate(req: Request, res: Response, next: NextFunction): void {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Missing or invalid authorization header',
        },
      });
      return;
    }

    const token = authHeader.substring(7);
    try {
      const payload = jwt.verify(token, this.config.jwtSecret) as { instance_id: string };
      (req as any).instance_id = payload.instance_id;
      next();
    } catch (err) {
      res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Invalid token',
        },
      });
    }
  }

  private errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction): void {
    logger.error('http_error', { error: err.message, stack: err.stack, path: _req.path });
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: err.message,
      },
    });
  }

  // =========================================================================
  // Health Routes
  // =========================================================================

  private registerHealthRoutes(): void {
    this.app.get('/health', async (_req: Request, res: Response) => {
      const uptime = Math.floor((Date.now() - this.startTime.getTime()) / 1000);

      const health = {
        status: 'ok' as 'ok' | 'degraded' | 'unhealthy',
        version: '1.0.0',
        uptime,
        timestamp: Date.now(),
        dependencies: {
          redis: 'unknown' as 'healthy' | 'unhealthy' | 'unknown',
          websocket: 'unknown' as 'healthy' | 'unhealthy' | 'unknown',
        },
      };

      // Check Redis
      if (this.redis) {
        try {
          await this.redis.ping();
          health.dependencies.redis = 'healthy';
        } catch (error) {
          health.dependencies.redis = 'unhealthy';
          health.status = 'degraded';
          logger.warn('health_check_redis_failed', { error: (error as Error).message });
        }
      } else {
        health.dependencies.redis = 'unhealthy';
        health.status = 'degraded';
      }

      // Check WebSocket
      if (this.wss) {
        health.dependencies.websocket = 'healthy';
      } else {
        health.dependencies.websocket = this.config.enableWebSocket ? 'unhealthy' : 'healthy';
      }

      // Determine overall status
      if (
        health.dependencies.redis === 'unhealthy' &&
        health.dependencies.websocket === 'unhealthy'
      ) {
        health.status = 'unhealthy';
      }

      const statusCode = health.status === 'ok' ? 200 : health.status === 'degraded' ? 200 : 503;
      res.status(statusCode).json(health);
    });
  }

  // =========================================================================
  // Agent Routes
  // =========================================================================

  private registerAgentRoutes(): void {
    // POST /api/v1/agents/register
    this.app.post(
      '/api/v1/agents/register',
      this.validateBody('agentRegistration'),
      async (req: Request, res: Response) => {
      try {
        const body = req.body as AgentRegistration;

        // Validate
        if (!body.role) {
          res.status(400).json({
            success: false,
            error: { code: 'VALIDATION_ERROR', message: 'Missing required field: role' },
          });
          return;
        }

        // Generate instance ID
        const timestamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15);
        const pid = Math.floor(Math.random() * 99999);
        const role = body.role;
        const specialty = body.specialty || '';
        const instance_id =
          role === 'master'
            ? `master_${timestamp}_${pid}`
            : specialty
            ? `slaver_${specialty}_${timestamp}_${pid}`
            : `slaver_${timestamp}_${pid}`;

        // Generate JWT token
        const token = jwt.sign({ instance_id }, this.config.jwtSecret, { expiresIn: '7d' });

        // Save to Redis/SQLite
        const agentData: AgentDetails = {
          instance_id,
          agent_type: body.agent_type,
          role: body.role,
          specialty: body.specialty,
          status: 'active',
          registered_at: new Date().toISOString(),
          last_heartbeat: new Date().toISOString(),
        };

        if (this.redisHelper?.isAvailable()) {
          await this.redisHelper.hset(`agent:${instance_id}`, agentData as any);
          await this.redisHelper.sadd('agents:all', instance_id);
        }

        logger.info('agent_registered', { instance_id, role, specialty });

        res.status(201).json({
          success: true,
          instance_id,
          server_url: `http://${this.config.host}:${this.config.port}`,
          websocket_url: this.config.enableWebSocket
            ? `ws://${this.config.host}:${this.config.port}/ws`
            : undefined,
          heartbeat_interval: this.config.heartbeatInterval,
          token,
        });
      } catch (err) {
        logger.error('agent_register_error', { error: (err as Error).message });
        res.status(500).json({
          success: false,
          error: { code: 'INTERNAL_ERROR', message: (err as Error).message },
        });
      }
    });

    // GET /api/v1/agents/:instance_id
    this.app.get(
      '/api/v1/agents/:instance_id',
      this.authenticate.bind(this),
      async (req: Request, res: Response) => {
        try {
          const { instance_id } = req.params;

          if (this.redis) {
            const agentData = await this.redisHelper!.hgetall(`agent:${instance_id}`);
            if (!agentData || Object.keys(agentData).length === 0) {
              res.status(404).json({
                success: false,
                error: { code: 'NOT_FOUND', message: 'Agent not found' },
              });
              return;
            }
            res.json({ success: true, agent: agentData });
          } else {
            res.status(503).json({
              success: false,
              error: { code: 'SERVICE_UNAVAILABLE', message: 'Redis not available' },
            });
          }
        } catch (err) {
          logger.error('agent_get_error', { error: (err as Error).message });
          res.status(500).json({
            success: false,
            error: { code: 'INTERNAL_ERROR', message: (err as Error).message },
          });
        }
      }
    );

    // DELETE /api/v1/agents/:instance_id
    this.app.delete(
      '/api/v1/agents/:instance_id',
      this.authenticate.bind(this),
      async (req: Request, res: Response) => {
        try {
          const { instance_id } = req.params as { instance_id: string };

          if (this.redis) {
            await this.redisHelper!.del(`agent:${instance_id}`);
            await this.redisHelper!.srem('agents:all', instance_id);
          }

          // Close WebSocket connection
          const instance = instance_id as string;
          const ws = this.wsClients.get(instance);
          if (ws) {
            ws.close();
            this.wsClients.delete(instance);
          }

          logger.info('agent_deregistered', { instance_id });

          res.json({
            success: true,
            message: 'Agent deregistered successfully',
          });
        } catch (err) {
          logger.error('agent_deregister_error', { error: (err as Error).message });
          res.status(500).json({
            success: false,
            error: { code: 'INTERNAL_ERROR', message: (err as Error).message },
          });
        }
      }
    );

    // POST /api/v1/agents/:instance_id/heartbeat
    this.app.post(
      '/api/v1/agents/:instance_id/heartbeat',
      this.authenticate.bind(this),
      async (req: Request, res: Response) => {
        try {
          const { instance_id } = req.params;
          const body = req.body as {
            status?: 'active' | 'idle' | 'busy';
            current_task?: string;
            progress?: number;
          };

          if (this.redis) {
            await this.redisHelper!.hset(`agent:${instance_id}`, {
              last_heartbeat: new Date().toISOString(),
              status: body.status || 'active',
              current_task: body.current_task || '',
            });
          }

          // Get pending messages
          const messages: Message[] = [];
          if (this.redis) {
            const msgKeys = await this.redisHelper!.lrange(`agent:${instance_id}:messages`, 0, -1);
            for (const msgStr of msgKeys) {
              try {
                messages.push(JSON.parse(msgStr));
              } catch (e) {
                logger.warn('invalid_message_format', { msgStr });
              }
            }
            await this.redisHelper!.del(`agent:${instance_id}:messages`);
          }

          res.json({
            success: true,
            server_time: new Date().toISOString(),
            messages,
          });
        } catch (err) {
          logger.error('heartbeat_error', { error: (err as Error).message });
          res.status(500).json({
            success: false,
            error: { code: 'INTERNAL_ERROR', message: (err as Error).message },
          });
        }
      }
    );

    // GET /api/v1/agents
    this.app.get(
      '/api/v1/agents',
      this.authenticate.bind(this),
      async (req: Request, res: Response) => {
        try {
          const { role, status } = req.query as { role?: string; status?: string };

          const agents: AgentDetails[] = [];
          if (this.redis) {
            const instanceIds = await this.redisHelper!.smembers('agents:all');
            for (const id of instanceIds) {
              const agentData = (await this.redisHelper!.hgetall(`agent:${id}`)) as any;
              if (Object.keys(agentData).length === 0) continue;

              // Filter by role
              if (role && agentData.role !== role) continue;

              // Filter by status
              if (status && agentData.status !== status) continue;

              agents.push(agentData as AgentDetails);
            }
          }

          res.json({ success: true, agents });
        } catch (err) {
          logger.error('agents_list_error', { error: (err as Error).message });
          res.status(500).json({
            success: false,
            error: { code: 'INTERNAL_ERROR', message: (err as Error).message },
          });
        }
      }
    );
  }

  // =========================================================================
  // Task Routes
  // =========================================================================

  private registerTaskRoutes(): void {
    // GET /api/v1/tasks
    this.app.get(
      '/api/v1/tasks',
      this.authenticate.bind(this),
      async (req: Request, res: Response) => {
        try {
          const { status, assigned_to, tags } = req.query as {
            status?: string;
            assigned_to?: string;
            tags?: string;
          };

          const tasks: Task[] = [];
          if (this.redis) {
            const taskIds = await this.redisHelper!.smembers('tasks:all');
            for (const id of taskIds) {
              const taskData = (await this.redisHelper!.hgetall(`task:${id}`)) as any;
              if (Object.keys(taskData).length === 0) continue;

              // Parse JSON fields
              if (taskData.acceptance_criteria) {
                taskData.acceptance_criteria = JSON.parse(taskData.acceptance_criteria);
              }
              if (taskData.tags) {
                taskData.tags = JSON.parse(taskData.tags);
              }

              // Apply filters
              if (status && taskData.status !== status) continue;
              if (assigned_to && taskData.assigned_to !== assigned_to) continue;
              if (tags) {
                const requiredTags = tags.split(',');
                const taskTags = taskData.tags || [];
                if (!requiredTags.every((t: string) => taskTags.includes(t))) continue;
              }

              tasks.push(taskData as Task);
            }
          }

          res.json({ success: true, tasks });
        } catch (err) {
          logger.error('tasks_list_error', { error: (err as Error).message });
          res.status(500).json({
            success: false,
            error: { code: 'INTERNAL_ERROR', message: (err as Error).message },
          });
        }
      }
    );

    // GET /api/v1/tasks/:task_id
    this.app.get(
      '/api/v1/tasks/:task_id',
      this.authenticate.bind(this),
      async (req: Request, res: Response) => {
        try {
          const { task_id } = req.params;

          if (this.redis) {
            const taskData = (await this.redisHelper!.hgetall(`task:${task_id}`)) as any;
            if (!taskData || Object.keys(taskData).length === 0) {
              res.status(404).json({
                success: false,
                error: { code: 'NOT_FOUND', message: 'Task not found' },
              });
              return;
            }

            // Parse JSON fields
            if (taskData.acceptance_criteria) {
              taskData.acceptance_criteria = JSON.parse(taskData.acceptance_criteria);
            }
            if (taskData.tags) {
              taskData.tags = JSON.parse(taskData.tags);
            }

            res.json({ success: true, task: taskData });
          } else {
            res.status(503).json({
              success: false,
              error: { code: 'SERVICE_UNAVAILABLE', message: 'Redis not available' },
            });
          }
        } catch (err) {
          logger.error('task_get_error', { error: (err as Error).message });
          res.status(500).json({
            success: false,
            error: { code: 'INTERNAL_ERROR', message: (err as Error).message },
          });
        }
      }
    );

    // PATCH /api/v1/tasks/:task_id
    this.app.patch(
      '/api/v1/tasks/:task_id',
      this.authenticate.bind(this),
      async (req: Request, res: Response) => {
        try {
          const { task_id } = req.params;
          const updates = req.body as { status?: string; progress?: number; notes?: string };

          if (this.redis) {
            const taskData = (await this.redisHelper!.hgetall(`task:${task_id}`)) as any;
            if (!taskData || Object.keys(taskData).length === 0) {
              res.status(404).json({
                success: false,
                error: { code: 'NOT_FOUND', message: 'Task not found' },
              });
              return;
            }

            // Update fields
            const updatedTask = {
              ...taskData,
              ...updates,
              updated_at: new Date().toISOString(),
            };

            await this.redisHelper!.hset(`task:${task_id}`, updatedTask);

            res.json({ success: true, task: updatedTask });
          } else {
            res.status(503).json({
              success: false,
              error: { code: 'SERVICE_UNAVAILABLE', message: 'Redis not available' },
            });
          }
        } catch (err) {
          logger.error('task_update_error', { error: (err as Error).message });
          res.status(500).json({
            success: false,
            error: { code: 'INTERNAL_ERROR', message: (err as Error).message },
          });
        }
      }
    );

    // POST /api/v1/tasks/:task_id/claim
    this.app.post(
      '/api/v1/tasks/:task_id/claim',
      this.authenticate.bind(this),
      async (req: Request, res: Response) => {
        try {
          const { task_id } = req.params;
          const { instance_id } = req.body as { instance_id: string };

          if (this.redis) {
            const taskData = (await this.redisHelper!.hgetall(`task:${task_id}`)) as any;
            if (!taskData || Object.keys(taskData).length === 0) {
              res.status(404).json({
                success: false,
                error: { code: 'NOT_FOUND', message: 'Task not found' },
              });
              return;
            }

            // Check if already assigned
            if (taskData.assigned_to && taskData.status === 'in_progress') {
              res.status(409).json({
                success: false,
                error: {
                  code: 'CONFLICT',
                  message: 'Task already assigned',
                  details: { assigned_to: taskData.assigned_to },
                },
              });
              return;
            }

            // Claim task
            const updatedTask = {
              ...taskData,
              assigned_to: instance_id,
              status: 'in_progress',
              updated_at: new Date().toISOString(),
            };

            await this.redisHelper!.hset(`task:${task_id}`, updatedTask);

            logger.info('task_claimed', { task_id, instance_id });

            res.json({ success: true, task: updatedTask });
          } else {
            res.status(503).json({
              success: false,
              error: { code: 'SERVICE_UNAVAILABLE', message: 'Redis not available' },
            });
          }
        } catch (err) {
          logger.error('task_claim_error', { error: (err as Error).message });
          res.status(500).json({
            success: false,
            error: { code: 'INTERNAL_ERROR', message: (err as Error).message },
          });
        }
      }
    );
  }

  // =========================================================================
  // Message Routes
  // =========================================================================

  private registerMessageRoutes(): void {
    // POST /api/v1/messages
    this.app.post(
      '/api/v1/messages',
      this.authenticate.bind(this),
      this.validateBody('message'),
      async (req: Request, res: Response) => {
        try {
          const body = req.body as Message;

          // Validate
          if (!body.from || !body.to || !body.type || !body.payload) {
            res.status(400).json({
              success: false,
              error: { code: 'VALIDATION_ERROR', message: 'Missing required message fields' },
            });
            return;
          }

          // Create message (simplified version)
          const message: Message = {
            id: `msg_${Date.now()}_${Math.random().toString(36).slice(2)}`,
            timestamp: new Date().toISOString(),
            from: body.from,
            to: body.to,
            type: body.type,
            priority: body.priority || 'normal',
            payload: body.payload,
          };

          // Store message
          if (this.redisHelper?.isAvailable()) {
            await this.redisHelper.rpush(`agent:${body.to}:messages`, JSON.stringify(message));
          }

          // Send via WebSocket if connected
          const ws = this.wsClients.get(body.to);
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'message', data: message }));
          }

          logger.info('message_sent', { from: body.from, to: body.to, type: body.type });

          res.status(201).json({
            success: true,
            message_id: message.id,
            delivered_at: message.timestamp,
          });
        } catch (err) {
          logger.error('message_send_error', { error: (err as Error).message });
          res.status(500).json({
            success: false,
            error: { code: 'INTERNAL_ERROR', message: (err as Error).message },
          });
        }
      }
    );

    // GET /api/v1/agents/:instance_id/messages
    this.app.get(
      '/api/v1/agents/:instance_id/messages',
      this.authenticate.bind(this),
      async (req: Request, res: Response) => {
        try {
          const { instance_id } = req.params;
          const { since, limit = 50 } = req.query as { since?: string; limit?: string };

          const messages: Message[] = [];
          if (this.redis) {
            const msgKeys = await this.redisHelper!.lrange(
              `agent:${instance_id}:messages`,
              0,
              parseInt(limit as string, 10) - 1
            );
            for (const msgStr of msgKeys) {
              try {
                const msg = JSON.parse(msgStr);
                // Filter by timestamp if 'since' provided
                if (since && new Date(msg.timestamp).getTime() < parseInt(since, 10) * 1000) {
                  continue;
                }
                messages.push(msg);
              } catch (e) {
                logger.warn('invalid_message_format', { msgStr });
              }
            }
          }

          res.json({
            success: true,
            messages,
            has_more: messages.length === parseInt(limit as string, 10),
          });
        } catch (err) {
          logger.error('messages_get_error', { error: (err as Error).message });
          res.status(500).json({
            success: false,
            error: { code: 'INTERNAL_ERROR', message: (err as Error).message },
          });
        }
      }
    );
  }

  // =========================================================================
  // PR Routes
  // =========================================================================

  private registerPRRoutes(): void {
    // POST /api/v1/prs
    this.app.post(
      '/api/v1/prs',
      this.authenticate.bind(this),
      async (req: Request, res: Response) => {
        try {
          const body = req.body as PRSubmission;

          // Validate
          if (!body.instance_id || !body.task_id || !body.branch || !body.description) {
            res.status(400).json({
              success: false,
              error: { code: 'VALIDATION_ERROR', message: 'Missing required PR fields' },
            });
            return;
          }

          const pr = {
            task_id: body.task_id,
            instance_id: body.instance_id,
            branch: body.branch,
            description: body.description,
            test_status: body.test_status,
            status: 'pending_review',
            created_at: new Date().toISOString(),
          };

          if (this.redis) {
            await this.redisHelper!.hset(`pr:${body.task_id}`, pr as any);
            await this.redisHelper!.sadd('prs:all', body.task_id);
          }

          logger.info('pr_submitted', { task_id: body.task_id, instance_id: body.instance_id });

          res.status(201).json({
            success: true,
            pr_id: body.task_id,
            status: 'pending_review',
          });
        } catch (err) {
          logger.error('pr_submit_error', { error: (err as Error).message });
          res.status(500).json({
            success: false,
            error: { code: 'INTERNAL_ERROR', message: (err as Error).message },
          });
        }
      }
    );

    // POST /api/v1/prs/:task_id/review
    this.app.post(
      '/api/v1/prs/:task_id/review',
      this.authenticate.bind(this),
      async (req: Request, res: Response) => {
        try {
          const { task_id } = req.params;
          const body = req.body as PRReview;

          // Validate
          if (!body.reviewer || !body.status) {
            res.status(400).json({
              success: false,
              error: { code: 'VALIDATION_ERROR', message: 'Missing required review fields' },
            });
            return;
          }

          if (this.redis) {
            const prData = (await this.redisHelper!.hgetall(`pr:${task_id}`)) as any;
            if (!prData || Object.keys(prData).length === 0) {
              res.status(404).json({
                success: false,
                error: { code: 'NOT_FOUND', message: 'PR not found' },
              });
              return;
            }

            // Update PR with review
            const updatedPR = {
              ...prData,
              review_status: body.status,
              reviewer: body.reviewer,
              review_comments: JSON.stringify(body.comments || []),
              review_summary: body.summary || '',
              reviewed_at: new Date().toISOString(),
            };

            await this.redisHelper!.hset(`pr:${task_id}`, updatedPR);

            logger.info('pr_reviewed', { task_id, reviewer: body.reviewer, status: body.status });

            res.json({ success: true, pr: updatedPR });
          } else {
            res.status(503).json({
              success: false,
              error: { code: 'SERVICE_UNAVAILABLE', message: 'Redis not available' },
            });
          }
        } catch (err) {
          logger.error('pr_review_error', { error: (err as Error).message });
          res.status(500).json({
            success: false,
            error: { code: 'INTERNAL_ERROR', message: (err as Error).message },
          });
        }
      }
    );

    // POST /api/v1/prs/:task_id/merge
    this.app.post(
      '/api/v1/prs/:task_id/merge',
      this.authenticate.bind(this),
      async (req: Request, res: Response) => {
        try {
          const { task_id } = req.params;
          const body = req.body as PRMerge;

          // Validate
          if (!body.merger || !body.target_branch) {
            res.status(400).json({
              success: false,
              error: { code: 'VALIDATION_ERROR', message: 'Missing required merge fields' },
            });
            return;
          }

          if (this.redis) {
            const prData = (await this.redisHelper!.hgetall(`pr:${task_id}`)) as any;
            if (!prData || Object.keys(prData).length === 0) {
              res.status(404).json({
                success: false,
                error: { code: 'NOT_FOUND', message: 'PR not found' },
              });
              return;
            }

            // Check if approved
            if (prData.review_status !== 'approved') {
              res.status(400).json({
                success: false,
                error: { code: 'VALIDATION_ERROR', message: 'PR not approved' },
              });
              return;
            }

            const mergeCommit = `merge_${task_id}_${Date.now()}`;
            const mergedAt = new Date().toISOString();

            // Update PR
            const updatedPR = {
              ...prData,
              status: 'merged',
              merge_commit: mergeCommit,
              merged_at: mergedAt,
              merger: body.merger,
              target_branch: body.target_branch,
            };

            await this.redisHelper!.hset(`pr:${task_id}`, updatedPR);

            logger.info('pr_merged', { task_id, merger: body.merger, target: body.target_branch });

            res.json({
              success: true,
              merge_commit: mergeCommit,
              merged_at: mergedAt,
            });
          } else {
            res.status(503).json({
              success: false,
              error: { code: 'SERVICE_UNAVAILABLE', message: 'Redis not available' },
            });
          }
        } catch (err) {
          logger.error('pr_merge_error', { error: (err as Error).message });
          res.status(500).json({
            success: false,
            error: { code: 'INTERNAL_ERROR', message: (err as Error).message },
          });
        }
      }
    );
  }

  // =========================================================================
  // WebSocket
  // =========================================================================

  private initializeWebSocket(): void {
    this.wss = new WebSocketServer({ server: this.httpServer, path: '/ws' });

    this.wss.on('connection', (ws: WebSocket, req) => {
      // Extract instance_id from query or headers
      const url = new URL(req.url || '', `http://${req.headers.host}`);
      const instance_id = url.searchParams.get('instance_id');

      if (!instance_id) {
        ws.close(1008, 'Missing instance_id');
        return;
      }

      this.wsClients.set(instance_id, ws);
      logger.info('ws_connected', { instance_id });

      ws.on('message', (data: Buffer) => {
        try {
          const msg = JSON.parse(data.toString());
          // Handle WebSocket messages (ping/pong, etc.)
          if (msg.type === 'ping') {
            ws.send(JSON.stringify({ type: 'pong', timestamp: new Date().toISOString() }));
          }
        } catch (err) {
          logger.warn('ws_invalid_message', { error: (err as Error).message });
        }
      });

      ws.on('close', () => {
        this.wsClients.delete(instance_id);
        logger.info('ws_disconnected', { instance_id });
      });

      ws.on('error', (err) => {
        logger.error('ws_error', { instance_id, error: err.message });
      });
    });
  }

  // =========================================================================
  // Lifecycle
  // =========================================================================

  public async start(): Promise<void> {
    // Initialize Redis
    try {
      this.redis = createRedisClient();
      await this.redis.connect();
      this.redisHelper = new RedisHelper(this.redis);
      logger.info('redis_connected');
    } catch (err) {
      logger.warn('redis_unavailable', { error: (err as Error).message });
    }

    // SQLite fallback (commented out for MVP)
    // try {
    //   this.sqlite = createSQLiteClient();
    //   logger.info('sqlite_connected');
    // } catch (err) {
    //   logger.warn('sqlite_unavailable', { error: (err as Error).message });
    // }

    return new Promise((resolve, reject) => {
      this.httpServer.listen(this.config.port, this.config.host, () => {
        logger.info('eket_server_started', {
          host: this.config.host,
          port: this.config.port,
          websocket: this.config.enableWebSocket,
        });
        console.log(`\n🚀 EKET Protocol Server v1.0.0`);
        console.log(`   HTTP:      http://${this.config.host}:${this.config.port}`);
        if (this.config.enableWebSocket) {
          console.log(`   WebSocket: ws://${this.config.host}:${this.config.port}/ws`);
        }
        console.log(`\n📚 API Documentation: http://${this.config.host}:${this.config.port}/health`);
        console.log(`\n✅ Ready to accept agent connections\n`);
        resolve();
      });

      this.httpServer.on('error', (err: unknown) => {
        const error = err as Error;
        logger.error('server_start_error', { error: error.message });
        reject(error);
      });
    });
  }

  public async stop(): Promise<void> {
    logger.info('eket_server_stopping');

    // Close WebSocket connections
    for (const [id, ws] of this.wsClients.entries()) {
      ws.close();
      logger.info('ws_closed', { instance_id: id });
    }
    this.wsClients.clear();

    // Close WebSocket server
    if (this.wss) {
      this.wss.close();
    }

    // Close HTTP server
    return new Promise((resolve) => {
      this.httpServer.close(() => {
        logger.info('eket_server_stopped');
        resolve();
      });
    });
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createEketServer(config: EketServerConfig): EketServer {
  return new EketServer(config);
}
