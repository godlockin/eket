/**
 * Redis Client Module
 * 用于 Slaver 心跳监控和消息队列
 */

import type { SlaverHeartbeat, Result } from '../types/index.js';
import { EketError } from '../types/index.js';

// Runtime import (lazy loaded)
// Using dynamic import for ESM compatibility with ioredis
let RedisConstructor: any = null;

export class RedisClient {
  private client: any | null = null;
  private config: { host: string; port: number; password?: string; db?: number; keyPrefix?: string };
  private isConnected: boolean = false;

  constructor(config: { host: string; port: number; password?: string; db?: number; keyPrefix?: string }) {
    // Defensive copy to prevent external mutation
    this.config = { ...config };
  }

  /**
   * 连接 Redis
   */
  async connect(): Promise<Result<void>> {
    try {
      // Lazy load ioredis for ESM compatibility
      if (!RedisConstructor) {
        const ioredis = await import('ioredis');
        RedisConstructor = ioredis.default;
      }

      this.client = new RedisConstructor({
        host: this.config.host,
        port: this.config.port,
        password: this.config.password,
        db: this.config.db,
        keyPrefix: this.config.keyPrefix || 'eket:',
        retryStrategy: (times: number) => {
          if (times > 3) {
            return null; // 停止重试
          }
          return Math.min(times * 200, 2000);
        },
      });

      this.client.on('connect', () => {
        this.isConnected = true;
        console.log('[Redis] Connected');
      });

      this.client.on('error', () => {
        this.isConnected = false;
        console.error('[Redis] Error');
      });

      this.client.on('close', () => {
        this.isConnected = false;
        console.log('[Redis] Connection closed');
      });

      // 等待连接
      await new Promise<void>((resolve, reject) => {
        if (this.client) {
          this.client.once('connect', () => resolve());
          this.client.once('error', reject);
          setTimeout(() => reject(new Error('Connection timeout')), 5000);
        }
      });

      return { success: true, data: undefined };
    } catch {
      return {
        success: false,
        error: new EketError('REDIS_CONNECTION_FAILED', 'Failed to connect Redis'),
      };
    }
  }

  /**
   * 关闭连接
   */
  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      this.client = null;
      this.isConnected = false;
    }
  }

  /**
   * 检查连接状态
   */
  isReady(): boolean {
    return this.isConnected && this.client !== null;
  }

  /**
   * 注册 Slaver 心跳
   */
  async registerSlaver(heartbeat: SlaverHeartbeat): Promise<Result<void>> {
    if (!this.client) {
      return {
        success: false,
        error: new EketError('REDIS_NOT_CONNECTED', 'Redis client not connected'),
      };
    }

    try {
      const key = `slaver:${heartbeat.slaverId}:heartbeat`;
      const ttl = 30; // 30 秒过期

      await this.client.setex(
        key,
        ttl,
        JSON.stringify({
          ...heartbeat,
          timestamp: Date.now(),
        })
      );

      // 添加到活跃 Slaver 集合
      await this.client.sadd('slavers:active', heartbeat.slaverId);

      return { success: true, data: undefined };
    } catch {
      return {
        success: false,
        error: new EketError('REDIS_OPERATION_FAILED', 'Failed to register slaver'),
      };
    }
  }

  /**
   * 获取所有活跃 Slaver
   */
  async getActiveSlavers(): Promise<Result<SlaverHeartbeat[]>> {
    if (!this.client) {
      return {
        success: false,
        error: new EketError('REDIS_NOT_CONNECTED', 'Redis client not connected'),
      };
    }

    try {
      const slaverIds = await this.client.smembers('slavers:active');
      const heartbeats: SlaverHeartbeat[] = [];

      for (const slaverId of slaverIds) {
        const key = `slaver:${slaverId}:heartbeat`;
        const data = await this.client.get(key);

        if (data) {
          const heartbeat = JSON.parse(data) as SlaverHeartbeat;
          // 检查是否过期（超过 30 秒无心跳）
          const now = Date.now();
          if (now - heartbeat.timestamp < 30000) {
            heartbeats.push(heartbeat);
          } else {
            // 移除过期的 Slaver
            await this.client.srem('slavers:active', slaverId);
          }
        } else {
          // 心跳 key 不存在，移除
          await this.client.srem('slavers:active', slaverId);
        }
      }

      return { success: true, data: heartbeats };
    } catch {
      return {
        success: false,
        error: new EketError('REDIS_OPERATION_FAILED', 'Failed to get active slavers'),
      };
    }
  }

  /**
   * 发布消息到消息队列
   */
  async publishMessage(channel: string, message: string): Promise<Result<void>> {
    if (!this.client) {
      return {
        success: false,
        error: new EketError('REDIS_NOT_CONNECTED', 'Redis client not connected'),
      };
    }

    try {
      await this.client.publish(channel, message);
      return { success: true, data: undefined };
    } catch {
      return {
        success: false,
        error: new EketError('REDIS_OPERATION_FAILED', 'Failed to publish message'),
      };
    }
  }

  /**
   * 订阅消息通道
   */
  async subscribeMessage(
    channel: string,
    onMessage: (message: string) => void
  ): Promise<Result<void>> {
    if (!this.client) {
      return {
        success: false,
        error: new EketError('REDIS_NOT_CONNECTED', 'Redis client not connected'),
      };
    }

    try {
      // Lazy load ioredis for ESM compatibility
      if (!RedisConstructor) {
        const ioredis = await import('ioredis');
        RedisConstructor = ioredis.default;
      }

      const subscriber = new RedisConstructor({
        host: this.config.host,
        port: this.config.port,
        password: this.config.password,
        db: this.config.db,
      });

      // Promise-based subscribe
      await subscriber.subscribe(channel);

      subscriber.on('message', (ch: string, msg: string) => {
        if (ch === channel) {
          onMessage(msg);
        }
      });

      return { success: true, data: undefined };
    } catch {
      return {
        success: false,
        error: new EketError('REDIS_OPERATION_FAILED', 'Failed to subscribe'),
      };
    }
  }
}

/**
 * 创建默认 Redis 客户端
 */
export function createRedisClient(): RedisClient {
  const host = process.env.EKET_REDIS_HOST || 'localhost';
  const port = parseInt(process.env.EKET_REDIS_PORT || '6379', 10);
  const password = process.env.EKET_REDIS_PASSWORD;

  return new RedisClient({ host, port, password });
}
