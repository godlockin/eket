/**
 * SQLite Manager - 统一 SQLite 客户端管理
 * 根据配置自动选择同步或异步实现
 *
 * 架构：
 * SQLiteManager (统一接口)
 *     ├─→ SyncSQLiteAdapter (包装器) → SQLiteClient (同步实现)
 *     └─→ AsyncSQLiteClient (Worker 异步实现)
 *
 * 特性：
 * 1. 统一接口：对外提供 ISQLiteClient 接口
 * 2. 自动选择：根据配置选择同步/异步实现
 * 3. 自动降级：Worker 失败时降级到同步实现
 * 4. 可测试性：支持依赖注入和 Mock
 */

import type { ISQLiteClient, Result } from '../types/index.js';
import { SyncSQLiteAdapter } from './sqlite-sync-adapter.js';
import { AsyncSQLiteClient } from './sqlite-async-client.js';

/**
 * SQLite Manager 配置
 */
export interface SQLiteManagerConfig {
  /** 数据库路径（可选，默认 ~/.eket/data/sqlite/eket.db） */
  dbPath?: string;

  /** 是否使用 Worker 异步实现（默认 false，使用同步） */
  useWorker?: boolean;

  /** 是否启用自动降级（Worker 失败时降级到同步，默认 true） */
  autoFallback?: boolean;

  /** Worker 超时时间（毫秒，默认 30000） */
  workerTimeout?: number;
}

/**
 * SQLite Manager - 统一管理类
 * 实现 ISQLiteClient 接口，自动选择底层实现
 */
export class SQLiteManager implements ISQLiteClient {
  private client: ISQLiteClient;
  private config: Required<SQLiteManagerConfig>;
  private usingWorker: boolean;

  constructor(config: SQLiteManagerConfig = {}) {
    // 合并默认配置
    this.config = {
      dbPath: config.dbPath || '',
      useWorker: config.useWorker ?? false,
      autoFallback: config.autoFallback ?? true,
      workerTimeout: config.workerTimeout ?? 30000,
    };

    // 根据配置选择实现
    if (this.config.useWorker) {
      this.client = new AsyncSQLiteClient(this.config.dbPath || undefined);
      this.usingWorker = true;
    } else {
      this.client = new SyncSQLiteAdapter(this.config.dbPath || undefined);
      this.usingWorker = false;
    }
  }

  /**
   * 连接数据库（带自动降级）
   */
  async connect(): Promise<Result<void>> {
    const result = await this.client.connect();

    // 如果 Worker 失败且启用自动降级，切换到同步实现
    if (!result.success && this.config.autoFallback && this.usingWorker) {
      console.warn('[SQLiteManager] Worker failed, falling back to sync implementation');
      console.warn(`[SQLiteManager] Error: ${result.error?.message}`);

      // 切换到同步适配器
      this.client = new SyncSQLiteAdapter(this.config.dbPath || undefined);
      this.usingWorker = false;

      // 重新尝试连接
      return this.client.connect();
    }

    return result;
  }

  /**
   * 关闭数据库连接
   */
  async close(): Promise<void> {
    return this.client.close();
  }

  /**
   * 检查连接状态
   */
  isReady(): boolean {
    return this.client.isReady();
  }

  /**
   * 获取底层实现类型（用于调试）
   */
  getImplementationType(): 'sync' | 'async' {
    return this.usingWorker ? 'async' : 'sync';
  }

  /**
   * 获取配置（用于调试）
   */
  getConfig(): Readonly<Required<SQLiteManagerConfig>> {
    return { ...this.config };
  }

  /**
   * 获取底层 better-sqlite3 Database 实例（仅同步模式可用）
   *
   * ⚠️ 警告：
   * - 仅在使用同步模式时可用
   * - 直接使用 Database 实例会绕过管理层，谨慎使用
   * - 异步模式（Worker）无法提供此方法，会返回 null
   *
   * @returns Database 实例（同步模式）或 null（异步模式）
   */
  getDB() {
    if (this.usingWorker) {
      return null;
    }
    // Type assertion safe because we know it's SyncSQLiteAdapter when !usingWorker
    const syncAdapter = this.client as any;
    return syncAdapter.getDB ? syncAdapter.getDB() : null;
  }

  // ========================================
  // === 以下方法代理到底层实现 ===
  // ========================================

  /**
   * 执行 SQL 语句
   */
  async execute(sql: string, params: unknown[] = []): Promise<Result<void>> {
    return this.client.execute(sql, params);
  }

  /**
   * 查询单行数据
   */
  async get(sql: string, params: unknown[] = []): Promise<Result<unknown>> {
    return this.client.get(sql, params);
  }

  /**
   * 查询多行数据
   */
  async all(sql: string, params: unknown[] = []): Promise<Result<unknown[]>> {
    return this.client.all(sql, params);
  }

  /**
   * 插入 Retrospective
   */
  async insertRetrospective(retro: {
    sprintId: string;
    fileName: string;
    title: string;
    date: string;
  }): Promise<Result<number>> {
    return this.client.insertRetrospective(retro);
  }

  /**
   * 查询 Retrospective
   */
  async getRetrospective(sprintId: string): Promise<Result<unknown>> {
    return this.client.getRetrospective(sprintId);
  }

  /**
   * 列出所有 Retrospective
   */
  async listRetrospectives(): Promise<Result<unknown[]>> {
    return this.client.listRetrospectives();
  }

  /**
   * 插入 Retrospective 内容
   */
  async insertRetroContent(content: {
    retroId: number;
    category: string;
    content: string;
    createdBy?: string;
  }): Promise<Result<number>> {
    return this.client.insertRetroContent(content);
  }

  /**
   * 按类别查询内容
   */
  async getRetroContentByCategory(retroId: number, category: string): Promise<Result<unknown[]>> {
    return this.client.getRetroContentByCategory(retroId, category);
  }

  /**
   * 搜索 Retrospective（按关键词）
   */
  async searchRetrospectives(keyword: string): Promise<Result<unknown[]>> {
    return this.client.searchRetrospectives(keyword);
  }

  /**
   * 生成统计报告
   */
  async generateReport(): Promise<
    Result<{
      totalRetrospectives: number;
      totalSprints: number;
      totalItems: number;
      byCategory: Array<{ category: string; count: number }>;
    }>
  > {
    return this.client.generateReport();
  }
}

/**
 * 工厂函数 - 推荐使用
 *
 * @example
 * // 使用默认同步实现
 * const manager = createSQLiteManager();
 *
 * // 使用 Worker 异步实现
 * const asyncManager = createSQLiteManager({ useWorker: true });
 *
 * // 自定义数据库路径
 * const customManager = createSQLiteManager({ dbPath: '/path/to/db.sqlite' });
 */
export function createSQLiteManager(config?: SQLiteManagerConfig): SQLiteManager {
  return new SQLiteManager(config);
}
