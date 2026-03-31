/**
 * API Key 管理器
 *
 * 安全的 API Key 生成、验证、轮换和吊销
 *
 * @module api-key-manager
 */

import * as crypto from 'crypto';

export interface ApiKeyInfo {
  keyId: string;
  keyHash: string; // 存储哈希而非明文
  name: string;
  createdAt: number;
  expiresAt?: number;
  lastUsedAt?: number;
  revoked: boolean;
  revokedAt?: number;
  revokedReason?: string;
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
}

export class ApiKeyManager {
  private keys: Map<string, ApiKeyInfo> = new Map(); // keyId -> keyInfo
  private hashToKeyId: Map<string, string> = new Map(); // hash -> keyId
  private config: Required<ApiKeyManagerConfig>;

  constructor(config: ApiKeyManagerConfig = {}) {
    this.config = {
      keyLength: config.keyLength || 32,
      defaultExpiresIn: config.defaultExpiresIn || 0, // 0 = 永不过期
      hashAlgorithm: config.hashAlgorithm || 'sha256',
    };
  }

  /**
   * 生成新的 API Key
   * @param name Key 的名称/描述
   * @param expiresIn 过期时间（毫秒），0 表示永不过期
   */
  generateKey(name: string, expiresIn: number = 0): { key: string; keyId: string } {
    // 生成随机密钥
    const key = crypto.randomBytes(this.config.keyLength).toString('hex');

    // 生成 Key ID
    const keyId = `key_${crypto.randomBytes(8).toString('hex')}`;

    // 计算哈希（存储哈希而非明文）
    const keyHash = this.hashKey(key);

    // 创建 Key 信息
    const now = Date.now();
    const keyInfo: ApiKeyInfo = {
      keyId,
      keyHash,
      name,
      createdAt: now,
      expiresAt: expiresIn > 0 ? now + expiresIn : undefined,
      revoked: false,
    };

    // 存储
    this.keys.set(keyId, keyInfo);
    this.hashToKeyId.set(keyHash, keyId);

    // 只返回一次完整 Key，之后无法再获取
    return { key, keyId };
  }

  /**
   * 验证 API Key
   */
  validateKey(key: string): ApiKeyValidationResult {
    if (!key || typeof key !== 'string' || key.length < 16) {
      return { valid: false, error: 'invalid_format' };
    }

    const keyHash = this.hashKey(key);
    const keyId = this.hashToKeyId.get(keyHash);

    if (!keyId) {
      return { valid: false, error: 'not_found' };
    }

    const keyInfo = this.keys.get(keyId);
    if (!keyInfo) {
      return { valid: false, error: 'not_found' };
    }

    // 检查是否被吊销
    if (keyInfo.revoked) {
      return { valid: false, error: 'revoked' };
    }

    // 检查是否过期
    if (keyInfo.expiresAt && Date.now() > keyInfo.expiresAt) {
      return { valid: false, error: 'expired' };
    }

    // 更新最后使用时间
    keyInfo.lastUsedAt = Date.now();

    return { valid: true, keyInfo };
  }

  /**
   * 吊销 API Key
   */
  revokeKey(keyId: string, reason?: string): boolean {
    const keyInfo = this.keys.get(keyId);
    if (!keyInfo) {
      return false;
    }

    keyInfo.revoked = true;
    keyInfo.revokedAt = Date.now();
    keyInfo.revokedReason = reason;

    return true;
  }

  /**
   * 轮换 API Key（吊销旧 Key，生成新 Key）
   */
  rotateKey(keyId: string, name?: string): { key: string; keyId: string } | null {
    const oldKeyInfo = this.keys.get(keyId);
    if (!oldKeyInfo) {
      return null;
    }

    // 吊销旧 Key
    this.revokeKey(keyId, 'rotated');

    // 生成新 Key
    return this.generateKey(name || `${oldKeyInfo.name} (rotated)`);
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
  cleanupExpired(): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [keyId, keyInfo] of this.keys.entries()) {
      if (keyInfo.expiresAt && now > keyInfo.expiresAt) {
        this.hashToKeyId.delete(keyInfo.keyHash);
        this.keys.delete(keyId);
        cleaned++;
      }
    }

    return cleaned;
  }

  /**
   * 哈希 Key（单向加密）
   */
  private hashKey(key: string): string {
    return crypto
      .createHash(this.config.hashAlgorithm)
      .update(key)
      .digest('hex');
  }

  /**
   * 导出密钥信息（用于持久化）
   * 注意：不包含哈希值，只导出元数据
   */
  exportMetadata(): Record<string, unknown>[] {
    return Array.from(this.keys.values()).map(({ keyHash, ...info }) => ({
      ...info,
      // 哈希值不导出
    }));
  }
}

/**
 * 创建 API Key 管理器实例
 */
export function createApiKeyManager(config?: ApiKeyManagerConfig): ApiKeyManager {
  return new ApiKeyManager(config);
}
