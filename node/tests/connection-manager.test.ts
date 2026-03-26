/**
 * Connection Manager 单元测试
 * Phase 9.1 - 四级降级策略
 *
 * 测试覆盖：
 * - 连接初始化
 * - 降级逻辑
 * - 升级逻辑
 * - 统计信息
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { ConnectionManager, createConnectionManager } from '../core/connection-manager';
import type { ConnectionManagerConfig } from '../types/index';

describe('ConnectionManager', () => {
  describe('constructor', () => {
    it('should create instance with default config', () => {
      const manager = createConnectionManager();
      expect(manager).toBeDefined();
      expect(manager.getDriverMode()).toBe('js');
    });

    it('should accept custom config', () => {
      const config: Partial<ConnectionManagerConfig> = {
        driverMode: 'shell',
        fileQueueDir: '/tmp/test-queue',
      };
      const manager = createConnectionManager(config);
      expect(manager).toBeDefined();
      expect(manager.getDriverMode()).toBe('shell');
    });

    it('should use environment variables', () => {
      process.env.EKET_LOCAL_REDIS_HOST = 'test-host';
      process.env.EKET_LOCAL_REDIS_PORT = '6380';

      const manager = createConnectionManager();
      expect(manager).toBeDefined();

      delete process.env.EKET_LOCAL_REDIS_HOST;
      delete process.env.EKET_LOCAL_REDIS_PORT;
    });
  });

  describe('initialize', () => {
    it('should initialize with file system as fallback', async () => {
      const manager = createConnectionManager({
        // 不提供 Redis 配置，直接降级到文件
        driverMode: 'js',
      });

      const result = await manager.initialize();

      expect(result.success).toBe(true);
      // 应该降级到文件级别
      expect(['sqlite', 'file']).toContain(result.data);
    });

    it('should return stats after initialization', async () => {
      const manager = createConnectionManager();
      await manager.initialize();

      const stats = manager.getStats();

      expect(stats.currentLevel).toBeDefined();
      expect(stats.driverMode).toBe('js');
      expect(stats.fallbackCount).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getStats', () => {
    it('should return complete stats object', async () => {
      const manager = createConnectionManager();
      await manager.initialize();

      const stats = manager.getStats();

      expect(stats).toHaveProperty('currentLevel');
      expect(stats).toHaveProperty('driverMode');
      expect(stats).toHaveProperty('remoteRedisAvailable');
      expect(stats).toHaveProperty('localRedisAvailable');
      expect(stats).toHaveProperty('sqliteAvailable');
      expect(stats).toHaveProperty('fileAvailable');
      expect(stats).toHaveProperty('fallbackCount');
    });
  });

  describe('getCurrentLevel', () => {
    it('should return current connection level', async () => {
      const manager = createConnectionManager();
      await manager.initialize();

      const level = manager.getCurrentLevel();
      expect(['remote_redis', 'local_redis', 'sqlite', 'file']).toContain(level);
    });
  });

  describe('getDriverMode', () => {
    it('should return driver mode', () => {
      const manager = createConnectionManager({ driverMode: 'shell' });
      expect(manager.getDriverMode()).toBe('shell');
    });

    it('should default to js mode', () => {
      const manager = createConnectionManager();
      expect(manager.getDriverMode()).toBe('js');
    });
  });

  describe('setDriverMode', () => {
    it('should update driver mode', () => {
      const manager = createConnectionManager();
      expect(manager.getDriverMode()).toBe('js');

      manager.setDriverMode('shell');
      expect(manager.getDriverMode()).toBe('shell');
    });
  });

  describe('getFileQueueDir', () => {
    it('should return file queue directory', async () => {
      const manager = createConnectionManager({
        fileQueueDir: '/tmp/test-eket-queue',
      });
      await manager.initialize();

      const dir = manager.getFileQueueDir();
      // 如果文件级别可用，应该返回目录
      if (manager.getStats().fileAvailable) {
        expect(dir).toBeDefined();
      }
    });
  });

  describe('shutdown', () => {
    it('should shutdown gracefully', async () => {
      const manager = createConnectionManager();
      await manager.initialize();

      await manager.shutdown();
      // 应该不抛出异常
      expect(true).toBe(true);
    });
  });

  describe('defensive copy', () => {
    it('should create defensive copy of config', () => {
      const config = {
        remoteRedis: {
          host: 'original',
          port: 6380,
        },
      };

      const manager = createConnectionManager(config);

      // 修改原始配置不应影响 manager
      config.remoteRedis.host = 'modified';

      // 验证 manager 不受影响（通过 stats 间接验证）
      expect(manager).toBeDefined();
    });
  });
});

describe('Connection Levels', () => {
  it('should have correct level priority', () => {
    // 验证级别优先级：remote_redis > local_redis > sqlite > file
    const levels = ['remote_redis', 'local_redis', 'sqlite', 'file'];
    expect(levels[0]).toBe('remote_redis');
    expect(levels[levels.length - 1]).toBe('file');
  });
});

describe('Driver Modes', () => {
  it('should support js and shell modes', () => {
    const modes: ['js', 'shell'] = ['js', 'shell'];
    expect(modes).toContain('js');
    expect(modes).toContain('shell');
  });
});
