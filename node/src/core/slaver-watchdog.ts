/**
 * EKET Framework - Slaver Watchdog
 *
 * TASK-AUTO-03: Slaver 超时自动恢复机制
 *
 * Prevents work loss by:
 * - AC-1: Auto checkpoint at 500s timeout warning
 * - AC-2: 60s heartbeat mechanism
 *
 * Usage:
 * ```typescript
 * const watchdog = new SlaverWatchdog(taskId, progressTracker);
 * // ... execute task ...
 * watchdog.close();
 * ```
 */

import fs from 'fs/promises';
import path from 'path';
import { ProgressTracker } from './progress-tracker.js';

export interface WatchdogOptions {
  /** Timeout warning threshold (ms) - default 500s */
  timeoutWarningMs?: number;
  /** Heartbeat interval (ms) - default 60s */
  heartbeatIntervalMs?: number;
  /** Heartbeat file directory - default .eket/state */
  heartbeatDir?: string;
  /** Enable auto checkpoint on timeout - default true */
  enableAutoCheckpoint?: boolean;
}

/**
 * Slaver Watchdog - prevents work loss on timeout
 *
 * Key Features:
 * - Heartbeat every 60s (AC-2)
 * - Auto checkpoint at 500s (AC-1)
 * - Graceful cleanup on close
 */
export class SlaverWatchdog {
  private taskId: string;
  private progressTracker: ProgressTracker | null;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private timeoutWarningTimer: NodeJS.Timeout | null = null;
  private startTime: number = Date.now();
  private lastActivity: number = Date.now();
  private heartbeatFilePath: string;
  private status: string = 'active';

  // Config
  private timeoutWarningMs: number;
  private heartbeatIntervalMs: number;
  private enableAutoCheckpoint: boolean;

  constructor(
    taskId: string,
    progressTracker: ProgressTracker | null,
    options: WatchdogOptions = {}
  ) {
    this.taskId = taskId;
    this.progressTracker = progressTracker;

    // Config
    this.timeoutWarningMs = options.timeoutWarningMs ?? 500000; // 500s
    this.heartbeatIntervalMs = options.heartbeatIntervalMs ?? 60000; // 60s
    this.enableAutoCheckpoint = options.enableAutoCheckpoint ?? true;

    // Heartbeat file path
    const heartbeatDir = options.heartbeatDir ?? path.resolve(process.cwd(), '.eket/state');
    this.heartbeatFilePath = path.join(heartbeatDir, `slaver-${taskId}-heartbeat`);

    // AC-2: Start heartbeat mechanism (60s)
    this.startHeartbeat();

    // AC-1: Start timeout warning timer (500s)
    this.startTimeoutWarning();

    console.log(`[Watchdog] Started for ${taskId} (timeout: ${this.timeoutWarningMs}ms)`);
  }

  /**
   * AC-2: Start heartbeat mechanism
   * Updates heartbeat file every 60s
   */
  private startHeartbeat(): void {
    // Initial heartbeat (synchronous to ensure file exists)
    this.updateHeartbeat().catch((error) => {
      console.warn(
        `[Watchdog] Initial heartbeat failed: ${error instanceof Error ? error.message : String(error)}`
      );
    });

    // Periodic heartbeat
    this.heartbeatInterval = setInterval(() => {
      void this.updateHeartbeat();
    }, this.heartbeatIntervalMs);

    // Don't prevent process exit
    this.heartbeatInterval.unref();
  }

  /**
   * Update heartbeat file with current timestamp
   */
  private async updateHeartbeat(): Promise<void> {
    try {
      const timestamp = Date.now();
      const elapsed = timestamp - this.startTime;

      // Ensure directory exists
      await fs.mkdir(path.dirname(this.heartbeatFilePath), { recursive: true });

      // Write heartbeat (timestamp + elapsed)
      const content = JSON.stringify({
        timestamp,
        taskId: this.taskId,
        elapsed,
        status: this.status,
      });

      await fs.writeFile(this.heartbeatFilePath, content, 'utf-8');
      this.lastActivity = timestamp;

      // Log heartbeat (only every 5 min to avoid noise)
      if (elapsed > 0 && elapsed % 300000 < this.heartbeatIntervalMs) {
        console.log(`[Watchdog] Heartbeat (${Math.floor(elapsed / 1000)}s elapsed)`);
      }
    } catch (error) {
      // Non-critical: log but don't throw
      console.warn(
        `[Watchdog] Heartbeat update failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * AC-1: Start timeout warning timer
   * Triggers auto checkpoint at 500s
   */
  private startTimeoutWarning(): void {
    this.timeoutWarningTimer = setTimeout(() => {
      void this.handleTimeoutWarning();
    }, this.timeoutWarningMs);

    // Don't prevent process exit
    this.timeoutWarningTimer.unref();
  }

  /**
   * Handle timeout warning - auto checkpoint
   */
  private async handleTimeoutWarning(): Promise<void> {
    const elapsed = Date.now() - this.startTime;
    console.warn(
      `[Watchdog] ⚠️  Timeout warning (${Math.floor(elapsed / 1000)}s) - triggering auto checkpoint`
    );

    // AC-1: Auto checkpoint
    if (this.enableAutoCheckpoint && this.progressTracker) {
      try {
        await this.progressTracker.checkpoint('timeout_warning', {
          elapsed,
          reason: 'watchdog_timeout_prevention',
          timestamp: new Date().toISOString(),
        });

        // Force flush to ensure checkpoint is written
        await this.progressTracker.flush();

        console.log('[Watchdog] ✅ Auto checkpoint completed');
      } catch (error) {
        console.error(
          `[Watchdog] ❌ Auto checkpoint failed: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    } else {
      console.warn('[Watchdog] Auto checkpoint skipped (disabled or tracker unavailable)');
    }

    // Update heartbeat status to 'timeout_warning'
    await this.updateHeartbeatStatus('timeout_warning');
  }

  /**
   * Update heartbeat status field
   */
  private async updateHeartbeatStatus(status: string): Promise<void> {
    this.status = status;
    try {
      const timestamp = Date.now();
      const elapsed = timestamp - this.startTime;

      const content = JSON.stringify({
        timestamp,
        taskId: this.taskId,
        elapsed,
        status,
      });

      await fs.writeFile(this.heartbeatFilePath, content, 'utf-8');
    } catch (error) {
      console.warn(
        `[Watchdog] Status update failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Mark activity (reset timeout)
   */
  markActivity(): void {
    this.lastActivity = Date.now();
  }

  /**
   * Get elapsed time since start
   */
  getElapsedTime(): number {
    return Date.now() - this.startTime;
  }

  /**
   * Get last activity time
   */
  getLastActivity(): number {
    return this.lastActivity;
  }

  /**
   * Close watchdog and cleanup timers
   */
  async close(): Promise<void> {
    console.log('[Watchdog] Closing...');

    // Stop timers
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    if (this.timeoutWarningTimer) {
      clearTimeout(this.timeoutWarningTimer);
      this.timeoutWarningTimer = null;
    }

    // Final heartbeat with 'closed' status
    await this.updateHeartbeatStatus('closed');

    console.log('[Watchdog] Closed');
  }

  /**
   * Get heartbeat file path (for testing)
   */
  getHeartbeatPath(): string {
    return this.heartbeatFilePath;
  }
}
