/**
 * EKET Framework - Checkpoint GC Types
 *
 * Type definitions for checkpoint:gc command (TASK-X07)
 */

/**
 * GC command options
 */
export interface GCOptions {
  dryRun?: boolean;
  execute?: boolean;
  olderThan?: string; // e.g., "7d", "14d", "30d"
}

/**
 * Checkpoint branch metadata
 */
export interface CheckpointBranch {
  name: string; // e.g., "checkpoint/TASK-640"
  taskId: string; // e.g., "TASK-640"
  lastUpdate: Date; // Last commit timestamp
  eligible: boolean; // Eligible for deletion
  reason: string; // Human-readable reason (e.g., "merged 10d ago", "PR #123 not merged")
}

/**
 * Task status (extracted from ticket markdown)
 */
export type TaskStatus = 'todo' | 'in_progress' | 'analysis_review' | 'approved' | 'review' | 'done' | 'cancelled' | null;

/**
 * PR status (from GitHub API)
 */
export type PRStatus = 'merged' | string | false; // 'merged' | PR number | false (no PR)
