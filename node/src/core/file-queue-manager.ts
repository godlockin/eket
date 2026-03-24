/**
 * File Queue Manager
 * 文件队列持久化管理，支持消息去重、过期清理、历史归档
 */

import * as fs from 'fs';
import * as path from 'path';
import type { Message } from '../types';
import type { Result } from '../types';

export interface FileQueueConfig {
  queueDir: string;
  archiveDir: string;
  maxAge: number; // 消息最大保留时间（毫秒）
  archiveAfter: number; // 多久后归档（毫秒）
}

export interface QueueStats {
  pending: number;
  processing: number;
  archived: number;
  expired: number;
}

interface FileMessage extends Message {
  _channel?: string;
  _enqueue_time?: number;
}

/**
 * 文件队列管理器
 */
export class FileQueueManager {
  private config: FileQueueConfig;
  private processedIds: Set<string>;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(config?: Partial<FileQueueConfig>) {
    const defaultConfig: FileQueueConfig = {
      queueDir: path.join(process.cwd(), '.eket', 'data', 'queue'),
      archiveDir: path.join(process.cwd(), '.eket', 'data', 'queue-archive'),
      maxAge: 24 * 60 * 60 * 1000, // 24 小时
      archiveAfter: 60 * 60 * 1000, // 1 小时
    };

    this.config = { ...defaultConfig, ...config };
    this.processedIds = new Set();

    // 确保目录存在
    fs.mkdirSync(this.config.queueDir, { recursive: true });
    fs.mkdirSync(this.config.archiveDir, { recursive: true });

    // 加载已处理 ID
    this.loadProcessedIds();
  }

  /**
   * 加载已处理消息 ID
   */
  private loadProcessedIds(): Result<void> {
    const indexPath = path.join(this.config.queueDir, 'processed.json');
    if (fs.existsSync(indexPath)) {
      try {
        const data = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
        this.processedIds = new Set(data.ids || []);
        return { success: true, data: undefined };
      } catch (error) {
        const err = error as Error;
        console.warn(`[FileQueue] 加载 processed.json 失败：${err.message}，使用空集合`);
        this.processedIds = new Set();
        return { success: true, data: undefined }; // 非致命错误
      }
    }
    return { success: true, data: undefined };
  }

  /**
   * 保存已处理消息 ID
   */
  private saveProcessedIds(): Result<void> {
    try {
      const indexPath = path.join(this.config.queueDir, 'processed.json');
      // 只保留最近 10000 条
      const ids = Array.from(this.processedIds).slice(-10000);
      fs.writeFileSync(indexPath, JSON.stringify({ ids, updated: new Date().toISOString() }));
      return { success: true, data: undefined };
    } catch (error) {
      const err = error as Error;
      console.error(`[FileQueue] 保存 processed.json 失败：${err.message}`);
      return { success: false, error: err };
    }
  }

  /**
   * 检查消息是否已处理（去重）
   */
  isProcessed(messageId: string): boolean {
    return this.processedIds.has(messageId);
  }

  /**
   * 标记消息为已处理
   */
  markProcessed(messageId: string): void {
    this.processedIds.add(messageId);
    // 每 100 条保存一次
    if (this.processedIds.size % 100 === 0) {
      this.saveProcessedIds();
    }
  }

  /**
   * 写入消息到队列
   */
  enqueue(channel: string, message: Message): Result<string> {
    try {
      // 去重检查
      if (this.isProcessed(message.id)) {
        console.log(`[FileQueue] 跳过已处理消息：${message.id}`);
        return { success: false, error: new Error('消息已处理') };
      }

      const filename = `${channel}_${message.id}_${Date.now()}.json`;
      const filepath = path.join(this.config.queueDir, filename);

      const fileMessage: FileMessage = {
        ...message,
        _channel: channel,
        _enqueue_time: Date.now(),
      };

      fs.writeFileSync(filepath, JSON.stringify(fileMessage, null, 2));
      return { success: true, data: filepath };
    } catch (error) {
      const err = error as Error;
      console.error(`[FileQueue] Enqueue error: ${err.message}`);
      return { success: false, error: err };
    }
  }

  /**
   * 从队列获取消息
   */
  dequeue(channel?: string): Array<{ filepath: string; message: Message & { _channel?: string } }> {
    const messages: Array<{ filepath: string; message: Message & { _channel?: string } }> = [];

    try {
      const files = fs.readdirSync(this.config.queueDir);
      const messageFiles = files.filter((f) => f.endsWith('.json') && f !== 'processed.json');

      for (const file of messageFiles) {
        const filepath = path.join(this.config.queueDir, file);

        try {
          const content = fs.readFileSync(filepath, 'utf-8');
          const message = JSON.parse(content) as Message & { _channel?: string };

          // 跳过已处理
          if (this.isProcessed(message.id)) {
            fs.unlinkSync(filepath);
            continue;
          }

          // 按频道过滤
          if (channel && message._channel !== channel) {
            continue;
          }

          messages.push({ filepath, message });
        } catch {
          // 忽略损坏的文件
        }
      }
    } catch (error) {
      const err = error as Error;
      console.error('[FileQueue] Dequeue error:', err.message);
    }

    return messages;
  }

  /**
   * 处理队列中的消息
   */
  async processQueue(
    handler: (message: Message & { _channel?: string }) => Promise<void>,
    channel?: string
  ): Promise<number> {
    const messages = this.dequeue(channel);
    let processedCount = 0;

    for (const { filepath, message } of messages) {
      try {
        await handler(message);
        this.markProcessed(message.id);
        fs.unlinkSync(filepath);
        processedCount++;
      } catch (error) {
        const err = error as Error;
        console.error(`[FileQueue] Process message ${message.id} error: ${err.message}`);
      }
    }

    return processedCount;
  }

  /**
   * 清理过期消息
   */
  cleanupExpired(): number {
    const now = Date.now();
    let cleanedCount = 0;

    try {
      const files = fs.readdirSync(this.config.queueDir);
      const messageFiles = files.filter((f) => f.endsWith('.json') && f !== 'processed.json');

      for (const file of messageFiles) {
        const filepath = path.join(this.config.queueDir, file);

        try {
          const content = fs.readFileSync(filepath, 'utf-8');
          const message = JSON.parse(content) as Message & { _enqueue_time?: number };

          const enqueueTime = message._enqueue_time || now;
          const age = now - enqueueTime;

          if (age > this.config.maxAge) {
            // 过期消息
            fs.unlinkSync(filepath);
            cleanedCount++;
          } else if (age > this.config.archiveAfter) {
            // 归档消息
            this.archiveMessage(filepath);
          }
        } catch {
          // 忽略损坏的文件
          fs.unlinkSync(filepath);
          cleanedCount++;
        }
      }
    } catch (error) {
      const err = error as Error;
      console.error('[FileQueue] Cleanup error:', err.message);
    }

    return cleanedCount;
  }

  /**
   * 归档消息
   */
  private archiveMessage(filepath: string): void {
    const filename = path.basename(filepath);
    const archivePath = path.join(this.config.archiveDir, filename);

    if (!fs.existsSync(archivePath)) {
      fs.renameSync(filepath, archivePath);
    }
  }

  /**
   * 获取队列统计
   */
  getStats(): QueueStats {
    const stats: QueueStats = {
      pending: 0,
      processing: 0,
      archived: 0,
      expired: 0,
    };

    const now = Date.now();

    // 统计队列
    try {
      const files = fs.readdirSync(this.config.queueDir);
      const messageFiles = files.filter((f) => f.endsWith('.json') && f !== 'processed.json');

      for (const file of messageFiles) {
        const filepath = path.join(this.config.queueDir, file);

        try {
          const content = fs.readFileSync(filepath, 'utf-8');
          const message = JSON.parse(content) as Message & { _enqueue_time?: number };

          const enqueueTime = message._enqueue_time || now;
          const age = now - enqueueTime;

          if (age > this.config.maxAge) {
            stats.expired++;
          } else {
            stats.pending++;
          }
        } catch {
          stats.expired++;
        }
      }
    } catch {
      // 忽略错误
    }

    // 统计归档
    try {
      if (fs.existsSync(this.config.archiveDir)) {
        stats.archived = fs.readdirSync(this.config.archiveDir).filter((f) => f.endsWith('.json')).length;
      }
    } catch {
      // 忽略错误
    }

    return stats;
  }

  /**
   * 启动定期清理
   */
  startCleanup(interval: number = 60 * 60 * 1000): void {
    // 每小时清理一次
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    this.cleanupInterval = setInterval(() => {
      const cleaned = this.cleanupExpired();
      if (cleaned > 0) {
        console.log(`[FileQueue] 清理了 ${cleaned} 条过期消息`);
      }
      this.saveProcessedIds();
    }, interval);

    console.log(`[FileQueue] 定期清理已启动（间隔：${interval / 60000} 分钟）`);
  }

  /**
   * 停止定期清理
   */
  stopCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * 导出消息历史
   */
  exportHistory(options?: {
    startDate?: Date;
    endDate?: Date;
    channel?: string;
  }): Message[] {
    const history: Message[] = [];
    const startDate = options?.startDate?.getTime() || 0;
    const endDate = options?.endDate?.getTime() || Date.now();

    // 从归档中读取
    if (fs.existsSync(this.config.archiveDir)) {
      const files = fs.readdirSync(this.config.archiveDir);

      for (const file of files) {
        if (!file.endsWith('.json')) continue;

        const filepath = path.join(this.config.archiveDir, file);

        try {
          const content = fs.readFileSync(filepath, 'utf-8');
          const message = JSON.parse(content) as Message & { _channel?: string; _enqueue_time?: number };

          const time = message._enqueue_time || message.timestamp?.getTime() || 0;
          if (time >= startDate && time <= endDate) {
            if (!options?.channel || message._channel === options.channel) {
              history.push(message);
            }
          }
        } catch {
          // 忽略损坏的文件
        }
      }
    }

    return history.sort((a, b) => {
      const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
      const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
      return timeB - timeA;
    });
  }
}

/**
 * 创建文件队列管理器
 */
export function createFileQueueManager(config?: Partial<FileQueueConfig>): FileQueueManager {
  return new FileQueueManager(config);
}
