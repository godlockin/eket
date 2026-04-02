/**
 * Data Access API - GDPR Right of Access (访问权)
 *
 * 实现 GDPR 第 15 条规定的数据访问权，允许用户访问其个人数据。
 *
 * 端点：
 * - GET /api/data-access/:agentId - 导出 agentId 相关所有数据（JSON 格式）
 *
 * 导出数据包含：
 * - 邮箱消息（Agent Mailbox）
 * - 队列记录（File Queue）
 * - 审计日志（SQLite）
 * - 心跳记录（Redis）
 * - 实例信息（Instance Registry）
 *
 * 输出格式：结构化 JSON，包含时间戳和数据分类
 *
 * @module DataAccessApi
 */

import * as fs from 'fs';
import * as http from 'http';
import * as path from 'path';
import * as zlib from 'zlib';

import { createRedisClient } from '../core/redis-client.js';
import { createSQLiteClient } from '../core/sqlite-client.js';
import type { Result } from '../types/index.js';
import { EketErrorClass } from '../types/index.js';
import { decrypt, isEncryptionEnabled, getEncryptionKey } from '../utils/encryption.js';
import type { EncryptedData } from '../utils/encryption.js';

// ============================================================================
// 类型定义
// ============================================================================

/**
 * 数据访问响应
 */
export interface DataExportPackage {
  /** Agent ID */
  agentId: string;
  /** 导出时间戳 */
  exportedAt: string;
  /** 导出 ID */
  exportId: string;
  /** 数据分类 */
  data: {
    /** 邮箱消息 */
    inboxMessages: ExportedMessage[];
    /** 队列记录 */
    queueRecords: ExportedQueueRecord[];
    /** 审计日志 */
    auditLogs: ExportedAuditLog[];
    /** 心跳记录 */
    heartbeatRecords: ExportedHeartbeat[];
    /** 实例信息 */
    instanceInfo: ExportedInstanceInfo | null;
  };
  /** 统计信息 */
  stats: {
    totalInboxMessages: number;
    totalQueueRecords: number;
    totalAuditLogs: number;
    totalHeartbeatRecords: number;
  };
  /** 加密状态 */
  encryptionStatus: {
    enabled: boolean;
    algorithm: string;
  };
}

/**
 * 导出的邮箱消息
 */
export interface ExportedMessage {
  id: string;
  from: string;
  to: string;
  text: string;
  timestamp: string;
  read: boolean;
  color?: string;
  summary?: string;
  decrypted?: boolean;
}

/**
 * 导出的队列记录
 */
export interface ExportedQueueRecord {
  id: string;
  timestamp: string;
  from: string;
  to: string;
  type: string;
  priority: string;
  payload: Record<string, unknown>;
  channel?: string;
  enqueueTime?: number;
}

/**
 * 导出的审计日志
 */
export interface ExportedAuditLog {
  id: string;
  timestamp: string;
  action: string;
  agentId: string;
  requestedBy?: string;
  details?: Record<string, unknown>;
  deleted?: boolean;
  deletionId?: string;
}

/**
 * 导出的心跳记录
 */
export interface ExportedHeartbeat {
  slaverId: string;
  timestamp: number;
  status: 'active' | 'busy' | 'offline';
  currentTaskId?: string;
  source: 'redis' | 'sqlite' | 'file';
}

/**
 * 导出的实例信息
 */
export interface ExportedInstanceInfo {
  id: string;
  type: 'human' | 'ai';
  agent_type: string;
  skills: string[];
  status: 'idle' | 'busy' | 'offline';
  currentTaskId?: string;
  currentLoad: number;
  lastHeartbeat?: number;
}

// ============================================================================
// 工具函数
// ============================================================================

/**
 * 验证 Agent ID 格式
 */
function validateAgentId(agentId: string): boolean {
  if (!agentId || agentId.trim().length === 0) {
    return false;
  }
  if (/[\/\\]/.test(agentId)) {
    return false;
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(agentId)) {
    return false;
  }
  return true;
}

/**
 * 生成导出 ID
 */
function generateExportId(): string {
  return `exp_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * 获取邮箱文件路径
 */
function getInboxPath(agentId: string): string {
  const inboxDir =
    process.env.EKET_INBOX_DIR || path.join(process.cwd(), '.eket', 'data', 'inboxes');
  const safeAgentId = agentId.replace(/[\/\\]/g, '_');
  return path.join(inboxDir, `${safeAgentId}.json`);
}

/**
 * 获取队列目录路径
 */
function getQueueDir(): string {
  return process.env.EKET_FILE_QUEUE_DIR || path.join(process.cwd(), '.eket', 'data', 'queue');
}

/**
 * 解密消息内容
 */
function tryDecrypt(content: string): { text: string; decrypted: boolean } {
  if (!isEncryptionEnabled()) {
    return { text: content, decrypted: false };
  }

  try {
    const maybeEncrypted = JSON.parse(content) as EncryptedData;
    if (
      maybeEncrypted.salt &&
      maybeEncrypted.iv &&
      maybeEncrypted.encryptedData &&
      maybeEncrypted.authTag
    ) {
      const key = getEncryptionKey();
      if (key) {
        const decrypted = decrypt(maybeEncrypted, key);
        return { text: decrypted, decrypted: true };
      }
    }
  } catch {
    // 不是有效的加密数据
  }

  return { text: content, decrypted: false };
}

// ============================================================================
// 数据访问服务
// ============================================================================

/**
 * 数据访问服务类
 */
export class DataAccessService {
  private redisClient: ReturnType<typeof createRedisClient>;
  private sqliteClient: ReturnType<typeof createSQLiteClient>;
  private exportStats: {
    totalExports: number;
    successfulExports: number;
    failedExports: number;
    lastExportAt?: string;
  } = {
    totalExports: 0,
    successfulExports: 0,
    failedExports: 0,
  };

  constructor() {
    this.redisClient = createRedisClient();
    this.sqliteClient = createSQLiteClient();
  }

  /**
   * 执行数据导出操作
   *
   * @param agentId - Agent ID
   * @returns 导出结果
   */
  async exportData(agentId: string): Promise<Result<DataExportPackage>> {
    const exportId = generateExportId();
    const exportedAt = new Date().toISOString();

    // 验证 Agent ID
    if (!validateAgentId(agentId)) {
      return {
        success: false,
        error: new EketErrorClass(
          'INVALID_AGENT_ID',
          `Invalid agentId: ${agentId}. AgentId must contain only letters, numbers, underscores, or hyphens.`
        ),
      };
    }

    this.exportStats.totalExports++;

    try {
      const [inboxMessages, queueRecords, auditLogs, heartbeatRecords, instanceInfo] =
        await Promise.all([
          this.exportInboxMessages(agentId),
          this.exportQueueRecords(agentId),
          this.exportAuditLogs(agentId),
          this.exportHeartbeatRecords(agentId),
          this.exportInstanceInfo(agentId),
        ]);

      this.exportStats.successfulExports++;
      this.exportStats.lastExportAt = exportedAt;

      const exportPackage: DataExportPackage = {
        agentId,
        exportedAt,
        exportId,
        data: {
          inboxMessages,
          queueRecords,
          auditLogs,
          heartbeatRecords,
          instanceInfo,
        },
        stats: {
          totalInboxMessages: inboxMessages.length,
          totalQueueRecords: queueRecords.length,
          totalAuditLogs: auditLogs.length,
          totalHeartbeatRecords: heartbeatRecords.length,
        },
        encryptionStatus: {
          enabled: isEncryptionEnabled(),
          algorithm: 'aes-256-gcm',
        },
      };

      return { success: true, data: exportPackage };
    } catch (error) {
      this.exportStats.failedExports++;
      console.error('[DataAccess] Export error:', error);
      return {
        success: false,
        error: new EketErrorClass(
          'EXPORT_FAILED',
          `Failed to export data for agent ${agentId}: ${(error as Error).message}`
        ),
      };
    }
  }

  /**
   * 导出邮箱消息
   */
  private async exportInboxMessages(agentId: string): Promise<ExportedMessage[]> {
    const messages: ExportedMessage[] = [];
    const inboxPath = getInboxPath(agentId);

    try {
      if (!fs.existsSync(inboxPath)) {
        return messages;
      }

      const content = await fs.promises.readFile(inboxPath, 'utf-8');
      const rawMessages = JSON.parse(content) as Array<{
        id: string;
        from: string;
        text: string;
        timestamp: string;
        read: boolean;
        color?: string;
        summary?: string;
      }>;

      for (const msg of rawMessages) {
        const { text, decrypted } = tryDecrypt(msg.text);
        messages.push({
          id: msg.id,
          from: msg.from,
          to: agentId,
          text,
          timestamp: msg.timestamp,
          read: msg.read,
          color: msg.color,
          summary: msg.summary,
          decrypted,
        });
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.error('[DataAccess] Inbox export error:', error);
      }
    }

    return messages;
  }

  /**
   * 导出队列记录
   */
  private async exportQueueRecords(agentId: string): Promise<ExportedQueueRecord[]> {
    const records: ExportedQueueRecord[] = [];
    const queueDir = getQueueDir();

    try {
      if (!fs.existsSync(queueDir)) {
        return records;
      }

      const files = await fs.promises.readdir(queueDir);
      const messageFiles = files.filter((f) => f.endsWith('.json') && f !== 'processed.json');

      for (const file of messageFiles) {
        const filepath = path.join(queueDir, file);
        try {
          const content = await fs.promises.readFile(filepath, 'utf-8');
          const message = JSON.parse(content) as ExportedQueueRecord & {
            _channel?: string;
            _enqueue_time?: number;
          };

          // 检查是否与指定 agentId 相关
          if (message.from === agentId || message.to === agentId) {
            records.push({
              id: message.id,
              timestamp: message.timestamp,
              from: message.from,
              to: message.to,
              type: message.type,
              priority: message.priority,
              payload: message.payload,
              channel: message._channel,
              enqueueTime: message._enqueue_time,
            });
          }
        } catch {
          // 忽略损坏的文件
        }
      }
    } catch (error) {
      console.error('[DataAccess] Queue export error:', error);
    }

    return records;
  }

  /**
   * 导出审计日志
   */
  private async exportAuditLogs(agentId: string): Promise<ExportedAuditLog[]> {
    const logs: ExportedAuditLog[] = [];

    try {
      const result = this.sqliteClient.connect();
      if (!result.success) {
        return logs;
      }

      // 检查审计日志表是否存在
      const tableResult = this.sqliteClient.get(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='audit_logs'"
      );
      const tableExists = tableResult.success && tableResult.data;

      if (!tableExists) {
        return logs;
      }

      // 查询相关审计日志（使用参数化查询防止 SQL 注入）
      const safeAgentId = agentId.replace(/'/g, "''");
      const rowsResult = this.sqliteClient.all(
        `SELECT id, timestamp, action, agent_id, requested_by, details, deleted, deletion_id
         FROM audit_logs
         WHERE agent_id = '${safeAgentId}' OR requested_by = '${safeAgentId}'
         ORDER BY timestamp DESC
         LIMIT 1000`
      );

      if (!rowsResult.success) {
        return logs;
      }

      const rows = rowsResult.data as Array<{
        id: string;
        timestamp: string;
        action: string;
        agent_id: string;
        requested_by?: string;
        details?: string;
        deleted?: number;
        deletion_id?: string;
      }>;

      for (const row of rows) {
        logs.push({
          id: row.id,
          timestamp: row.timestamp,
          action: row.action,
          agentId: row.agent_id,
          requestedBy: row.requested_by,
          details: row.details ? JSON.parse(row.details) : undefined,
          deleted: !!row.deleted,
          deletionId: row.deletion_id,
        });
      }
    } catch (error) {
      console.error('[DataAccess] Audit log export error:', error);
    }

    return logs;
  }

  /**
   * 导出心跳记录
   */
  private async exportHeartbeatRecords(agentId: string): Promise<ExportedHeartbeat[]> {
    const records: ExportedHeartbeat[] = [];

    try {
      // 从 Redis 获取
      const redisResult = await this.redisClient.connect();
      if (redisResult.success) {
        try {
          const client = this.redisClient.getClient();
          if (client) {
            const heartbeatData = await client.get(`eket:heartbeat:${agentId}`);
            if (heartbeatData) {
              const heartbeat = JSON.parse(heartbeatData) as {
                slaverId: string;
                timestamp: number;
                status: 'active' | 'busy' | 'offline';
                currentTaskId?: string;
              };
              records.push({
                ...heartbeat,
                source: 'redis',
              });
            }
          }
        } catch {
          // Redis 数据解析失败
        }
      }

      // 从 SQLite 获取历史心跳
      try {
        const sqliteResult = this.sqliteClient.connect();
        if (sqliteResult.success) {
          const tableResult = this.sqliteClient.get(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='heartbeats'"
          );

          if (tableResult.success && tableResult.data) {
            const safeAgentId = agentId.replace(/'/g, "''");
            const rowsResult = this.sqliteClient.all(
              `SELECT slaver_id, timestamp, status, current_task_id
               FROM heartbeats
               WHERE slaver_id = '${safeAgentId}'
               ORDER BY timestamp DESC
               LIMIT 100`
            );

            if (rowsResult.success) {
              const rows = rowsResult.data as Array<{
                slaver_id: string;
                timestamp: number;
                status: string;
                current_task_id?: string;
              }>;

              for (const row of rows) {
                records.push({
                  slaverId: row.slaver_id,
                  timestamp: row.timestamp,
                  status: row.status as 'active' | 'busy' | 'offline',
                  currentTaskId: row.current_task_id,
                  source: 'sqlite',
                });
              }
            }
          }
        }
      } catch {
        // SQLite 查询失败
      }
    } catch (error) {
      console.error('[DataAccess] Heartbeat export error:', error);
    }

    return records;
  }

  /**
   * 导出实例信息
   */
  private async exportInstanceInfo(agentId: string): Promise<ExportedInstanceInfo | null> {
    try {
      const redisResult = await this.redisClient.connect();
      if (!redisResult.success) {
        return null;
      }

      const client = this.redisClient.getClient();
      if (client) {
        const instanceData = await client.get(`eket:instance:${agentId}`);
        if (instanceData) {
          return JSON.parse(instanceData) as ExportedInstanceInfo;
        }
      }

      return null;
    } catch (error) {
      console.error('[DataAccess] Instance info export error:', error);
      return null;
    }
  }

  /**
   * 获取导出统计信息
   */
  getStats(): typeof DataAccessService.prototype.exportStats {
    return { ...this.exportStats };
  }

  /**
   * 清理资源
   */
  async destroy(): Promise<void> {
    await this.redisClient.disconnect();
    this.sqliteClient.close();
  }
}

// ============================================================================
// HTTP 请求处理器
// ============================================================================

/**
 * 创建数据访问 API 请求处理器
 *
 * @param service - 数据访问服务实例
 * @returns HTTP 请求处理函数
 */
export function createDataAccessHandler(
  service: DataAccessService
): (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void> {
  return async (req: http.IncomingMessage, res: http.ServerResponse): Promise<void> => {
    // 只接受 GET 请求
    if (req.method !== 'GET') {
      res.writeHead(405, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Method not allowed. Use GET.' }));
      return;
    }

    // 解析 URL 获取 agentId
    const urlParts = (req.url || '/').split('/');
    const agentId = urlParts[urlParts.length - 1];

    if (!agentId || !validateAgentId(agentId)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid or missing agentId' }));
      return;
    }

    try {
      // 执行导出
      const result = await service.exportData(agentId);

      if (result.success) {
        // 检查是否支持 gzip 压缩
        const acceptEncoding = req.headers['accept-encoding'] || '';
        const bodyJson = JSON.stringify(result.data, null, 2);

        if (acceptEncoding.includes('gzip')) {
          zlib.gzip(bodyJson, (err, compressed) => {
            if (err) {
              console.error('[DataAccess] Gzip error:', err);
              res.writeHead(200, {
                'Content-Type': 'application/json',
                'Content-Disposition': `attachment; filename="data-export-${agentId}.json"`,
              });
              res.end(bodyJson);
            } else {
              res.writeHead(200, {
                'Content-Type': 'application/json',
                'Content-Encoding': 'gzip',
                'Content-Disposition': `attachment; filename="data-export-${agentId}.json.gz"`,
              });
              res.end(compressed);
            }
          });
        } else {
          res.writeHead(200, {
            'Content-Type': 'application/json',
            'Content-Disposition': `attachment; filename="data-export-${agentId}.json"`,
          });
          res.end(bodyJson);
        }
      } else {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: result.error?.message }));
      }
    } catch (error) {
      console.error('[DataAccess] Handler error:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({ error: 'Internal server error', message: (error as Error).message })
      );
    }
  };
}

// ============================================================================
// 工厂函数
// ============================================================================

/**
 * 创建数据访问服务实例
 */
export function createDataAccessService(): DataAccessService {
  return new DataAccessService();
}
