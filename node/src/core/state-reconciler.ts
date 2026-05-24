/**
 * EKET Framework - State Reconciler (TASK-Y01)
 *
 * 自动对齐与消息重放机制：
 * 当连接管理器从文件队列降级模式恢复（升级到 SQLite/Redis）时，
 * 扫描本地待处理消息文件，进行严格时序排序与幂等回放。
 */

import * as fs from 'fs';
import * as path from 'path';

import type { Result, Message } from '../types/index.js';
import { EketError, EketErrorCode } from '../types/index.js';

import type { MessageQueue } from './message-queue.js';
import type { SQLiteManager } from './sqlite-manager.js';

export interface ReconciledMessage {
  id: string;
  filePath: string;
  timestamp: number;
  channel: string;
  data: Message | any;
  type: 'json' | 'msg';
}

function findProjectRootSync(): string {
  let current = process.cwd();
  while (current !== path.parse(current).root) {
    if (fs.existsSync(path.join(current, '.eket'))) {
      return current;
    }
    current = path.dirname(current);
  }
  return process.cwd();
}

export class StateReconciler {
  private queueDir: string;
  private db: SQLiteManager | null;
  private mq: MessageQueue | null;

  constructor(queueDir?: string, db?: SQLiteManager | null, mq?: MessageQueue | null) {
    const projectRoot = findProjectRootSync();
    this.queueDir = queueDir || path.join(projectRoot, '.eket', 'data', 'queue');
    this.db = db || null;
    this.mq = mq || null;
  }

  /**
   * 触发自动对齐回放
   */
  async reconcile(): Promise<Result<number>> {
    console.log(`[StateReconciler] 启动数据对齐流程，扫描目录: ${this.queueDir}`);
    
    if (!fs.existsSync(this.queueDir)) {
      return { success: true, data: 0 };
    }

    try {
      // 1. 获取分布式排它锁文件，防止多个实例同时进行重放冲突
      const lockAcquired = this.acquireReconcileLock();
      if (!lockAcquired) {
        console.log('[StateReconciler] 未获取到重放锁或已有重放任务在运行，跳过');
        return { success: true, data: 0 };
      }

      // 2. 扫描待对齐的 .json 与 .msg 消息文件
      const files = fs.readdirSync(this.queueDir);
      const msgFiles = files.filter(
        (f) =>
          (f.endsWith('.json') || f.endsWith('.msg')) &&
          f !== 'processed.json' &&
          !f.includes('.tmp.')
      );

      if (msgFiles.length === 0) {
        this.releaseReconcileLock();
        return { success: true, data: 0 };
      }

      console.log('[StateReconciler Debug] msgFiles found:', msgFiles);

      // 3. 解析消息并提取时间戳排序
      const reconciledMsgs: ReconciledMessage[] = [];
      for (const file of msgFiles) {
        const filePath = path.join(this.queueDir, file);
        try {
          const content = fs.readFileSync(filePath, 'utf-8');
          const parsed = JSON.parse(content);
          
          let id = '';
          let timestamp = Date.now();
          let channel = 'default';
          let messageData: any = parsed;
          let fileType: 'json' | 'msg' = file.endsWith('.msg') ? 'msg' : 'json';

          if (fileType === 'msg') {
            // Shell fallback 写入的格式：{ command, args, timestamp, status }
            id = `shell_fallback_${path.basename(file, '.msg')}`;
            timestamp = parsed.timestamp ? new Date(parsed.timestamp).getTime() : Date.now();
            channel = 'commands';
          } else {
            // OptimizedFileQueueManager v2 格式
            if (parsed.metadata && parsed.metadata.version === 2) {
              const wrapper = parsed;
              messageData = wrapper.message;
              id = messageData.id;
              channel = messageData._channel || 'default';
              timestamp = messageData.timestamp
                ? new Date(messageData.timestamp).getTime()
                : messageData._enqueue_time || Date.now();
            } else {
              // v1 格式
              id = parsed.id || `file_msg_${Date.now()}`;
              channel = parsed._channel || 'default';
              timestamp = parsed.timestamp
                ? new Date(parsed.timestamp).getTime()
                : parsed._enqueue_time || Date.now();
            }
          }

          reconciledMsgs.push({
            id,
            filePath,
            timestamp,
            channel,
            data: messageData,
            type: fileType,
          });
        } catch (err) {
          console.warn(`[StateReconciler] 解析消息文件失败: ${file}, 错误: ${err}`);
        }
      }

      // 4. 按时间戳从早到晚进行严格物理排序
      reconciledMsgs.sort((a, b) => a.timestamp - b.timestamp);

      // 5. 逐个执行幂等回放与对齐
      let replayedCount = 0;
      for (const msg of reconciledMsgs) {
        try {
          // 幂等性校验：如果该消息已经处理过，直接删除文件
          const isDup = await this.checkDuplicate(msg.id);
          console.log('[StateReconciler Debug] Replaying message ID:', msg.id, 'Duplicate:', isDup);
          if (isDup) {
            fs.unlinkSync(msg.filePath);
            continue;
          }

          // 执行回放：发布到高级 MQ (例如 Redis) 或存入 SQLite
          const replayed = await this.replayMessage(msg);
          console.log('[StateReconciler Debug] Replayed:', replayed);
          if (replayed) {
            replayedCount++;
            // 归档或删除已处理的降级文件，保持目录整洁
            fs.unlinkSync(msg.filePath);
          }
        } catch (err) {
          console.error(`[StateReconciler] 消息 ${msg.id} 回放失败: ${err}`);
        }
      }

      this.releaseReconcileLock();
      console.log(`[StateReconciler] 数据对齐完成，共成功重放 ${replayedCount} 条历史降级消息。`);
      return { success: true, data: replayedCount };
    } catch (err: any) {
      this.releaseReconcileLock();
      return {
        success: false,
        error: new EketError(EketErrorCode.QUEUE_ERROR, `对齐恢复失败: ${err.message}`),
      };
    }
  }

  /**
   * 检查消息是否已处理（幂等性校验）
   */
  private async checkDuplicate(messageId: string): Promise<boolean> {
    // 1. 检查文件队列自身的已处理列表 processed.json
    const indexPath = path.join(this.queueDir, 'processed.json');
    if (fs.existsSync(indexPath)) {
      try {
        const data = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
        const ids = data.ids || [];
        if (ids.includes(messageId)) {
          return true;
        }
      } catch {
        // 忽略错误
      }
    }

    // 2. 检查 SQLite message_history 中是否已经保存过此事务
    if (this.db) {
      try {
        const result = await this.db.get('SELECT id FROM message_history WHERE message_id = ?', [messageId]);
        if (result.success && result.data) return true;
      } catch {
        // 忽略错误
      }
    }

    return false;
  }

  /**
   * 执行单个消息重放
   */
  private async replayMessage(msg: ReconciledMessage): Promise<boolean> {
    if (msg.type === 'msg') {
      console.log(`[StateReconciler] 重放 Shell Fallback 命令: ${msg.data.command}`);
      if (this.db) {
        try {
          const result = await this.db.execute(
            'INSERT OR REPLACE INTO message_history (message_id, from_agent, to_agent, type, payload, created_at) VALUES (?, ?, ?, ?, ?, ?)',
            [msg.id, 'shell_fallback', 'all', 'shell_command', JSON.stringify(msg.data), new Date().toISOString()]
          );
          console.log('[StateReconciler Debug] memories execution result:', result);
          return result.success;
        } catch (err) {
          console.warn(`[StateReconciler] 写入 SQLite 失败: ${err}`);
        }
      }
      return true;
    }

    // 正常的 MQ 消息类型回放
    if (this.mq && this.mq.getMode() === 'redis') {
      console.log(`[StateReconciler] 重新发布降级消息到 Redis Channel: ${msg.channel}`);
      const pubResult = await this.mq.publish(msg.channel, msg.data);
      return pubResult.success;
    }

    // 如果 MQ 还是 file 模式，仅在本地 SQLite 做持久化对齐
    if (this.db) {
      try {
        console.log('[StateReconciler Debug] Replaying ticket to SQLite:', msg.data);
        
        // 1. 保存入消息历史
        await this.db.execute(
          'INSERT OR REPLACE INTO message_history (message_id, from_agent, to_agent, type, payload, created_at) VALUES (?, ?, ?, ?, ?, ?)',
          [
            msg.id,
            msg.data.from || 'file_queue',
            msg.data.to || 'all',
            msg.data.type || 'file_message',
            JSON.stringify(msg.data.payload || msg.data),
            new Date().toISOString()
          ]
        );

        // 2. 如果包含 ticket 属性，写入 tickets
        if (msg.data.ticketId) {
          const result = await this.db.execute(
            'INSERT OR REPLACE INTO tickets (id, title, status, priority, assignee, claimed_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [
              msg.data.ticketId,
              msg.data.title || '',
              msg.data.status || 'ready',
              typeof msg.data.priority === 'number' ? msg.data.priority : 0,
              msg.data.assignee || null,
              msg.data.claimedAt || null,
              msg.data.createdAt || new Date().toISOString()
            ]
          );
          console.log('[StateReconciler Debug] tickets execution result:', result);
          return result.success;
        }

        return true;
      } catch (err) {
        console.warn(`[StateReconciler] SQLite 对齐写入失败: ${err}`);
      }
    }

    return true;
  }

  /**
   * 获取对齐排它锁，防止并发重做
   */
  private acquireReconcileLock(): boolean {
    const lockPath = path.join(this.queueDir, 'reconcile.lock');
    if (fs.existsSync(lockPath)) {
      try {
        const content = fs.readFileSync(lockPath, 'utf-8');
        const pid = parseInt(content, 10);
        // 如果锁文件的进程依然存活，说明有其他重放任务，返回 false
        if (pid && this.isPidRunning(pid)) {
          return false;
        }
      } catch {
        // 忽略错误
      }
    }

    try {
      fs.writeFileSync(lockPath, process.pid.toString());
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 释放对齐锁
   */
  private releaseReconcileLock(): void {
    const lockPath = path.join(this.queueDir, 'reconcile.lock');
    if (fs.existsSync(lockPath)) {
      try {
        fs.unlinkSync(lockPath);
      } catch {
        // 忽略
      }
    }
  }

  private isPidRunning(pid: number): boolean {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }
}
