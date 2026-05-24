/**
 * SQLite Client Module
 * 用于数据持久化（Retrospective、任务历史等）
 *
 * @deprecated 已废弃，请使用 SQLiteManager 替代
 *
 * 迁移指南：
 * ```typescript
 * // 旧代码
 * import { SQLiteClient } from './sqlite-client';
 * const client = new SQLiteClient(dbPath);
 *
 * // 新代码
 * import { createSQLiteManager } from './sqlite-manager';
 * const manager = createSQLiteManager({ dbPath });
 * ```
 *
 * 原因：
 * - SQLiteManager 提供统一接口，支持同步/异步自动选择
 * - 支持自动降级（Worker 失败时降级到同步）
 * - 更好的可测试性和依赖注入支持
 *
 * @see SQLiteManager -  replacement
 * @see SyncSQLiteAdapter - 同步适配器
 * @see AsyncSQLiteClient - 异步 Worker 实现
 */

import * as fs from 'fs';
import * as path from 'path';

import Database from 'better-sqlite3';

import type { Retrospective, RetroContent, Result, SkillEdgeRecord, SkillNodeRecord, SkillFeedback, TaskMessage } from '../types/index.js';
import { EketError, EketErrorCode } from '../types/index.js';

/**
 * @deprecated 已废弃，请使用 SQLiteManager 替代
 *
 * 同步 SQLite 客户端实现。此类已被 SQLiteManager 替代，后者提供：
 * - 统一接口支持同步/异步自动选择
 * - 自动降级能力（Worker 失败时降级到同步）
 * - 更好的可测试性
 *
 * @see createSQLiteManager - 新的工厂函数
 */
export class SQLiteClient {
  private db: Database.Database | null = null;
  private dbPath: string;

  constructor(dbPath?: string) {
    if (dbPath) {
      this.dbPath = dbPath;
    } else {
      // 默认路径：<项目根目录>/.eket/data/sqlite/eket.db
      this.dbPath = path.join(process.cwd(), '.eket', 'data', 'sqlite', 'eket.db');
    }
  }

  /**
   * 连接数据库并初始化表
   */
  connect(): Result<void> {
    try {
      // 确保目录存在
      const dir = path.dirname(this.dbPath);
      fs.mkdirSync(dir, { recursive: true });

      this.db = new Database(this.dbPath);

      // 启用外键
      this.db.pragma('foreign_keys = ON');

      // 初始化表
      this.initializeTables();

      console.log(`[SQLite] Connected to ${this.dbPath}`);
      return { success: true, data: undefined };
    } catch {
      return {
        success: false,
        error: new EketError(EketErrorCode.SQLITE_CONNECTION_FAILED, 'Failed to connect SQLite'),
      };
    }
  }

  /**
   * 关闭数据库连接
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  /**
   * 检查连接状态
   */
  isReady(): boolean {
    return this.db !== null;
  }

  /**
   * 获取底层数据库实例（用于高级操作）
   */
  getDB(): Database.Database | null {
    return this.db;
  }

  /**
   * 执行 SQL 语句（用于通用操作）
   */
  execute(sql: string, params: unknown[] = []): Result<void> {
    if (!this.db) {
      return {
        success: false,
        error: new EketError(EketErrorCode.SQLITE_NOT_CONNECTED, 'Database not connected'),
      };
    }

    try {
      this.db.prepare(sql).run(...params);
      return { success: true, data: undefined };
    } catch (e) {
      return {
        success: false,
        error: new EketError(EketErrorCode.SQLITE_OPERATION_FAILED, (e as Error).message),
      };
    }
  }

  /**
   * 查询单行数据
   */
  get(sql: string, params: unknown[] = []): Result<unknown> {
    if (!this.db) {
      return {
        success: false,
        error: new EketError(EketErrorCode.SQLITE_NOT_CONNECTED, 'Database not connected'),
      };
    }

    try {
      const row = this.db.prepare(sql).get(...params);
      return { success: true, data: row || null };
    } catch (e) {
      return {
        success: false,
        error: new EketError(EketErrorCode.SQLITE_OPERATION_FAILED, (e as Error).message),
      };
    }
  }

  /**
   * 查询多行数据
   */
  all(sql: string, params: unknown[] = []): Result<unknown[]> {
    if (!this.db) {
      return {
        success: false,
        error: new EketError(EketErrorCode.SQLITE_NOT_CONNECTED, 'Database not connected'),
      };
    }

    try {
      const rows = this.db.prepare(sql).all(...params);
      return { success: true, data: rows || [] };
    } catch (e) {
      return {
        success: false,
        error: new EketError(EketErrorCode.SQLITE_OPERATION_FAILED, (e as Error).message),
      };
    }
  }

  /**
   * 初始化表结构
   */
  private initializeTables(): void {
    if (!this.db) {
      return;
    }

    this.db.exec(`
      -- Retrospective 主表
      CREATE TABLE IF NOT EXISTS retrospectives (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sprint_id TEXT NOT NULL,
        file_name TEXT UNIQUE,
        title TEXT NOT NULL,
        date TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Retrospective 内容表
      CREATE TABLE IF NOT EXISTS retro_content (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        retro_id INTEGER NOT NULL,
        category TEXT NOT NULL,
        content TEXT NOT NULL,
        vote_count INTEGER DEFAULT 0,
        created_by TEXT,
        FOREIGN KEY (retro_id) REFERENCES retrospectives(id)
      );

      -- Retrospective 标签表
      CREATE TABLE IF NOT EXISTS retro_tags (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        retro_id INTEGER NOT NULL,
        tag TEXT NOT NULL,
        FOREIGN KEY (retro_id) REFERENCES retrospectives(id)
      );

      -- 创建索引
      CREATE INDEX IF NOT EXISTS idx_retro_sprint ON retrospectives(sprint_id);
      CREATE INDEX IF NOT EXISTS idx_retro_date ON retrospectives(date);
      CREATE INDEX IF NOT EXISTS idx_retro_content_category ON retro_content(category);
      CREATE INDEX IF NOT EXISTS idx_retro_tags_tag ON retro_tags(tag);

      -- 任务历史表
      CREATE TABLE IF NOT EXISTS task_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ticket_id TEXT NOT NULL,
        title TEXT,
        status TEXT,
        assigned_to TEXT,
        started_at TIMESTAMP,
        completed_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        skill_feedback_json TEXT,
        feedback_processed INTEGER DEFAULT 0
      );

      -- 消息历史表
      CREATE TABLE IF NOT EXISTS message_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        message_id TEXT UNIQUE,
        from_agent TEXT,
        to_agent TEXT,
        type TEXT,
        payload TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_task_status ON task_history(status);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_task_history_unique_inprogress
        ON task_history(ticket_id) WHERE status = 'in_progress';
      CREATE INDEX IF NOT EXISTS idx_message_type ON message_history(type);

      -- 执行检查点表（断点恢复）
      CREATE TABLE IF NOT EXISTS execution_checkpoints (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ticket_id TEXT NOT NULL,
        slaver_id TEXT NOT NULL,
        phase TEXT NOT NULL,
        state_json TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(ticket_id, slaver_id)
      );

      CREATE INDEX IF NOT EXISTS idx_checkpoint_slaver ON execution_checkpoints(slaver_id);

      -- TASK-199: TaskCheckpoint断点续传表（CAS版本控制）
      CREATE TABLE IF NOT EXISTS task_checkpoints (
        task_id    TEXT    PRIMARY KEY,
        data       TEXT    NOT NULL,
        version    INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL
      );

      -- 任务消息表（结构化存储 LLM 执行消息）
      CREATE TABLE IF NOT EXISTS task_messages (
        id        INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id   TEXT    NOT NULL,
        seq       INTEGER NOT NULL,
        type      TEXT    NOT NULL CHECK(type IN ('text','tool_use','tool_result','thinking','error')),
        tool      TEXT,
        content   TEXT,
        input_json TEXT,
        output    TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        UNIQUE(task_id, seq)
      );
      CREATE INDEX IF NOT EXISTS idx_task_messages_task_id ON task_messages(task_id, seq);

      -- Agent-Skills 关联表（TASK-068）
      CREATE TABLE IF NOT EXISTS agent_skills (
        agent_id  TEXT NOT NULL,
        skill_id  TEXT NOT NULL,
        PRIMARY KEY (agent_id, skill_id)
      );

      -- 任务队列表（TASK-065: 原子性领取）
      CREATE TABLE IF NOT EXISTS tickets (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'ready',
        priority INTEGER NOT NULL DEFAULT 0,
        assignee TEXT,
        claimed_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
      CREATE INDEX IF NOT EXISTS idx_tickets_priority ON tickets(priority DESC, created_at ASC);

      -- 知识库全文检索（FTS5）
      CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_fts USING fts5(
        doc_id UNINDEXED,
        content,
        source_path UNINDEXED
      );

      -- 知识库向量存储
      CREATE TABLE IF NOT EXISTS knowledge_embeddings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        doc_id TEXT NOT NULL UNIQUE,
        content TEXT NOT NULL,
        source_path TEXT NOT NULL,
        embedding TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now'))
      );

      -- Skill Graph: 节点表（TASK-102a）
      CREATE TABLE IF NOT EXISTS skill_nodes (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL CHECK(type IN ('skill', 'expert')),
        domain TEXT NOT NULL,
        level INTEGER DEFAULT 1 CHECK(level BETWEEN 1 AND 3),
        model_hint TEXT,
        triggers TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Skill Graph: 边表（TASK-102a）
      CREATE TABLE IF NOT EXISTS skill_edges (
        source_id TEXT NOT NULL,
        target_id TEXT NOT NULL,
        weight REAL DEFAULT 0.5 CHECK(weight BETWEEN 0.0 AND 1.0),
        co_activation_count INTEGER DEFAULT 1,
        active INTEGER DEFAULT 1,
        last_activated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (source_id, target_id)
      );
    `);

    // Migration: add skill_feedback_json and feedback_processed columns if missing (TASK-104b)
    try {
      this.db.prepare(`ALTER TABLE task_history ADD COLUMN skill_feedback_json TEXT`).run();
    } catch { /* column already exists */ }
    try {
      this.db.prepare(`ALTER TABLE task_history ADD COLUMN feedback_processed INTEGER DEFAULT 0`).run();
    } catch { /* column already exists */ }
  }

  /**
   * 插入 Retrospective
   */
  insertRetrospective(retro: {
    sprintId: string;
    fileName: string;
    title: string;
    date: string;
  }): Result<number> {
    if (!this.db) {
      return {
        success: false,
        error: new EketError(EketErrorCode.SQLITE_NOT_CONNECTED, 'Database not connected'),
      };
    }

    try {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO retrospectives (sprint_id, file_name, title, date)
        VALUES (?, ?, ?, ?)
      `);

      const result = stmt.run(retro.sprintId, retro.fileName, retro.title, retro.date);
      return { success: true, data: result.lastInsertRowid as number };
    } catch {
      return {
        success: false,
        error: new EketError(EketErrorCode.SQLITE_OPERATION_FAILED, 'Failed to insert retrospective'),
      };
    }
  }

  /**
   * 查询 Retrospective
   */
  getRetrospective(sprintId: string): Result<Retrospective | null> {
    if (!this.db) {
      return {
        success: false,
        error: new EketError(EketErrorCode.SQLITE_NOT_CONNECTED, 'Database not connected'),
      };
    }

    try {
      const stmt = this.db.prepare('SELECT * FROM retrospectives WHERE sprint_id = ?');
      const retro = stmt.get(sprintId) as Retrospective | undefined;
      return { success: true, data: retro || null };
    } catch {
      return {
        success: false,
        error: new EketError(EketErrorCode.SQLITE_OPERATION_FAILED, 'Failed to get retrospective'),
      };
    }
  }

  /**
   * 列出所有 Retrospective
   */
  listRetrospectives(): Result<Retrospective[]> {
    if (!this.db) {
      return {
        success: false,
        error: new EketError(EketErrorCode.SQLITE_NOT_CONNECTED, 'Database not connected'),
      };
    }

    try {
      const stmt = this.db.prepare('SELECT * FROM retrospectives ORDER BY date DESC');
      const retros = stmt.all() as Retrospective[];
      return { success: true, data: retros };
    } catch {
      return {
        success: false,
        error: new EketError(EketErrorCode.SQLITE_OPERATION_FAILED, 'Failed to list retrospectives'),
      };
    }
  }

  /**
   * 插入 Retrospective 内容
   */
  insertRetroContent(content: {
    retroId: number;
    category: string;
    content: string;
    createdBy?: string;
  }): Result<number> {
    if (!this.db) {
      return {
        success: false,
        error: new EketError(EketErrorCode.SQLITE_NOT_CONNECTED, 'Database not connected'),
      };
    }

    try {
      const stmt = this.db.prepare(`
        INSERT INTO retro_content (retro_id, category, content, created_by)
        VALUES (?, ?, ?, ?)
      `);

      const result = stmt.run(
        content.retroId,
        content.category,
        content.content,
        content.createdBy
      );
      return { success: true, data: result.lastInsertRowid as number };
    } catch {
      return {
        success: false,
        error: new EketError(EketErrorCode.SQLITE_OPERATION_FAILED, 'Failed to insert retro content'),
      };
    }
  }

  /**
   * 按类别查询内容
   */
  getRetroContentByCategory(retroId: number, category: string): Result<RetroContent[]> {
    if (!this.db) {
      return {
        success: false,
        error: new EketError(EketErrorCode.SQLITE_NOT_CONNECTED, 'Database not connected'),
      };
    }

    try {
      const stmt = this.db.prepare(
        'SELECT * FROM retro_content WHERE retro_id = ? AND category = ?'
      );
      const contents = stmt.all(retroId, category) as RetroContent[];
      return { success: true, data: contents };
    } catch {
      return {
        success: false,
        error: new EketError(EketErrorCode.SQLITE_OPERATION_FAILED, 'Failed to get retro content'),
      };
    }
  }

  /**
   * 搜索 Retrospective（按关键词）
   */
  searchRetrospectives(keyword: string): Result<Retrospective[]> {
    if (!this.db) {
      return {
        success: false,
        error: new EketError(EketErrorCode.SQLITE_NOT_CONNECTED, 'Database not connected'),
      };
    }

    try {
      // 安全修复：转义 LIKE 通配符，防止 SQL 注入
      const escapedKeyword = this.escapeLikePattern(keyword);
      const searchPattern = `%${escapedKeyword}%`;

      const stmt = this.db.prepare(`
        SELECT DISTINCT r.*
        FROM retrospectives r
        JOIN retro_content rc ON r.id = rc.retro_id
        WHERE r.title LIKE ? OR rc.content LIKE ?
        ORDER BY r.date DESC
        LIMIT 10
      `);

      const retros = stmt.all(searchPattern, searchPattern) as Retrospective[];
      return { success: true, data: retros };
    } catch {
      return {
        success: false,
        error: new EketError(EketErrorCode.SQLITE_OPERATION_FAILED, 'Failed to search retrospectives'),
      };
    }
  }

  /**
   * 转义 SQL LIKE 语句中的通配符
   * 防止 LIKE 注入攻击
   */
  private escapeLikePattern(str: string): string {
    // 转义 \ 必须在最前面，避免重复转义
    return str.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
  }

  /**
   * 生成统计报告
   */
  generateReport(): Result<{
    totalRetrospectives: number;
    totalSprints: number;
    totalItems: number;
    byCategory: Array<{ category: string; count: number }>;
  }> {
    if (!this.db) {
      return {
        success: false,
        error: new EketError(EketErrorCode.SQLITE_NOT_CONNECTED, 'Database not connected'),
      };
    }

    try {
      // 总体统计
      const statsStmt = this.db.prepare(`
        SELECT
          COUNT(DISTINCT r.id) as totalRetrospectives,
          COUNT(DISTINCT r.sprint_id) as totalSprints,
          COUNT(rc.id) as totalItems
        FROM retrospectives r
        LEFT JOIN retro_content rc ON r.id = rc.retro_id
      `);
      const stats = statsStmt.get() as {
        totalRetrospectives: number;
        totalSprints: number;
        totalItems: number;
      };

      // 按类别统计
      const categoryStmt = this.db.prepare(`
        SELECT category, COUNT(*) as count
        FROM retro_content
        GROUP BY category
        ORDER BY count DESC
      `);
      const byCategory = categoryStmt.all() as Array<{ category: string; count: number }>;

      return {
        success: true,
        data: {
          ...stats,
          byCategory,
        },
      };
    } catch {
      return {
        success: false,
        error: new EketError(EketErrorCode.SQLITE_OPERATION_FAILED, 'Failed to generate report'),
      };
    }
  }

  /**
   * 保存执行检查点（INSERT OR REPLACE）
   */
  saveCheckpoint(checkpoint: {
    ticketId: string;
    slaverId: string;
    phase: 'analysis' | 'implement' | 'test' | 'pr';
    stateJson: string;
  }): Result<void> {
    if (!this.db) {
      return {
        success: false,
        error: new EketError(EketErrorCode.SQLITE_NOT_CONNECTED, 'Database not connected'),
      };
    }
    try {
      const stmt = this.db.prepare(`
        INSERT INTO execution_checkpoints (ticket_id, slaver_id, phase, state_json)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(ticket_id, slaver_id) DO UPDATE SET
          phase = excluded.phase,
          state_json = excluded.state_json,
          created_at = CURRENT_TIMESTAMP
      `);
      stmt.run(checkpoint.ticketId, checkpoint.slaverId, checkpoint.phase, checkpoint.stateJson);
      return { success: true, data: undefined };
    } catch {
      return {
        success: false,
        error: new EketError(EketErrorCode.SQLITE_OPERATION_FAILED, 'Failed to save checkpoint'),
      };
    }
  }

  /**
   * 加载执行检查点
   */
  loadCheckpoint(ticketId: string, slaverId: string): Result<unknown> {
    if (!this.db) {
      return {
        success: false,
        error: new EketError(EketErrorCode.SQLITE_NOT_CONNECTED, 'Database not connected'),
      };
    }
    try {
      const stmt = this.db.prepare(
        'SELECT * FROM execution_checkpoints WHERE ticket_id = ? AND slaver_id = ?'
      );
      const row = stmt.get(ticketId, slaverId);
      return { success: true, data: row ?? null };
    } catch {
      return {
        success: false,
        error: new EketError(EketErrorCode.SQLITE_OPERATION_FAILED, 'Failed to load checkpoint'),
      };
    }
  }

  /**
   * 原子事务领取 ticket（防止多 Slaver 竞争）
   * 使用事务确保 ticket 状态检查和更新的原子性
   *
   * @returns true 表示领取成功，false 表示已被他人抢占
   */
  claimTaskById(ticketId: string, slaverId: string): Result<boolean> {
    if (!this.db) {
      return {
        success: false,
        error: new EketError(EketErrorCode.SQLITE_NOT_CONNECTED, 'Database not connected'),
      };
    }
    try {
      const claimTx = this.db.transaction((): boolean => {
        // 检查是否已被领取（排他锁由事务保证）
        const existing = this.db!.prepare(
          "SELECT assigned_to FROM task_history WHERE ticket_id = ? AND status = 'in_progress'"
        ).get(ticketId) as { assigned_to: string } | undefined;

        if (existing) {
          return false; // 已被抢占
        }

        // 插入领取记录
        this.db!.prepare(
          "INSERT INTO task_history (ticket_id, status, assigned_to, started_at) VALUES (?, 'in_progress', ?, CURRENT_TIMESTAMP)"
        ).run(ticketId, slaverId);

        return true;
      });

      const claimed = claimTx() as boolean;
      return { success: true, data: claimed };
    } catch (e) {
      return {
        success: false,
        error: new EketError(EketErrorCode.SQLITE_OPERATION_FAILED, (e as Error).message),
      };
    }
  }

  /**
   * 删除执行检查点
   */
  deleteCheckpoint(ticketId: string, slaverId: string): Result<void> {
    if (!this.db) {
      return {
        success: false,
        error: new EketError(EketErrorCode.SQLITE_NOT_CONNECTED, 'Database not connected'),
      };
    }
    try {
      const stmt = this.db.prepare(
        'DELETE FROM execution_checkpoints WHERE ticket_id = ? AND slaver_id = ?'
      );
      stmt.run(ticketId, slaverId);
      return { success: true, data: undefined };
    } catch {
      return {
        success: false,
        error: new EketError(EketErrorCode.SQLITE_OPERATION_FAILED, 'Failed to delete checkpoint'),
      };
    }
  }

  /**
   * 追加 task message（seq 自动递增）
   */
  appendTaskMessage(taskId: string, msg: Omit<TaskMessage, 'id' | 'created_at'>): Result<void> {
    if (!this.db) {
      return {
        success: false,
        error: new EketError(EketErrorCode.SQLITE_NOT_CONNECTED, 'Database not connected'),
      };
    }
    try {
      const insert = this.db.transaction(() => {
        const row = this.db!
          .prepare('SELECT COALESCE(MAX(seq), -1) + 1 AS next_seq FROM task_messages WHERE task_id = ?')
          .get(taskId) as { next_seq: number };
        const seq = msg.seq !== undefined ? msg.seq : row.next_seq;
        this.db!
          .prepare(
            `INSERT INTO task_messages (task_id, seq, type, tool, content, input_json, output)
             VALUES (?, ?, ?, ?, ?, ?, ?)`
          )
          .run(taskId, seq, msg.type, msg.tool ?? null, msg.content ?? null, msg.input_json ?? null, msg.output ?? null);
      });
      insert();
      return { success: true, data: undefined };
    } catch (e) {
      return {
        success: false,
        error: new EketError(EketErrorCode.SQLITE_OPERATION_FAILED, (e as Error).message),
      };
    }
  }

  /**
   * 查询 task messages（按 seq ASC）
   */
  getTaskMessages(taskId: string): Result<TaskMessage[]> {
    if (!this.db) {
      return {
        success: false,
        error: new EketError(EketErrorCode.SQLITE_NOT_CONNECTED, 'Database not connected'),
      };
    }
    try {
      const rows = this.db
        .prepare('SELECT * FROM task_messages WHERE task_id = ? ORDER BY seq ASC')
        .all(taskId) as TaskMessage[];
      return { success: true, data: rows };
    } catch (e) {
      return {
        success: false,
        error: new EketError(EketErrorCode.SQLITE_OPERATION_FAILED, (e as Error).message),
      };
    }
  }

  /**
   * 设置 Agent 绑定的 Skills（全量替换）
   */
  setAgentSkills(agentId: string, skillIds: string[]): Result<void> {
    if (!this.db) {
      return {
        success: false,
        error: new EketError(EketErrorCode.SQLITE_NOT_CONNECTED, 'Database not connected'),
      };
    }
    try {
      const txn = this.db.transaction(() => {
        this.db!.prepare('DELETE FROM agent_skills WHERE agent_id = ?').run(agentId);
        const insert = this.db!.prepare(
          'INSERT OR IGNORE INTO agent_skills (agent_id, skill_id) VALUES (?, ?)'
        );
        for (const skillId of skillIds) {
          insert.run(agentId, skillId);
        }
      });
      txn();
      return { success: true, data: undefined };
    } catch (e) {
      return {
        success: false,
        error: new EketError(EketErrorCode.SQLITE_OPERATION_FAILED, (e as Error).message),
      };
    }
  }

  /**
   * 获取 Agent 绑定的 Skills
   */
  getAgentSkills(agentId: string): Result<string[]> {
    if (!this.db) {
      return {
        success: false,
        error: new EketError(EketErrorCode.SQLITE_NOT_CONNECTED, 'Database not connected'),
      };
    }
    try {
      const rows = this.db
        .prepare('SELECT skill_id FROM agent_skills WHERE agent_id = ? ORDER BY skill_id')
        .all(agentId) as Array<{ skill_id: string }>;
      return { success: true, data: rows.map((r) => r.skill_id) };
    } catch (e) {
      return {
        success: false,
        error: new EketError(EketErrorCode.SQLITE_OPERATION_FAILED, (e as Error).message),
      };
    }
  }

  /**
   * 插入知识块（FTS5 + 向量）
   */
  insertKnowledge(
    docId: string,
    content: string,
    sourcePath: string,
    embedding: number[],
  ): Result<void> {
    if (!this.db) {
      return {
        success: false,
        error: new EketError(EketErrorCode.SQLITE_NOT_CONNECTED, 'Database not connected'),
      };
    }
    try {
      this.db.prepare(`DELETE FROM knowledge_fts WHERE doc_id = ?`).run(docId);
      this.db.prepare(`INSERT INTO knowledge_fts(doc_id, content, source_path) VALUES (?, ?, ?)`).run(docId, content, sourcePath);
      this.db.prepare(
        `INSERT INTO knowledge_embeddings(doc_id, content, source_path, embedding)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(doc_id) DO UPDATE SET
           content = excluded.content,
           source_path = excluded.source_path,
           embedding = excluded.embedding`,
      ).run(docId, content, sourcePath, JSON.stringify(embedding));
      return { success: true, data: undefined };
    } catch (e: unknown) {
      return {
        success: false,
        error: new EketError(EketErrorCode.SQLITE_OPERATION_FAILED, `insertKnowledge failed: ${(e as Error).message}`),
      };
    }
  }

  /**
   * FTS5 全文检索
   */
  searchFTS(query: string, limit = 10): Result<Array<{ docId: string; content: string; sourcePath: string }>> {
    if (!this.db) {
      return {
        success: false,
        error: new EketError(EketErrorCode.SQLITE_NOT_CONNECTED, 'Database not connected'),
      };
    }
    try {
      const rows = this.db.prepare(
        `SELECT doc_id, content, source_path FROM knowledge_fts WHERE knowledge_fts MATCH ? LIMIT ?`,
      ).all(query, limit) as Array<{ doc_id: string; content: string; source_path: string }>;
      return {
        success: true,
        data: rows.map((r) => ({ docId: r.doc_id, content: r.content, sourcePath: r.source_path })),
      };
    } catch (e: unknown) {
      return {
        success: false,
        error: new EketError(EketErrorCode.SQLITE_OPERATION_FAILED, `searchFTS failed: ${(e as Error).message}`),
      };
    }
  }

  /**
   * 获取所有向量（用于余弦检索）
   */
  getAllEmbeddings(): Result<Array<{ docId: string; content: string; embedding: number[] }>> {
    if (!this.db) {
      return {
        success: false,
        error: new EketError(EketErrorCode.SQLITE_NOT_CONNECTED, 'Database not connected'),
      };
    }
    try {
      const rows = this.db.prepare(`SELECT doc_id, content, embedding FROM knowledge_embeddings`).all() as Array<{ doc_id: string; content: string; embedding: string }>;
      return {
        success: true,
        data: rows.map((r) => ({ docId: r.doc_id, content: r.content, embedding: JSON.parse(r.embedding) as number[] })),
      };
    } catch (e: unknown) {
      return {
        success: false,
        error: new EketError(EketErrorCode.SQLITE_OPERATION_FAILED, `getAllEmbeddings failed: ${(e as Error).message}`),
      };
    }
  }

  /**
   * 插入或替换 ticket（TASK-065: 用于测试）
   */
  insertTicket(ticket: {
    id: string;
    title?: string;
    status?: string;
    priority?: number;
  }): Result<void> {
    if (!this.db) {
      return {
        success: false,
        error: new EketError(EketErrorCode.SQLITE_NOT_CONNECTED, 'Database not connected'),
      };
    }
    try {
      this.db.prepare(
        `INSERT OR REPLACE INTO tickets (id, title, status, priority) VALUES (?, ?, ?, ?)`
      ).run(ticket.id, ticket.title ?? '', ticket.status ?? 'ready', ticket.priority ?? 0);
      return { success: true, data: undefined };
    } catch (e) {
      return {
        success: false,
        error: new EketError(EketErrorCode.SQLITE_OPERATION_FAILED, (e as Error).message),
      };
    }
  }

  /**
   * 原子性领取下一个可用任务（TASK-065）
   * 按优先级 DESC 取最高优先级 ready ticket，事务保证原子性
   * @returns 领取的 ticket，无可用 ticket 返回 null
   */
  claimTask(slaverId: string): Result<{
    id: string;
    title: string;
    status: string;
    priority: number;
    assignee: string | null;
    claimed_at: string | null;
    created_at: string;
  } | null> {
    if (!this.db) {
      return {
        success: false,
        error: new EketError(EketErrorCode.SQLITE_NOT_CONNECTED, 'Database not connected'),
      };
    }
    try {
      const db = this.db;
      type TicketRow = { id: string; title: string; status: string; priority: number; assignee: string | null; claimed_at: string | null; created_at: string };
      const claimTxn = db.transaction((): TicketRow | null => {
        const ticket = db.prepare(
          `SELECT id FROM tickets WHERE status = 'ready' ORDER BY priority DESC, created_at ASC LIMIT 1`
        ).get() as { id: string } | undefined;
        if (!ticket) {return null;}
        const result = db.prepare(
          `UPDATE tickets SET status = 'in_progress', assignee = ?, claimed_at = datetime('now') WHERE id = ? AND status = 'ready'`
        ).run(slaverId, ticket.id);
        if (result.changes !== 1) {return null;}
        return db.prepare('SELECT * FROM tickets WHERE id = ?').get(ticket.id) as TicketRow | undefined ?? null;
      });
      return { success: true, data: claimTxn() };
    } catch (e) {
      return {
        success: false,
        error: new EketError(EketErrorCode.SQLITE_OPERATION_FAILED, (e as Error).message),
      };
    }
  }

  /**
   * 注册或替换 SkillNode（INSERT OR REPLACE）
   */
  registerSkillNode(node: SkillNodeRecord): Promise<void> {
    if (!this.db) {
      return Promise.reject(new EketError(EketErrorCode.SQLITE_NOT_CONNECTED, 'Database not connected'));
    }
    try {
      this.db.prepare(`
        INSERT OR REPLACE INTO skill_nodes (id, type, domain, level, model_hint, triggers, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `).run(
        node.id,
        node.type,
        node.domain,
        node.level,
        node.model_hint ?? null,
        node.triggers ? JSON.stringify(node.triggers) : null,
      );
      return Promise.resolve();
    } catch (e: unknown) {
      return Promise.reject(new EketError(EketErrorCode.SQLITE_OPERATION_FAILED, (e as Error).message));
    }
  }

  /**
   * Upsert skill edge：存在则 co_activation_count++，否则插入
   */
  upsertSkillEdge(sourceId: string, targetId: string): Promise<void> {
    if (!this.db) {
      return Promise.reject(new EketError(EketErrorCode.SQLITE_NOT_CONNECTED, 'Database not connected'));
    }
    try {
      this.db.prepare(`
        INSERT INTO skill_edges (source_id, target_id)
        VALUES (?, ?)
        ON CONFLICT(source_id, target_id) DO UPDATE SET
          co_activation_count = co_activation_count + 1,
          last_activated_at = CURRENT_TIMESTAMP
      `).run(sourceId, targetId);
      return Promise.resolve();
    } catch (e: unknown) {
      return Promise.reject(new EketError(EketErrorCode.SQLITE_OPERATION_FAILED, (e as Error).message));
    }
  }

  /**
   * 更新 skill edge 权重（TASK-102b）
   * 若边存在：weight = clamp(weight + delta, 0, 1)，更新 last_activated_at
   * 若边不存在：插入 weight = clamp(0.5 + delta, 0, 1)
   * weight < 0.1 后软删除（active=0）
   */
  updateEdgeWeight(sourceId: string, targetId: string, delta: number): Promise<void> {
    if (!this.db) {
      return Promise.reject(new EketError(EketErrorCode.SQLITE_NOT_CONNECTED, 'Database not connected'));
    }
    try {
      const clamp = (v: number) => Math.min(1.0, Math.max(0.0, v));
      const existing = this.db.prepare(
        'SELECT weight FROM skill_edges WHERE source_id = ? AND target_id = ?'
      ).get(sourceId, targetId) as { weight: number } | undefined;

      if (existing) {
        const newWeight = clamp(existing.weight + delta);
        const active = newWeight < 0.1 ? 0 : 1;
        this.db.prepare(`
          UPDATE skill_edges
          SET weight = ?, active = ?, last_activated_at = CURRENT_TIMESTAMP
          WHERE source_id = ? AND target_id = ?
        `).run(newWeight, active, sourceId, targetId);
      } else {
        const newWeight = clamp(0.5 + delta);
        const active = newWeight < 0.1 ? 0 : 1;
        this.db.prepare(`
          INSERT INTO skill_edges (source_id, target_id, weight, active)
          VALUES (?, ?, ?, ?)
        `).run(sourceId, targetId, newWeight, active);
      }
      return Promise.resolve();
    } catch (e: unknown) {
      return Promise.reject(new EketError(EketErrorCode.SQLITE_OPERATION_FAILED, (e as Error).message));
    }
  }

  /**
   * 获取 topN 协作者（TASK-102b）
   * 查询 source_id=nodeId 或 target_id=nodeId 的 active=1 边
   * 应用时间衰减（超30天每30天 * 0.95），不写库
   */
  getTopCollaborators(nodeId: string, topN: number): Promise<SkillEdgeRecord[]> {
    if (!this.db) {
      return Promise.reject(new EketError(EketErrorCode.SQLITE_NOT_CONNECTED, 'Database not connected'));
    }
    try {
      const rows = this.db.prepare(`
        SELECT source_id, target_id, weight, co_activation_count, last_activated_at
        FROM skill_edges
        WHERE (source_id = ? OR target_id = ?) AND active = 1
      `).all(nodeId, nodeId) as Array<{
        source_id: string; target_id: string; weight: number;
        co_activation_count: number; last_activated_at: string;
      }>;

      const now = Date.now();
      const decayed = rows.map((r) => {
        const lastMs = new Date(r.last_activated_at).getTime();
        const daysDiff = (now - lastMs) / (1000 * 60 * 60 * 24);
        const overDays = Math.max(0, daysDiff - 30);
        const periods = overDays / 30;
        const decayedWeight = periods > 0 ? r.weight * Math.pow(0.95, periods) : r.weight;
        return { ...r, weight: decayedWeight };
      });

      decayed.sort((a, b) => b.weight - a.weight);
      return Promise.resolve(decayed.slice(0, topN));
    } catch (e: unknown) {
      return Promise.reject(new EketError(EketErrorCode.SQLITE_OPERATION_FAILED, (e as Error).message));
    }
  }

  /**
   * 保存 SkillFeedback 到 task_history（TASK-104b）
   */
  saveSkillFeedback(ticketId: string, feedback: SkillFeedback): Promise<void> {
    if (!this.db) {
      return Promise.reject(new EketError(EketErrorCode.SQLITE_NOT_CONNECTED, 'Database not connected'));
    }
    try {
      const json = JSON.stringify(feedback);
      const existing = this.db.prepare(
        "SELECT id FROM task_history WHERE ticket_id = ?"
      ).get(ticketId);
      if (existing) {
        this.db.prepare(
          "UPDATE task_history SET skill_feedback_json = ?, completed_at = CURRENT_TIMESTAMP WHERE ticket_id = ?"
        ).run(json, ticketId);
      } else {
        this.db.prepare(
          "INSERT INTO task_history (ticket_id, status, skill_feedback_json, completed_at) VALUES (?, 'done', ?, CURRENT_TIMESTAMP)"
        ).run(ticketId, json);
      }
      return Promise.resolve();
    } catch (e: unknown) {
      return Promise.reject(new EketError(EketErrorCode.SQLITE_OPERATION_FAILED, (e as Error).message));
    }
  }

  /**
   * 获取最近 N 小时内新增的未处理 skill_feedback（TASK-104b）
   */
  getUnprocessedFeedback(withinHours = 1): Promise<Array<{ id: number; ticketId: string; feedback: SkillFeedback }>> {
    if (!this.db) {
      return Promise.reject(new EketError(EketErrorCode.SQLITE_NOT_CONNECTED, 'Database not connected'));
    }
    try {
      const rows = this.db.prepare(`
        SELECT id, ticket_id, skill_feedback_json
        FROM task_history
        WHERE skill_feedback_json IS NOT NULL
          AND feedback_processed = 0
          AND created_at >= datetime('now', ? || ' hours')
      `).all(`-${withinHours}`) as Array<{ id: number; ticket_id: string; skill_feedback_json: string }>;

      const result = rows.map((r) => ({
        id: r.id,
        ticketId: r.ticket_id,
        feedback: JSON.parse(r.skill_feedback_json) as SkillFeedback,
      }));
      return Promise.resolve(result);
    } catch (e: unknown) {
      return Promise.reject(new EketError(EketErrorCode.SQLITE_OPERATION_FAILED, (e as Error).message));
    }
  }

  /**
   * 标记 feedback 为已处理（TASK-104b）
   */
  markFeedbackProcessed(id: number): Promise<void> {
    if (!this.db) {
      return Promise.reject(new EketError(EketErrorCode.SQLITE_NOT_CONNECTED, 'Database not connected'));
    }
    try {
      this.db.prepare('UPDATE task_history SET feedback_processed = 1 WHERE id = ?').run(id);
      return Promise.resolve();
    } catch (e: unknown) {
      return Promise.reject(new EketError(EketErrorCode.SQLITE_OPERATION_FAILED, (e as Error).message));
    }
  }

  /**
   * 获取 SkillNode（按 id）
   */
  getSkillNode(id: string): Promise<SkillNodeRecord | null> {
    if (!this.db) {
      return Promise.reject(new EketError(EketErrorCode.SQLITE_NOT_CONNECTED, 'Database not connected'));
    }
    try {
      const row = this.db.prepare('SELECT * FROM skill_nodes WHERE id = ?').get(id) as {
        id: string; type: 'skill' | 'expert'; domain: string; level: 1 | 2 | 3;
        model_hint: string | null; triggers: string | null;
      } | undefined;
      if (!row) {return Promise.resolve(null);}
      return Promise.resolve({
        id: row.id,
        type: row.type,
        domain: row.domain,
        level: row.level,
        model_hint: row.model_hint ?? undefined,
        triggers: row.triggers ? (JSON.parse(row.triggers) as string[]) : undefined,
      });
    } catch (e: unknown) {
      return Promise.reject(new EketError(EketErrorCode.SQLITE_OPERATION_FAILED, (e as Error).message));
    }
  }

}

/**
 * @deprecated 已废弃，请使用 createSQLiteManager 替代
 *
 * 创建默认 SQLite 客户端。此函数已被 createSQLiteManager 替代。
 *
 * @param dbPath - 数据库路径（可选）
 * @returns SQLiteClient 实例
 *
 * @example
 * ```typescript
 * // 旧代码
 * const client = createSQLiteClient(dbPath);
 *
 * // 新代码
 * const manager = createSQLiteManager({ dbPath });
 * ```
 *
 * @see createSQLiteManager - 新的工厂函数
 */
export function createSQLiteClient(dbPath?: string): SQLiteClient {
  return new SQLiteClient(dbPath);
}
