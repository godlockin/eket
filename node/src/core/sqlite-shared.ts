/**
 * SQLite Shared Utilities
 * 共享工具函数，供 SQLiteClient 和 AsyncSQLiteClient 使用
 *
 * 目的：消除重复代码，提升可维护性
 */

import * as path from 'path';
import Database from 'better-sqlite3';

/**
 * 获取默认数据库路径
 * 默认：~/.eket/data/sqlite/eket.db
 */
export function getDefaultDBPath(): string {
  const homeDir = process.env.HOME || process.env.USERPROFILE || '.';
  return path.join(homeDir, '.eket', 'data', 'sqlite', 'eket.db');
}

/**
 * 初始化数据库表结构
 * 被 SQLiteClient 和 AsyncSQLiteClient Worker 调用
 *
 * @param db - better-sqlite3 数据库实例
 */
export function initializeTables(db: Database.Database): void {
  db.exec(`
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
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
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
 * 转义 SQL LIKE 语句中的通配符
 * 防止 LIKE 注入攻击
 *
 * @param str - 用户输入字符串
 * @returns 转义后的安全字符串
 *
 * @example
 * escapeLikePattern("test%") // "test\\%"
 * escapeLikePattern("test_") // "test\\_"
 */
export function escapeLikePattern(str: string): string {
  // 转义 \ 必须在最前面，避免重复转义
  return str.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

/**
 * 格式化数据库路径（用于日志输出）
 *
 * @param dbPath - 数据库路径
 * @returns 格式化后的路径字符串
 */
export function formatDBPath(dbPath: string): string {
  // 如果路径包含 HOME 目录，替换为 ~
  const homeDir = process.env.HOME || process.env.USERPROFILE;
  if (homeDir && dbPath.startsWith(homeDir)) {
    return dbPath.replace(homeDir, '~');
  }
  return dbPath;
}
