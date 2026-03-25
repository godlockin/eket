/**
 * SQLite Client Module
 * 用于数据持久化（Retrospective、任务历史等）
 */

import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import type { Retrospective, RetroContent, Result } from '../types/index.js';
import { EketError } from '../types/index.js';

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
        error: new EketError('SQLITE_CONNECTION_FAILED', 'Failed to connect SQLite'),
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
   * 初始化表结构
   */
  private initializeTables(): void {
    if (!this.db) return;

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
        error: new EketError('SQLITE_NOT_CONNECTED', 'Database not connected'),
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
        error: new EketError('SQLITE_OPERATION_FAILED', 'Failed to insert retrospective'),
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
        error: new EketError('SQLITE_NOT_CONNECTED', 'Database not connected'),
      };
    }

    try {
      const stmt = this.db.prepare('SELECT * FROM retrospectives WHERE sprint_id = ?');
      const retro = stmt.get(sprintId) as Retrospective | undefined;
      return { success: true, data: retro || null };
    } catch {
      return {
        success: false,
        error: new EketError('SQLITE_OPERATION_FAILED', 'Failed to get retrospective'),
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
        error: new EketError('SQLITE_NOT_CONNECTED', 'Database not connected'),
      };
    }

    try {
      const stmt = this.db.prepare('SELECT * FROM retrospectives ORDER BY date DESC');
      const retros = stmt.all() as Retrospective[];
      return { success: true, data: retros };
    } catch {
      return {
        success: false,
        error: new EketError('SQLITE_OPERATION_FAILED', 'Failed to list retrospectives'),
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
        error: new EketError('SQLITE_NOT_CONNECTED', 'Database not connected'),
      };
    }

    try {
      const stmt = this.db.prepare(`
        INSERT INTO retro_content (retro_id, category, content, created_by)
        VALUES (?, ?, ?, ?)
      `);

      const result = stmt.run(content.retroId, content.category, content.content, content.createdBy);
      return { success: true, data: result.lastInsertRowid as number };
    } catch {
      return {
        success: false,
        error: new EketError('SQLITE_OPERATION_FAILED', 'Failed to insert retro content'),
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
        error: new EketError('SQLITE_NOT_CONNECTED', 'Database not connected'),
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
        error: new EketError('SQLITE_OPERATION_FAILED', 'Failed to get retro content'),
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
        error: new EketError('SQLITE_NOT_CONNECTED', 'Database not connected'),
      };
    }

    try {
      const stmt = this.db.prepare(`
        SELECT DISTINCT r.*
        FROM retrospectives r
        JOIN retro_content rc ON r.id = rc.retro_id
        WHERE r.title LIKE ? OR rc.content LIKE ?
        ORDER BY r.date DESC
        LIMIT 10
      `);

      const searchPattern = `%${keyword}%`;
      const retros = stmt.all(searchPattern, searchPattern) as Retrospective[];
      return { success: true, data: retros };
    } catch {
      return {
        success: false,
        error: new EketError('SQLITE_OPERATION_FAILED', 'Failed to search retrospectives'),
      };
    }
  }

  /**
   * 生成统计报告
   */
  generateReport(): Result<{
    totalRetrospectives: number;
    totalSprints: number;
    totalItems: number;
    byCategory: { category: string; count: number }[];
  }> {
    if (!this.db) {
      return {
        success: false,
        error: new EketError('SQLITE_NOT_CONNECTED', 'Database not connected'),
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
      const byCategory = categoryStmt.all() as { category: string; count: number }[];

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
        error: new EketError('SQLITE_OPERATION_FAILED', 'Failed to generate report'),
      };
    }
  }
}

/**
 * 创建默认 SQLite 客户端
 */
export function createSQLiteClient(dbPath?: string): SQLiteClient {
  return new SQLiteClient(dbPath);
}
