/**
 * Agent 路由
 *
 * OpenCLAW Agent ↔ EKET Instance 协议转换
 */

import { Router, Request, Response } from 'express';

import {
  OpenCLAWIntegrationAdapter,
  createOpenCLAWAdapter,
  type OpenCLAWAgentSpec,
} from '../../integration/openclaw-adapter.js';

export const AgentRouter = Router();

// 创建适配器实例（单例）
let adapter: OpenCLAWIntegrationAdapter | null = null;

function getAdapter(): OpenCLAWIntegrationAdapter {
  if (!adapter) {
    adapter = createOpenCLAWAdapter({
      projectRoot: process.cwd(),
      instanceId: 'gateway_agent',
    });
  }
  return adapter;
}

/**
 * POST /api/v1/agent
 * 启动 Agent 实例
 *
 * Request Body:
 * {
 *   id?: string;
 *   role: string;
 *   skills: string[];
 *   execution_mode?: 'auto' | 'manual';
 *   reporting?: {
 *     to: 'openclaw';
 *     channel: string;
 *     format: 'json';
 *   };
 * }
 */
AgentRouter.post('/', async (_req: Request, res: Response): Promise<void> => {
  try {
    const body = _req.body as Partial<OpenCLAWAgentSpec>;

    // 验证必填字段
    if (!body.role) {
      res.status(400).json({
        error: 'validation_error',
        message: 'Missing required field: role',
      });
      return;
    }

    // 生成 Agent ID（如果未提供）
    const spec: OpenCLAWAgentSpec = {
      id: body.id || `agent_${body.role}_${Date.now()}`,
      role: body.role,
      skills: body.skills || [],
      execution_mode: body.execution_mode || 'auto',
      reporting: body.reporting,
    };

    // 调用适配器启动 Agent
    const result = await getAdapter().startAgent(spec);

    if (!result.success) {
      res.status(500).json({
        error: 'start_failed',
        message: result.error.message,
      });
      return;
    }

    res.status(201).json({
      agent_id: result.data.id,
      instance_id: result.data.id,
      status: result.data.status,
      role: result.data.agent_type,
      skills: result.data.skills,
    });
  } catch (error) {
    console.error('[AgentRouter] Start error:', error);
    res.status(500).json({
      error: 'internal_error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/v1/agent/:id/status
 * 获取 Agent 状态
 */
AgentRouter.get('/:id/status', async (_req: Request, res: Response): Promise<void> => {
  try {
    const { id } = _req.params as { id: string };

    // 调用适配器获取 Agent 状态
    const result = await getAdapter().getAgentStatus(id);

    if (!result.success) {
      res.status(500).json({
        error: 'query_failed',
        message: result.error.message,
      });
      return;
    }

    res.json(result.data);
  } catch (error) {
    console.error('[AgentRouter] Status error:', error);
    res.status(500).json({
      error: 'internal_error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});
