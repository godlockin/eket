/**
 * 消息桥接器
 *
 * OpenCLAW ↔ EKET 双向消息通道
 */

import Redis from 'ioredis';

export interface BridgeMessage {
  protocol: 'openclaw-eket-bridge';
  version: '1.0';
  direction: 'openclaw_to_eket' | 'eket_to_openclaw';
  message_type: MessageType;
  payload: unknown;
  timestamp: string;
}

export type MessageType =
  | 'task_assignment'
  | 'task_status_update'
  | 'agent_lifecycle'
  | 'pr_review_request'
  | 'workflow_complete';

export interface BridgeConfig {
  redis: {
    host: string;
    port: number;
    password?: string;
    db?: number;
  };
  channels: {
    taskAssignment: string;
    statusUpdate: string;
    agentLifecycle: string;
  };
}

export class MessageBridge {
  private redis: Redis;
  private config: BridgeConfig;
  private listeners: Map<string, Array<(msg: BridgeMessage) => void>>;

  constructor(config: BridgeConfig) {
    this.config = config;
    this.redis = new Redis({
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password,
      db: config.redis.db
    });
    this.listeners = new Map();
  }

  /**
   * 发送消息到 OpenCLAW
   */
  async sendToOpenCLAW(
    messageType: MessageType,
    payload: unknown
  ): Promise<void> {
    const message: BridgeMessage = {
      protocol: 'openclaw-eket-bridge',
      version: '1.0',
      direction: 'eket_to_openclaw',
      message_type: messageType,
      payload,
      timestamp: new Date().toISOString()
    };

    await this.redis.publish(
      this.config.channels.statusUpdate,
      JSON.stringify(message)
    );
  }

  /**
   * 监听来自 OpenCLAW 的消息
   */
  onMessageFromOpenCLAW(
    messageType: MessageType,
    handler: (msg: BridgeMessage) => void
  ): void {
    if (!this.listeners.has(messageType)) {
      this.listeners.set(messageType, []);
    }
    this.listeners.get(messageType)!.push(handler);
  }

  /**
   * 订阅消息通道
   */
  async subscribe(): Promise<void> {
    const subscriber = this.redis.duplicate();

    await subscriber.subscribe(
      this.config.channels.taskAssignment,
      this.config.channels.agentLifecycle
    );

    subscriber.on('message', (_channel, message) => {
      try {
        const msg: BridgeMessage = JSON.parse(message);

        if (msg.direction === 'openclaw_to_eket') {
          const handlers = this.listeners.get(msg.message_type) || [];
          for (const handler of handlers) {
            handler(msg);
          }
        }
      } catch (error) {
        console.error('[MessageBridge] Message parse error:', error);
      }
    });
  }

  /**
   * 关闭连接
   */
  async close(): Promise<void> {
    await this.redis.quit();
  }
}
