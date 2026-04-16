/**
 * SQLite Sync Adapter
 * 将 SQLiteClient 的同步 API 包装为异步接口，实现 ISQLiteClient
 *
 * 目的：统一接口，支持 SQLiteManager 自动选择实现
 */

import type { ISQLiteClient, Result } from '../types/index.js';

import { SQLiteClient } from './sqlite-client.js';

/**
 * 同步 SQLite 客户端适配器
 * 包装 SQLiteClient 的同步方法为异步接口
 */
export class SyncSQLiteAdapter implements ISQLiteClient {
  private client: SQLiteClient;

  constructor(dbPath?: string) {
    this.client = new SQLiteClient(dbPath);
  }

  /**
   * 连接数据库（包装为异步）
   */
  async connect(): Promise<Result<void>> {
    return this.client.connect();
  }

  /**
   * 关闭数据库（包装为异步）
   */
  async close(): Promise<void> {
    this.client.close();
  }

  /**
   * 检查连接状态
   */
  isReady(): boolean {
    return this.client.isReady();
  }

  /**
   * 执行 SQL（包装为异步）
   */
  async execute(sql: string, params: unknown[] = []): Promise<Result<void>> {
    return this.client.execute(sql, params);
  }

  /**
   * 查询单行（包装为异步）
   */
  async get(sql: string, params: unknown[] = []): Promise<Result<unknown>> {
    return this.client.get(sql, params);
  }

  /**
   * 查询多行（包装为异步）
   */
  async all(sql: string, params: unknown[] = []): Promise<Result<unknown[]>> {
    return this.client.all(sql, params);
  }

  /**
   * 插入 Retrospective（包装为异步）
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
   * 查询 Retrospective（包装为异步）
   */
  async getRetrospective(sprintId: string): Promise<Result<unknown>> {
    return this.client.getRetrospective(sprintId);
  }

  /**
   * 列出所有 Retrospective（包装为异步）
   */
  async listRetrospectives(): Promise<Result<unknown[]>> {
    return this.client.listRetrospectives();
  }

  /**
   * 插入 Retrospective 内容（包装为异步）
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
   * 按类别查询内容（包装为异步）
   */
  async getRetroContentByCategory(retroId: number, category: string): Promise<Result<unknown[]>> {
    return this.client.getRetroContentByCategory(retroId, category);
  }

  /**
   * 搜索 Retrospective（包装为异步）
   */
  async searchRetrospectives(keyword: string): Promise<Result<unknown[]>> {
    return this.client.searchRetrospectives(keyword);
  }

  /**
   * 生成统计报告（包装为异步）
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

  /**
   * 保存执行检查点（包装为异步）
   */
  async saveCheckpoint(checkpoint: {
    ticketId: string;
    slaverId: string;
    phase: 'analysis' | 'implement' | 'test' | 'pr';
    stateJson: string;
  }): Promise<Result<void>> {
    return this.client.saveCheckpoint(checkpoint);
  }

  /**
   * 加载执行检查点（包装为异步）
   */
  async loadCheckpoint(ticketId: string, slaverId: string): Promise<Result<unknown>> {
    return this.client.loadCheckpoint(ticketId, slaverId);
  }

  /**
   * 删除执行检查点（包装为异步）
   */
  async deleteCheckpoint(ticketId: string, slaverId: string): Promise<Result<void>> {
    return this.client.deleteCheckpoint(ticketId, slaverId);
  }

  /**
   * 获取底层 SQLiteClient 实例（用于调试）
   */
  getUnderlyingClient(): SQLiteClient {
    return this.client;
  }

  /**
   * 获取底层 better-sqlite3 Database 实例（用于高级操作）
   *
   * ⚠️ 警告：直接使用 Database 实例会绕过适配器层，谨慎使用
   */
  getDB(): ReturnType<SQLiteClient['getDB']> {
    return this.client.getDB();
  }
}

/**
 * 工厂函数 - 创建同步适配器
 */
export function createSyncSQLiteAdapter(dbPath?: string): SyncSQLiteAdapter {
  return new SyncSQLiteAdapter(dbPath);
}
