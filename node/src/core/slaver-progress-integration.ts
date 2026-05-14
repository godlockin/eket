/**
 * EKET Framework - Slaver Progress Integration
 *
 * TASK-X02: Integrate ProgressTracker into Slaver workflow.
 *
 * This module provides a singleton ProgressTracker instance accessible
 * throughout the Slaver execution lifecycle, enabling automatic checkpoint
 * recording at key milestones without manual intervention.
 *
 * Key Features:
 * - Lazy initialization on first task claim
 * - Automatic cleanup on task completion
 * - Error-tolerant checkpoint calls (non-blocking)
 * - Global singleton accessible to all commands
 *
 * Usage:
 * ```typescript
 * // In claim command:
 * await initializeProgressTracker(taskId, slaverId);
 *
 * // In any command during task execution:
 * await safeCheckpoint('analysis_done', { artifact: 'analysis-report.md' });
 *
 * // On task completion:
 * await closeProgressTracker();
 * ```
 */

import { ProgressTracker } from './progress-tracker.js';
import { CheckpointMetadata, TaskPhase, type ResumeContext } from '../types/progress-tracker.js';

/**
 * Global singleton ProgressTracker instance
 */
let globalTracker: ProgressTracker | null = null;

/**
 * Flag to enable/disable progress tracking (controlled by env var)
 */
const ENABLE_TRACKING = process.env.ENABLE_PROGRESS_TRACKING !== 'false';

/**
 * Initialize ProgressTracker for a new task
 *
 * Called by task:claim command after successfully claiming a ticket.
 *
 * @param taskId - Ticket ID (e.g., "TASK-X02")
 * @param slaverId - Slaver instance ID (e.g., "slaver_1234567890_abc123")
 * @param options - Optional initialization options (TASK-X06: resume support)
 */
export async function initializeProgressTracker(
  taskId: string,
  slaverId: string,
  options?: {
    resumeFrom?: ResumeContext;
  }
): Promise<void> {
  if (!ENABLE_TRACKING) {
    console.log('[ProgressTracker] Disabled via ENABLE_PROGRESS_TRACKING=false');
    return;
  }

  // Close existing tracker if present (defensive cleanup)
  if (globalTracker) {
    console.warn('[ProgressTracker] Previous tracker not closed, closing now');
    await closeProgressTracker();
  }

  try {
    globalTracker = new ProgressTracker({
      taskId,
      slaverId,
      flushIntervalMs: 30000, // 30s async flush
      outputDir: `jira/tickets/${taskId}`,
      progressFileName: 'progress.md',
      resumeFrom: options?.resumeFrom, // TASK-X06: Pass resume context
    });

    // Record task_claimed checkpoint (only if not resuming)
    if (!options?.resumeFrom) {
      await safeCheckpoint('task_claimed', {
        notes: `Task ${taskId} claimed by ${slaverId}`,
      });
    }

    console.log(`[ProgressTracker] Initialized for ${taskId} (slaver: ${slaverId})`);
  } catch (error) {
    // Non-critical: log warning but don't block task execution
    console.warn(
      `[ProgressTracker] Initialization failed (non-critical): ${error instanceof Error ? error.message : String(error)}`
    );
    globalTracker = null;
  }
}

/**
 * Record a checkpoint (error-tolerant wrapper)
 *
 * Safe to call from any command - failures will be logged but won't throw.
 *
 * @param phase - Phase identifier (e.g., "analysis_done", "ac_1_done")
 * @param metadata - Optional checkpoint metadata
 */
export async function safeCheckpoint(
  phase: TaskPhase | string,
  metadata: CheckpointMetadata = {}
): Promise<void> {
  if (!ENABLE_TRACKING || !globalTracker) {
    return;
  }

  try {
    await globalTracker.checkpoint(phase, metadata);
  } catch (error) {
    // Log warning but don't throw (AC-4: error tolerance)
    console.warn(
      `[ProgressTracker] Checkpoint failed (non-critical): ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Start a new phase
 *
 * @param phase - Phase to start
 * @param metadata - Optional metadata
 */
export async function startPhase(
  phase: TaskPhase | string,
  metadata?: CheckpointMetadata
): Promise<void> {
  if (!ENABLE_TRACKING || !globalTracker) {
    return;
  }

  try {
    await globalTracker.startPhase(phase, metadata);
  } catch (error) {
    console.warn(
      `[ProgressTracker] startPhase failed (non-critical): ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Complete current phase
 *
 * @param phase - Phase to complete
 * @param metadata - Optional metadata
 */
export async function completePhase(
  phase: TaskPhase | string,
  metadata?: CheckpointMetadata
): Promise<void> {
  if (!ENABLE_TRACKING || !globalTracker) {
    return;
  }

  try {
    await globalTracker.completePhase(phase, metadata);
  } catch (error) {
    console.warn(
      `[ProgressTracker] completePhase failed (non-critical): ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Complete an Acceptance Criteria
 *
 * @param acId - AC identifier (e.g., "1", "2", "AC-1")
 * @param metadata - Optional metadata
 */
export async function completeAC(acId: string, metadata?: CheckpointMetadata): Promise<void> {
  if (!ENABLE_TRACKING || !globalTracker) {
    return;
  }

  try {
    await globalTracker.completeAC(acId, metadata);
  } catch (error) {
    console.warn(
      `[ProgressTracker] completeAC failed (non-critical): ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Close ProgressTracker and flush remaining checkpoints
 *
 * Called by submit-pr command or when task is completed/abandoned.
 */
export async function closeProgressTracker(): Promise<void> {
  if (!globalTracker) {
    return;
  }

  try {
    await globalTracker.close();
    console.log('[ProgressTracker] Closed successfully');
  } catch (error) {
    console.warn(
      `[ProgressTracker] Close failed (non-critical): ${error instanceof Error ? error.message : String(error)}`
    );
  } finally {
    globalTracker = null;
  }
}

/**
 * Get current ProgressTracker instance (for debugging/testing)
 */
export function getProgressTracker(): ProgressTracker | null {
  return globalTracker;
}

/**
 * Check if ProgressTracker is currently active
 */
export function isTrackingActive(): boolean {
  return ENABLE_TRACKING && globalTracker !== null;
}
