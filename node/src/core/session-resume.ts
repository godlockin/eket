/**
 * Session Resume Module
 * 封装 Slaver 重启后的检查点恢复逻辑（带降级）
 *
 * 主要导出：resumeWithFallback(slaverId)
 *   - SQLite 可用时：查询 execution_checkpoints 返回最新检查点
 *   - SQLite 不可用时：返回 null（调用方 fallback 到 task:claim）
 */

import { createSQLiteManager } from './sqlite-manager.js';

export interface ResumeCheckpoint {
  ticketId: string;
  slaverId: string;
  phase: string;
  filesChanged?: string[];
  lastAction?: string;
  notes?: string;
  savedAt?: string;
}

/**
 * 从 SQLite 检查点恢复（带降级）
 *
 * @param slaverId - Slaver 实例 ID
 * @returns 最新检查点（存在时）或 null（无检查点 / SQLite 不可用时）
 */
export async function resumeWithFallback(slaverId: string): Promise<ResumeCheckpoint | null> {
  const sqlite = createSQLiteManager();

  try {
    const connectResult = await sqlite.connect();
    if (!connectResult.success) {
      return null;
    }

    const result = await sqlite.get(
      'SELECT * FROM execution_checkpoints WHERE slaver_id = ? ORDER BY created_at DESC LIMIT 1',
      [slaverId]
    );

    if (!result.success || !result.data) {
      return null;
    }

    const row = result.data as {
      ticket_id: string;
      slaver_id: string;
      phase: string;
      state_json: string;
      created_at?: string;
    };

    let state: {
      filesChanged?: string[];
      lastAction?: string;
      notes?: string;
      savedAt?: string;
    } = {};
    try {
      state = JSON.parse(row.state_json) as typeof state;
    } catch {
      // state_json 解析失败时保持空 state
    }

    return {
      ticketId: row.ticket_id,
      slaverId: row.slaver_id,
      phase: row.phase,
      filesChanged: state.filesChanged,
      lastAction: state.lastAction,
      notes: state.notes,
      savedAt: state.savedAt,
    };
  } finally {
    await sqlite.close();
  }
}
