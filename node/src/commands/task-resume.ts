/**
 * Task Resume Command
 * Slaver 重启后从 SQLite 检查点续跑
 *
 * 用法: node dist/index.js task:resume --slaver <slaverId>
 *
 * 查询 execution_checkpoints 表，找到该 Slaver 的最新检查点。
 * 找到 → 输出恢复信息，Slaver 从该 phase 继续。
 * 未找到 → 提示走正常 task:claim 流程。
 */

import * as fs from 'fs';
import * as path from 'path';

import { Command } from 'commander';

import { createSQLiteManager } from '../core/sqlite-manager.js';
import { EketError } from '../types/index.js';
import { printError } from '../utils/error-handler.js';
import { findProjectRoot } from '../utils/process-cleanup.js';

interface ResumeCheckpoint {
  ticketId: string;
  slaverId: string;
  sessionId?: string;
  phase?: string;
}

/**
 * 判断错误是否为 session 相关失败
 */
function isSessionError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
  return msg.includes('session') || msg.includes('expired') || msg.includes('not found');
}

/**
 * Session resume 失败时的降级策略
 * - 若 sessionId 为空或 session 错误 → 清除 checkpoint，走 fresh 路径
 * @param _attemptResume - 可注入的 session resume 函数（便于测试）
 */
export async function resumeWithFallback(
  checkpoint: ResumeCheckpoint,
  _attemptResume: (sessionId: string) => Promise<void> = attemptSessionResume
): Promise<void> {
  const sqlite = createSQLiteManager();
  await sqlite.connect();

  try {
    if (!checkpoint.sessionId) {
      console.warn('WARN: session resume failed, falling back to fresh session');
      await sqlite.deleteCheckpoint(checkpoint.ticketId, checkpoint.slaverId);
      console.log(`[task:resume] Checkpoint cleared. Re-run task:claim for ticket ${checkpoint.ticketId}`);
      return;
    }

    // 尝试 session resume（此处模拟：若 sessionId 触发已知失败模式则降级）
    try {
      // 真实场景：此处调用 AI SDK resume API
      // 此处抛出以触发降级逻辑（仅供测试 mock 覆盖）
      await _attemptResume(checkpoint.sessionId);
    } catch (err: unknown) {
      if (isSessionError(err)) {
        console.warn('WARN: session resume failed, falling back to fresh session');
        await sqlite.deleteCheckpoint(checkpoint.ticketId, checkpoint.slaverId);
        console.log(`[task:resume] Checkpoint cleared. Re-run task:claim for ticket ${checkpoint.ticketId}`);
        return;
      }
      throw err;
    }
  } finally {
    await sqlite.close();
  }
}

/**
 * 尝试 session resume（可被 mock 覆盖用于测试）
 */
export async function attemptSessionResume(sessionId: string): Promise<void> {
  // 实际接入 Claude API session resume 时在此实现
  // 当前为 no-op stub
  void sessionId;
}

interface ResumeOptions {
  slaver: string;
}

/**
 * 从检查点行构造恢复信息
 */
function formatResumeInfo(row: {
  ticket_id: string;
  slaver_id: string;
  phase: string;
  state_json: string;
  created_at?: string;
}): string {
  let stateInfo = '';
  try {
    const state = JSON.parse(row.state_json) as {
      filesChanged?: string[];
      lastAction?: string;
      notes?: string;
      savedAt?: string;
    };
    const parts: string[] = [];
    if (state.lastAction) parts.push(`  最后操作: ${state.lastAction}`);
    if (state.filesChanged && state.filesChanged.length > 0) {
      parts.push(`  已变更文件: ${state.filesChanged.join(', ')}`);
    }
    if (state.notes) parts.push(`  备注: ${state.notes}`);
    if (state.savedAt) parts.push(`  保存时间: ${state.savedAt}`);
    stateInfo = parts.join('\n');
  } catch {
    stateInfo = `  state_json: ${row.state_json}`;
  }

  return [
    `[task:resume] 找到检查点：`,
    `  Ticket: ${row.ticket_id}`,
    `  Slaver: ${row.slaver_id}`,
    `  恢复阶段: ${row.phase}`,
    stateInfo,
    ``,
    `建议操作：`,
    `  从 phase="${row.phase}" 继续执行 ticket ${row.ticket_id}`,
    `  如需从头开始，请先运行: node dist/index.js sqlite:clear-checkpoint --ticket ${row.ticket_id} --slaver ${row.slaver_id}`,
  ]
    .filter((l) => l !== undefined)
    .join('\n');
}

/**
 * 注册 task:resume 命令
 */
export function registerTaskResume(program: Command): void {
  program
    .command('task:resume')
    .description('Slaver 重启后从检查点恢复执行（查询 SQLite execution_checkpoints 表）')
    .requiredOption('--slaver <slaverId>', 'Slaver 实例 ID')
    .addHelpText(
      'after',
      `
Examples:
  node dist/index.js task:resume --slaver slaver_1
  node dist/index.js task:resume --slaver frontend_dev_001
`
    )
    .action(async (options: ResumeOptions) => {
      const sqlite = createSQLiteManager();

      try {
        const connectResult = await sqlite.connect();
        if (!connectResult.success) {
          console.log(
            `[task:resume] SQLite 不可用（${connectResult.error?.message ?? 'unknown'}），无法查询检查点`
          );
          console.log(`  请运行 node dist/index.js task:claim 重新领取任务`);
          return;
        }

        // 查询该 Slaver 的检查点
        const result = await sqlite.get(
          'SELECT * FROM execution_checkpoints WHERE slaver_id = ? ORDER BY created_at DESC LIMIT 1',
          [options.slaver]
        );

        if (!result.success) {
          printError(
            result.error ||
              new EketError('SQLITE_QUERY_FAILED', 'Failed to query execution_checkpoints')
          );
          process.exit(1);
        }

        const row = result.data as {
          ticket_id: string;
          slaver_id: string;
          phase: string;
          state_json: string;
          created_at?: string;
        } | null;

        if (!row) {
          console.log(
            `[task:resume] Slaver "${options.slaver}" 无未完成检查点，请运行 task:claim 领取新任务`
          );
          const projectRoot = (await findProjectRoot()) || process.cwd();
          const jiraDir = path.join(projectRoot, 'jira', 'tickets');
          if (fs.existsSync(jiraDir)) {
            const readyFiles = fs
              .readdirSync(jiraDir)
              .filter((f) => f.endsWith('.md'))
              .filter((f) => {
                const content = fs.readFileSync(path.join(jiraDir, f), 'utf-8');
                return /\*\*status\*\*:\s*ready/i.test(content);
              });
            if (readyFiles.length > 0) {
              console.log(
                `  当前可领取任务: ${readyFiles.map((f) => path.basename(f, '.md').toUpperCase()).join(', ')}`
              );
            }
          }
          return;
        }

        console.log(formatResumeInfo(row));
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        printError(new EketError('RESUME_FAILED', `task:resume failed: ${errorMessage}`));
        process.exit(1);
      } finally {
        await sqlite.close();
      }
    });
}
