/**
 * Structured Logger Module
 *
 * 结构化日志模块
 *
 * 功能：
 * - JSON 格式输出
 * - 包含时间戳、级别、组件、消息
 * - 支持文件和控制台输出
 * - 支持日志级别过滤
 * - 支持上下文合并
 */

import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// Types
// ============================================================================

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  /** ISO 8601 时间戳 */
  timestamp: string;
  /** 日志级别 */
  level: LogLevel;
  /** 组件/模块名称 */
  component: string;
  /** 日志消息 */
  message: string;
  /** 额外上下文数据 */
  context?: Record<string, unknown>;
  /** 调用位置（文件：行号） */
  location?: string;
  /** 错误堆栈 */
  stack?: string;
  /** 请求/会话 ID（用于追踪） */
  traceId?: string;
  /** 进程 ID */
  pid: number;
}

export interface LoggerConfig {
  /** 最低日志级别 */
  minLevel: LogLevel;
  /** 是否输出到控制台 */
  console: boolean;
  /** 是否输出到文件 */
  file: boolean;
  /** 日志文件路径 */
  logDir: string;
  /** 日志文件前缀 */
  filePrefix: string;
  /** 是否包含位置信息 */
  includeLocation: boolean;
  /** 是否包含进程 ID */
  includePid: boolean;
  /** 默认组件名称 */
  defaultComponent: string;
  /** 默认上下文 */
  defaultContext?: Record<string, unknown>;
}

// ============================================================================
// Constants
// ============================================================================

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const DEFAULT_CONFIG: LoggerConfig = {
  minLevel: 'info',
  console: true,
  file: false,
  logDir: './logs',
  filePrefix: 'eket',
  includeLocation: false,
  includePid: true,
  defaultComponent: 'app',
};

// ============================================================================
// Logger Class
// ============================================================================

export class Logger extends EventEmitter {
  private config: LoggerConfig;
  private defaultContext: Record<string, unknown> = {};
  private logFile: fs.WriteStream | null = null;

  constructor(config: Partial<LoggerConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };

    // 初始化文件输出
    if (this.config.file) {
      this.initLogFile();
    }
  }

  /**
   * 设置默认上下文
   */
  setDefaultContext(context: Record<string, unknown>): void {
    this.defaultContext = { ...this.defaultContext, ...context };
  }

  /**
   * 设置 trace ID
   */
  setTraceId(traceId: string): void {
    this.defaultContext.traceId = traceId;
  }

  /**
   * 清除 trace ID
   */
  clearTraceId(): void {
    delete this.defaultContext.traceId;
  }

  /**
   * 创建子 logger（继承上下文）
   */
  child(component: string, context?: Record<string, unknown>): Logger {
    const child = new Logger(this.config);
    child.defaultContext = {
      ...this.defaultContext,
      ...context,
      parentComponent: this.config.defaultComponent,
    };
    child.config.defaultComponent = component;
    return child;
  }

  /**
   * 关闭 logger
   */
  close(): void {
    if (this.logFile) {
      this.logFile.end();
      this.logFile = null;
    }
  }

  /**
   * DEBUG 级别日志
   */
  debug(message: string, context?: Record<string, unknown>): void {
    this.log('debug', message, context);
  }

  /**
   * INFO 级别日志
   */
  info(message: string, context?: Record<string, unknown>): void {
    this.log('info', message, context);
  }

  /**
   * WARN 级别日志
   */
  warn(message: string, context?: Record<string, unknown>): void {
    this.log('warn', message, context);
  }

  /**
   * ERROR 级别日志
   */
  error(message: string, error?: Error | unknown, context?: Record<string, unknown>): void {
    const logContext: Record<string, unknown> = { ...context };

    if (error instanceof Error) {
      logContext.error = error.message;
      logContext.stack = error.stack;
    } else if (error !== undefined) {
      logContext.error = error;
    }

    this.log('error', message, logContext);
  }

  /**
   * 核心日志方法
   */
  private log(level: LogLevel, message: string, context?: Record<string, unknown>): void {
    // 检查日志级别
    if (LOG_LEVELS[level] < LOG_LEVELS[this.config.minLevel]) {
      return;
    }

    const entry = this.createEntry(level, message, context);

    // 输出到控制台
    if (this.config.console) {
      this.writeConsole(entry);
    }

    // 输出到文件
    if (this.config.file && this.logFile) {
      this.write(entry);
    }

    // 触发事件
    this.emit('log', entry);
  }

  /**
   * 创建日志条目
   */
  private createEntry(
    level: LogLevel,
    message: string,
    context?: Record<string, unknown>
  ): LogEntry {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      component: this.config.defaultComponent,
      message,
      context: { ...this.defaultContext, ...context },
      pid: process.pid,
    };

    // 添加位置信息（仅在 debug 模式）
    if (this.config.includeLocation) {
      const location = this.getLocation();
      if (location) {
        entry.location = location;
      }
    }

    // 清理空上下文
    if (entry.context && Object.keys(entry.context).length === 0) {
      delete entry.context;
    }

    return entry;
  }

  /**
   * 获取调用位置
   */
  private getLocation(): string | undefined {
    const error = new Error();
    const stack = error.stack;

    if (!stack) {
      return undefined;
    }

    const lines = stack.split('\n');
    // 跳过前 3 行（Error, getLocation, createEntry, log）
    const callerLine = lines[4];

    if (!callerLine) {
      return undefined;
    }

    const match = callerLine.match(/\((.+):(\d+):(\d+)\)/);
    if (match) {
      return `${path.basename(match[1])}:${match[2]}`;
    }

    return undefined;
  }

  /**
   * 写入控制台
   */
  private writeConsole(entry: LogEntry): void {
    const output = this.formatConsole(entry);

    switch (entry.level) {
      case 'debug':
        console.debug(output);
        break;
      case 'info':
        console.info(output);
        break;
      case 'warn':
        console.warn(output);
        break;
      case 'error':
        console.error(output);
        break;
    }
  }

  /**
   * 格式化控制台输出
   */
  private formatConsole(entry: LogEntry): string {
    const time = entry.timestamp.split('T')[1]?.split('.')[0] || entry.timestamp;
    const level = entry.level.toUpperCase().padEnd(5);
    const component = `[${entry.component}]`;

    let output = `${time} ${level} ${component} ${entry.message}`;

    if (entry.context) {
      output += ' ' + JSON.stringify(entry.context);
    }

    if (entry.stack) {
      output += '\n' + entry.stack;
    }

    return output;
  }

  /**
   * 写入文件
   */
  private write(entry: LogEntry): void {
    if (!this.logFile) {
      return;
    }

    const line = JSON.stringify(entry) + '\n';
    this.logFile.write(line);
  }

  /**
   * 初始化日志文件
   */
  private initLogFile(): void {
    try {
      // 确保目录存在
      fs.mkdirSync(this.config.logDir, { recursive: true });

      // 生成文件名（按日期）
      const date = new Date().toISOString().split('T')[0];
      const fileName = `${this.config.filePrefix}-${date}.log`;
      const filePath = path.join(this.config.logDir, fileName);

      // 创建文件流（追加模式）
      this.logFile = fs.createWriteStream(filePath, { flags: 'a' });

      this.logFile.on('error', (err) => {
        console.error('[Logger] File write error:', err);
        this.config.file = false;
      });
    } catch (err) {
      console.error('[Logger] Failed to init log file:', err);
      this.config.file = false;
    }
  }
}

// ============================================================================
// Singleton
// ============================================================================

let globalLogger: Logger | null = null;

/**
 * 获取全局 Logger 实例
 */
export function getLogger(config?: Partial<LoggerConfig>): Logger {
  if (!globalLogger) {
    globalLogger = new Logger(config);
  }
  return globalLogger;
}

/**
 * 重新初始化全局 Logger
 */
export function initLogger(config: Partial<LoggerConfig>): Logger {
  if (globalLogger) {
    globalLogger.close();
  }
  globalLogger = new Logger(config);
  return globalLogger;
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * 获取或创建组件 logger
 */
export function createLogger(component: string, config?: Partial<LoggerConfig>): Logger {
  const logger = getLogger(config);
  return logger.child(component);
}

// ============================================================================
// Default Exports
// ============================================================================

export const logger = getLogger();
export default logger;
