/**
 * EKET Framework - Recovery Queue Processor
 *
 * TASK-AUTO-15: Master 启动时恢复队列处理
 *
 * AC:
 * 1. 读取 .eket/triggers/resume-queue.txt
 * 2. 逐个 dispatch resume
 * 3. 成功后清空队列
 * 4. 失败任务记录日志
 *
 * Usage:
 * ```typescript
 * const processor = new RecoveryQueueProcessor();
 * await processor.processQueue();
 * ```
 */

import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

export interface RecoveryQueueOptions {
  /** Queue file path (default .eket/triggers/resume-queue.txt) */
  queuePath?: string;
  /** Project root (default process.cwd()) */
  projectRoot?: string;
  /** Log file path (default .eket/logs/recovery-queue.log) */
  logPath?: string;
}

export interface ProcessResult {
  success: boolean;
  processedCount: number;
  failedCount: number;
  failedTasks: Array<{ taskId: string; error: string }>;
}

/**
 * Recovery Queue Processor
 *
 * Master 启动时处理 Supervisor 记录的恢复队列
 */
export class RecoveryQueueProcessor {
  private queuePath: string;
  private logPath: string;
  private projectRoot: string;

  constructor(options: RecoveryQueueOptions = {}) {
    this.projectRoot = options.projectRoot ?? process.cwd();
    this.queuePath =
      options.queuePath ?? path.join(this.projectRoot, '.eket/triggers/resume-queue.txt');
    this.logPath =
      options.logPath ?? path.join(this.projectRoot, '.eket/logs/recovery-queue.log');
  }

  /**
   * AC-1: Process recovery queue
   *
   * @returns Process result
   */
  async processQueue(): Promise<ProcessResult> {
    const result: ProcessResult = {
      success: true,
      processedCount: 0,
      failedCount: 0,
      failedTasks: [],
    };

    // AC-1: Read queue file
    const taskIds = await this.readQueueFile();

    if (taskIds.length === 0) {
      console.log('[RecoveryQueue] No tasks in queue');
      return result;
    }

    console.log(`[RecoveryQueue] Processing ${taskIds.length} tasks from queue`);

    // AC-2: Dispatch resume for each task
    for (const taskId of taskIds) {
      try {
        await this.dispatchSlaverResume(taskId);
        result.processedCount++;
        console.log(`[RecoveryQueue] ✓ Dispatched resume for ${taskId}`);
      } catch (error) {
        // AC-4: Log failed tasks
        result.failedCount++;
        const errorMsg = error instanceof Error ? error.message : String(error);
        result.failedTasks.push({ taskId, error: errorMsg });
        console.error(`[RecoveryQueue] ✗ Failed to dispatch ${taskId}: ${errorMsg}`);
        await this.logFailure(taskId, errorMsg);
      }
    }

    // AC-3: Clear queue on success (only if all succeeded)
    if (result.failedCount === 0) {
      await this.clearQueue();
      console.log('[RecoveryQueue] Queue cleared successfully');
    } else {
      // Re-write queue with only failed tasks
      await this.writeQueueFile(result.failedTasks.map((f) => f.taskId));
      console.log(`[RecoveryQueue] Queue updated with ${result.failedCount} failed tasks`);
      result.success = false;
    }

    return result;
  }

  /**
   * AC-2: Dispatch Slaver resume
   *
   * Placeholder for actual dispatch logic (to be integrated with existing system)
   *
   * @param taskId Task ID to resume
   */
  private async dispatchSlaverResume(taskId: string): Promise<void> {
    // TODO: Integrate with existing Slaver dispatch system
    // For now, this is a placeholder that simulates dispatch
    //
    // Expected integration points:
    // - createMessageQueue() to send resume message
    // - createMessage('slaver_resume', 'master', taskId, {...})
    // - Slaver poll loop to handle resume message
    //
    // Stub implementation for testing:
    console.log(`[RecoveryQueue] [STUB] Dispatching resume for ${taskId}`);

    // Simulate dispatch delay
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Validation: check if ticket exists
    const ticketPath = path.join(this.projectRoot, 'jira/tickets', `${taskId}.md`);
    if (!existsSync(ticketPath)) {
      throw new Error(`Ticket not found: ${taskId}`);
    }
  }

  /**
   * Read queue file
   *
   * @returns Array of task IDs
   */
  private async readQueueFile(): Promise<string[]> {
    if (!existsSync(this.queuePath)) {
      return [];
    }

    try {
      const content = await fs.readFile(this.queuePath, 'utf-8');
      return content
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && !line.startsWith('#'));
    } catch (error) {
      console.error(
        `[RecoveryQueue] Failed to read queue file: ${error instanceof Error ? error.message : String(error)}`
      );
      return [];
    }
  }

  /**
   * Write queue file
   *
   * @param taskIds Task IDs to write
   */
  private async writeQueueFile(taskIds: string[]): Promise<void> {
    await this.ensureTriggersDir();
    const content = taskIds.join('\n') + (taskIds.length > 0 ? '\n' : '');
    await fs.writeFile(this.queuePath, content, 'utf-8');
  }

  /**
   * AC-3: Clear queue file
   */
  private async clearQueue(): Promise<void> {
    if (existsSync(this.queuePath)) {
      await fs.writeFile(this.queuePath, '', 'utf-8');
    }
  }

  /**
   * AC-4: Log failure
   *
   * @param taskId Task ID
   * @param error Error message
   */
  private async logFailure(taskId: string, error: string): Promise<void> {
    await this.ensureLogsDir();

    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] FAILED: ${taskId} - ${error}\n`;

    await fs.appendFile(this.logPath, logEntry, 'utf-8');
  }

  /**
   * Ensure triggers directory exists
   */
  private async ensureTriggersDir(): Promise<void> {
    const triggersDir = path.dirname(this.queuePath);
    if (!existsSync(triggersDir)) {
      await fs.mkdir(triggersDir, { recursive: true });
    }
  }

  /**
   * Ensure logs directory exists
   */
  private async ensureLogsDir(): Promise<void> {
    const logsDir = path.dirname(this.logPath);
    if (!existsSync(logsDir)) {
      await fs.mkdir(logsDir, { recursive: true });
    }
  }
}
