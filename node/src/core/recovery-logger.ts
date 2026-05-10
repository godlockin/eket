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
 * Message metadata structure for session snapshots
 */
export interface MessageMetadata {
  role: 'user' | 'assistant';
  timestamp?: string;
  toolCalls?: number;
  tokenEstimate?: number;
}

/**
 * Saves session snapshot to .eket/logs/session-snapshots/{sessionId}.json
 *
 * Captures last 20 messages metadata for post-recovery analysis.
 * Enforces 10MB size limit per snapshot file.
 *
 * @param opts - Options containing session details
 *
 * @example
 * ```typescript
 * await saveSessionSnapshot({
 *   projectRoot: '/path/to/project',
 *   sessionId: 'abc123',
 *   messages: [
 *     { role: 'user', timestamp: '2026-05-10T10:00:00Z', tokenEstimate: 150 },
 *     { role: 'assistant', timestamp: '2026-05-10T10:00:05Z', toolCalls: 2, tokenEstimate: 500 }
 *   ]
 * });
 * ```
 */
export async function saveSessionSnapshot(opts: {
  projectRoot: string;
  sessionId: string;
  messages: MessageMetadata[];
}): Promise<void> {
  const snapshotDir = path.join(opts.projectRoot, '.eket/logs/session-snapshots');
  await fs.mkdir(snapshotDir, { recursive: true });

  const snapshotPath = path.join(snapshotDir, `${opts.sessionId}.json`);

  // Take last 20 messages only
  const recentMessages = opts.messages.slice(-20);

  const snapshot = {
    sessionId: opts.sessionId,
    timestamp: new Date().toISOString(),
    messageCount: recentMessages.length,
    messages: recentMessages,
  };

  const content = JSON.stringify(snapshot, null, 2);

  // Enforce 10MB limit
  const MAX_SIZE = 10 * 1024 * 1024; // 10MB in bytes
  if (Buffer.byteLength(content, 'utf8') > MAX_SIZE) {
    // Truncate messages to fit under 10MB
    const truncatedSnapshot = {
      ...snapshot,
      messages: recentMessages.slice(-10), // Further reduce to last 10
      truncated: true,
      originalCount: recentMessages.length,
    };
    const truncatedContent = JSON.stringify(truncatedSnapshot, null, 2);

    if (Buffer.byteLength(truncatedContent, 'utf8') > MAX_SIZE) {
      // If still too large, save minimal metadata only
      const minimalSnapshot = {
        sessionId: opts.sessionId,
        timestamp: snapshot.timestamp,
        messageCount: recentMessages.length,
        error: 'Snapshot too large, saved metadata only',
      };
      await fs.writeFile(snapshotPath, JSON.stringify(minimalSnapshot, null, 2));
      console.log(`⚠️  Session snapshot truncated (exceeded 10MB): ${snapshotPath}`);
      return;
    }

    await fs.writeFile(snapshotPath, truncatedContent);
    console.log(`⚠️  Session snapshot truncated to last 10 messages: ${snapshotPath}`);
  } else {
    await fs.writeFile(snapshotPath, content);
    console.log(`💾 Session snapshot saved: ${snapshotPath}`);
  }
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
