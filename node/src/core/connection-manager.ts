/**
 * EKET Framework - Connection Manager
 *
 * 四级降级策略：
 * 1. 远程共享 Redis（优先）
 * 2. 本地 Redis（降级）
 * 3. 本地 SQLite（再降级）
 * 4. 本地文件系统（最终降级）
 *
 * 双驱动模式：
 * - JS 驱动：Node.js 原生实现
 * - Shell 驱动：通过 hybrid-adapter.sh 调用
 */

import * as fs from 'fs';
import * as path from 'path';

import type { Result, ConnectionLevel, DriverMode, ConnectionManagerConfig, ConnectionStats } from '../types/index.js';
import { EketError, EketErrorCode } from '../types/index.js';

import { RedisClient } from './redis-client.js';
import { SQLiteManager } from './sqlite-manager.js';

// ============================================================================
// Connection Manager Class
// ============================================================================

export class ConnectionManager {
  private config: ConnectionManagerConfig;
  private currentLevel: ConnectionLevel = 'file';
  private driverMode: DriverMode = 'js';

  private remoteRedisClient: RedisClient | null = null;
  private localRedisClient: RedisClient | null = null;
  private sqliteClient: SQLiteManager | null = null;

  private remoteRedisAvailable = false;
  private localRedisAvailable = false;
  private sqliteAvailable = false;
  private fileAvailable = false;

  private fallbackCount = 0;
  private lastFallbackTime?: number;

  constructor(config: ConnectionManagerConfig) {
    // Defensive copy
    this.config = JSON.parse(JSON.stringify(config));
    this.driverMode = config.driverMode || 'js';
  }

  /**
   * 初始化连接管理器
   */
  async initialize(): Promise<Result<ConnectionLevel>> {
    console.log('[ConnectionManager] Initializing...');

    // 1. 尝试远程 Redis
    if (this.config.remoteRedis) {
      const result = await this.tryConnectRemoteRedis();
      if (result.success) {
        this.currentLevel = 'remote_redis';
        this.remoteRedisAvailable = true;
        console.log('[ConnectionManager] Connected to remote Redis');
        return { success: true, data: this.currentLevel };
      }
    }

    // 2. 尝试本地 Redis
    if (this.config.localRedis) {
      const result = await this.tryConnectLocalRedis();
      if (result.success) {
        this.currentLevel = 'local_redis';
        this.localRedisAvailable = true;
        this.fallbackCount++;
        this.lastFallbackTime = Date.now();
        console.log('[ConnectionManager] Connected to local Redis (fallback)');
        return { success: true, data: this.currentLevel };
      }
    }

    // 3. 尝试 SQLite
    const sqliteResult = await this.tryConnectSqlite();
    if (sqliteResult.success) {
      this.currentLevel = 'sqlite';
      this.sqliteAvailable = true;
      this.fallbackCount++;
      this.lastFallbackTime = Date.now();
      console.log('[ConnectionManager] Connected to SQLite (fallback)');
      return { success: true, data: this.currentLevel };
    }

    // 4. 最终降级到文件系统
    const fileResult = this.tryConnectFile();
    if (fileResult.success) {
      this.currentLevel = 'file';
      this.fileAvailable = true;
      this.fallbackCount++;
      this.lastFallbackTime = Date.now();
      console.log('[ConnectionManager] Using file system (final fallback)');
      return { success: true, data: this.currentLevel };
    }

    return {
      success: false,
      error: new EketError(EketErrorCode.CONNECTION_FAILED, 'All connection levels failed'),
    };
  }

  /**
   * 尝试连接远程 Redis
   */
  private async tryConnectRemoteRedis(): Promise<Result<void>> {
    if (!this.config.remoteRedis) {
      return {
        success: false,
        error: new EketError(EketErrorCode.REMOTE_REDIS_NOT_CONFIGURED, 'Remote Redis not configured'),
      };
    }

    this.remoteRedisClient = new RedisClient({
      host: this.config.remoteRedis.host,
      port: this.config.remoteRedis.port,
      password: this.config.remoteRedis.password,
      db: this.config.remoteRedis.db,
      keyPrefix: 'eket:remote:',
    });

    return await this.remoteRedisClient.connect();
  }

  /**
   * 尝试连接本地 Redis
   */
  private async tryConnectLocalRedis(): Promise<Result<void>> {
    if (!this.config.localRedis) {
      return {
        success: false,
        error: new EketError(EketErrorCode.LOCAL_REDIS_NOT_CONFIGURED, 'Local Redis not configured'),
      };
    }

    this.localRedisClient = new RedisClient({
      host: this.config.localRedis.host,
      port: this.config.localRedis.port,
      keyPrefix: 'eket:local:',
    });

    return await this.localRedisClient.connect();
  }

  /**
   * 尝试连接 SQLite
   */
  private async tryConnectSqlite(): Promise<Result<void>> {
    const { createSQLiteManager } = await import('./sqlite-manager.js');
    this.sqliteClient = createSQLiteManager({ dbPath: this.config.sqlitePath, useWorker: false });
    return await this.sqliteClient.connect();
  }

  /**
   * 尝试连接文件系统
   */
  private tryConnectFile(): Result<void> {
    try {
      const queueDir =
        this.config.fileQueueDir || path.join(process.cwd(), '.eket', 'data', 'queue');
      fs.mkdirSync(queueDir, { recursive: true });
      this.fileAvailable = true;
      return { success: true, data: undefined };
    } catch (error) {
      return {
        success: false,
        error: new EketError(EketErrorCode.FILE_CONNECT_FAILED, 'Failed to connect file system'),
      };
    }
  }

  /**
   * 获取当前连接级别
   */
  getCurrentLevel(): ConnectionLevel {
    return this.currentLevel;
  }

  /**
   * 获取当前驱动模式
   */
  getDriverMode(): DriverMode {
    return this.driverMode;
  }

  /**
   * 获取连接统计
   */
  getStats(): ConnectionStats {
    return {
      currentLevel: this.currentLevel,
      driverMode: this.driverMode,
      remoteRedisAvailable: this.remoteRedisAvailable,
      localRedisAvailable: this.localRedisAvailable,
      sqliteAvailable: this.sqliteAvailable,
      fileAvailable: this.fileAvailable,
      lastFallbackTime: this.lastFallbackTime,
      fallbackCount: this.fallbackCount,
    };
  }

  /**
   * 获取远程 Redis 客户端
   */
  getRemoteRedisClient(): RedisClient | null {
    return this.remoteRedisClient;
  }

  /**
   * 获取本地 Redis 客户端
   */
  getLocalRedisClient(): RedisClient | null {
    return this.localRedisClient;
  }

  /**
   * 获取 SQLite 客户端
   */
  getSqliteClient(): SQLiteManager | null {
    return this.sqliteClient;
  }

  /**
   * 获取文件队列目录
   */
  getFileQueueDir(): string | null {
    if (!this.fileAvailable) {
      return null;
    }
    return this.config.fileQueueDir || path.join(process.cwd(), '.eket', 'data', 'queue');
  }

  /**
   * 设置驱动模式
   */
  setDriverMode(mode: DriverMode): void {
    this.driverMode = mode;
  }

  /**
   * 尝试升级到更高级别的连接
   */
  async tryUpgrade(): Promise<Result<ConnectionLevel>> {
    const currentLevel = this.currentLevel;

    // 尝试从 file 升级到 sqlite
    if (currentLevel === 'file' && !this.sqliteAvailable) {
      const result = await this.tryConnectSqlite();
      if (result.success) {
        this.currentLevel = 'sqlite';
        this.sqliteAvailable = true;
        console.log('[ConnectionManager] Upgraded to SQLite');
        return { success: true, data: this.currentLevel };
      }
    }

    // 尝试从 sqlite 升级到 local Redis
    if (currentLevel === 'sqlite' && !this.localRedisAvailable && this.config.localRedis) {
      const result = await this.tryConnectLocalRedis();
      if (result.success) {
        this.currentLevel = 'local_redis';
        this.localRedisAvailable = true;
        console.log('[ConnectionManager] Upgraded to local Redis');
        return { success: true, data: this.currentLevel };
      }
    }

    // 尝试从 local Redis 升级到远程 Redis
    if (currentLevel === 'local_redis' && !this.remoteRedisAvailable && this.config.remoteRedis) {
      const result = await this.tryConnectRemoteRedis();
      if (result.success) {
        this.currentLevel = 'remote_redis';
        this.remoteRedisAvailable = true;
        console.log('[ConnectionManager] Upgraded to remote Redis');
        return { success: true, data: this.currentLevel };
      }
    }

    return {
      success: false,
      error: new EketError(EketErrorCode.UPGRADE_FAILED, 'No higher connection level available'),
    };
  }

  /**
   * 关闭所有连接
   */
  async shutdown(): Promise<void> {
    if (this.remoteRedisClient) {
      await this.remoteRedisClient.disconnect();
    }
    if (this.localRedisClient) {
      await this.localRedisClient.disconnect();
    }
    if (this.sqliteClient) {
      await this.sqliteClient.close();
    }
    console.log('[ConnectionManager] Shutdown complete');
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createConnectionManager(
  config?: Partial<ConnectionManagerConfig>
): ConnectionManager {
  return new ConnectionManager({
    remoteRedis: config?.remoteRedis
      ? {
          host:
            config.remoteRedis.host ||
            process.env.EKET_REMOTE_REDIS_HOST ||
            'redis-cluster.example.com',
          port:
            config.remoteRedis.port || parseInt(process.env.EKET_REMOTE_REDIS_PORT || '6380', 10),
          password: config.remoteRedis.password || process.env.EKET_REMOTE_REDIS_PASSWORD,
          db: config.remoteRedis.db,
        }
      : undefined,
    localRedis: config?.localRedis
      ? {
          host: config.localRedis.host || process.env.EKET_LOCAL_REDIS_HOST || 'localhost',
          port: config.localRedis.port || parseInt(process.env.EKET_LOCAL_REDIS_PORT || '6379', 10),
        }
      : undefined,
    sqlitePath: config?.sqlitePath || process.env.EKET_SQLITE_PATH,
    fileQueueDir: config?.fileQueueDir || process.env.EKET_FILE_QUEUE_DIR,
    driverMode: config?.driverMode || 'js',
  });
}
