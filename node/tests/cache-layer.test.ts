/**
 * Cache Layer 单元测试
 * Phase 7.3 - 多层缓存优化
 *
 * 测试覆盖：
 * - LRU 驱逐策略
 * - TTL 过期
 * - 多层缓存 (内存 → Redis)
 * - 缓存穿透保护
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll, jest } from '@jest/globals';
import * as net from 'net';
import { LRUCache, RedisConnectionPool } from '../core/cache-layer';
import type { CacheConfig } from '../types/index';

/** 探测 Redis 是否可用（连接 localhost:6379） */
async function isRedisAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: 'localhost', port: 6379 });
    socket.setTimeout(500);
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('error', () => { socket.destroy(); resolve(false); });
    socket.once('timeout', () => { socket.destroy(); resolve(false); });
  });
}

describe('LRUCache', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('constructor', () => {
    it('should create instance with default config', () => {
      const cache = new LRUCache();
      expect(cache).toBeDefined();
    });

    it('should accept custom config', () => {
      const config: CacheConfig = {
        maxSize: 100,
        defaultTTL: 60000,
      };
      const cache = new LRUCache(config);
      expect(cache).toBeDefined();
    });
  });

  describe('get/set', () => {
    it('should store and retrieve values', async () => {
      const cache = new LRUCache({ maxSize: 10 });

      cache.set('key1', 'value1');
      const result = cache.get('key1');

      expect(result).toBe('value1');
    });

    it('should return undefined for missing keys', () => {
      const cache = new LRUCache();

      const result = cache.get('nonexistent');
      expect(result).toBeUndefined();
    });

    it('should update existing keys', () => {
      const cache = new LRUCache();

      cache.set('key1', 'value1');
      cache.set('key1', 'value2');

      expect(cache.get('key1')).toBe('value2');
    });
  });

  describe('TTL expiration', () => {
    it('should expire entries after TTL', () => {
      const cache = new LRUCache({ maxSize: 10, defaultTTL: 1000 });

      cache.set('key1', 'value1');

      // 在 TTL 内
      jest.advanceTimersByTime(500);
      expect(cache.get('key1')).toBe('value1');

      // 超过 TTL
      jest.advanceTimersByTime(600);
      expect(cache.get('key1')).toBeUndefined();
    });

    it('should accept custom TTL per entry', () => {
      const cache = new LRUCache({ maxSize: 10, defaultTTL: 1000 });

      cache.set('key1', 'value1', 2000);
      cache.set('key2', 'value2', 500);

      // key2 应该过期
      jest.advanceTimersByTime(600);
      expect(cache.get('key1')).toBe('value1');
      expect(cache.get('key2')).toBeUndefined();
    });

    it('should not expire entries with TTL 0', () => {
      const cache = new LRUCache({ maxSize: 10, defaultTTL: 1000 });

      cache.set('key1', 'value1', 0);

      // 即使过了很久，永不过期
      jest.advanceTimersByTime(100000);
      expect(cache.get('key1')).toBe('value1');
    });
  });

  describe('LRU eviction', () => {
    it('should evict least recently used items when full', () => {
      const cache = new LRUCache({ maxSize: 3 });

      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');

      // 访问 key1，使其成为最近使用
      cache.get('key1');

      // 添加新项，应该驱逐 key2（最久未使用）
      cache.set('key4', 'value4');

      expect(cache.get('key1')).toBe('value1');
      expect(cache.get('key2')).toBeUndefined();
      expect(cache.get('key3')).toBe('value3');
      expect(cache.get('key4')).toBe('value4');
    });

    it('should update LRU order on get', () => {
      const cache = new LRUCache({ maxSize: 3 });

      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');

      // 访问 key1 和 key2
      cache.get('key1');
      cache.get('key2');

      // 添加新项，应该驱逐 key3
      cache.set('key4', 'value4');

      expect(cache.get('key3')).toBeUndefined();
      expect(cache.get('key4')).toBeDefined();
    });

    it('should handle maxSize of 1', () => {
      const cache = new LRUCache({ maxSize: 1 });

      cache.set('key1', 'value1');
      expect(cache.get('key1')).toBe('value1');

      cache.set('key2', 'value2');
      expect(cache.get('key1')).toBeUndefined();
      expect(cache.get('key2')).toBe('value2');
    });

    it('should verify O(1) LRU order - sequential access pattern', () => {
      const cache = new LRUCache({ maxSize: 5 });

      // 按顺序添加 5 个条目
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');
      cache.set('key4', 'value4');
      cache.set('key5', 'value5');

      // 访问 key1，使其成为最近使用
      cache.get('key1');

      // 现在 LRU 顺序应该是：key2, key3, key4, key5, key1
      // 添加新项应该驱逐 key2（最久未使用）
      cache.set('key6', 'value6');

      expect(cache.get('key1')).toBe('value1');  // 仍在缓存中
      expect(cache.get('key2')).toBeUndefined(); // 被驱逐
      expect(cache.get('key3')).toBe('value3');
      expect(cache.get('key4')).toBe('value4');
      expect(cache.get('key5')).toBe('value5');
      expect(cache.get('key6')).toBe('value6');
    });

    it('should verify O(1) LRU order - complex access pattern', () => {
      const cache = new LRUCache({ maxSize: 4 });

      // 初始状态
      cache.set('a', 'value-a');
      cache.set('b', 'value-b');
      cache.set('c', 'value-c');
      cache.set('d', 'value-d');
      // 顺序：a, b, c, d

      // 访问 b 和 d
      cache.get('b');
      cache.get('d');
      // 顺序变为：a, c, b, d

      // 添加 e，应该驱逐 a
      cache.set('e', 'value-e');
      // 顺序：c, b, d, e

      expect(cache.get('a')).toBeUndefined();
      expect(cache.get('b')).toBe('value-b');
      expect(cache.get('c')).toBe('value-c');
      expect(cache.get('d')).toBe('value-d');
      expect(cache.get('e')).toBe('value-e');

      // 再访问 c
      cache.get('c');
      // 顺序：b, d, e, c

      // 添加 f，应该驱逐 b
      cache.set('f', 'value-f');

      expect(cache.get('b')).toBeUndefined();
      expect(cache.get('c')).toBe('value-c');
      expect(cache.get('d')).toBe('value-d');
      expect(cache.get('e')).toBe('value-e');
      expect(cache.get('f')).toBe('value-f');
    });

    it('should verify O(1) LRU order - update existing key moves to end', () => {
      const cache = new LRUCache({ maxSize: 3 });

      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');
      // 顺序：key1, key2, key3

      // 更新 key1（已存在的键）
      cache.set('key1', 'updated-value1');
      // 顺序应该是：key2, key3, key1（更新后移到末尾）

      // 添加新项，应该驱逐 key2
      cache.set('key4', 'value4');

      expect(cache.get('key1')).toBe('updated-value1');
      expect(cache.get('key2')).toBeUndefined();
      expect(cache.get('key3')).toBe('value3');
      expect(cache.get('key4')).toBe('value4');
    });
  });

  describe('delete', () => {
    it('should remove existing keys', () => {
      const cache = new LRUCache();

      cache.set('key1', 'value1');
      cache.delete('key1');

      expect(cache.get('key1')).toBeUndefined();
    });

    it('should not throw for non-existent keys', () => {
      const cache = new LRUCache();

      expect(() => cache.delete('nonexistent')).not.toThrow();
    });
  });

  describe('clear', () => {
    it('should remove all entries', () => {
      const cache = new LRUCache();

      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');

      cache.clear();

      expect(cache.get('key1')).toBeUndefined();
      expect(cache.get('key2')).toBeUndefined();
      expect(cache.get('key3')).toBeUndefined();
    });
  });

  describe('size', () => {
    it('should return current number of entries', () => {
      const cache = new LRUCache({ maxSize: 10 });

      expect(cache.size).toBe(0);

      cache.set('key1', 'value1');
      expect(cache.size).toBe(1);

      cache.set('key2', 'value2');
      expect(cache.size).toBe(2);
    });

    it('should not exceed maxSize', () => {
      const cache = new LRUCache({ maxSize: 5 });

      for (let i = 0; i < 10; i++) {
        cache.set(`key${i}`, `value${i}`);
      }

      expect(cache.size).toBe(5);
    });
  });

  describe('has', () => {
    it('should return true for existing keys', () => {
      const cache = new LRUCache();

      cache.set('key1', 'value1');
      expect(cache.has('key1')).toBe(true);
    });

    it('should return false for non-existent keys', () => {
      const cache = new LRUCache();

      expect(cache.has('nonexistent')).toBe(false);
    });

    it('should return false for expired keys', () => {
      const cache = new LRUCache({ defaultTTL: 1000 });

      cache.set('key1', 'value1');
      expect(cache.has('key1')).toBe(true);

      jest.advanceTimersByTime(1500);
      expect(cache.has('key1')).toBe(false);
    });
  });

  describe('getOrCompute', () => {
    it('should return existing value', async () => {
      const cache = new LRUCache();
      cache.set('key1', 'cached_value');

      const result = await cache.getOrCompute('key1', async () => {
        return 'computed_value';
      });

      expect(result).toBe('cached_value');
    });

    it('should compute and cache value if not exists', async () => {
      const cache = new LRUCache();

      const computeFn = jest.fn(async () => {
        return 'computed_value';
      });

      const result = await cache.getOrCompute('key1', computeFn);

      expect(result).toBe('computed_value');
      expect(computeFn).toHaveBeenCalledTimes(1);
      expect(cache.get('key1')).toBe('computed_value');
    });

    it('should not call computeFn if value exists', async () => {
      const cache = new LRUCache();
      cache.set('key1', 'cached_value');

      const computeFn = jest.fn(async () => {
        return 'computed_value';
      });

      await cache.getOrCompute('key1', computeFn);

      expect(computeFn).not.toHaveBeenCalled();
    });

    it('should handle high concurrent requests without stack overflow', async () => {
      jest.useRealTimers();
      const cache = new LRUCache({ maxSize: 100, defaultTTL: 60000 });

      let computeCallCount = 0;
      // 模拟慢计算
      const slowCompute = async () => {
        computeCallCount++;
        await new Promise(r => setTimeout(r, 200));
        return { data: 'computed' };
      };

      // 100 个并发请求同一个 key
      const promises = Array.from({ length: 100 }, () =>
        cache.getOrCompute('same-key', slowCompute)
      );

      // 所有请求都应该成功或超时，不应该栈溢出
      const results = await Promise.allSettled(promises);

      // 至少有一些成功（由于锁机制，实际只会有一个成功计算）
      const successCount = results.filter(r => r.status === 'fulfilled').length;
      expect(successCount).toBeGreaterThan(0);

      // 没有栈溢出错误
      const overflowErrors = results.filter(r =>
        r.status === 'rejected' && r.reason.message.includes('stack')
      );
      expect(overflowErrors.length).toBe(0);

      // computeFn 应该只被调用一次（由于锁机制）
      expect(computeCallCount).toBeLessThanOrEqual(1);
    });

    it('should timeout after max retries', async () => {
      jest.useRealTimers();
      const cache = new LRUCache({ maxSize: 100, defaultTTL: 60000 });

      // 手动设置锁，模拟无法获取锁的场景
      cache.set('key:lock', 'locked' as any, 10000);

      await expect(
        cache.getOrCompute('key', async () => ({ data: 'test' }))
      ).rejects.toThrow('timeout');
    }, 10000);

    it('should perform double-check after acquiring lock', async () => {
      jest.useRealTimers();
      const cache = new LRUCache({ maxSize: 100, defaultTTL: 60000 });

      const computeFn = jest.fn(async () => {
        await new Promise(r => setTimeout(r, 50));
        return 'computed';
      });

      // 并发请求，验证双重检查逻辑
      const [result1, result2] = await Promise.all([
        cache.getOrCompute('double-check-key', computeFn),
        cache.getOrCompute('double-check-key', computeFn),
      ]);

      expect(result1).toBe('computed');
      expect(result2).toBe('computed');
      // 由于锁和双重检查，computeFn 应该只被调用一次
      expect(computeFn).toHaveBeenCalledTimes(1);
    });
  });

  describe('stats', () => {
    it('should track hit rate', () => {
      const cache = new LRUCache({ maxSize: 10 });

      cache.set('key1', 'value1');

      // 3 次命中，2 次未命中
      cache.get('key1');
      cache.get('key1');
      cache.get('key1');
      cache.get('key2');
      cache.get('key3');

      const stats = cache.getStats();

      expect(stats.hits).toBe(3);
      expect(stats.misses).toBe(2);
      expect(stats.hitRate).toBe(0.6); // 3/5 = 60%
    });

    it('should track evictions', () => {
      const cache = new LRUCache({ maxSize: 2 });

      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3'); // 应该驱逐 key1

      const stats = cache.getStats();
      expect(stats.evictions).toBe(1);
    });
  });

  describe('edge cases', () => {
    it('should handle null values', () => {
      const cache = new LRUCache();

      cache.set('key1', null);
      expect(cache.get('key1')).toBeNull();
    });

    it('should handle undefined values', () => {
      const cache = new LRUCache();

      cache.set('key1', undefined);
      expect(cache.get('key1')).toBeUndefined();
    });

    it('should handle large values', () => {
      const cache = new LRUCache({ maxSize: 10 });

      const largeValue = 'x'.repeat(1000000); // 1MB string
      cache.set('key1', largeValue);
      expect(cache.get('key1')).toBe(largeValue);
    });

    it('should handle special characters in keys', () => {
      const cache = new LRUCache();

      const specialKey = 'key:with:special:chars';
      cache.set(specialKey, 'value');
      expect(cache.get(specialKey)).toBe('value');
    });
  });
});

describe('RedisConnectionPool', () => {
  let redisAvailable = false;

  beforeAll(async () => {
    redisAvailable = await isRedisAvailable();
    if (!redisAvailable) {
      console.log('[RedisConnectionPool] Redis not available at localhost:6379 — pool tests will be skipped');
    }
  });

  // Mock RedisClient for testing
  class MockRedisClient {
    private connected = false;

    async connect() {
      this.connected = true;
      return { success: true, data: undefined };
    }

    async disconnect() {
      this.connected = false;
    }

    async ping() {
      if (!this.connected) {
        throw new Error('Not connected');
      }
      return 'PONG';
    }

    isReady() {
      return this.connected;
    }
  }

  describe('constructor', () => {
    it('should create instance with default config', () => {
      const pool = new RedisConnectionPool({
        host: 'localhost',
        port: 6379,
      });
      expect(pool).toBeDefined();
    });

    it('should accept custom config', () => {
      const pool = new RedisConnectionPool({
        host: 'custom-host',
        port: 6380,
        password: 'secret',
        poolSize: 20,
        maxIdleTime: 600000,
      });
      expect(pool).toBeDefined();
    });
  });

  describe('acquire with mocked clients', () => {
    let pool: RedisConnectionPool;
    let mockClients: MockRedisClient[];

    beforeEach(async () => {
      if (!redisAvailable) return;

      pool = new RedisConnectionPool({
        host: 'localhost',
        port: 6379,
        poolSize: 2,
      });

      // Manually initialize with mock clients by accessing internal state
      mockClients = [new MockRedisClient(), new MockRedisClient()];

      // Initialize the pool
      await pool.initialize();
    });

    afterEach(async () => {
      if (!redisAvailable) return;
      await pool.close();
    });

    it('should acquire available connection', async () => {
      if (!redisAvailable) return;
      // After initialize, connections should be available
      const stats = pool.getStats();
      expect(stats.size).toBeGreaterThan(0);
    });

    it('should timeout when waiting for connection', async () => {
      if (!redisAvailable) return;
      // Create a pool with poolSize 1
      const singlePool = new RedisConnectionPool({
        host: 'localhost',
        port: 6379,
        poolSize: 1,
      });

      await singlePool.initialize();

      // Get the only connection
      const conn1 = await singlePool.acquire();
      expect(conn1).toBeDefined();

      // Try to acquire another connection - should timeout
      const shortTimeout = 100; // 100ms
      await expect(singlePool.acquire(shortTimeout)).rejects.toThrow('timeout');

      // Release the connection
      singlePool.release(conn1);

      // Now should be able to acquire
      const conn2 = await singlePool.acquire();
      expect(conn2).toBeDefined();

      await singlePool.close();
    });

    it('should reject when wait queue is full', async () => {
      if (!redisAvailable) return;
      const smallPool = new RedisConnectionPool({
        host: 'localhost',
        port: 6379,
        poolSize: 1,
        maxQueueSize: 2,
      });

      await smallPool.initialize();

      // Get the only connection
      const conn1 = await smallPool.acquire();
      expect(conn1).toBeDefined();

      // Fill the wait queue (maxQueueSize = 2)
      const waitingPromises: Promise<any>[] = [];
      for (let i = 0; i < 2; i++) {
        waitingPromises.push(smallPool.acquire(5000).catch((e) => e));
      }

      // Wait a bit for promises to start
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Next acquire should reject immediately due to full queue
      await expect(smallPool.acquire(100)).rejects.toThrow('queue full');

      // Release the connection
      smallPool.release(conn1);

      // Wait for waiting promises to resolve
      await Promise.all(waitingPromises);

      await smallPool.close();
    });
  });

  describe('getStats', () => {
    it('should return pool statistics', async () => {
      if (!redisAvailable) return;
      const pool = new RedisConnectionPool({
        host: 'localhost',
        port: 6379,
        poolSize: 5,
      });

      await pool.initialize();

      const stats = pool.getStats();
      expect(stats.size).toBe(5);
      expect(stats.available).toBeGreaterThanOrEqual(0);
      expect(stats.busy).toBe(0);
      expect(stats.waiting).toBe(0);

      await pool.close();
    });
  });
});
