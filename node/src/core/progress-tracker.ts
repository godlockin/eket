/**
 * EKET Framework - ProgressTracker
 *
 * Tracks Slaver execution progress with checkpoint-based recovery.
 *
 * Key Features:
 * - Async flush (every 30s) to reduce I/O overhead
 * - Sync flush on critical checkpoints (analysis_done, ready_for_pr)
 * - Atomic writes to prevent corruption on crash
 * - Markdown format for human readability and Git diff friendliness
 *
 * Usage:
 * ```typescript
 * const tracker = new ProgressTracker({ taskId: 'TASK-001', slaverId: 'slaver-005' });
 * await tracker.startPhase(TaskPhase.ANALYSIS);
 * await tracker.checkpoint('analysis_done', { artifact: 'analysis-report.md' });
 * await tracker.completePhase(TaskPhase.ANALYSIS);
 * await tracker.close(); // Clean up timer
 * ```
 */

import fs from 'fs/promises';
import path from 'path';
import { atomicWrite } from '../utils/atomic-write.js';
import {
  Checkpoint,
  CheckpointMetadata,
  DEFAULT_SYNC_PHASES,
  ProgressSnapshot,
  ProgressTrackerOptions,
  TaskPhase,
} from '../types/progress-tracker.js';

export class ProgressTracker {
  private taskId: string;
  private slaverId: string;
  private flushIntervalMs: number;
  private outputDir: string;
  private progressFilePath: string;
  private syncPhases: Set<string>;

  // In-memory state
  private checkpoints: Checkpoint[] = [];
  private currentPhase: TaskPhase | string = TaskPhase.ANALYSIS;
  private completedPhases: Set<TaskPhase | string> = new Set();
  private nextSteps: string[] = [];
  private blockers: string[] = [];

  // Async flush timer
  private flushTimer: NodeJS.Timeout | null = null;

  constructor(options: ProgressTrackerOptions) {
    this.taskId = options.taskId;
    this.slaverId = options.slaverId;
    this.flushIntervalMs = options.flushIntervalMs ?? 30000; // 30s default

    // Resolve output directory
    const baseDir = options.outputDir ?? `jira/tickets/${this.taskId}`;
    this.outputDir = path.resolve(process.cwd(), baseDir);
    this.progressFilePath = path.join(this.outputDir, options.progressFileName ?? 'progress.md');

    // Sync flush phases
    this.syncPhases = new Set(options.syncPhases ?? DEFAULT_SYNC_PHASES);

    // Start auto-flush timer
    this.startFlushTimer();
  }

  /**
   * Start a new phase
   */
  async startPhase(phase: TaskPhase | string, metadata?: CheckpointMetadata): Promise<void> {
    this.currentPhase = phase;
    await this.checkpoint(`${phase}_start`, metadata ?? {});
  }

  /**
   * Complete current phase
   */
  async completePhase(phase: TaskPhase | string, metadata?: CheckpointMetadata): Promise<void> {
    this.completedPhases.add(phase);
    await this.checkpoint(`${phase}_done`, metadata ?? {});
  }

  /**
   * Complete an Acceptance Criteria
   */
  async completeAC(acId: string, metadata?: CheckpointMetadata): Promise<void> {
    await this.checkpoint(`ac_${acId}_done`, {
      acId,
      ...metadata,
    });
  }

  /**
   * Record a checkpoint (phase milestone)
   *
   * @param phase - Phase identifier (e.g., "analysis_done", "ac_1_done")
   * @param metadata - Additional checkpoint data
   */
  async checkpoint(phase: string, metadata: CheckpointMetadata): Promise<void> {
    const checkpoint: Checkpoint = {
      timestamp: new Date().toISOString(),
      phase,
      metadata,
    };

    this.checkpoints.push(checkpoint);

    // Sync flush for critical phases
    if (this.syncPhases.has(phase)) {
      await this.flush();
    }
  }

  /**
   * Add note to progress log
   */
  async addNote(note: string): Promise<void> {
    await this.checkpoint('note', { notes: note });
  }

  /**
   * Add next step
   */
  addNextStep(step: string): void {
    this.nextSteps.push(step);
  }

  /**
   * Add blocker
   */
  addBlocker(blocker: string): void {
    this.blockers.push(blocker);
  }

  /**
   * Flush checkpoints to disk (async write)
   */
  async flush(): Promise<void> {
    // Always write, even if not dirty (for initial empty state)
    try {
      const snapshot: ProgressSnapshot = {
        taskId: this.taskId,
        slaverId: this.slaverId,
        currentPhase: this.currentPhase,
        lastUpdate: new Date().toISOString(),
        checkpoints: this.checkpoints,
        completedPhases: this.completedPhases,
        nextSteps: this.nextSteps,
        blockers: this.blockers,
      };

      const markdown = this.renderMarkdown(snapshot);
      await atomicWrite(this.progressFilePath, markdown);
    } catch (error) {
      // Non-critical error, log but don't crash Slaver
      console.warn(
        `[ProgressTracker] Flush failed for ${this.taskId}: ${error instanceof Error ? error.message : String(error)}`
      );

      // Log to failure log for Master monitoring
      await this.logFlushFailure(error);
    }
  }

  /**
   * Render progress snapshot to Markdown
   */
  private renderMarkdown(snapshot: ProgressSnapshot): string {
    const lines: string[] = [];

    // Header
    lines.push(`# Task Progress: ${snapshot.taskId}`);
    lines.push('');
    lines.push(`**Last Update**: ${snapshot.lastUpdate}`);
    lines.push(`**Slaver**: ${snapshot.slaverId}`);
    lines.push(`**Current Phase**: \`${snapshot.currentPhase}\``);
    lines.push('');

    // Completed checkpoints (filter notes)
    lines.push('## Completed');
    const completedCheckpoints = snapshot.checkpoints.filter(
      (cp) => cp.phase !== 'note' && !cp.phase.endsWith('_start')
    );

    if (completedCheckpoints.length === 0) {
      lines.push('- *(No completed checkpoints yet)*');
    } else {
      for (const cp of completedCheckpoints) {
        const timestamp = new Date(cp.timestamp).toLocaleString('en-US', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        });

        // Clean phase name (remove _done suffix if present)
        const phaseName = cp.phase.replace(/_done$/, '');
        let line = `- [x] ${phaseName} (${timestamp})`;

        // Append metadata
        if (cp.metadata.artifact) {
          line += `\n  - artifact: ${cp.metadata.artifact}`;
        }
        if (cp.metadata.files && cp.metadata.files.length > 0) {
          line += `\n  - files: ${cp.metadata.files.join(', ')}`;
        }
        if (cp.metadata.tests) {
          const status = cp.metadata.tests.passed ? '✅' : '❌';
          line += `\n  - test: ${status}`;
        }
        if (cp.metadata.commit) {
          line += `\n  - commit: ${cp.metadata.commit}`;
        }

        lines.push(line);
      }
    }

    lines.push('');

    // Current work (in-progress checkpoints)
    const inProgressCheckpoints = snapshot.checkpoints.filter(
      (cp) => cp.phase.endsWith('_start') && !snapshot.completedPhases.has(cp.phase.replace(/_start$/, ''))
    );

    if (inProgressCheckpoints.length > 0) {
      lines.push('## Current Work');
      for (const cp of inProgressCheckpoints) {
        const phase = cp.phase.replace(/_start$/, '');
        let line = `- [ ] ${phase}`;

        if (cp.metadata.percentage !== undefined) {
          line += ` (${cp.metadata.percentage}%)`;
        }

        lines.push(line);
      }
      lines.push('');
    }

    // Next steps
    if (snapshot.nextSteps.length > 0) {
      lines.push('## Next Steps');
      for (const step of snapshot.nextSteps) {
        lines.push(`- [ ] ${step}`);
      }
      lines.push('');
    }

    // Blockers
    if (snapshot.blockers.length > 0) {
      lines.push('## Blockers');
      for (const blocker of snapshot.blockers) {
        lines.push(`- ⚠️ ${blocker}`);
      }
      lines.push('');
    }

    // Notes (recent 5)
    const noteCheckpoints = snapshot.checkpoints.filter((cp) => cp.phase === 'note').slice(-5);
    if (noteCheckpoints.length > 0) {
      lines.push('## Recent Notes');
      for (const cp of noteCheckpoints) {
        const time = new Date(cp.timestamp).toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        });
        lines.push(`- ${time} - ${cp.metadata.notes ?? '(empty note)'}`);
      }
      lines.push('');
    }

    // Footer
    lines.push('---');
    lines.push('*Generated by ProgressTracker*');

    return lines.join('\n');
  }

  /**
   * Start auto-flush timer
   */
  private startFlushTimer(): void {
    this.flushTimer = setInterval(() => {
      void this.flush();
    }, this.flushIntervalMs);

    // Don't prevent Node.js from exiting
    this.flushTimer.unref();
  }

  /**
   * Stop auto-flush timer
   */
  private stopFlushTimer(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }

  /**
   * Log flush failure to file (for Master monitoring)
   */
  private async logFlushFailure(error: unknown): Promise<void> {
    try {
      const logDir = path.resolve(process.cwd(), '.eket/logs');
      const logPath = path.join(logDir, 'checkpoint-failures.log');

      await fs.mkdir(logDir, { recursive: true });

      const logEntry = `[${new Date().toISOString()}] Task: ${this.taskId}, Error: ${error instanceof Error ? error.message : String(error)}\n`;

      await fs.appendFile(logPath, logEntry, 'utf-8');
    } catch {
      // Ignore log failures (already in error path)
    }
  }

  /**
   * Close tracker and flush remaining data
   */
  async close(): Promise<void> {
    this.stopFlushTimer();
    await this.flush();
  }

  /**
   * Get current snapshot (for debugging)
   */
  getSnapshot(): ProgressSnapshot {
    return {
      taskId: this.taskId,
      slaverId: this.slaverId,
      currentPhase: this.currentPhase,
      lastUpdate: new Date().toISOString(),
      checkpoints: this.checkpoints,
      completedPhases: this.completedPhases,
      nextSteps: this.nextSteps,
      blockers: this.blockers,
    };
  }
}
