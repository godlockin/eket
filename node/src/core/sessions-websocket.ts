/**
 * Sessions WebSocket Module
 * Version: 2.0.0
 *
 * 用于服务端与 Agent 之间的实时通信
 * 支持会话订阅、状态推送、心跳保活
 *
 * 设计借鉴：Claude Code `sessions-websocket.ts` (358 行)
 */

import WebSocket, { type RawData } from 'ws';
import type { Result } from '../types/index.js';
import { EketError } from '../types/index.js';

// 导出 RawData 类型供其他模块使用
export type { RawData };

// ============================================================================
// Types
// ============================================================================

/**
 * WebSocket 连接状态
 */
export type WebSocketState = 'connecting' | 'connected' | 'disconnected' | 'closed';

/**
 * WebSocket 配置
 */
export interface SessionsWebSocketConfig {
  baseUrl: string;              // WebSocket 服务器地址（如 wss://api.example.com）
  sessionId: string;            // 会话 ID
  organizationUuid?: string;    // 组织 UUID（可选）
  accessToken: string;          // 认证 Token
  anthropVersion?: string;      // API 版本（可选，默认 2023-06-01）
  pingIntervalMs?: number;      // Ping 间隔（毫秒，默认 30000）
  reconnectDelayMs?: number;    // 重连延迟（毫秒，默认 3000）
  maxReconnectAttempts?: number; // 最大重连次数（默认 5）
}

/**
 * WebSocket 回调函数
 */
export interface SessionsWebSocketCallbacks {
  onConnected?: () => void;
  onDisconnected?: (code: number, reason: string) => void;
  onClose?: () => void;
  onError?: (error: Error) => void;
  onMessage?: (data: RawData) => void;
}

/**
 * WebSocket 消息类型
 */
export interface WebSocketMessage {
  type: string;
  sessionId?: string;
  timestamp?: number;
  data?: Record<string, unknown>;
}

/**
 * 错误码分类
 */
export const WebSocketErrorCodes = {
  // 永久错误（不再重试）
  UNAUTHORIZED: 4003,
  FORBIDDEN: 4002,
  INVALID_SESSION: 4001,

  // 可重试错误
  SERVER_ERROR: 5000,
  SERVICE_UNAVAILABLE: 5003,
  NORMAL_CLOSURE: 1000,
  GOING_AWAY: 1001,
  PROTOCOL_ERROR: 1002,
  UNSUPPORTED_DATA: 1003,
  ABNORMAL_CLOSURE: 1006,
  INVALID_PAYLOAD: 1007,
  POLICY_VIOLATION: 1008,
  MESSAGE_TOO_BIG: 1009,
  INTERNAL_ERROR: 1011,
  SERVICE_RESTART: 1012,
  TRY_AGAIN_LATER: 1013,
} as const;

/**
 * 永久错误码集合（遇到这些错误码时不再重试）
 */
const PERMANENT_ERROR_CODES = new Set<number>([
  WebSocketErrorCodes.UNAUTHORIZED,
  WebSocketErrorCodes.FORBIDDEN,
]);

/**
 * 会话不存在错误码（有限重试）
 */
const SESSION_NOT_FOUND_CODE = WebSocketErrorCodes.INVALID_SESSION;
const MAX_SESSION_NOT_FOUND_RETRIES = 3;

// ============================================================================
// Sessions WebSocket Class
// ============================================================================

export class SessionsWebSocket {
  private ws: WebSocket | null = null;
  private state: WebSocketState = 'closed';
  private reconnectAttempts = 0;
  private sessionNotFoundRetries = 0;
  private pingInterval: NodeJS.Timeout | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;

  private config: SessionsWebSocketConfig;
  private callbacks: SessionsWebSocketCallbacks;

  constructor(config: SessionsWebSocketConfig, callbacks: SessionsWebSocketCallbacks = {}) {
    // Defensive copy to prevent external mutation
    this.config = {
      baseUrl: config.baseUrl.replace('https://', 'wss://').replace('http://', 'ws://'),
      sessionId: config.sessionId,
      organizationUuid: config.organizationUuid,
      accessToken: config.accessToken,
      anthropVersion: config.anthropVersion ?? '2023-06-01',
      pingIntervalMs: config.pingIntervalMs ?? 30000,
      reconnectDelayMs: config.reconnectDelayMs ?? 3000,
      maxReconnectAttempts: config.maxReconnectAttempts ?? 5,
    };
    this.callbacks = callbacks;
  }

  /**
   * 获取当前连接状态
   */
  getState(): WebSocketState {
    return this.state;
  }

  /**
   * 是否已连接
   */
  isConnected(): boolean {
    return this.state === 'connected';
  }

  /**
   * 连接 WebSocket
   */
  async connect(): Promise<Result<void>> {
    if (this.state === 'connected') {
      return { success: true, data: undefined };
    }

    if (this.state === 'connecting') {
      return {
        success: false,
        error: new EketError('WEBSOCKET_ALREADY_CONNECTING', 'WebSocket is already connecting'),
      };
    }

    return this.doConnect();
  }

  /**
   * 执行连接（内部方法）
   */
  private doConnect(): Promise<Result<void>> {
    return new Promise((resolve) => {
      this.state = 'connecting';
      this.reconnectAttempts = 0;
      this.sessionNotFoundRetries = 0;

      const url = this.buildWebSocketUrl();

      try {
        this.ws = new WebSocket(url, {
          headers: {
            Authorization: `Bearer ${this.config.accessToken}`,
            'anthropic-version': this.config.anthropVersion,
          },
        });

        this.ws.on('open', () => {
          this.state = 'connected';
          this.reconnectAttempts = 0;
          this.sessionNotFoundRetries = 0;
          this.startPingInterval();
          this.callbacks.onConnected?.();
          resolve({ success: true, data: undefined });
        });

        this.ws.on('close', (code: number, reason: Buffer) => {
          this.handleClose(code, reason.toString());
        });

        this.ws.on('error', (error: Error) => {
          this.state = 'disconnected';
          this.callbacks.onError?.(error);
          // Error 事件后会触发 close 事件，由 handleClose 处理重连
        });

        this.ws.on('message', (data: WebSocket.RawData) => {
          this.callbacks.onMessage?.(data);
        });

      } catch (error) {
        this.state = 'closed';
        const errorMessage = error instanceof Error ? error.message : 'Unknown connection error';
        const errorContext = error instanceof Error ? { message: error.message, stack: error.stack } : undefined;
        const eketError = new EketError('WEBSOCKET_CONNECTION_FAILED', errorMessage, errorContext);
        resolve({ success: false, error: eketError });
      }
    });
  }

  /**
   * 构建 WebSocket URL
   */
  private buildWebSocketUrl(): string {
    const baseUrl = this.config.baseUrl;
    const sessionId = this.config.sessionId;
    const orgUuid = this.config.organizationUuid;

    let url = `${baseUrl}/v1/sessions/ws/${sessionId}/subscribe`;

    if (orgUuid) {
      url += `?organization_uuid=${encodeURIComponent(orgUuid)}`;
    }

    return url;
  }

  /**
   * 开始 Ping 心跳
   */
  private startPingInterval(): void {
    this.stopPingInterval();

    this.pingInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.ping();
      }
    }, this.config.pingIntervalMs);
  }

  /**
   * 停止 Ping 心跳
   */
  private stopPingInterval(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  /**
   * 处理连接关闭
   */
  private handleClose(closeCode: number, reason: string): void {
    this.state = 'closed';
    this.stopPingInterval();
    this.clearReconnectTimer();

    // 永久错误：不再重试
    if (PERMANENT_ERROR_CODES.has(closeCode)) {
      console.error(`[WebSocket] Permanent error (code: ${closeCode}), not reconnecting`);
      this.callbacks.onDisconnected?.(closeCode, reason);
      this.callbacks.onClose?.();
      return;
    }

    // Session not found：有限重试
    if (closeCode === SESSION_NOT_FOUND_CODE) {
      this.sessionNotFoundRetries++;
      if (this.sessionNotFoundRetries > MAX_SESSION_NOT_FOUND_RETRIES) {
        console.error(`[WebSocket] Session not found after ${this.sessionNotFoundRetries} retries, giving up`);
        this.callbacks.onDisconnected?.(closeCode, reason);
        this.callbacks.onClose?.();
        return;
      }
      console.log(`[WebSocket] Session not found, retry ${this.sessionNotFoundRetries}/${MAX_SESSION_NOT_FOUND_RETRIES}`);
      this.scheduleReconnect(this.config.reconnectDelayMs! * this.sessionNotFoundRetries);
      return;
    }

    // 其他错误：有限重试
    if (this.reconnectAttempts < this.config.maxReconnectAttempts!) {
      this.reconnectAttempts++;
      console.log(`[WebSocket] Reconnecting, attempt ${this.reconnectAttempts}/${this.config.maxReconnectAttempts}`);
      this.scheduleReconnect(this.config.reconnectDelayMs!);
    } else {
      console.error(`[WebSocket] Max reconnect attempts reached, giving up`);
      this.callbacks.onDisconnected?.(closeCode, reason);
      this.callbacks.onClose?.();
    }
  }

  /**
   * 调度重连
   */
  private scheduleReconnect(delayMs: number): void {
    this.clearReconnectTimer();

    this.reconnectTimer = setTimeout(async () => {
      await this.doConnect();
    }, delayMs);
  }

  /**
   * 清除重连定时器
   */
  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  /**
   * 断开连接
   */
  async disconnect(): Promise<void> {
    this.state = 'closed';
    this.stopPingInterval();
    this.clearReconnectTimer();

    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }
  }

  /**
   * 发送消息
   */
  async send(message: WebSocketMessage): Promise<Result<void>> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return {
        success: false,
        error: new EketError('WEBSOCKET_NOT_CONNECTED', 'WebSocket is not connected'),
      };
    }

    try {
      const data = JSON.stringify({
        ...message,
        timestamp: message.timestamp || Date.now(),
      });
      this.ws.send(data);
      return { success: true, data: undefined };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to send message';
      const errorContext = error instanceof Error ? { message: error.message, stack: error.stack } : undefined;
      const eketError = new EketError('WEBSOCKET_SEND_FAILED', errorMessage, errorContext);
      return { success: false, error: eketError };
    }
  }

  /**
   * 订阅会话事件（只读观察者模式）
   */
  async subscribe(viewerOnly: boolean = false): Promise<Result<void>> {
    if (viewerOnly) {
      console.log('[WebSocket] Connecting as read-only viewer');
    }

    const result = await this.connect();
    if (!result.success) {
      return result;
    }

    // 发送订阅消息
    return await this.send({
      type: viewerOnly ? 'subscribe:readonly' : 'subscribe',
      sessionId: this.config.sessionId,
    });
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * 创建 Sessions WebSocket 实例
 */
export function createSessionsWebSocket(
  config: SessionsWebSocketConfig,
  callbacks?: SessionsWebSocketCallbacks
): SessionsWebSocket {
  return new SessionsWebSocket(config, callbacks);
}
