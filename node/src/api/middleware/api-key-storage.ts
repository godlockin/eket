/**
 * API Key 持久化存储模块
 *
 * 使用 SQLite 存储 API Key 元数据，支持持久化、查询、吊销等操作
 *
 * @module api-key-storage
 */

import { SQLiteClient } from '../../core/sqlite-client.js';

export interface ApiKeyRecord {
  id: string;
  name: string;
  keyHash: string;
  userId: string;
  createdAt: number;
  expiresAt?: number;
  revokedAt?: number;
  lastUsedAt?: number;
  permissions: string[];
}

export class ApiKeyStorage {
  private static readonly TABLE_SQL = `
    CREATE TABLE IF NOT EXISTS api_keys (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      key_hash TEXT UNIQUE NOT NULL,
      user_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER,
      revoked_at INTEGER,
      last_used_at INTEGER,
      permissions TEXT
    )
  `;

  private initialized = false;

  constructor(private db: SQLiteClient) {}

  /**
   * 初始化表结构
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    const result = this.db.execute(ApiKeyStorage.TABLE_SQL);
    if (!result.success) {
      throw new Error(`Failed to initialize api_keys table: ${result.error?.message}`);
    }

    this.initialized = true;
    console.log('[ApiKeyStorage] Table initialized');
  }

  /**
   * 创建新的 API Key 记录
   */
  async create(key: ApiKeyRecord): Promise<void> {
    const result = this.db.execute(
      `
      INSERT INTO api_keys (id, name, key_hash, user_id, created_at, expires_at, permissions)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
      [
        key.id,
        key.name,
        key.keyHash,
        key.userId,
        key.createdAt,
        key.expiresAt,
        JSON.stringify(key.permissions),
      ]
    );

    if (!result.success) {
      throw new Error(`Failed to create API key: ${result.error?.message}`);
    }
  }

  /**
   * 通过哈希查询 API Key
   */
  async getByHash(keyHash: string): Promise<ApiKeyRecord | null> {
    const result = this.db.get(
      `
      SELECT * FROM api_keys
      WHERE key_hash = ? AND revoked_at IS NULL
    `,
      [keyHash]
    );

    if (!result.success || !result.data) {
      return null;
    }

    const row = result.data as Record<string, unknown>;
    return this.rowToRecord(row);
  }

  /**
   * 通过 ID 查询 API Key
   */
  async getById(keyId: string): Promise<ApiKeyRecord | null> {
    const result = this.db.get(
      `
      SELECT * FROM api_keys WHERE id = ?
    `,
      [keyId]
    );

    if (!result.success || !result.data) {
      return null;
    }

    const row = result.data as Record<string, unknown>;
    return this.rowToRecord(row);
  }

  /**
   * 更新最后使用时间
   */
  async updateLastUsed(keyId: string): Promise<void> {
    const result = this.db.execute(
      `
      UPDATE api_keys SET last_used_at = ? WHERE id = ?
    `,
      [Date.now(), keyId]
    );

    if (!result.success) {
      throw new Error(`Failed to update last_used_at: ${result.error?.message}`);
    }
  }

  /**
   * 吊销 API Key
   */
  async revoke(keyId: string): Promise<void> {
    const result = this.db.execute(
      `
      UPDATE api_keys SET revoked_at = ? WHERE id = ?
    `,
      [Date.now(), keyId]
    );

    if (!result.success) {
      throw new Error(`Failed to revoke API key: ${result.error?.message}`);
    }
  }

  /**
   * 列出所有 API Keys
   * @param userId 可选，按用户过滤
   */
  async list(userId?: string): Promise<ApiKeyRecord[]> {
    const sql = userId
      ? `SELECT * FROM api_keys WHERE user_id = ? ORDER BY created_at DESC`
      : `SELECT * FROM api_keys ORDER BY created_at DESC`;

    const params = userId ? [userId] : [];
    const result = this.db.all(sql, params);

    if (!result.success || !result.data) {
      return [];
    }

    return (result.data as Array<Record<string, unknown>>).map((row) => this.rowToRecord(row));
  }

  /**
   * 删除 API Key 记录
   */
  async delete(keyId: string): Promise<void> {
    const result = this.db.execute(`DELETE FROM api_keys WHERE id = ?`, [keyId]);

    if (!result.success) {
      throw new Error(`Failed to delete API key: ${result.error?.message}`);
    }
  }

  /**
   * 将数据库行转换为 ApiKeyRecord
   */
  private rowToRecord(row: Record<string, unknown>): ApiKeyRecord {
    return {
      id: row.id as string,
      name: row.name as string,
      keyHash: row.key_hash as string,
      userId: row.user_id as string,
      createdAt: row.created_at as number,
      expiresAt: row.expires_at as number | undefined,
      revokedAt: row.revoked_at as number | undefined,
      lastUsedAt: row.last_used_at as number | undefined,
      permissions: JSON.parse((row.permissions as string) || '[]'),
    };
  }
}
