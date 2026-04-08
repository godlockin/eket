/**
 * Audit Logger with HMAC Signature Protection - SOC2 Compliance
 *
 * 实现 SOC2 要求的审计日志完整性保护：
 * - 每个日志条目包含 HMAC 签名
 * - 签名链（每个条目包含前一个条目的哈希）
 * - 验证函数检测篡改
 *
 * 安全特性：
 * - HMAC-SHA256 签名
 * - 链式哈希（blockchain-like）
 * - 防篡改检测
 * - 时间戳保护
 *
 * @module AuditLogger
 */

import * as crypto from 'crypto';
import * as path from 'path';

import { createSQLiteManager } from '../core/sqlite-manager.js';
import type { Result } from '../types/index.js';
import { EketErrorClass } from '../types/index.js';

// ============================================================================
// 类型定义
// ============================================================================

/**
 * 审计日志条目
 */
export interface AuditLogEntry {
  /** 日志 ID */
  id: string;
  /** 时间戳（ISO 8601） */
  timestamp: string;
  /** 操作类型 */
  action: string;
  /** 执行者（Agent ID 或用户 ID） */
  actor: string;
  /** 目标资源 */
  resource?: string;
  /** 操作详情 */
  details?: Record<string, unknown>;
  /** 前一个日志条目的哈希（签名链） */
  previousHash: string;
  /** 当前条目的哈希 */
  hash: string;
  /** HMAC 签名 */
  signature: string;
  /** 是否已删除（软删除标记） */
  deleted?: boolean;
  /** 删除时间 */
  deletedAt?: string;
  /** 删除操作 ID */
  deletionId?: string;
}

/**
 * 审计日志配置
 */
export interface AuditLoggerConfig {
  /** HMAC 签名密钥（从环境变量读取） */
  hmacSecretKey?: string;
  /** SQLite 数据库路径 */
  dbPath?: string;
  /** 是否启用文件备份 */
  enableBackup?: boolean;
  /** 备份目录 */
  backupDir?: string;
}

/**
 * 验证结果
 */
export interface VerificationResult {
  /** 是否通过验证 */
  valid: boolean;
  /** 验证的日志条目数量 */
  entriesCount: number;
  /** 无效的条目索引列表 */
  invalidIndices: number[];
  /** 验证详情 */
  details: {
    /** 第一个无效条目的索引 */
    firstInvalidIndex?: number;
    /** 验证失败原因 */
    failureReason?: 'signature_mismatch' | 'hash_chain_broken' | 'timestamp_invalid';
    /** 受影响的日志 ID */
    affectedLogId?: string;
  };
}

// ============================================================================
// 常量定义
// ============================================================================

const DEFAULT_HMAC_SECRET = 'eket-default-hmac-secret-DO-NOT-USE-IN-PRODUCTION';
const HASH_ALGORITHM = 'sha256';
const HMAC_ALGORITHM = 'sha256';

// ============================================================================
// 工具函数
// ============================================================================

/**
 * 计算数据的哈希
 */
function calculateHash(data: string): string {
  return crypto.createHash(HASH_ALGORITHM).update(data).digest('hex');
}

/**
 * 计算 HMAC 签名
 */
function calculateHmac(data: string, secretKey: string): string {
  return crypto.createHmac(HMAC_ALGORITHM, secretKey).update(data).digest('hex');
}

/**
 * 验证哈希格式
 */
function isValidHash(hash: string): boolean {
  return /^[a-f0-9]{64}$/.test(hash);
}

// ============================================================================
// 审计日志服务类
// ============================================================================

export class AuditLogger {
  private config: AuditLoggerConfig;
  private hmacSecretKey: string;
  private sqliteClient: ReturnType<typeof createSQLiteManager>;
  private lastHash: string | null = null;
  private initialized = false;

  constructor(config: AuditLoggerConfig = {}) {
    // 防御性配置拷贝
    this.config = {
      ...config,
      dbPath: config.dbPath || path.join(process.cwd(), '.eket', 'data', 'sqlite', 'eket.db'),
      enableBackup: config.enableBackup ?? false,
      backupDir: config.backupDir,
    };

    // 从环境变量获取密钥，如果没有则使用默认值（警告）
    const envKey = process.env.EKET_AUDIT_HMAC_SECRET;
    if (!envKey) {
      console.warn(
        '[AuditLogger] WARNING: EKET_AUDIT_HMAC_SECRET not set. Using default key (INSECURE). ' +
          'Set environment variable for production use.'
      );
      this.hmacSecretKey = DEFAULT_HMAC_SECRET;
    } else {
      this.hmacSecretKey = envKey;
    }

    this.sqliteClient = createSQLiteManager({ dbPath: this.config.dbPath, useWorker: false });
  }

  /**
   * 初始化审计日志系统
   */
  async initialize(): Promise<Result<void>> {
    try {
      const result = await await this.sqliteClient.connect();
      if (!result.success) {
        return result;
      }

      // 创建审计日志表
      await this.sqliteClient.execute(`
        CREATE TABLE IF NOT EXISTS audit_logs (
          id TEXT PRIMARY KEY,
          timestamp TEXT NOT NULL,
          action TEXT NOT NULL,
          actor TEXT NOT NULL,
          resource TEXT,
          details TEXT,
          previous_hash TEXT NOT NULL,
          hash TEXT NOT NULL,
          signature TEXT NOT NULL,
          deleted INTEGER DEFAULT 0,
          deleted_at TEXT,
          deletion_id TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // 创建索引
      await this.sqliteClient.execute(`
        CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs(actor);
        CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
        CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp);
        CREATE INDEX IF NOT EXISTS idx_audit_logs_deleted ON audit_logs(deleted);
      `);

      // 获取最后一个有效日志条目的哈希
      const lastResult = await this.sqliteClient.get(
        'SELECT hash FROM audit_logs WHERE deleted = 0 ORDER BY timestamp DESC LIMIT 1'
      );
      const lastRow = lastResult.success ? (lastResult.data as { hash: string }) : null;

      this.lastHash = lastRow?.hash || null;
      this.initialized = true;

      console.log('[AuditLogger] Initialized with HMAC signature protection');
      return { success: true, data: undefined };
    } catch (error) {
      console.error('[AuditLogger] Initialization error:', error);
      return {
        success: false,
        error: new EketErrorClass(
          'AUDIT_INIT_FAILED',
          `Failed to initialize audit logger: ${(error as Error).message}`
        ),
      };
    }
  }

  /**
   * 记录审计日志
   *
   * @param action - 操作类型
   * @param actor - 执行者
   * @param details - 操作详情
   * @param resource - 目标资源（可选）
   * @returns 日志条目
   */
  async log(
    action: string,
    actor: string,
    details?: Record<string, unknown>,
    resource?: string
  ): Promise<Result<AuditLogEntry>> {
    if (!this.initialized) {
      const initResult = await this.initialize();
      if (!initResult.success) {
        return initResult;
      }
    }

    try {
      const entry = this.createLogEntry(action, actor, details, resource);

      // 插入数据库
      const insertSql = `
        INSERT INTO audit_logs (id, timestamp, action, actor, resource, details, previous_hash, hash, signature)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      const stmt = this.sqliteClient.getDB()!.prepare(insertSql);
      stmt.run(
        entry.id,
        entry.timestamp,
        entry.action,
        entry.actor,
        entry.resource || null,
        JSON.stringify(entry.details || {}),
        entry.previousHash,
        entry.hash,
        entry.signature
      );

      // 更新最后哈希
      this.lastHash = entry.hash;

      return { success: true, data: entry };
    } catch (error) {
      console.error('[AuditLogger] Log error:', error);
      return {
        success: false,
        error: new EketErrorClass(
          'AUDIT_LOG_FAILED',
          `Failed to write audit log: ${(error as Error).message}`
        ),
      };
    }
  }

  /**
   * 创建日志条目（内部方法）
   */
  private createLogEntry(
    action: string,
    actor: string,
    details?: Record<string, unknown>,
    resource?: string
  ): AuditLogEntry {
    const id = `audit_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
    const timestamp = new Date().toISOString();
    const previousHash = this.lastHash || 'genesis';

    // 计算当前条目的哈希数据
    const hashData = JSON.stringify({
      id,
      timestamp,
      action,
      actor,
      resource,
      details,
      previousHash,
    });

    const hash = calculateHash(hashData);
    const signature = calculateHmac(hashData, this.hmacSecretKey);

    return {
      id,
      timestamp,
      action,
      actor,
      resource,
      details,
      previousHash,
      hash,
      signature,
      deleted: false,
    };
  }

  /**
   * 验证审计日志完整性
   *
   * @returns 验证结果
   */
  async verifyIntegrity(): Promise<VerificationResult> {
    const result: VerificationResult = {
      valid: true,
      entriesCount: 0,
      invalidIndices: [],
      details: {},
    };

    try {
      if (!this.sqliteClient.isReady()) {
        const connectResult = await await this.sqliteClient.connect();
        if (!connectResult.success) {
          result.valid = false;
          result.details.failureReason = 'signature_mismatch';
          return result;
        }
      }

      // 获取所有审计日志
      const rowsResult = await this.sqliteClient.all('SELECT * FROM audit_logs ORDER BY timestamp ASC');
      const rows = rowsResult.success ? (rowsResult.data as Array<Record<string, unknown>>) : [];

      result.entriesCount = rows.length;

      if (rows.length === 0) {
        return result; // 空日志，验证通过
      }

      let expectedNextHash: string | null = null;

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const index = i;

        // 重建日志条目
        const entry: AuditLogEntry = {
          id: row.id as string,
          timestamp: row.timestamp as string,
          action: row.action as string,
          actor: row.actor as string,
          resource: row.resource as string | undefined,
          details: row.details ? JSON.parse(row.details as string) : undefined,
          previousHash: row.previous_hash as string,
          hash: row.hash as string,
          signature: row.signature as string,
          deleted: !!row.deleted,
        };

        // 验证哈希格式
        if (!isValidHash(entry.hash) || !isValidHash(entry.previousHash)) {
          result.valid = false;
          result.invalidIndices.push(index);
          if (result.details.firstInvalidIndex === undefined) {
            result.details.firstInvalidIndex = index;
            result.details.failureReason = 'hash_chain_broken';
            result.details.affectedLogId = entry.id;
          }
          continue;
        }

        // 验证哈希链
        if (expectedNextHash !== null && entry.previousHash !== expectedNextHash) {
          result.valid = false;
          result.invalidIndices.push(index);
          if (result.details.firstInvalidIndex === undefined) {
            result.details.firstInvalidIndex = index;
            result.details.failureReason = 'hash_chain_broken';
            result.details.affectedLogId = entry.id;
          }
          continue;
        }

        // 重新计算哈希并验证
        const hashData = JSON.stringify({
          id: entry.id,
          timestamp: entry.timestamp,
          action: entry.action,
          actor: entry.actor,
          resource: entry.resource,
          details: entry.details,
          previousHash: entry.previousHash,
        });

        const computedHash = calculateHash(hashData);
        if (computedHash !== entry.hash) {
          result.valid = false;
          result.invalidIndices.push(index);
          if (result.details.firstInvalidIndex === undefined) {
            result.details.firstInvalidIndex = index;
            result.details.failureReason = 'signature_mismatch';
            result.details.affectedLogId = entry.id;
          }
          continue;
        }

        // 验证 HMAC 签名
        const computedSignature = calculateHmac(hashData, this.hmacSecretKey);
        if (computedSignature !== entry.signature) {
          result.valid = false;
          result.invalidIndices.push(index);
          if (result.details.firstInvalidIndex === undefined) {
            result.details.firstInvalidIndex = index;
            result.details.failureReason = 'signature_mismatch';
            result.details.affectedLogId = entry.id;
          }
          continue;
        }

        // 更新期望的下一个哈希
        expectedNextHash = entry.hash;
      }
    } catch (error) {
      console.error('[AuditLogger] Verification error:', error);
      result.valid = false;
      result.details.failureReason = 'signature_mismatch';
    }

    return result;
  }

  /**
   * 标记日志条目为已删除（软删除）
   */
  async markAsDeleted(logId: string, deletionId: string): Promise<Result<void>> {
    try {
      const updateSql = `
        UPDATE audit_logs
        SET deleted = 1, deleted_at = ?, deletion_id = ?
        WHERE id = ? AND deleted = 0
      `;

      const stmt = this.sqliteClient.getDB()!.prepare(updateSql);
      const result = stmt.run(new Date().toISOString(), deletionId, logId);

      if (result.changes === 0) {
        return {
          success: false,
          error: new EketErrorClass(
            'AUDIT_NOT_FOUND',
            `Log entry ${logId} not found or already deleted`
          ),
        };
      }

      return { success: true, data: undefined };
    } catch (error) {
      console.error('[AuditLogger] Mark as deleted error:', error);
      return {
        success: false,
        error: new EketErrorClass(
          'AUDIT_DELETE_FAILED',
          `Failed to mark audit log as deleted: ${(error as Error).message}`
        ),
      };
    }
  }

  /**
   * 查询审计日志
   */
  async query(options?: {
    actor?: string;
    action?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
  }): Promise<AuditLogEntry[]> {
    if (!this.sqliteClient.isReady()) {
      await this.sqliteClient.connect();
    }

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (options?.actor) {
      conditions.push('actor = ?');
      params.push(options.actor);
    }

    if (options?.action) {
      conditions.push('action = ?');
      params.push(options.action);
    }

    if (options?.startDate) {
      conditions.push('timestamp >= ?');
      params.push(options.startDate.toISOString());
    }

    if (options?.endDate) {
      conditions.push('timestamp <= ?');
      params.push(options.endDate.toISOString());
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limitClause = options?.limit ? `LIMIT ${options.limit}` : '';

    const sql = `SELECT * FROM audit_logs ${whereClause} ORDER BY timestamp DESC ${limitClause}`;

    const rowsResult = await this.sqliteClient.all(sql, params);
    const rows = rowsResult.success ? (rowsResult.data as Array<Record<string, unknown>>) : [];

    return rows.map((row) => ({
      id: row.id as string,
      timestamp: row.timestamp as string,
      action: row.action as string,
      actor: row.actor as string,
      resource: row.resource as string | undefined,
      details: row.details ? JSON.parse(row.details as string) : undefined,
      previousHash: row.previous_hash as string,
      hash: row.hash as string,
      signature: row.signature as string,
      deleted: !!row.deleted,
      deletedAt: row.deleted_at as string | undefined,
      deletionId: row.deletion_id as string | undefined,
    }));
  }

  /**
   * 获取统计信息
   */
  async getStats(): Promise<{
    totalEntries: number;
    deletedEntries: number;
    lastEntryAt?: string;
    integrityValid: boolean;
  }> {
    if (!this.sqliteClient.isReady()) {
      await this.sqliteClient.connect();
    }

    const totalResult = await this.sqliteClient.get('SELECT COUNT(*) as count FROM audit_logs');
    const deletedResult = await this.sqliteClient.get(
      'SELECT COUNT(*) as count FROM audit_logs WHERE deleted = 1'
    );
    const lastResult = await this.sqliteClient.get(
      'SELECT timestamp FROM audit_logs ORDER BY timestamp DESC LIMIT 1'
    );

    const totalRow = totalResult.success ? (totalResult.data as { count: number }) : null;
    const deletedRow = deletedResult.success ? (deletedResult.data as { count: number }) : null;
    const lastRow = lastResult.success ? (lastResult.data as { timestamp: string }) : null;

    const verification = await this.verifyIntegrity();

    return {
      totalEntries: totalRow?.count || 0,
      deletedEntries: deletedRow?.count || 0,
      lastEntryAt: lastRow?.timestamp,
      integrityValid: verification.valid,
    };
  }

  /**
   * 导出审计日志（用于备份或审计）
   */
  async export(options?: { format: 'json' | 'csv'; includeDeleted?: boolean }): Promise<string> {
    const entries = await this.query({});
    const includeDeleted = options?.includeDeleted ?? false;

    const filteredEntries = includeDeleted ? entries : entries.filter((e) => !e.deleted);

    if (options?.format === 'csv') {
      // CSV 导出
      const headers = [
        'id',
        'timestamp',
        'action',
        'actor',
        'resource',
        'hash',
        'signature',
        'deleted',
      ];
      const rows = filteredEntries.map((e) =>
        [
          e.id,
          e.timestamp,
          e.action,
          e.actor,
          e.resource || '',
          e.hash,
          e.signature,
          e.deleted ? '1' : '0',
        ].join(',')
      );

      return [headers.join(','), ...rows].join('\n');
    } else {
      // JSON 导出
      return JSON.stringify(filteredEntries, null, 2);
    }
  }

  /**
   * 清理资源
   */
  async destroy(): Promise<void> {
    await this.sqliteClient.close();
  }
}

// ============================================================================
// 工厂函数
// ============================================================================

/**
 * 创建审计日志服务实例
 */
export function createAuditLogger(config: AuditLoggerConfig = {}): AuditLogger {
  return new AuditLogger(config);
}

// ============================================================================
// 访问审计日志装饰器（用于自动记录数据访问）
// ============================================================================

/**
 * 数据访问审计装饰器
 * 用于记录谁、何时、访问了谁的数据
 *
 * @param auditLogger - 审计日志实例
 * @param accessorId - 访问者 ID
 * @param actionType - 访问类型（read/write/delete）
 * @returns 装饰后的函数
 */
export function createAccessAuditDecorator(
  auditLogger: AuditLogger,
  accessorId: string,
  actionType: 'read' | 'write' | 'delete'
): <T extends (...args: unknown[]) => Promise<unknown>>(fn: T) => T {
  return function <T extends (...args: unknown[]) => Promise<unknown>>(fn: T): T {
    return (async (...args: unknown[]) => {
      const targetResource = args[0]?.toString() || 'unknown';

      // 记录访问日志
      await auditLogger.log(
        `DATA_${actionType.toUpperCase()}`,
        accessorId,
        {
          function: fn.name,
          arguments: sanitizeArgs(args),
          targetResource,
        },
        targetResource
      );

      // 执行原函数
      return fn(...args);
    }) as T;
  };
}

/**
 * 清理参数用于审计日志（移除敏感信息）
 */
function sanitizeArgs(args: unknown[]): Record<string, unknown> {
  const sensitiveFields = ['password', 'secret', 'token', 'apiKey', 'key', 'credential'];

  const sanitized: Record<string, unknown> = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (typeof arg === 'object' && arg !== null) {
      const obj = arg as Record<string, unknown>;
      for (const [key, value] of Object.entries(obj)) {
        const lowerKey = key.toLowerCase();
        if (sensitiveFields.some((field) => lowerKey.includes(field))) {
          sanitized[`arg${i}_${key}`] = '[REDACTED]';
        } else {
          sanitized[`arg${i}_${key}`] = value;
        }
      }
    } else {
      sanitized[`arg${i}`] = arg;
    }
  }

  return sanitized;
}
