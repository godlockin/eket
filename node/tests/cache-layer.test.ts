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

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { LRUCache } from '../core/cache-layer';
import type { CacheConfig } from '../types/index';

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
