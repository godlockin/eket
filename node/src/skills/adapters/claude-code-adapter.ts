/**
 * EKET Framework - Claude Code Skill Adapter
 * Version: 0.9.2
 *
 * Adapter for integrating with Claude Code via file system interaction
 */

import * as fs from 'fs';
import * as path from 'path';
import { mkdir, writeFile, readFile, readdir, access } from 'fs/promises';
import type { SkillAdapter, ClaudeCodeConfig } from './types.js';
import type { SkillDefinition, SkillExecutionResult } from '../../types/index.js';
import { EketErrorClass } from '../../types/index.js';

/**
 * Claude Code Inbox 消息格式
 */
interface ClaudeCodeInboxMessage {
  /** 请求 ID */
  requestId: string;
  /** 请求类型 */
  type: 'skill_request' | 'skill_query';
  /** Skill 名称 */
  skillName?: string;
  /** 查询内容 */
  query?: string;
  /** 参数 */
  params?: Record<string, unknown>;
  /** 创建时间 */
  createdAt: number;
}

/**
 * Claude Code Outbox 响应格式
 */
interface ClaudeCodeOutboxResponse {
  /** 对应的请求 ID */
  requestId: string;
  /** 是否成功 */
  success: boolean;
  /** Skill 定义（如果是 fetch 请求） */
  skill?: SkillDefinition;
  /** Skills 列表（如果是 list 请求） */
  skills?: string[];
  /** 执行结果（如果是 execute 请求） */
  result?: Record<string, unknown>;
  /** 错误信息 */
  error?: string;
  /** 完成时间 */
  completedAt: number;
}

/**
 * Claude Code 适配器实现
 *
 * 通过文件系统与 Claude Code 交互
 */
export class ClaudeCodeSkillAdapter implements SkillAdapter {
  readonly source = 'claude-code' as const;
  connected: boolean = false;

  private config: ClaudeCodeConfig;
  private inboxDir: string;
  private outboxDir: string;
  private pendingRequests: Map<string, {
    resolve: (value: ClaudeCodeOutboxResponse) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
  }>;
  private pollInterval?: NodeJS.Timeout;

  constructor(config: ClaudeCodeConfig) {
    this.config = config;
    this.inboxDir = config.inboxDir || path.join(config.projectRoot, '.eket', 'inbox');
    this.outboxDir = config.outboxDir || path.join(config.projectRoot, '.eket', 'outbox');
    this.pendingRequests = new Map();
  }

  /**
   * 连接到 Claude Code（初始化目录）
   */
  async connect(): Promise<void> {
    try {
      // 确保目录存在
      await mkdir(this.inboxDir, { recursive: true });
      await mkdir(this.outboxDir, { recursive: true });

      // 验证目录可写
      await this.testDirectoryAccess(this.inboxDir);
      await this.testDirectoryAccess(this.outboxDir);

      // 启动响应轮询
      this.startPolling();

      Object.defineProperty(this, 'connected', {
        value: true,
        writable: false,
      });
    } catch (error) {
      const err = error as Error;
      throw new EketErrorClass(
        'CONNECTION_FAILED',
        `Failed to connect to Claude Code: ${err.message}`,
        { inboxDir: this.inboxDir, outboxDir: this.outboxDir }
      );
    }
  }

  /**
   * 断开连接
   */
  async disconnect(): Promise<void> {
    // 停止轮询
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = undefined;
    }

    // 清理待处理的请求
    for (const [, request] of this.pendingRequests) {
      clearTimeout(request.timeout);
      request.reject(new EketErrorClass('CONNECTION_FAILED', 'Adapter disconnected'));
    }
    this.pendingRequests.clear();

    Object.defineProperty(this, 'connected', {
      value: false,
      writable: false,
    });
  }

  /**
   * 从 Inbox 读取 Skill 请求
   */
  async readSkillFromInbox(): Promise<ClaudeCodeInboxMessage | null> {
    try {
      const files = await readdir(this.inboxDir);
      const requestFiles = files.filter((f) => f.endsWith('.request.json'));

      if (requestFiles.length === 0) {
        return null;
      }

      // 读取最早的请求
      const oldestFile = requestFiles.sort()[0];
      const filePath = path.join(this.inboxDir, oldestFile);

      const content = await readFile(filePath, 'utf-8');
      const message: ClaudeCodeInboxMessage = JSON.parse(content);

      // 删除已读取的请求文件
      await fs.promises.unlink(filePath);

      return message;
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === 'ENOENT') {
        return null;
      }
      throw new EketErrorClass(
        'EXECUTION_ERROR',
        `Failed to read from inbox: ${err.message}`,
        { inboxDir: this.inboxDir }
      );
    }
  }

  /**
   * 写入 Skill 结果到 Outbox
   */
  async writeSkillResult(result: ClaudeCodeOutboxResponse): Promise<void> {
    try {
      const fileName = `${result.requestId}.response.json`;
      const filePath = path.join(this.outboxDir, fileName);

      // 原子写入：先写临时文件，再 rename
      const tempPath = `${filePath}.tmp.${Date.now()}`;
      await writeFile(tempPath, JSON.stringify(result, null, 2), 'utf-8');
      await fs.promises.rename(tempPath, filePath);
    } catch (error) {
      const err = error as Error;
      throw new EketErrorClass(
        'EXECUTION_ERROR',
        `Failed to write to outbox: ${err.message}`,
        { outboxDir: this.outboxDir }
      );
    }
  }

  /**
   * 获取 Skill 定义
   */
  async fetchSkill(name: string): Promise<SkillDefinition | null> {
    const requestId = this.generateRequestId();

    try {
      // 写入请求到 inbox
      const request: ClaudeCodeInboxMessage = {
        requestId,
        type: 'skill_query',
        skillName: name,
        createdAt: Date.now(),
      };

      await this.writeToInbox(request);

      // 等待响应
      const response = await this.waitForResponse(requestId);

      if (!response.success || !response.skill) {
        return null;
      }

      return response.skill;
    } catch (error) {
      const err = error as EketErrorClass;
      if ((err as any).code === 'TIMEOUT') {
        return null;
      }
      throw err;
    }
  }

  /**
   * 列出可用的 Skills
   */
  async listSkills(): Promise<string[]> {
    const requestId = this.generateRequestId();

    try {
      // 写入请求到 inbox
      const request: ClaudeCodeInboxMessage = {
        requestId,
        type: 'skill_query',
        query: 'list_all_skills',
        createdAt: Date.now(),
      };

      await this.writeToInbox(request);

      // 等待响应
      const response = await this.waitForResponse(requestId);

      if (!response.success || !response.skills) {
        return [];
      }

      return response.skills;
    } catch (error) {
      const err = error as EketErrorClass;
      if ((err as any).code === 'TIMEOUT') {
        return [];
      }
      throw err;
    }
  }

  /**
   * 执行 Skill
   */
  async execute(
    skillName: string,
    params: Record<string, unknown>
  ): Promise<SkillExecutionResult> {
    const startTime = Date.now();
    const requestId = this.generateRequestId();

    try {
      // 写入执行请求到 inbox
      const request: ClaudeCodeInboxMessage = {
        requestId,
        type: 'skill_request',
        skillName,
        params,
        createdAt: Date.now(),
      };

      await this.writeToInbox(request);

      // 等待响应
      const response = await this.waitForResponse(requestId);

      if (!response.success) {
        return {
          success: false,
          error: response.error,
          duration: Date.now() - startTime,
        };
      }

      return {
        success: true,
        output: response.result,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      const err = error as EketErrorClass;
      return {
        success: false,
        error: err.message,
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * 写入请求到 Inbox
   */
  private async writeToInbox(message: ClaudeCodeInboxMessage): Promise<void> {
    const fileName = `${message.requestId}.request.json`;
    const filePath = path.join(this.inboxDir, fileName);

    // 原子写入
    const tempPath = `${filePath}.tmp.${Date.now()}`;
    await writeFile(tempPath, JSON.stringify(message, null, 2), 'utf-8');
    await fs.promises.rename(tempPath, filePath);
  }

  /**
   * 等待响应
   */
  private async waitForResponse(requestId: string): Promise<ClaudeCodeOutboxResponse> {
    return new Promise((resolve, reject) => {
      const timeoutMs = this.config.requestTimeout || 60000;

      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new EketErrorClass('TIMEOUT', `Request ${requestId} timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      this.pendingRequests.set(requestId, {
        resolve,
        reject,
        timeout,
      });
    });
  }

  /**
   * 轮询 Outbox 响应
   */
  private startPolling(): void {
    const pollIntervalMs = 500; // 每 500ms 轮询一次

    this.pollInterval = setInterval(async () => {
      try {
        await this.processOutboxResponses();
      } catch (error) {
        // 静默处理轮询错误，避免影响主流程
      }
    }, pollIntervalMs);
  }

  /**
   * 处理 Outbox 响应
   */
  private async processOutboxResponses(): Promise<void> {
    try {
      const files = await readdir(this.outboxDir);
      const responseFiles = files.filter((f) => f.endsWith('.response.json'));

      for (const fileName of responseFiles) {
        const filePath = path.join(this.outboxDir, fileName);

        // 提取 requestId
        const requestId = fileName.replace('.response.json', '');

        // 检查是否有待处理的请求
        const pending = this.pendingRequests.get(requestId);
        if (!pending) {
          // 没有待处理的请求，可能是过期响应，跳过
          continue;
        }

        try {
          const content = await readFile(filePath, 'utf-8');
          const response: ClaudeCodeOutboxResponse = JSON.parse(content);

          // 清理
          clearTimeout(pending.timeout);
          this.pendingRequests.delete(requestId);
          await fs.promises.unlink(filePath);

          // 解决 Promise - 直接传递响应对象
          pending.resolve(response);
        } catch (error) {
          // 读取/解析失败，跳过此文件
          continue;
        }
      }
    } catch (error) {
      // 目录读取失败，静默处理
    }
  }

  /**
   * 测试目录访问权限
   */
  private async testDirectoryAccess(dirPath: string): Promise<void> {
    try {
      await access(dirPath, fs.constants.R_OK | fs.constants.W_OK);
    } catch (error) {
      const err = error as Error;
      throw new EketErrorClass(
        'PERMISSION_DENIED',
        `Cannot access directory ${dirPath}: ${err.message}`,
        { path: dirPath }
      );
    }
  }

  /**
   * 生成请求 ID
   */
  private generateRequestId(): string {
    return `cc_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  }
}

/**
 * 创建 Claude Code 适配器实例的辅助函数
 */
export function createClaudeCodeAdapter(config: ClaudeCodeConfig): ClaudeCodeSkillAdapter {
  return new ClaudeCodeSkillAdapter(config);
}
