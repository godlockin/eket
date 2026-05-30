/**
 * EKET Framework - State Reconciler (TASK-Y01)
 *
 * WAL/Raft 消息重放与多级状态对齐机制：
 * 当连接管理器从文件队列降级模式恢复（升级到 SQLite/Redis）时，
 * 扫描本地待处理消息文件，进行严格时序排序与幂等回放。
 *
 * 验收标准：
 * - AC-1: 自动重连检测 - 检测到连接状态升级时触发 WAL 重放
 * - AC-2: 严格时序消息回放 - 按 timestamp 属性由早到晚严格排序
 * - AC-3: 幂等性去重校验 - 根据消息 ID 去重，防范重复写入
 * - AC-4: 归一化与清理 - 重放成功后删除 .msg/.json 文件
 */

import * as fs from 'fs';
import * as path from 'path';
import { EventEmitter } from 'events';

import type { Result, Message } from '../types/index.js';
import { EketError, EketErrorCode } from '../types/index.js';

import type { MessageQueue } from './message-queue.js';
import type { SQLiteManager } from './sqlite-manager.js';

/**
 * 连接级别类型（与 ConnectionManager 保持一致）
 */
export type ConnectionLevel = 'file' | 'sqlite' | 'local_redis' | 'remote_redis';

/**
 * 重放结果统计
 */
export interface ReconcileStats {
  totalScanned: number;
  replayed: number;
  skippedDuplicate: number;
  failed: number;
  startTime: number;
  endTime: number;
  durationMs: number;
}

export interface ReconciledMessage {
  id: string;
  filePath: string;
  timestamp: number;
  channel: string;
  data: ReconciledMessageData;
  type: 'json' | 'msg';
}

/** Loose structure for parsed file messages */
interface ReconciledMessageData {
  id?: string;
  timestamp?: string | number;
  _channel?: string;
  _enqueue_time?: number;
  command?: string;
  from?: string;
  to?: string;
  type?: string;
  payload?: unknown;
  ticketId?: string;
  title?: string;
  status?: string;
  priority?: number;
  assignee?: string | null;
  claimedAt?: string | null;
  createdAt?: string;
  [key: string]: unknown;
}

/**
 * StateReconciler 事件类型
 */
export interface StateReconcilerEvents {
  'reconcile:start': () => void;
  'reconcile:complete': (stats: ReconcileStats) => void;
  'reconcile:error': (error: Error) => void;
  'message:replayed': (msg: ReconciledMessage) => void;
  'message:skipped': (msg: ReconciledMessage, reason: string) => void;
  'connection:upgraded': (from: ConnectionLevel, to: ConnectionLevel) => void;
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

export class StateReconciler extends EventEmitter {
  private queueDir: string;
  private db: SQLiteManager | null;
  private mq: MessageQueue | null;
  private currentLevel: ConnectionLevel = 'file';
  private isReconciling: boolean = false;
  private lastReconcileStats: ReconcileStats | null = null;

  constructor(queueDir?: string, db?: SQLiteManager | null, mq?: MessageQueue | null) {
    super();
    const projectRoot = findProjectRootSync();
    this.queueDir = queueDir || path.join(projectRoot, '.eket', 'data', 'queue');
    this.db = db || null;
    this.mq = mq || null;
  }

  /**
   * AC-1: 监听连接状态升级，自动触发 WAL 重放
   * 当连接从 'file' 升级到 'sqlite'/'local_redis'/'remote_redis' 时触发
   */
  onConnectionUpgrade(from: ConnectionLevel, to: ConnectionLevel): void {
    const levelPriority: Record<ConnectionLevel, number> = {
      'file': 0,
      'sqlite': 1,
      'local_redis': 2,
      'remote_redis': 3,
    };

    // 检测是否为升级（从低级到高级）
    if (levelPriority[to] > levelPriority[from]) {
      console.log(`[StateReconciler] 检测到连接升级: ${from} -> ${to}，触发 WAL 重放`);
      this.currentLevel = to;
      this.emit('connection:upgraded', from, to);

      // 异步触发重放，不阻塞调用方
      this.reconcile().catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[StateReconciler] 自动重放失败: ${message}`);
        this.emit('reconcile:error', new Error(message));
      });
    }
  }

  /**
   * 更新依赖客户端（用于连接升级后更新）
   */
  updateClients(db: SQLiteManager | null, mq: MessageQueue | null): void {
    this.db = db;
    this.mq = mq;
  }

  /**
   * 获取最后一次重放统计
   */
  getLastReconcileStats(): ReconcileStats | null {
    return this.lastReconcileStats;
  }

  /**
   * 检查是否正在重放
   */
  isInProgress(): boolean {
    return this.isReconciling;
  }

  /**
   * 触发自动对齐回放
   * AC-2: 严格时序消息回放
   * AC-3: 幂等性去重校验
   * AC-4: 归一化与清理
   */
  async reconcile(): Promise<Result<number>> {
    if (this.isReconciling) {
      console.log('[StateReconciler] 重放已在进行中，跳过');
      return { success: true, data: 0 };
    }

    const startTime = Date.now();
    console.log(`[StateReconciler] 启动数据对齐流程，扫描目录: ${this.queueDir}`);

    if (!fs.existsSync(this.queueDir)) {
      return { success: true, data: 0 };
    }

    const stats: ReconcileStats = {
      totalScanned: 0,
      replayed: 0,
      skippedDuplicate: 0,
      failed: 0,
      startTime,
      endTime: 0,
      durationMs: 0,
    };

    try {
      this.isReconciling = true;
      this.emit('reconcile:start');

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
          f !== 'processed.json.bak' &&
          !f.includes('.tmp.')
      );

      stats.totalScanned = msgFiles.length;

      if (msgFiles.length === 0) {
        this.releaseReconcileLock();
        stats.endTime = Date.now();
        stats.durationMs = stats.endTime - stats.startTime;
        this.lastReconcileStats = stats;
        this.emit('reconcile:complete', stats);
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
          let messageData: ReconciledMessageData = parsed as ReconciledMessageData;
          const fileType: 'json' | 'msg' = file.endsWith('.msg') ? 'msg' : 'json';

          if (fileType === 'msg') {
            // Shell fallback 写入的格式：{ command, args, timestamp, status }
            id = `shell_fallback_${path.basename(file, '.msg')}`;
            timestamp = parsed.timestamp ? new Date(parsed.timestamp).getTime() : Date.now();
            channel = 'commands';
          } else {
            // OptimizedFileQueueManager v2 格式
            if (parsed.metadata && parsed.metadata.version === 2) {
              const wrapper = parsed;
              messageData = wrapper.message as ReconciledMessageData;
              id = messageData.id || `v2_msg_${Date.now()}`;
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
          stats.failed++;
        }
      }

      // 4. AC-2: 按时间戳从早到晚进行严格物理排序
      reconciledMsgs.sort((a, b) => a.timestamp - b.timestamp);

      // 5. 逐个执行幂等回放与对齐
      for (const msg of reconciledMsgs) {
        try {
          // AC-3: 幂等性校验：如果该消息已经处理过，直接删除文件
          const isDup = await this.checkDuplicate(msg.id);
          console.log('[StateReconciler Debug] Replaying message ID:', msg.id, 'Duplicate:', isDup);
          if (isDup) {
            // AC-4: 清理重复消息文件
            fs.unlinkSync(msg.filePath);
            stats.skippedDuplicate++;
            this.emit('message:skipped', msg, 'duplicate');
            continue;
          }

          // 执行回放：发布到高级 MQ (例如 Redis) 或存入 SQLite
          const replayed = await this.replayMessage(msg);
          console.log('[StateReconciler Debug] Replayed:', replayed);
          if (replayed) {
            stats.replayed++;
            // AC-4: 归档或删除已处理的降级文件，保持目录整洁
            fs.unlinkSync(msg.filePath);
            // 标记为已处理，防止重启后重复处理
            this.markAsProcessed(msg.id);
            this.emit('message:replayed', msg);
          } else {
            stats.failed++;
          }
        } catch (err) {
          console.error(`[StateReconciler] 消息 ${msg.id} 回放失败: ${err}`);
          stats.failed++;
        }
      }

      this.releaseReconcileLock();

      stats.endTime = Date.now();
      stats.durationMs = stats.endTime - stats.startTime;
      this.lastReconcileStats = stats;

      console.log(`[StateReconciler] 数据对齐完成，共成功重放 ${stats.replayed} 条历史降级消息。`);
      console.log(`[StateReconciler] 统计: 扫描=${stats.totalScanned}, 重放=${stats.replayed}, 跳过=${stats.skippedDuplicate}, 失败=${stats.failed}, 耗时=${stats.durationMs}ms`);

      this.emit('reconcile:complete', stats);
      return { success: true, data: stats.replayed };
    } catch (err: unknown) {
      this.releaseReconcileLock();
      const message = err instanceof Error ? err.message : String(err);
      const error = new EketError(EketErrorCode.QUEUE_ERROR, `对齐恢复失败: ${message}`);

      stats.endTime = Date.now();
      stats.durationMs = stats.endTime - stats.startTime;
      this.lastReconcileStats = stats;

      this.emit('reconcile:error', error);
      return {
        success: false,
        error,
      };
    } finally {
      this.isReconciling = false;
    }
  }

  /**
   * AC-3: 检查消息是否已处理（幂等性校验）
   * 支持多级校验：processed.json -> SQLite message_history
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
        if (result.success && result.data) {
          return true;
        }
      } catch {
        // 忽略错误
      }
    }

    return false;
  }

  /**
   * 标记消息为已处理（写入 processed.json）
   */
  private markAsProcessed(messageId: string): void {
    const indexPath = path.join(this.queueDir, 'processed.json');
    try {
      let data: { ids: string[]; updated: string } = { ids: [], updated: '' };
      if (fs.existsSync(indexPath)) {
        try {
          data = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
        } catch {
          data = { ids: [], updated: '' };
        }
      }

      if (!data.ids.includes(messageId)) {
        data.ids.push(messageId);
        // 只保留最近 10000 条
        if (data.ids.length > 10000) {
          data.ids = data.ids.slice(-10000);
        }
        data.updated = new Date().toISOString();
        fs.writeFileSync(indexPath, JSON.stringify(data, null, 2));
      }
    } catch (err) {
      console.warn(`[StateReconciler] 标记消息已处理失败: ${err}`);
    }
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
      // Cast to Message - file queue messages may be incomplete but MQ handles gracefully
      const pubResult = await this.mq.publish(msg.channel, msg.data as unknown as Message);
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
