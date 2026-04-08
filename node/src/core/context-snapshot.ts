/**
 * EKET Framework - Context Snapshot Manager
 *
 * 情境快照：将 Agent 完成任务后的默会知识（Tacit Knowledge）显式化，
 * 供后续 Agent 参考。记录那些"难以用文字传达"却至关重要的隐性经验：
 *
 * - 与预期不同的地方（whatSurprisedMe）
 * - 如果重来一次的调整（whatIWouldDoDifferently）
 * - 最难传达给下一个人的部分（whatNextPersonNeedsToKnow）
 * - 没写在需求里但实际存在的依赖（implicitDependencies）
 */

import type { ContextSnapshot, ContextSnapshotQuery, Result } from '../types/index.js';
import { EketError, EketErrorCode } from '../types/index.js';
import { createSQLiteManager, type SQLiteManager } from './sqlite-manager.js';

// ============================================================================
// Table DDL
// ============================================================================

const TABLE_DDL = `
  CREATE TABLE IF NOT EXISTS context_snapshots (
    id TEXT PRIMARY KEY,
    ticket_id TEXT NOT NULL,
    agent_id TEXT NOT NULL,
    agent_type TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    what_surprised_me TEXT NOT NULL,
    what_would_do_differently TEXT NOT NULL,
    what_next_person_needs_to_know TEXT NOT NULL,
    implicit_dependencies TEXT NOT NULL,
    technical_pitfalls TEXT,
    key_decisions TEXT,
    open_questions TEXT
  )
`;

const INDEX_DDLS = [
  `CREATE INDEX IF NOT EXISTS idx_cs_ticket_id   ON context_snapshots(ticket_id)`,
  `CREATE INDEX IF NOT EXISTS idx_cs_agent_id    ON context_snapshots(agent_id)`,
  `CREATE INDEX IF NOT EXISTS idx_cs_created_at  ON context_snapshots(created_at DESC)`,
];

// ============================================================================
// Internal DB row shape
// ============================================================================

interface SnapshotRow {
  id: string;
  ticket_id: string;
  agent_id: string;
  agent_type: string;
  created_at: number;
  what_surprised_me: string;
  what_would_do_differently: string;
  what_next_person_needs_to_know: string;
  implicit_dependencies: string;
  technical_pitfalls: string | null;
  key_decisions: string | null;
  open_questions: string | null;
}

// ============================================================================
// ContextSnapshotManager
// ============================================================================

/**
 * 情境快照管理器
 *
 * 使用 SQLite 持久化，复用项目已有的 `createSQLiteClient()` 工厂函数。
 * 所有公开方法返回 `Result<T>`，不抛出异常。
 */
export class ContextSnapshotManager {
  private sqlite: SQLiteManager;

  /**
   * @param dbPath 自定义 SQLite 路径；留空则使用默认路径（~/.eket/data/sqlite/eket.db）
   *               传入 ':memory:' 可在测试中使用内存数据库
   */
  constructor(dbPath?: string) {
    this.sqlite = createSQLiteManager({ dbPath, useWorker: false });
  }

  // --------------------------------------------------------------------------
  // Lifecycle
  // --------------------------------------------------------------------------

  /**
   * 连接数据库并初始化表结构（必须在使用其他方法前调用）
   */
  async connect(): Promise<Result<void>> {
    const connectResult = await this.sqlite.connect();
    if (!connectResult.success) {
      return connectResult;
    }

    try {
      this.initializeTables();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      return {
        success: false,
        error: new EketError(EketErrorCode.DB_NOT_CONNECTED, `Failed to initialize tables: ${msg}`),
      };
    }

    console.log('[ContextSnapshotManager] Connected and initialized');
    return { success: true, data: undefined };
  }

  /**
   * 断开数据库连接
   */
  async disconnect(): Promise<void> {
    await this.sqlite.close();
    console.log('[ContextSnapshotManager] Disconnected');
  }

  // --------------------------------------------------------------------------
  // Write
  // --------------------------------------------------------------------------

  /**
   * 保存情境快照
   *
   * @param snapshot 快照数据（不含 id 和 createdAt，由本方法自动生成）
   * @returns 保存后的完整快照（含 id 和 createdAt）
   */
  saveSnapshot(
    snapshot: Omit<ContextSnapshot, 'id' | 'createdAt'>
  ): Result<ContextSnapshot> {
    const db = this.sqlite.getDB();
    if (!db) {
      return {
        success: false,
        error: new EketError(EketErrorCode.DB_NOT_CONNECTED, 'Database not connected'),
      };
    }

    const id = this.generateId();
    const createdAt = Date.now();

    const full: ContextSnapshot = { ...snapshot, id, createdAt };

    try {
      const stmt = db.prepare(`
        INSERT INTO context_snapshots (
          id,
          ticket_id,
          agent_id,
          agent_type,
          created_at,
          what_surprised_me,
          what_would_do_differently,
          what_next_person_needs_to_know,
          implicit_dependencies,
          technical_pitfalls,
          key_decisions,
          open_questions
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        full.id,
        full.ticketId,
        full.agentId,
        full.agentType,
        full.createdAt,
        JSON.stringify(full.whatSurprisedMe),
        JSON.stringify(full.whatIWouldDoDifferently),
        JSON.stringify(full.whatNextPersonNeedsToKnow),
        JSON.stringify(full.implicitDependencies),
        full.technicalPitfalls != null ? JSON.stringify(full.technicalPitfalls) : null,
        full.keyDecisions != null ? JSON.stringify(full.keyDecisions) : null,
        full.openQuestions != null ? JSON.stringify(full.openQuestions) : null
      );

      console.log(`[ContextSnapshotManager] Saved snapshot: ${id} (ticket: ${full.ticketId})`);
      return { success: true, data: full };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      return {
        success: false,
        error: new EketError(EketErrorCode.ENTRY_CREATE_FAILED, `Failed to save snapshot: ${msg}`),
      };
    }
  }

  // --------------------------------------------------------------------------
  // Read
  // --------------------------------------------------------------------------

  /**
   * 按 ticketId 查询该任务的所有情境快照（按创建时间升序）
   */
  getSnapshotsByTicket(ticketId: string): Result<ContextSnapshot[]> {
    const db = this.sqlite.getDB();
    if (!db) {
      return {
        success: false,
        error: new EketError(EketErrorCode.DB_NOT_CONNECTED, 'Database not connected'),
      };
    }

    try {
      const stmt = db.prepare(`
        SELECT * FROM context_snapshots
        WHERE ticket_id = ?
        ORDER BY created_at ASC
      `);
      const rows = stmt.all(ticketId) as SnapshotRow[];
      return { success: true, data: rows.map(this.rowToSnapshot) };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      return {
        success: false,
        error: new EketError(EketErrorCode.ENTRY_QUERY_FAILED, `Failed to query by ticket: ${msg}`),
      };
    }
  }

  /**
   * 获取最新的 N 条快照（按创建时间降序）
   *
   * @param limit 返回条数，默认 20
   */
  getRecentSnapshots(limit = 20): Result<ContextSnapshot[]> {
    const db = this.sqlite.getDB();
    if (!db) {
      return {
        success: false,
        error: new EketError(EketErrorCode.DB_NOT_CONNECTED, 'Database not connected'),
      };
    }

    try {
      const stmt = db.prepare(`
        SELECT * FROM context_snapshots
        ORDER BY created_at DESC
        LIMIT ?
      `);
      const rows = stmt.all(limit) as SnapshotRow[];
      return { success: true, data: rows.map(this.rowToSnapshot) };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      return {
        success: false,
        error: new EketError(EketErrorCode.ENTRY_QUERY_FAILED, `Failed to get recent snapshots: ${msg}`),
      };
    }
  }

  /**
   * 全文关键词搜索（匹配所有文本字段中的 JSON 内容）
   *
   * 搜索范围：whatSurprisedMe、whatIWouldDoDifferently、whatNextPersonNeedsToKnow、
   *           implicitDependencies、technicalPitfalls、keyDecisions、openQuestions
   *
   * @param keyword 搜索关键词
   * @param options 分页选项（limit 默认 50，offset 默认 0）
   */
  searchSnapshots(
    keyword: string,
    options: Pick<ContextSnapshotQuery, 'limit' | 'offset'> = {}
  ): Result<ContextSnapshot[]> {
    const db = this.sqlite.getDB();
    if (!db) {
      return {
        success: false,
        error: new EketError(EketErrorCode.DB_NOT_CONNECTED, 'Database not connected'),
      };
    }

    const limit = options.limit ?? 50;
    const offset = options.offset ?? 0;
    const pattern = `%${keyword}%`;

    try {
      const stmt = db.prepare(`
        SELECT * FROM context_snapshots
        WHERE
          what_surprised_me              LIKE ? OR
          what_would_do_differently      LIKE ? OR
          what_next_person_needs_to_know LIKE ? OR
          implicit_dependencies          LIKE ? OR
          technical_pitfalls             LIKE ? OR
          key_decisions                  LIKE ? OR
          open_questions                 LIKE ?
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
      `);

      const rows = stmt.all(
        pattern, pattern, pattern, pattern, pattern, pattern, pattern,
        limit, offset
      ) as SnapshotRow[];

      return { success: true, data: rows.map(this.rowToSnapshot) };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      return {
        success: false,
        error: new EketError(EketErrorCode.ENTRY_QUERY_FAILED, `Failed to search snapshots: ${msg}`),
      };
    }
  }

  /**
   * 通用查询接口（支持多维度过滤 + 分页）
   */
  querySnapshots(query: ContextSnapshotQuery = {}): Result<ContextSnapshot[]> {
    const db = this.sqlite.getDB();
    if (!db) {
      return {
        success: false,
        error: new EketError(EketErrorCode.DB_NOT_CONNECTED, 'Database not connected'),
      };
    }

    try {
      const conditions: string[] = [];
      const params: Array<string | number> = [];

      if (query.ticketId) {
        conditions.push('ticket_id = ?');
        params.push(query.ticketId);
      }

      if (query.agentId) {
        conditions.push('agent_id = ?');
        params.push(query.agentId);
      }

      if (query.keyword) {
        const kw = `%${query.keyword}%`;
        conditions.push(`(
          what_surprised_me              LIKE ? OR
          what_would_do_differently      LIKE ? OR
          what_next_person_needs_to_know LIKE ? OR
          implicit_dependencies          LIKE ? OR
          technical_pitfalls             LIKE ? OR
          key_decisions                  LIKE ? OR
          open_questions                 LIKE ?
        )`);
        params.push(kw, kw, kw, kw, kw, kw, kw);
      }

      const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      const limit = query.limit ?? 100;
      const offset = query.offset ?? 0;

      const stmt = db.prepare(`
        SELECT * FROM context_snapshots
        ${where}
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
      `);
      params.push(limit, offset);

      const rows = stmt.all(...params) as SnapshotRow[];
      return { success: true, data: rows.map(this.rowToSnapshot) };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      return {
        success: false,
        error: new EketError(EketErrorCode.ENTRY_QUERY_FAILED, `Failed to query snapshots: ${msg}`),
      };
    }
  }

  // --------------------------------------------------------------------------
  // Private helpers
  // --------------------------------------------------------------------------

  /**
   * 初始化数据库表和索引
   */
  private initializeTables(): void {
    const db = this.sqlite.getDB();
    if (!db) {
      throw new Error('Database not connected');
    }

    db.exec(TABLE_DDL);
    for (const indexDdl of INDEX_DDLS) {
      db.exec(indexDdl);
    }

    console.log('[ContextSnapshotManager] Tables initialized');
  }

  /**
   * 将数据库行转换为 ContextSnapshot 对象
   */
  private rowToSnapshot(row: SnapshotRow): ContextSnapshot {
    const parseArr = (raw: string | null): string[] => {
      if (!raw) return [];
      try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? (parsed as string[]) : [];
      } catch {
        return [];
      }
    };

    const parseOptArr = (raw: string | null): string[] | undefined => {
      if (raw == null) return undefined;
      return parseArr(raw);
    };

    return {
      id: row.id,
      ticketId: row.ticket_id,
      agentId: row.agent_id,
      agentType: row.agent_type,
      createdAt: row.created_at,
      whatSurprisedMe: parseArr(row.what_surprised_me),
      whatIWouldDoDifferently: parseArr(row.what_would_do_differently),
      whatNextPersonNeedsToKnow: parseArr(row.what_next_person_needs_to_know),
      implicitDependencies: parseArr(row.implicit_dependencies),
      technicalPitfalls: parseOptArr(row.technical_pitfalls),
      keyDecisions: parseOptArr(row.key_decisions),
      openQuestions: parseOptArr(row.open_questions),
    };
  }

  /**
   * 生成唯一快照 ID
   */
  private generateId(): string {
    return `cs_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * 创建情境快照管理器实例
 *
 * @param dbPath 可选 SQLite 路径。测试时传 ':memory:'，生产时留空使用默认路径。
 */
export function createContextSnapshotManager(dbPath?: string): ContextSnapshotManager {
  return new ContextSnapshotManager(dbPath);
}
