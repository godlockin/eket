/**
 * EKET Framework - Master Election
 *
 * 分布式 Master 选举机制，防止多个 instance 同时认为自己是 Master
 *
 * 选举策略（三级降级）：
 * 1. Redis SETNX 分布式锁（优先）
 * 2. SQLite 锁表（降级）
 * 3. 文件系统原子操作（最终降级）
 *
 * 选举流程：
 * 1. 尝试获取锁（SETNX / INSERT / mkdir）
 * 2. 获取成功后，进入声明等待期（默认 2 秒）
 * 3. 等待期内检测是否有其他 Master 声明
 * 4. 无冲突则正式成为 Master
 * 5. 创建 Master marker 文件
 *
 * Warm Standby 模式（v2.0.0 新增）：
 * - Backup Master 定期同步状态
 * - Master 故障时自动切换（<30 秒）
 * - 支持多个 Backup 节点
 */

import * as fs from 'fs';
import * as path from 'path';

import {
  MASTER_ELECTION_TIMEOUT,
  MASTER_DECLARATION_PERIOD,
  MASTER_LEASE_TIME,
} from '../constants.js';
import type { Result } from '../types/index.js';
import { EketError } from '../types/index.js';

import { RedisClient } from './redis-client.js';
import { SQLiteClient } from './sqlite-client.js';

// ============================================================================
// Types
// ============================================================================

export type ElectionLevel = 'redis' | 'sqlite' | 'file';

export interface MasterElectionConfig {
  // Redis 配置
  redis?: {
    host: string;
    port: number;
    password?: string;
  };
  // SQLite 配置
  sqlitePath?: string;
  // 文件配置
  projectRoot: string;
  // 选举超时（毫秒）
  electionTimeout?: number;
  // 声明等待期（毫秒）
  declarationPeriod?: number;
  // Master 租约时间（毫秒）
  leaseTime?: number;
}

export interface MasterElectionResult {
  isMaster: boolean;
  electionLevel: ElectionLevel;
  masterId?: string;
  conflictDetected: boolean;
}

/**
 * Master 角色类型
 */
export type MasterRole = 'master' | 'backup' | 'slaver';

/**
 * Master 状态信息
 */
export interface MasterState {
  role: MasterRole;
  instanceId: string;
  electedAt: number;
  lastHeartbeat: number;
  leaseExpiresAt: number;
  stateVersion: number; // 状态版本号，用于同步
}

/**
 * Warm Standby 配置
 */
export interface WarmStandbyConfig {
  enabled: boolean;
  heartbeatInterval: number; // 心跳间隔（毫秒）
  heartbeatTimeout: number; // 心跳超时（毫秒）
  maxBackups: number; // 最大 Backup 数量
  stateSyncInterval: number; // 状态同步间隔（毫秒）
}

/**
 * Default Warm Standby 配置
 */
const DEFAULT_WARM_STANDBY_CONFIG: WarmStandbyConfig = {
  enabled: true,
  heartbeatInterval: 5000, // 5 秒
  heartbeatTimeout: 15000, // 15 秒（3 次心跳间隔）
  maxBackups: 2, // 最多 2 个 Backup
  stateSyncInterval: 10000, // 10 秒
};

// ============================================================================
// Constants
// ============================================================================

const MASTER_LOCK_KEY = 'eket:master:lock';
const MASTER_DECLARATION_KEY = 'eket:master:declaration';
const MASTER_MARKER_FILE = '.eket_master_marker';

// ============================================================================
// Master Election Class
// ============================================================================

export class MasterElection {
  private config: MasterElectionConfig & {
    electionTimeout: number;
    declarationPeriod: number;
    leaseTime: number;
  };
  private warmStandbyConfig: WarmStandbyConfig;
  private redisClient: RedisClient | null = null;
  private sqliteClient: SQLiteClient | null = null;
  private instanceId: string;
  private isMaster = false;
  private role: MasterRole = 'slaver';
  private leaseTimer?: NodeJS.Timeout;
  private heartbeatTimer?: NodeJS.Timeout;
  private stateSyncTimer?: NodeJS.Timeout;
  private stateVersion = 0;
  private masterState: MasterState | null = null;
  private backupMasters: string[] = []; // Backup Master IDs

  constructor(config: MasterElectionConfig, warmStandbyConfig?: Partial<WarmStandbyConfig>) {
    // Defensive copy with defaults
    this.config = {
      electionTimeout: config.electionTimeout ?? MASTER_ELECTION_TIMEOUT,
      declarationPeriod: config.declarationPeriod ?? MASTER_DECLARATION_PERIOD,
      leaseTime: config.leaseTime ?? MASTER_LEASE_TIME,
      projectRoot: config.projectRoot,
      redis: config.redis ? { ...config.redis } : undefined,
      sqlitePath: config.sqlitePath,
    };

    // Warm Standby 配置合并
    this.warmStandbyConfig = {
      ...DEFAULT_WARM_STANDBY_CONFIG,
      ...warmStandbyConfig,
    };

    // 生成唯一 instance ID
    const hostname = process.env.HOSTNAME || 'unknown';
    const pid = process.pid;
    const timestamp = Date.now();
    this.instanceId = `instance_${hostname}_${pid}_${timestamp}`;
  }

  /**
   * 参与 Master 选举
   */
  async elect(): Promise<Result<MasterElectionResult>> {
    console.log(`[MasterElection] ${this.instanceId} starting election...`);

    // 1. 尝试 Redis 分布式锁
    if (this.config.redis) {
      const redisResult = await this.electWithRedis();
      if (redisResult.success) {
        return redisResult;
      }
      console.log('[MasterElection] Redis election failed, trying SQLite...');
    }

    // 2. 尝试 SQLite 锁
    if (this.config.sqlitePath) {
      const sqliteResult = await this.electWithSqlite();
      if (sqliteResult.success) {
        return sqliteResult;
      }
      console.log('[MasterElection] SQLite election failed, trying file system...');
    }

    // 3. 文件系统原子操作
    const fileResult = this.electWithFile();
    return fileResult;
  }

  /**
   * Redis 选举实现
   */
  private async electWithRedis(): Promise<Result<MasterElectionResult>> {
    this.redisClient = new RedisClient({
      host: this.config.redis!.host,
      port: this.config.redis!.port,
      password: this.config.redis!.password,
      keyPrefix: 'eket:',
    });

    const connectResult = await this.redisClient.connect();
    if (!connectResult.success) {
      return { success: false, error: connectResult.error };
    }

    try {
      const redis = this.redisClient.getClient();
      if (!redis) {
        return {
          success: false,
          error: new EketError('REDIS_CLIENT_NOT_AVAILABLE', 'Redis client not available'),
        };
      }

      // SETNX 尝试获取锁（使用 ioredis 的 set 方法）
      const acquired = await redis.set(
        `${MASTER_LOCK_KEY}`,
        this.instanceId,
        'PX',
        this.config.electionTimeout,
        'NX'
      );

      if (!acquired) {
        // 锁已被其他 instance 获取
        const currentMaster = await redis.get(MASTER_LOCK_KEY);
        return {
          success: true,
          data: {
            isMaster: false,
            electionLevel: 'redis',
            masterId: currentMaster || 'unknown',
            conflictDetected: true,
          },
        };
      }

      // 获取锁成功，进入声明等待期
      console.log('[MasterElection] Lock acquired, waiting for declaration period...');

      await this.declarationPeriod('redis');

      // 再次检查是否仍是 Master
      const currentMaster = await redis.get(MASTER_LOCK_KEY);
      if (currentMaster !== this.instanceId) {
        return {
          success: true,
          data: {
            isMaster: false,
            electionLevel: 'redis',
            masterId: currentMaster || 'unknown',
            conflictDetected: true,
          },
        };
      }

      // 正式发布 Master 声明
      await redis.setex(
        MASTER_DECLARATION_KEY,
        Math.floor(this.config.leaseTime / 1000),
        this.instanceId
      );

      // 创建 Master marker 文件
      const markerResult = this.createMasterMarker();
      if (!markerResult.success) {
        return { success: false, error: markerResult.error };
      }

      this.isMaster = true;
      this.startLeaseRenewal();

      return {
        success: true,
        data: {
          isMaster: true,
          electionLevel: 'redis',
          masterId: this.instanceId,
          conflictDetected: false,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: new EketError(
          'REDIS_ELECTION_FAILED',
          `Redis election error: ${error instanceof Error ? error.message : 'Unknown'}`
        ),
      };
    }
  }

  /**
   * SQLite 选举实现
   */
  private async electWithSqlite(): Promise<Result<MasterElectionResult>> {
    this.sqliteClient = new SQLiteClient(this.config.sqlitePath);
    const connectResult = this.sqliteClient.connect();

    if (!connectResult.success) {
      return { success: false, error: connectResult.error };
    }

    try {
      const db = this.sqliteClient.getDB();
      if (!db) {
        return {
          success: false,
          error: new EketError('SQLITE_CLIENT_NOT_AVAILABLE', 'SQLite client not available'),
        };
      }

      // 创建 master_lock 表
      db.exec(`
        CREATE TABLE IF NOT EXISTS master_lock (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          master_id TEXT NOT NULL,
          acquired_at INTEGER NOT NULL,
          expires_at INTEGER NOT NULL
        )
      `);

      const now = Date.now();

      // 尝试获取锁（使用事务保证原子性）
      const transaction = db.transaction(() => {
        // 清理过期锁
        db.exec(`DELETE FROM master_lock WHERE expires_at < ${now}`);

        // 检查是否已有 Master
        const existing = db
          .prepare('SELECT master_id, expires_at FROM master_lock WHERE id = 1')
          .get() as { master_id: string; expires_at: number } | undefined;

        if (existing) {
          // 已有 Master，检查是否过期
          if (existing.expires_at > now) {
            throw new Error(`Master already exists: ${existing.master_id}`);
          }
        }

        // 获取锁
        db.prepare(
          `
          INSERT OR REPLACE INTO master_lock (id, master_id, acquired_at, expires_at)
          VALUES (1, ?, ${now}, ${now + this.config.electionTimeout})
        `
        ).run(this.instanceId);

        return this.instanceId;
      });

      try {
        transaction();
      } catch {
        // 锁已被其他 instance 获取
        const currentMaster = db.prepare('SELECT master_id FROM master_lock WHERE id = 1').get() as
          | { master_id: string }
          | undefined;
        return {
          success: true,
          data: {
            isMaster: false,
            electionLevel: 'sqlite',
            masterId: currentMaster?.master_id || 'unknown',
            conflictDetected: true,
          },
        };
      }

      // 获取锁成功，进入声明等待期
      console.log('[MasterElection] Lock acquired, waiting for declaration period...');

      await this.declarationPeriod('sqlite');

      // 再次检查是否仍是 Master
      const currentMaster = db.prepare('SELECT master_id FROM master_lock WHERE id = 1').get() as
        | { master_id: string }
        | undefined;
      if (currentMaster?.master_id !== this.instanceId) {
        return {
          success: true,
          data: {
            isMaster: false,
            electionLevel: 'sqlite',
            masterId: currentMaster?.master_id || 'unknown',
            conflictDetected: true,
          },
        };
      }

      // 更新为正式 Master（延长租约）
      db.prepare(
        `
        UPDATE master_lock
        SET expires_at = ?
        WHERE id = 1 AND master_id = ?
      `
      ).run(now + this.config.leaseTime, this.instanceId);

      // 创建 Master marker 文件
      const markerResult = this.createMasterMarker();
      if (!markerResult.success) {
        return { success: false, error: markerResult.error };
      }

      this.isMaster = true;
      this.startLeaseRenewal();

      return {
        success: true,
        data: {
          isMaster: true,
          electionLevel: 'sqlite',
          masterId: this.instanceId,
          conflictDetected: false,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: new EketError(
          'SQLITE_ELECTION_FAILED',
          `SQLite election error: ${error instanceof Error ? error.message : 'Unknown'}`
        ),
      };
    }
  }

  /**
   * 文件系统选举实现
   */
  private async electWithFile(): Promise<Result<MasterElectionResult>> {
    try {
      const lockDir = path.join(this.config.projectRoot, '.eket', 'state', 'master_lock');
      fs.mkdirSync(path.dirname(lockDir), { recursive: true });

      const lockFile = path.join(lockDir, 'lock');
      const declarationFile = path.join(lockDir, 'declaration');

      // 尝试创建锁目录（原子操作）
      try {
        fs.mkdirSync(lockDir, { recursive: false });
      } catch {
        // 目录已存在，检查锁是否过期
        const lockInfo = readLockFile(lockFile);
        if (lockInfo && lockInfo.expiresAt > Date.now()) {
          // 锁有效，当前 instance 不是 Master
          return {
            success: true,
            data: {
              isMaster: false,
              electionLevel: 'file',
              masterId: lockInfo.masterId,
              conflictDetected: true,
            },
          };
        }
        // 锁已过期，删除旧锁重新获取
        try {
          fs.rmSync(lockDir, { recursive: true, force: true });
          fs.mkdirSync(lockDir, { recursive: false });
        } catch {
          // 并发删除失败，让其他 instance 获胜
          return {
            success: true,
            data: {
              isMaster: false,
              electionLevel: 'file',
              masterId: 'unknown',
              conflictDetected: true,
            },
          };
        }
      }

      // 成功获取锁，写入锁信息
      const lockInfo = {
        masterId: this.instanceId,
        acquiredAt: Date.now(),
        expiresAt: Date.now() + this.config.electionTimeout,
      };
      fs.writeFileSync(lockFile, JSON.stringify(lockInfo, null, 2));

      // 进入声明等待期
      console.log('[MasterElection] Lock acquired, waiting for declaration period...');

      // 文件系统的声明等待期实现
      const startTime = Date.now();
      while (Date.now() - startTime < this.config.declarationPeriod) {
        // 检查是否有其他 instance 创建了 declaration 文件
        if (fs.existsSync(declarationFile)) {
          const otherDeclaration = JSON.parse(fs.readFileSync(declarationFile, 'utf-8'));
          if (otherDeclaration.masterId !== this.instanceId) {
            // 有其他 instance 抢先声明
            fs.rmSync(lockDir, { recursive: true, force: true });
            return {
              success: true,
              data: {
                isMaster: false,
                electionLevel: 'file',
                masterId: otherDeclaration.masterId,
                conflictDetected: true,
              },
            };
          }
        }
        // 等待一小段时间
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      // 创建 Master 声明
      const declaration = {
        masterId: this.instanceId,
        declaredAt: Date.now(),
        expiresAt: Date.now() + this.config.leaseTime,
      };
      fs.writeFileSync(declarationFile, JSON.stringify(declaration, null, 2));

      // 创建 Master marker 文件
      const markerResult = this.createMasterMarker();
      if (!markerResult.success) {
        return { success: false, error: markerResult.error };
      }

      this.isMaster = true;
      this.startLeaseRenewal('file', lockFile);

      return {
        success: true,
        data: {
          isMaster: true,
          electionLevel: 'file',
          masterId: this.instanceId,
          conflictDetected: false,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: new EketError(
          'FILE_ELECTION_FAILED',
          `File election error: ${error instanceof Error ? error.message : 'Unknown'}`
        ),
      };
    }
  }

  /**
   * 声明等待期
   */
  private async declarationPeriod(level: ElectionLevel): Promise<void> {
    const startTime = Date.now();
    while (Date.now() - startTime < this.config.declarationPeriod) {
      await new Promise((resolve) => setTimeout(resolve, 100));

      // 检查是否有其他 Master 声明
      if (level === 'redis' && this.redisClient) {
        const declaration = await this.redisClient.getClient()?.get(MASTER_DECLARATION_KEY);
        if (declaration && declaration !== this.instanceId) {
          throw new Error(`Other master detected: ${declaration}`);
        }
      } else if (level === 'sqlite' && this.sqliteClient) {
        const db = this.sqliteClient.getDB();
        if (db) {
          const row = db.prepare('SELECT value FROM master_declaration WHERE id = 1').get() as
            | { value: string }
            | undefined;
          if (row && row.value !== this.instanceId) {
            throw new Error(`Other master detected: ${row.value}`);
          }
        }
      }
    }
  }

  /**
   * 创建 Master marker 文件
   */
  private createMasterMarker(): Result<string> {
    try {
      const timestamp = new Date().toISOString();
      const markerContent = `initialized_by: ${this.instanceId}\nmaster_instance: true\ninitialized_at: ${timestamp}\nelection_level: detected_at_start\n`;

      const markerPath = path.join(this.config.projectRoot, 'confluence', MASTER_MARKER_FILE);

      if (fs.existsSync(markerPath)) {
        return {
          success: false,
          error: new EketError('MASTER_ALREADY_EXISTS', 'Master marker already exists'),
        };
      }

      // 确保目录存在
      fs.mkdirSync(path.dirname(markerPath), { recursive: true });
      fs.writeFileSync(markerPath, markerContent, 'utf-8');

      return { success: true, data: markerPath };
    } catch (error) {
      return {
        success: false,
        error: new EketError(
          'CREATE_MASTER_MARKER_FAILED',
          `Failed to create master marker: ${error instanceof Error ? error.message : 'Unknown'}`
        ),
      };
    }
  }

  /**
   * 启动租约续期
   */
  private startLeaseRenewal(level?: ElectionLevel, lockFile?: string): void {
    // 清理旧 Timer（防止泄漏）
    if (this.leaseTimer) {
      clearInterval(this.leaseTimer);
      this.leaseTimer = undefined;
    }

    const renewInterval = this.config.leaseTime / 2;

    const renew = async () => {
      if (!this.isMaster) {
        return;
      }

      try {
        if (level === 'redis' && this.redisClient) {
          await this.redisClient
            .getClient()
            ?.set(MASTER_LOCK_KEY, this.instanceId, 'PX', this.config.leaseTime, 'XX');
        } else if (level === 'sqlite' && this.sqliteClient) {
          const db = this.sqliteClient.getDB();
          if (db) {
            db.prepare(
              `
              UPDATE master_lock
              SET expires_at = ?
              WHERE id = 1 AND master_id = ?
            `
            ).run(Date.now() + this.config.leaseTime, this.instanceId);
          }
        } else if (level === 'file' && lockFile) {
          const lockInfo = {
            masterId: this.instanceId,
            acquiredAt: Date.now(),
            expiresAt: Date.now() + this.config.leaseTime,
          };
          fs.writeFileSync(lockFile, JSON.stringify(lockInfo, null, 2));
        }
      } catch (error) {
        console.error('[MasterElection] Lease renewal failed:', {
          instanceId: this.instanceId,
          electionLevel: level,
          error: error instanceof Error ? error.message : 'Unknown',
          timestamp: new Date().toISOString(),
        });
        this.isMaster = false;
      }
    };

    this.leaseTimer = setInterval(renew, renewInterval);

    // 启动 Warm Standby 心跳和状态同步
    if (this.warmStandbyConfig.enabled) {
      this.startWarmStandbyHeartbeat();
      this.startStateSync();
    }
  }

  /**
   * 启动 Warm Standby 心跳
   */
  private startWarmStandbyHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }

    const heartbeat = async () => {
      if (!this.isMaster) {
        return;
      }

      try {
        this.stateVersion++;
        this.masterState = {
          role: 'master',
          instanceId: this.instanceId,
          electedAt: Date.now(),
          lastHeartbeat: Date.now(),
          leaseExpiresAt: Date.now() + this.config.leaseTime,
          stateVersion: this.stateVersion,
        };

        // 发布心跳到 Redis
        if (this.redisClient) {
          await this.redisClient
            .getClient()
            ?.setex(
              'eket:master:heartbeat',
              Math.floor(this.warmStandbyConfig.heartbeatTimeout / 1000),
              JSON.stringify(this.masterState)
            );
        }
      } catch (error) {
        console.error('[MasterElection] Warm Standby heartbeat failed:', error);
      }
    };

    this.heartbeatTimer = setInterval(heartbeat, this.warmStandbyConfig.heartbeatInterval);
  }

  /**
   * 启动状态同步（Backup Master 使用）
   */
  private startStateSync(): void {
    if (this.stateSyncTimer) {
      clearInterval(this.stateSyncTimer);
    }

    const syncState = async () => {
      if (!this.isMaster) {
        return;
      }

      try {
        // Master 定期同步状态到共享存储
        if (this.redisClient) {
          await this.redisClient.getClient()?.setex(
            'eket:master:state',
            this.warmStandbyConfig.stateSyncInterval / 1000 + 60,
            JSON.stringify({
              ...this.masterState,
              backupMasters: this.backupMasters,
            })
          );
        }
      } catch (error) {
        console.error('[MasterElection] State sync failed:', error);
      }
    };

    this.stateSyncTimer = setInterval(syncState, this.warmStandbyConfig.stateSyncInterval);
  }

  /**
   * 注册为 Backup Master
   */
  async registerAsBackup(): Promise<Result<void>> {
    if (!this.warmStandbyConfig.enabled) {
      return {
        success: false,
        error: new EketError('WARM_STANDBY_NOT_ENABLED', 'Warm Standby not enabled'),
      };
    }

    try {
      this.role = 'backup';

      // 添加到 Backup Master 列表
      if (this.redisClient) {
        await this.redisClient.getClient()?.sadd('eket:master:backups', this.instanceId);

        // 定期发送 Backup 心跳
        const backupHeartbeat = async () => {
          if (this.role !== 'backup') {
            return;
          }

          await this.redisClient?.getClient()?.setex(
            `eket:master:backup:${this.instanceId}`,
            Math.floor(this.warmStandbyConfig.heartbeatTimeout / 1000),
            JSON.stringify({
              instanceId: this.instanceId,
              role: 'backup',
              lastHeartbeat: Date.now(),
            })
          );
        };

        this.heartbeatTimer = setInterval(
          backupHeartbeat,
          this.warmStandbyConfig.heartbeatInterval
        );
      }

      return { success: true, data: undefined };
    } catch (error) {
      return {
        success: false,
        error: new EketError(
          'BACKUP_REGISTRATION_FAILED',
          `Failed to register as backup: ${error instanceof Error ? error.message : 'Unknown'}`
        ),
      };
    }
  }

  /**
   * 检测 Master 是否存活
   */
  async isMasterAlive(): Promise<boolean> {
    if (!this.redisClient) {
      return false;
    }

    try {
      const heartbeat = await this.redisClient.getClient()?.get('eket:master:heartbeat');
      if (!heartbeat) {
        return false;
      }

      const state = JSON.parse(heartbeat) as MasterState;
      const now = Date.now();

      return now - state.lastHeartbeat < this.warmStandbyConfig.heartbeatTimeout;
    } catch {
      return false;
    }
  }

  /**
   * 从 Backup 提升为 Master（故障切换）
   */
  async promoteToMaster(): Promise<Result<MasterElectionResult>> {
    if (this.role !== 'backup') {
      return {
        success: false,
        error: new EketError('NOT_BACKUP', 'Only backup can promote to master'),
      };
    }

    // 检查当前 Master 是否存活
    const masterAlive = await this.isMasterAlive();
    if (masterAlive) {
      return {
        success: false,
        error: new EketError('MASTER_STILL_ALIVE', 'Current master is still alive'),
      };
    }

    console.log('[MasterElection] Master not responding, starting failover election...');

    // 重新参与选举
    const result = await this.elect();
    if (result.success && result.data.isMaster) {
      this.role = 'master';
      this.isMaster = true;
      console.log('[MasterElection] Backup promoted to master after failover');
    }

    return result;
  }

  /**
   * 获取当前 Master 状态
   */
  async getMasterState(): Promise<MasterState | null> {
    if (!this.redisClient) {
      return null;
    }

    try {
      const heartbeat = await this.redisClient.getClient()?.get('eket:master:heartbeat');
      if (!heartbeat) {
        return null;
      }

      return JSON.parse(heartbeat) as MasterState;
    } catch {
      return null;
    }
  }

  /**
   * 获取所有 Backup Master 列表
   */
  async getBackupMasters(): Promise<string[]> {
    if (!this.redisClient) {
      return [];
    }

    try {
      const backups = await this.redisClient.getClient()?.smembers('eket:master:backups');
      return backups || [];
    } catch {
      return [];
    }
  }

  /**
   * 获取当前角色
   */
  getRole(): MasterRole {
    return this.role;
  }

  /**
   * 检查是否 Master
   */
  isMasterNode(): boolean {
    return this.isMaster;
  }

  /**
   * 获取 Instance ID
   */
  getInstanceId(): string {
    return this.instanceId;
  }

  /**
   * 放弃 Master 身份
   */
  async relinquish(): Promise<void> {
    this.isMaster = false;
    this.role = 'slaver';

    // 清理所有定时器
    if (this.leaseTimer) {
      clearInterval(this.leaseTimer);
      this.leaseTimer = undefined;
    }
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }
    if (this.stateSyncTimer) {
      clearInterval(this.stateSyncTimer);
      this.stateSyncTimer = undefined;
    }

    // 清理锁
    if (this.redisClient) {
      await this.redisClient.getClient()?.del(MASTER_LOCK_KEY);
      await this.redisClient.getClient()?.del('eket:master:heartbeat');
      await this.redisClient.getClient()?.del('eket:master:state');
      await this.redisClient.disconnect();
    }

    if (this.sqliteClient) {
      const db = this.sqliteClient.getDB();
      if (db) {
        db.exec('DELETE FROM master_lock WHERE id = 1');
      }
      this.sqliteClient.close();
    }

    // 清理文件锁
    const lockDir = path.join(this.config.projectRoot, '.eket', 'state', 'master_lock');
    if (fs.existsSync(lockDir)) {
      fs.rmSync(lockDir, { recursive: true, force: true });
    }

    console.log('[MasterElection] Relinquished master status');
  }

  /**
   * 关闭选举器
   */
  async close(): Promise<void> {
    await this.relinquish();

    // 清理客户端
    if (this.redisClient) {
      await this.redisClient.disconnect();
      this.redisClient = null;
    }
    if (this.sqliteClient) {
      this.sqliteClient.close();
      this.sqliteClient = null;
    }

    this.masterState = null;
    this.backupMasters = [];
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

interface LockFileData {
  masterId: string;
  acquiredAt: number;
  expiresAt: number;
}

function readLockFile(lockFile: string): LockFileData | null {
  try {
    if (fs.existsSync(lockFile)) {
      const content = fs.readFileSync(lockFile, 'utf-8');
      return JSON.parse(content) as LockFileData;
    }
  } catch {
    // Ignore read errors
  }
  return null;
}

// ============================================================================
// Factory Function
// ============================================================================

export function createMasterElection(
  config: MasterElectionConfig,
  warmStandbyConfig?: Partial<WarmStandbyConfig>
): MasterElection {
  return new MasterElection(config, warmStandbyConfig);
}
