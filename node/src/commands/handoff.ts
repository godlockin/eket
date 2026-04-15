/**
 * Handoff Command
 * Master 确认 Slaver Handoff 请求的命令
 *
 * 用法: node dist/index.js handoff:confirm <completedTicketId> <slaverId> [--next <ticketId>]
 */

import * as fs from 'fs';
import * as path from 'path';

import { Command } from 'commander';

import { AgentPoolManager, createAgentPoolManager } from '../core/agent-pool.js';
import { printError, logSuccess } from '../utils/error-handler.js';
import { findProjectRoot } from '../utils/process-cleanup.js';

interface HandoffConfirmOptions {
  next?: string;
}

export function registerHandoff(program: Command): void {
  program
    .command('handoff:confirm <completedTicketId> <slaverId>')
    .description('Master 确认 Slaver Handoff 请求，分配下一任务')
    .option('--next <ticketId>', '指定下一个要分配的 Ticket ID')
    .action(async (completedTicketId: string, slaverId: string, options: HandoffConfirmOptions) => {
      const pool: AgentPoolManager = createAgentPoolManager();

      try {
        const projectRoot = (await findProjectRoot()) || process.cwd();

        // 如果没有指定 next，自动查找 ready 状态 ticket
        let nextTicketId = options.next;
        if (!nextTicketId) {
          const jiraDir = path.join(projectRoot, 'jira', 'tickets');
          if (fs.existsSync(jiraDir)) {
            const files = fs.readdirSync(jiraDir).filter((f) => f.endsWith('.md'));
            for (const file of files) {
              const content = fs.readFileSync(path.join(jiraDir, file), 'utf-8');
              const statusMatch = content.match(/\*\*status\*\*:\s*(\w+)/i);
              if (statusMatch?.[1]?.toLowerCase() === 'ready') {
                nextTicketId = path.basename(file, '.md').toUpperCase();
                break;
              }
            }
          }
        }

        if (!nextTicketId) {
          console.log(`[handoff:confirm] 未找到 ready 状态的 ticket，无法执行 Handoff`);
          console.log(`  已完成: ${completedTicketId}, Slaver: ${slaverId}`);
          console.log(`  使用 --next <ticketId> 手动指定下一个 ticket`);
          return;
        }

        // 执行 Handoff
        const result = await pool.executeHandoff(slaverId, nextTicketId);
        if (!result.success) {
          printError({
            code: result.error?.code || 'HANDOFF_FAILED',
            message: result.error?.message || 'Handoff failed',
          });
          process.exit(1);
        }

        logSuccess(`Handoff 完成: ${completedTicketId} → ${nextTicketId} (Slaver: ${slaverId})`);
        console.log(`  Slaver ${slaverId} 已分配新任务 ${nextTicketId}`);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        printError({
          code: 'HANDOFF_FAILED',
          message: `Handoff failed: ${errorMessage}`,
        });
        process.exit(1);
      }
    });
}
