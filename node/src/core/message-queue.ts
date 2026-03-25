/**
 * Message Queue Module
 * 支持 Redis 和文件队列两种模式，自动降级
 */

import * as fs from 'fs';
import * as path from 'path';
import { RedisClient } from '../core/redis-client.js';
import type { Message, Result } from '../types/index.js';
import { EketError } from '../types/index.js';

export interface MessageQueueConfig {
  mode: 'redis' | 'file' | 'auto';
  redisHost?: string;
  redisPort?: number;
  redisPassword?: string;
  queueDir?: string;
}

export type MessageHandler = (message: Message) => Promise<void>;

/**
 * 消息队列接口
 */
export interface MessageQueue {
  connect(): Promise<Result<void>>;
  disconnect(): Promise<void>;
  publish(channel: string, message: Message): Promise<Result<void>>;
  subscribe(channel: string, handler: MessageHandler): Promise<Result<void>>;
  unsubscribe(channel: string): Promise<void>;
}

/**
 * Redis 消息队列实现
 */
export class RedisMessageQueue implements MessageQueue {
  private client: RedisClient;
  private subscribedChannels: Map<string, MessageHandler> = new Map();

  constructor(config: MessageQueueConfig) {
    this.client = new RedisClient({
      host: config.redisHost || 'localhost',
      port: config.redisPort || 6379,
      password: config.redisPassword,
    });
  }

  async connect(): Promise<Result<void>> {
    return await this.client.connect();
  }

  async disconnect(): Promise<void> {
    await this.client.disconnect();
    this.subscribedChannels.clear();
  }

  async publish(channel: string, message: Message): Promise<Result<void>> {
    return await this.client.publishMessage(channel, JSON.stringify(message));
  }

  async subscribe(channel: string, handler: MessageHandler): Promise<Result<void>> {
    if (this.subscribedChannels.has(channel)) {
      return {
        success: false,
        error: new EketError('ALREADY_SUBSCRIBED', `Already subscribed to channel: ${channel}`),
      };
    }

    this.subscribedChannels.set(channel, handler);

    return await this.client.subscribeMessage(channel, (data) => {
      try {
        const message = JSON.parse(data) as Message;
        handler(message);
      } catch {
        console.error('[Redis MQ] Parse message error');
      }
    });
  }

  async unsubscribe(channel: string): Promise<void> {
    this.subscribedChannels.delete(channel);
    // Redis 客户端目前没有直接的 unsubscribe 方法，需要时添加
  }
}

/**
 * 文件消息队列实现（降级模式）
 */
export class FileMessageQueue implements MessageQueue {
  private queueDir: string;
  private handlers: Map<string, MessageHandler> = new Map();
  private pollInterval: NodeJS.Timeout | null = null;
  private readonly POLL_INTERVAL_MS = 5000; // 5 秒轮询

  constructor(config: MessageQueueConfig) {
    this.queueDir = config.queueDir || path.join(process.cwd(), '.eket', 'data', 'queue');
    fs.mkdirSync(this.queueDir, { recursive: true });
  }

  async connect(): Promise<Result<void>> {
    console.log(`[File MQ] Connected to ${this.queueDir}`);
    return { success: true, data: undefined };
  }

  async disconnect(): Promise<void> {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    this.handlers.clear();
  }

  async publish(channel: string, message: Message): Promise<Result<void>> {
    try {
      const filename = `${channel}_${message.id}_${Date.now()}.json`;
      const filepath = path.join(this.queueDir, filename);

      const fileMessage = {
        ...message,
        _channel: channel,
      };

      fs.writeFileSync(filepath, JSON.stringify(fileMessage, null, 2));
      return { success: true, data: undefined };
    } catch {
      return {
        success: false,
        error: new EketError('FILE_WRITE_FAILED', 'Failed to write message'),
      };
    }
  }

  async subscribe(channel: string, handler: MessageHandler): Promise<Result<void>> {
    this.handlers.set(channel, handler);

    // 开始轮询
    if (!this.pollInterval) {
      this.startPolling();
    }

    return { success: true, data: undefined };
  }

  async unsubscribe(channel: string): Promise<void> {
    this.handlers.delete(channel);
  }

  private startPolling(): void {
    this.pollInterval = setInterval(async () => {
      await this.processQueue();
    }, this.POLL_INTERVAL_MS);
  }

  private async processQueue(): Promise<void> {
    try {
      const files = fs.readdirSync(this.queueDir);
      const messageFiles = files.filter((f) => f.endsWith('.json'));

      for (const file of messageFiles) {
        const filepath = path.join(this.queueDir, file);

        try {
          const content = fs.readFileSync(filepath, 'utf-8');
          const message = JSON.parse(content) as Message & { _channel?: string };

          if (message._channel && this.handlers.has(message._channel)) {
            const handler = this.handlers.get(message._channel)!;
            await handler(message);

            // 处理后删除文件
            fs.unlinkSync(filepath);
          }
        } catch {
          console.error('[File MQ] Process file error');
        }
      }
    } catch {
      console.error('[File MQ] Process queue error');
    }
  }
}

/**
 * 混合消息队列（自动降级）
 */
export class HybridMessageQueue implements MessageQueue {
  private redisMQ: RedisMessageQueue | null = null;
  private fileMQ: FileMessageQueue | null = null;
  private mode: 'redis' | 'file' = 'file';

  constructor(config: MessageQueueConfig) {
    if (config.mode === 'redis' || config.mode === 'auto') {
      this.redisMQ = new RedisMessageQueue(config);
    }
    if (config.mode === 'file' || config.mode === 'auto') {
      this.fileMQ = new FileMessageQueue(config);
    }
  }

  async connect(): Promise<Result<void>> {
    // 尝试连接 Redis
    if (this.redisMQ) {
      const result = await this.redisMQ.connect();
      if (result.success) {
        this.mode = 'redis';
        console.log('[Hybrid MQ] Using Redis message queue');
        return result;
      }
      console.log('[Hybrid MQ] Redis unavailable, falling back to file queue');
    }

    // 降级到文件队列
    if (this.fileMQ) {
      const result = await this.fileMQ.connect();
      if (result.success) {
        this.mode = 'file';
        return result;
      }
    }

    return {
      success: false,
      error: new EketError('MQ_CONNECT_FAILED', 'Failed to connect any message queue'),
    };
  }

  async disconnect(): Promise<void> {
    if (this.redisMQ) {
      await this.redisMQ.disconnect();
    }
    if (this.fileMQ) {
      await this.fileMQ.disconnect();
    }
  }

  async publish(channel: string, message: Message): Promise<Result<void>> {
    if (this.mode === 'redis' && this.redisMQ) {
      return await this.redisMQ.publish(channel, message);
    }
    if (this.fileMQ) {
      return await this.fileMQ.publish(channel, message);
    }
    return {
      success: false,
      error: new EketError('MQ_NOT_AVAILABLE', 'No message queue available'),
    };
  }

  async subscribe(channel: string, handler: MessageHandler): Promise<Result<void>> {
    if (this.mode === 'redis' && this.redisMQ) {
      return await this.redisMQ.subscribe(channel, handler);
    }
    if (this.fileMQ) {
      return await this.fileMQ.subscribe(channel, handler);
    }
    return {
      success: false,
      error: new EketError('MQ_NOT_AVAILABLE', 'No message queue available'),
    };
  }

  async unsubscribe(channel: string): Promise<void> {
    if (this.mode === 'redis' && this.redisMQ) {
      await this.redisMQ.unsubscribe(channel);
    } else if (this.fileMQ) {
      await this.fileMQ.unsubscribe(channel);
    }
  }

  getMode(): 'redis' | 'file' {
    return this.mode;
  }
}

/**
 * 创建默认消息队列
 */
export function createMessageQueue(config?: Partial<MessageQueueConfig>): HybridMessageQueue {
  return new HybridMessageQueue({
    mode: config?.mode || 'auto',
    redisHost: config?.redisHost || process.env.EKET_REDIS_HOST || 'localhost',
    redisPort: config?.redisPort || parseInt(process.env.EKET_REDIS_PORT || '6379', 10),
    redisPassword: config?.redisPassword || process.env.EKET_REDIS_PASSWORD,
    queueDir: config?.queueDir,
  });
}

/**
 * 生成消息 ID
 */
export function generateMessageId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * 创建消息
 */
export function createMessage(
  type: Message['type'],
  from: string,
  to: string,
  payload: Record<string, unknown>,
  priority: Message['priority'] = 'normal'
): Message {
  return {
    id: generateMessageId(),
    timestamp: new Date().toISOString(),
    type,
    from,
    to,
    priority,
    payload,
  };
}
