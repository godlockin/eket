/**
 * File Queue Manager
 * 文件队列持久化管理，支持消息去重、过期清理、历史归档
 */

import * as fs from 'fs';
import * as path from 'path';

import type { AuditLogger } from '../api/audit-logger.js';
import type { Message, Result } from '../types/index.js';
import { EketError } from '../types/index.js';

// ============================================================================
// 审计日志全局配置
// ============================================================================

/**
 * 全局审计日志实例（可选）
 */
let globalAuditLogger: AuditLogger | null = null;

/**
 * 设置全局审计日志实例
 */
export function setQueueAuditLogger(auditLogger: AuditLogger): void {
  globalAuditLogger = auditLogger;
}

/**
 * 记录数据访问审计日志
 */
async function logAccessAudit(
  action: 'READ' | 'WRITE' | 'DELETE',
  actor: string,
  channel: string,
  details?: Record<string, unknown>
): Promise<void> {
  if (!globalAuditLogger) {
    return;
  }

  try {
    await globalAuditLogger.log(
      `QUEUE_${action}`,
      actor,
      {
        channel,
        ...details,
      },
      `queue:${channel}`
    );
  } catch (error) {
    console.error('[FileQueue] Audit log error:', error);
  }
}

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
   * 加载已处理消息 ID（支持备份恢复）
   */
  private loadProcessedIds(): Result<void> {
    const result = this.restoreFromBackup();
    if (result.success) {
      return result;
    }
    // restoreFromBackup 已经将 processedIds 设为空集合
    return { success: true, data: undefined };
  }

  /**
   * 保存已处理消息 ID（双备份 + 原子写入）
   * 使用临时文件 + rename 模式确保原子性
   * 主备份：queue/processed.json
   * 冗余备份：queue/processed.json.bak
   */
  private saveProcessedIds(): Result<void> {
    const indexPath = path.join(this.config.queueDir, 'processed.json');
    const backupPath = path.join(this.config.queueDir, 'processed.json.bak');

    try {
      // 只保留最近 10000 条
      const ids = Array.from(this.processedIds).slice(-10000);
      const data = JSON.stringify({ ids, updated: new Date().toISOString() }, null, 2);

      // 步骤 1: 写入临时文件（原子写入）
      const tempPath = path.join(this.config.queueDir, `processed.json.tmp.${Date.now()}`);
      fs.writeFileSync(tempPath, data, { encoding: 'utf-8', flag: 'w' });
      fs.fsyncSync(fs.openSync(tempPath, 'r+')); // 确保数据落盘

      // 步骤 2: 备份现有文件（如果存在）
      if (fs.existsSync(indexPath)) {
        fs.copyFileSync(indexPath, backupPath);
      }

      // 步骤 3: 原子重命名临时文件到目标文件
      fs.renameSync(tempPath, indexPath);

      // 步骤 4: 确保主文件落盘
      const dirPath = path.dirname(indexPath);
      const dirFd = fs.openSync(dirPath, 'r');
      try {
        fs.fsyncSync(dirFd);
      } finally {
        fs.closeSync(dirFd);
      }

      // 步骤 5: 同步冗余备份
      if (fs.existsSync(backupPath)) {
        fs.copyFileSync(indexPath, backupPath);
      }

      return { success: true, data: undefined };
    } catch (err) {
      console.error('[FileQueue] 保存 processed.json 失败:', err);

      // 清理临时文件
      const tempPath = path.join(this.config.queueDir, `processed.json.tmp.${Date.now()}`);
      try {
        if (fs.existsSync(tempPath)) {
          fs.unlinkSync(tempPath);
        }
      } catch {
        // 忽略清理错误
      }

      // 尝试从备份恢复
      const backupPath = path.join(this.config.queueDir, 'processed.json.bak');
      if (fs.existsSync(backupPath)) {
        try {
          const backupData = fs.readFileSync(backupPath, 'utf-8');
          const backupIds = JSON.parse(backupData).ids || [];
          this.processedIds = new Set(backupIds);
          console.log('[FileQueue] 从备份恢复 processed.json 成功');
        } catch {
          console.warn('[FileQueue] 从备份恢复失败');
        }
      }

      return {
        success: false,
        error: new EketError('QUEUE_ERROR', '保存已处理 ID 失败'),
      };
    }
  }

  /**
   * 从备份恢复 processed.json
   */
  restoreFromBackup(): Result<void> {
    const indexPath = path.join(this.config.queueDir, 'processed.json');
    const backupPath = path.join(this.config.queueDir, 'processed.json.bak');

    // 优先从主文件恢复
    if (fs.existsSync(indexPath)) {
      try {
        const data = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
        this.processedIds = new Set(data.ids || []);
        console.log('[FileQueue] 从主文件加载 processed.json');
        return { success: true, data: undefined };
      } catch {
        console.warn('[FileQueue] 主文件损坏，尝试从备份恢复');
      }
    }

    // 从备份文件恢复
    if (fs.existsSync(backupPath)) {
      try {
        const data = JSON.parse(fs.readFileSync(backupPath, 'utf-8'));
        this.processedIds = new Set(data.ids || []);

        // 尝试修复主文件
        try {
          fs.copyFileSync(backupPath, indexPath);
          console.log('[FileQueue] 从备份恢复主文件成功');
        } catch {
          console.warn('[FileQueue] 修复主文件失败');
        }

        return { success: true, data: undefined };
      } catch {
        console.warn('[FileQueue] 备份文件也损坏，使用空集合');
      }
    }

    this.processedIds = new Set();
    return {
      success: false,
      error: new EketError('DATA_CORRUPTED', 'processed.json 和备份均损坏'),
    };
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
  async enqueue(channel: string, message: Message, actor?: string): Promise<Result<string>> {
    try {
      // 去重检查
      if (this.isProcessed(message.id)) {
        console.log(`[FileQueue] 跳过已处理消息：${message.id}`);
        return { success: false, error: new EketError('DUPLICATE_MESSAGE', '消息已处理') };
      }

      const filename = `${channel}_${message.id}_${Date.now()}.json`;
      const filepath = path.join(this.config.queueDir, filename);

      const fileMessage: FileMessage = {
        ...message,
        _channel: channel,
        _enqueue_time: Date.now(),
      };

      fs.writeFileSync(filepath, JSON.stringify(fileMessage, null, 2));

      // 记录审计日志
      await logAccessAudit('WRITE', actor || message.from || 'system', channel, {
        messageId: message.id,
        filepath,
      });

      return { success: true, data: filepath };
    } catch {
      console.error('[FileQueue] Enqueue error');
      return { success: false, error: new EketError('QUEUE_ERROR', '写入队列失败') };
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
    } catch {
      console.error('[FileQueue] Dequeue error');
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
      } catch {
        console.error(`[FileQueue] Process message ${message.id} error`);
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
    } catch {
      console.error('[FileQueue] Cleanup error');
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
        stats.archived = fs
          .readdirSync(this.config.archiveDir)
          .filter((f) => f.endsWith('.json')).length;
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
  exportHistory(options?: { startDate?: Date; endDate?: Date; channel?: string }): Message[] {
    const history: Message[] = [];
    const startDate = options?.startDate?.getTime() || 0;
    const endDate = options?.endDate?.getTime() || Date.now();

    // 从归档中读取
    if (fs.existsSync(this.config.archiveDir)) {
      const files = fs.readdirSync(this.config.archiveDir);

      for (const file of files) {
        if (!file.endsWith('.json')) {
          continue;
        }

        const filepath = path.join(this.config.archiveDir, file);

        try {
          const content = fs.readFileSync(filepath, 'utf-8');
          const message = JSON.parse(content) as Message & {
            _channel?: string;
            _enqueue_time?: number;
          };

          const time =
            message._enqueue_time ||
            (message.timestamp ? new Date(message.timestamp).getTime() : 0);
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
