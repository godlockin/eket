/**
 * WebSocket Message Queue Module
 * Version: 2.0.0
 *
 * 基于 WebSocket 的实时消息队列，支持降级到文件轮询
 *
 * 设计借鉴：
 * - Claude Code `remote-session-manager.ts` (Agent Pool 管理)
 * - Claude Code `sessions-websocket.ts` (WebSocket 通信层)
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

import type { Result } from '../types/index.js';
import { EketError, EketErrorCode } from '../types/index.js';

import {
  SessionsWebSocket,
  createSessionsWebSocket,
  type SessionsWebSocketConfig,
  type SessionsWebSocketCallbacks,
  type RawData,
  type WebSocketMessage,
} from './sessions-websocket.js';

// ============================================================================
// Types
// ============================================================================

/**
 * 消息队列配置
 */
export interface WebSocketMessageQueueConfig {
  webSocket?: SessionsWebSocketConfig; // WebSocket 配置（可选）
  fallbackToFile?: boolean; // 是否启用文件降级（默认 true）
  fileQueueDir?: string; // 文件队列目录（fallback 使用）
  pingIntervalMs?: number; // Ping 间隔（默认 30000）
  maxRetries?: number; // 最大重试次数（默认 3）
}

/**
 * 消息队列条目
 */
export interface QueuedMessage {
  id: string;
  type: string;
  from?: string;
  to?: string;
  payload: Record<string, unknown>;
  timestamp: number;
  priority?: 'low' | 'normal' | 'high' | 'critical';
  retryCount?: number;
}

/**
 * 消息处理器
 */
export type MessageHandler = (message: QueuedMessage) => Promise<void>;

/**
 * WebSocket 连接级别（用于降级策略）
 * 注意：与 types/index.ts 中的 ConnectionLevel（四级降级）语义不同，
 * 此处仅适用于 WebSocket 消息队列自身的连接状态。
 */
export type WebSocketConnectionLevel = 'websocket' | 'file_fallback' | 'offline';

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_CONFIG: Partial<WebSocketMessageQueueConfig> = {
  fallbackToFile: true,
  maxRetries: 3,
  pingIntervalMs: 30000,
};

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Type guard to validate QueuedMessage structure
 */
function isQueuedMessage(data: unknown): data is QueuedMessage {
  if (typeof data !== 'object' || data === null) {
    return false;
  }

  const msg = data as Record<string, unknown>;

  // Required fields validation
  if (typeof msg['id'] !== 'string') {
    return false;
  }
  if (typeof msg['type'] !== 'string') {
    return false;
  }
  if (typeof msg['payload'] !== 'object' || msg['payload'] === null) {
    return false;
  }
  if (typeof msg['timestamp'] !== 'number') {
    return false;
  }

  // Optional fields validation
  if (msg['from'] !== undefined && typeof msg['from'] !== 'string') {
    return false;
  }
  if (msg['to'] !== undefined && typeof msg['to'] !== 'string') {
    return false;
  }

  // Priority validation
  const priority = msg['priority'];
  if (
    priority !== undefined &&
    !['low', 'normal', 'high', 'critical'].includes(priority as string)
  ) {
    return false;
  }

  return true;
}

// ============================================================================
// WebSocket Message Queue Class
// ============================================================================

export class WebSocketMessageQueue {
  private config: WebSocketMessageQueueConfig;
  private webSocket: SessionsWebSocket | null = null;
  private connectionLevel: WebSocketConnectionLevel = 'offline';
  private messageHandlers: Map<string, MessageHandler[]> = new Map();
  private pendingMessages: QueuedMessage[] = [];
  private isProcessing = false;

  constructor(config: WebSocketMessageQueueConfig) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    };
  }

  /**
   * 获取当前连接级别
   */
  getConnectionLevel(): WebSocketConnectionLevel {
    return this.connectionLevel;
  }

  /**
   * 是否已连接
   */
  isConnected(): boolean {
    return this.connectionLevel === 'websocket';
  }

  /**
   * 连接消息队列
   */
  async connect(): Promise<Result<void>> {
    // 尝试 WebSocket 连接
    if (this.config.webSocket) {
      try {
        this.webSocket = createSessionsWebSocket(this.config.webSocket, this.createCallbacks());

        const result = await this.webSocket.connect();
        if (result.success) {
          this.connectionLevel = 'websocket';
          console.log('[WebSocketMessageQueue] Connected via WebSocket');
          return { success: true, data: undefined };
        }
        console.warn(
          '[WebSocketMessageQueue] WebSocket connection failed, falling back to file queue'
        );
      } catch (error) {
        console.warn('[WebSocketMessageQueue] WebSocket connection error:', error);
      }
    }

    // WebSocket 不可用，降级到文件队列
    if (this.config.fallbackToFile) {
      this.connectionLevel = 'file_fallback';
      console.log('[WebSocketMessageQueue] Using file queue fallback');
      return { success: true, data: undefined };
    }

    this.connectionLevel = 'offline';
    return {
      success: false,
      error: new EketError(EketErrorCode.MESSAGE_QUEUE_OFFLINE, 'No available connection method'),
    };
  }

  /**
   * 创建 WebSocket 回调
   */
  private createCallbacks(): SessionsWebSocketCallbacks {
    return {
      onConnected: () => {
        this.connectionLevel = 'websocket';
        console.log('[WebSocketMessageQueue] WebSocket connected');
      },

      onDisconnected: (code, _reason) => {
        console.warn(`[WebSocketMessageQueue] WebSocket disconnected (code: ${code})`);
        if (this.config.fallbackToFile) {
          this.connectionLevel = 'file_fallback';
        } else {
          this.connectionLevel = 'offline';
        }
      },

      onClose: () => {
        console.log('[WebSocketMessageQueue] WebSocket closed');
        this.connectionLevel = 'offline';
      },

      onError: (error) => {
        console.error('[WebSocketMessageQueue] WebSocket error:', error);
      },

      onMessage: (data) => {
        this.handleIncomingMessage(data);
      },
    };
  }

  /**
   * 处理接收到的消息
   */
  private handleIncomingMessage(data: RawData): void {
    try {
      const parsed = JSON.parse(data.toString());

      if (!isQueuedMessage(parsed)) {
        console.error('[WebSocketMessageQueue] Invalid message format');
        return;
      }

      this.dispatchMessage(parsed);
    } catch (error) {
      console.error('[WebSocketMessageQueue] Failed to parse message:', error);
    }
  }

  /**
   * 分发消息到处理器
   */
  private dispatchMessage(message: QueuedMessage): void {
    const handlers = this.messageHandlers.get(message.type) || [];

    for (const handler of handlers) {
      handler(message).catch((error) => {
        console.error(`[WebSocketMessageQueue] Handler error for ${message.type}:`, error);
      });
    }
  }

  /**
   * 断开连接
   */
  async disconnect(): Promise<void> {
    if (this.webSocket) {
      await this.webSocket.disconnect();
      this.webSocket = null;
    }
    this.connectionLevel = 'offline';
  }

  /**
   * 发送消息
   */
  async sendMessage(
    message: Omit<QueuedMessage, 'id' | 'timestamp' | 'retryCount'>
  ): Promise<Result<string>> {
    const queuedMessage: QueuedMessage = {
      ...message,
      id: this.generateMessageId(),
      timestamp: Date.now(),
      retryCount: 0,
    };

    // 优先使用 WebSocket
    if (this.connectionLevel === 'websocket' && this.webSocket) {
      const result = await this.sendViaWebSocket(queuedMessage);
      if (result.success) {
        return { success: true, data: queuedMessage.id };
      }
      // 发送失败，增加重试计数
      queuedMessage.retryCount = (queuedMessage.retryCount || 0) + 1;
      console.warn('[WebSocketMessageQueue] WebSocket send failed, retrying...');
    }

    // 降级到文件队列
    if (this.connectionLevel === 'file_fallback') {
      return await this.sendViaFileQueue(queuedMessage);
    }

    // 离线模式，加入待处理队列
    this.pendingMessages.push(queuedMessage);
    return {
      success: false,
      error: new EketError(EketErrorCode.MESSAGE_QUEUE_OFFLINE, 'Message queued for later delivery'),
    };
  }

  /**
   * 通过 WebSocket 发送消息
   */
  private async sendViaWebSocket(message: QueuedMessage): Promise<Result<void>> {
    if (!this.webSocket) {
      return {
        success: false,
        error: new EketError(EketErrorCode.WEBSOCKET_NOT_AVAILABLE, 'WebSocket not available'),
      };
    }

    const wsMessage: WebSocketMessage = {
      type: 'message:queue',
      data: message as unknown as Record<string, unknown>,
    };

    return await this.webSocket.send(wsMessage);
  }

  /**
   * 通过文件队列发送消息（降级方案）
   */
  private async sendViaFileQueue(message: QueuedMessage): Promise<Result<string>> {
    // 简化实现：实际项目中应集成 file-queue-manager
    const fileQueueDir = this.config.fileQueueDir || './.eket/data/queue';

    try {
      await fs.promises.mkdir(fileQueueDir, { recursive: true });

      const filePath = path.join(fileQueueDir, `${message.id}.json`);
      await fs.promises.writeFile(filePath, JSON.stringify(message, null, 2));

      console.log(`[WebSocketMessageQueue] Message written to file: ${filePath}`);
      return { success: true, data: message.id };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to write message to file';
      const errorContext =
        error instanceof Error ? { message: error.message, stack: error.stack } : undefined;
      return {
        success: false,
        error: new EketError(EketErrorCode.FILE_QUEUE_WRITE_FAILED, errorMessage, errorContext),
      };
    }
  }

  /**
   * 注册消息处理器
   */
  on(messageType: string, handler: MessageHandler): void {
    if (!this.messageHandlers.has(messageType)) {
      this.messageHandlers.set(messageType, []);
    }
    this.messageHandlers.get(messageType)!.push(handler);
  }

  /**
   * 注销消息处理器
   */
  off(messageType: string, handler: MessageHandler): void {
    const handlers = this.messageHandlers.get(messageType);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index !== -1) {
        handlers.splice(index, 1);
      }
    }
  }

  /**
   * 处理待处理消息
   */
  async processPendingMessages(): Promise<void> {
    if (this.isProcessing || this.pendingMessages.length === 0) {
      return;
    }

    this.isProcessing = true;

    try {
      while (this.pendingMessages.length > 0) {
        const message = this.pendingMessages.shift()!;

        if (this.connectionLevel === 'websocket') {
          const result = await this.sendViaWebSocket(message);
          if (!result.success) {
            // 重新加入队列头部
            this.pendingMessages.unshift(message);
            break;
          }
        } else if (this.connectionLevel === 'file_fallback') {
          await this.sendViaFileQueue(message);
        } else {
          // 离线模式，放回队列
          this.pendingMessages.unshift(message);
          break;
        }
      }
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    connectionLevel: WebSocketConnectionLevel;
    pendingMessages: number;
    isProcessing: boolean;
    handlerCount: number;
  } {
    let handlerCount = 0;
    for (const handlers of this.messageHandlers.values()) {
      handlerCount += handlers.length;
    }

    return {
      connectionLevel: this.connectionLevel,
      pendingMessages: this.pendingMessages.length,
      isProcessing: this.isProcessing,
      handlerCount,
    };
  }

  /**
   * 生成消息 ID (使用加密安全的随机数生成器)
   */
  private generateMessageId(): string {
    const randomBytes = crypto.randomBytes(6).toString('hex');
    return `msg_${Date.now()}_${randomBytes}`;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * 创建 WebSocket 消息队列
 */
export function createWebSocketMessageQueue(
  config: WebSocketMessageQueueConfig
): WebSocketMessageQueue {
  return new WebSocketMessageQueue(config);
}
