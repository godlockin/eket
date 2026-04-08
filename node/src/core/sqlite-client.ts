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

import type { Retrospective, RetroContent, Result } from '../types/index.js';
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
      // 默认路径：~/.eket/data/sqlite/eket.db
      const homeDir = process.env.HOME || process.env.USERPROFILE || '.';
      this.dbPath = path.join(homeDir, '.eket', 'data', 'sqlite', 'eket.db');
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
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
      CREATE INDEX IF NOT EXISTS idx_message_type ON message_history(type);
    `);
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
