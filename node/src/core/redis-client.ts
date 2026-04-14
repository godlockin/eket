/**
 * Redis Client Module
 * 用于 Slaver 心跳监控和消息队列
 *
 * v2.0.0 扩展性增强:
 * - 支持 Redis Cluster 模式
 * - 支持单机/集群自动切换
 */

import type { SlaverHeartbeat, Result } from '../types/index.js';
import { EketError, EketErrorCode } from '../types/index.js';

// Type for ioredis client (lazy loaded)
type IORedis = typeof import('ioredis').default;
type IORedisClient = InstanceType<IORedis>;
type IORedisCluster = typeof import('ioredis').Cluster;
type IORedisClusterClient = InstanceType<IORedisCluster>;

// Runtime import (lazy loaded)
// Using dynamic import for ESM compatibility with ioredis
let RedisConstructor: IORedis | null = null;
let RedisClusterConstructor: IORedisCluster | null = null;

export interface RedisClientConfig {
  host: string;
  port: number;
  password?: string;
  db?: number;
  keyPrefix?: string;
  clusterMode?: boolean;
  clusterNodes?: Array<{ host: string; port: number }>;
}

export class RedisClient {
  private client: IORedisClient | IORedisClusterClient | null = null;
  private config: RedisClientConfig;
  private isConnected = false;
  private isClusterMode = false;

  constructor(config: RedisClientConfig) {
    // Defensive copy to prevent external mutation
    this.config = { ...config };
    this.isClusterMode = config.clusterMode || false;
  }

  /**
   * 检查是否为集群模式
   */
  isCluster(): boolean {
    return this.isClusterMode;
  }

  /**
   * 获取底层 Redis 客户端（用于高级操作）
   */
  getClient(): IORedisClient | IORedisClusterClient | null {
    return this.client;
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
        RedisClusterConstructor = ioredis.Cluster;
      }

      if (this.isClusterMode && this.config.clusterNodes && this.config.clusterNodes.length > 0) {
        // Cluster 模式连接
        return await this.connectCluster();
      } else {
        // 单机模式连接
        return await this.connectStandalone();
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      return {
        success: false,
        error: new EketError(EketErrorCode.REDIS_CONNECTION_FAILED, `Failed to connect Redis: ${errorMessage}`),
      };
    }
  }

  /**
   * 连接 Redis Cluster
   */
  private async connectCluster(): Promise<Result<void>> {
    if (!RedisClusterConstructor) {
      return {
        success: false,
        error: new EketError(EketErrorCode.REDIS_CONNECTION_FAILED, 'Redis Cluster constructor not loaded'),
      };
    }

    const nodes = this.config.clusterNodes!.map((node) => ({
      host: node.host,
      port: node.port,
    }));

    this.client = new RedisClusterConstructor(nodes, {
      redisOptions: {
        password: this.config.password,
        db: this.config.db,
      },
      clusterRetryStrategy: (times: number) => {
        if (times > 3) {
          return null; // 停止重试
        }
        return Math.min(times * 200, 2000);
      },
      slotsRefreshTimeout: 5000,
      retryDelayOnFailover: 100,
    });

    this.setupClusterEventHandlers();

    // 等待连接
    await new Promise<void>((resolve, reject) => {
      if (this.client) {
        this.client.once('connect', () => resolve());
        this.client.once('error', reject);
        setTimeout(() => reject(new Error('Cluster connection timeout')), 10000);
      }
    });

    return { success: true, data: undefined };
  }

  /**
   * 连接 Redis 单机模式
   */
  private async connectStandalone(): Promise<Result<void>> {
    if (!RedisConstructor) {
      return {
        success: false,
        error: new EketError(EketErrorCode.REDIS_CONNECTION_FAILED, 'Redis constructor not loaded'),
      };
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

    this.setupStandaloneEventHandlers();

    // 等待连接
    await new Promise<void>((resolve, reject) => {
      if (this.client) {
        this.client.once('connect', () => resolve());
        this.client.once('error', reject);
        setTimeout(() => reject(new Error('Connection timeout')), 5000);
      }
    });

    return { success: true, data: undefined };
  }

  /**
   * 设置 Cluster 事件处理器
   */
  private setupClusterEventHandlers(): void {
    if (!this.client) {
      return;
    }

    this.client.on('connect', () => {
      this.isConnected = true;
      console.log('[Redis Cluster] Connected');
    });

    this.client.on('error', (err) => {
      this.isConnected = false;
      console.error('[Redis Cluster] Error:', err.message);
    });

    this.client.on('close', () => {
      this.isConnected = false;
      console.log('[Redis Cluster] Connection closed');
    });

    this.client.on('+node', (node) => {
      console.log('[Redis Cluster] Node added:', `${node.host}:${node.port}`);
    });

    this.client.on('-node', (node) => {
      console.log('[Redis Cluster] Node removed:', `${node.host}:${node.port}`);
    });
  }

  /**
   * 设置单机模式事件处理器
   */
  private setupStandaloneEventHandlers(): void {
    if (!this.client) {
      return;
    }

    (this.client as IORedisClient).on('connect', () => {
      this.isConnected = true;
      console.log('[Redis] Connected');
    });

    (this.client as IORedisClient).on('error', () => {
      this.isConnected = false;
      console.error('[Redis] Error');
    });

    (this.client as IORedisClient).on('close', () => {
      this.isConnected = false;
      console.log('[Redis] Connection closed');
    });
  }

  /**
   * 关闭连接
   */
  async disconnect(): Promise<void> {
    if (this.client) {
      if (this.isClusterMode) {
        await (this.client as IORedisClusterClient).quit();
      } else {
        await (this.client as IORedisClient).quit();
      }
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
   * Ping Redis 服务器（健康检查）
   */
  async ping(): Promise<string> {
    if (!this.client) {
      throw new Error('Redis client not connected');
    }
    return await this.client.ping();
  }

  /**
   * 注册 Slaver 心跳
   */
  async registerSlaver(heartbeat: SlaverHeartbeat): Promise<Result<void>> {
    if (!this.client) {
      return {
        success: false,
        error: new EketError(EketErrorCode.REDIS_NOT_CONNECTED, 'Redis client not connected'),
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
        error: new EketError(EketErrorCode.REDIS_OPERATION_FAILED, 'Failed to register slaver'),
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
        error: new EketError(EketErrorCode.REDIS_NOT_CONNECTED, 'Redis client not connected'),
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
          // 向后兼容：老心跳数据可能缺少新字段
          if (!heartbeat.capabilities) heartbeat.capabilities = [];
          if (!heartbeat.capacity) {
            heartbeat.capacity = {
              maxConcurrent: 1,
              current: heartbeat.currentTaskId ? 1 : 0
            };
          }
          // 向后兼容：老 status 'active' → 'idle'
          if ((heartbeat.status as string) === 'active') heartbeat.status = 'idle';
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
        error: new EketError(EketErrorCode.REDIS_OPERATION_FAILED, 'Failed to get active slavers'),
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
        error: new EketError(EketErrorCode.REDIS_NOT_CONNECTED, 'Redis client not connected'),
      };
    }

    try {
      await this.client.publish(channel, message);
      return { success: true, data: undefined };
    } catch {
      return {
        success: false,
        error: new EketError(EketErrorCode.REDIS_OPERATION_FAILED, 'Failed to publish message'),
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
        error: new EketError(EketErrorCode.REDIS_NOT_CONNECTED, 'Redis client not connected'),
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
        error: new EketError(EketErrorCode.REDIS_OPERATION_FAILED, 'Failed to subscribe'),
      };
    }
  }
}

/**
 * 创建默认 Redis 客户端
 */
export function createRedisClient(config?: {
  host?: string;
  port?: number;
  password?: string;
  db?: number;
  keyPrefix?: string;
  clusterMode?: boolean;
  clusterNodes?: Array<{ host: string; port: number }>;
}): RedisClient {
  // 支持从环境变量读取 Cluster 配置
  const clusterNodesEnv = process.env.EKET_REDIS_CLUSTER_NODES;
  let clusterNodes: Array<{ host: string; port: number }> | undefined;

  if (clusterNodesEnv) {
    // 格式：host1:port1,host2:port2,host3:port3
    clusterNodes = clusterNodesEnv.split(',').map((node) => {
      const [host, port] = node.split(':');
      return { host: host.trim(), port: parseInt(port.trim(), 10) };
    });
  }

  return new RedisClient({
    host: config?.host || process.env.EKET_REDIS_HOST || 'localhost',
    port: config?.port || parseInt(process.env.EKET_REDIS_PORT || '6379', 10),
    password: config?.password || process.env.EKET_REDIS_PASSWORD,
    db: config?.db,
    keyPrefix: config?.keyPrefix,
    clusterMode: config?.clusterMode || clusterNodes !== undefined,
    clusterNodes: config?.clusterNodes || clusterNodes,
  });
}
