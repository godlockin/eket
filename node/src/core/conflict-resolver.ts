/**
 * EKET Framework - Conflict Resolver
 * Phase 6.1: Multi-Instance Collaboration
 *
 * 冲突解决机制，处理：
 * - 任务冲突：多个 Instance claim 同一任务
 * - 资源冲突：多个 Instance 访问同一资源
 * - 优先级冲突：任务优先级变化
 */

import type {
  Result,
  Instance,
  Ticket,
  ConflictResolutionConfig,
  ResourceLock,
} from '../types/index.js';
import { EketError } from '../types/index.js';

import { createRedisClient, type RedisClient } from './redis-client.js';

/**
 * 冲突类型
 */
export type ConflictType =
  | 'task_conflict' // 多个 Instance claim 同一任务
  | 'resource_conflict' // 多个 Instance 访问同一资源
  | 'priority_conflict'; // 任务优先级变化

/**
 * 冲突事件
 */
export interface ConflictEvent {
  id: string;
  type: ConflictType;
  description: string;
  participants: string[]; // Instance IDs
  resource?: string; // 资源 ID（资源冲突时）
  taskId?: string; // 任务 ID（任务冲突时）
  ticketId?: string; // 票务 ID
  detectedAt: number;
  resolvedAt?: number;
  resolution?: ConflictResolution;
  status: 'pending' | 'resolved' | 'escalated';
}

/**
 * 冲突解决结果
 */
export interface ConflictResolution {
  strategy: string;
  winner?: string; // 获胜的 Instance ID
  losers?: string[]; // 失败的 Instance IDs
  reason: string;
  metadata?: Record<string, unknown>;
}

/**
 * 资源锁请求
 */
export interface LockRequest {
  resourceId: string;
  instanceId: string;
  purpose: string;
  ttl_ms: number;
  exclusive: boolean; // 是否排他锁
}

/**
 * 锁管理器配置
 */
export interface LockManagerConfig {
  redisPrefix?: string;
  defaultTTL_ms?: number;
  maxWaitTime_ms?: number;
}

/**
 * 锁信息（扩展）
 */
export interface LockInfo extends ResourceLock {
  lockType: 'exclusive' | 'shared';
  sharedHolders?: string[]; // 共享锁持有者列表
}

/**
 * 冲突解决器类
 */
export class ConflictResolver {
  private config: ConflictResolutionConfig;
  private redis: RedisClient;
  private conflicts: Map<string, ConflictEvent> = new Map();
  private lockManager: LockManager;

  constructor(config: ConflictResolutionConfig, lockManagerConfig?: LockManagerConfig) {
    // Defensive copy
    this.config = { ...config };
    this.redis = createRedisClient();
    this.lockManager = new LockManager(lockManagerConfig);
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
    await this.lockManager.disconnect();
    await this.redis.disconnect();
    this.conflicts.clear();
  }

  /**
   * 检测并处理任务冲突
   *
   * 当多个 Instance 同时 claim 同一任务时调用
   */
  async handleTaskConflict(
    ticketId: string,
    claimants: Instance[]
  ): Promise<Result<ConflictResolution>> {
    if (claimants.length <= 1) {
      // 没有冲突
      return {
        success: true,
        data: {
          strategy: 'no_conflict',
          winner: claimants[0]?.id,
          reason: 'Single claimant',
        },
      };
    }

    console.log(
      `[ConflictResolver] Task conflict detected for ${ticketId}: ${claimants.length} claimants`
    );

    const strategy = this.config.taskConflict;
    let resolution: ConflictResolution;

    switch (strategy) {
      case 'first_claim_wins':
        resolution = await this.resolveFirstClaimWins(ticketId, claimants);
        break;
      case 'role_priority':
        resolution = await this.resolveRolePriority(ticketId, claimants);
        break;
      case 'manual':
        resolution = await this.resolveManual(ticketId, claimants);
        break;
      default:
        resolution = {
          strategy: 'first_claim_wins',
          reason: 'Unknown strategy, using default',
        };
    }

    // 记录冲突事件
    const conflict: ConflictEvent = {
      id: this.generateConflictId(),
      type: 'task_conflict',
      description: `Multiple instances claimed ticket ${ticketId}`,
      participants: claimants.map((c) => c.id),
      ticketId,
      detectedAt: Date.now(),
      resolvedAt: Date.now(),
      resolution,
      status: 'resolved',
    };
    this.conflicts.set(conflict.id, conflict);

    return { success: true, data: resolution };
  }

  /**
   * 策略 1: 先 claim 者优先
   */
  private async resolveFirstClaimWins(
    _ticketId: string,
    claimants: Instance[]
  ): Promise<ConflictResolution> {
    // 按当前负载排序，负载最低者获胜
    const sorted = [...claimants].sort((a, b) => {
      // 首先比较负载
      if (a.currentLoad !== b.currentLoad) {
        return a.currentLoad - b.currentLoad;
      }
      // 负载相同，比较最后更新时间
      return (a.updatedAt || 0) - (b.updatedAt || 0);
    });

    const winner = sorted[0];
    const losers = sorted.slice(1);

    return {
      strategy: 'first_claim_wins',
      winner: winner.id,
      losers: losers.map((l) => l.id),
      reason: `Lowest load (${winner.currentLoad}) and earliest update`,
      metadata: {
        claimants: claimants.map((c) => ({
          id: c.id,
          load: c.currentLoad,
          updatedAt: c.updatedAt,
        })),
      },
    };
  }

  /**
   * 策略 2: 角色优先级
   */
  private async resolveRolePriority(
    _ticketId: string,
    claimants: Instance[]
  ): Promise<ConflictResolution> {
    // TODO: 需要任务的角色要求信息
    // 这里简化处理：按 agent_type 字典序排序
    const sorted = [...claimants].sort((a, b) => {
      return a.agent_type.localeCompare(b.agent_type);
    });

    const winner = sorted[0];
    const losers = sorted.slice(1);

    return {
      strategy: 'role_priority',
      winner: winner.id,
      losers: losers.map((l) => l.id),
      reason: `Best role match: ${winner.agent_type}`,
      metadata: {
        claimants: claimants.map((c) => ({
          id: c.id,
          role: c.agent_type,
          skills: c.skills,
        })),
      },
    };
  }

  /**
   * 策略 3: 手动解决（上报给 Master）
   */
  private async resolveManual(
    _ticketId: string,
    claimants: Instance[]
  ): Promise<ConflictResolution> {
    // 记录冲突，等待 Master 决策
    return {
      strategy: 'manual',
      reason: 'Escalated to Master for manual resolution',
      metadata: {
        claimants: claimants.map((c) => ({
          id: c.id,
          role: c.agent_type,
          load: c.currentLoad,
        })),
      },
    };
  }

  /**
   * 处理资源冲突
   *
   * 当多个 Instance 同时访问同一资源时调用
   */
  async handleResourceConflict(
    resourceId: string,
    requestors: string[]
  ): Promise<Result<ConflictResolution>> {
    if (requestors.length <= 1) {
      return {
        success: true,
        data: {
          strategy: 'no_conflict',
          reason: 'Single requestor',
        },
      };
    }

    console.log(
      `[ConflictResolver] Resource conflict detected for ${resourceId}: ${requestors.length} requestors`
    );

    const strategy = this.config.resourceConflict;
    let resolution: ConflictResolution;

    switch (strategy) {
      case 'lock_queue':
        resolution = await this.resolveLockQueue(resourceId, requestors);
        break;
      case 'read_write_lock':
        resolution = await this.resolveReadWriteLock(resourceId, requestors);
        break;
      default:
        resolution = {
          strategy: 'lock_queue',
          reason: 'Unknown strategy, using default',
        };
    }

    // 记录冲突事件
    const conflict: ConflictEvent = {
      id: this.generateConflictId(),
      type: 'resource_conflict',
      description: `Multiple instances requested resource ${resourceId}`,
      participants: requestors,
      resource: resourceId,
      detectedAt: Date.now(),
      resolvedAt: Date.now(),
      resolution,
      status: 'resolved',
    };
    this.conflicts.set(conflict.id, conflict);

    return { success: true, data: resolution };
  }

  /**
   * 策略 1: 锁队列（FIFO）
   */
  private async resolveLockQueue(
    resourceId: string,
    requestors: string[]
  ): Promise<ConflictResolution> {
    // 第一个请求者获得锁，其他进入等待队列
    const winner = requestors[0];
    const losers = requestors.slice(1);

    // 获取锁
    const lockResult = await this.lockManager.acquireLock({
      resourceId,
      instanceId: winner,
      purpose: 'resource_access',
      ttl_ms: 30000, // 30 秒
      exclusive: true,
    });

    if (!lockResult.success) {
      return {
        strategy: 'lock_queue',
        reason: 'Failed to acquire lock',
        metadata: { error: lockResult.error.message },
      };
    }

    // 将其他请求者加入等待队列
    for (const requestor of losers) {
      await this.lockManager.addToWaitQueue(resourceId, requestor);
    }

    return {
      strategy: 'lock_queue',
      winner,
      losers,
      reason: 'FIFO: First requestor wins',
      metadata: {
        queueLength: losers.length,
        lockTTL: 30000,
      },
    };
  }

  /**
   * 策略 2: 读写锁
   */
  private async resolveReadWriteLock(
    resourceId: string,
    requestors: string[]
  ): Promise<ConflictResolution> {
    // 简化处理：所有请求者共享资源（读锁）
    // 实际实现需要区分读写请求
    void (await this.lockManager.acquireLock({
      resourceId,
      instanceId: requestors[0],
      purpose: 'shared_access',
      ttl_ms: 30000,
      exclusive: false,
    }));

    return {
      strategy: 'read_write_lock',
      winner: requestors[0],
      losers: requestors.slice(1),
      reason: 'Shared lock mode: all requestors can access',
      metadata: {
        lockType: 'shared',
        totalRequestors: requestors.length,
      },
    };
  }

  /**
   * 处理优先级冲突
   *
   * 当任务优先级发生变化时调用
   */
  async handlePriorityConflict(
    ticket: Ticket,
    oldPriority: string,
    newPriority: string
  ): Promise<Result<ConflictResolution>> {
    console.log(
      `[ConflictResolver] Priority conflict for ${ticket.id}: ${oldPriority} → ${newPriority}`
    );

    const strategy = this.config.priorityConflict;
    let resolution: ConflictResolution;

    switch (strategy) {
      case 'master_decision':
        resolution = {
          strategy: 'master_decision',
          reason: 'Escalated to Master for priority decision',
          metadata: {
            ticketId: ticket.id,
            oldPriority,
            newPriority,
            currentAssignee: ticket.assignee,
          },
        };
        break;
      case 'auto_reassign':
        resolution = await this.autoReassignByPriority(ticket, newPriority);
        break;
      default:
        resolution = {
          strategy: 'master_decision',
          reason: 'Unknown strategy, using default',
        };
    }

    // 记录冲突事件
    const conflict: ConflictEvent = {
      id: this.generateConflictId(),
      type: 'priority_conflict',
      description: `Priority changed for ticket ${ticket.id}`,
      participants: ticket.assignee ? [ticket.assignee] : [],
      ticketId: ticket.id,
      detectedAt: Date.now(),
      resolvedAt: Date.now(),
      resolution,
      status: 'resolved',
    };
    this.conflicts.set(conflict.id, conflict);

    return { success: true, data: resolution };
  }

  /**
   * 自动重新分配（根据优先级）
   */
  private async autoReassignByPriority(
    ticket: Ticket,
    newPriority: string
  ): Promise<ConflictResolution> {
    // 高优先级任务可能需要重新分配给更合适的 Instance
    // 这里简化处理，返回建议
    return {
      strategy: 'auto_reassign',
      reason: `Priority changed to ${newPriority}, reassignment may be needed`,
      metadata: {
        ticketId: ticket.id,
        newPriority,
        currentAssignee: ticket.assignee,
        suggestion:
          newPriority === 'urgent'
            ? 'Reassign to most available instance'
            : 'Keep current assignee',
      },
    };
  }

  /**
   * 获取所有冲突历史
   */
  getConflictHistory(): ConflictEvent[] {
    return Array.from(this.conflicts.values());
  }

  /**
   * 获取未解决的冲突
   */
  getPendingConflicts(): ConflictEvent[] {
    return Array.from(this.conflicts.values()).filter((c) => c.status === 'pending');
  }

  /**
   * 获取锁管理器
   */
  getLockManager(): LockManager {
    return this.lockManager;
  }

  /**
   * 生成冲突 ID
   */
  private generateConflictId(): string {
    return `conflict_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }
}

/**
 * 锁管理器
 * 处理资源锁的获取、释放和等待队列
 */
export class LockManager {
  private config: LockManagerConfig;
  private redis: RedisClient;
  private readonly redisPrefix: string;
  private readonly defaultTTL: number;
  private readonly maxWaitTime: number;
  private localLocks: Map<string, LockInfo> = new Map();

  constructor(config: LockManagerConfig = {}) {
    const defaultRedisPrefix = 'eket:lock:';
    const defaultTTL = 30000;
    const defaultMaxWaitTime = 60000;

    this.config = {
      redisPrefix: config.redisPrefix || defaultRedisPrefix,
      defaultTTL_ms: config.defaultTTL_ms || defaultTTL,
      maxWaitTime_ms: config.maxWaitTime_ms || defaultMaxWaitTime,
    };
    this.redisPrefix = this.config.redisPrefix!;
    this.defaultTTL = this.config.defaultTTL_ms!;
    this.maxWaitTime = this.config.maxWaitTime_ms!;
    this.redis = createRedisClient();
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
    // 释放所有本地锁
    for (const [resourceId, lock] of this.localLocks.entries()) {
      await this.releaseLock(resourceId, lock.lockedBy);
    }
    this.localLocks.clear();
    await this.redis.disconnect();
  }

  /**
   * 获取锁
   */
  async acquireLock(request: LockRequest): Promise<Result<LockInfo>> {
    if (!this.redis.isReady()) {
      return {
        success: false,
        error: new EketError('REDIS_NOT_CONNECTED', 'Redis not connected'),
      };
    }

    const client = this.redis.getClient();
    if (!client) {
      return {
        success: false,
        error: new EketError('REDIS_NOT_CONNECTED', 'Redis client not available'),
      };
    }

    const lockKey = `${this.redisPrefix}${request.resourceId}`;
    const now = Date.now();

    try {
      // 检查是否已有锁
      const existingLockData = await client.get(lockKey);

      if (existingLockData) {
        const existingLock = JSON.parse(existingLockData) as LockInfo;

        // 检查锁是否过期
        if (existingLock.expiresAt > now) {
          // 锁仍然有效
          if (existingLock.lockType === 'exclusive') {
            // 排他锁，加入等待队列
            return await this.enqueueLockRequest(request);
          } else {
            // 共享锁
            if (request.exclusive) {
              // 请求排他锁，需要等待
              return await this.enqueueLockRequest(request);
            } else {
              // 共享锁，可以加入
              existingLock.sharedHolders = existingLock.sharedHolders || [];
              if (!existingLock.sharedHolders.includes(request.instanceId)) {
                existingLock.sharedHolders.push(request.instanceId);
                await client.set(lockKey, JSON.stringify(existingLock));
              }
              return { success: true, data: existingLock };
            }
          }
        } else {
          // 锁已过期，获取新锁
          return await this.createLock(request);
        }
      } else {
        // 没有锁，直接获取
        return await this.createLock(request);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      return {
        success: false,
        error: new EketError('LOCK_ACQUISITION_FAILED', `Failed to acquire lock: ${errorMessage}`),
      };
    }
  }

  /**
   * 创建新锁
   */
  private async createLock(request: LockRequest): Promise<Result<LockInfo>> {
    const client = this.redis.getClient();
    if (!client) {
      return {
        success: false,
        error: new EketError('REDIS_NOT_CONNECTED', 'Redis client not available'),
      };
    }

    const ttl = request.ttl_ms || this.defaultTTL;
    const now = Date.now();

    const lockInfo: LockInfo = {
      resourceId: request.resourceId,
      lockedBy: request.instanceId,
      lockedAt: now,
      expiresAt: now + ttl,
      purpose: request.purpose,
      lockType: request.exclusive ? 'exclusive' : 'shared',
      sharedHolders: request.exclusive ? undefined : [request.instanceId],
    };

    const lockKey = `${this.redisPrefix}${request.resourceId}`;
    const ttlSeconds = Math.ceil(ttl / 1000);

    await client.setex(lockKey, ttlSeconds, JSON.stringify(lockInfo));
    this.localLocks.set(request.resourceId, lockInfo);

    return { success: true, data: lockInfo };
  }

  /**
   * 将锁请求加入等待队列
   */
  private async enqueueLockRequest(request: LockRequest): Promise<Result<LockInfo>> {
    const client = this.redis.getClient();
    if (!client) {
      return {
        success: false,
        error: new EketError('REDIS_NOT_CONNECTED', 'Redis client not available'),
      };
    }

    const queueKey = `${this.redisPrefix}${request.resourceId}:queue`;
    const now = Date.now();

    // 添加到等待队列（按时间戳排序）
    await client.zadd(
      queueKey,
      now,
      JSON.stringify({
        instanceId: request.instanceId,
        purpose: request.purpose,
        timestamp: now,
      })
    );

    // 设置队列过期时间
    await client.expire(queueKey, Math.ceil(this.maxWaitTime / 1000));

    return {
      success: false,
      error: new EketError(
        'LOCK_QUEUED',
        `Lock request queued for resource ${request.resourceId}`,
        { position: 'pending' }
      ),
    };
  }

  /**
   * 添加到等待队列（供 ConflictResolver 使用）
   */
  async addToWaitQueue(resourceId: string, instanceId: string): Promise<void> {
    const client = this.redis.getClient();
    if (!client) {
      return;
    }

    const queueKey = `${this.redisPrefix}${resourceId}:queue`;
    await client.zadd(
      queueKey,
      Date.now(),
      JSON.stringify({
        instanceId,
        timestamp: Date.now(),
      })
    );
  }

  /**
   * 释放锁
   */
  async releaseLock(resourceId: string, instanceId: string): Promise<Result<void>> {
    const client = this.redis.getClient();
    if (!client) {
      return {
        success: false,
        error: new EketError('REDIS_NOT_CONNECTED', 'Redis client not available'),
      };
    }

    const lockKey = `${this.redisPrefix}${resourceId}`;

    try {
      const lockData = await client.get(lockKey);
      if (!lockData) {
        return { success: true, data: undefined }; // 锁已不存在
      }

      const lock = JSON.parse(lockData) as LockInfo;

      if (lock.lockType === 'exclusive') {
        // 排他锁：只有锁持有者可以释放
        if (lock.lockedBy === instanceId) {
          await client.del(lockKey);
          this.localLocks.delete(resourceId);
          // 通知等待队列中的下一个请求者
          await this.notifyNextInQueue(resourceId);
        } else {
          return {
            success: false,
            error: new EketError('NOT_LOCK_HOLDER', 'Cannot release lock held by another instance'),
          };
        }
      } else {
        // 共享锁：从共享持有者列表中移除
        if (lock.sharedHolders) {
          lock.sharedHolders = lock.sharedHolders.filter((h) => h !== instanceId);
          if (lock.sharedHolders.length === 0) {
            // 没有共享持有者了，删除锁
            await client.del(lockKey);
            this.localLocks.delete(resourceId);
            await this.notifyNextInQueue(resourceId);
          } else {
            // 更新共享持有者列表
            await client.set(lockKey, JSON.stringify(lock));
          }
        }
      }

      return { success: true, data: undefined };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      return {
        success: false,
        error: new EketError('LOCK_RELEASE_FAILED', `Failed to release lock: ${errorMessage}`),
      };
    }
  }

  /**
   * 通知队列中的下一个请求者
   */
  private async notifyNextInQueue(resourceId: string): Promise<void> {
    const client = this.redis.getClient();
    if (!client) {
      return;
    }

    const queueKey = `${this.redisPrefix}${resourceId}:queue`;
    const nextRequest = await client.zpopmin(queueKey, 1);

    if (nextRequest && nextRequest.length > 0) {
      // 有下一个请求者，可以通过消息队列通知
      // 这里简化处理，实际应该发送消息
      console.log(`[LockManager] Notifying next in queue for ${resourceId}`);
    }
  }

  /**
   * 获取锁状态
   */
  async getLockStatus(resourceId: string): Promise<Result<LockInfo | null>> {
    const client = this.redis.getClient();
    if (!client) {
      return {
        success: false,
        error: new EketError('REDIS_NOT_CONNECTED', 'Redis client not available'),
      };
    }

    try {
      const lockKey = `${this.redisPrefix}${resourceId}`;
      const lockData = await client.get(lockKey);

      if (!lockData) {
        return { success: true, data: null };
      }

      const lock = JSON.parse(lockData) as LockInfo;
      return { success: true, data: lock };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      return {
        success: false,
        error: new EketError('LOCK_STATUS_FAILED', `Failed to get lock status: ${errorMessage}`),
      };
    }
  }

  /**
   * 获取等待队列长度
   */
  async getQueueLength(resourceId: string): Promise<Result<number>> {
    const client = this.redis.getClient();
    if (!client) {
      return {
        success: false,
        error: new EketError('REDIS_NOT_CONNECTED', 'Redis client not available'),
      };
    }

    try {
      const queueKey = `${this.redisPrefix}${resourceId}:queue`;
      const length = await client.zcard(queueKey);
      return { success: true, data: length };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      return {
        success: false,
        error: new EketError('QUEUE_LENGTH_FAILED', `Failed to get queue length: ${errorMessage}`),
      };
    }
  }
}

/**
 * 创建冲突解决器实例
 */
export function createConflictResolver(config: ConflictResolutionConfig): ConflictResolver {
  return new ConflictResolver(config);
}
