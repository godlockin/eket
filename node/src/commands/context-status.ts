/**
 * context:status Command
 * TASK-604: Display current context usage status
 */

import type { Command } from 'commander';
import { contextTracker } from '../core/context-tracker.js';

/**
 * Register context:status command
 */
export function registerContextStatus(program: Command): void {
  program
    .command('context:status')
    .description('Display current context usage status')
    .option('-s, --session <id>', 'Session ID', 'default')
    .addHelpText(
      'after',
      `
Examples:
  $ eket-cli context:status                  # Show status for default session
  $ eket-cli context:status -s session-123   # Show status for specific session

Related Commands:
  $ eket-cli system:doctor                   # Full system diagnosis
`
    )
    .action((options) => {
      const status = contextTracker.getStatus(options.session);
      console.log(status);
    });
}
