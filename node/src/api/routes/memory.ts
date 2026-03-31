/**
 * Memory 路由
 *
 * 查询 EKET Memory 系统
 */

import { Router, Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';

export const MemoryRouter = Router();

const MEMORY_DIR = path.join(process.cwd(), '.eket', 'memory');

/**
 * GET /api/v1/memory
 * 查询记忆
 *
 * Query Parameters:
 * - type?: 'artifact' | 'pattern' | 'decision' | 'lesson' | 'api' | 'config'
 * - tag?: string
 * - q?: string (search query)
 */
MemoryRouter.get('/', async (_req: Request, res: Response): Promise<void> => {
  try {
    const { type, tag, q } = _req.query;

    // 检查 Memory 目录是否存在
    if (!fs.existsSync(MEMORY_DIR)) {
      res.json({
        memories: [],
        total: 0,
      });
      return;
    }

    // 读取所有 Memory 文件
    const files = fs.readdirSync(MEMORY_DIR);
    const memories: Array<{
      id: string;
      file: string;
      content: string;
      createdAt: number;
    }> = [];

    for (const file of files) {
      if (!file.endsWith('.md')) {
        continue;
      }

      const filePath = path.join(MEMORY_DIR, file);
      const stat = fs.statSync(filePath);
      const content = fs.readFileSync(filePath, 'utf-8');

      // 简单搜索过滤
      const queryStr = q ? String(q).toLowerCase() : '';
      if (queryStr && !content.toLowerCase().includes(queryStr)) {
        continue;
      }

      // 简单类型过滤
      const typeStr = type ? String(type).toLowerCase() : '';
      if (typeStr && !content.toLowerCase().includes(`type: ${typeStr}`)) {
        continue;
      }

      // 简单标签过滤
      const tagStr = tag ? String(tag) : '';
      if (tagStr && !content.includes(tagStr)) {
        continue;
      }

      memories.push({
        id: file.replace('.md', ''),
        file,
        content,
        createdAt: stat.mtimeMs,
      });
    }

    // 按创建时间排序（最新的在前）
    memories.sort((a, b) => b.createdAt - a.createdAt);

    res.json({
      memories: memories.map((m) => ({
        id: m.id,
        file: m.file,
        preview: m.content.substring(0, 200) + '...',
        created_at: new Date(m.createdAt).toISOString(),
      })),
      total: memories.length,
    });
  } catch (error) {
    console.error('[MemoryRouter] Query error:', error);
    res.status(500).json({
      error: 'query_failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/v1/memory/:id
 * 获取记忆详情
 */
MemoryRouter.get('/:id', async (_req: Request, res: Response): Promise<void> => {
  try {
    const { id } = _req.params as { id: string };
    const filePath = path.join(MEMORY_DIR, `${id}.md`);

    if (!fs.existsSync(filePath)) {
      res.status(404).json({
        error: 'not_found',
        message: `Memory ${id} not found`,
      });
      return;
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const stat = fs.statSync(filePath);

    res.json({
      id,
      file: `${id}.md`,
      content,
      created_at: new Date(stat.birthtimeMs).toISOString(),
      updated_at: new Date(stat.mtimeMs).toISOString(),
    });
  } catch (error) {
    console.error('[MemoryRouter] Get error:', error);
    res.status(500).json({
      error: 'internal_error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});
