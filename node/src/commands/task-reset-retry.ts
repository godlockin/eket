/**
 * EKET Framework - Task Retry Reset Command
 *
 * TASK-AUTO-06: Reset retry state for a task
 *
 * Usage:
 *   eket task:reset-retry <task-id>
 *   eket task:reset-retry TASK-001 --force
 */

import { Command } from 'commander';
import { AutoRetryManager } from '../core/auto-retry-manager.js';

export const taskResetRetryCommand = new Command('task:reset-retry')
  .description('Reset retry state for a task (requires human intervention confirmation)')
  .argument('<task-id>', 'Task ID to reset (e.g., TASK-001)')
  .option('-f, --force', 'Skip confirmation prompt', false)
  .action(async (taskId: string, options: { force: boolean }) => {
    try {
      const retryMgr = new AutoRetryManager();

      // Get current state
      const state = await retryMgr.getRetryState(taskId);

      if (!state) {
        console.log(`✅ No retry state found for ${taskId} (no reset needed)`);
        return;
      }

      // Display current state
      console.log(`\n📊 Current Retry State for ${taskId}:`);
      console.log(`   Attempts: ${state.attempts}/${state.maxRetries}`);
      console.log(`   Last Failed: ${new Date(state.lastFailedAt).toISOString()}`);
      console.log(`\n   Failure History:`);
      state.failureReasons.forEach((reason, i) => {
        console.log(`     ${i + 1}. ${reason}`);
      });

      // Confirm reset
      if (!options.force) {
        console.log(
          `\n⚠️  WARNING: Resetting retry state will allow this task to be retried again.`
        );
        console.log(`   Make sure you have fixed the root cause before resetting.`);
        console.log(`\n   Use --force to skip this confirmation.\n`);

        // In production, would use readline for interactive confirmation
        // For now, require --force flag
        console.error(`❌ Aborted. Use --force to confirm reset.`);
        process.exit(1);
      }

      // Reset
      await retryMgr.resetRetryState(taskId);
      console.log(`\n✅ Retry state reset for ${taskId}`);
      console.log(`   Task can now be retried from scratch (0/${state.maxRetries} attempts)\n`);
    } catch (error) {
      console.error(
        `❌ Failed to reset retry state: ${error instanceof Error ? error.message : String(error)}`
      );
      process.exit(1);
    }
  });
