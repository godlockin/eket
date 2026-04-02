/**
 * API Key 管理器
 *
 * 安全的 API Key 生成、验证、轮换和吊销
 * 支持持久化存储，重启后自动恢复
 *
 * @module api-key-manager
 */

import * as crypto from 'crypto';

import { ApiKeyStorage } from './api-key-storage.js';

export interface ApiKeyInfo {
  id: string;
  keyHash: string; // 存储哈希而非明文
  name: string;
  userId: string;
  createdAt: number;
  expiresAt?: number;
  lastUsedAt?: number;
  revokedAt?: number;
  revokedReason?: string;
  permissions: string[];
}

export interface ApiKeyValidationResult {
  valid: boolean;
  keyInfo?: ApiKeyInfo;
  error?: 'invalid_format' | 'expired' | 'revoked' | 'not_found';
}

export interface ApiKeyManagerConfig {
  // Key 长度（字节），默认 32 字节 = 256 位
  keyLength?: number;
  // Key 过期时间（毫秒），默认永不过期
  defaultExpiresIn?: number;
  // 哈希算法
  hashAlgorithm?: string;
  // Key 前缀，用于显示
  keyPrefix?: string;
}

export class ApiKeyManager {
  private storage: ApiKeyStorage;
  private keys: Map<string, ApiKeyInfo> = new Map(); // keyId -> keyInfo
  private hashToKeyId: Map<string, string> = new Map(); // hash -> keyId
  private config: Required<ApiKeyManagerConfig>;
  private initialized = false;

  constructor(storage: ApiKeyStorage, config: ApiKeyManagerConfig = {}) {
    this.storage = storage;
    this.config = {
      keyLength: config.keyLength || 32,
      defaultExpiresIn: config.defaultExpiresIn || 0, // 0 = 永不过期
      hashAlgorithm: config.hashAlgorithm || 'sha256',
      keyPrefix: config.keyPrefix || 'eket_',
    };
  }

  /**
   * 初始化：从数据库加载所有 Keys 到内存
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    // 初始化存储表
    await this.storage.initialize();

    // 从数据库加载所有 Key 到内存
    const records = await this.storage.list();
    for (const record of records) {
      const info: ApiKeyInfo = {
        id: record.id,
        keyHash: record.keyHash,
        name: record.name,
        userId: record.userId,
        createdAt: record.createdAt,
        expiresAt: record.expiresAt,
        lastUsedAt: record.lastUsedAt,
        revokedAt: record.revokedAt,
        revokedReason: undefined,
        permissions: record.permissions,
      };
      this.keys.set(record.id, info);
      this.hashToKeyId.set(record.keyHash, record.id);
    }

    this.initialized = true;
    console.log(`[ApiKeyManager] Loaded ${this.keys.size} keys from storage`);
  }

  /**
   * 生成新的 API Key
   * @param name Key 的名称/描述
   * @param userId 用户 ID
   * @param permissions 权限列表
   * @param expiresIn 过期时间（毫秒），0 表示永不过期
   * @returns 返回完整的 Key（只返回一次，之后无法再获取）
   */
  async generateKey(
    name: string,
    userId: string,
    permissions: string[] = ['read', 'write'],
    expiresIn = 0
  ): Promise<{ key: string; keyId: string; keyHash: string }> {
    if (!this.initialized) {
      throw new Error('ApiKeyManager not initialized. Call initialize() first.');
    }

    // 生成随机密钥
    const key = crypto.randomBytes(this.config.keyLength).toString('hex');

    // 生成 Key ID
    const keyId = `key_${crypto.randomBytes(8).toString('hex')}`;

    // 计算哈希（存储哈希而非明文）
    const keyHash = this.hashKey(key);

    // 创建 Key 信息
    const now = Date.now();
    const keyInfo: ApiKeyInfo = {
      id: keyId,
      keyHash,
      name,
      userId,
      createdAt: now,
      expiresAt: expiresIn > 0 ? now + expiresIn : undefined,
      revokedAt: undefined,
      revokedReason: undefined,
      lastUsedAt: undefined,
      permissions,
    };

    // 存储到内存
    this.keys.set(keyId, keyInfo);
    this.hashToKeyId.set(keyHash, keyId);

    // 持久化到数据库
    await this.storage.create({
      id: keyId,
      name,
      keyHash,
      userId,
      createdAt: now,
      expiresAt: expiresIn > 0 ? now + expiresIn : undefined,
      revokedAt: undefined,
      lastUsedAt: undefined,
      permissions,
    });

    // 只返回一次完整 Key，之后无法再获取
    return { key, keyId, keyHash };
  }

  /**
   * 验证 API Key
   */
  async validateKey(key: string): Promise<ApiKeyValidationResult> {
    if (!this.initialized) {
      throw new Error('ApiKeyManager not initialized. Call initialize() first.');
    }

    if (!key || typeof key !== 'string' || key.length < 16) {
      return { valid: false, error: 'invalid_format' };
    }

    const keyHash = this.hashKey(key);
    const keyId = this.hashToKeyId.get(keyHash);

    if (!keyId) {
      // 尝试从数据库加载（可能是重启后未加载到内存的 key）
      await this.loadKeyFromStorage(keyHash);
      const retryKeyId = this.hashToKeyId.get(keyHash);
      if (!retryKeyId) {
        return { valid: false, error: 'not_found' };
      }
      return this.validateKeyById(retryKeyId);
    }

    return this.validateKeyById(keyId);
  }

  /**
   * 通过 ID 验证 Key
   */
  private validateKeyById(keyId: string): ApiKeyValidationResult {
    const keyInfo = this.keys.get(keyId);
    if (!keyInfo) {
      return { valid: false, error: 'not_found' };
    }

    // 检查是否被吊销
    if (keyInfo.revokedAt) {
      return { valid: false, error: 'revoked' };
    }

    // 检查是否过期
    if (keyInfo.expiresAt && Date.now() > keyInfo.expiresAt) {
      return { valid: false, error: 'expired' };
    }

    // 更新最后使用时间（异步）
    keyInfo.lastUsedAt = Date.now();
    this.storage.updateLastUsed(keyId).catch((err) => {
      console.error('[ApiKeyManager] Failed to update last_used_at:', err);
    });

    return { valid: true, keyInfo };
  }

  /**
   * 从数据库加载单个 Key 到内存
   */
  private async loadKeyFromStorage(keyHash: string): Promise<void> {
    try {
      const record = await this.storage.getByHash(keyHash);
      if (record) {
        const info: ApiKeyInfo = {
          id: record.id,
          keyHash: record.keyHash,
          name: record.name,
          userId: record.userId,
          createdAt: record.createdAt,
          expiresAt: record.expiresAt,
          lastUsedAt: record.lastUsedAt,
          revokedAt: record.revokedAt,
          revokedReason: undefined,
          permissions: record.permissions,
        };
        this.keys.set(record.id, info);
        this.hashToKeyId.set(keyHash, record.id);
      }
    } catch (err) {
      console.error('[ApiKeyManager] Failed to load key from storage:', err);
    }
  }

  /**
   * 吊销 API Key
   */
  async revokeKey(keyId: string, reason?: string): Promise<boolean> {
    if (!this.initialized) {
      throw new Error('ApiKeyManager not initialized. Call initialize() first.');
    }

    const keyInfo = this.keys.get(keyId);
    if (!keyInfo) {
      return false;
    }

    keyInfo.revokedAt = Date.now();
    keyInfo.revokedReason = reason;
    this.keys.set(keyId, keyInfo);

    // 持久化到数据库
    await this.storage.revoke(keyId);

    return true;
  }

  /**
   * 轮换 API Key（吊销旧 Key，生成新 Key）
   */
  async rotateKey(
    keyId: string,
    name?: string,
    permissions?: string[]
  ): Promise<{ key: string; keyId: string; keyHash: string } | null> {
    if (!this.initialized) {
      throw new Error('ApiKeyManager not initialized. Call initialize() first.');
    }

    const oldKeyInfo = this.keys.get(keyId);
    if (!oldKeyInfo) {
      return null;
    }

    // 吊销旧 Key
    await this.revokeKey(keyId, 'rotated');

    // 生成新 Key
    return this.generateKey(
      name || `${oldKeyInfo.name} (rotated)`,
      oldKeyInfo.userId,
      permissions || oldKeyInfo.permissions
    );
  }

  /**
   * 获取 Key 信息（不含哈希）
   */
  getKeyInfo(keyId: string): Omit<ApiKeyInfo, 'keyHash'> | null {
    const keyInfo = this.keys.get(keyId);
    if (!keyInfo) {
      return null;
    }

    // 返回不含哈希的副本
    const { keyHash, ...safeInfo } = keyInfo;
    return safeInfo;
  }

  /**
   * 列出所有 Key（不含哈希）
   */
  listKeys(): Array<Omit<ApiKeyInfo, 'keyHash'>> {
    return Array.from(this.keys.values()).map(({ keyHash, ...info }) => info);
  }

  /**
   * 清理过期 Key
   */
  async cleanupExpired(): Promise<number> {
    if (!this.initialized) {
      throw new Error('ApiKeyManager not initialized. Call initialize() first.');
    }

    const now = Date.now();
    let cleaned = 0;

    for (const [keyId, keyInfo] of this.keys.entries()) {
      if (keyInfo.expiresAt && now > keyInfo.expiresAt) {
        this.hashToKeyId.delete(keyInfo.keyHash);
        this.keys.delete(keyId);
        await this.storage.delete(keyId);
        cleaned++;
      }
    }

    return cleaned;
  }

  /**
   * 导出密钥元数据（用于备份，不含哈希）
   */
  exportMetadata(): Array<Record<string, unknown>> {
    return Array.from(this.keys.values()).map(({ keyHash, ...info }) => ({
      ...info,
      // 哈希值不导出
    }));
  }

  /**
   * 哈希 Key（单向加密）
   */
  private hashKey(key: string): string {
    return crypto.createHash(this.config.hashAlgorithm).update(key).digest('hex');
  }
}

/**
 * 创建 API Key 管理器实例
 */
export function createApiKeyManager(
  storage: ApiKeyStorage,
  config?: ApiKeyManagerConfig
): ApiKeyManager {
  return new ApiKeyManager(storage, config);
}
