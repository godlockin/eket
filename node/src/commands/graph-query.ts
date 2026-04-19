/**
 * EKET Framework - graph:query command (TASK-044)
 */

import { Command } from 'commander';
import Database from 'better-sqlite3';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  initEventGraphSchema,
  queryBlockedHotspots,
  queryTicketTimeline,
} from '../core/event-graph.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname_here = dirname(__filename);
// graph-query.ts is at node/src/commands/ → ../../../.. = repo root
const REPO_ROOT = join(__dirname_here, '..', '..', '..', '..');
const DEFAULT_DB_PATH = join(REPO_ROOT, '.eket', 'data', 'sqlite', 'eket.db');

export function registerGraphQueryCommand(program: Command): void {
  program
    .command('graph:query')
    .description('查询 SDLC 事件图')
    .option('--type <type>', '查询类型: blocked')
    .option('--ticket <id>', '查询指定 ticket 时间线')
    .option('--db <path>', 'SQLite 路径', DEFAULT_DB_PATH)
    .action((opts: { type?: string; ticket?: string; db: string }) => {
      let db: Database.Database;
      try {
        db = new Database(opts.db);
      } catch {
        db = new Database(':memory:');
      }
      initEventGraphSchema(db);

      if (opts.type === 'blocked') {
        const hotspots = queryBlockedHotspots(db);
        if (hotspots.length === 0) {
          console.log('[Graph] 暂无阻塞记录');
          return;
        }
        console.log('[Graph] Top blocked transitions:');
        hotspots.forEach((h, i) => {
          console.log(
            `  ${i + 1}. ${h.fromStatus} → ${h.toStatus}  (${h.errorCode} × ${h.count})  tickets: ${h.tickets.join(', ')}`,
          );
        });
      } else if (opts.ticket) {
        const events = queryTicketTimeline(db, opts.ticket);
        if (events.length === 0) {
          console.log(`[Graph] ${opts.ticket}: 暂无事件记录`);
          return;
        }
        console.log(`[Graph] ${opts.ticket} timeline:`);
        events.forEach((e) => {
          const transition =
            e.fromStatus && e.toStatus ? `${e.fromStatus} → ${e.toStatus}` : e.eventType;
          const error = e.errorCode ? `  [${e.errorCode}]` : '';
          console.log(`  ${e.createdAt}  ${transition}${error}`);
        });
      } else {
        console.log('[graph:query] 用法: --type blocked 或 --ticket TASK-XXX');
      }
    });
}
