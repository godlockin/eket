/**
 * EKET Framework - Cache Layer & Connection Pool
 * Phase 7: 错误恢复和性能优化
 *
 * 缓存层：
 * - LRU 缓存策略
 * - TTL 过期机制
 * - 多层缓存（内存 + Redis）
 * - 缓存穿透保护
 *
 * 连接池：
 * - Redis 连接复用
 * - SQLite 连接池
 * - 自动健康检查
 */

import type { Result } from '../types/index.js';
import { EketError } from '../types/index.js';
import { RedisClient, createRedisClient } from './redis-client.js';

/**
 * 缓存条目
 */
interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  hits: number;
  createdAt: number;
}

/**
 * 缓存配置
 */
export interface CacheConfig {
  maxSize: number;           // 最大缓存条目数
  defaultTTL: number;        // 默认 TTL（毫秒）
  useRedis: boolean;         // 是否启用 Redis 缓存
  redisPrefix: string;       // Redis key 前缀
}

/**
 * 缓存统计
 */
export interface CacheStats {
  hits: number;
  misses: number;
  evictions: number;
  expirations: number;
  size: number;
  hitRate: number;
}

/**
 * LRU 缓存实现
 */
export class LRUCache<T = unknown> {
  private config: CacheConfig;
  private cache: Map<string, CacheEntry<T>>;
  private redis?: RedisClient;
  private stats: { hits: number; misses: number; evictions: number; expirations: number } = {
    hits: 0,
    misses: 0,
    evictions: 0,
    expirations: 0,
  };

  constructor(config: Partial<CacheConfig> = {}) {
    this.config = {
      maxSize: config.maxSize || 1000,
      defaultTTL: config.defaultTTL || 300000, // 5 分钟
      useRedis: config.useRedis || false,
      redisPrefix: config.redisPrefix || 'eket:cache:',
    };
    this.cache = new Map();

    if (this.config.useRedis) {
      this.redis = createRedisClient();
    }
  }

  /**
   * 获取缓存值
   */
  async get(key: string): Promise<T | null> {
    // 先从内存缓存获取
    const entry = this.cache.get(key);
    if (entry) {
      if (entry.expiresAt > Date.now()) {
        entry.hits++;
        this.stats.hits++;
        return entry.value as T;
      } else {
        // 过期，删除
        this.cache.delete(key);
        this.stats.expirations++;
      }
    }

    this.stats.misses++;

    // 内存未命中，尝试 Redis
    if (this.redis && this.redis.isReady()) {
      try {
        const client = this.redis.getClient();
        if (client) {
          const data = await client.get(`${this.config.redisPrefix}${key}`);
          if (data) {
            const value = JSON.parse(data) as T;
            // 回写到内存缓存
            this.set(key, value);
            return value;
          }
        }
      } catch {
        console.warn('[LRUCache] Redis get error');
      }
    }

    return null;
  }

  /**
   * 设置缓存值
   */
  async set(key: string, value: T, ttl?: number): Promise<void> {
    const now = Date.now();
    const entry: CacheEntry<T> = {
      value,
      expiresAt: now + (ttl || this.config.defaultTTL),
      hits: 0,
      createdAt: now,
    };

    // LRU 驱逐
    if (this.cache.size >= this.config.maxSize) {
      this.evictLRU();
    }

    this.cache.set(key, entry);

    // 同时写入 Redis（如果启用）
    if (this.redis && this.redis.isReady()) {
      try {
        const client = this.redis.getClient();
        if (client) {
          const ttlSeconds = Math.ceil((ttl || this.config.defaultTTL) / 1000);
          await client.setex(
            `${this.config.redisPrefix}${key}`,
            ttlSeconds,
            JSON.stringify(value)
          );
        }
      } catch {
        console.warn('[LRUCache] Redis set error');
      }
    }
  }

  /**
   * 删除缓存
   */
  async delete(key: string): Promise<void> {
    this.cache.delete(key);

    if (this.redis && this.redis.isReady()) {
      try {
        const client = this.redis.getClient();
        if (client) {
          await client.del(`${this.config.redisPrefix}${key}`);
        }
      } catch {
        console.warn('[LRUCache] Redis del error');
      }
    }
  }

  /**
   * 清除所有缓存
   */
  async clear(): Promise<void> {
    this.cache.clear();

    if (this.redis && this.redis.isReady()) {
      try {
        const client = this.redis.getClient();
        if (client) {
          const keys = await client.keys(`${this.config.redisPrefix}*`);
          if (keys.length > 0) {
            await client.del(...keys);
          }
        }
      } catch {
        console.warn('[LRUCache] Redis clear error');
      }
    }
  }

  /**
   * 获取缓存统计
   */
  getStats(): CacheStats {
    const total = this.stats.hits + this.stats.misses;
    return {
      ...this.stats,
      size: this.cache.size,
      hitRate: total > 0 ? this.stats.hits / total : 0,
      evictions: this.stats.evictions,
      expirations: this.stats.expirations,
    };
  }

  /**
   * 预热缓存（批量加载）
   */
  async warmup(entries: Array<{ key: string; value: T; ttl?: number }>): Promise<void> {
    for (const { key, value, ttl } of entries) {
      await this.set(key, value, ttl);
    }
  }

  /**
   * 获取或计算（防止缓存穿透）
   */
  async getOrCompute(
    key: string,
    compute: () => Promise<T>,
    ttl?: number
  ): Promise<T> {
    // 使用互斥锁防止缓存穿透
    const lockKey = `${key}:lock`;
    const lockValue = await this.get(lockKey) as unknown as string | null;

    if (lockValue) {
      // 正在计算中，等待
      await this.sleep(100);
      return this.getOrCompute(key, compute, ttl);
    }

    const cached = await this.get(key);
    if (cached !== null) {
      return cached;
    }

    // 设置锁
    await this.set(lockKey, 'computing' as unknown as T, 5000);

    try {
      const value = await compute();
      await this.set(key, value, ttl);
      return value;
    } finally {
      // 释放锁
      await this.delete(lockKey);
    }
  }

  /**
   * LRU 驱逐
   */
  private evictLRU(): void {
    let lruKey: string | null = null;
    let lruTime = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      const accessTime = entry.createdAt + (entry.hits * 1000); // 简化的 LRU
      if (accessTime < lruTime) {
        lruTime = accessTime;
        lruKey = key;
      }
    }

    if (lruKey) {
      this.cache.delete(lruKey);
      this.stats.evictions++;
    }
  }

  /**
   * 延迟执行
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * 连接 Redis
   */
  async connect(): Promise<Result<void>> {
    if (this.redis) {
      return await this.redis.connect();
    }
    return { success: true, data: undefined };
  }

  /**
   * 断开连接
   */
  async disconnect(): Promise<void> {
    if (this.redis) {
      await this.redis.disconnect();
    }
  }
}

/**
 * Redis 连接池
 */
export class RedisConnectionPool {
  private config: {
    host: string;
    port: number;
    password?: string;
    poolSize: number;
    maxIdleTime: number;
  };
  private clients: Array<{ client: RedisClient; lastUsed: number; busy: boolean }> = [];
  private waitQueue: Array<(client: RedisClient) => void> = [];

  constructor(config: {
    host: string;
    port: number;
    password?: string;
    poolSize?: number;
    maxIdleTime?: number;
  }) {
    this.config = {
      host: config.host || 'localhost',
      port: config.port || 6379,
      password: config.password,
      poolSize: config.poolSize || 10,
      maxIdleTime: config.maxIdleTime || 300000,
    };
  }

  /**
   * 初始化连接池
   */
  async initialize(): Promise<Result<void>> {
    try {
      for (let i = 0; i < this.config.poolSize; i++) {
        const client = new RedisClient({
          host: this.config.host,
          port: this.config.port,
          password: this.config.password,
        });

        const result = await client.connect();
        if (result.success) {
          this.clients.push({
            client,
            lastUsed: Date.now(),
            busy: false,
          });
        }
      }

      console.log(`[RedisPool] Initialized with ${this.clients.length} connections`);
      return { success: true, data: undefined };
    } catch (err) {
      return {
        success: false,
        error: new EketError('REDIS_POOL_INIT_FAILED', `Failed to initialize pool: ${err}`),
      };
    }
  }

  /**
   * 获取连接
   */
  async acquire(): Promise<RedisClient> {
    // 查找空闲连接
    for (const item of this.clients) {
      if (!item.busy && item.client.isReady()) {
        item.busy = true;
        item.lastUsed = Date.now();
        return item.client;
      }
    }

    // 没有空闲连接，等待
    return new Promise((resolve) => {
      this.waitQueue.push(resolve);
    });
  }

  /**
   * 释放连接
   */
  release(client: RedisClient): void {
    for (const item of this.clients) {
      if (item.client === client) {
        item.busy = false;
        item.lastUsed = Date.now();

        // 唤醒等待队列
        if (this.waitQueue.length > 0) {
          const resolver = this.waitQueue.shift();
          if (resolver) {
            resolver(client);
          }
        }
        return;
      }
    }
  }

  /**
   * 获取池统计
   */
  getStats(): { size: number; available: number; busy: number; waiting: number } {
    const available = this.clients.filter((c) => !c.busy && c.client.isReady()).length;
    const busy = this.clients.filter((c) => c.busy).length;

    return {
      size: this.clients.length,
      available,
      busy,
      waiting: this.waitQueue.length,
    };
  }

  /**
   * 关闭连接池
   */
  async close(): Promise<void> {
    for (const item of this.clients) {
      await item.client.disconnect();
    }
    this.clients = [];
  }
}

/**
 * 创建缓存实例
 */
export function createCache(config?: Partial<CacheConfig>): LRUCache {
  return new LRUCache(config);
}

/**
 * 创建 Redis 连接池
 */
export function createRedisConnectionPool(config: {
  host: string;
  port: number;
  password?: string;
  poolSize?: number;
  maxIdleTime?: number;
}): RedisConnectionPool {
  return new RedisConnectionPool(config);
}
