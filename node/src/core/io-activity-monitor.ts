/**
 * EKET Framework - I/O Activity Monitor
 *
 * Detects Slaver hang state by monitoring I/O activity (ProgressTracker checkpoints).
 * Triggers alert if no I/O detected for 180s.
 *
 * Key Features:
 * - Monitors ProgressTracker checkpoint calls as I/O activity signal
 * - 180s no-activity timeout → alert
 * - Optional HTTP health check endpoint (/health)
 * - Non-blocking: alert sent to message queue, Master handles restart
 *
 * Usage:
 * ```typescript
 * const monitor = new IOActivityMonitor({
 *   taskId: 'TASK-001',
 *   slaverId: 'slaver-020',
 *   onHang: (report) => {
 *     // Send alert to Master
 *     await sendAlertMessage(report);
 *   }
 * });
 *
 * // Start monitoring
 * await monitor.start();
 *
 * // Hook into ProgressTracker
 * tracker.on('checkpoint', () => monitor.recordActivity());
 *
 * // Stop monitoring
 * await monitor.stop();
 * ```
 */

import { EventEmitter } from 'events';

export interface IOActivityMonitorOptions {
  /**
   * Task ID being monitored
   */
  taskId: string;

  /**
   * Slaver ID
   */
  slaverId: string;

  /**
   * No-activity timeout in milliseconds
   * @default 180000 (180s)
   */
  timeoutMs?: number;

  /**
   * Callback when hang detected
   */
  onHang?: (report: HangReport) => void | Promise<void>;

  /**
   * Enable HTTP health check endpoint
   * @default false
   */
  enableHealthEndpoint?: boolean;

  /**
   * HTTP server port for health endpoint
   * @default 3001
   */
  healthPort?: number;
}

export interface HangReport {
  /**
   * Report type (for message queue routing)
   */
  type: 'hang_detected';

  /**
   * Task ID
   */
  taskId: string;

  /**
   * Slaver ID
   */
  slaverId: string;

  /**
   * Last I/O activity timestamp (ISO 8601)
   */
  lastActivityAt: string;

  /**
   * Current timestamp (ISO 8601)
   */
  detectedAt: string;

  /**
   * Idle duration in seconds
   */
  idleDurationSec: number;
}

/**
 * I/O Activity Monitor
 * Monitors ProgressTracker checkpoint calls to detect Slaver hang
 */
export class IOActivityMonitor extends EventEmitter {
  private taskId: string;
  private slaverId: string;
  private timeoutMs: number;
  private onHangCallback?: (report: HangReport) => void | Promise<void>;
  private enableHealthEndpoint: boolean;
  private healthPort: number;

  // Activity tracking
  private lastActivityAt: Date = new Date();
  private timer: NodeJS.Timeout | null = null;
  private isRunning = false;

  // HTTP health server (optional)
  private healthServer: unknown | null = null; // Express app or http.Server

  constructor(options: IOActivityMonitorOptions) {
    super();
    this.taskId = options.taskId;
    this.slaverId = options.slaverId;
    this.timeoutMs = options.timeoutMs ?? 180000; // 180s default
    this.onHangCallback = options.onHang;
    this.enableHealthEndpoint = options.enableHealthEndpoint ?? false;
    this.healthPort = options.healthPort ?? 3001;
  }

  /**
   * Start monitoring
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.warn('[IOActivityMonitor] Already running');
      return;
    }

    this.isRunning = true;
    this.lastActivityAt = new Date();

    // Start timeout timer
    this.resetTimer();

    // Start health endpoint if enabled
    if (this.enableHealthEndpoint) {
      await this.startHealthEndpoint();
    }

    console.log(
      `[IOActivityMonitor] Started for ${this.taskId} (timeout: ${this.timeoutMs}ms)`
    );
  }

  /**
   * Stop monitoring
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;

    // Clear timer
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    // Stop health endpoint
    if (this.healthServer) {
      await this.stopHealthEndpoint();
    }

    console.log('[IOActivityMonitor] Stopped');
  }

  /**
   * Record I/O activity (called by ProgressTracker on checkpoint)
   * Resets hang detection timer
   */
  recordActivity(): void {
    if (!this.isRunning) {
      return;
    }

    this.lastActivityAt = new Date();
    this.resetTimer();
    this.emit('activity', { timestamp: this.lastActivityAt });
  }

  /**
   * Reset hang detection timer
   */
  private resetTimer(): void {
    // Clear existing timer
    if (this.timer) {
      clearTimeout(this.timer);
    }

    // Start new timer
    this.timer = setTimeout(() => {
      void this.handleHangDetected();
    }, this.timeoutMs);

    // Don't prevent Node.js from exiting
    this.timer.unref();
  }

  /**
   * Handle hang detection
   */
  private async handleHangDetected(): Promise<void> {
    const now = new Date();
    const idleDurationMs = now.getTime() - this.lastActivityAt.getTime();
    const idleDurationSec = Math.floor(idleDurationMs / 1000);

    const report: HangReport = {
      type: 'hang_detected',
      taskId: this.taskId,
      slaverId: this.slaverId,
      lastActivityAt: this.lastActivityAt.toISOString(),
      detectedAt: now.toISOString(),
      idleDurationSec,
    };

    console.error(
      `[IOActivityMonitor] HANG DETECTED: ${this.taskId} (idle: ${idleDurationSec}s)`
    );

    // Emit event
    this.emit('hang', report);

    // Invoke callback
    if (this.onHangCallback) {
      try {
        await this.onHangCallback(report);
      } catch (error) {
        console.error(
          `[IOActivityMonitor] onHang callback failed: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  }

  /**
   * Start HTTP health check endpoint
   */
  private async startHealthEndpoint(): Promise<void> {
    // Dynamic import to avoid loading Express if not needed
    const express = await import('express');
    const app = express.default();

    app.get('/health', (_req, res) => {
      const now = new Date();
      const idleMs = now.getTime() - this.lastActivityAt.getTime();
      const idleSec = Math.floor(idleMs / 1000);
      const isHealthy = idleSec < this.timeoutMs / 1000;

      res.status(isHealthy ? 200 : 503).json({
        status: isHealthy ? 'healthy' : 'unhealthy',
        taskId: this.taskId,
        slaverId: this.slaverId,
        lastActivityAt: this.lastActivityAt.toISOString(),
        idleDurationSec: idleSec,
        timeoutSec: Math.floor(this.timeoutMs / 1000),
      });
    });

    const server = app.listen(this.healthPort, () => {
      console.log(
        `[IOActivityMonitor] Health endpoint running at http://localhost:${this.healthPort}/health`
      );
    });

    this.healthServer = server;
  }

  /**
   * Stop HTTP health check endpoint
   */
  private async stopHealthEndpoint(): Promise<void> {
    if (!this.healthServer) {
      return;
    }

    return new Promise((resolve, reject) => {
      const server = this.healthServer as { close: (cb: (err?: Error) => void) => void };
      server.close((err) => {
        if (err) {
          reject(err);
        } else {
          console.log('[IOActivityMonitor] Health endpoint stopped');
          this.healthServer = null;
          resolve();
        }
      });
    });
  }

  /**
   * Get last activity timestamp (for debugging)
   */
  getLastActivityAt(): Date {
    return this.lastActivityAt;
  }

  /**
   * Get idle duration in seconds
   */
  getIdleDurationSec(): number {
    const now = new Date();
    const idleMs = now.getTime() - this.lastActivityAt.getTime();
    return Math.floor(idleMs / 1000);
  }
}
