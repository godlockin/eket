/**
 * System Routes
 *
 * EKET Protocol v1.0.0 — Health/system endpoints + Message + PR + SSE routes
 *
 * Exports two routers:
 *   createHealthRouter  → mount at '/'        (/health, /ready, /live)
 *   createSystemRouter  → mount at '/api/v1'  (/messages, /prs, /stream)
 */

import { Router, Request, Response, NextFunction } from 'express';
import { WebSocket , WebSocketServer } from 'ws';

import type { RedisClient } from '../../core/redis-client.js';
import { sseBus } from '../../core/sse-bus.js';
import { sseEventBus } from '../../core/sse-event-bus.js';
import type { Message } from '../../types/index.js';
import { logger } from '../../utils/logger.js';

import type { RedisHelper } from '../redis-helper.js';
import type { EketServerConfig, PRMerge, PRReview, PRSubmission } from '../server-types.js';

export interface SystemRouterDeps {
  redisHelper?: RedisHelper;
  redis?: RedisClient;
  config: Pick<EketServerConfig, 'enableWebSocket'>;
  startTime: Date;
  wss?: WebSocketServer;
  wsClients: Map<string, WebSocket>;
  authenticate: (req: Request, res: Response, next: NextFunction) => void;
  validateBody: (schemaName: string) => (req: Request, res: Response, next: NextFunction) => void;
}

export interface HealthRouterDeps {
  redis?: RedisClient;
  config: Pick<EketServerConfig, 'enableWebSocket'>;
  startTime: Date;
  wss?: WebSocketServer;
}

export function createHealthRouter(deps: HealthRouterDeps): Router {
  const router = Router();
  const { redis, config, startTime } = deps;

  // GET /health
  router.get('/health', async (_req: Request, res: Response) => {
    const uptime = Math.floor((Date.now() - startTime.getTime()) / 1000);

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

    if (redis) {
      try {
        await redis.ping();
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

    if (deps.wss) {
      health.dependencies.websocket = 'healthy';
    } else {
      health.dependencies.websocket = config.enableWebSocket ? 'unhealthy' : 'healthy';
    }

    if (
      health.dependencies.redis === 'unhealthy' &&
      health.dependencies.websocket === 'unhealthy'
    ) {
      health.status = 'unhealthy';
    }

    const statusCode = health.status === 'ok' ? 200 : health.status === 'degraded' ? 200 : 503;
    res.status(statusCode).json(health);
  });

  // GET /ready
  router.get('/ready', (_req: Request, res: Response) => {
    res.status(200).json({ ready: true });
  });

  // GET /live
  router.get('/live', (_req: Request, res: Response) => {
    res.status(200).json({ alive: true });
  });

  return router;
}

export function createSystemRouter(deps: SystemRouterDeps): Router {
  const router = Router();
  const { redisHelper, redis, wsClients, authenticate, validateBody } = deps;
  router.post(
    '/messages',
    authenticate,
    validateBody('message'),
    async (req: Request, res: Response) => {
      try {
        const body = req.body as Message;

        if (!body.from || !body.to || !body.type || !body.payload) {
          res.status(400).json({
            success: false,
            error: { code: 'VALIDATION_ERROR', message: 'Missing required message fields' },
          });
          return;
        }

        const message: Message = {
          id: `msg_${Date.now()}_${Math.random().toString(36).slice(2)}`,
          timestamp: new Date().toISOString(),
          from: body.from,
          to: body.to,
          type: body.type,
          priority: body.priority || 'normal',
          payload: body.payload,
        };

        if (redisHelper?.isAvailable()) {
          await redisHelper.rpush(`agent:${body.to}:messages`, JSON.stringify(message));
        }

        const ws = wsClients.get(body.to);
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

  // NOTE: PR routes intentionally stay in Node (GitHub API + LLM calls)
  // POST /prs
  router.post(
    '/prs',
    authenticate,
    async (req: Request, res: Response) => {
      try {
        const body = req.body as PRSubmission;

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

        if (redis) {
          await redisHelper!.hset(`pr:${body.task_id}`, pr as unknown as Record<string, string>);
          await redisHelper!.sadd('prs:all', body.task_id);
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

  // POST /prs/:task_id/review
  router.post(
    '/prs/:task_id/review',
    authenticate,
    async (req: Request, res: Response) => {
      try {
        const { task_id } = req.params;
        const body = req.body as PRReview;

        if (!body.reviewer || !body.status) {
          res.status(400).json({
            success: false,
            error: { code: 'VALIDATION_ERROR', message: 'Missing required review fields' },
          });
          return;
        }

        if (redis) {
          const prData = await redisHelper!.hgetall(`pr:${task_id}`);
          if (!prData || Object.keys(prData).length === 0) {
            res.status(404).json({
              success: false,
              error: { code: 'NOT_FOUND', message: 'PR not found' },
            });
            return;
          }

          const updatedPR = {
            ...prData,
            review_status: body.status,
            reviewer: body.reviewer,
            review_comments: JSON.stringify(body.comments || []),
            review_summary: body.summary || '',
            reviewed_at: new Date().toISOString(),
          };

          await redisHelper!.hset(`pr:${task_id}`, updatedPR);

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

  // POST /prs/:task_id/merge
  router.post(
    '/prs/:task_id/merge',
    authenticate,
    async (req: Request, res: Response) => {
      try {
        const { task_id } = req.params;
        const body = req.body as PRMerge;

        if (!body.merger || !body.target_branch) {
          res.status(400).json({
            success: false,
            error: { code: 'VALIDATION_ERROR', message: 'Missing required merge fields' },
          });
          return;
        }

        if (redis) {
          const prData = await redisHelper!.hgetall(`pr:${task_id}`);
          if (!prData || Object.keys(prData).length === 0) {
            res.status(404).json({
              success: false,
              error: { code: 'NOT_FOUND', message: 'PR not found' },
            });
            return;
          }

          if (prData.review_status !== 'approved') {
            res.status(400).json({
              success: false,
              error: { code: 'VALIDATION_ERROR', message: 'PR not approved' },
            });
            return;
          }

          const mergeCommit = `merge_${task_id}_${Date.now()}`;
          const mergedAt = new Date().toISOString();

          const updatedPR = {
            ...prData,
            status: 'merged',
            merge_commit: mergeCommit,
            merged_at: mergedAt,
            merger: body.merger,
            target_branch: body.target_branch,
          };

          await redisHelper!.hset(`pr:${task_id}`, updatedPR);

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

  // GET /events — SSE task event stream (TASK-109)
  router.get('/events', (req: Request, res: Response) => {
    const slaverId = typeof req.query['slaver'] === 'string' ? req.query['slaver'] : undefined;
    sseBus.addClient(res, slaverId);

    // Heartbeat every 30s
    const heartbeat = setInterval(() => {
      if (!res.writableEnded) {
        res.write(': heartbeat\n\n');
      } else {
        clearInterval(heartbeat);
      }
    }, 30_000);

    req.on('close', () => {
      clearInterval(heartbeat);
      sseBus.removeClient(res);
    });
    req.on('error', () => {
      clearInterval(heartbeat);
      sseBus.removeClient(res);
    });
  });

  // GET /stream/:channelId — SSE
  router.get('/stream/:channelId', (req: Request, res: Response) => {
    const channelId = req.params['channelId'] as string;
    if (!channelId) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Missing channelId' } });
      return;
    }

    sseEventBus.subscribe(channelId, res);

    req.on('close', () => {
      sseEventBus.unsubscribe(channelId, res);
    });
    req.on('error', () => {
      sseEventBus.unsubscribe(channelId, res);
    });
  });

  return router;
}
