/**
 * EKET Protocol HTTP Server
 *
 * 入口文件：组合中间件 + 路由模块，管理服务器生命周期
 *
 * @module eket-server
 */

import fs from 'fs';
import { createServer, Server as HTTPServer } from 'http';
import path from 'path';

import Ajv from 'ajv';
import express, { Express, Request, Response, NextFunction } from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import jwt from 'jsonwebtoken';
import { WebSocketServer, WebSocket } from 'ws';

import { createRedisClient, type RedisClient } from '../core/redis-client.js';
import { logger } from '../utils/logger.js';

import { RedisHelper } from './redis-helper.js';
import { setupCORS, setupRateLimiting, setupRequestLogging, setupBodyParsing } from './middleware/setup-middleware.js';
import { createAgentRouter } from './routes/agent-routes.js';
import { createTaskRouter } from './routes/task-routes.js';
import { createHealthRouter, createSystemRouter } from './routes/system-routes.js';
import { sseEventBus } from '../core/sse-event-bus.js';
import { parseTicketsDag } from '../core/ticket-dag-parser.js';
export type {
  EketServerConfig,
  AgentRegistration,
  AgentDetails,
  Task,
  PRSubmission,
  PRReview,
  PRMerge,
} from './server-types.js';
import type {
  EketServerConfig,
} from './server-types.js';

// Extend Express Request to carry authenticated instance_id
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      instance_id?: string;
    }
  }
}

// ============================================================================
// Rust API Proxy Helpers
// ============================================================================

const RUST_API_URL = process.env.EKET_RUST_API_URL || 'http://localhost:9877';
const RUST_TIMEOUT_MS = 500;

async function isRustServerAlive(): Promise<boolean> {
  try {
    const resp = await fetch(`${RUST_API_URL}/health`, {
      signal: AbortSignal.timeout(RUST_TIMEOUT_MS),
    });
    return resp.ok;
  } catch {
    return false;
  }
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
  private wsClients: Map<string, WebSocket> = new Map();
  private startTime: Date;
  private ajv: Ajv;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    // initialize() is async; store the promise so start() can await it
    this._initPromise = this.initialize();
  }

  private _initPromise: Promise<void>;

  // =========================================================================
  // Schema Loading
  // =========================================================================

  private loadSchemas(): void {
    try {
      const schemasDir = path.join(this.config.projectRoot, 'docs/protocol/schemas');
      const schemaFiles = [
        { file: 'agent_registration.json', key: 'agentRegistration' },
        { file: 'message.json', key: 'message' },
        { file: 'task.json', key: 'task' },
      ];
      for (const { file, key } of schemaFiles) {
        const filePath = path.join(schemasDir, file);
        if (fs.existsSync(filePath)) {
          this.schemas[key] = JSON.parse(fs.readFileSync(filePath, 'utf8'));
          this.ajv.addSchema(this.schemas[key], key);
          logger.info('schema_loaded', { schema: file });
        }
      }
    } catch (err) {
      logger.warn('schema_loading_failed', { error: (err as Error).message });
    }
  }

  // =========================================================================
  // Middleware (auth/validation stay here; CORS/rate-limit/logging delegated)
  // =========================================================================

  private authenticate(req: Request, res: Response, next: NextFunction): void {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Missing or invalid authorization header' },
      });
      return;
    }
    const token = authHeader.substring(7);
    try {
      const payload = jwt.verify(token, this.config.jwtSecret) as { instance_id: string };
      req.instance_id = payload.instance_id;
      next();
    } catch (err) {
      res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Invalid token' },
      });
    }
  }

  private validateBody(schemaName: string) {
    return (req: Request, res: Response, next: NextFunction): void => {
      const schema = this.ajv.getSchema(schemaName);
      if (!schema) {
        logger.warn('schema_not_found', { schemaName });
        return next();
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

  private errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction): void {
    logger.error('http_error', { error: err.message, stack: err.stack, path: _req.path });
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: err.message },
    });
  }

  // =========================================================================
  // Initialization
  // =========================================================================

  private async initialize(): Promise<void> {
    setupCORS(this.app);
    setupRateLimiting(this.app);
    setupRequestLogging(this.app);
    setupBodyParsing(this.app);

    // Lazy deps: getters read instance fields at request time (after start())
    const server = this;
    const lazyDeps = {
      get redisHelper() { return server.redisHelper; },
      get redis() { return server.redis; },
      get wss() { return server.wss; },
      config: this.config,
      startTime: this.startTime,
      wsClients: this.wsClients,
      authenticate: this.authenticate.bind(this),
      validateBody: this.validateBody.bind(this),
    };

    this.app.use('/', createHealthRouter(lazyDeps));

    // Rust API proxy — check once at startup, proxy /api/v1/* if alive
    const rustAlive = await isRustServerAlive();
    if (rustAlive) {
      logger.info('rust_api_proxy_enabled', { target: RUST_API_URL });
      console.log(`[EKET] Rust API server detected at ${RUST_API_URL} — proxying /api/v1/*`);
      this.app.use(
        '/api/v1',
        createProxyMiddleware({
          target: RUST_API_URL,
          changeOrigin: true,
          on: {
            error: (err, _req, _res, _next) => {
              logger.warn('rust_proxy_error', { error: (err as Error).message });
              console.warn('[EKET] Rust proxy error, falling through to Node handler:', (err as Error).message);
            },
          },
        })
      );
    } else {
      logger.info('rust_api_proxy_disabled', { reason: 'server not reachable', target: RUST_API_URL });
      console.log('[EKET] Rust API server not detected — using Node.js handlers (fallback mode)');
    }

    this.app.use('/api/v1', createSystemRouter(lazyDeps));
    this.app.use('/api/v1', createAgentRouter(lazyDeps));
    this.app.use('/api/v1', createTaskRouter(lazyDeps));

    // SSE event bus (TASK-072)
    this.app.get('/api/v1/stream/__dashboard__', (_req: Request, res: Response) => {
      sseEventBus.subscribe('__dashboard__', res);
    });
    this.app.get('/api/v1/stream/:channelId', (req: Request, res: Response) => {
      const channelId = req.params['channelId'] as string;
      sseEventBus.subscribe(channelId, res);
    });

    // DAG / Dashboard (TASK-073)
    const ticketsDir = path.resolve(process.cwd(), '..', 'jira', 'tickets');
    this.app.get('/api/v1/tickets/dag', (_req: Request, res: Response) => {
      try {
        const dag = parseTicketsDag(ticketsDir);
        res.json({ success: true, data: dag });
      } catch (err) {
        res.status(500).json({
          success: false,
          error: { code: 'INTERNAL_ERROR', message: (err as Error).message },
        });
      }
    });
    this.app.get('/dashboard', (_req: Request, res: Response) => {
      try {
        const dag = parseTicketsDag(ticketsDir);
        const nodeMap = new Map(dag.nodes.map((n) => [n.id, n]));
        const dagLines = dag.edges.length === 0
          ? ['(no dependencies found)']
          : dag.edges.map((e) => {
              const src = nodeMap.get(e.source);
              const tgt = nodeMap.get(e.target);
              return `  ${e.source} (${src?.status ?? '?'}) → depends on → ${e.target} (${tgt?.status ?? '?'})`;
            });
        const html = `<pre>${dagLines.join('\n')}</pre>`;
        res.send(html);
      } catch (err) {
        res.status(500).send((err as Error).message);
      }
    });

    this.app.use(this.errorHandler.bind(this));

    if (this.config.enableWebSocket) {
      this.initializeWebSocket();
    }
  }

  // =========================================================================
  // WebSocket
  // =========================================================================

  private initializeWebSocket(): void {
    this.wss = new WebSocketServer({ server: this.httpServer, path: '/ws' });

    this.wss.on('connection', (ws: WebSocket, req) => {
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
    // Wait for async initialization (proxy detection) to complete
    await this._initPromise;

    try {
      this.redis = createRedisClient();
      await this.redis.connect();
      this.redisHelper = new RedisHelper(this.redis);
      logger.info('redis_connected');
    } catch (err) {
      logger.warn('redis_unavailable', { error: (err as Error).message });
    }

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

    for (const [id, ws] of this.wsClients.entries()) {
      ws.close();
      logger.info('ws_closed', { instance_id: id });
    }
    this.wsClients.clear();

    if (this.wss) {
      this.wss.close();
    }

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
