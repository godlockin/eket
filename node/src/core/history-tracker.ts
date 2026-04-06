/**
 * History Tracker Module
 * 用于追踪 Instance 的历史表现
 *
 * Phase 5.2 - Intelligent Task Recommendation System
 */

import { createSQLiteClient, type SQLiteClient } from '../core/sqlite-client.js';
import type { Result } from '../types/index.js';
import { EketError, EketErrorCode } from '../types/index.js';
import type { TaskHistory, InstancePerformance } from '../types/recommender.js';

/**
 * Instance 表现统计配置
 */
export interface PerformanceStatsConfig {
  minTasksForStats: number; // 计算统计所需的最小任务数
  qualityWeight: number; // 质量权重
  onTimeWeight: number; // 按时权重
  efficiencyWeight: number; // 效率权重
}

const DEFAULT_STATS_CONFIG: PerformanceStatsConfig = {
  minTasksForStats: 3,
  qualityWeight: 0.5,
  onTimeWeight: 0.3,
  efficiencyWeight: 0.2,
};

/**
 * History Tracker
 * 负责记录和分析 Instance 的历史表现
 */
export class HistoryTracker {
  private sqlite: SQLiteClient;
  private config: PerformanceStatsConfig;

  constructor(config?: PerformanceStatsConfig) {
    // Defensive copy to prevent external mutation
    this.config = { ...DEFAULT_STATS_CONFIG, ...config };
    this.sqlite = createSQLiteClient();
  }

  /**
   * 连接数据库并初始化表
   */
  async connect(): Promise<Result<void>> {
    const result = this.sqlite.connect();
    if (!result.success) {
      return result;
    }

    // 初始化任务历史表
    this.initializeTables();
    return { success: true, data: undefined };
  }

  /**
   * 关闭数据库连接
   */
  async close(): Promise<void> {
    this.sqlite.close();
  }

  /**
   * 初始化表结构
   */
  private initializeTables(): void {
    const db = (this.sqlite as unknown as { db: { exec: (sql: string) => void } }).db;
    if (!db) {
      return;
    }

    db.exec(`
      -- 任务历史表（用于推荐系统）
      CREATE TABLE IF NOT EXISTS task_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        instance_id TEXT NOT NULL,
        task_id TEXT NOT NULL,
        title TEXT,
        role TEXT NOT NULL,
        quality INTEGER CHECK(quality >= 1 AND quality <= 5),
        duration INTEGER NOT NULL,
        exceeded_estimate INTEGER NOT NULL,
        completed_at INTEGER NOT NULL,
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        UNIQUE(instance_id, task_id)
      );

      -- 创建索引
      CREATE INDEX IF NOT EXISTS idx_task_history_instance ON task_history(instance_id);
      CREATE INDEX IF NOT EXISTS idx_task_history_task ON task_history(task_id);
      CREATE INDEX IF NOT EXISTS idx_task_history_role ON task_history(role);
      CREATE INDEX IF NOT EXISTS idx_task_history_completed ON task_history(completed_at);
    `);
  }

  /**
   * 记录任务完成历史
   */
  async recordTaskCompletion(history: TaskHistory): Promise<Result<number>> {
    const db = (
      this.sqlite as unknown as {
        db: {
          prepare: (sql: string) => { run: (...args: unknown[]) => { lastInsertRowid: number } };
          close: () => void;
        } | null;
      }
    ).db;

    if (!db) {
      return {
        success: false,
        error: new EketError(EketErrorCode.SQLITE_NOT_CONNECTED, 'Database not connected'),
      };
    }

    try {
      const stmt = db.prepare(`
        INSERT OR REPLACE INTO task_history
        (instance_id, task_id, title, role, quality, duration, exceeded_estimate, completed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const result = stmt.run(
        history.instanceId,
        history.taskId,
        history.title || null,
        history.role,
        history.quality,
        history.duration,
        history.exceededEstimate ? 1 : 0,
        history.completedAt
      );

      return { success: true, data: result.lastInsertRowid as number };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      return {
        success: false,
        error: new EketError(
          'SQLITE_OPERATION_FAILED',
          `Failed to record task history: ${errorMessage}`
        ),
      };
    }
  }

  /**
   * 获取 Instance 的历史记录
   */
  async getInstanceHistory(instanceId: string, limit?: number): Promise<Result<TaskHistory[]>> {
    const db = (
      this.sqlite as unknown as {
        db: {
          prepare: (sql: string) => { all: (...args: unknown[]) => TaskHistory[] };
          close: () => void;
        } | null;
      }
    ).db;

    if (!db) {
      return {
        success: false,
        error: new EketError(EketErrorCode.SQLITE_NOT_CONNECTED, 'Database not connected'),
      };
    }

    try {
      const limitClause = limit ? `LIMIT ${limit}` : '';
      const stmt = db.prepare(`
        SELECT * FROM task_history
        WHERE instance_id = ?
        ORDER BY completed_at DESC
        ${limitClause}
      `);

      const rows = stmt.all(instanceId) as unknown as Array<Record<string, unknown>>;
      const histories = rows.map((row) => this.rowToTaskHistory(row));

      return { success: true, data: histories };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      return {
        success: false,
        error: new EketError(
          'SQLITE_OPERATION_FAILED',
          `Failed to fetch instance history: ${errorMessage}`
        ),
      };
    }
  }

  /**
   * 获取 Instance 的表现统计
   */
  async getInstancePerformance(
    instanceId: string,
    role?: string
  ): Promise<Result<InstancePerformance>> {
    const historyResult = await this.getInstanceHistory(instanceId);

    if (!historyResult.success) {
      return historyResult;
    }

    let histories = historyResult.data;

    // 如果指定了角色，过滤该角色的历史
    if (role) {
      histories = histories.filter((h: TaskHistory) => h.role === role);
    }

    if (histories.length === 0) {
      // 无历史记录，返回默认值
      return {
        success: true,
        data: {
          instanceId,
          role: role || 'unknown',
          totalTasks: 0,
          averageQuality: 0,
          averageDuration: 0,
          onTimeRate: 0,
          compositeScore: this.config.qualityWeight, // 使用默认质量权重作为基准
        },
      };
    }

    // 计算统计数据
    const totalTasks = histories.length;
    const totalQuality = histories.reduce((sum: number, h: TaskHistory) => sum + h.quality, 0);
    const totalDuration = histories.reduce((sum: number, h: TaskHistory) => sum + h.duration, 0);
    const onTimeCount = histories.filter((h: TaskHistory) => !h.exceededEstimate).length;

    const averageQuality = totalQuality / totalTasks;
    const averageDuration = totalDuration / totalTasks;
    const onTimeRate = onTimeCount / totalTasks;

    // 计算综合表现分 (0-1)
    const normalizedQuality = (averageQuality - 1) / 4; // 将 1-5 映射到 0-1
    const compositeScore =
      normalizedQuality * this.config.qualityWeight +
      onTimeRate * this.config.onTimeWeight +
      (1 - Math.min(1, averageDuration / 86400)) * this.config.efficiencyWeight; // 假设最大合理时间为 1 天

    return {
      success: true,
      data: {
        instanceId,
        role: histories[0]?.role || role || 'unknown',
        totalTasks,
        averageQuality,
        averageDuration,
        onTimeRate,
        compositeScore: Math.max(0, Math.min(1, compositeScore)),
      },
    };
  }

  /**
   * 获取所有 Instance 的表现统计（按角色）
   */
  async getAllPerformanceStats(role?: string): Promise<Result<InstancePerformance[]>> {
    const db = (
      this.sqlite as unknown as {
        db: {
          prepare: (sql: string) => {
            all: (...args: unknown[]) => Array<{
              instance_id: string;
              role: string;
              total_tasks: number;
              avg_quality: number;
              avg_duration: number;
              on_time_rate: number;
            }>;
          };
          close: () => void;
        } | null;
      }
    ).db;

    if (!db) {
      return {
        success: false,
        error: new EketError(EketErrorCode.SQLITE_NOT_CONNECTED, 'Database not connected'),
      };
    }

    try {
      const roleFilter = role ? `WHERE role = ?` : '';
      const groupBy = role ? '' : 'GROUP BY instance_id, role';

      const stmt = db.prepare(`
        SELECT
          instance_id,
          role,
          COUNT(*) as total_tasks,
          AVG(quality) as avg_quality,
          AVG(duration) as avg_duration,
          CAST(SUM(CASE WHEN exceeded_estimate = 0 THEN 1 ELSE 0 END) AS FLOAT) / COUNT(*) as on_time_rate
        FROM task_history
        ${roleFilter}
        ${groupBy}
        HAVING total_tasks >= ${this.config.minTasksForStats}
      `);

      const rows = role
        ? (stmt.all(role) as Array<{
            instance_id: string;
            role: string;
            total_tasks: number;
            avg_quality: number;
            avg_duration: number;
            on_time_rate: number;
          }>)
        : (stmt.all() as Array<{
            instance_id: string;
            role: string;
            total_tasks: number;
            avg_quality: number;
            avg_duration: number;
            on_time_rate: number;
          }>);

      const performances: InstancePerformance[] = rows.map((row) => {
        const normalizedQuality = (row.avg_quality - 1) / 4;
        const compositeScore =
          normalizedQuality * this.config.qualityWeight +
          row.on_time_rate * this.config.onTimeWeight +
          (1 - Math.min(1, row.avg_duration / 86400)) * this.config.efficiencyWeight;

        return {
          instanceId: row.instance_id,
          role: row.role,
          totalTasks: row.total_tasks,
          averageQuality: row.avg_quality,
          averageDuration: row.avg_duration,
          onTimeRate: row.on_time_rate,
          compositeScore: Math.max(0, Math.min(1, compositeScore)),
        };
      });

      return { success: true, data: performances };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      return {
        success: false,
        error: new EketError(
          'SQLITE_OPERATION_FAILED',
          `Failed to fetch performance stats: ${errorMessage}`
        ),
      };
    }
  }

  /**
   * 获取任务的承接历史（用于去重）
   */
  async getTaskAssignments(
    taskId: string
  ): Promise<Result<Array<{ instanceId: string; completedAt: number }>>> {
    const db = (
      this.sqlite as unknown as {
        db: {
          prepare: (sql: string) => {
            all: (...args: unknown[]) => Array<{ instance_id: string; completed_at: number }>;
          };
          close: () => void;
        } | null;
      }
    ).db;

    if (!db) {
      return {
        success: false,
        error: new EketError(EketErrorCode.SQLITE_NOT_CONNECTED, 'Database not connected'),
      };
    }

    try {
      const stmt = db.prepare(`
        SELECT instance_id, completed_at
        FROM task_history
        WHERE task_id = ?
        ORDER BY completed_at DESC
      `);

      const rows = stmt.all(taskId) as Array<{ instance_id: string; completed_at: number }>;
      return {
        success: true,
        data: rows.map((row) => ({
          instanceId: row.instance_id,
          completedAt: row.completed_at,
        })),
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      return {
        success: false,
        error: new EketError(
          'SQLITE_OPERATION_FAILED',
          `Failed to fetch task assignments: ${errorMessage}`
        ),
      };
    }
  }

  /**
   * 清理过期的历史记录
   */
  async cleanupHistory(olderThanDays = 90): Promise<Result<number>> {
    const db = (
      this.sqlite as unknown as {
        db: {
          prepare: (sql: string) => { run: (...args: unknown[]) => { changes: number } };
          close: () => void;
        } | null;
      }
    ).db;

    if (!db) {
      return {
        success: false,
        error: new EketError(EketErrorCode.SQLITE_NOT_CONNECTED, 'Database not connected'),
      };
    }

    try {
      const cutoffTime = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;
      const stmt = db.prepare(`
        DELETE FROM task_history
        WHERE completed_at < ?
      `);

      const result = stmt.run(cutoffTime);
      return { success: true, data: result.changes };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      return {
        success: false,
        error: new EketError(
          'SQLITE_OPERATION_FAILED',
          `Failed to cleanup history: ${errorMessage}`
        ),
      };
    }
  }

  /**
   * 将数据库行转换为 TaskHistory 对象
   */
  private rowToTaskHistory(row: Record<string, unknown>): TaskHistory {
    return {
      id: row.id as number,
      instanceId: row.instance_id as string,
      taskId: row.task_id as string,
      title: row.title as string | undefined,
      role: row.role as string,
      quality: row.quality as number,
      duration: row.duration as number,
      exceededEstimate: (row.exceeded_estimate as number) === 1,
      completedAt: row.completed_at as number,
      createdAt: row.created_at as number | undefined,
    };
  }
}

/**
 * 创建 History Tracker 实例
 */
export function createHistoryTracker(config?: PerformanceStatsConfig): HistoryTracker {
  return new HistoryTracker(config);
}
