/**
 * Task 路由
 *
 * OpenCLAW Task ↔ EKET Ticket 协议转换
 */

import { Router, Request, Response } from 'express';

export interface OpenCLAWTask {
  id: string;
  type: 'feature' | 'bugfix' | 'test' | 'doc';
  priority: 'critical' | 'high' | 'medium' | 'low';
  assignee?: string;
  workflow_id: string;
  title?: string;
  description?: string;
  skills_required?: string[];
}

export interface EKETTicket {
  ticket_id: string;
  type: string;
  importance: string;
  priority: string;
  epic_id: string;
  assignee?: string;
  title?: string;
  description?: string;
}

export const TaskRouter = Router();

/**
 * 映射 OpenCLAW Task 到 EKET Ticket
 */
export function openCLAWToEKET(task: OpenCLAWTask): EKETTicket {
  const typeMap: Record<string, string> = {
    'feature': 'FEAT',
    'bugfix': 'FIX',
    'test': 'TEST',
    'doc': 'DOC'
  };

  const priorityToImportance: Record<string, string> = {
    'critical': 'critical',
    'high': 'high',
    'medium': 'medium',
    'low': 'low'
  };

  const seq = Date.now() % 10000;
  const prefix = typeMap[task.type] || 'TASK';

  return {
    ticket_id: `${prefix}-${String(seq).padStart(3, '0')}`,
    type: typeMap[task.type] || 'TASK',
    importance: priorityToImportance[task.priority] || 'medium',
    priority: task.priority.toUpperCase(),
    epic_id: task.workflow_id,
    assignee: task.assignee,
    title: task.title,
    description: task.description
  };
}

/**
 * POST /api/v1/task
 * 创建任务（创建 Ticket）
 */
TaskRouter.post('/', async (req: Request, res: Response) => {
  try {
    const openclawTask: OpenCLAWTask = req.body;

    // 协议转换
    const eketTicket = openCLAWToEKET(openclawTask);

    // TODO: 调用 EKET Ticket 创建逻辑
    // await createTicket(eketTicket);

    res.status(201).json({
      task_id: eketTicket.ticket_id,
      ticket_id: eketTicket.ticket_id,
      status: 'ready',
      assigned_to: eketTicket.assignee || null
    });
  } catch (error) {
    console.error('[TaskRouter] Create error:', error);
    res.status(500).json({
      error: 'create_failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/v1/task/:id
 * 获取任务详情
 */
TaskRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // TODO: 查询 Ticket 状态
    res.json({
      task_id: id,
      ticket_id: id,
      status: 'in_progress',
      assignee: null,
      progress: 0
    });
  } catch (error) {
    console.error('[TaskRouter] Get error:', error);
    res.status(500).json({
      error: 'query_failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});
