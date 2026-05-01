/**
 * TASK-199: TaskCheckpoint — RunState断点续传 (SQLite持久化)
 *
 * 借鉴 openai-agents-python RunState 三层结构：
 *   - agentFacingItems: 模型视图
 *   - fullHistoryItems: 完整历史（含工具调用/guardrail）
 *   - executedToolCalls: 已执行 tool_call_id（幂等去重）
 *
 * CAS (Compare-And-Swap) on version field 防多Slaver并发覆盖。
 */

import type Database from 'better-sqlite3';

import type { Result, TaskCheckpoint, TaskCheckpointRow } from '../types/index.js';
import { EketError, EketErrorCode } from '../types/index.js';

// ============================================================================
// CAS Error
// ============================================================================

export class CheckpointCASError extends Error {
  constructor(
    public readonly taskId: string,
    public readonly expectedVersion: number,
    public readonly actualVersion: number
  ) {
    super(
      `CAS conflict for task ${taskId}: expected version ${expectedVersion}, got ${actualVersion}`
    );
    this.name = 'CheckpointCASError';
  }
}

// ============================================================================
// TaskCheckpointStore
// ============================================================================

export class TaskCheckpointStore {
  constructor(private readonly db: Database.Database) {}

  /**
   * 保存检查点（CAS版本控制）
   *
   * - 首次保存（version=0）：INSERT
   * - 后续更新：UPDATE WHERE version = expectedVersion，然后递增
   * - 若 UPDATE 影响行数为0（版本不匹配），抛出 CheckpointCASError
   */
  saveCheckpoint(checkpoint: TaskCheckpoint): Result<void> {
    try {
      const now = Date.now();
      const data = JSON.stringify(checkpoint);

      if (checkpoint.version === 0) {
        // 首次插入（version 0 → 1）
        const stmt = this.db.prepare(`
          INSERT INTO task_checkpoints (task_id, data, version, updated_at)
          VALUES (?, ?, 1, ?)
          ON CONFLICT(task_id) DO NOTHING
        `);
        const info = stmt.run(checkpoint.taskId, data, now);

        if (info.changes === 0) {
          // Already exists — must use CAS update path
          return this._casUpdate(checkpoint, data, now);
        }
      } else {
        return this._casUpdate(checkpoint, data, now);
      }

      return { success: true, data: undefined };
    } catch (e: unknown) {
      if (e instanceof CheckpointCASError) {
        return { success: false, error: e.message, casConflict: true } as unknown as Result<void>;
      }
      return {
        success: false,
        error: new EketError(
          EketErrorCode.SQLITE_OPERATION_FAILED,
          `Failed to save checkpoint: ${(e as Error).message}`
        ),
      };
    }
  }

  private _casUpdate(checkpoint: TaskCheckpoint, data: string, now: number): Result<void> {
    const newVersion = checkpoint.version + 1;
    const stmt = this.db.prepare(`
      UPDATE task_checkpoints
      SET data = ?, version = ?, updated_at = ?
      WHERE task_id = ? AND version = ?
    `);
    const info = stmt.run(data, newVersion, now, checkpoint.taskId, checkpoint.version);

    if (info.changes === 0) {
      // CAS conflict — fetch current version for better error message
      const current = this.db
        .prepare('SELECT version FROM task_checkpoints WHERE task_id = ?')
        .get(checkpoint.taskId) as { version: number } | undefined;

      throw new CheckpointCASError(
        checkpoint.taskId,
        checkpoint.version,
        current?.version ?? -1
      );
    }

    return { success: true, data: undefined };
  }

  /**
   * 加载检查点
   */
  loadCheckpoint(taskId: string): Result<TaskCheckpoint | null> {
    try {
      const row = this.db
        .prepare('SELECT * FROM task_checkpoints WHERE task_id = ?')
        .get(taskId) as TaskCheckpointRow | undefined;

      if (!row) {
        return { success: true, data: null };
      }

      const checkpoint = JSON.parse(row.data) as TaskCheckpoint;
      // Sync version from DB (source of truth)
      checkpoint.version = row.version;
      return { success: true, data: checkpoint };
    } catch (e: unknown) {
      return {
        success: false,
        error: new EketError(
          EketErrorCode.SQLITE_OPERATION_FAILED,
          `Failed to load checkpoint: ${(e as Error).message}`
        ),
      };
    }
  }

  /**
   * 删除检查点（任务完成后清理）
   */
  deleteCheckpoint(taskId: string): Result<void> {
    try {
      this.db.prepare('DELETE FROM task_checkpoints WHERE task_id = ?').run(taskId);
      return { success: true, data: undefined };
    } catch (e: unknown) {
      return {
        success: false,
        error: new EketError(
          EketErrorCode.SQLITE_OPERATION_FAILED,
          `Failed to delete checkpoint: ${(e as Error).message}`
        ),
      };
    }
  }

  /**
   * 幂等检查：该 tool_call_id 是否已执行过？
   * Resume时跳过已执行的工具调用，返回缓存结果。
   */
  isToolCallAlreadyExecuted(taskId: string, toolCallId: string): Result<boolean> {
    const result = this.loadCheckpoint(taskId);
    if (!result.success) {return result as Result<boolean>;}
    if (!result.data) {return { success: true, data: false };}
    return {
      success: true,
      data: result.data.executedToolCalls.includes(toolCallId),
    };
  }

  /**
   * 记录工具调用已执行（幂等写入 executedToolCalls）
   */
  recordToolCallExecuted(taskId: string, toolCallId: string): Result<void> {
    const loaded = this.loadCheckpoint(taskId);
    if (!loaded.success) {return loaded as Result<void>;}
    if (!loaded.data) {
      return {
        success: false,
        error: new EketError(
          EketErrorCode.SQLITE_OPERATION_FAILED,
          `Checkpoint not found for task ${taskId}`
        ),
      };
    }

    const checkpoint = loaded.data;
    if (!checkpoint.executedToolCalls.includes(toolCallId)) {
      checkpoint.executedToolCalls.push(toolCallId);
      return this.saveCheckpoint(checkpoint);
    }
    return { success: true, data: undefined };
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createTaskCheckpointStore(db: Database.Database): TaskCheckpointStore {
  return new TaskCheckpointStore(db);
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * 创建空白 TaskCheckpoint
 */
export function createEmptyCheckpoint(taskId: string): TaskCheckpoint {
  const now = Date.now();
  return {
    taskId,
    stepIndex: 0,
    agentFacingItems: [],
    fullHistoryItems: [],
    executedToolCalls: [],
    version: 0,
    createdAt: now,
    updatedAt: now,
  };
}
