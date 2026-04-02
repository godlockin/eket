/**
 * EKET Framework - Application Configuration
 * Version: 2.0.0
 *
 * 集中配置管理，支持：
 * - 统一配置源（环境变量 + YAML）
 * - 配置验证（启动时）
 * - 配置变更通知
 * - 配置层级合并
 */

import * as fs from 'fs';
import * as path from 'path';

import { EketError, Result } from '../types/index.js';

// ============================================================================
// Types
// ============================================================================

/**
 * 配置来源
 */
export type ConfigSource = 'env' | 'yaml' | 'default' | 'override';

/**
 * 配置变更事件
 */
export interface ConfigChangeEvent<T = unknown> {
  key: string;
  oldValue: T;
  newValue: T;
  source: ConfigSource;
  timestamp: number;
}

/**
 * 配置监听器
 */
export type ConfigChangeListener = (event: ConfigChangeEvent) => void;

/**
 * Redis 配置
 */
export interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  db?: number;
}

/**
 * SQLite 配置
 */
export interface SQLiteConfig {
  path: string;
}

/**
 * 消息队列配置
 */
export interface MessageQueueConfig {
  mode: 'auto' | 'redis' | 'file';
  redis?: RedisConfig;
  fileQueueDir?: string;
}

/**
 * Master 选举配置
 */
export interface MasterElectionConfig {
  enabled: boolean;
  timeout: number;
  declarationPeriod: number;
  leaseTime: number;
}

/**
 * 连接管理配置
 */
export interface ConnectionConfig {
  remoteRedis?: RedisConfig;
  localRedis?: RedisConfig;
  sqlite?: SQLiteConfig;
  fileQueueDir?: string;
  driverMode: 'js' | 'shell';
}

/**
 * 应用配置接口
 */
export interface AppConfig {
  // 基础配置
  app: {
    name: string;
    version: string;
    environment: 'development' | 'production' | 'test';
    projectRoot: string;
  };

  // 连接配置
  connection: ConnectionConfig;

  // Master 选举配置
  masterElection: MasterElectionConfig;

  // 消息队列配置
  messageQueue: MessageQueueConfig;

  // 日志配置
  logging: {
    level: 'debug' | 'info' | 'warn' | 'error';
    format: 'json' | 'text';
    output?: 'console' | 'file';
    filePath?: string;
  };

  // 性能配置
  performance: {
    cacheEnabled: boolean;
    cacheSize: number;
    cacheTTL: number;
    circuitBreakerEnabled: boolean;
    circuitBreakerFailureThreshold: number;
    circuitBreakerTimeout: number;
  };

  // 安全配置
  security: {
    apiKey?: string;
    enableRateLimiting: boolean;
    rateLimitWindow: number;
    rateLimitMaxRequests: number;
  };
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_CONFIG: AppConfig = {
  app: {
    name: 'EKET Framework',
    version: '2.0.0',
    environment: 'development',
    projectRoot: process.cwd(),
  },
  connection: {
    driverMode: 'js',
  },
  masterElection: {
    enabled: true,
    timeout: 5000,
    declarationPeriod: 2000,
    leaseTime: 30000,
  },
  messageQueue: {
    mode: 'auto',
  },
  logging: {
    level: 'info',
    format: 'text',
    output: 'console',
  },
  performance: {
    cacheEnabled: true,
    cacheSize: 1000,
    cacheTTL: 300000, // 5 minutes
    circuitBreakerEnabled: true,
    circuitBreakerFailureThreshold: 5,
    circuitBreakerTimeout: 30000,
  },
  security: {
    enableRateLimiting: false,
    rateLimitWindow: 900000, // 15 minutes
    rateLimitMaxRequests: 100,
  },
};

// ============================================================================
// Configuration Manager Class
// ============================================================================

export class ConfigManager {
  private config: AppConfig;
  private listeners: Map<string, Set<ConfigChangeListener>> = new Map();
  private configHistory: Map<string, ConfigChangeEvent[]> = new Map();
  private readonly maxHistoryLength = 10;

  constructor() {
    this.config = this.loadAndMergeConfig();
  }

  /**
   * 加载并合并配置
   */
  private loadAndMergeConfig(): AppConfig {
    // 1. 从默认配置开始
    const config: AppConfig = {
      app: { ...DEFAULT_CONFIG.app },
      connection: { ...DEFAULT_CONFIG.connection },
      masterElection: { ...DEFAULT_CONFIG.masterElection },
      messageQueue: { ...DEFAULT_CONFIG.messageQueue },
      logging: { ...DEFAULT_CONFIG.logging },
      performance: { ...DEFAULT_CONFIG.performance },
      security: { ...DEFAULT_CONFIG.security },
    };

    // 2. 加载 YAML 配置（如果存在）
    const yamlConfig = this.loadYamlConfig();
    if (yamlConfig) {
      this.mergeConfig(config, yamlConfig);
    }

    // 3. 环境变量覆盖
    const envConfig = this.loadEnvConfig();
    this.mergeConfig(config, envConfig);

    return config;
  }

  /**
   * 加载 YAML 配置文件
   */
  private loadYamlConfig(): Partial<AppConfig> | null {
    const possiblePaths = [
      path.join(process.cwd(), '.eket', 'config', 'app-config.yml'),
      path.join(process.cwd(), '.eket', 'config', 'app-config.yaml'),
      path.join(process.cwd(), 'config', 'app-config.yml'),
      path.join(process.cwd(), 'config', 'app-config.yaml'),
    ];

    for (const configPath of possiblePaths) {
      if (fs.existsSync(configPath)) {
        try {
          const content = fs.readFileSync(configPath, 'utf-8');
          return this.parseSimpleYaml(content) as Partial<AppConfig>;
        } catch {
          console.warn(`[ConfigManager] Failed to parse YAML config at ${configPath}`);
        }
      }
    }

    return null;
  }

  /**
   * 简单 YAML 解析（支持基本嵌套结构）
   */
  private parseSimpleYaml(content: string): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    const lines = content.split('\n');
    const stack: Array<{ obj: Record<string, unknown>; indent: number }> = [
      { obj: result, indent: -1 },
    ];

    for (const line of lines) {
      // 跳过注释和空行
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }

      // 计算缩进
      const indent = line.search(/\S/);

      // 弹出栈中缩进更大的对象
      while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
        stack.pop();
      }

      // 解析键值对
      const colonIndex = trimmed.indexOf(':');
      if (colonIndex === -1) {
        continue;
      }

      const key = trimmed.substring(0, colonIndex).trim();
      const value = trimmed.substring(colonIndex + 1).trim();

      const parent = stack[stack.length - 1].obj;

      if (value === '' || value === '|' || value === '>') {
        // 嵌套对象
        const newObj: Record<string, unknown> = {};
        parent[key] = newObj;
        stack.push({ obj: newObj, indent });
      } else {
        // 解析值
        parent[key] = this.parseYamlValue(value);
      }
    }

    return result;
  }

  /**
   * 解析 YAML 值
   */
  private parseYamlValue(value: string): unknown {
    // 移除引号
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      return value.slice(1, -1);
    }

    // 布尔值
    if (value === 'true') {
      return true;
    }
    if (value === 'false') {
      return false;
    }

    // 数字
    if (/^\d+$/.test(value)) {
      return parseInt(value, 10);
    }
    if (/^\d+\.\d+$/.test(value)) {
      return parseFloat(value);
    }

    // 数组（简单格式）
    if (value.startsWith('[') && value.endsWith(']')) {
      return value
        .slice(1, -1)
        .split(',')
        .map((v) => this.parseYamlValue(v.trim()));
    }

    return value;
  }

  /**
   * 合并配置（浅合并）
   */
  private mergeConfig(target: AppConfig, source: Partial<AppConfig>): void {
    for (const key in source) {
      if (Object.prototype.hasOwnProperty.call(source, key)) {
        const sourceValue = source[key as keyof AppConfig];
        const targetValue = target[key as keyof AppConfig];

        if (
          sourceValue &&
          typeof sourceValue === 'object' &&
          !Array.isArray(sourceValue) &&
          targetValue &&
          typeof targetValue === 'object' &&
          !Array.isArray(targetValue)
        ) {
          // 嵌套对象合并
          Object.assign(targetValue as Record<string, unknown>, sourceValue);
        } else if (sourceValue !== undefined) {
          const oldValue = targetValue;
          (target as unknown as Record<string, unknown>)[key] = sourceValue;

          // 触发变更事件
          this.notifyChange(key, oldValue, sourceValue, 'override');
        }
      }
    }
  }

  /**
   * 从环境变量加载配置
   */
  private loadEnvConfig(): Partial<AppConfig> {
    const env = process.env;
    const config: Partial<AppConfig> = {};

    // 应用配置
    if (env.EKET_ENV) {
      config.app = {
        ...DEFAULT_CONFIG.app,
        environment: env.EKET_ENV as 'development' | 'production' | 'test',
        projectRoot: env.EKET_PROJECT_ROOT || process.cwd(),
        name: DEFAULT_CONFIG.app.name,
        version: DEFAULT_CONFIG.app.version,
      };
    }

    // Redis 配置
    if (env.EKET_REMOTE_REDIS_HOST || env.EKET_LOCAL_REDIS_HOST) {
      config.connection = {
        remoteRedis: env.EKET_REMOTE_REDIS_HOST
          ? {
              host: env.EKET_REMOTE_REDIS_HOST,
              port: parseInt(env.EKET_REMOTE_REDIS_PORT || '6379', 10),
              password: env.EKET_REMOTE_REDIS_PASSWORD,
              db: parseInt(env.EKET_REMOTE_REDIS_DB || '0', 10),
            }
          : undefined,
        localRedis: env.EKET_LOCAL_REDIS_HOST
          ? {
              host: env.EKET_LOCAL_REDIS_HOST,
              port: parseInt(env.EKET_LOCAL_REDIS_PORT || '6379', 10),
            }
          : undefined,
        sqlite: undefined,
        fileQueueDir: undefined,
        driverMode: (env.EKET_DRIVER_MODE as 'js' | 'shell') || 'js',
      };
    }

    // SQLite 配置
    if (env.EKET_SQLITE_PATH) {
      config.connection = {
        ...config.connection,
        sqlite: { path: env.EKET_SQLITE_PATH },
        driverMode: config.connection?.driverMode || 'js',
      };
    }

    // 文件队列配置
    if (env.EKET_FILE_QUEUE_DIR) {
      config.connection = {
        ...config.connection,
        fileQueueDir: env.EKET_FILE_QUEUE_DIR,
        driverMode: config.connection?.driverMode || 'js',
      };
    }

    // Master 选举配置
    if (env.EKET_MASTER_ELECTION_ENABLED || env.EKET_MASTER_ELECTION_TIMEOUT) {
      config.masterElection = {
        enabled: env.EKET_MASTER_ELECTION_ENABLED === 'true',
        timeout: parseInt(env.EKET_MASTER_ELECTION_TIMEOUT || '5000', 10),
        declarationPeriod: parseInt(env.EKET_MASTER_ELECTION_DECLARATION_PERIOD || '2000', 10),
        leaseTime: parseInt(env.EKET_MASTER_ELECTION_LEASE_TIME || '30000', 10),
      };
    }

    // 日志配置
    if (env.EKET_LOG_LEVEL || env.EKET_LOG_FORMAT) {
      config.logging = {
        level:
          (env.EKET_LOG_LEVEL as 'debug' | 'info' | 'warn' | 'error') ||
          DEFAULT_CONFIG.logging.level,
        format: (env.EKET_LOG_FORMAT as 'json' | 'text') || DEFAULT_CONFIG.logging.format,
        output: DEFAULT_CONFIG.logging.output,
      };
    }

    // API Key
    if (env.EKET_API_KEY) {
      config.security = {
        ...DEFAULT_CONFIG.security,
        apiKey: env.EKET_API_KEY,
      };
    }

    return config;
  }

  /**
   * 获取配置值
   */
  get<T>(key: string): T | undefined {
    const keys = key.split('.');
    let value: unknown = this.config;

    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = (value as Record<string, unknown>)[k];
      } else {
        return undefined;
      }
    }

    return value as T;
  }

  /**
   * 设置配置值（运行时）
   */
  set<T>(key: string, value: T, source: ConfigSource = 'override'): void {
    const keys = key.split('.');
    const lastKey = keys.pop()!;
    let obj: Record<string, unknown> = this.config as unknown as Record<string, unknown>;

    for (const k of keys) {
      if (!(k in obj)) {
        obj[k] = {};
      }
      obj = obj[k] as Record<string, unknown>;
    }

    const oldValue = obj[lastKey];
    obj[lastKey] = value;

    this.notifyChange(key, oldValue, value, source);
  }

  /**
   * 获取完整配置
   */
  getAll(): AppConfig {
    return { ...this.config };
  }

  /**
   * 验证配置
   */
  validate(): Result<void> {
    const errors: string[] = [];

    // 验证必填配置
    if (!this.config.app.name) {
      errors.push('Missing required configuration: app.name');
    }

    if (!this.config.app.version) {
      errors.push('Missing required configuration: app.version');
    }

    if (!['development', 'production', 'test'].includes(this.config.app.environment)) {
      errors.push('app.environment must be one of: development, production, test');
    }

    if (!['debug', 'info', 'warn', 'error'].includes(this.config.logging.level)) {
      errors.push('logging.level must be one of: debug, info, warn, error');
    }

    // 验证 Redis/SQLite 至少配置一个
    const hasRemoteRedis = !!this.config.connection.remoteRedis;
    const hasLocalRedis = !!this.config.connection.localRedis;
    const hasSqlite = !!this.config.connection.sqlite;
    const hasFileQueue = !!this.config.connection.fileQueueDir;

    if (!hasRemoteRedis && !hasLocalRedis && !hasSqlite && !hasFileQueue) {
      errors.push('At least one connection must be configured (Redis, SQLite, or File)');
    }

    if (errors.length > 0) {
      return {
        success: false,
        error: new EketError(
          'CONFIG_VALIDATION_FAILED',
          `Configuration validation failed:\n${errors.join('\n')}`
        ),
      };
    }

    return { success: true, data: undefined };
  }

  /**
   * 注册配置变更监听器
   */
  on(key: string, listener: ConfigChangeListener): void {
    if (!this.listeners.has(key)) {
      this.listeners.set(key, new Set());
    }
    this.listeners.get(key)!.add(listener);
  }

  /**
   * 移除配置变更监听器
   */
  off(key: string, listener: ConfigChangeListener): void {
    const listeners = this.listeners.get(key);
    if (listeners) {
      listeners.delete(listener);
    }
  }

  /**
   * 获取配置变更历史
   */
  getHistory(key: string): ConfigChangeEvent[] {
    return this.configHistory.get(key) || [];
  }

  /**
   * 通知配置变更
   */
  private notifyChange(
    key: string,
    oldValue: unknown,
    newValue: unknown,
    source: ConfigSource
  ): void {
    const event: ConfigChangeEvent = {
      key,
      oldValue,
      newValue,
      source,
      timestamp: Date.now(),
    };

    // 记录历史
    if (!this.configHistory.has(key)) {
      this.configHistory.set(key, []);
    }
    const history = this.configHistory.get(key)!;
    history.push(event);
    if (history.length > this.maxHistoryLength) {
      history.shift();
    }

    // 通知监听器（精确匹配）
    const exactListeners = this.listeners.get(key);
    if (exactListeners) {
      exactListeners.forEach((listener) => {
        try {
          listener(event);
        } catch (error) {
          console.error(`[ConfigManager] Error in config listener for "${key}":`, error);
        }
      });
    }

    // 通知监听器（通配符匹配）
    const wildcardListeners = this.listeners.get('*');
    if (wildcardListeners) {
      wildcardListeners.forEach((listener) => {
        try {
          listener(event);
        } catch (error) {
          console.error(`[ConfigManager] Error in wildcard config listener:`, error);
        }
      });
    }
  }

  /**
   * 关闭配置管理器
   */
  dispose(): void {
    this.listeners.clear();
    this.configHistory.clear();
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let globalConfigManager: ConfigManager | null = null;

/**
 * 获取全局配置管理器实例
 */
export function getConfigManager(): ConfigManager {
  if (!globalConfigManager) {
    globalConfigManager = new ConfigManager();
  }
  return globalConfigManager;
}

/**
 * 重置全局配置管理器（用于测试）
 */
export function resetConfigManager(): void {
  if (globalConfigManager) {
    globalConfigManager.dispose();
    globalConfigManager = null;
  }
}

// ============================================================================
// Convenience Functions
// ============================================================================

export function getConfig<T>(key: string): T | undefined {
  return getConfigManager().get<T>(key);
}

export function setConfig<T>(key: string, value: T): void {
  getConfigManager().set(key, value);
}

export function validateConfig(): Result<void> {
  return getConfigManager().validate();
}
