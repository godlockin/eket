/**
 * recovery-logger.ts
 *
 * Handles logging and context preservation for 400 error recovery operations.
 * Logs all 400 errors to .eket/logs/context-overflow.log
 * Saves task context to .eket/recovery/ during Nuclear Option recovery.
 */

import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * Recovery strategy types aligned with the recovery flow:
 * - detected: Error identified, recovery starting
 * - compact_retry: Strategy 1 (/compact + retry)
 * - nuclear_restart: Strategy 2 (Nuclear Option)
 * - none: Error not recoverable (invalid_request, validation, etc.)
 */
export type RecoveryStrategy = 'detected' | 'compact_retry' | 'nuclear_restart' | 'none';

/**
 * Recovery result types:
 * - initiating: Recovery process started
 * - recovered: Recovery successful, task continued
 * - failed: Recovery failed
 * - rejected: Error not recoverable (not context_length_exceeded)
 */
export type RecoveryResult = 'initiating' | 'recovered' | 'failed' | 'rejected';

export interface LogEntry {
  errorType: string;
  recoveryStrategy: RecoveryStrategy;
  result: RecoveryResult;
  projectRoot: string;
  sessionId?: string;
  taskId?: string;
}

/**
 * Logs a 400 error and its recovery attempt to .eket/logs/context-overflow.log
 *
 * Log format (one line per entry):
 * [ISO8601] sessionId=xxx, taskId=xxx, error_type=xxx, recovery=xxx, result=xxx
 *
 * @param entry - The log entry containing error and recovery details
 *
 * @example
 * ```typescript
 * await logContextOverflow({
 *   errorType: 'context_length_exceeded',
 *   recoveryStrategy: 'compact_retry',
 *   result: 'recovered',
 *   projectRoot: '/path/to/project'
 * });
 * ```
 */
export async function logContextOverflow(entry: LogEntry): Promise<void> {
  const logPath = path.join(entry.projectRoot, '.eket', 'logs', 'context-overflow.log');
  await fs.mkdir(path.dirname(logPath), { recursive: true });

  const timestamp = new Date().toISOString();
  const sessionId = entry.sessionId || 'unknown';
  const taskId = entry.taskId || readTaskIdFromProfile(entry.projectRoot);

  const logLine = `[${timestamp}] sessionId=${sessionId}, taskId=${taskId}, error_type=${entry.errorType}, recovery=${entry.recoveryStrategy}, result=${entry.result}\n`;

  await fs.appendFile(logPath, logLine);
}

/**
 * Saves task context to .eket/recovery/ during Nuclear Option recovery.
 *
 * Creates a markdown file containing:
 * - Task ID
 * - Timestamp of context overflow
 * - Last prompt that caused overflow
 * - Recovery instructions
 *
 * File path: .eket/recovery/task-{taskId}-context.md
 *
 * @param opts - Options containing task details to save
 *
 * @example
 * ```typescript
 * await saveTaskContext({
 *   projectRoot: '/path/to/project',
 *   taskId: 'TASK-601',
 *   prompt: 'Implement recovery mechanism...'
 * });
 * ```
 */
export async function saveTaskContext(opts: {
  projectRoot: string;
  taskId: string;
  prompt: string;
}): Promise<void> {
  const recoveryPath = path.join(
    opts.projectRoot,
    '.eket/recovery',
    `task-${opts.taskId}-context.md`
  );

  await fs.mkdir(path.dirname(recoveryPath), { recursive: true });

  const content = `# Task Context Recovery

**Task ID**: ${opts.taskId}
**Timestamp**: ${new Date().toISOString()}
**Reason**: Context overflow (200k tokens exceeded)

## Last Prompt
\`\`\`
${opts.prompt}
\`\`\`

## Recovery Instructions
Session was restarted due to context overflow. Previous analysis is lost.

Refer to ticket file for original requirements:
- jira/tickets/EPIC-006/${opts.taskId}/
`;

  await fs.writeFile(recoveryPath, content);
  console.log(`💾 Task context saved: ${recoveryPath}`);
}

/**
 * Reads the current task ID from agent_profile.yml
 *
 * @param projectRoot - The project root directory
 * @returns The current task ID or 'unknown' if not found
 */
function readTaskIdFromProfile(projectRoot: string): string {
  try {
    const profilePath = path.join(projectRoot, '.eket', 'state', 'agent_profile.yml');
    const content = require('fs').readFileSync(profilePath, 'utf-8');
    const match = content.match(/^current_ticket:\s*(.+)$/m);
    return match ? match[1].trim() : 'unknown';
  } catch {
    return 'unknown';
  }
}
