/**
 * Agent Routes
 *
 * EKET Protocol v1.0.0 — Agent lifecycle endpoints
 */

import { Router, Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { WebSocket } from 'ws';

import type { RedisClient } from '../../core/redis-client.js';
import type { Message } from '../../types/index.js';
import { logger } from '../../utils/logger.js';

import type { RedisHelper } from '../redis-helper.js';
import type { AgentDetails, AgentRegistration, EketServerConfig } from '../server-types.js';

export interface AgentRouterDeps {
  redisHelper?: RedisHelper;
  redis?: RedisClient;
  config: Pick<EketServerConfig, 'host' | 'port' | 'heartbeatInterval' | 'enableWebSocket' | 'jwtSecret'>;
  wsClients: Map<string, WebSocket>;
  authenticate: (req: Request, res: Response, next: NextFunction) => void;
  validateBody: (schemaName: string) => (req: Request, res: Response, next: NextFunction) => void;
}

export function createAgentRouter(deps: AgentRouterDeps): Router {
  const router = Router();
  const { redisHelper, redis, config, wsClients, authenticate, validateBody } = deps;

  // POST /agents/register
  router.post(
    '/agents/register',
    validateBody('agentRegistration'),
    async (req: Request, res: Response) => {
      try {
        const body = req.body as AgentRegistration;

        if (!body.role) {
          res.status(400).json({
            success: false,
            error: { code: 'VALIDATION_ERROR', message: 'Missing required field: role' },
          });
          return;
        }

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

        const token = jwt.sign({ instance_id }, config.jwtSecret, { expiresIn: '7d' });

        const agentData: AgentDetails = {
          instance_id,
          agent_type: body.agent_type,
          role: body.role,
          specialty: body.specialty,
          status: 'active',
          registered_at: new Date().toISOString(),
          last_heartbeat: new Date().toISOString(),
        };

        if (redisHelper?.isAvailable()) {
          await redisHelper.hset(`agent:${instance_id}`, agentData as unknown as Record<string, string>);
          await redisHelper.sadd('agents:all', instance_id);
        }

        logger.info('agent_registered', { instance_id, role, specialty });

        res.status(201).json({
          success: true,
          instance_id,
          server_url: `http://${config.host}:${config.port}`,
          websocket_url: config.enableWebSocket
            ? `ws://${config.host}:${config.port}/ws`
            : undefined,
          heartbeat_interval: config.heartbeatInterval,
          token,
        });
      } catch (err) {
        logger.error('agent_register_error', { error: (err as Error).message });
        res.status(500).json({
          success: false,
          error: { code: 'INTERNAL_ERROR', message: (err as Error).message },
        });
      }
    }
  );

  // GET /agents/:instance_id
  router.get(
    '/agents/:instance_id',
    authenticate,
    async (req: Request, res: Response) => {
      try {
        const { instance_id } = req.params;

        if (redis) {
          const agentData = await redisHelper!.hgetall(`agent:${instance_id}`);
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

  // DELETE /agents/:instance_id
  router.delete(
    '/agents/:instance_id',
    authenticate,
    async (req: Request, res: Response) => {
      try {
        const { instance_id } = req.params as { instance_id: string };

        if (redis) {
          await redisHelper!.del(`agent:${instance_id}`);
          await redisHelper!.srem('agents:all', instance_id);
        }

        const ws = wsClients.get(instance_id);
        if (ws) {
          ws.close();
          wsClients.delete(instance_id);
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

  // POST /agents/:instance_id/heartbeat
  router.post(
    '/agents/:instance_id/heartbeat',
    authenticate,
    async (req: Request, res: Response) => {
      try {
        const { instance_id } = req.params;
        const body = req.body as {
          status?: 'active' | 'idle' | 'busy';
          current_task?: string;
          progress?: number;
        };

        if (redis) {
          await redisHelper!.hset(`agent:${instance_id}`, {
            last_heartbeat: new Date().toISOString(),
            status: body.status || 'active',
            current_task: body.current_task || '',
          });
        }

        const messages: Message[] = [];
        if (redis) {
          const msgKeys = await redisHelper!.lrange(`agent:${instance_id}:messages`, 0, -1);
          for (const msgStr of msgKeys) {
            try {
              messages.push(JSON.parse(msgStr));
            } catch (e) {
              logger.warn('invalid_message_format', { msgStr });
            }
          }
          await redisHelper!.del(`agent:${instance_id}:messages`);
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

  // GET /agents
  router.get(
    '/agents',
    authenticate,
    async (req: Request, res: Response) => {
      try {
        const { role, status } = req.query as { role?: string; status?: string };

        const agents: AgentDetails[] = [];
        if (redis) {
          const instanceIds = await redisHelper!.smembers('agents:all');
          for (const id of instanceIds) {
            const agentData = await redisHelper!.hgetall(`agent:${id}`);
            if (!agentData) {continue;}
            if (role && agentData.role !== role) {continue;}
            if (status && agentData.status !== status) {continue;}
            agents.push(agentData as unknown as AgentDetails);
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

  // GET /agents/:instance_id/messages
  router.get(
    '/agents/:instance_id/messages',
    authenticate,
    async (req: Request, res: Response) => {
      try {
        const { instance_id } = req.params;
        const { since, limit = 50 } = req.query as { since?: string; limit?: string };

        const messages: Message[] = [];
        if (redis) {
          const msgKeys = await redisHelper!.lrange(
            `agent:${instance_id}:messages`,
            0,
            parseInt(limit as string, 10) - 1
          );
          for (const msgStr of msgKeys) {
            try {
              const msg = JSON.parse(msgStr);
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

  return router;
}
