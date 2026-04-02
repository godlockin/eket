/**
 * EKET Framework - Knowledge Base
 * Phase 6.1: Multi-Instance Collaboration
 *
 * 知识库系统，支持 Instance 之间的知识共享：
 * - 产物（artifact）：代码、文档、配置等
 * - 模式（pattern）：设计模式、最佳实践
 * - 决策（decision）：架构决策、技术选型
 * - 经验教训（lesson）：踩坑记录、解决方案
 * - API 信息：接口文档、调用示例
 * - 配置信息：环境配置、部署参数
 */

import type { KnowledgeEntry, Result } from '../types/index.js';
import { EketError } from '../types/index.js';

import { createSQLiteClient, type SQLiteClient } from './sqlite-client.js';

/**
 * 知识条目查询选项
 */
export interface KnowledgeQueryOptions {
  type?: KnowledgeEntry['type'];
  tags?: string[];
  createdBy?: string;
  relatedTicket?: string;
  keyword?: string;
  limit?: number;
  offset?: number;
}

/**
 * 知识条目创建请求
 */
export interface CreateKnowledgeEntryRequest {
  type: KnowledgeEntry['type'];
  title: string;
  description: string;
  content: string;
  tags: string[];
  createdBy: string;
  relatedTickets?: string[];
  metadata?: Record<string, unknown>;
}

/**
 * 知识条目更新请求
 */
export interface UpdateKnowledgeEntryRequest {
  id: string;
  title?: string;
  description?: string;
  content?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

/**
 * 知识库统计信息
 */
export interface KnowledgeStats {
  totalEntries: number;
  byType: Record<KnowledgeEntry['type'], number>;
  byTag: Map<string, number>;
  recentEntries: KnowledgeEntry[];
}

/**
 * 知识库类
 */
export class KnowledgeBase {
  private sqlite: SQLiteClient;

  constructor() {
    this.sqlite = createSQLiteClient();
  }

  /**
   * 连接数据库并初始化表结构
   */
  async connect(): Promise<Result<void>> {
    const result = this.sqlite.connect();
    if (!result.success) {
      return result;
    }

    await this.initializeTables();

    console.log('[KnowledgeBase] Connected and initialized');
    return { success: true, data: undefined };
  }

  /**
   * 断开连接
   */
  async disconnect(): Promise<void> {
    this.sqlite.close();
    console.log('[KnowledgeBase] Disconnected');
  }

  /**
   * 初始化数据库表
   */
  private async initializeTables(): Promise<void> {
    const db = this.sqlite.getDB();
    if (!db) {
      throw new Error('Database not connected');
    }

    const tableName = 'knowledge_base';
    db.exec(`
      CREATE TABLE IF NOT EXISTS ${tableName} (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        content TEXT NOT NULL,
        tags TEXT,
        createdBy TEXT NOT NULL,
        createdAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL,
        relatedTickets TEXT,
        metadata TEXT
      )
    `);

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_knowledge_type ON ${tableName}(type)
    `);
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_knowledge_createdBy ON ${tableName}(createdBy)
    `);
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_knowledge_createdAt ON ${tableName}(createdAt DESC)
    `);

    console.log('[KnowledgeBase] Tables initialized');
  }

  /**
   * 创建知识条目
   */
  async createEntry(request: CreateKnowledgeEntryRequest): Promise<Result<string>> {
    const db = this.sqlite.getDB();
    if (!db) {
      return {
        success: false,
        error: new EketError('DB_NOT_CONNECTED', 'Database not connected'),
      };
    }

    const now = Date.now();
    const id = this.generateEntryId();

    const entry: KnowledgeEntry = {
      id,
      type: request.type,
      title: request.title,
      description: request.description,
      content: request.content,
      tags: request.tags,
      createdBy: request.createdBy,
      createdAt: now,
      updatedAt: now,
      relatedTickets: request.relatedTickets,
      metadata: request.metadata,
    };

    try {
      const stmt = db.prepare(`
        INSERT INTO knowledge_base (
          id, type, title, description, content, tags,
          createdBy, createdAt, updatedAt, relatedTickets, metadata
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        id,
        entry.type,
        entry.title,
        entry.description,
        entry.content,
        JSON.stringify(entry.tags),
        entry.createdBy,
        entry.createdAt,
        entry.updatedAt,
        entry.relatedTickets ? JSON.stringify(entry.relatedTickets) : null,
        entry.metadata ? JSON.stringify(entry.metadata) : null
      );

      console.log(`[KnowledgeBase] Created entry: ${id} (${entry.title})`);
      return { success: true, data: id };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      return {
        success: false,
        error: new EketError('ENTRY_CREATE_FAILED', `Failed to create entry: ${errorMessage}`),
      };
    }
  }

  /**
   * 获取知识条目
   */
  async getEntry(id: string): Promise<Result<KnowledgeEntry | null>> {
    const db = this.sqlite.getDB();
    if (!db) {
      return {
        success: false,
        error: new EketError('DB_NOT_CONNECTED', 'Database not connected'),
      };
    }

    try {
      const stmt = db.prepare(`SELECT * FROM knowledge_base WHERE id = ?`);
      const row = stmt.get(id) as Record<string, unknown> | undefined;

      if (!row) {
        return { success: true, data: null };
      }

      const entry = this.rowToEntry(row);
      return { success: true, data: entry };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      return {
        success: false,
        error: new EketError('ENTRY_FETCH_FAILED', `Failed to fetch entry: ${errorMessage}`),
      };
    }
  }

  /**
   * 查询知识条目
   */
  async queryEntries(options: KnowledgeQueryOptions = {}): Promise<Result<KnowledgeEntry[]>> {
    const db = this.sqlite.getDB();
    if (!db) {
      return {
        success: false,
        error: new EketError('DB_NOT_CONNECTED', 'Database not connected'),
      };
    }

    try {
      let query = 'SELECT * FROM knowledge_base WHERE 1=1';
      const params: Array<string | number> = [];

      if (options.type) {
        query += ' AND type = ?';
        params.push(options.type);
      }

      if (options.createdBy) {
        query += ' AND createdBy = ?';
        params.push(options.createdBy);
      }

      if (options.relatedTicket) {
        query += ' AND relatedTickets LIKE ?';
        params.push(`%${options.relatedTicket}%`);
      }

      if (options.keyword) {
        query += ` AND (title LIKE ? OR description LIKE ? OR content LIKE ?)`;
        const keyword = `%${options.keyword}%`;
        params.push(keyword, keyword, keyword);
      }

      if (options.tags && options.tags.length > 0) {
        for (const tag of options.tags) {
          query += ' AND tags LIKE ?';
          params.push(`%"${tag}"%`);
        }
      }

      query += ' ORDER BY createdAt DESC';

      const limit = options.limit || 100;
      const offset = options.offset || 0;
      query += ' LIMIT ? OFFSET ?';
      params.push(limit, offset);

      const stmt = db.prepare(query);
      const rows = stmt.all(...params) as Array<Record<string, unknown>>;

      const entries = rows.map((row) => this.rowToEntry(row));
      return { success: true, data: entries };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      return {
        success: false,
        error: new EketError('ENTRY_QUERY_FAILED', `Failed to query entries: ${errorMessage}`),
      };
    }
  }

  /**
   * 更新知识条目
   */
  async updateEntry(request: UpdateKnowledgeEntryRequest): Promise<Result<void>> {
    const db = this.sqlite.getDB();
    if (!db) {
      return {
        success: false,
        error: new EketError('DB_NOT_CONNECTED', 'Database not connected'),
      };
    }

    const existingResult = await this.getEntry(request.id);
    if (!existingResult.success) {
      return existingResult;
    }
    if (!existingResult.data) {
      return {
        success: false,
        error: new EketError('ENTRY_NOT_FOUND', `Entry ${request.id} not found`),
      };
    }

    const existing = existingResult.data;
    const updated: KnowledgeEntry = {
      ...existing,
      title: request.title ?? existing.title,
      description: request.description ?? existing.description,
      content: request.content ?? existing.content,
      tags: request.tags ?? existing.tags,
      metadata: request.metadata ?? existing.metadata,
      updatedAt: Date.now(),
    };

    try {
      const stmt = db.prepare(`
        UPDATE knowledge_base
        SET title = ?, description = ?, content = ?, tags = ?,
            metadata = ?, updatedAt = ?
        WHERE id = ?
      `);

      stmt.run(
        updated.title,
        updated.description,
        updated.content,
        JSON.stringify(updated.tags),
        updated.metadata ? JSON.stringify(updated.metadata) : null,
        updated.updatedAt,
        updated.id
      );

      console.log(`[KnowledgeBase] Updated entry: ${updated.id}`);
      return { success: true, data: undefined };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      return {
        success: false,
        error: new EketError('ENTRY_UPDATE_FAILED', `Failed to update entry: ${errorMessage}`),
      };
    }
  }

  /**
   * 删除知识条目
   */
  async deleteEntry(id: string): Promise<Result<void>> {
    const db = this.sqlite.getDB();
    if (!db) {
      return {
        success: false,
        error: new EketError('DB_NOT_CONNECTED', 'Database not connected'),
      };
    }

    try {
      const stmt = db.prepare(`DELETE FROM knowledge_base WHERE id = ?`);
      const result = stmt.run(id);

      if (result.changes === 0) {
        return {
          success: false,
          error: new EketError('ENTRY_NOT_FOUND', `Entry ${id} not found`),
        };
      }

      console.log(`[KnowledgeBase] Deleted entry: ${id}`);
      return { success: true, data: undefined };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      return {
        success: false,
        error: new EketError('ENTRY_DELETE_FAILED', `Failed to delete entry: ${errorMessage}`),
      };
    }
  }

  /**
   * 获取统计信息
   */
  async getStats(): Promise<Result<KnowledgeStats>> {
    const db = this.sqlite.getDB();
    if (!db) {
      return {
        success: false,
        error: new EketError('DB_NOT_CONNECTED', 'Database not connected'),
      };
    }

    try {
      const totalRow = db.prepare(`SELECT COUNT(*) as count FROM knowledge_base`).get() as {
        count: number;
      };

      const typeRows = db
        .prepare(
          `
        SELECT type, COUNT(*) as count FROM knowledge_base GROUP BY type
      `
        )
        .all() as Array<{ type: string; count: number }>;

      const byType: Record<KnowledgeEntry['type'], number> = {
        artifact: 0,
        pattern: 0,
        decision: 0,
        lesson: 0,
        api: 0,
        config: 0,
      };
      for (const row of typeRows) {
        byType[row.type as KnowledgeEntry['type']] = row.count;
      }

      const allRows = db.prepare(`SELECT tags FROM knowledge_base`).all() as Array<{
        tags: string;
      }>;
      const byTag = new Map<string, number>();
      for (const row of allRows) {
        try {
          const tags = JSON.parse(row.tags) as string[];
          for (const tag of tags) {
            byTag.set(tag, (byTag.get(tag) || 0) + 1);
          }
        } catch {
          // Ignore parse errors
        }
      }

      const recentRows = db
        .prepare(
          `
        SELECT * FROM knowledge_base ORDER BY createdAt DESC LIMIT 10
      `
        )
        .all() as Array<Record<string, unknown>>;
      const recentEntries = recentRows.map((row) => this.rowToEntry(row));

      const stats: KnowledgeStats = {
        totalEntries: totalRow.count,
        byType,
        byTag,
        recentEntries,
      };

      return { success: true, data: stats };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      return {
        success: false,
        error: new EketError('STATS_FETCH_FAILED', `Failed to fetch stats: ${errorMessage}`),
      };
    }
  }

  /**
   * 通过标签搜索
   */
  async searchByTag(tag: string): Promise<Result<KnowledgeEntry[]>> {
    return this.queryEntries({ tags: [tag] });
  }

  /**
   * 通过关键字搜索
   */
  async search(keyword: string, limit = 20): Promise<Result<KnowledgeEntry[]>> {
    return this.queryEntries({ keyword, limit });
  }

  /**
   * 获取特定类型的条目
   */
  async getByType(type: KnowledgeEntry['type'], limit = 50): Promise<Result<KnowledgeEntry[]>> {
    return this.queryEntries({ type, limit });
  }

  /**
   * 获取特定创建者的条目
   */
  async getByCreator(createdBy: string, limit = 50): Promise<Result<KnowledgeEntry[]>> {
    return this.queryEntries({ createdBy, limit });
  }

  /**
   * 将数据库行转换为 KnowledgeEntry
   */
  private rowToEntry(row: Record<string, unknown>): KnowledgeEntry {
    return {
      id: row.id as string,
      type: row.type as KnowledgeEntry['type'],
      title: row.title as string,
      description: row.description as string,
      content: row.content as string,
      tags: this.parseJson(row.tags as string, []),
      createdBy: row.createdBy as string,
      createdAt: row.createdAt as number,
      updatedAt: row.updatedAt as number,
      relatedTickets: this.parseJson(row.relatedTickets as string, undefined),
      metadata: this.parseJson(row.metadata as string, undefined),
    };
  }

  /**
   * 解析 JSON 字符串
   */
  private parseJson<T>(str: string | null | undefined, defaultValue: T): T {
    if (!str) {
      return defaultValue;
    }
    try {
      return JSON.parse(str) as T;
    } catch {
      return defaultValue;
    }
  }

  /**
   * 生成条目 ID
   */
  private generateEntryId(): string {
    return `kb_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }
}

/**
 * 创建知识库实例
 */
export function createKnowledgeBase(): KnowledgeBase {
  return new KnowledgeBase();
}

/**
 * 创建产物类知识条目
 */
export async function createArtifact(
  db: KnowledgeBase,
  title: string,
  content: string,
  createdBy: string,
  options: {
    description?: string;
    tags?: string[];
    relatedTickets?: string[];
    metadata?: Record<string, unknown>;
  } = {}
): Promise<Result<string>> {
  return db.createEntry({
    type: 'artifact',
    title,
    description: options.description || 'Code artifact or documentation',
    content,
    tags: options.tags || [],
    createdBy,
    relatedTickets: options.relatedTickets,
    metadata: options.metadata,
  });
}

/**
 * 创建经验教训类知识条目
 */
export async function createLesson(
  db: KnowledgeBase,
  title: string,
  content: string,
  createdBy: string,
  options: {
    description?: string;
    tags?: string[];
    relatedTickets?: string[];
  } = {}
): Promise<Result<string>> {
  return db.createEntry({
    type: 'lesson',
    title,
    description: options.description || 'Lesson learned from experience',
    content,
    tags: options.tags || ['lesson', 'experience'],
    createdBy,
    relatedTickets: options.relatedTickets,
  });
}

/**
 * 创建决策记录类知识条目
 */
export async function createDecision(
  db: KnowledgeBase,
  title: string,
  content: string,
  createdBy: string,
  options: {
    description?: string;
    tags?: string[];
    relatedTickets?: string[];
    metadata?: Record<string, unknown>;
  } = {}
): Promise<Result<string>> {
  return db.createEntry({
    type: 'decision',
    title,
    description: options.description || 'Architecture or technical decision record',
    content,
    tags: options.tags || ['decision', 'adr'],
    createdBy,
    relatedTickets: options.relatedTickets,
    metadata: options.metadata,
  });
}
