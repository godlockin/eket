/**
 * Agent 路由
 *
 * OpenCLAW Agent ↔ EKET Instance 协议转换
 */

import { Router, Request, Response } from 'express';

export const AgentRouter = Router();

/**
 * POST /api/v1/agent
 * 启动 Agent 实例
 */
AgentRouter.post('/', async (req: Request, res: Response) => {
  try {
    const { role, skills, mode = 'auto' } = req.body;

    // TODO: 调用 EKET 实例启动逻辑
    const agentId = `agent_${role}_${Date.now()}`;

    res.status(201).json({
      agent_id: agentId,
      instance_id: agentId,
      status: 'starting',
      role,
      skills
    });
  } catch (error) {
    console.error('[AgentRouter] Start error:', error);
    res.status(500).json({
      error: 'start_failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/v1/agent/:id/status
 * 获取 Agent 状态
 */
AgentRouter.get('/:id/status', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // TODO: 查询 Agent 心跳状态
    res.json({
      agent_id: id,
      status: 'online',
      role: 'slaver',
      current_task: null,
      last_heartbeat: new Date().toISOString()
    });
  } catch (error) {
    console.error('[AgentRouter] Status error:', error);
    res.status(500).json({
      error: 'query_failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});
