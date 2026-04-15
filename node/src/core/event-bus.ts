/**
 * EKET Framework - Event Bus
 * Version: 2.0.0
 *
 * 事件总线，支持：
 * - 发布/订阅模式
 * - 事件类型安全
 * - 同步/异步事件处理
 * - 事件拦截器
 * - 死信队列（失败事件）
 */

import { EketError, EketErrorCode } from '../types/index.js';

// ============================================================================
// Types
// ============================================================================

/**
 * 事件处理器
 */
export type EventHandler<T = unknown> = (event: T) => void | Promise<void>;

/**
 * 事件拦截器
 */
export type EventInterceptor<T = unknown> = (
  event: T,
  next: () => void | Promise<void>
) => void | Promise<void>;

/**
 * 事件元数据
 */
export interface EventMetadata {
  id: string;
  type: string;
  timestamp: number;
  source?: string;
}

/**
 * 事件封装
 */
export interface DomainEvent<T = unknown> extends EventMetadata {
  payload: T;
}

/**
 * 事件订阅选项
 */
export interface SubscriptionOptions {
  priority?: number; // 优先级（高的先执行）
  once?: boolean; // 只执行一次
  async?: boolean; // 异步执行
}

/**
 * 事件总线配置
 */
export interface EventBusConfig {
  strict?: boolean; // 严格模式：未监听的事件抛出警告
  maxListeners?: number; // 单个事件最大监听器数量
  deadLetterQueue?: boolean; // 启用死信队列
  maxDeadLetterSize?: number; // 死信队列最大长度
}

/**
 * 死信事件
 */
export interface DeadLetterEvent<T = unknown> {
  event: DomainEvent<T>;
  error: Error;
  handlerName: string;
  timestamp: number;
  retryCount: number;
}

/**
 * 事件统计信息
 */
export interface EventBusStats {
  totalEvents: number;
  eventsByType: Record<string, number>;
  totalListeners: number;
  deadLetterCount: number;
  errorCount: number;
}

// ============================================================================
// Constants
// ============================================================================

// ============================================================================
// Predefined Event Types
// ============================================================================

/** Ticket 完成事件类型常量 */
export const TICKET_COMPLETED_EVENT = 'ticket.completed';

/** Ticket 完成事件 payload */
export interface TicketCompletedPayload {
  ticketId: string;
  assignedTo: string;  // Slaver ID
  completedAt: string; // ISO8601
  suggestedNextTicket?: string; // 建议的下一个 ticket ID（可选）
}

// ============================================================================
// Event Bus Class
// ============================================================================

export class EventBus {
  private listeners: Map<string, Array<{ handler: EventHandler; options: SubscriptionOptions }>> =
    new Map();
  private interceptors: EventInterceptor[] = [];
  private deadLetterQueue: DeadLetterEvent[] = [];
  private config: Required<EventBusConfig>;
  private isConnected = false;

  // 统计信息
  private stats = {
    totalEvents: 0,
    eventsByType: {} as Record<string, number>,
    deadLetterCount: 0,
    errorCount: 0,
  };

  constructor(config?: EventBusConfig) {
    this.config = {
      strict: config?.strict ?? false,
      maxListeners: config?.maxListeners ?? 100,
      deadLetterQueue: config?.deadLetterQueue ?? true,
      maxDeadLetterSize: config?.maxDeadLetterSize ?? 100,
    };
  }

  /**
   * 连接事件总线（初始化）
   */
  connect(): void {
    this.isConnected = true;
  }

  /**
   * 断开连接
   */
  disconnect(): void {
    this.isConnected = false;
    this.listeners.clear();
    this.interceptors = [];
  }

  /**
   * 检查连接状态
   */
  isReady(): boolean {
    return this.isConnected;
  }

  /**
   * 订阅事件
   * @param eventType - 事件类型
   * @param handler - 事件处理器
   * @param options - 订阅选项
   */
  on<T>(eventType: string, handler: EventHandler<T>, options: SubscriptionOptions = {}): void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, []);
    }

    const handlers = this.listeners.get(eventType) as Array<{
      handler: EventHandler<T>;
      options: SubscriptionOptions;
    }>;

    // 检查最大监听器数量
    if (handlers.length >= this.config.maxListeners) {
      throw new EketError(
        EketErrorCode.EVENT_BUS_MAX_LISTENERS_EXCEEDED,
        `Maximum listeners (${this.config.maxListeners}) exceeded for event "${eventType}"`
      );
    }

    // 按优先级插入
    const entry = { handler, options };
    const insertIndex = handlers.findIndex(
      (h) => (h.options.priority || 0) < (options.priority || 0)
    );
    if (insertIndex === -1) {
      handlers.push(entry);
    } else {
      handlers.splice(insertIndex, 0, entry);
    }
  }

  /**
   * 订阅事件（只执行一次）
   */
  once<T>(
    eventType: string,
    handler: EventHandler<T>,
    options: Omit<SubscriptionOptions, 'once'> = {}
  ): void {
    this.on(eventType, handler, { ...options, once: true });
  }

  /**
   * 取消订阅
   */
  off<T>(eventType: string, handler: EventHandler<T>): void {
    const handlers = this.listeners.get(eventType);
    if (handlers) {
      const index = handlers.findIndex((h) => h.handler === handler);
      if (index !== -1) {
        handlers.splice(index, 1);
      }
    }
  }

  /**
   * 取消所有订阅
   */
  offAll(eventType?: string): void {
    if (eventType) {
      this.listeners.delete(eventType);
    } else {
      this.listeners.clear();
    }
  }

  /**
   * 添加事件拦截器
   */
  use(interceptor: EventInterceptor): void {
    this.interceptors.push(interceptor);
  }

  /**
   * 发布事件（同步）
   */
  emit<T>(eventType: string, payload: T, source?: string): void {
    const event = this.createEvent(eventType, payload, source);
    this.dispatchEvent(event);
  }

  /**
   * 发布事件（异步）
   */
  async emitAsync<T>(eventType: string, payload: T, source?: string): Promise<void> {
    const event = this.createEvent(eventType, payload, source);
    await this.dispatchEventAsync(event);
  }

  /**
   * 发布事件并等待所有处理器完成
   */
  async publish<T>(eventType: string, payload: T, source?: string): Promise<void> {
    const event = this.createEvent(eventType, payload, source);
    await this.dispatchEventAsync(event, true);
  }

  /**
   * 创建事件对象
   */
  private createEvent<T>(eventType: string, payload: T, source?: string): DomainEvent<T> {
    return {
      id: this.generateEventId(),
      type: eventType,
      timestamp: Date.now(),
      source: source || 'unknown',
      payload,
    };
  }

  /**
   * 分发事件（同步）
   */
  private dispatchEvent<T>(event: DomainEvent<T>): void {
    this.stats.totalEvents++;
    this.stats.eventsByType[event.type] = (this.stats.eventsByType[event.type] || 0) + 1;

    const handlers = this.listeners.get(event.type);
    if (!handlers || handlers.length === 0) {
      if (this.config.strict) {
        console.warn(`[EventBus] No listeners for event: ${event.type}`);
      }
      return;
    }

    // 执行拦截器
    let handlerIndex = 0;
    const executeHandlers = () => {
      if (handlerIndex >= handlers.length) {
        return;
      }

      const { handler, options } = handlers[handlerIndex];

      try {
        const result = handler(event.payload);

        // 处理 once 选项
        if (options.once) {
          handlers.splice(handlerIndex, 1);
        } else {
          handlerIndex++;
        }

        // 如果是 Promise，异步处理
        if (result instanceof Promise) {
          result.catch((error) => {
            this.handleHandlerError(error, event, handler.name || 'anonymous');
          });
        }
      } catch (error) {
        this.handleHandlerError(error as Error, event, handler.name || 'anonymous');
        handlerIndex++;
      }

      // 继续执行下一个处理器
      if (handlerIndex < handlers.length) {
        setTimeout(executeHandlers, 0);
      }
    };

    executeHandlers();
  }

  /**
   * 分发事件（异步，等待所有处理器完成）
   */
  private async dispatchEventAsync<T>(event: DomainEvent<T>, waitForAll = false): Promise<void> {
    this.stats.totalEvents++;
    this.stats.eventsByType[event.type] = (this.stats.eventsByType[event.type] || 0) + 1;

    const handlers = this.listeners.get(event.type);
    if (!handlers || handlers.length === 0) {
      if (this.config.strict) {
        console.warn(`[EventBus] No listeners for event: ${event.type}`);
      }
      return;
    }

    // 执行拦截器链
    let index = 0;
    const executeInterceptors = (): Promise<void> => {
      if (index >= this.interceptors.length) {
        return Promise.resolve();
      }

      const interceptor = this.interceptors[index++];
      return new Promise((resolve) => {
        Promise.resolve(interceptor(event.payload, resolve)).catch(resolve);
      });
    };

    // 执行所有处理器
    const executeHandlers = async (): Promise<void> => {
      const promises: Array<Promise<void>> = [];

      for (const { handler, options } of handlers) {
        try {
          const result = handler(event.payload);

          if (options.once) {
            const idx = handlers.indexOf({ handler, options });
            if (idx !== -1) {
              handlers.splice(idx, 1);
            }
          }

          if (result instanceof Promise) {
            if (waitForAll || options.async) {
              promises.push(
                result.catch((error) => {
                  this.handleHandlerError(error, event, handler.name || 'anonymous');
                })
              );
            }
          }
        } catch (error) {
          this.handleHandlerError(error as Error, event, handler.name || 'anonymous');
        }
      }

      await Promise.all(promises);
    };

    await executeInterceptors();
    await executeHandlers();
  }

  /**
   * 处理处理器错误
   */
  private handleHandlerError<T>(error: Error, event: DomainEvent<T>, handlerName: string): void {
    this.stats.errorCount++;

    console.error(`[EventBus] Handler error for event "${event.type}":`, error);

    // 添加到死信队列
    if (this.config.deadLetterQueue) {
      const deadLetter: DeadLetterEvent<T> = {
        event,
        error,
        handlerName,
        timestamp: Date.now(),
        retryCount: 0,
      };

      this.deadLetterQueue.push(deadLetter);
      this.stats.deadLetterCount++;

      // 限制队列大小
      if (this.deadLetterQueue.length > this.config.maxDeadLetterSize) {
        this.deadLetterQueue.shift();
      }
    }
  }

  /**
   * 获取死信队列
   */
  getDeadLetterQueue(): DeadLetterEvent[] {
    return [...this.deadLetterQueue];
  }

  /**
   * 清空死信队列
   */
  clearDeadLetterQueue(): void {
    this.deadLetterQueue = [];
    this.stats.deadLetterCount = 0;
  }

  /**
   * 重试死信事件
   */
  async retryDeadLetter(index: number): Promise<boolean> {
    if (index < 0 || index >= this.deadLetterQueue.length) {
      return false;
    }

    const deadLetter = this.deadLetterQueue[index];
    deadLetter.retryCount++;

    try {
      await this.publish(deadLetter.event.type, deadLetter.event.payload, deadLetter.event.source);
      this.deadLetterQueue.splice(index, 1);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 获取统计信息
   */
  getStats(): EventBusStats {
    return {
      totalEvents: this.stats.totalEvents,
      eventsByType: { ...this.stats.eventsByType },
      totalListeners: Array.from(this.listeners.values()).reduce(
        (sum, handlers) => sum + handlers.length,
        0
      ),
      deadLetterCount: this.stats.deadLetterCount,
      errorCount: this.stats.errorCount,
    };
  }

  /**
   * 生成事件 ID
   */
  private generateEventId(): string {
    return `evt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * 创建事件总线实例
 */
export function createEventBus(config?: EventBusConfig): EventBus {
  return new EventBus(config);
}

// ============================================================================
// Global Event Bus
// ============================================================================

let globalEventBus: EventBus | null = null;

/**
 * 获取全局事件总线
 */
export function getGlobalEventBus(): EventBus {
  if (!globalEventBus) {
    globalEventBus = createEventBus();
  }
  return globalEventBus;
}

/**
 * 重置全局事件总线（用于测试）
 */
export function resetGlobalEventBus(): void {
  if (globalEventBus) {
    globalEventBus.disconnect();
    globalEventBus = null;
  }
}

// ============================================================================
// Predefined Event Types (for common EKET events)
// ============================================================================

/**
 * 系统事件类型
 */
export const SystemEvents = {
  // 实例生命周期
  INSTANCE_STARTED: 'system:instance:started',
  INSTANCE_STOPPED: 'system:instance:stopped',
  INSTANCE_ERROR: 'system:instance:error',

  // Master 选举
  MASTER_ELECTED: 'system:master:elected',
  MASTER_RELINQUISHED: 'system:master:relinquished',
  MASTER_DETECTED_CONFLICT: 'system:master:conflict',

  // 连接管理
  CONNECTION_UPGRADED: 'system:connection:upgraded',
  CONNECTION_DOWNGRADED: 'system:connection:downgraded',
  CONNECTION_ERROR: 'system:connection:error',
} as const;

/**
 * 任务事件类型
 */
export const TaskEvents = {
  TASK_CREATED: 'task:created',
  TASK_ASSIGNED: 'task:assigned',
  TASK_CLAIMED: 'task:claimed',
  TASK_STARTED: 'task:started',
  TASK_PROGRESS: 'task:progress',
  TASK_COMPLETED: 'task:completed',
  TASK_BLOCKED: 'task:blocked',
  TASK_FAILED: 'task:failed',
} as const;

/**
 * 消息队列事件类型
 */
export const MessageEvents = {
  MESSAGE_PUBLISHED: 'mq:message:published',
  MESSAGE_CONSUMED: 'mq:message:consumed',
  MESSAGE_FAILED: 'mq:message:failed',
  QUEUE_FULL: 'mq:queue:full',
  QUEUE_DRAINED: 'mq:queue:drained',
} as const;

/**
 * 配置事件类型
 */
export const ConfigEvents = {
  CONFIG_CHANGED: 'config:changed',
  CONFIG_VALIDATED: 'config:validated',
  CONFIG_ERROR: 'config:error',
} as const;
