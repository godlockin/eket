/**
 * Fact-Forcing Gate
 *
 * 借鉴 ECC GateGuard Fact-Forcing 机制：
 * - Edit/Write 文件前，检查是否已 Read 过该文件
 * - 删除文件前，检查是否已 grep 过反向引用
 *
 * 核心理念：不问"确定吗"（AI 总是回答是），而是要求提供具体证据。
 *
 * 环境变量：EKET_FACT_FORCING=off 临时禁用
 *
 * @module FactForcingGate
 */

import path from 'path';

import type { MiddlewareNode } from '../../core/middleware-pipeline.js';

// ============================================================================
// Types
// ============================================================================

export interface FactForcingState extends Record<string, unknown> {
  toolName: string;
  toolInput: Record<string, unknown>;
  sessionId: string;
  /** 记录本会话已读取的文件路径 */
  readFiles?: Set<string>;
  /** 记录本会话已 grep 过的模式 */
  grepPatterns?: Set<string>;
  /** Gate 检查结果 */
  gateResult?: {
    passed: boolean;
    reason?: string;
    requiredAction?: string;
  };
}

export interface FactForcingConfig {
  /** 是否启用（默认 true，可通过 EKET_FACT_FORCING=off 禁用） */
  enabled?: boolean;
  /** 需要检查的写操作工具名 */
  writeTools?: string[];
  /** 需要检查的删除操作工具名 */
  deleteTools?: string[];
  /** 记录读取操作的工具名 */
  readTools?: string[];
  /** 记录 grep 操作的工具名 */
  grepTools?: string[];
}

// ============================================================================
// Session Tracker
// ============================================================================

/** Session TTL: 30 minutes */
export const SESSION_TTL_MS = 30 * 60 * 1000;

interface SessionData {
  readFiles: Set<string>;
  grepPatterns: Set<string>;
  lastAccess: number;
}

/**
 * 会话级文件访问追踪器
 * 记录每个会话已读取的文件和已 grep 的模式
 * 支持 TTL 自动清理过期会话，防止内存泄漏
 */
export class SessionTracker {
  private sessions: Map<string, SessionData> = new Map();
  private ttlMs: number;

  constructor(ttlMs: number = SESSION_TTL_MS) {
    this.ttlMs = ttlMs;
  }

  /**
   * 清理过期会话
   */
  private cleanupExpiredSessions(): void {
    const now = Date.now();
    for (const [sessionId, data] of this.sessions) {
      if (now - data.lastAccess > this.ttlMs) {
        this.sessions.delete(sessionId);
      }
    }
  }

  /**
   * 获取或创建会话数据
   */
  private getSession(sessionId: string): SessionData {
    // 访问时清理过期 session
    this.cleanupExpiredSessions();

    if (!this.sessions.has(sessionId)) {
      this.sessions.set(sessionId, {
        readFiles: new Set(),
        grepPatterns: new Set(),
        lastAccess: Date.now(),
      });
    }
    const session = this.sessions.get(sessionId)!;
    session.lastAccess = Date.now(); // 更新访问时间
    return session;
  }

  /**
   * 记录文件读取
   */
  recordRead(sessionId: string, filePath: string): void {
    const session = this.getSession(sessionId);
    session.readFiles.add(this.normalizePath(filePath));
  }

  /**
   * 记录 grep 模式
   */
  recordGrep(sessionId: string, pattern: string): void {
    const session = this.getSession(sessionId);
    session.grepPatterns.add(pattern);
  }

  /**
   * 检查文件是否已读取
   */
  hasRead(sessionId: string, filePath: string): boolean {
    const session = this.getSession(sessionId);
    return session.readFiles.has(this.normalizePath(filePath));
  }

  /**
   * 检查是否已 grep 过（模糊匹配：检查任何已记录的 pattern）
   */
  hasGrepped(sessionId: string): boolean {
    const session = this.getSession(sessionId);
    return session.grepPatterns.size > 0;
  }

  /**
   * 获取会话已读取的文件列表
   */
  getReadFiles(sessionId: string): string[] {
    const session = this.getSession(sessionId);
    return Array.from(session.readFiles);
  }

  /**
   * 获取会话已 grep 的模式列表
   */
  getGrepPatterns(sessionId: string): string[] {
    const session = this.getSession(sessionId);
    return Array.from(session.grepPatterns);
  }

  /**
   * 清理会话数据
   */
  clearSession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  /**
   * 清理所有会话数据
   */
  clearAllSessions(): void {
    this.sessions.clear();
  }

  /**
   * 获取当前会话数量
   */
  getSessionCount(): number {
    return this.sessions.size;
  }

  /**
   * 规范化路径
   */
  private normalizePath(filePath: string): string {
    // 1. 使用 path.normalize 处理 ../、//、等
    let normalized = path.normalize(filePath);
    // 2. 去除前导 ./
    normalized = normalized.replace(/^\.[\\/]/, '');
    // 3. 统一使用 / 作为分隔符
    normalized = normalized.replace(/\\/g, '/');
    // 4. 去除尾部斜杠
    normalized = normalized.replace(/\/$/, '');
    return normalized;
  }
}

// ============================================================================
// Global Tracker Instance
// ============================================================================

export const globalSessionTracker = new SessionTracker();

// ============================================================================
// Fact-Forcing Gate Logic
// ============================================================================

const DEFAULT_CONFIG: Required<FactForcingConfig> = {
  enabled: true,
  writeTools: ['Edit', 'Write', 'NotebookEdit'],
  deleteTools: ['Bash'], // rm, unlink 等通过 Bash 执行
  readTools: ['Read'],
  grepTools: ['Bash'], // grep, rg 等通过 Bash 执行
};

/**
 * 从工具输入中提取文件路径
 */
export function extractFilePath(toolInput: Record<string, unknown>): string | null {
  // 常见的文件路径字段名
  const pathFields = ['file_path', 'filePath', 'path', 'filename', 'file', 'notebook_path'];
  for (const field of pathFields) {
    const value = toolInput[field];
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
  }
  return null;
}

/**
 * 检查 Bash 命令是否为删除操作
 * 只匹配命令开头或管道后的删除命令，忽略引号内的内容
 */
export function isDeleteCommand(command: string): boolean {
  // 移除引号内的内容以避免误匹配
  const withoutQuotes = command.replace(/"[^"]*"/g, '""').replace(/'[^']*'/g, "''");
  const deletePatterns = [
    /(?:^|&&|\|\||;|\|)\s*rm\s+(-[rf]+\s+)?[^\s]/i,
    /(?:^|&&|\|\||;|\|)\s*unlink\s+/i,
    /(?:^|&&|\|\||;|\|)\s*rmdir\s+/i,
    /(?:^|&&|\|\||;|\|)\s*del\s+/i,
    /(?:^|&&|\|\||;|\|)\s*remove-item\s+/i,
  ];
  return deletePatterns.some((pattern) => pattern.test(withoutQuotes));
}

/**
 * 检查 Bash 命令是否为 grep 操作
 * 只匹配命令开头或管道后的 grep 命令，忽略引号内的内容
 */
export function isGrepCommand(command: string): boolean {
  // 移除引号内的内容以避免误匹配
  const withoutQuotes = command.replace(/"[^"]*"/g, '""').replace(/'[^']*'/g, "''");
  const grepPatterns = [
    /(?:^|&&|\|\||;|\|)\s*grep\s+/i,
    /(?:^|&&|\|\||;|\|)\s*rg\s+/i,
    /(?:^|&&|\|\||;|\|)\s*ag\s+/i,
    /(?:^|&&|\|\||;|\|)\s*ack\s+/i,
    /(?:^|&&|\|\||;|\|)\s*find\s+.*-name/i,
    /(?:^|&&|\|\||;|\|)\s*find\s+.*-exec\s+grep/i,
  ];
  return grepPatterns.some((pattern) => pattern.test(withoutQuotes));
}

/**
 * 从删除命令中提取目标文件路径
 */
export function extractDeleteTarget(command: string): string | null {
  // rm -rf /path/to/file
  const rmMatch = command.match(/\brm\s+(?:-[rf]+\s+)?(.+?)(?:\s|$)/i);
  if (rmMatch) {
    return rmMatch[1].trim();
  }
  // unlink /path/to/file
  const unlinkMatch = command.match(/\bunlink\s+(.+?)(?:\s|$)/i);
  if (unlinkMatch) {
    return unlinkMatch[1].trim();
  }
  return null;
}

/**
 * 从 grep 命令中提取模式
 */
export function extractGrepPattern(command: string): string | null {
  // grep "pattern" file
  const grepMatch = command.match(/\b(?:grep|rg|ag|ack)\s+(?:-[^\s]*\s+)*["']?([^"'\s]+)/i);
  if (grepMatch) {
    return grepMatch[1];
  }
  return null;
}

/**
 * Fact-Forcing Gate 检查
 */
export function checkFactForcing(
  toolName: string,
  toolInput: Record<string, unknown>,
  sessionId: string,
  tracker: SessionTracker,
  config: Required<FactForcingConfig>
): { passed: boolean; reason?: string; requiredAction?: string } {
  // 检查是否禁用
  if (!config.enabled || process.env.EKET_FACT_FORCING === 'off') {
    return { passed: true };
  }

  // 1. 处理读取操作：记录已读文件
  if (config.readTools.includes(toolName)) {
    const filePath = extractFilePath(toolInput);
    if (filePath) {
      tracker.recordRead(sessionId, filePath);
    }
    return { passed: true };
  }

  // 2. 处理 Bash 命令中的 grep：记录 grep 模式
  if (toolName === 'Bash') {
    const command = (toolInput.command as string) || '';
    if (isGrepCommand(command)) {
      const pattern = extractGrepPattern(command);
      if (pattern) {
        tracker.recordGrep(sessionId, pattern);
      }
      return { passed: true };
    }
  }

  // 3. 写操作检查：必须先 Read
  if (config.writeTools.includes(toolName)) {
    const filePath = extractFilePath(toolInput);
    if (filePath && !tracker.hasRead(sessionId, filePath)) {
      return {
        passed: false,
        reason: `Fact-Forcing: Cannot ${toolName} file "${filePath}" without reading it first`,
        requiredAction: `Use Read tool to read "${filePath}" before editing`,
      };
    }
    return { passed: true };
  }

  // 4. 删除操作检查：必须先 grep 反向引用
  if (toolName === 'Bash') {
    const command = (toolInput.command as string) || '';
    if (isDeleteCommand(command)) {
      const target = extractDeleteTarget(command);
      if (target && !tracker.hasGrepped(sessionId)) {
        return {
          passed: false,
          reason: `Fact-Forcing: Cannot delete "${target}" without checking for references first`,
          requiredAction: `Use grep/rg to search for references to "${target}" before deleting`,
        };
      }
    }
  }

  return { passed: true };
}

// ============================================================================
// Pipeline Node Factory
// ============================================================================

/**
 * 创建 Fact-Forcing Gate 节点
 */
export function createFactForcingNode(
  config?: FactForcingConfig
): MiddlewareNode<FactForcingState> {
  const mergedConfig: Required<FactForcingConfig> = {
    ...DEFAULT_CONFIG,
    ...config,
  };

  return {
    id: 'FactForcingGate',
    deps: [],
    parallel: true,
    failBehavior: 'block',
    handle: async (state) => {
      const result = checkFactForcing(
        state.toolName,
        state.toolInput,
        state.sessionId,
        globalSessionTracker,
        mergedConfig
      );

      if (!result.passed) {
        // 返回带有 deny action 的状态
        return {
          ...state,
          gateResult: result,
          response: {
            action: 'deny' as const,
            reason: result.reason,
            feedback: result.requiredAction,
          },
        };
      }

      return {
        ...state,
        gateResult: result,
      };
    },
  };
}

// ============================================================================
// Integration with PreToolUse Pipeline
// ============================================================================

export { globalSessionTracker as sessionTracker };
