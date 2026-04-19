/**
 * knowledge:search 命令
 * 查询知识库，返回 Top-5 相关片段（FTS5 + 余弦向量合并）
 */

import * as path from 'path';

import { Command } from 'commander';

import { SQLiteClient } from '../core/sqlite-client.js';
import { RAGService } from '../core/rag-search.js';
import { findProjectRoot } from '../utils/process-cleanup.js';

export function registerKnowledgeSearch(program: Command): void {
  program
    .command('knowledge:search <query>')
    .description('查询知识库 Top-5 相关片段（FTS5 + 向量混合检索）')
    .option('--db <path>', 'SQLite 数据库路径')
    .option('--top <n>', 'Top-N 结果', '5')
    .action(async (query: string, opts: { db?: string; top?: string }) => {
      const projectRoot = await findProjectRoot();
      if (!projectRoot) {
        console.error('[knowledge:search] 未找到项目根目录');
        process.exit(1);
      }

      const dbPath =
        opts.db ?? path.join(projectRoot, '.eket', 'data', 'sqlite', 'eket.db');
      const client = new SQLiteClient(dbPath);
      const conn = client.connect();
      if (!conn.success) {
        console.error('[knowledge:search] DB 连接失败:', conn.error?.message);
        process.exit(1);
      }

      const rag = new RAGService(client);
      const topK = parseInt(opts.top ?? '5', 10);
      const results = await rag.search(query, topK);

      if (results.length === 0) {
        console.log('未找到相关知识片段');
        return;
      }

      console.log(`\n🔍 查询: "${query}"  Top-${topK} 结果:\n`);
      results.forEach((r, i) => {
        console.log(`--- [${i + 1}] ${r.matchType.toUpperCase()} score=${r.score.toFixed(4)} ---`);
        console.log(`📄 来源: ${r.sourcePath}`);
        console.log(r.content.slice(0, 300) + (r.content.length > 300 ? '…' : ''));
        console.log();
      });
    });
}
