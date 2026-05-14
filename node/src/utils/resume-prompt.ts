/**
 * EKET Framework - Resume Prompt
 *
 * Interactive prompt for resume strategy selection.
 * Used in `task:claim --resume` to ask user how to proceed.
 *
 * TASK-X06, AC-3: Three-option strategy:
 * 1. Continue from checkpoint (recommended)
 * 2. Re-analyze from scratch
 * 3. Abort
 */

import * as readline from 'readline';

export type ResumeStrategy = 'continue' | 're-analyze' | 'abort';

/**
 * Prompt user for resume strategy
 *
 * @returns Promise resolving to user's choice
 */
export async function promptResumeStrategy(): Promise<ResumeStrategy> {
  console.log('\n');
  console.log('Resume strategy:');
  console.log('  [1] Continue from last checkpoint (recommended)');
  console.log('  [2] Re-analyze task (if checkpoint outdated)');
  console.log('  [3] Abort');
  console.log('');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise<ResumeStrategy>((resolve) => {
    rl.question('Your choice: ', (answer) => {
      rl.close();

      const trimmed = answer.trim();
      if (trimmed === '1') {
        resolve('continue');
      } else if (trimmed === '2') {
        resolve('re-analyze');
      } else {
        resolve('abort');
      }
    });
  });
}

/**
 * Format time difference as human-readable string (e.g., "2h 30m ago")
 */
export function formatTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);

  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${mins}m ago`;
  }
  return `${Math.floor(seconds / 86400)}d ago`;
}
