/**
 * Task 路由
 *
 * OpenCLAW Task ↔ EKET Ticket 协议转换
 */

import { Router, Request, Response } from 'express';

import {
  OpenCLAWIntegrationAdapter,
  createOpenCLAWAdapter,
  type OpenCLAWTask,
} from '../../integration/openclaw-adapter.js';

export const TaskRouter = Router();

// 创建适配器实例（单例）
let adapter: OpenCLAWIntegrationAdapter | null = null;

function getAdapter(): OpenCLAWIntegrationAdapter {
  if (!adapter) {
    adapter = createOpenCLAWAdapter({
      projectRoot: process.cwd(),
      instanceId: 'gateway_task',
    });
  }
  return adapter;
}

/**
 * POST /api/v1/task
 * 创建任务（创建 Ticket）
 *
 * Request Body:
 * {
 *   id?: string;
 *   workflow_id: string;
 *   type: 'feature' | 'bugfix' | 'test' | 'doc';
 *   title: string;
 *   description?: string;
 *   priority: 'critical' | 'high' | 'medium' | 'low';
 *   assignee?: string;
 *   skills_required?: string[];
 * }
 */
TaskRouter.post('/', async (_req: Request, res: Response): Promise<void> => {
  try {
    const body = _req.body as Partial<OpenCLAWTask>;

    // 验证必填字段
    if (!body.workflow_id) {
      res.status(400).json({
        error: 'validation_error',
        message: 'Missing required field: workflow_id',
      });
      return;
    }
    if (!body.title) {
      res.status(400).json({
        error: 'validation_error',
        message: 'Missing required field: title',
      });
      return;
    }
    if (!body.type) {
      res.status(400).json({
        error: 'validation_error',
        message: 'Missing required field: type',
      });
      return;
    }

    // 生成 Task ID（如果未提供）- 使用时间戳 + 随机数确保唯一性
    const task: OpenCLAWTask = {
      id: body.id || `task_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      workflow_id: body.workflow_id,
      type: body.type,
      title: body.title,
      description: body.description || '',
      priority: body.priority || 'medium',
      assignee: body.assignee,
      skills_required: body.skills_required,
      created_at: Date.now(),
      updated_at: Date.now(),
    };

    // 调用适配器创建 Task
    const result = await getAdapter().createTask(task);

    if (!result.success) {
      res.status(500).json({
        error: 'create_failed',
        message: result.error.message,
      });
      return;
    }

    res.status(201).json({
      task_id: result.data.id,
      ticket_id: result.data.id,
      status: 'ready',
      assigned_to: result.data.assignee || null,
    });
  } catch (error) {
    console.error('[TaskRouter] Create error:', error);
    res.status(500).json({
      error: 'internal_error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/v1/task/:id
 * 获取任务详情
 */
TaskRouter.get('/:id', async (_req: Request, res: Response): Promise<void> => {
  try {
    const { id } = _req.params as { id: string };

    // 调用适配器获取 Task 状态
    const result = await getAdapter().getTaskStatus(id);

    if (!result.success) {
      res.status(500).json({
        error: 'query_failed',
        message: result.error.message,
      });
      return;
    }

    res.json(result.data);
  } catch (error) {
    console.error('[TaskRouter] Get error:', error);
    res.status(500).json({
      error: 'internal_error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});
