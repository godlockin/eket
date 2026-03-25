/**
 * Slaver Heartbeat Monitor
 * 用于监控 Slaver 实例的活跃状态
 */

import { RedisClient } from './redis-client.js';
import type { SlaverHeartbeat, Result } from '../types/index.js';

export interface HeartbeatConfig {
  redisHost?: string;
  redisPort?: number;
  redisPassword?: string;
  heartbeatInterval?: number; // 心跳间隔（毫秒）
  heartbeatTimeout?: number; // 超时时间（毫秒），仅 ActiveSlaverMonitor 使用
}

export type HeartbeatStatus = 'active' | 'busy' | 'offline';

/**
 * Slaver 心跳管理器
 */
export class SlaverHeartbeatManager {
  private client: RedisClient;
  private slaverId: string;
  private heartbeatInterval: number;
  private intervalId: NodeJS.Timeout | null = null;
  private currentStatus: HeartbeatStatus = 'offline';
  private currentTaskId?: string;

  constructor(slaverId: string, config: HeartbeatConfig = {}) {
    this.slaverId = slaverId;
    this.heartbeatInterval = config.heartbeatInterval || 10000; // 默认 10 秒

    this.client = new RedisClient({
      host: config.redisHost || process.env.EKET_REDIS_HOST || 'localhost',
      port: config.redisPort || parseInt(process.env.EKET_REDIS_PORT || '6379', 10),
      password: config.redisPassword,
    });
  }

  /**
   * 启动心跳
   */
  async start(): Promise<Result<void>> {
    // 连接 Redis
    const connectResult = await this.client.connect();
    if (!connectResult.success) {
      return connectResult;
    }

    // 发送初始心跳
    await this.sendHeartbeat();

    // 启动定时心跳
    this.intervalId = setInterval(() => {
      this.sendHeartbeat().catch(() => {
        console.error('[Heartbeat] Send error');
      });
    }, this.heartbeatInterval);

    this.currentStatus = 'active';
    console.log(`[Heartbeat] Started for slaver: ${this.slaverId}`);

    return { success: true, data: undefined };
  }

  /**
   * 停止心跳
   */
  async stop(): Promise<void> {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    // 发送离线通知
    await this.sendHeartbeat('offline');

    await this.client.disconnect();
    this.currentStatus = 'offline';
    console.log(`[Heartbeat] Stopped for slaver: ${this.slaverId}`);
  }

  /**
   * 发送心跳
   */
  private async sendHeartbeat(status: HeartbeatStatus = 'active'): Promise<void> {
    const heartbeat: SlaverHeartbeat = {
      slaverId: this.slaverId,
      timestamp: Date.now(),
      status,
      currentTaskId: this.currentTaskId,
    };

    const result = await this.client.registerSlaver(heartbeat);
    if (!result.success) {
      console.error('[Heartbeat] Register failed');
    }
  }

  /**
   * 设置状态
   */
  setStatus(status: HeartbeatStatus, taskId?: string): void {
    this.currentStatus = status;
    if (taskId) {
      this.currentTaskId = taskId;
    }
  }

  /**
   * 获取当前状态
   */
  getStatus(): HeartbeatStatus {
    return this.currentStatus;
  }

  /**
   * 设置当前任务
   */
  setCurrentTask(taskId: string | undefined): void {
    this.currentTaskId = taskId;
  }

  /**
   * 获取当前任务
   */
  getCurrentTask(): string | undefined {
    return this.currentTaskId;
  }
}

/**
 * 活跃 Slaver 监控器
 */
export class ActiveSlaverMonitor {
  private client: RedisClient;
  private checkInterval: number;

  constructor(config: HeartbeatConfig = {}) {
    this.checkInterval = config.heartbeatTimeout || 30000;

    this.client = new RedisClient({
      host: config.redisHost || process.env.EKET_REDIS_HOST || 'localhost',
      port: config.redisPort || parseInt(process.env.EKET_REDIS_PORT || '6379', 10),
      password: config.redisPassword,
    });
  }

  /**
   * 启动监控
   */
  async start(): Promise<Result<void>> {
    const connectResult = await this.client.connect();
    if (!connectResult.success) {
      return connectResult;
    }

    console.log('[SlaverMonitor] Started');
    return { success: true, data: undefined };
  }

  /**
   * 停止监控
   */
  async stop(): Promise<void> {
    await this.client.disconnect();
    console.log('[SlaverMonitor] Stopped');
  }

  /**
   * 获取所有活跃 Slaver
   */
  async getActiveSlavers(): Promise<Result<SlaverHeartbeat[]>> {
    return await this.client.getActiveSlavers();
  }

  /**
   * 获取指定 Slaver 状态
   */
  async getSlaverStatus(slaverId: string): Promise<Result<SlaverHeartbeat | null>> {
    const result = await this.getActiveSlavers();
    if (!result.success) {
      return result;
    }

    const slaver = result.data.find((s: SlaverHeartbeat) => s.slaverId === slaverId) || null;
    return { success: true, data: slaver };
  }

  /**
   * 检查 Slaver 是否离线
   */
  async isOffline(slaverId: string): Promise<boolean> {
    const result = await this.getSlaverStatus(slaverId);
    if (!result.success || !result.data) {
      return true;
    }

    const now = Date.now();
    return now - result.data.timestamp > this.checkInterval;
  }

  /**
   * 列出所有 Slaver（包括离线）
   */
  async listAllSlavers(): Promise<SlaverHeartbeat[]> {
    const result = await this.getActiveSlavers();
    if (result.success) {
      return result.data;
    }
    return [];
  }
}

/**
 * 创建心跳管理器
 */
export function createHeartbeatManager(
  slaverId: string,
  config?: Partial<HeartbeatConfig>
): SlaverHeartbeatManager {
  return new SlaverHeartbeatManager(slaverId, config);
}

/**
 * 创建活跃 Slaver 监控器
 */
export function createSlaverMonitor(config?: Partial<HeartbeatConfig>): ActiveSlaverMonitor {
  return new ActiveSlaverMonitor(config);
}
