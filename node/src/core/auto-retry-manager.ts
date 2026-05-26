/**
 * EKET Framework - Auto Retry Manager
 *
 * TASK-AUTO-06: 自动重试机制
 *
 * AC:
 * 1. Slaver 失败时记录状态
 * 2. Master 自动派遣 resume (最多 3 次)
 * 3. 3 次失败后人工告警
 * 4. 避免无限循环
 *
 * Usage:
 * ```typescript
 * const retryMgr = new AutoRetryManager();
 * const canRetry = await retryMgr.shouldRetry('TASK-001');
 * if (canRetry) {
 *   await retryMgr.incrementRetryCount('TASK-001');
 *   // Trigger resume...
 * }
 * ```
 */

import { promises as fs , existsSync } from 'fs';
import * as path from 'path';

export interface RetryState {
  taskId: string;
  attempts: number;
  maxRetries: number;
  lastFailedAt: number;
  failureReasons: string[];
  createdAt: number;
  updatedAt: number;
}

export interface RetryCheckResult {
  canRetry: boolean;
  attemptsRemaining: number;
  reason?: string;
}

export interface RetryManagerOptions {
  /** Max retry attempts (default 3) */
  maxRetries?: number;
  /** State directory (default .eket/state/retry) */
  stateDir?: string;
  /** Project root (default process.cwd()) */
  projectRoot?: string;
}

/**
 * Auto Retry Manager
 *
 * Tracks retry attempts per task and enforces retry limits
 */
export class AutoRetryManager {
  private maxRetries: number;
  private stateDir: string;
  private projectRoot: string;

  constructor(options: RetryManagerOptions = {}) {
    this.maxRetries = options.maxRetries ?? 3;
    this.projectRoot = options.projectRoot ?? process.cwd();
    this.stateDir = options.stateDir ?? path.join(this.projectRoot, '.eket/state/retry');
  }

  /**
   * AC-2: Check if task can be retried
   *
   * @param taskId Task ID
   * @returns Retry check result
   */
  async shouldRetry(taskId: string): Promise<RetryCheckResult> {
    const state = await this.loadState(taskId);

    if (!state) {
      // First failure - can retry
      return {
        canRetry: true,
        attemptsRemaining: this.maxRetries,
      };
    }

    const attemptsRemaining = this.maxRetries - state.attempts;

    if (state.attempts >= this.maxRetries) {
      // AC-3: Max retries reached
      return {
        canRetry: false,
        attemptsRemaining: 0,
        reason: `Max retries (${this.maxRetries}) reached for ${taskId}`,
      };
    }

    return {
      canRetry: true,
      attemptsRemaining,
    };
  }

  /**
   * AC-1: Record failure and increment retry count
   *
   * @param taskId Task ID
   * @param reason Failure reason
   * @returns Updated retry state
   */
  async recordFailure(taskId: string, reason: string): Promise<RetryState> {
    const state = await this.loadState(taskId);
    const now = Date.now();

    const updated: RetryState = state
      ? {
          ...state,
          attempts: state.attempts + 1,
          lastFailedAt: now,
          failureReasons: [...state.failureReasons, reason],
          updatedAt: now,
        }
      : {
          taskId,
          attempts: 1,
          maxRetries: this.maxRetries,
          lastFailedAt: now,
          failureReasons: [reason],
          createdAt: now,
          updatedAt: now,
        };

    await this.saveState(updated);
    return updated;
  }

  /**
   * AC-4: Reset retry state (e.g., after manual intervention)
   *
   * @param taskId Task ID
   */
  async resetRetryState(taskId: string): Promise<void> {
    const filePath = this.getStateFilePath(taskId);

    if (existsSync(filePath)) {
      await fs.unlink(filePath);
      console.log(`[AutoRetry] Reset retry state for ${taskId}`);
    }
  }

  /**
   * Get retry state for a task
   *
   * @param taskId Task ID
   * @returns Retry state or null if not found
   */
  async getRetryState(taskId: string): Promise<RetryState | null> {
    return this.loadState(taskId);
  }

  /**
   * AC-3: Check if task has reached max retries
   *
   * @param taskId Task ID
   * @returns True if max retries reached
   */
  async hasReachedMaxRetries(taskId: string): Promise<boolean> {
    const state = await this.loadState(taskId);
    return state ? state.attempts >= this.maxRetries : false;
  }

  /**
   * Get all tasks that have failed and need human intervention
   *
   * @returns Array of task IDs that reached max retries
   */
  async getTasksNeedingIntervention(): Promise<string[]> {
    await this.ensureStateDir();

    try {
      const files = await fs.readdir(this.stateDir);
      const retryFiles = files.filter((f) => f.startsWith('retry-') && f.endsWith('.json'));

      const maxRetryTasks: string[] = [];

      for (const file of retryFiles) {
        const taskId = this.extractTaskIdFromFilename(file);
        const state = await this.loadState(taskId);

        if (state && state.attempts >= this.maxRetries) {
          maxRetryTasks.push(taskId);
        }
      }

      return maxRetryTasks;
    } catch (error) {
      console.error(
        `[AutoRetry] Failed to scan intervention tasks: ${error instanceof Error ? error.message : String(error)}`
      );
      return [];
    }
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Load retry state from file
   */
  private async loadState(taskId: string): Promise<RetryState | null> {
    const filePath = this.getStateFilePath(taskId);

    if (!existsSync(filePath)) {
      return null;
    }

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(content) as RetryState;
    } catch (error) {
      console.warn(
        `[AutoRetry] Failed to load state for ${taskId}: ${error instanceof Error ? error.message : String(error)}`
      );
      return null;
    }
  }

  /**
   * Save retry state to file
   */
  private async saveState(state: RetryState): Promise<void> {
    await this.ensureStateDir();

    const filePath = this.getStateFilePath(state.taskId);
    await fs.writeFile(filePath, JSON.stringify(state, null, 2), 'utf-8');

    console.log(
      `[AutoRetry] Saved retry state for ${state.taskId} (attempts: ${state.attempts}/${this.maxRetries})`
    );
  }

  /**
   * Get state file path for task
   */
  private getStateFilePath(taskId: string): string {
    return path.join(this.stateDir, `retry-${taskId}.json`);
  }

  /**
   * Extract task ID from filename
   */
  private extractTaskIdFromFilename(filename: string): string {
    const match = filename.match(/^retry-(.+)\.json$/);
    return match ? match[1] : filename;
  }

  /**
   * Ensure state directory exists
   */
  private async ensureStateDir(): Promise<void> {
    if (!existsSync(this.stateDir)) {
      await fs.mkdir(this.stateDir, { recursive: true });
    }
  }
}
