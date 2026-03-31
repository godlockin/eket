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
  lastAccessAt: number;
}

/**
 * 缓存配置
 */
export interface CacheConfig {
  maxSize: number;           // 最大缓存条目数
  defaultTTL: number;        // 默认 TTL（毫秒）
  useRedis: boolean;         // 是否启用 Redis 缓存
  redisPrefix: string;       // Redis key 前缀
  redisClient?: RedisClient; // 可选的共享 Redis 客户端
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

    // 支持传入现有 Redis 客户端或创建新客户端
    if (this.config.useRedis) {
      this.redis = config.redisClient || createRedisClient();
    }
  }

  /**
   * 获取缓存值（同步版本，仅内存缓存）
   * O(1) LRU: 更新迭代顺序，将访问的键移到末尾
   */
  get(key: string): T | undefined {
    // 先从内存缓存获取
    const entry = this.cache.get(key);
    if (entry) {
      // expiresAt 为 0 或 Infinity 表示永不过期
      if (entry.expiresAt === 0 || entry.expiresAt === Infinity || entry.expiresAt > Date.now()) {
        entry.lastAccessAt = Date.now();  // 更新最后访问时间
        entry.hits++;
        this.stats.hits++;
        // O(1) LRU 优化：删除后重新添加到末尾，更新迭代顺序
        this.cache.delete(key);
        this.cache.set(key, entry);
        return entry.value as T;
      } else {
        // 过期，删除
        this.cache.delete(key);
        this.stats.expirations++;
      }
    }

    this.stats.misses++;
    return undefined;
  }

  /**
   * 获取缓存值（异步版本，包含 Redis 回源）
   */
  async getAsync(key: string): Promise<T | null> {
    // 先从内存缓存获取
    const entry = this.cache.get(key);
    if (entry) {
      if (entry.expiresAt > Date.now()) {
        entry.lastAccessAt = Date.now();  // 更新最后访问时间
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
   * 设置缓存值（同步版本，仅内存缓存）
   * O(1) LRU: 更新迭代顺序，将新键移到末尾
   */
  set(key: string, value: T, ttl?: number): void {
    const now = Date.now();
    // TTL 为 0 或 -1 表示永不过期
    const expiresAt = (ttl === 0 || ttl === -1) ? Infinity : now + (ttl ?? this.config.defaultTTL);

    const entry: CacheEntry<T> = {
      value,
      expiresAt,
      hits: 0,
      createdAt: now,
      lastAccessAt: now,  // 初始化最后访问时间
    };

    // 如果键已存在，先删除以更新迭代顺序
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }

    // LRU 驱逐
    if (this.cache.size >= this.config.maxSize) {
      this.evictLRU();
    }

    this.cache.set(key, entry);
  }

  /**
   * 设置缓存值（异步版本，同时写入 Redis）
   */
  async setAsync(key: string, value: T, ttl?: number): Promise<void> {
    const now = Date.now();
    // TTL 为 0 或 -1 表示永不过期
    const expiresAt = (ttl === 0 || ttl === -1) ? Infinity : now + (ttl ?? this.config.defaultTTL);

    const entry: CacheEntry<T> = {
      value,
      expiresAt,
      hits: 0,
      createdAt: now,
      lastAccessAt: now,  // 初始化最后访问时间
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
          // Redis 中 TTL 为 0 表示永不过期
          const ttlSeconds = (ttl === 0 || ttl === -1) ? 0 : Math.ceil((ttl ?? this.config.defaultTTL) / 1000);
          if (ttlSeconds === 0) {
            await client.set(`${this.config.redisPrefix}${key}`, JSON.stringify(value));
          } else {
            await client.setex(
              `${this.config.redisPrefix}${key}`,
              ttlSeconds,
              JSON.stringify(value)
            );
          }
        }
      } catch {
        console.warn('[LRUCache] Redis set error');
      }
    }
  }

  /**
   * 删除缓存（同步版本）
   */
  delete(key: string): void {
    this.cache.delete(key);
  }

  /**
   * 检查键是否存在（同步版本）
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (entry) {
      if (entry.expiresAt > Date.now()) {
        return true;
      } else {
        // 过期，删除
        this.cache.delete(key);
        this.stats.expirations++;
      }
    }
    return false;
  }

  /**
   * 删除缓存（异步版本，同时删除 Redis）
   */
  async deleteAsync(key: string): Promise<void> {
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
   * 清除所有缓存（同步版本）
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * 清除所有缓存（异步版本，同时清除 Redis）
   */
  async clearAsync(): Promise<void> {
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
   * 获取缓存大小
   */
  get size(): number {
    return this.cache.size;
  }

  /**
   * 预热缓存（批量加载）
   */
  async warmup(entries: Array<{ key: string; value: T; ttl?: number }>): Promise<void> {
    for (const { key, value, ttl } of entries) {
      await this.setAsync(key, value, ttl);
    }
  }

  /**
   * 获取或计算（防止缓存穿透，迭代实现避免栈溢出）
   */
  async getOrCompute(
    key: string,
    compute: () => Promise<T>,
    ttl?: number
  ): Promise<T> {
    const maxRetries = 50;  // 防止无限循环
    let retries = 0;

    while (retries < maxRetries) {
      // 先从内存缓存获取
      const cached = this.get(key);
      if (cached !== undefined) {
        return cached;
      }

      // 尝试从 Redis 获取
      const redisValue = await this.getAsync(key);
      if (redisValue !== null) {
        // getAsync 已经处理了反序列化
        return redisValue;
      }

      // 使用互斥锁防止缓存穿透
      const lockKey = `${key}:lock`;
      const lockValue = await this.getAsync(lockKey);

      if (lockValue) {
        // 正在计算中，等待后重试（迭代而非递归）
        await new Promise(r => setTimeout(r, 100));
        retries++;
        continue;
      }

      // 尝试获取锁
      const acquired = await this.tryAcquireLock(lockKey);
      if (!acquired) {
        // 获取锁失败，等待后重试
        await new Promise(r => setTimeout(r, 100));
        retries++;
        continue;
      }

      try {
        // 双重检查：可能在获取锁期间已被计算
        const doubleCheck = this.get(key);
        if (doubleCheck !== undefined) {
          return doubleCheck;
        }

        const redisDoubleCheck = await this.getAsync(key);
        if (redisDoubleCheck !== null) {
          return redisDoubleCheck;
        }

        // 计算值
        const value = await compute();

        // 设置缓存
        this.set(key, value, ttl);
        await this.setAsync(key, value, ttl);

        return value;
      } finally {
        // 释放锁
        await this.releaseLock(lockKey);
      }
    }

    throw new Error('getOrCompute timeout after max retries');
  }

  /**
   * 尝试获取分布式锁
   */
  private async tryAcquireLock(lockKey: string): Promise<boolean> {
    const lockValue = 'locked:' + Date.now();
    const lockTtl = 5000; // 5 秒锁超时

    if (this.redis && this.redis.isReady()) {
      try {
        const client = this.redis.getClient();
        if (client) {
          // 使用 SET NX EX 原子操作获取锁
          const result = await client.set(
            `${this.config.redisPrefix}${lockKey}`,
            lockValue,
            'EX',
            Math.ceil(lockTtl / 1000)
          );
          return result === 'OK' || result === true;
        }
      } catch {
        console.warn('[LRUCache] Redis lock acquire error');
      }
    }

    // Fallback: 内存锁（单实例场景）
    const existingLock = this.cache.get(lockKey);
    if (!existingLock || existingLock.expiresAt <= Date.now()) {
      this.set(lockKey, lockValue as unknown as T, lockTtl);
      return true;
    }

    return false;
  }

  /**
   * 释放分布式锁
   */
  private async releaseLock(lockKey: string): Promise<void> {
    if (this.redis && this.redis.isReady()) {
      try {
        const client = this.redis.getClient();
        if (client) {
          await client.del(`${this.config.redisPrefix}${lockKey}`);
        }
      } catch {
        console.warn('[LRUCache] Redis lock release error');
      }
    }

    // Fallback: 删除内存锁
    this.delete(lockKey);
  }

  /**
   * LRU 驱逐 - O(1) 实现
   * 利用 Map 的迭代顺序：第一个条目就是最久未使用的
   */
  private evictLRU(): void {
    // Map.entries() 返回的迭代器按插入顺序遍历
    // 第一个条目就是最久未使用的（LRU）
    const firstEntry = this.cache.entries().next();
    if (!firstEntry.done) {
      const [lruKey] = firstEntry.value;
      this.cache.delete(lruKey);
      this.stats.evictions++;
    }
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
  private waitQueue: Array<{
    resolve: (client: RedisClient) => void;
    reject: (error: Error) => void;
    timeoutId: ReturnType<typeof setTimeout>;
  }> = [];

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
  async acquire(timeout = 30000): Promise<RedisClient> {
    // 查找空闲连接
    for (const item of this.clients) {
      if (!item.busy) {
        // 健康检查
        try {
          await item.client.ping();
          item.busy = true;
          item.lastUsed = Date.now();
          return item.client;
        } catch (error) {
          // 连接失效，替换
          await this.replaceConnection(item);
        }
      }
    }

    // 检查队列是否已满（限制为 poolSize 的 2 倍）
    if (this.waitQueue.length >= this.config.poolSize * 2) {
      throw new Error('Connection pool wait queue full');
    }

    // 带超时的等待
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        // 从等待队列中移除
        const index = this.waitQueue.findIndex((item) => item.resolve === resolve);
        if (index > -1) {
          this.waitQueue.splice(index, 1);
        }
        reject(new Error('Acquire connection timeout'));
      }, timeout);

      this.waitQueue.push({
        resolve: () => {
          clearTimeout(timeoutId);
          // 查找可用连接
          const available = this.clients.find((c) => !c.busy);
          if (available) {
            available.busy = true;
            available.lastUsed = Date.now();
            resolve(available.client);
          } else {
            reject(new Error('No available connection after wait'));
          }
        },
        reject,
        timeoutId,
      });
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
          const waiter = this.waitQueue.shift();
          if (waiter) {
            clearTimeout(waiter.timeoutId);
            waiter.resolve(client);
          }
        }
        return;
      }
    }
  }

  /**
   * 替换失效的连接
   */
  private async replaceConnection(
    item: { client: RedisClient; lastUsed: number; busy: boolean }
  ): Promise<void> {
    try {
      // 断开旧连接
      await item.client.disconnect();
    } catch {
      // Ignore disconnect errors
    }

    // 创建新连接
    const newClient = new RedisClient({
      host: this.config.host,
      port: this.config.port,
      password: this.config.password,
    });

    const result = await newClient.connect();
    if (result.success) {
      item.client = newClient;
      item.lastUsed = Date.now();
      console.log('[RedisPool] Replaced stale connection');
    } else {
      console.warn('[RedisPool] Failed to replace connection');
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
