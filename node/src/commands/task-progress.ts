/**
 * task:progress — Slaver 进度上报命令 (TASK-109)
 *
 * 发布 task_running SSE 事件，payload 包含 phase / todos / done。
 *
 * Usage:
 *   node dist/index.js task:progress --ticket <id> --phase <analysis|implement|test|pr> --todos <n> --done <n>
 */
import { Command } from 'commander';

import { sseBus } from '../core/sse-bus.js';

export type ProgressPhase = 'analysis' | 'implement' | 'test' | 'pr';

export function registerTaskProgress(program: Command): void {
  program
    .command('task:progress')
    .description('Report Slaver task progress (publishes task_running SSE event)')
    .requiredOption('--ticket <id>', 'Ticket ID')
    .requiredOption('--phase <phase>', 'Current phase: analysis|implement|test|pr')
    .requiredOption('--todos <n>', 'Total todo items', parseInt)
    .requiredOption('--done <n>', 'Completed todo items', parseInt)
    .option('--slaver <id>', 'Slaver ID (defaults to EKET_SLAVER_ID or process.pid)')
    .action((opts: { ticket: string; phase: string; todos: number; done: number; slaver?: string }) => {
      const validPhases: ProgressPhase[] = ['analysis', 'implement', 'test', 'pr'];
      if (!validPhases.includes(opts.phase as ProgressPhase)) {
        console.error(`Invalid phase: ${opts.phase}. Must be one of: ${validPhases.join(', ')}`);
        process.exit(1);
      }

      const slaverId =
        opts.slaver ?? process.env['EKET_SLAVER_ID'] ?? `agent_${process.pid}`;

      sseBus.publish({
        type: 'task_running',
        ticketId: opts.ticket,
        slaverId,
        timestamp: new Date().toISOString(),
        payload: {
          phase: opts.phase,
          todos: opts.todos,
          done: opts.done,
        },
      });

      console.log(
        `[task:progress] ticket=${opts.ticket} phase=${opts.phase} done=${opts.done}/${opts.todos} slaverId=${slaverId}`,
      );
    });
}
