/**
 * knowledge:index 命令
 * 扫描 confluence/memory/**\/*.md，分块写入 SQLite（FTS5 + 向量）
 */

import * as fs from 'fs';
import * as path from 'path';

import { Command } from 'commander';

import { SQLiteClient } from '../core/sqlite-client.js';
import { hashEmbedding } from '../core/rag-search.js';
import { findProjectRoot } from '../utils/process-cleanup.js';

const MAX_CHUNK = 500;

function chunkText(text: string): string[] {
  const paras = text.split(/\n\n+/);
  const chunks: string[] = [];
  let current = '';
  for (const para of paras) {
    if ((current + '\n\n' + para).trim().length > MAX_CHUNK && current.length > 0) {
      chunks.push(current.trim());
      current = para;
    } else {
      current = current ? current + '\n\n' + para : para;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.filter((c) => c.length > 0);
}

function walkMd(dir: string): string[] {
  const files: string[] = [];
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkMd(full));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      files.push(full);
    }
  }
  return files;
}

export function registerKnowledgeIndex(program: Command): void {
  program
    .command('knowledge:index')
    .description('扫描 confluence/memory/**/*.md，分块写入 SQLite（FTS5 + 向量）')
    .option('--db <path>', 'SQLite 数据库路径')
    .action(async (opts: { db?: string }) => {
      const projectRoot = await findProjectRoot();
      if (!projectRoot) {
        console.error('[knowledge:index] 未找到项目根目录');
        process.exit(1);
      }

      const dbPath =
        opts.db ?? path.join(projectRoot, '.eket', 'data', 'sqlite', 'eket.db');
      const client = new SQLiteClient(dbPath);
      const conn = client.connect();
      if (!conn.success) {
        console.error('[knowledge:index] DB 连接失败:', conn.error?.message);
        process.exit(1);
      }

      const memoryDir = path.join(projectRoot, 'confluence', 'memory');
      const mdFiles = walkMd(memoryDir);
      console.log(`[knowledge:index] 发现 ${mdFiles.length} 个 .md 文件`);

      let total = 0;
      for (const file of mdFiles) {
        const text = fs.readFileSync(file, 'utf-8');
        const chunks = chunkText(text);
        const rel = path.relative(projectRoot, file);
        for (let i = 0; i < chunks.length; i++) {
          const docId = `${rel}#${i}`;
          const embedding = hashEmbedding(chunks[i]);
          const result = client.insertKnowledge(docId, chunks[i], rel, embedding);
          if (!result.success) {
            console.warn(`[knowledge:index] 写入失败 ${docId}:`, result.error?.message);
          } else {
            total++;
          }
        }
      }
      console.log(`[knowledge:index] 完成，共写入 ${total} 块`);
    });
}
