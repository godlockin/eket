/**
 * Instance Registry Module
 * 用于管理所有 Instance（人类/AI）的注册、心跳和状态
 *
 * Phase 4.1 - Core component for task assignment
 *
 * v2.0.0 扩展性增强:
 * - 批量心跳 API
 * - Pipeline 减少网络往返
 */

import { BATCH_HEARTBEAT_SIZE, BATCH_HEARTBEAT_FLUSH_INTERVAL } from '../constants.js';
import type {
  Instance,
  InstanceRegistryConfig,
  Result,
  BatchHeartbeatConfig,
} from '../types/index.js';
import { EketError } from '../types/index.js';

import { RedisClient, createRedisClient } from './redis-client.js';

/**
 * Instance Registry
 * 管理所有 Instance 的注册、心跳和状态查询
 */
export class InstanceRegistry {
  private redis: RedisClient;
  private config: InstanceRegistryConfig;
  private heartbeatInterval?: NodeJS.Timeout;
  private batchHeartbeatConfig: BatchHeartbeatConfig;
  private batchHeartbeatQueue: Array<{ instanceId: string; timestamp: number }> = [];
  private batchFlushTimer?: NodeJS.Timeout;

  constructor(config: InstanceRegistryConfig = {}) {
    // Defensive copy to prevent external mutation
    this.config = {
      redisPrefix: config.redisPrefix || 'eket:instance:',
      heartbeatTimeout: config.heartbeatTimeout || 30000,
    };
    this.redis = createRedisClient();

    // 批量心跳配置
    this.batchHeartbeatConfig = {
      enabled: true,
      batchSize: BATCH_HEARTBEAT_SIZE,
      flushInterval: BATCH_HEARTBEAT_FLUSH_INTERVAL,
    };
  }

  /**
   * 连接 Redis
   */
  async connect(): Promise<Result<void>> {
    return await this.redis.connect();
  }

  /**
   * 断开连接
   */
  async disconnect(): Promise<void> {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = undefined;
    }
    await this.redis.disconnect();
  }

  /**
   * 注册 Instance
   */
  async registerInstance(instance: Instance): Promise<Result<void>> {
    if (!this.redis.isReady()) {
      return {
        success: false,
        error: new EketError('REDIS_NOT_CONNECTED', 'Redis client not connected'),
      };
    }

    try {
      const client = this.redis.getClient();
      if (!client) {
        return {
          success: false,
          error: new EketError('REDIS_NOT_CONNECTED', 'Redis client not initialized'),
        };
      }

      const key = `${this.config.redisPrefix}${instance.id}`;
      const instanceData = {
        ...instance,
        registeredAt: Date.now(),
      };

      // 存储 Instance 信息
      await client.set(key, JSON.stringify(instanceData));

      // 添加到角色索引
      const roleKey = `${this.config.redisPrefix}by_role:${instance.agent_type}`;
      await client.sadd(roleKey, instance.id);

      // 添加到状态索引
      const statusKey = `${this.config.redisPrefix}by_status:${instance.status}`;
      await client.sadd(statusKey, instance.id);

      return { success: true, data: undefined };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      return {
        success: false,
        error: new EketError(
          'INSTANCE_REGISTRATION_FAILED',
          `Failed to register instance: ${errorMessage}`
        ),
      };
    }
  }

  /**
   * 更新 Instance 状态
   */
  async updateInstanceStatus(
    instanceId: string,
    status: Instance['status'],
    currentTaskId?: string
  ): Promise<Result<void>> {
    const client = this.redis.getClient();
    if (!client) {
      return {
        success: false,
        error: new EketError('REDIS_NOT_CONNECTED', 'Redis client not connected'),
      };
    }

    try {
      const key = `${this.config.redisPrefix}${instanceId}`;
      const existingData = await client.get(key);

      if (!existingData) {
        return {
          success: false,
          error: new EketError('INSTANCE_NOT_FOUND', `Instance ${instanceId} not found`),
        };
      }

      const instance = JSON.parse(existingData) as Instance;
      const oldStatus = instance.status;

      // 更新状态
      instance.status = status;
      instance.currentTaskId = currentTaskId;
      instance.updatedAt = Date.now();

      if (status === 'busy') {
        instance.currentLoad = (instance.currentLoad || 0) + 1;
      } else if (status === 'idle' && oldStatus === 'busy') {
        instance.currentLoad = Math.max(0, (instance.currentLoad || 0) - 1);
      }

      // 保存更新
      await client.set(key, JSON.stringify(instance));

      // 更新状态索引
      if (oldStatus !== status) {
        const oldStatusKey = `${this.config.redisPrefix}by_status:${oldStatus}`;
        const newStatusKey = `${this.config.redisPrefix}by_status:${status}`;
        await client.srem(oldStatusKey, instanceId);
        await client.sadd(newStatusKey, instanceId);
      }

      return { success: true, data: undefined };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      return {
        success: false,
        error: new EketError(
          'INSTANCE_UPDATE_FAILED',
          `Failed to update instance: ${errorMessage}`
        ),
      };
    }
  }

  /**
   * 获取 Instance 信息
   */
  async getInstance(instanceId: string): Promise<Result<Instance | null>> {
    const client = this.redis.getClient();
    if (!client) {
      return {
        success: false,
        error: new EketError('REDIS_NOT_CONNECTED', 'Redis client not connected'),
      };
    }

    try {
      const key = `${this.config.redisPrefix}${instanceId}`;
      const data = await client.get(key);

      if (!data) {
        return { success: true, data: null };
      }

      const instance = JSON.parse(data) as Instance;
      return { success: true, data: instance };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      return {
        success: false,
        error: new EketError('INSTANCE_FETCH_FAILED', `Failed to fetch instance: ${errorMessage}`),
      };
    }
  }

  /**
   * 根据角色获取 Instances
   */
  async getInstancesByRole(role: string): Promise<Result<Instance[]>> {
    const client = this.redis.getClient();
    if (!client) {
      return {
        success: false,
        error: new EketError('REDIS_NOT_CONNECTED', 'Redis client not connected'),
      };
    }

    try {
      const roleKey = `${this.config.redisPrefix}by_role:${role}`;
      const instanceIds = await client.smembers(roleKey);

      const instances: Instance[] = [];
      for (const id of instanceIds) {
        const result = await this.getInstance(id);
        if (result.success && result.data) {
          instances.push(result.data);
        }
      }

      return { success: true, data: instances };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      return {
        success: false,
        error: new EketError('INSTANCE_FETCH_FAILED', `Failed to fetch instances: ${errorMessage}`),
      };
    }
  }

  /**
   * 获取所有活跃 Instances
   */
  async getActiveInstances(): Promise<Result<Instance[]>> {
    const client = this.redis.getClient();
    if (!client) {
      return {
        success: false,
        error: new EketError('REDIS_NOT_CONNECTED', 'Redis client not connected'),
      };
    }

    try {
      const idleKey = `${this.config.redisPrefix}by_status:idle`;
      const busyKey = `${this.config.redisPrefix}by_status:busy`;

      const [idleIds, busyIds] = await Promise.all([
        client.smembers(idleKey),
        client.smembers(busyKey),
      ]);

      const allIds = [...idleIds, ...busyIds];
      const instances: Instance[] = [];

      for (const id of allIds) {
        const result = await this.getInstance(id);
        if (result.success && result.data) {
          instances.push(result.data);
        }
      }

      return { success: true, data: instances };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      return {
        success: false,
        error: new EketError(
          'INSTANCE_FETCH_FAILED',
          `Failed to fetch active instances: ${errorMessage}`
        ),
      };
    }
  }

  /**
   * 获取所有可用 Instances（状态为 idle）
   */
  async getAvailableInstances(): Promise<Result<Instance[]>> {
    const client = this.redis.getClient();
    if (!client) {
      return {
        success: false,
        error: new EketError('REDIS_NOT_CONNECTED', 'Redis client not connected'),
      };
    }

    try {
      const idleKey = `${this.config.redisPrefix}by_status:idle`;
      const idleIds = await client.smembers(idleKey);

      const instances: Instance[] = [];
      for (const id of idleIds) {
        const result = await this.getInstance(id);
        if (result.success && result.data) {
          // 检查心跳是否过期
          const now = Date.now();
          const lastHeartbeat = result.data.lastHeartbeat || result.data.updatedAt || 0;
          if (now - lastHeartbeat < (this.config.heartbeatTimeout || 30000)) {
            instances.push(result.data);
          } else {
            // 心跳过期，标记为 offline
            await this.updateInstanceStatus(id, 'offline');
          }
        }
      }

      return { success: true, data: instances };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      return {
        success: false,
        error: new EketError(
          'INSTANCE_FETCH_FAILED',
          `Failed to fetch available instances: ${errorMessage}`
        ),
      };
    }
  }

  /**
   * 注销 Instance
   */
  async unregisterInstance(instanceId: string): Promise<Result<void>> {
    const client = this.redis.getClient();
    if (!client) {
      return {
        success: false,
        error: new EketError('REDIS_NOT_CONNECTED', 'Redis client not connected'),
      };
    }

    try {
      const key = `${this.config.redisPrefix}${instanceId}`;
      const existingData = await client.get(key);

      if (!existingData) {
        return { success: true, data: undefined }; // 已不存在
      }

      const instance = JSON.parse(existingData) as Instance;

      // 删除 Instance 信息
      await client.del(key);

      // 从角色索引中移除
      const roleKey = `${this.config.redisPrefix}by_role:${instance.agent_type}`;
      await client.srem(roleKey, instanceId);

      // 从状态索引中移除
      const statusKey = `${this.config.redisPrefix}by_status:${instance.status}`;
      await client.srem(statusKey, instanceId);

      return { success: true, data: undefined };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      return {
        success: false,
        error: new EketError(
          'INSTANCE_UNREGISTER_FAILED',
          `Failed to unregister instance: ${errorMessage}`
        ),
      };
    }
  }

  /**
   * 更新心跳
   */
  async updateHeartbeat(instanceId: string): Promise<Result<void>> {
    const result = await this.getInstance(instanceId);
    if (!result.success) {
      return result;
    }

    if (!result.data) {
      return {
        success: false,
        error: new EketError('INSTANCE_NOT_FOUND', `Instance ${instanceId} not found`),
      };
    }

    const instance = result.data;
    instance.lastHeartbeat = Date.now();

    const key = `${this.config.redisPrefix}${instanceId}`;
    const client = this.redis.getClient();
    if (!client) {
      return {
        success: false,
        error: new EketError('REDIS_NOT_CONNECTED', 'Redis client not connected'),
      };
    }

    try {
      await client.set(key, JSON.stringify(instance));
      return { success: true, data: undefined };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      return {
        success: false,
        error: new EketError(
          'HEARTBEAT_UPDATE_FAILED',
          `Failed to update heartbeat: ${errorMessage}`
        ),
      };
    }
  }

  /**
   * 启动心跳循环
   */
  startHeartbeatLoop(instanceId: string, intervalMs = 10000): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    this.heartbeatInterval = setInterval(async () => {
      const result = await this.updateHeartbeat(instanceId);
      if (!result.success) {
        console.error('[InstanceRegistry] Heartbeat failed:', result.error);
      }
    }, intervalMs);
  }

  /**
   * 停止心跳循环
   */
  stopHeartbeatLoop(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = undefined;
    }
    if (this.batchFlushTimer) {
      clearTimeout(this.batchFlushTimer);
      this.batchFlushTimer = undefined;
    }
  }

  /**
   * 批量更新心跳（使用 Pipeline）
   */
  async updateHeartbeats(instanceIds: string[]): Promise<Result<void>> {
    if (instanceIds.length === 0) {
      return { success: true, data: undefined };
    }

    const client = this.redis.getClient();
    if (!client) {
      return {
        success: false,
        error: new EketError('REDIS_NOT_CONNECTED', 'Redis client not connected'),
      };
    }

    try {
      const now = Date.now();
      const pipeline = client.pipeline();

      // 批量获取和更新
      for (const instanceId of instanceIds) {
        const key = `${this.config.redisPrefix}${instanceId}`;

        // 获取现有数据
        const existingData = await client.get(key);
        if (!existingData) {
          continue; // Instance 不存在，跳过
        }

        const instance = JSON.parse(existingData) as Instance;
        instance.lastHeartbeat = now;
        instance.updatedAt = now;

        // 添加到 pipeline
        pipeline.set(key, JSON.stringify(instance));
      }

      // 执行 pipeline
      await pipeline.exec();

      return { success: true, data: undefined };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      return {
        success: false,
        error: new EketError(
          'BATCH_HEARTBEAT_FAILED',
          `Failed to update batch heartbeats: ${errorMessage}`
        ),
      };
    }
  }

  /**
   * 排队心跳（用于批量处理）
   */
  queueHeartbeat(instanceId: string): void {
    this.batchHeartbeatQueue.push({ instanceId, timestamp: Date.now() });

    // 如果队列达到批量大小，立即刷新
    if (this.batchHeartbeatQueue.length >= this.batchHeartbeatConfig.batchSize) {
      this.flushHeartbeats();
    } else if (!this.batchFlushTimer) {
      // 否则设置定时器
      this.batchFlushTimer = setTimeout(() => {
        this.flushHeartbeats();
      }, this.batchHeartbeatConfig.flushInterval);
    }
  }

  /**
   * 刷新心跳队列
   */
  private async flushHeartbeats(): Promise<void> {
    if (this.batchHeartbeatQueue.length === 0) {
      return;
    }

    // 清空队列
    const batch = [...this.batchHeartbeatQueue];
    this.batchHeartbeatQueue = [];
    this.batchFlushTimer = undefined;

    // 去重
    const uniqueInstanceIds = Array.from(new Set(batch.map((item) => item.instanceId)));

    // 批量更新
    const result = await this.updateHeartbeats(uniqueInstanceIds);
    if (!result.success) {
      console.error('[InstanceRegistry] Batch heartbeat flush failed:', result.error);
    }
  }

  /**
   * 列出所有 Instances
   */
  async listAllInstances(): Promise<Result<Instance[]>> {
    const client = this.redis.getClient();
    if (!client) {
      return {
        success: false,
        error: new EketError('REDIS_NOT_CONNECTED', 'Redis client not connected'),
      };
    }

    try {
      // 扫描所有 instance key
      const pattern = `${this.config.redisPrefix}*`;
      const keys: string[] = await this.scanKeys(pattern);

      const instances: Instance[] = [];
      for (const key of keys) {
        if (!key.includes(':by_')) {
          // 跳过索引 key
          const data = await client.get(key);
          if (data) {
            instances.push(JSON.parse(data) as Instance);
          }
        }
      }

      return { success: true, data: instances };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      return {
        success: false,
        error: new EketError('INSTANCE_LIST_FAILED', `Failed to list instances: ${errorMessage}`),
      };
    }
  }

  /**
   * 扫描 Redis keys（支持大量数据）
   */
  private async scanKeys(pattern: string, count = 100): Promise<string[]> {
    const client = this.redis.getClient();
    if (!client) {
      return [];
    }

    const keys: string[] = [];
    let cursor = 0;

    do {
      const [nextCursor, foundKeys] = await client.scan(cursor, 'MATCH', pattern, 'COUNT', count);
      keys.push(...foundKeys);
      cursor = parseInt(nextCursor, 10);
    } while (cursor !== 0);

    return keys;
  }
}

/**
 * 创建默认 Instance Registry
 */
export function createInstanceRegistry(config?: InstanceRegistryConfig): InstanceRegistry {
  return new InstanceRegistry(config);
}
