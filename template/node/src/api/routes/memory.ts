/**
 * Memory 路由
 *
 * OpenCLAW Memory ↔ EKET .eket/memory/ 协议转换
 */

import { Router, Request, Response } from 'express';
import * as fs from 'fs/promises';
import * as path from 'path';

export const MemoryRouter = Router();

/**
 * GET /api/v1/memory
 * 查询记忆
 */
MemoryRouter.get('/', async (req: Request, res: Response) => {
  try {
    const { key, prefix } = req.query;
    const memoryDir = path.join(process.cwd(), '.eket', 'memory');

    let results: Array<{ key: string; content: string; updated: string }> = [];

    if (key) {
      // 查询指定 key
      const filePath = path.join(memoryDir, `${key}.md`);
      const content = await fs.readFile(filePath, 'utf-8');
      const stats = await fs.stat(filePath);
      results.push({
        key: key as string,
        content,
        updated: stats.mtime.toISOString()
      });
    } else if (prefix) {
      // 查询指定前缀的 keys
      const files = await fs.readdir(memoryDir);
      for (const file of files) {
        if (file.startsWith(prefix as string) && file.endsWith('.md')) {
          const key = file.replace('.md', '');
          const filePath = path.join(memoryDir, file);
          const content = await fs.readFile(filePath, 'utf-8');
          const stats = await fs.stat(filePath);
          results.push({ key, content, updated: stats.mtime.toISOString() });
        }
      }
    } else {
      // 列出所有 memories
      const files = await fs.readdir(memoryDir);
      for (const file of files) {
        if (file.endsWith('.md')) {
          const key = file.replace('.md', '');
          results.push({ key, content: '', updated: '' });
        }
      }
    }

    res.json({
      memories: results
    });
  } catch (error) {
    console.error('[MemoryRouter] Query error:', error);
    res.status(500).json({
      error: 'query_failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});
