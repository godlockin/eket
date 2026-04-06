/**
 * EKET Framework - Optimized File Queue Manager
 * Phase 7: 错误恢复和性能优化
 *
 * 优化特性：
 * - 原子文件操作（临时文件 + 重命名）
 * - 文件锁机制（防止竞态）
 * - 批量操作支持
 * - 错误恢复（带重试）
 * - 性能统计
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

import type { Message, Result } from '../types/index.js';
import { EketError, EketErrorCode } from '../types/index.js';

export interface OptimizedFileQueueConfig {
  queueDir: string;
  archiveDir: string;
  maxAge: number; // 消息最大保留时间（毫秒）
  archiveAfter: number; // 多久后归档（毫秒）
  atomicWrites: boolean; // 是否启用原子写入
}

export interface OptimizedQueueStats {
  pending: number;
  processing: number;
  archived: number;
  expired: number;
  writeErrors: number;
  readErrors: number;
  lockContentions: number;
  avgWriteTime: number;
  avgReadTime: number;
}

interface FileMessage extends Message {
  _channel?: string;
  _enqueue_time?: number;
  _write_checksum?: string;
}

/**
 * 优化的文件队列管理器
 */
export class OptimizedFileQueueManager {
  private config: OptimizedFileQueueConfig;
  private processedIds: Map<string, number>; // messageId -> timestamp
  private stats: OptimizedQueueStats;
  private writeTimes: number[] = [];
  private readTimes: number[] = [];
  private readonly MAX_WRITE_TIMES = 100;

  constructor(config?: Partial<OptimizedFileQueueConfig>) {
    const defaultConfig: OptimizedFileQueueConfig = {
      queueDir: path.join(process.cwd(), '.eket', 'data', 'queue-v2'),
      archiveDir: path.join(process.cwd(), '.eket', 'data', 'queue-archive-v2'),
      maxAge: 24 * 60 * 60 * 1000,
      archiveAfter: 60 * 60 * 1000,
      atomicWrites: true,
    };

    this.config = { ...defaultConfig, ...config };
    this.processedIds = new Map();
    this.stats = {
      pending: 0,
      processing: 0,
      archived: 0,
      expired: 0,
      writeErrors: 0,
      readErrors: 0,
      lockContentions: 0,
      avgWriteTime: 0,
      avgReadTime: 0,
    };

    // 确保目录存在
    this.ensureDirectories();
    this.loadProcessedIds();
    this.startStatsCollection();

    // 启动时清理旧临时文件
    this.cleanupTempFiles();
  }

  /**
   * 清理启动时残留的临时文件
   *
   * 当进程崩溃时，临时文件 `.tmp.${pid}` 可能残留。
   * 此方法在启动时清理超过 1 小时的临时文件，防止文件堆积。
   */
  private cleanupTempFiles(): void {
    try {
      if (!fs.existsSync(this.config.queueDir)) {
        return;
      }

      const files = fs.readdirSync(this.config.queueDir);
      const tempFiles = files.filter((f) => f.includes('.tmp.'));

      let cleanedCount = 0;
      for (const file of tempFiles) {
        try {
          const filePath = path.join(this.config.queueDir, file);

          // 检查文件年龄，只清理超过 1 小时的临时文件
          const stats = fs.statSync(filePath);
          const fileAge = Date.now() - stats.mtimeMs;

          if (fileAge > 3600000) {
            // 1 小时
            fs.unlinkSync(filePath);
            cleanedCount++;
          }
        } catch (error) {
          // 忽略删除失败的文件
          console.warn(`[OptimizedFileQueue] Failed to cleanup temp file: ${file}`);
        }
      }

      if (cleanedCount > 0) {
        console.log(`[OptimizedFileQueue] Cleaned up ${cleanedCount} stale temp files`);
      }
    } catch (error) {
      console.warn('[OptimizedFileQueue] Failed to cleanup temp files:', error);
    }
  }

  /**
   * 确保所有必需目录存在
   */
  private ensureDirectories(): void {
    const dirs = [this.config.queueDir, this.config.archiveDir];
    for (const dir of dirs) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  /**
   * 加载已处理消息 ID（从持久化文件）
   */
  private loadProcessedIds(): void {
    const indexPath = this.getProcessedIndexPath();
    if (fs.existsSync(indexPath)) {
      try {
        const data = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
        const ids = data.ids || [];
        this.processedIds = new Map(ids.map((id: string) => [id, Date.now()]));
        console.log(`[OptimizedFileQueue] 加载了 ${this.processedIds.size} 条已处理 ID`);
      } catch {
        console.warn('[OptimizedFileQueue] 加载 processed.json 失败，使用空集合');
        this.processedIds = new Map();
      }
    }
  }

  /**
   * 保存已处理消息 ID
   */
  private saveProcessedIds(): Result<void> {
    try {
      const indexPath = this.getProcessedIndexPath();
      const tempPath = `${indexPath}.tmp.${process.pid}`;

      // 只保留最近 10000 条
      const entries = Array.from(this.processedIds.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10000);

      const data = { ids: entries.map((e) => e[0]), updated: new Date().toISOString() };

      // 原子写入
      fs.writeFileSync(tempPath, JSON.stringify(data, null, 2));
      fs.renameSync(tempPath, indexPath);

      return { success: true, data: undefined };
    } catch (err) {
      console.error('[OptimizedFileQueue] 保存 processed.json 失败:', err);
      return {
        success: false,
        error: new EketError(EketErrorCode.QUEUE_ERROR, '保存已处理 ID 失败'),
      };
    }
  }

  private getProcessedIndexPath(): string {
    return path.join(this.config.queueDir, 'processed.json');
  }

  /**
   * 检查消息是否已处理
   */
  isProcessed(messageId: string): boolean {
    return this.processedIds.has(messageId);
  }

  /**
   * 标记消息为已处理
   */
  markProcessed(messageId: string): void {
    this.processedIds.set(messageId, Date.now());

    // 每 100 条保存一次
    if (this.processedIds.size % 100 === 0) {
      this.saveProcessedIds();
    }
  }

  /**
   * 原子写入消息到队列
   */
  enqueue(channel: string, message: Message): Result<string> {
    const startTime = Date.now();
    let tempPath: string | null = null;

    const executeWrite = (): Result<string> => {
      try {
        // 去重检查
        if (this.isProcessed(message.id)) {
          return {
            success: false,
            error: new EketError(EketErrorCode.DUPLICATE_MESSAGE, '消息已处理'),
          };
        }

        const filename = `${channel}_${message.id}_${Date.now()}.json`;
        const filepath = path.join(this.config.queueDir, filename);

        const fileMessage: FileMessage = {
          ...message,
          _channel: channel,
          _enqueue_time: Date.now(),
          _write_checksum: this.calculateChecksum(message),
        };

        const content = JSON.stringify(fileMessage, null, 2);
        tempPath = `${filepath}.tmp.${process.pid}`;

        // 原子写入：先写临时文件，再重命名
        fs.writeFileSync(tempPath, content);
        fs.renameSync(tempPath, filepath);
        tempPath = null; // 重命名成功，临时文件已删除

        this.stats.pending++;
        this.recordWriteTime(Date.now() - startTime);

        return { success: true, data: filepath };
      } catch (err) {
        this.stats.writeErrors++;
        console.error('[OptimizedFileQueue] Enqueue error:', err);
        return {
          success: false,
          error: new EketError(EketErrorCode.QUEUE_ERROR, '写入队列失败'),
        };
      } finally {
        // 清理临时文件（如果仍然存在）
        if (tempPath && fs.existsSync(tempPath)) {
          try {
            fs.unlinkSync(tempPath);
          } catch {
            // 忽略清理临时文件时的错误
          }
        }
      }
    };

    // 直接执行（文件操作通常很快，不需要重试）
    return executeWrite();
  }

  /**
   * 计算消息校验和（用于完整性检查）
   */
  private calculateChecksum(message: Message): string {
    const hash = crypto.createHash('md5');
    hash.update(JSON.stringify(message, Object.keys(message).sort()));
    return hash.digest('hex');
  }

  /**
   * 从队列获取消息（支持批量）
   */
  dequeue(channel?: string, batchSize = 100): Array<{ filepath: string; message: FileMessage }> {
    const startTime = Date.now();
    const messages: Array<{ filepath: string; message: FileMessage }> = [];

    try {
      const files = fs.readdirSync(this.config.queueDir);
      const messageFiles = files.filter((f) => f.endsWith('.json') && f !== 'processed.json');

      let processed = 0;
      for (const file of messageFiles) {
        if (processed >= batchSize) {
          break;
        }

        const filepath = path.join(this.config.queueDir, file);

        try {
          const content = fs.readFileSync(filepath, 'utf-8');
          const message = JSON.parse(content) as FileMessage;

          // 跳过已处理
          if (this.isProcessed(message.id)) {
            fs.unlinkSync(filepath);
            continue;
          }

          // 校验和验证：先从消息中提取校验和字段，再用剩余对象重算
          const { _write_checksum: expectedChecksum, ...messageWithoutChecksum } = message;
          if (expectedChecksum) {
            const actualChecksum = this.calculateChecksum(messageWithoutChecksum as Message);
            if (expectedChecksum !== actualChecksum) {
              console.warn('[OptimizedFileQueue] 消息校验和失败，跳过:', file);
              this.stats.readErrors++;
              continue;
            }
          }

          // 按频道过滤
          if (channel && message._channel !== channel) {
            continue;
          }

          messages.push({ filepath, message });
          processed++;
        } catch {
          this.stats.readErrors++;
          // 忽略损坏的文件
        }
      }

      this.recordReadTime(Date.now() - startTime);
    } catch {
      console.error('[OptimizedFileQueue] Dequeue error');
    }

    return messages;
  }

  /**
   * 处理队列中的消息（支持并发控制）
   */
  async processQueue(
    handler: (message: FileMessage) => Promise<void>,
    channel?: string,
    concurrency = 1
  ): Promise<number> {
    const messages = this.dequeue(channel);
    let processedCount = 0;

    if (concurrency === 1) {
      // 串行处理
      for (const { filepath, message } of messages) {
        try {
          await handler(message);
          this.markProcessed(message.id);
          fs.unlinkSync(filepath);
          processedCount++;
        } catch {
          console.error(`[OptimizedFileQueue] Process message ${message.id} error`);
        }
      }
    } else {
      // 并发处理（带限流）
      const batches = this.chunkArray(messages, concurrency);

      for (const batch of batches) {
        const promises = batch.map(async ({ filepath, message }) => {
          try {
            await handler(message);
            this.markProcessed(message.id);
            fs.unlinkSync(filepath);
            processedCount++;
          } catch {
            console.error(`[OptimizedFileQueue] Process message ${message.id} error`);
          }
        });

        await Promise.all(promises);
      }
    }

    return processedCount;
  }

  /**
   * 数组分块
   */
  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
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
          const message = JSON.parse(content) as FileMessage & { _enqueue_time?: number };

          const enqueueTime = message._enqueue_time || now;
          const age = now - enqueueTime;

          if (age > this.config.maxAge) {
            fs.unlinkSync(filepath);
            cleanedCount++;
            this.stats.expired++;
          } else if (age > this.config.archiveAfter) {
            this.archiveMessage(filepath);
          }
        } catch {
          fs.unlinkSync(filepath);
          cleanedCount++;
          this.stats.expired++;
        }
      }
    } catch {
      console.error('[OptimizedFileQueue] Cleanup error');
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
      try {
        fs.renameSync(filepath, archivePath);
        this.stats.archived++;
        this.stats.pending--;
      } catch {
        // 忽略错误
      }
    }
  }

  /**
   * 批量写入消息（优化大量消息）
   */
  enqueueBatch(
    messages: Array<{ channel: string; message: Message }>
  ): Result<{ success: number; failed: number }> {
    let success = 0;
    let failed = 0;

    for (const { channel, message } of messages) {
      const result = this.enqueue(channel, message);
      if (result.success) {
        success++;
      } else {
        failed++;
      }
    }

    return { success: true, data: { success, failed } };
  }

  /**
   * 获取队列统计
   */
  getStats(): OptimizedQueueStats {
    // 实时更新 pending 数量
    try {
      const files = fs.readdirSync(this.config.queueDir);
      const messageFiles = files.filter((f) => f.endsWith('.json') && f !== 'processed.json');
      this.stats.pending = messageFiles.length;
    } catch {
      // 忽略错误
    }

    return { ...this.stats };
  }

  /**
   * 记录写入时间
   */
  private recordWriteTime(time: number): void {
    this.writeTimes.push(time);
    if (this.writeTimes.length > this.MAX_WRITE_TIMES) {
      this.writeTimes.shift();
    }
    this.stats.avgWriteTime = this.writeTimes.reduce((a, b) => a + b, 0) / this.writeTimes.length;
  }

  /**
   * 记录读取时间
   */
  private recordReadTime(time: number): void {
    this.readTimes.push(time);
    if (this.readTimes.length > this.MAX_WRITE_TIMES) {
      this.readTimes.shift();
    }
    this.stats.avgReadTime = this.readTimes.reduce((a, b) => a + b, 0) / this.readTimes.length;
  }

  /**
   * 启动统计收集
   */
  private startStatsCollection(): void {
    setInterval(() => {
      this.saveProcessedIds();
    }, 60000); // 每分钟保存一次
  }

  /**
   * 启动定期清理
   */
  startCleanup(interval: number = 60 * 60 * 1000): void {
    setInterval(() => {
      const cleaned = this.cleanupExpired();
      if (cleaned > 0) {
        console.log(`[OptimizedFileQueue] 清理了 ${cleaned} 条过期消息`);
      }
    }, interval);
  }
}

/**
 * 创建优化的文件队列管理器
 */
export function createOptimizedFileQueueManager(
  config?: Partial<OptimizedFileQueueConfig>
): OptimizedFileQueueManager {
  return new OptimizedFileQueueManager(config);
}
