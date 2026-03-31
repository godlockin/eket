/**
 * Workflow 路由
 *
 * OpenCLAW Workflow ↔ EKET Epic 协议转换
 */

import { Router, Request, Response } from 'express';
import {
  OpenCLAWIntegrationAdapter,
  createOpenCLAWAdapter,
  type OpenCLAWWorkflow,
} from '../../integration/openclaw-adapter.js';

export const WorkflowRouter = Router();

// 创建适配器实例（单例）
let adapter: OpenCLAWIntegrationAdapter | null = null;

function getAdapter(): OpenCLAWIntegrationAdapter {
  if (!adapter) {
    adapter = createOpenCLAWAdapter({
      projectRoot: process.cwd(),
      instanceId: 'gateway_workflow',
    });
  }
  return adapter;
}

/**
 * POST /api/v1/workflow
 * 创建工作流（创建 Epic）
 *
 * Request Body:
 * {
 *   id: string;
 *   name: string;
 *   description: string;
 *   priority: 'critical' | 'high' | 'medium' | 'low';
 *   deadline?: string;
 * }
 */
WorkflowRouter.post('/', async (_req: Request, res: Response): Promise<void> => {
  try {
    const body = _req.body as Partial<OpenCLAWWorkflow>;

    // 验证必填字段
    if (!body.name) {
      res.status(400).json({
        error: 'validation_error',
        message: 'Missing required field: name',
      });
      return;
    }

    // 生成 Workflow ID（如果未提供）
    const workflow: OpenCLAWWorkflow = {
      id: body.id || `workflow_${Date.now()}`,
      name: body.name,
      description: body.description || '',
      priority: body.priority || 'medium',
      deadline: body.deadline,
      created_at: Date.now(),
      updated_at: Date.now(),
    };

    // 调用适配器创建 Workflow
    const result = await getAdapter().createWorkflow(workflow);

    if (!result.success) {
      res.status(500).json({
        error: 'create_failed',
        message: result.error.message,
      });
      return;
    }

    res.status(201).json({
      workflow_id: result.data.epic_id,
      status: 'created',
      tickets_created: 0,
    });
  } catch (error) {
    console.error('[WorkflowRouter] Create error:', error);
    res.status(500).json({
      error: 'internal_error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/v1/workflow/:id
 * 获取工作流状态
 */
WorkflowRouter.get('/:id', async (_req: Request, res: Response): Promise<void> => {
  try {
    const { id } = _req.params as { id: string };

    // 调用适配器获取 Workflow 状态
    const result = await getAdapter().getWorkflowStatus(id);

    if (!result.success) {
      res.status(500).json({
        error: 'query_failed',
        message: result.error.message,
      });
      return;
    }

    res.json(result.data);
  } catch (error) {
    console.error('[WorkflowRouter] Get error:', error);
    res.status(500).json({
      error: 'internal_error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});
