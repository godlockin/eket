/**
 * Task Routes
 *
 * EKET Protocol v1.0.0 — Task management endpoints
 */

import { Router, Request, Response, NextFunction } from 'express';

import type { RedisClient } from '../../core/redis-client.js';
import { logger } from '../../utils/logger.js';
import type { RedisHelper } from '../redis-helper.js';
import type { Task } from '../server-types.js';

export interface TaskRouterDeps {
  redisHelper?: RedisHelper;
  redis?: RedisClient;
  authenticate: (req: Request, res: Response, next: NextFunction) => void;
}

export function createTaskRouter(deps: TaskRouterDeps): Router {
  const router = Router();
  const { redisHelper, redis, authenticate } = deps;

  // GET /tasks
  router.get(
    '/tasks',
    authenticate,
    async (req: Request, res: Response) => {
      try {
        const { status, assigned_to, tags } = req.query as {
          status?: string;
          assigned_to?: string;
          tags?: string;
        };

        const tasks: Task[] = [];
        if (redis) {
          const taskIds = await redisHelper!.smembers('tasks:all');
          for (const id of taskIds) {
            const taskData = await redisHelper!.hgetall(`task:${id}`);
            if (!taskData) {continue;}

            if (taskData.acceptance_criteria) {
              taskData.acceptance_criteria = JSON.parse(taskData.acceptance_criteria);
            }
            if (taskData.tags) {
              taskData.tags = JSON.parse(taskData.tags);
            }

            if (status && taskData.status !== status) {continue;}
            if (assigned_to && taskData.assigned_to !== assigned_to) {continue;}
            if (tags) {
              const requiredTags = tags.split(',');
              const taskTags: string[] = taskData.tags ? JSON.parse(taskData.tags) as string[] : [];
              if (!requiredTags.every((t: string) => taskTags.includes(t))) {continue;}
            }

            tasks.push(taskData as unknown as Task);
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

  // GET /tasks/:id
  router.get(
    '/tasks/:id',
    authenticate,
    async (req: Request, res: Response) => {
      try {
        const { id } = req.params;

        if (redis) {
          const taskData = await redisHelper!.hgetall(`task:${id}`);
          if (!taskData || Object.keys(taskData).length === 0) {
            res.status(404).json({
              success: false,
              error: { code: 'NOT_FOUND', message: 'Task not found' },
            });
            return;
          }

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

  // PATCH /tasks/:id/status
  router.patch(
    '/tasks/:id/status',
    authenticate,
    async (req: Request, res: Response) => {
      try {
        const { id } = req.params;
        const updates = req.body as { status?: string; progress?: number; notes?: string };

        if (redis) {
          const taskData = await redisHelper!.hgetall(`task:${id}`);
          if (!taskData || Object.keys(taskData).length === 0) {
            res.status(404).json({
              success: false,
              error: { code: 'NOT_FOUND', message: 'Task not found' },
            });
            return;
          }

          const updatedTask = {
            ...taskData,
            ...updates,
            updated_at: new Date().toISOString(),
          };

          await redisHelper!.hset(`task:${id}`, updatedTask);

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

  // POST /tasks/:id/claim
  router.post(
    '/tasks/:id/claim',
    authenticate,
    async (req: Request, res: Response) => {
      try {
        const { id } = req.params;
        const { instance_id } = req.body as { instance_id: string };

        if (redis) {
          const taskData = await redisHelper!.hgetall(`task:${id}`);
          if (!taskData || Object.keys(taskData).length === 0) {
            res.status(404).json({
              success: false,
              error: { code: 'NOT_FOUND', message: 'Task not found' },
            });
            return;
          }

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

          const updatedTask = {
            ...taskData,
            assigned_to: instance_id,
            status: 'in_progress',
            updated_at: new Date().toISOString(),
          };

          await redisHelper!.hset(`task:${id}`, updatedTask);

          logger.info('task_claimed', { task_id: id, instance_id });

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

  return router;
}
