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

import { EventEmitter } from 'events';
import fs from 'fs/promises';
import path from 'path';

import {
  Checkpoint,
  CheckpointMetadata,
  DEFAULT_SYNC_PHASES,
  ProgressSnapshot,
  ProgressTrackerOptions,
  TaskPhase,
} from '../types/progress-tracker.js';
import { atomicWrite } from '../utils/atomic-write.js';
import { execFileNoThrow } from '../utils/execFileNoThrow.js';

export class ProgressTracker extends EventEmitter {
  private taskId: string;
  private slaverId: string;
  private flushIntervalMs: number;
  private outputDir: string;
  private progressFilePath: string;
  private syncPhases: Set<string>;
  private gitEnabled: boolean;
  private checkpointBranch: string;

  // In-memory state
  private checkpoints: Checkpoint[] = [];
  private currentPhase: TaskPhase | string = TaskPhase.ANALYSIS;
  private completedPhases: Set<TaskPhase | string> = new Set();
  private nextSteps: string[] = [];
  private blockers: string[] = [];

  // Async flush timer
  private flushTimer: NodeJS.Timeout | null = null;

  constructor(options: ProgressTrackerOptions) {
    super(); // Initialize EventEmitter
    this.taskId = options.taskId;
    this.slaverId = options.slaverId;
    this.flushIntervalMs = options.flushIntervalMs ?? 30000; // 30s default

    // Resolve output directory
    const baseDir = options.outputDir ?? `jira/tickets/${this.taskId}`;
    this.outputDir = path.resolve(process.cwd(), baseDir);
    this.progressFilePath = path.join(this.outputDir, options.progressFileName ?? 'progress.md');

    // Sync flush phases
    this.syncPhases = new Set(options.syncPhases ?? DEFAULT_SYNC_PHASES);

    // Git checkpoint config
    this.gitEnabled = options.gitEnabled ?? (process.env.ENABLE_GIT_CHECKPOINT !== 'false');
    this.checkpointBranch = `checkpoint/${this.taskId}`;

    // Resume from checkpoint (TASK-X06, AC-4)
    if (options.resumeFrom) {
      this.completedPhases = options.resumeFrom.completedPhases;
      this.currentPhase = options.resumeFrom.currentPhase;
      this.checkpoints = options.resumeFrom.checkpoints;
      console.log(
        `[ProgressTracker] Resumed from checkpoint (${this.completedPhases.size} phases completed)`
      );
    }

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
    // Skip already completed phases (TASK-X06, AC-4)
    if (this.completedPhases.has(phase)) {
      console.log(`[ProgressTracker] Skipping already completed phase: ${phase}`);
      return;
    }

    const checkpoint: Checkpoint = {
      timestamp: new Date().toISOString(),
      phase,
      metadata,
    };

    this.checkpoints.push(checkpoint);

    // Emit checkpoint event for IOActivityMonitor (TASK-AUTO-05)
    this.emit('checkpoint', { phase, metadata });

    // Sync flush for critical phases
    if (this.syncPhases.has(phase)) {
      await this.flush();

      // Git commit + push (non-blocking)
      if (this.gitEnabled) {
        await this.gitCommitCheckpoint(phase, metadata).catch((error) => {
          console.warn(
            `[ProgressTracker] Git commit failed for ${phase}: ${error instanceof Error ? error.message : String(error)}`
          );
        });
      }
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
   * Git commit checkpoint to checkpoint branch
   * AC-1: Auto commit on critical checkpoint
   * AC-3: Structured commit message with metadata
   */
  private async gitCommitCheckpoint(phase: string, metadata?: CheckpointMetadata): Promise<void> {
    // 1. Ensure checkpoint branch exists
    await this.ensureCheckpointBranch();

    // 2. Stage progress.md
    const result = await execFileNoThrow('git', ['add', this.progressFilePath]);
    if (result.status !== 0) {
      throw new Error(`git add failed: ${result.stderr}`);
    }

    // 3. Commit with structured message (AC-3)
    const message = this.buildCommitMessage(phase, metadata);
    const commitResult = await execFileNoThrow('git', ['commit', '-m', message, '--allow-empty']);
    if (commitResult.status !== 0) {
      throw new Error(`git commit failed: ${commitResult.stderr}`);
    }

    console.log(`[ProgressTracker] Git commit: ${this.checkpointBranch} @ ${phase}`);

    // 4. Push to remote (non-blocking) (AC-2)
    void this.gitPushCheckpoint().catch((error) => {
      console.warn(
        `[ProgressTracker] Git push failed: ${error instanceof Error ? error.message : String(error)}`
      );
    });
  }

  /**
   * Ensure checkpoint branch exists
   * Creates branch if needed, switches to it
   */
  private async ensureCheckpointBranch(): Promise<void> {
    // Check if branch exists locally
    const listResult = await execFileNoThrow('git', ['branch', '--list', this.checkpointBranch]);

    if (!listResult.stdout.trim()) {
      // Branch doesn't exist, create it
      const createResult = await execFileNoThrow('git', ['checkout', '-b', this.checkpointBranch]);
      if (createResult.status !== 0) {
        throw new Error(`Failed to create checkpoint branch: ${createResult.stderr}`);
      }
    } else {
      // Branch exists, switch to it
      const checkoutResult = await execFileNoThrow('git', ['checkout', this.checkpointBranch]);
      if (checkoutResult.status !== 0) {
        throw new Error(`Failed to checkout checkpoint branch: ${checkoutResult.stderr}`);
      }
    }
  }

  /**
   * Build structured commit message
   * AC-3: Include JSON metadata (phase / slaver_id / timestamp / AC)
   */
  private buildCommitMessage(phase: string, metadata?: CheckpointMetadata): string {
    const meta = {
      phase,
      slaver_id: this.slaverId,
      timestamp: new Date().toISOString(),
      task_id: this.taskId,
      ...(metadata ?? {}),
    };

    return `checkpoint: ${phase}\n\n${JSON.stringify(meta, null, 2)}`;
  }

  /**
   * Push checkpoint branch to remote
   * AC-2: Push to remote checkpoint/<task-id> branch
   * AC-4: Non-blocking, failure does not throw
   */
  private async gitPushCheckpoint(): Promise<void> {
    const result = await execFileNoThrow(
      'git',
      ['push', '-u', 'origin', this.checkpointBranch, '--force-with-lease'],
      { timeout: 60000 } // 60s timeout for network operations
    );

    if (result.status !== 0) {
      throw new Error(`git push failed: ${result.stderr}`);
    }

    console.log(`[ProgressTracker] Git pushed: ${this.checkpointBranch}`);
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
