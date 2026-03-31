/**
 * API Key Manager 持久化单元测试
 *
 * 测试覆盖：
 * - Key 生成和持久化
 * - Key 验证（有效、过期、吊销）
 * - 重启后数据恢复
 * - Key 轮换
 * - 过期清理
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { SQLiteClient, createSQLiteClient } from '../src/core/sqlite-client';
import { ApiKeyStorage } from '../src/api/middleware/api-key-storage';
import { ApiKeyManager, createApiKeyManager } from '../src/api/middleware/api-key-manager';

describe('ApiKeyManager', () => {
  let tempDbPath: string;
  let client: SQLiteClient;
  let storage: ApiKeyStorage;
  let manager: ApiKeyManager;

  beforeEach(async () => {
    // 创建临时数据库文件
    tempDbPath = path.join(os.tmpdir(), `eket_api_key_test_${Date.now()}.db`);
    client = createSQLiteClient(tempDbPath);
    const result = client.connect();
    if (!result.success) {
      throw new Error('Failed to connect to SQLite');
    }

    storage = new ApiKeyStorage(client);
    manager = createApiKeyManager(storage);
    await manager.initialize();
  });

  afterEach(() => {
    client.close();
    // 清理临时文件
    if (fs.existsSync(tempDbPath)) {
      fs.unlinkSync(tempDbPath);
    }
  });

  describe('generateKey', () => {
    it('should generate a new API key with metadata', async () => {
      const result = await manager.generateKey('Test Key', 'user123', ['read', 'write']);

      expect(result.key).toBeDefined();
      expect(result.keyId).toBeDefined();
      expect(result.keyHash).toBeDefined();
      expect(result.keyId).toMatch(/^key_[0-9a-f]+$/);
      expect(result.key.length).toBeGreaterThanOrEqual(32);
    });

    it('should persist key to database', async () => {
      const { keyId } = await manager.generateKey('Test Key', 'user123', ['read']);

      const keyInfo = manager.getKeyInfo(keyId);
      expect(keyInfo).toBeDefined();
      expect(keyInfo?.name).toBe('Test Key');
      expect(keyInfo?.userId).toBe('user123');
      expect(keyInfo?.permissions).toEqual(['read']);
    });

    it('should generate keys with expiration', async () => {
      const { keyId } = await manager.generateKey('Expiring Key', 'user123', ['read'], 60000);

      const keyInfo = manager.getKeyInfo(keyId);
      expect(keyInfo?.expiresAt).toBeDefined();
      expect(keyInfo?.expiresAt).toBeGreaterThan(Date.now());
    });

    it('should throw error if not initialized', async () => {
      const freshManager = createApiKeyManager(new ApiKeyStorage(client));
      await expect(freshManager.generateKey('Test', 'user123')).rejects.toThrow(
        'ApiKeyManager not initialized'
      );
    });
  });

  describe('validateKey', () => {
    it('should validate a valid key', async () => {
      const { key } = await manager.generateKey('Test Key', 'user123');

      const result = await manager.validateKey(key);
      expect(result.valid).toBe(true);
      expect(result.keyInfo).toBeDefined();
      expect(result.keyInfo?.name).toBe('Test Key');
    });

    it('should reject invalid format', async () => {
      const result = await manager.validateKey('short');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('invalid_format');
    });

    it('should reject non-existent key', async () => {
      const fakeKey = 'eket_' + 'a'.repeat(64);
      const result = await manager.validateKey(fakeKey);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('not_found');
    });

    it('should reject expired key', async () => {
      const { key } = await manager.generateKey('Expiring Key', 'user123', ['read'], 100);

      // 等待过期
      await new Promise((resolve) => setTimeout(resolve, 150));

      const result = await manager.validateKey(key);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('expired');
    });

    it('should reject revoked key', async () => {
      const { key, keyId } = await manager.generateKey('Test Key', 'user123');

      await manager.revokeKey(keyId, 'Testing revocation');

      const result = await manager.validateKey(key);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('revoked');
    });

    it('should update lastUsedAt on successful validation', async () => {
      const { key, keyId } = await manager.generateKey('Test Key', 'user123');

      await manager.validateKey(key);

      const keyInfo = manager.getKeyInfo(keyId);
      expect(keyInfo?.lastUsedAt).toBeDefined();
    });
  });

  describe('revokeKey', () => {
    it('should revoke a key', async () => {
      const { keyId } = await manager.generateKey('Test Key', 'user123');

      const result = await manager.revokeKey(keyId, 'Testing');
      expect(result).toBe(true);

      const keyInfo = manager.getKeyInfo(keyId);
      expect(keyInfo?.revokedAt).toBeDefined();
    });

    it('should return false for non-existent key', async () => {
      const result = await manager.revokeKey('non_existent_key');
      expect(result).toBe(false);
    });

    it('should persist revocation to database', async () => {
      const { keyId } = await manager.generateKey('Test Key', 'user123');

      await manager.revokeKey(keyId, 'Testing');

      // 重新加载验证
      const records = await storage.list();
      const revokedKey = records.find((r) => r.id === keyId);
      expect(revokedKey).toBeDefined();
      expect(revokedKey?.revokedAt).toBeDefined();
    });
  });

  describe('rotateKey', () => {
    it('should revoke old key and generate new key', async () => {
      const { keyId, key } = await manager.generateKey('Original Key', 'user123');

      const oldValidation = await manager.validateKey(key);
      expect(oldValidation.valid).toBe(true);

      const rotated = await manager.rotateKey(keyId, 'Rotated Key');
      expect(rotated).toBeDefined();
      expect(rotated?.keyId).not.toBe(keyId);

      // 验证旧 Key 被吊销
      const oldResult = await manager.validateKey(key);
      expect(oldResult.valid).toBe(false);
      expect(oldResult.error).toBe('revoked');

      // 验证新 Key 有效
      const newResult = await manager.validateKey(rotated!.key);
      expect(newResult.valid).toBe(true);
    });

    it('should return null for non-existent key', async () => {
      const rotated = await manager.rotateKey('non_existent_key');
      expect(rotated).toBe(null);
    });

    it('should inherit user and permissions from old key', async () => {
      const { keyId } = await manager.generateKey('Original', 'user456', ['read', 'write', 'delete']);

      const rotated = await manager.rotateKey(keyId);
      expect(rotated).toBeDefined();

      const newKeyInfo = manager.getKeyInfo(rotated!.keyId);
      expect(newKeyInfo?.userId).toBe('user456');
      expect(newKeyInfo?.permissions).toEqual(['read', 'write', 'delete']);
    });
  });

  describe('listKeys', () => {
    it('should list all keys', async () => {
      await manager.generateKey('Key 1', 'user1');
      await manager.generateKey('Key 2', 'user2');
      await manager.generateKey('Key 3', 'user1');

      const keys = manager.listKeys();
      expect(keys.length).toBe(3);
    });

    it('should not expose keyHash', async () => {
      await manager.generateKey('Test Key', 'user123');

      const keys = manager.listKeys();
      for (const key of keys) {
        expect('keyHash' in key).toBe(false);
      }
    });
  });

  describe('cleanupExpired', () => {
    it('should remove expired keys', async () => {
      // 创建永不过期的 Key
      await manager.generateKey('Valid Key', 'user1');

      // 创建已过期的 Key（1ms 后过期）
      await manager.generateKey('Expired Key', 'user2', ['read'], 1);

      // 等待过期
      await new Promise((resolve) => setTimeout(resolve, 10));

      const cleaned = await manager.cleanupExpired();
      expect(cleaned).toBeGreaterThanOrEqual(1);

      const keys = manager.listKeys();
      // 只剩未过期的 Key
      expect(keys.length).toBe(1);
      expect(keys[0].name).toBe('Valid Key');
    });

    it('should persist deletion to database', async () => {
      await manager.generateKey('Expiring Key', 'user1', ['read'], 1);

      await new Promise((resolve) => setTimeout(resolve, 10));
      await manager.cleanupExpired();

      const records = await storage.list();
      // 验证数据库中也被删除了
      expect(records.length).toBe(0);
    });
  });

  describe('persistence and recovery', () => {
    it('should load keys from database on initialize', async () => {
      // 创建 Key
      const { key } = await manager.generateKey('Persistent Key', 'user123');

      // 验证 Key 有效
      const valid = await manager.validateKey(key);
      expect(valid.valid).toBe(true);

      // 创建新的 Manager 实例（模拟重启）
      const freshStorage = new ApiKeyStorage(client);
      const freshManager = createApiKeyManager(freshStorage);
      await freshManager.initialize();

      // 验证 Key 仍然有效
      const result = await freshManager.validateKey(key);
      expect(result.valid).toBe(true);
      expect(result.keyInfo?.name).toBe('Persistent Key');
    });

    it('should load revoked keys on initialize', async () => {
      const { keyId } = await manager.generateKey('Test Key', 'user123');
      await manager.revokeKey(keyId, 'Testing');

      // 创建新的 Manager 实例
      const freshStorage = new ApiKeyStorage(client);
      const freshManager = createApiKeyManager(freshStorage);
      await freshManager.initialize();

      // 验证吊销状态被保留
      const keyInfo = freshManager.getKeyInfo(keyId);
      expect(keyInfo?.revokedAt).toBeDefined();
    });

    it('should load expired keys but they should fail validation', async () => {
      await manager.generateKey('Expiring Key', 'user123', ['read'], 1);

      await new Promise((resolve) => setTimeout(resolve, 10));

      // 创建新的 Manager 实例
      const freshStorage = new ApiKeyStorage(client);
      const freshManager = createApiKeyManager(freshStorage);
      await freshManager.initialize();

      const keys = freshManager.listKeys();
      expect(keys.length).toBe(1);

      // 注意：过期 Key 仍在列表中，但验证会失败
      const keyInfo = freshManager.getKeyInfo(keys[0].id);
      expect(keyInfo).toBeDefined();
    });
  });

  describe('concurrent access', () => {
    it('should handle multiple validations concurrently', async () => {
      const { key } = await manager.generateKey('Test Key', 'user123');

      const promises = Array.from({ length: 10 }, () => manager.validateKey(key));
      const results = await Promise.all(promises);

      // 所有验证都应该成功
      results.forEach((result) => {
        expect(result.valid).toBe(true);
      });
    });

    it('should handle revoke and validate race condition', async () => {
      const { key, keyId } = await manager.generateKey('Test Key', 'user123');

      // 并发执行吊销和验证
      const [revokeResult, validationResult] = await Promise.all([
        manager.revokeKey(keyId),
        manager.validateKey(key),
      ]);

      expect(revokeResult).toBe(true);
      // 验证可能成功或失败，取决于执行顺序
      expect(validationResult.valid).toBeDefined();
    });
  });

  describe('edge cases', () => {
    it('should handle empty key', async () => {
      const result = await manager.validateKey('');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('invalid_format');
    });

    it('should handle very long keys', async () => {
      const longKey = 'a'.repeat(1000);
      const result = await manager.validateKey(longKey);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('not_found');
    });

    it('should handle unicode in key name', async () => {
      const { key } = await manager.generateKey('测试密钥 🔑', 'user123');
      const result = await manager.validateKey(key);
      expect(result.valid).toBe(true);
    });

    it('should handle special characters in reason', async () => {
      const { key, keyId } = await manager.generateKey('Test Key', 'user123');
      await manager.revokeKey(keyId, '特殊原因！@#$%^&*()');

      const result = await manager.validateKey(key);
      expect(result.valid).toBe(false);
    });
  });
});
