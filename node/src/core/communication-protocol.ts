/**
 * EKET Framework - Communication Protocol
 * Phase 6.1: Multi-Instance Collaboration
 *
 * v2.0.0 扩展性增强:
 * - 一致性哈希分片支持
 * - 基于 instanceId 的消息路由
 *
 * 标准化的 Instance 间通信协议，支持：
 * - 任务相关消息（分配、领取、进度、完成、阻塞）
 * - 协作相关消息（请求帮助、知识分享、依赖通知）
 * - 状态相关消息（状态变更、交接请求）
 */

import type {
  Message,
  MessageType,
  MessagePriority,
  Result,
  CollaborationPayload,
  CommunicationProtocolConfig,
  MessageQueueShardingConfig,
} from '../types/index.js';
import { EketError, EketErrorCode } from '../types/index.js';

import { createMessageQueue, type MessageQueue } from './message-queue.js';
import { createShardingManager, type ShardingManager } from './sharding.js';
import { genMessageId } from './state/writer.js';

/**
 * 消息回调类型
 */
export type MessageCallback<T extends MessageType> = (
  payload: TypedMessagePayload<T>,
  from: string
) => Promise<void>;

/**
 * 基于消息类型的负载类型映射
 */
export type TypedMessagePayload<T extends MessageType> = T extends 'task_assigned'
  ? TaskAssignedPayload
  : T extends 'task_claimed'
    ? TaskClaimedPayload
    : T extends 'task_progress'
      ? TaskProgressPayload
      : T extends 'task_complete'
        ? TaskCompletePayload
        : T extends 'task_blocked'
          ? TaskBlockedPayload
          : T extends 'help_request'
            ? HelpRequestPayload
            : T extends 'help_response'
              ? HelpResponsePayload
              : T extends 'knowledge_share'
                ? KnowledgeSharePayload
                : T extends 'dependency_notify'
                  ? DependencyNotifyPayload
                  : T extends 'status_change'
                    ? StatusChangePayload
                    : T extends 'handover_request'
                      ? HandoverRequestPayload
                      : T extends 'handover_complete'
                        ? HandoverCompletePayload
                        : CollaborationPayload;

// ============================================================================
// 消息负载类型定义
// ============================================================================

export interface TaskAssignedPayload {
  taskId: string;
  ticketId: string;
  assignedBy: string;
  priority: string;
  dueDate?: number;
}

export interface TaskClaimedPayload {
  taskId: string;
  ticketId: string;
  claimedAt: number;
  estimatedCompletionTime?: number;
}

export interface TaskProgressPayload {
  taskId: string;
  ticketId: string;
  progress: number; // 0-100
  statusMessage: string;
  blockers?: string[];
}

export interface TaskCompletePayload {
  taskId: string;
  ticketId: string;
  completedAt: number;
  artifacts?: string[]; // 产出物路径
  summary?: string;
}

export interface TaskBlockedPayload {
  taskId: string;
  ticketId: string;
  reason: string;
  blocker: string; // 阻塞原因或依赖
  needsHelpFrom?: string; // 需要谁帮助
}

export interface HelpRequestPayload {
  requestId: string;
  taskId?: string;
  description: string;
  neededExpertise?: string[]; // 需要的专业技能
  urgency: 'low' | 'normal' | 'high';
}

export interface HelpResponsePayload {
  requestId: string;
  canHelp: boolean;
  responderId: string;
  message?: string;
  availableAt?: number;
}

export interface KnowledgeSharePayload {
  shareId: string;
  taskId?: string;
  knowledgeType: 'artifact' | 'pattern' | 'decision' | 'lesson' | 'api' | 'config';
  title: string;
  description: string;
  content: string;
  tags: string[];
}

export interface DependencyNotifyPayload {
  dependencyId: string;
  taskId: string;
  dependencyType: 'output' | 'resource' | 'approval';
  expectedReadyAt?: number;
  isReady: boolean;
  artifactPath?: string;
}

export interface StatusChangePayload {
  instanceId: string;
  oldStatus: string;
  newStatus: string;
  reason?: string;
  currentTaskId?: string;
}

export interface HandoverRequestPayload {
  handoverId: string;
  taskId: string;
  fromInstance: string;
  toInstance: string;
  reason: string;
  context: Record<string, unknown>;
}

export interface HandoverCompletePayload {
  handoverId: string;
  taskId: string;
  fromInstance: string;
  toInstance: string;
  completedAt: number;
  artifacts?: string[];
  notes?: string;
}

// ============================================================================
// 通信协议类
// ============================================================================

/**
 * 通信协议管理器
 * 负责消息的发送、接收和路由
 */
export class CommunicationProtocol {
  private config: CommunicationProtocolConfig;
  private messageQueue: MessageQueue;
  private shardingManager: ShardingManager;
  private callbacks: Map<MessageType, Set<MessageCallback<MessageType>>> = new Map();
  private isConnected = false;
  private readonly maxRetries: number;

  constructor(config: CommunicationProtocolConfig, shardingConfig?: MessageQueueShardingConfig) {
    // Defensive copy
    this.config = { ...config };
    this.maxRetries = config.maxRetries || 3;
    this.messageQueue = createMessageQueue({ mode: 'auto' });
    this.shardingManager = createShardingManager(shardingConfig);
  }

  /**
   * 连接到消息队列
   */
  async connect(): Promise<Result<void>> {
    if (this.isConnected) {
      return { success: true, data: undefined };
    }

    const result = await this.messageQueue.connect();
    if (result.success) {
      this.isConnected = true;
      console.log(`[CommunicationProtocol] Connected as ${this.config.instanceId}`);
    }
    return result;
  }

  /**
   * 断开连接
   */
  async disconnect(): Promise<void> {
    if (!this.isConnected) {
      return;
    }

    await this.messageQueue.disconnect();
    this.callbacks.clear();
    this.isConnected = false;
    console.log('[CommunicationProtocol] Disconnected');
  }

  /**
   * 检查连接状态
   */
  isReady(): boolean {
    return this.isConnected;
  }

  /**
   * 注册消息处理器
   */
  on<T extends MessageType>(messageType: T, callback: MessageCallback<T>): void {
    if (!this.callbacks.has(messageType)) {
      this.callbacks.set(messageType, new Set());
    }
    this.callbacks.get(messageType)!.add(callback as MessageCallback<MessageType>);

    // 如果是第一次注册该类型，订阅对应的通道
    if (this.callbacks.get(messageType)?.size === 1 && this.isConnected) {
      this.subscribeToChannel(messageType);
    }
  }

  /**
   * 注销消息处理器
   */
  off<T extends MessageType>(messageType: T, callback: MessageCallback<T>): void {
    const handlers = this.callbacks.get(messageType);
    if (handlers) {
      handlers.delete(callback as MessageCallback<MessageType>);
      // 如果没有处理器了，取消订阅
      if (handlers.size === 0) {
        this.messageQueue.unsubscribe(this.getChannelName(messageType));
      }
    }
  }

  /**
   * 发送任务分配消息
   */
  async sendTaskAssigned(
    to: string,
    payload: TaskAssignedPayload,
    priority: MessagePriority = 'normal'
  ): Promise<Result<void>> {
    return this.sendMessage('task_assigned', to, payload, priority);
  }

  /**
   * 发送任务领取消息
   */
  async sendTaskClaimed(
    to: string,
    payload: TaskClaimedPayload,
    priority: MessagePriority = 'normal'
  ): Promise<Result<void>> {
    return this.sendMessage('task_claimed', to, payload, priority);
  }

  /**
   * 发送任务进度消息
   */
  async sendTaskProgress(
    to: string,
    payload: TaskProgressPayload,
    priority: MessagePriority = 'normal'
  ): Promise<Result<void>> {
    return this.sendMessage('task_progress', to, payload, priority);
  }

  /**
   * 发送任务完成消息
   */
  async sendTaskComplete(
    to: string,
    payload: TaskCompletePayload,
    priority: MessagePriority = 'normal'
  ): Promise<Result<void>> {
    return this.sendMessage('task_complete', to, payload, priority);
  }

  /**
   * 发送任务阻塞消息
   */
  async sendTaskBlocked(
    to: string,
    payload: TaskBlockedPayload,
    priority: MessagePriority = 'high'
  ): Promise<Result<void>> {
    return this.sendMessage('task_blocked', to, payload, priority);
  }

  /**
   * 发送帮助请求
   */
  async sendHelpRequest(
    to: string,
    payload: HelpRequestPayload,
    priority: MessagePriority = 'high'
  ): Promise<Result<void>> {
    return this.sendMessage('help_request', to, payload, priority);
  }

  /**
   * 发送帮助响应
   */
  async sendHelpResponse(
    to: string,
    payload: HelpResponsePayload,
    priority: MessagePriority = 'normal'
  ): Promise<Result<void>> {
    return this.sendMessage('help_response', to, payload, priority);
  }

  /**
   * 发送知识分享消息
   */
  async sendKnowledgeShare(
    to: string,
    payload: KnowledgeSharePayload,
    priority: MessagePriority = 'low'
  ): Promise<Result<void>> {
    return this.sendMessage('knowledge_share', to, payload, priority);
  }

  /**
   * 发送依赖通知
   */
  async sendDependencyNotify(
    to: string,
    payload: DependencyNotifyPayload,
    priority: MessagePriority = 'normal'
  ): Promise<Result<void>> {
    return this.sendMessage('dependency_notify', to, payload, priority);
  }

  /**
   * 发送状态变更通知
   */
  async sendStatusChange(
    to: string,
    payload: StatusChangePayload,
    priority: MessagePriority = 'normal'
  ): Promise<Result<void>> {
    return this.sendMessage('status_change', to, payload, priority);
  }

  /**
   * 发送交接请求
   */
  async sendHandoverRequest(
    to: string,
    payload: HandoverRequestPayload,
    priority: MessagePriority = 'high'
  ): Promise<Result<void>> {
    return this.sendMessage('handover_request', to, payload, priority);
  }

  /**
   * 发送交接完成消息
   */
  async sendHandoverComplete(
    to: string,
    payload: HandoverCompletePayload,
    priority: MessagePriority = 'normal'
  ): Promise<Result<void>> {
    return this.sendMessage('handover_complete', to, payload, priority);
  }

  /**
   * 广播消息给所有 Instance
   */
  async broadcast<T extends MessageType>(
    messageType: T,
    payload: TypedMessagePayload<T>,
    priority: MessagePriority = 'normal'
  ): Promise<Result<void>> {
    return this.sendMessage(messageType, 'all', payload, priority);
  }

  /**
   * 发送通用消息
   */
  async sendMessage<T extends MessageType>(
    messageType: T,
    to: string,
    payload: TypedMessagePayload<T>,
    priority: MessagePriority = 'normal'
  ): Promise<Result<void>> {
    if (!this.isConnected) {
      return {
        success: false,
        error: new EketError(EketErrorCode.PROTOCOL_NOT_CONNECTED, 'Communication protocol not connected'),
      };
    }

    const message: Message = {
      id: this.generateMessageId(),
      timestamp: new Date().toISOString(),
      type: messageType,
      from: this.config.instanceId,
      to,
      priority: priority || this.config.defaultPriority || 'normal',
      payload: payload as Record<string, unknown>,
    };

    // 添加到待发送队列（支持重试）
    return this.sendWithRetry(message);
  }

  /**
   * 带重试的发送
   */
  private async sendWithRetry(message: Message, retryCount = 0): Promise<Result<void>> {
    try {
      // 使用一致性哈希获取分片通道（如果启用分片）
      const channel = this.getShardedChannel(message.type, message.to);

      const result = await this.messageQueue.publish(channel, message);

      if (result.success) {
        return { success: true, data: undefined };
      }

      // 发送失败，尝试重试
      if (retryCount < this.maxRetries) {
        console.warn(
          `[CommunicationProtocol] Send failed, retrying (${retryCount + 1}/${this.maxRetries})`
        );
        await this.sleep(100 * Math.pow(2, retryCount)); // 指数退避
        return this.sendWithRetry(message, retryCount + 1);
      }

      return {
        success: false,
        error: new EketError(
          'MESSAGE_SEND_FAILED',
          `Failed to send message after ${this.maxRetries} retries`,
          { messageType: message.type, to: message.to }
        ),
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      return {
        success: false,
        error: new EketError(EketErrorCode.MESSAGE_SEND_ERROR, `Error sending message: ${errorMessage}`),
      };
    }
  }

  /**
   * 订阅消息通道
   */
  private subscribeToChannel(messageType: MessageType): void {
    const channel = this.getChannelName(messageType);

    this.messageQueue
      .subscribe(channel, async (message: Message) => {
        // 跳过自己发送的消息
        if (message.from === this.config.instanceId) {
          return;
        }

        // 调用所有注册的回调
        const handlers = this.callbacks.get(messageType);
        if (handlers) {
          for (const handler of handlers) {
            try {
              await handler(message.payload as TypedMessagePayload<MessageType>, message.from);
            } catch (err) {
              console.error(
                `[CommunicationProtocol] Handler error for ${messageType}:`,
                err instanceof Error ? err.message : err
              );
            }
          }
        }
      })
      .catch((err) => {
        console.error(`[CommunicationProtocol] Subscribe to ${channel} failed:`, err);
      });
  }

  /**
   * 获取通道名称
   */
  private getChannelName(messageType: MessageType): string {
    return `eket:msg:${messageType}`;
  }

  /**
   * 获取分片通道名称（基于一致性哈希）
   */
  private getShardedChannel(messageType: MessageType, targetInstance: string): string {
    const baseChannel = this.getChannelName(messageType);

    // 广播消息不使用分片
    if (targetInstance === 'all') {
      return baseChannel;
    }

    // 使用一致性哈希获取分片
    return this.shardingManager.getShardedKey(baseChannel, targetInstance);
  }

  /**
   * 生成消息 ID（统一格式 msg_YYYYMMDD_HHMMSS_NNN）
   * P0-1/2: 与 writer.genMessageId 共用 ID 空间
   */
  private generateMessageId(): string {
    return genMessageId();
  }

  /**
   * 延迟函数
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * 获取队列模式（用于调试）
   */
  getQueueMode(): 'redis' | 'file' {
    return this.messageQueue.getMode();
  }

  /**
   * 获取分片管理器（用于测试和监控）
   */
  getShardingManager(): ShardingManager {
    return this.shardingManager;
  }
}

/**
 * 创建通信协议实例
 */
export function createCommunicationProtocol(
  config: CommunicationProtocolConfig
): CommunicationProtocol {
  return new CommunicationProtocol(config);
}
