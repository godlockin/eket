/**
 * TASK-633: Incremental Context Snapshot Generator
 *
 * Runtime context backup system:
 * - Triggered at 120K token threshold
 * - JSON-based filesystem storage (not SQLite)
 * - LRU cleanup (max 10 snapshots)
 * - Size limit: <500KB per snapshot
 *
 * Distinct from context-snapshot.ts (tacit knowledge / post-task retrospectives).
 */

import { writeFileSync, readdirSync, unlinkSync, statSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

import type { IncrementalSnapshot, IncrementalSnapshotMetadata } from '../types/incremental-snapshot.js';
import type { Result } from '../types/index.js';
import { EketError, EketErrorCode } from '../types/index.js';

const MAX_SNAPSHOTS = 10;
const MAX_SIZE_BYTES = 500 * 1024; // 500KB
const SNAPSHOT_DIR = 'logs/context-snapshots';

/**
 * Incremental snapshot generator for runtime context backup.
 */
export class IncrementalSnapshotGenerator {
  private readonly snapshotDir: string;
  private readonly maxSnapshots: number;
  private readonly maxSizeBytes: number;

  constructor(options?: {
    snapshotDir?: string;
    maxSnapshots?: number;
    maxSizeBytes?: number;
  }) {
    this.snapshotDir = options?.snapshotDir ?? SNAPSHOT_DIR;
    this.maxSnapshots = options?.maxSnapshots ?? MAX_SNAPSHOTS;
    this.maxSizeBytes = options?.maxSizeBytes ?? MAX_SIZE_BYTES;
  }

  /**
   * Generate incremental snapshot.
   *
   * @param data Snapshot data (timestamp auto-generated)
   * @returns Snapshot metadata with file path
   */
  generate(
    data: Omit<IncrementalSnapshot, 'timestamp'>
  ): Result<IncrementalSnapshotMetadata> {
    const timestamp = Date.now();
    const snapshot: IncrementalSnapshot = { ...data, timestamp };

    // Ensure directory exists
    if (!existsSync(this.snapshotDir)) {
      try {
        mkdirSync(this.snapshotDir, { recursive: true });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        return {
          success: false,
          error: new EketError(
            EketErrorCode.ENTRY_CREATE_FAILED,
            `Failed to create snapshot directory: ${msg}`
          ),
        };
      }
    }

    // Validate size before writing
    const jsonStr = JSON.stringify(snapshot, null, 2);
    const sizeBytes = Buffer.byteLength(jsonStr, 'utf-8');

    if (sizeBytes > this.maxSizeBytes) {
      return {
        success: false,
        error: new EketError(
          EketErrorCode.ENTRY_CREATE_FAILED,
          `Snapshot exceeds size limit: ${sizeBytes} > ${this.maxSizeBytes} bytes`
        ),
      };
    }

    // Write snapshot
    const filename = `${timestamp}.json`;
    const filePath = join(this.snapshotDir, filename);

    try {
      writeFileSync(filePath, jsonStr, 'utf-8');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      return {
        success: false,
        error: new EketError(
          EketErrorCode.ENTRY_CREATE_FAILED,
          `Failed to write snapshot: ${msg}`
        ),
      };
    }

    // LRU cleanup
    const cleanupResult = this.cleanup();
    if (!cleanupResult.success) {
      // Non-fatal: snapshot written successfully, cleanup failed
      console.warn(`[IncrementalSnapshotGenerator] Cleanup failed: ${cleanupResult.error?.message}`);
    }

    return {
      success: true,
      data: {
        filePath,
        sizeBytes,
        createdAt: timestamp,
      },
    };
  }

  /**
   * LRU cleanup: keep only the most recent N snapshots.
   *
   * @returns Result with count of deleted files
   */
  cleanup(): Result<{ deletedCount: number }> {
    if (!existsSync(this.snapshotDir)) {
      return { success: true, data: { deletedCount: 0 } };
    }

    try {
      const files = readdirSync(this.snapshotDir)
        .filter(f => f.endsWith('.json'))
        .map(f => {
          const fullPath = join(this.snapshotDir, f);
          try {
            const stats = statSync(fullPath);
            return {
              path: fullPath,
              mtime: stats.mtimeMs,
            };
          } catch {
            return null;
          }
        })
        .filter((entry): entry is { path: string; mtime: number } => entry !== null)
        .sort((a, b) => b.mtime - a.mtime); // Newest first

      const toDelete = files.slice(this.maxSnapshots);
      let deletedCount = 0;

      for (const file of toDelete) {
        try {
          unlinkSync(file.path);
          deletedCount++;
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : 'Unknown error';
          console.warn(`[IncrementalSnapshotGenerator] Failed to delete ${file.path}: ${msg}`);
        }
      }

      return { success: true, data: { deletedCount } };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      return {
        success: false,
        error: new EketError(
          EketErrorCode.ENTRY_DELETE_FAILED,
          `Cleanup failed: ${msg}`
        ),
      };
    }
  }

  /**
   * List all snapshots (newest first).
   *
   * @returns Array of snapshot metadata
   */
  list(): Result<IncrementalSnapshotMetadata[]> {
    if (!existsSync(this.snapshotDir)) {
      return { success: true, data: [] };
    }

    try {
      const files = readdirSync(this.snapshotDir)
        .filter(f => f.endsWith('.json'))
        .map(f => {
          const fullPath = join(this.snapshotDir, f);
          try {
            const stats = statSync(fullPath);
            return {
              filePath: fullPath,
              sizeBytes: stats.size,
              createdAt: stats.mtimeMs,
            };
          } catch {
            return null;
          }
        })
        .filter((entry): entry is IncrementalSnapshotMetadata => entry !== null)
        .sort((a, b) => b.createdAt - a.createdAt);

      return { success: true, data: files };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      return {
        success: false,
        error: new EketError(
          EketErrorCode.ENTRY_QUERY_FAILED,
          `Failed to list snapshots: ${msg}`
        ),
      };
    }
  }
}

/**
 * Factory function for creating incremental snapshot generator.
 */
export function createIncrementalSnapshotGenerator(
  options?: {
    snapshotDir?: string;
    maxSnapshots?: number;
    maxSizeBytes?: number;
  }
): IncrementalSnapshotGenerator {
  return new IncrementalSnapshotGenerator(options);
}
