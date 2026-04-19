/**
 * Skills API 路由 (TASK-068)
 *
 * GET  /api/v1/skills          — 列出所有已注册 skill
 * GET  /api/v1/skills/:id      — 获取 skill 详情
 * GET  /api/v1/agents/:id/skills — 获取 Agent 绑定的 skills
 * PUT  /api/v1/agents/:id/skills — 设置 Agent 绑定的 skills（全量替换）
 */

import { Router, Request, Response } from 'express';
import { SkillsRegistry } from '../../skills/index.js';
import { SQLiteClient } from '../../core/sqlite-client.js';

export const SkillsRouter = Router();
export const AgentSkillsRouter = Router({ mergeParams: true });

// 单例
let registry: SkillsRegistry | null = null;
let db: SQLiteClient | null = null;

function getRegistry(): SkillsRegistry {
  if (!registry) {
    registry = new SkillsRegistry();
  }
  return registry;
}

function getDb(): SQLiteClient {
  if (!db) {
    db = new SQLiteClient();
    db.connect();
  }
  return db;
}

/**
 * GET /api/v1/skills
 * 列出所有已注册 skill（名称 + 描述 + 类别）
 */
SkillsRouter.get('/', (_req: Request, res: Response): void => {
  try {
    const reg = getRegistry();
    const names = reg.listSkills();
    const skills = names.map((name) => {
      const skill = reg.getSkill(name);
      return {
        id: name,
        name,
        description: skill?.description ?? '',
        category: skill?.category ?? 'unknown',
      };
    });
    res.json({ skills, total: skills.length });
  } catch (error) {
    res.status(500).json({
      error: 'internal_error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/v1/skills/:id
 * 获取 skill 详情
 */
SkillsRouter.get('/:id', (req: Request, res: Response): void => {
  try {
    const { id } = req.params as { id: string };
    const skill = getRegistry().getSkill(id);
    if (!skill) {
      res.status(404).json({ error: 'not_found', message: `Skill '${id}' not found` });
      return;
    }
    res.json({
      id,
      name: id,
      description: skill.description ?? '',
      category: skill.category ?? 'unknown',
      inputSchema: (skill as unknown as Record<string, unknown>).inputSchema ?? null,
    });
  } catch (error) {
    res.status(500).json({
      error: 'internal_error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/v1/agents/:id/skills
 * 获取 Agent 绑定的 skills
 */
AgentSkillsRouter.get('/', (req: Request, res: Response): void => {
  try {
    const { id } = req.params as { id: string };
    const result = getDb().getAgentSkills(id);
    if (!result.success) {
      res.status(500).json({ error: 'db_error', message: result.error.message });
      return;
    }
    res.json({ agent_id: id, skills: result.data });
  } catch (error) {
    res.status(500).json({
      error: 'internal_error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * PUT /api/v1/agents/:id/skills
 * 设置 Agent 绑定的 skills（全量替换）
 * Body: { skills: string[] }
 */
AgentSkillsRouter.put('/', (req: Request, res: Response): void => {
  try {
    const { id } = req.params as { id: string };
    const { skills } = req.body as { skills?: unknown };
    if (!Array.isArray(skills)) {
      res.status(400).json({ error: 'validation_error', message: 'skills must be an array' });
      return;
    }
    const skillIds = (skills as unknown[]).filter((s) => typeof s === 'string') as string[];
    const result = getDb().setAgentSkills(id, skillIds);
    if (!result.success) {
      res.status(500).json({ error: 'db_error', message: result.error.message });
      return;
    }
    res.json({ agent_id: id, skills: skillIds });
  } catch (error) {
    res.status(500).json({
      error: 'internal_error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});
