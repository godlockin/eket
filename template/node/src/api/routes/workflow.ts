/**
 * Workflow 路由
 *
 * OpenCLAW Workflow ↔ EKET Epic 协议转换
 */

import { Router, Request, Response } from 'express';

export const WorkflowRouter = Router();

/**
 * POST /api/v1/workflow
 * 创建工作流（创建 Epic）
 */
WorkflowRouter.post('/', async (req: Request, res: Response) => {
  try {
    const { name, description, priority, deadline } = req.body;

    // TODO: 调用 EKET Epic 创建逻辑
    const epicId = `EPIC-${Date.now()}`;

    res.status(201).json({
      workflow_id: epicId,
      status: 'created',
      tickets_created: 0
    });
  } catch (error) {
    console.error('[WorkflowRouter] Create error:', error);
    res.status(500).json({
      error: 'create_failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/v1/workflow/:id
 * 获取工作流状态
 */
WorkflowRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // TODO: 查询 Epic 状态
    res.json({
      workflow_id: id,
      status: 'in_progress',
      tickets: [],
      progress: 0
    });
  } catch (error) {
    console.error('[WorkflowRouter] Get error:', error);
    res.status(500).json({
      error: 'query_failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});
