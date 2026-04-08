/**
 * Data Deletion API - GDPR Right to Erasure (被遗忘权)
 *
 * 实现 GDPR 第 17 条规定的数据删除权，允许用户请求删除其个人数据。
 *
 * 端点：
 * - POST /api/data-deletion - 按 agentId 删除所有个人数据
 *
 * 删除范围：
 * - 邮箱文件 (~/.eket/data/inboxes/{agentId}.json)
 * - 队列消息 (已处理记录中的相关消息)
 * - 审计日志 (标记为已删除)
 * - 心跳记录 (Redis 中的相关数据)
 *
 * @module DataDeletionApi
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as http from 'http';
import * as path from 'path';

import { createRedisClient } from '../core/redis-client.js';
import { createSQLiteManager } from '../core/sqlite-manager.js';
import type { Result } from '../types/index.js';
import { EketErrorClass } from '../types/index.js';

// ============================================================================
// 类型定义
// ============================================================================

/**
 * 数据删除请求
 */
export interface DataDeletionRequest {
  /** Agent ID */
  agentId: string;
  /** 请求原因（可选） */
  reason?: string;
  /** 请求者 ID（用于审计） */
  requestedBy: string;
  /** 请求时间戳 */
  timestamp: string;
}

/**
 * 数据删除响应
 */
export interface DataDeletionResponse {
  /** 是否成功 */
  success: boolean;
  /** Agent ID */
  agentId: string;
  /** 删除的数据项详情 */
  deleted: {
    /** 邮箱文件是否删除 */
    inboxFile: boolean;
    /** 队列消息数量 */
    queueMessages: number;
    /** 审计日志数量 */
    auditLogs: number;
    /** 心跳记录是否删除 */
    heartbeatRecords: boolean;
  };
  /** 删除时间戳 */
  deletedAt: string;
  /** 删除操作 ID（用于审计追踪） */
  deletionId: string;
}

/**
 * 删除统计信息
 */
export interface DeletionStats {
  /** 总删除请求数 */
  totalRequests: number;
  /** 成功删除数 */
  successfulDeletions: number;
  /** 失败删除数 */
  failedDeletions: number;
  /** 最后删除时间 */
  lastDeletionAt?: string;
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
  // 不允许包含路径分隔符或特殊字符
  if (/[\/\\]/.test(agentId)) {
    return false;
  }
  // 只允许字母、数字、下划线、连字符
  if (!/^[a-zA-Z0-9_-]+$/.test(agentId)) {
    return false;
  }
  return true;
}

/**
 * 生成删除操作 ID
 */
function generateDeletionId(): string {
  return `del_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
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
 * 安全删除文件（如果存在）
 */
async function safeDeleteFile(filePath: string): Promise<boolean> {
  try {
    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath);
      return true;
    }
    return false;
  } catch (error) {
    console.error(`[DataDeletion] Failed to delete file ${filePath}:`, error);
    return false;
  }
}

// ============================================================================
// 数据删除服务
// ============================================================================

/**
 * 数据删除服务类
 */
export class DataDeletionService {
  private redisClient: ReturnType<typeof createRedisClient>;
  private sqliteClient: ReturnType<typeof createSQLiteManager>;
  private deletionStats: DeletionStats = {
    totalRequests: 0,
    successfulDeletions: 0,
    failedDeletions: 0,
  };

  constructor() {
    this.redisClient = createRedisClient();
    this.sqliteClient = createSQLiteManager({ useWorker: false });
  }

  /**
   * 执行数据删除操作
   *
   * @param request - 数据删除请求
   * @returns 删除结果
   */
  async executeDeletion(request: DataDeletionRequest): Promise<Result<DataDeletionResponse>> {
    const deletionId = generateDeletionId();
    const deletedAt = new Date().toISOString();

    // 验证 Agent ID
    if (!validateAgentId(request.agentId)) {
      return {
        success: false,
        error: new EketErrorClass(
          'INVALID_AGENT_ID',
          `Invalid agentId: ${request.agentId}. AgentId must contain only letters, numbers, underscores, or hyphens.`
        ),
      };
    }

    this.deletionStats.totalRequests++;

    const deletionResult = {
      inboxFile: false,
      queueMessages: 0,
      auditLogs: 0,
      heartbeatRecords: false,
    };

    try {
      // 1. 删除邮箱文件
      const inboxPath = getInboxPath(request.agentId);
      deletionResult.inboxFile = await safeDeleteFile(inboxPath);
      if (deletionResult.inboxFile) {
        console.log(`[DataDeletion] Deleted inbox file: ${inboxPath}`);
      }

      // 2. 删除队列消息
      deletionResult.queueMessages = await this.deleteQueueMessages(request.agentId);
      if (deletionResult.queueMessages > 0) {
        console.log(
          `[DataDeletion] Deleted ${deletionResult.queueMessages} queue messages for ${request.agentId}`
        );
      }

      // 3. 标记审计日志为已删除
      deletionResult.auditLogs = await this.markAuditLogsAsDeleted(request.agentId, deletionId);
      if (deletionResult.auditLogs > 0) {
        console.log(
          `[DataDeletion] Marked ${deletionResult.auditLogs} audit logs as deleted for ${request.agentId}`
        );
      }

      // 4. 删除心跳记录（Redis）
      deletionResult.heartbeatRecords = await this.deleteHeartbeatRecords(request.agentId);
      if (deletionResult.heartbeatRecords) {
        console.log(`[DataDeletion] Deleted heartbeat records for ${request.agentId}`);
      }

      // 5. 记录删除操作到审计日志
      await this.logDeletionAudit(request, deletionId, deletionResult);

      // 更新统计
      this.deletionStats.successfulDeletions++;
      this.deletionStats.lastDeletionAt = deletedAt;

      const response: DataDeletionResponse = {
        success: true,
        agentId: request.agentId,
        deleted: deletionResult,
        deletedAt,
        deletionId,
      };

      return { success: true, data: response };
    } catch (error) {
      this.deletionStats.failedDeletions++;
      console.error('[DataDeletion] Deletion error:', error);
      return {
        success: false,
        error: new EketErrorClass(
          'DELETION_FAILED',
          `Failed to delete data for agent ${request.agentId}: ${(error as Error).message}`
        ),
      };
    }
  }

  /**
   * 删除队列中的相关消息
   */
  private async deleteQueueMessages(agentId: string): Promise<number> {
    const queueDir = getQueueDir();
    let deletedCount = 0;

    try {
      if (!fs.existsSync(queueDir)) {
        return 0;
      }

      const files = await fs.promises.readdir(queueDir);
      const messageFiles = files.filter((f) => f.endsWith('.json') && f !== 'processed.json');

      for (const file of messageFiles) {
        const filepath = path.join(queueDir, file);
        try {
          const content = await fs.promises.readFile(filepath, 'utf-8');
          const message = JSON.parse(content) as { id?: string; from?: string; to?: string };

          // 检查是否与指定 agentId 相关
          if (message.from === agentId || message.to === agentId) {
            await fs.promises.unlink(filepath);
            deletedCount++;
          }
        } catch {
          // 忽略损坏的文件
        }
      }

      // 清理 processed.json 中的相关记录
      await this.cleanProcessedMessages(agentId);
    } catch (error) {
      console.error('[DataDeletion] Queue deletion error:', error);
    }

    return deletedCount;
  }

  /**
   * 清理已处理消息记录中的相关条目
   */
  private async cleanProcessedMessages(agentId: string): Promise<void> {
    const processedPath = path.join(getQueueDir(), 'processed.json');
    try {
      if (fs.existsSync(processedPath)) {
        const content = await fs.promises.readFile(processedPath, 'utf-8');
        const data = JSON.parse(content) as { ids: string[] };

        // 移除与 agentId 相关的消息 ID（假设消息 ID 包含 agentId）
        const filteredIds = data.ids.filter((id) => !id.includes(agentId));

        if (filteredIds.length !== data.ids.length) {
          await fs.promises.writeFile(
            processedPath,
            JSON.stringify({ ids: filteredIds, updated: new Date().toISOString() }),
            'utf-8'
          );
        }
      }
    } catch (error) {
      console.error('[DataDeletion] Processed messages cleanup error:', error);
    }
  }

  /**
   * 标记审计日志为已删除
   */
  private async markAuditLogsAsDeleted(agentId: string, deletionId: string): Promise<number> {
    try {
      // 连接 SQLite
      const result = await this.sqliteClient.connect();
      if (!result.success) {
        console.warn('[DataDeletion] SQLite not connected, skipping audit log marking');
        return 0;
      }

      // 检查审计日志表是否存在
      const tableResult = await this.sqliteClient.get(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='audit_logs'"
      );

      if (!tableResult.success || !tableResult.data) {
        return 0;
      }

      // 标记相关审计日志为已删除（软删除，保留审计追踪）
      const safeAgentId = agentId.replace(/'/g, "''");
      const safeDeletionId = deletionId.replace(/'/g, "''");
      const updateSql = `
        UPDATE audit_logs
        SET deleted = 1, deletion_id = '${safeDeletionId}', deleted_at = '${new Date().toISOString()}'
        WHERE agent_id = '${safeAgentId}'
      `;

      const db = this.sqliteClient.getDB();
      if (!db) {
        return 0;
      }

      const stmt = db.prepare(updateSql);
      const stmtInfo = stmt.run();

      return stmtInfo.changes;
    } catch (error) {
      console.error('[DataDeletion] Audit log marking error:', error);
      return 0;
    }
  }

  /**
   * 删除 Redis 中的心跳记录
   */
  private async deleteHeartbeatRecords(agentId: string): Promise<boolean> {
    try {
      const redisResult = await this.redisClient.connect();
      if (!redisResult.success) {
        console.warn('[DataDeletion] Redis not connected, skipping heartbeat deletion');
        return false;
      }

      const client = this.redisClient.getClient();
      if (!client) {
        return false;
      }

      // 删除心跳 key
      const heartbeatKey = `eket:heartbeat:${agentId}`;
      await client.del(heartbeatKey);

      // 从活跃 Slaver 集合中移除
      await client.srem('eket:active_slavers', agentId);

      return true;
    } catch (error) {
      console.error('[DataDeletion] Heartbeat deletion error:', error);
      return false;
    }
  }

  /**
   * 记录删除操作到审计日志
   */
  private async logDeletionAudit(
    request: DataDeletionRequest,
    deletionId: string,
    result: {
      inboxFile: boolean;
      queueMessages: number;
      auditLogs: number;
      heartbeatRecords: boolean;
    }
  ): Promise<void> {
    try {
      const auditEntry = {
        id: `audit_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`,
        timestamp: new Date().toISOString(),
        action: 'DATA_DELETION',
        agentId: request.agentId,
        requestedBy: request.requestedBy,
        reason: request.reason || 'GDPR erasure request',
        deletionId,
        deletedItems: result,
        status: 'completed',
      };

      // 尝试写入 SQLite 审计表
      const sqliteResult = await this.sqliteClient.connect();
      if (sqliteResult.success) {
        try {
          const insertSql = `
            INSERT OR REPLACE INTO audit_logs (id, timestamp, action, agent_id, requested_by, reason, deletion_id, deleted_items, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `;
          const stmt = this.sqliteClient.getDB()!.prepare(insertSql);
          stmt.run(
            auditEntry.id,
            auditEntry.timestamp,
            auditEntry.action,
            auditEntry.agentId,
            auditEntry.requestedBy,
            auditEntry.reason,
            auditEntry.deletionId,
            JSON.stringify(auditEntry.deletedItems),
            auditEntry.status
          );
        } catch (error) {
          console.error('[DataDeletion] Failed to write audit log:', error);
        }
      }
    } catch (error) {
      console.error('[DataDeletion] Audit logging error:', error);
    }
  }

  /**
   * 获取删除统计信息
   */
  getStats(): DeletionStats {
    return { ...this.deletionStats };
  }

  /**
   * 清理资源
   */
  async destroy(): Promise<void> {
    await this.redisClient.disconnect();
    await this.sqliteClient.close();
  }
}

// ============================================================================
// HTTP 请求处理器
// ============================================================================

/**
 * 创建数据删除 API 请求处理器
 *
 * @param service - 数据删除服务实例
 * @returns HTTP 请求处理函数
 */
export function createDataDeletionHandler(
  service: DataDeletionService
): (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void> {
  return async (req: http.IncomingMessage, res: http.ServerResponse): Promise<void> => {
    // 只接受 POST 请求
    if (req.method !== 'POST') {
      res.writeHead(405, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Method not allowed. Use POST.' }));
      return;
    }

    // 读取请求体
    let body = '';
    for await (const chunk of req) {
      body += chunk.toString();
    }

    try {
      const request = JSON.parse(body) as DataDeletionRequest;

      // 验证必填字段
      if (!request.agentId) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing required field: agentId' }));
        return;
      }

      if (!request.requestedBy) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing required field: requestedBy' }));
        return;
      }

      // 执行删除
      const result = await service.executeDeletion(request);

      if (result.success) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result.data));
      } else {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: result.error?.message }));
      }
    } catch (error) {
      console.error('[DataDeletion] Handler error:', error);
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
 * 创建数据删除服务实例
 */
export function createDataDeletionService(): DataDeletionService {
  return new DataDeletionService();
}
