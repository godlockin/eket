/**
 * EKET Framework - Master Slaver Monitor
 *
 * TASK-AUTO-03: Master 端心跳监控 + 超时恢复
 *
 * AC-3: 检测 Slaver 650s 超时并自动 resume
 *
 * Usage:
 * ```typescript
 * const monitor = new MasterSlaverMonitor();
 * await monitor.checkHeartbeats(); // Check all active tasks
 * ```
 */

import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { AutoRetryManager } from './auto-retry-manager.js';

const execFileAsync = promisify(execFile);

export interface HeartbeatData {
  timestamp: number;
  taskId: string;
  elapsed: number;
  status: string;
}

export interface TimeoutTask {
  taskId: string;
  slaverId: string;
  elapsed: number;
  lastHeartbeat: number;
  hasCheckpoint: boolean;
}

export interface MonitorOptions {
  /** Timeout threshold (ms) - default 650s */
  timeoutThresholdMs?: number;
  /** Heartbeat directory - default .eket/state */
  heartbeatDir?: string;
  /** Project root - default process.cwd() */
  projectRoot?: string;
}

/**
 * Master Slaver Monitor
 *
 * Monitors Slaver heartbeats and triggers recovery on timeout
 */
export class MasterSlaverMonitor {
  private timeoutThresholdMs: number;
  private heartbeatDir: string;
  private projectRoot: string;
  private retryManager: AutoRetryManager;

  constructor(options: MonitorOptions = {}) {
    this.timeoutThresholdMs = options.timeoutThresholdMs ?? 650000; // 650s
    this.projectRoot = options.projectRoot ?? process.cwd();
    this.heartbeatDir = options.heartbeatDir ?? path.join(this.projectRoot, '.eket/state');
    this.retryManager = new AutoRetryManager({ projectRoot: this.projectRoot });
  }

  /**
   * Check all active Slaver heartbeats
   * AC-3: Detect timeout and trigger resume
   *
   * @returns Array of timed-out tasks
   */
  async checkHeartbeats(): Promise<TimeoutTask[]> {
    const timedOutTasks: TimeoutTask[] = [];

    try {
      // Ensure directory exists
      if (!existsSync(this.heartbeatDir)) {
        console.log('[MasterMonitor] No heartbeat directory found');
        return [];
      }

      // Read all heartbeat files
      const files = await fs.readdir(this.heartbeatDir);
      const heartbeatFiles = files.filter((f) => f.startsWith('slaver-') && f.endsWith('-heartbeat'));

      if (heartbeatFiles.length === 0) {
        console.log('[MasterMonitor] No active Slavers');
        return [];
      }

      console.log(`[MasterMonitor] Checking ${heartbeatFiles.length} heartbeats...`);

      // Check each heartbeat
      for (const file of heartbeatFiles) {
        const filePath = path.join(this.heartbeatDir, file);
        const taskId = this.extractTaskIdFromFilename(file);

        try {
          const content = await fs.readFile(filePath, 'utf-8');
          const data: HeartbeatData = JSON.parse(content);

          const now = Date.now();
          const elapsed = now - data.timestamp;

          // AC-3: Check timeout (650s)
          if (elapsed > this.timeoutThresholdMs) {
            console.warn(
              `[MasterMonitor] ⚠️  Timeout detected: ${taskId} (${Math.floor(elapsed / 1000)}s stale)`
            );

            // Check if checkpoint exists
            const hasCheckpoint = await this.checkCheckpointBranch(taskId);

            timedOutTasks.push({
              taskId,
              slaverId: file.replace(/^slaver-/, '').replace(/-heartbeat$/, ''),
              elapsed,
              lastHeartbeat: data.timestamp,
              hasCheckpoint,
            });

            // Log timeout event
            await this.logTimeoutEvent(taskId, elapsed, hasCheckpoint);

            // TASK-AUTO-06: Auto retry on timeout
            await this.handleTimeoutWithRetry(taskId, elapsed, hasCheckpoint);
          } else {
            // Healthy heartbeat
            const elapsedSec = Math.floor(elapsed / 1000);
            if (elapsedSec > 120) {
              // Log if > 2min stale (warning sign)
              console.log(
                `[MasterMonitor] ${taskId}: ${elapsedSec}s stale (status: ${data.status})`
              );
            }
          }
        } catch (error) {
          console.warn(
            `[MasterMonitor] Failed to read heartbeat ${file}: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }

      return timedOutTasks;
    } catch (error) {
      console.error(
        `[MasterMonitor] Heartbeat check failed: ${error instanceof Error ? error.message : String(error)}`
      );
      return [];
    }
  }

  /**
   * Extract task ID from heartbeat filename
   * e.g., "slaver-TASK-001-heartbeat" -> "TASK-001"
   */
  private extractTaskIdFromFilename(filename: string): string {
    const match = filename.match(/slaver-(.+)-heartbeat$/);
    return match ? match[1] : filename;
  }

  /**
   * Check if checkpoint branch exists (remote or local)
   */
  private async checkCheckpointBranch(taskId: string): Promise<boolean> {
    const branch = `checkpoint/${taskId}`;

    try {
      // Try remote first
      await execFileAsync('git', ['ls-remote', '--heads', 'origin', branch], {
        cwd: this.projectRoot,
        timeout: 5000,
      });
      return true;
    } catch {
      // Fallback to local
      try {
        const { stdout } = await execFileAsync('git', ['branch', '--list', branch], {
          cwd: this.projectRoot,
        });
        return stdout.trim().length > 0;
      } catch {
        return false;
      }
    }
  }

  /**
   * Log timeout event to master-monitor.log
   */
  private async logTimeoutEvent(
    taskId: string,
    elapsed: number,
    hasCheckpoint: boolean
  ): Promise<void> {
    try {
      const logDir = path.join(this.projectRoot, '.eket/logs');
      const logPath = path.join(logDir, 'master-monitor.log');

      await fs.mkdir(logDir, { recursive: true });

      const timestamp = new Date().toISOString();
      const elapsedSec = Math.floor(elapsed / 1000);
      const logEntry = `[${timestamp}] Slaver timeout: ${taskId} (${elapsedSec}s stale, checkpoint: ${hasCheckpoint})\n`;

      await fs.appendFile(logPath, logEntry, 'utf-8');
    } catch {
      // Ignore log failures
    }
  }

  /**
   * Trigger Slaver resume for timed-out task
   * AC-3: Auto dispatch resume
   *
   * @param taskId - Task to resume
   * @returns Success status
   */
  async triggerResume(taskId: string): Promise<boolean> {
    console.log(`[MasterMonitor] 🔄 Triggering resume for ${taskId}...`);

    try {
      // Check checkpoint exists
      const hasCheckpoint = await this.checkCheckpointBranch(taskId);

      if (!hasCheckpoint) {
        console.warn(`[MasterMonitor] ⚠️  No checkpoint found for ${taskId}, cannot resume`);
        return false;
      }

      // Log resume event
      await this.logResumeEvent(taskId);

      // TODO: Integrate with actual Slaver dispatch mechanism
      // For now, log the resume action
      console.log(`[MasterMonitor] ✅ Resume logged for ${taskId} (checkpoint exists)`);

      return true;
    } catch (error) {
      console.error(
        `[MasterMonitor] ❌ Resume failed for ${taskId}: ${error instanceof Error ? error.message : String(error)}`
      );
      return false;
    }
  }

  /**
   * Log resume event to master-monitor.log
   */
  private async logResumeEvent(taskId: string): Promise<void> {
    try {
      const logDir = path.join(this.projectRoot, '.eket/logs');
      const logPath = path.join(logDir, 'master-monitor.log');

      await fs.mkdir(logDir, { recursive: true });

      const timestamp = new Date().toISOString();
      const logEntry = `[${timestamp}] Triggered resume: ${taskId}\n`;

      await fs.appendFile(logPath, logEntry, 'utf-8');
    } catch {
      // Ignore log failures
    }
  }

  /**
   * Cleanup stale heartbeat files (for closed tasks)
   */
  async cleanupStaleHeartbeats(): Promise<void> {
    try {
      const files = await fs.readdir(this.heartbeatDir);
      const heartbeatFiles = files.filter((f) => f.startsWith('slaver-') && f.endsWith('-heartbeat'));

      for (const file of heartbeatFiles) {
        const filePath = path.join(this.heartbeatDir, file);

        try {
          const content = await fs.readFile(filePath, 'utf-8');
          const data: HeartbeatData = JSON.parse(content);

          // Remove if status is 'closed'
          if (data.status === 'closed') {
            await fs.unlink(filePath);
            console.log(`[MasterMonitor] Cleaned up heartbeat: ${file}`);
          }
        } catch {
          // Ignore errors
        }
      }
    } catch (error) {
      console.warn(
        `[MasterMonitor] Cleanup failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Get all active heartbeats (for status display)
   */
  async getActiveHeartbeats(): Promise<HeartbeatData[]> {
    const heartbeats: HeartbeatData[] = [];

    try {
      if (!existsSync(this.heartbeatDir)) {
        return [];
      }

      const files = await fs.readdir(this.heartbeatDir);
      const heartbeatFiles = files.filter((f) => f.startsWith('slaver-') && f.endsWith('-heartbeat'));

      for (const file of heartbeatFiles) {
        const filePath = path.join(this.heartbeatDir, file);

        try {
          const content = await fs.readFile(filePath, 'utf-8');
          const data: HeartbeatData = JSON.parse(content);
          heartbeats.push(data);
        } catch {
          // Skip invalid files
        }
      }

      return heartbeats;
    } catch {
      return [];
    }
  }
}
