/**
 * TASK-633: Incremental Context Snapshot Types
 *
 * Runtime context backup triggered at 120K token threshold.
 * Distinct from tacit knowledge snapshots (post-task retrospectives).
 */

export interface IncrementalSnapshot {
  /** Unix timestamp (ms) */
  timestamp: number;

  /** Current ticket ID */
  taskId: string;

  /** Conversation turn count */
  turnCount: number;

  /** Estimated token count */
  estimatedTokens: number;

  /** Critical file paths (no content) */
  criticalFiles: string[];

  /** Last 5 message summaries (100 chars each) */
  lastMessages: string[];
}

export interface IncrementalSnapshotMetadata {
  /** Snapshot file path */
  filePath: string;

  /** File size in bytes */
  sizeBytes: number;

  /** Creation timestamp */
  createdAt: number;
}
