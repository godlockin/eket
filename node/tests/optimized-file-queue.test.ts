/**
 * Optimized File Queue Manager 单元测试
 * Phase 7.4 - 文件队列优化
 *
 * 测试覆盖：
 * - 临时文件清理机制
 * - 原子写入操作
 * - 消息去重
 * - TTL 过期清理
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import { OptimizedFileQueueManager } from '../src/core/optimized-file-queue.js';
import type { Message } from '../types/index.js';

describe('OptimizedFileQueueManager', () => {
  const queueDir = path.join(process.cwd(), '.eket', 'test-queue', 'queue');
  const archiveDir = path.join(process.cwd(), '.eket', 'test-queue', 'archive');

  beforeEach(() => {
    // 使用真实时钟而不是 Jest 的假时钟
    jest.useRealTimers();

    // 清理测试目录
    if (fs.existsSync(queueDir)) {
      fs.rmSync(queueDir, { recursive: true, force: true });
    }
    if (fs.existsSync(archiveDir)) {
      fs.rmSync(archiveDir, { recursive: true, force: true });
    }
  });

  afterEach(() => {
    // 清理测试目录
    if (fs.existsSync(queueDir)) {
      fs.rmSync(queueDir, { recursive: true, force: true });
    }
    if (fs.existsSync(archiveDir)) {
      fs.rmSync(archiveDir, { recursive: true, force: true });
    }
  });

  describe('cleanupTempFiles', () => {
    it('should clean up stale temp files on startup (older than 1 hour)', () => {
      // 创建测试目录
      fs.mkdirSync(queueDir, { recursive: true });

      // 创建临时文件
      const tempFile = path.join(queueDir, '.tmp.12345.json');
      fs.writeFileSync(tempFile, '{"test": "data"}');

      // 修改文件时间为 2 小时前（utimesSync 使用秒为单位）
      const twoHoursAgo = (Date.now() - 7200000) / 1000;
      fs.utimesSync(tempFile, twoHoursAgo, twoHoursAgo);

      // 验证文件存在
      expect(fs.existsSync(tempFile)).toBe(true);

      // 创建管理器（应该清理临时文件）
      const manager = new OptimizedFileQueueManager({ queueDir, archiveDir });

      // 临时文件应该被清理
      expect(fs.existsSync(tempFile)).toBe(false);
    });

    it('should not clean up recent temp files (within 1 hour)', () => {
      // 创建测试目录
      fs.mkdirSync(queueDir, { recursive: true });

      // 创建临时文件（30 分钟前）
      const tempFile = path.join(queueDir, '.tmp.12345.json');
      fs.writeFileSync(tempFile, '{"test": "data"}');

      // 30 分钟前（utimesSync 使用秒为单位）
      const thirtyMinAgo = (Date.now() - 1800000) / 1000;
      fs.utimesSync(tempFile, thirtyMinAgo, thirtyMinAgo);

      // 创建管理器
      const manager = new OptimizedFileQueueManager({ queueDir, archiveDir });

      // 30 分钟内的文件不应该被清理
      expect(fs.existsSync(tempFile)).toBe(true);
    });

    it('should handle missing queue directory gracefully', () => {
      // 确保目录不存在
      const nonExistentDir = path.join(process.cwd(), '.eket', 'non-existent-queue');
      if (fs.existsSync(nonExistentDir)) {
        fs.rmSync(nonExistentDir, { recursive: true, force: true });
      }

      // 不应该抛出异常
      expect(() => {
        new OptimizedFileQueueManager({
          queueDir: nonExistentDir,
          archiveDir,
        });
      }).not.toThrow();
    });

    it('should clean up multiple stale temp files', () => {
      // 创建测试目录
      fs.mkdirSync(queueDir, { recursive: true });

      // 创建多个临时文件（都超过 1 小时）
      const tempFiles = [
        '.tmp.12345.json',
        '.tmp.67890.json',
        '.tmp.11111.json',
      ];

      for (const file of tempFiles) {
        const filePath = path.join(queueDir, file);
        fs.writeFileSync(filePath, '{"test": "data"}');
        // utimesSync 使用秒为单位
        const oldTime = (Date.now() - 7200000) / 1000; // 2 小时前
        fs.utimesSync(filePath, oldTime, oldTime);
      }

      // 创建管理器
      const manager = new OptimizedFileQueueManager({ queueDir, archiveDir });

      // 所有临时文件都应该被清理
      for (const file of tempFiles) {
        expect(fs.existsSync(path.join(queueDir, file))).toBe(false);
      }
    });

    it('should only clean up stale files, keep recent ones', () => {
      // 创建测试目录
      fs.mkdirSync(queueDir, { recursive: true });

      // 创建旧临时文件（2 小时前）
      const oldTempFile = path.join(queueDir, '.tmp.old.json');
      fs.writeFileSync(oldTempFile, '{"old": "data"}');
      const oldTime = (Date.now() - 7200000) / 1000;
      fs.utimesSync(oldTempFile, oldTime, oldTime);

      // 创建新临时文件（30 分钟前）
      const newTempFile = path.join(queueDir, '.tmp.new.json');
      fs.writeFileSync(newTempFile, '{"new": "data"}');
      const newTime = (Date.now() - 1800000) / 1000;
      fs.utimesSync(newTempFile, newTime, newTime);

      // 创建管理器
      const manager = new OptimizedFileQueueManager({ queueDir, archiveDir });

      // 旧文件应该被清理，新文件应该保留
      expect(fs.existsSync(oldTempFile)).toBe(false);
      expect(fs.existsSync(newTempFile)).toBe(true);
    });

    it('should handle corrupted temp files gracefully', () => {
      // 创建测试目录
      fs.mkdirSync(queueDir, { recursive: true });

      // 创建临时文件
      const tempFile = path.join(queueDir, '.tmp.corrupted.json');
      fs.writeFileSync(tempFile, 'invalid json content');
      const oldTime = (Date.now() - 7200000) / 1000;
      fs.utimesSync(tempFile, oldTime, oldTime);

      // 不应该抛出异常
      expect(() => {
        new OptimizedFileQueueManager({ queueDir, archiveDir });
      }).not.toThrow();

      // 文件应该被清理（因为只检查文件时间，不检查内容）
      expect(fs.existsSync(tempFile)).toBe(false);
    });
  });

  describe('enqueue/dequeue', () => {
    it('should add and retrieve messages', () => {
      const manager = new OptimizedFileQueueManager({ queueDir, archiveDir });

      const message: Message = {
        id: 'test-msg-001',
        timestamp: Date.now(),
        from: 'test-agent',
        to: 'test-recipient',
        type: 'test_message',
        payload: { key: 'value' },
      };

      // 入队
      const result = manager.enqueue('test-channel', message);
      expect(result.success).toBe(true);

      // 出队
      const messages = manager.dequeue('test-channel');
      expect(messages.length).toBe(1);
      expect(messages[0].message.id).toBe('test-msg-001');
    });

    it('should deduplicate messages', () => {
      const manager = new OptimizedFileQueueManager({ queueDir, archiveDir });

      const message: Message = {
        id: 'duplicate-msg',
        timestamp: Date.now(),
        from: 'test-agent',
        to: 'test-recipient',
        type: 'test_message',
        payload: { key: 'value' },
      };

      // 第一次入队应该成功
      const result1 = manager.enqueue('test-channel', message);
      expect(result1.success).toBe(true);

      // 第二次入队应该失败（重复消息）
      const result2 = manager.enqueue('test-channel', message);
      expect(result2.success).toBe(false);
      expect(result2.error?.code).toBe('DUPLICATE_MESSAGE');
    });
  });

  describe('isProcessed/markProcessed', () => {
    it('should track processed messages', () => {
      const manager = new OptimizedFileQueueManager({ queueDir, archiveDir });

      const messageId = 'test-processed-001';

      // 初始状态应该是未处理
      expect(manager.isProcessed(messageId)).toBe(false);

      // 标记为已处理
      manager.markProcessed(messageId);

      // 现在应该是已处理
      expect(manager.isProcessed(messageId)).toBe(true);
    });
  });

  describe('cleanupExpired', () => {
    it('should clean up expired messages', () => {
      const manager = new OptimizedFileQueueManager({
        queueDir,
        archiveDir,
        maxAge: 3600000, // 1 小时
        archiveAfter: 1800000, // 30 分钟
      });

      const message: Message = {
        id: 'expired-msg',
        timestamp: Date.now() - 7200000, // 2 小时前
        from: 'test-agent',
        to: 'test-recipient',
        type: 'test_message',
        payload: { key: 'value' },
      };

      // 入队
      manager.enqueue('test-channel', message);

      // 清理过期消息
      const cleaned = manager.cleanupExpired();

      // 应该清理掉过期消息
      expect(cleaned).toBeGreaterThanOrEqual(1);
    });
  });

  describe('stats', () => {
    it('should return queue statistics', () => {
      const manager = new OptimizedFileQueueManager({ queueDir, archiveDir });

      const stats = manager.getStats();

      expect(stats).toHaveProperty('pending');
      expect(stats).toHaveProperty('processing');
      expect(stats).toHaveProperty('archived');
      expect(stats).toHaveProperty('expired');
      expect(stats).toHaveProperty('writeErrors');
      expect(stats).toHaveProperty('readErrors');
      expect(stats).toHaveProperty('lockContentions');
      expect(stats).toHaveProperty('avgWriteTime');
      expect(stats).toHaveProperty('avgReadTime');
    });
  });
});
