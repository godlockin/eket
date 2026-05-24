/**
 * EKET Framework - ProgressTracker Types
 *
 * Type definitions for Slaver execution progress tracking.
 * Supports checkpoint-based recovery mechanism.
 */

/**
 * Task execution phases (lifecycle)
 */
export enum TaskPhase {
  /** Initial analysis phase */
  ANALYSIS = 'analysis',
  /** Design and planning phase */
  DESIGN = 'design',
  /** Implementation phase */
  IMPLEMENTATION = 'implementation',
  /** Testing phase */
  TESTING = 'testing',
  /** Documentation phase */
  DOCUMENTATION = 'documentation',
  /** Ready for PR submission */
  READY_FOR_PR = 'ready_for_pr',
}

/**
 * Checkpoint metadata (extensible per phase)
 */
export interface CheckpointMetadata {
  /** Artifact files produced */
  artifact?: string;
  /** Files modified/created */
  files?: string[];
  /** Test execution results */
  tests?: {
    passed: boolean;
    command?: string;
    exitCode?: number;
  };
  /** Git commit hash (if committed) */
  commit?: string;
  /** Custom notes */
  notes?: string;
  /** Completion percentage (0-100) */
  percentage?: number;
  /** Acceptance Criteria ID */
  acId?: string;
  [key: string]: unknown;
}

/**
 * Single checkpoint record
 */
export interface Checkpoint {
  /** ISO8601 timestamp */
  timestamp: string;
  /** Phase identifier */
  phase: TaskPhase | string;
  /** Metadata for this checkpoint */
  metadata: CheckpointMetadata;
}

/**
 * Progress snapshot (rendered to markdown)
 */
export interface ProgressSnapshot {
  /** Task ID */
  taskId: string;
  /** Slaver instance ID */
  slaverId: string;
  /** Current active phase */
  currentPhase: TaskPhase | string;
  /** Last update timestamp */
  lastUpdate: string;
  /** All checkpoints (in-memory buffer) */
  checkpoints: Checkpoint[];
  /** Completed phases */
  completedPhases: Set<TaskPhase | string>;
  /** Next steps (user-defined) */
  nextSteps: string[];
  /** Known blockers */
  blockers: string[];
}

/**
 * Resume context loaded from checkpoint
 */
export interface ResumeContext {
  /** Already completed phases */
  completedPhases: Set<TaskPhase | string>;
  /** Current phase at resume time */
  currentPhase: TaskPhase | string;
  /** Existing checkpoints */
  checkpoints: Checkpoint[];
}

/**
 * ProgressTracker constructor options
 */
export interface ProgressTrackerOptions {
  /** Task ID */
  taskId: string;
  /** Slaver instance ID (e.g., "slaver-006") */
  slaverId: string;
  /** Auto-flush interval in ms (default: 30000) */
  flushIntervalMs?: number;
  /** Output directory (default: jira/tickets/<taskId>/) */
  outputDir?: string;
  /** Progress file name (default: progress.md) */
  progressFileName?: string;
  /** Sync flush phases (trigger immediate write) */
  syncPhases?: Array<TaskPhase | string>;
  /** Enable git commit + push checkpoint (default: true) */
  gitEnabled?: boolean;
  /** Resume from existing checkpoint (TASK-X06) */
  resumeFrom?: ResumeContext;
}

/**
 * Phases that trigger immediate flush (critical checkpoints)
 */
export const DEFAULT_SYNC_PHASES: Array<TaskPhase | string> = [
  TaskPhase.ANALYSIS,
  TaskPhase.DESIGN,
  TaskPhase.READY_FOR_PR,
  'tests_passed',
];
