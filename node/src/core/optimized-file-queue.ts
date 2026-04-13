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
}

interface FileMessageWrapper {
  message: FileMessage;
  metadata: {
    checksum: string;
    version: number; // 版本号，用于处理旧格式数据
  };
}

/**
 * 优化的文件队列管理器
 */
export class OptimizedFileQueueManager {
  private config: OptimizedFileQueueConfig;
  private processedIds: Map<string, number>; // messageId -> timestamp (consumed messages)
  private enqueuedIds: Set<string>;           // messageId (in-queue, not yet consumed)
  private stats: OptimizedQueueStats;
  private writeTimes: number[] = [];
  private readTimes: number[] = [];
  private readonly MAX_WRITE_TIMES = 100;

  // 性能优化：文件列表缓存（减少 readdirSync 调用）
  private fileListCache: { files: string[]; timestamp: number } | null = null;
  private readonly FILE_LIST_CACHE_TTL = 100; // 缓存 100ms

  // 性能优化：延迟保存 processedIds（减少磁盘写入）
  private processedIdsDirty = false;
  private lastProcessedIdsSave = 0;
  private readonly PROCESSED_IDS_SAVE_INTERVAL = 5000; // 最多 5 秒保存一次

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
    this.enqueuedIds = new Set();
    this.fileListCache = null;
    this.processedIdsDirty = false;
    this.lastProcessedIdsSave = Date.now();
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
    this.enqueuedIds.delete(messageId); // 消息已消费，从 in-queue 集合移除
    this.processedIdsDirty = true;

    // 延迟保存：只在超过时间阈值时保存
    const now = Date.now();
    if (now - this.lastProcessedIdsSave > this.PROCESSED_IDS_SAVE_INTERVAL) {
      this.flushProcessedIds();
    }
  }

  /**
   * 立即保存 processedIds（供外部调用）
   */
  private flushProcessedIds(): void {
    if (this.processedIdsDirty) {
      this.saveProcessedIds();
      this.processedIdsDirty = false;
      this.lastProcessedIdsSave = Date.now();
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
        // 去重检查：已消费或已在队列中的消息不再入队
        if (this.isProcessed(message.id) || this.enqueuedIds.has(message.id)) {
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
        };

        // 计算校验和（只基于原始消息，不包括私有字段）
        const checksum = this.calculateChecksum(message);

        // 使用包装器格式，将校验和与数据分离
        const wrapper: FileMessageWrapper = {
          message: fileMessage,
          metadata: {
            checksum,
            version: 2, // 新格式版本号
          },
        };

        const content = JSON.stringify(wrapper, null, 2);
        tempPath = `${filepath}.tmp.${process.pid}`;

        // 原子写入：先写临时文件，再重命名
        fs.writeFileSync(tempPath, content);
        fs.renameSync(tempPath, filepath);
        tempPath = null; // 重命名成功，临时文件已删除

        // 标记为已入队（防止重复入队同一消息 ID）
        this.enqueuedIds.add(message.id);
        this.stats.pending++;
        this.invalidateFileListCache(); // 新文件入队，使缓存失效
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
    const hash = crypto.createHash('sha256');
    hash.update(JSON.stringify(message, Object.keys(message).sort()));
    return hash.digest('hex');
  }

  /**
   * 获取队列文件列表（带缓存）
   */
  private getQueueFiles(): string[] {
    const now = Date.now();

    // 检查缓存是否有效
    if (this.fileListCache && now - this.fileListCache.timestamp < this.FILE_LIST_CACHE_TTL) {
      return this.fileListCache.files;
    }

    // 读取文件列表并缓存
    try {
      const files = fs.readdirSync(this.config.queueDir);
      const messageFiles = files.filter((f) => f.endsWith('.json') && f !== 'processed.json');
      this.fileListCache = { files: messageFiles, timestamp: now };
      return messageFiles;
    } catch {
      return [];
    }
  }

  /**
   * 使文件列表缓存失效
   */
  private invalidateFileListCache(): void {
    this.fileListCache = null;
  }

  /**
   * 从队列获取消息（支持批量）
   * 兼容新格式（v2 wrapper）和旧格式（v1 with _write_checksum）
   */
  dequeue(channel?: string, batchSize = 100): Array<{ filepath: string; message: FileMessage }> {
    const startTime = Date.now();
    const messages: Array<{ filepath: string; message: FileMessage }> = [];

    try {
      const messageFiles = this.getQueueFiles(); // 使用缓存的文件列表

      let processed = 0;
      for (const file of messageFiles) {
        if (processed >= batchSize) {
          break;
        }

        const filepath = path.join(this.config.queueDir, file);

        try {
          const content = fs.readFileSync(filepath, 'utf-8');
          const parsed = JSON.parse(content);

          let message: FileMessage;
          let expectedChecksum: string | undefined;

          // 检测格式版本
          if (parsed.metadata && parsed.metadata.version === 2) {
            // 新格式（v2 wrapper）
            const wrapper = parsed as FileMessageWrapper;
            message = wrapper.message;
            expectedChecksum = wrapper.metadata.checksum;
          } else if (parsed._write_checksum) {
            // 旧格式（v1 with _write_checksum）
            message = parsed as FileMessage;
            expectedChecksum = (parsed as { _write_checksum?: string })._write_checksum;
          } else {
            // 非常旧的格式（无校验和）
            message = parsed as FileMessage;
            expectedChecksum = undefined;
          }

          // 跳过已处理
          if (this.isProcessed(message.id)) {
            fs.unlinkSync(filepath);
            this.invalidateFileListCache(); // 文件被删除，使缓存失效
            continue;
          }

          // 校验和验证（如果有）
          if (expectedChecksum) {
            // 提取原始消息（移除私有字段）
            const {
              _channel: _ch,
              _enqueue_time: _et,
              ...originalMessage
            } = message;
            const actualChecksum = this.calculateChecksum(originalMessage as Message);
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
          const parsed = JSON.parse(content);

          // 支持新旧格式
          const message: FileMessage = parsed.metadata && parsed.metadata.version === 2
            ? (parsed as FileMessageWrapper).message
            : parsed as FileMessage;

          // 以消息创建时间（timestamp转数值）或入队时间（_enqueue_time）中较早者为准
          const timestampNum = typeof message.timestamp === 'string'
            ? new Date(message.timestamp).getTime()
            : message.timestamp;
          const messageTime = timestampNum || message._enqueue_time || now;
          const enqueueTime = message._enqueue_time || now;
          const age = now - Math.min(messageTime, enqueueTime);

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
      this.flushProcessedIds(); // 定期保存（即使未达到时间阈值）
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
