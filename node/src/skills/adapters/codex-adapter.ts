/**
 * EKET Framework - Codex Skill Adapter
 * Version: 0.9.2
 *
 * Adapter for integrating with Codex via HTTP API
 */

import type { SkillDefinition, SkillExecutionResult } from '../../types/index.js';
import { EketErrorClass } from '../../types/index.js';

import type { SkillAdapter, CodexConfig } from './types.js';

/**
 * Codex API 请求格式
 */
interface CodexAPIRequest {
  /** API 方法 */
  method: string;
  /** 请求参数 */
  params: Record<string, unknown>;
  /** 请求 ID */
  requestId: string;
}

/**
 * Codex API 响应格式
 */
interface CodexAPIResponse<T> {
  /** 是否成功 */
  success: boolean;
  /** 响应数据 */
  data?: T;
  /** 错误信息 */
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
  /** 请求 ID */
  requestId: string;
}

/**
 * Codex Skill 数据格式
 */
interface CodexSkillData {
  id: string;
  name: string;
  description: string;
  category: string;
  version: string;
  input_schema?: Record<string, unknown>;
  output_schema?: Record<string, unknown>;
  steps: Array<{
    name: string;
    action: string;
    parameters?: Record<string, unknown>;
  }>;
}

/**
 * Codex 适配器实现
 *
 * 通过 HTTP API 与 Codex 系统交互
 */
export class CodexSkillAdapter implements SkillAdapter {
  readonly source = 'codex' as const;
  readonly connected: boolean = false;

  private baseUrl: string;
  private headers: Record<string, string>;
  private requestIdCounter = 0;

  constructor(config: CodexConfig) {
    this.baseUrl = config.baseUrl;
    this.headers = {
      'Content-Type': 'application/json',
      'User-Agent': 'EKET-Codex-Adapter/0.9.2',
    };

    // 添加 API Key
    this.headers['Authorization'] = `Bearer ${config.apiKey}`;

    // 添加组织 ID（如果提供）
    if (config.organizationId) {
      this.headers['X-Organization-ID'] = config.organizationId;
    }
  }

  /**
   * 连接到 Codex 服务器
   */
  async connect(): Promise<void> {
    try {
      // 验证 API 连接
      await this.callCodexAPI<{ status: string; version: string }>('/health', {});
      Object.defineProperty(this, 'connected', {
        value: true,
        writable: false,
      });
    } catch (error) {
      const err = error as Error;
      throw new EketErrorClass('CONNECTION_FAILED', `Failed to connect to Codex: ${err.message}`, {
        baseUrl: this.baseUrl,
      });
    }
  }

  /**
   * 断开连接
   */
  async disconnect(): Promise<void> {
    Object.defineProperty(this, 'connected', {
      value: false,
      writable: false,
    });
  }

  /**
   * 获取 Skill 定义
   */
  async fetchSkill(name: string): Promise<SkillDefinition | null> {
    try {
      const response = await this.callCodexAPI<CodexSkillData>('/skills/get', { name });

      if (!response) {
        return null;
      }

      return {
        name: response.name,
        description: response.description,
        category: response.category,
        input_schema: response.input_schema,
        output_schema: response.output_schema,
        steps: (response.steps || []).map((step) => ({
          name: step.name,
          action: step.action,
          parameters: step.parameters,
        })),
      };
    } catch (error) {
      const err = error as EketErrorClass;
      if (err.code === 'NOT_FOUND' || err.message.includes('not found')) {
        return null;
      }
      throw err;
    }
  }

  /**
   * 列出可用的 Skills
   */
  async listSkills(): Promise<string[]> {
    try {
      const response = await this.callCodexAPI<{ skills: Array<{ name: string }> }>(
        '/skills/list',
        {}
      );
      return response.skills.map((s) => s.name);
    } catch (error) {
      // 错误时返回空数组而不是抛出错误
      return [];
    }
  }

  /**
   * 执行 Skill
   */
  async execute(skillName: string, params: Record<string, unknown>): Promise<SkillExecutionResult> {
    const startTime = Date.now();

    try {
      const response = await this.callCodexAPI<Record<string, unknown>>('/skills/execute', {
        skill_name: skillName,
        params,
      });

      return {
        success: true,
        output: response,
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
   * 调用 Codex API
   */
  private async callCodexAPI<T>(endpoint: string, params: Record<string, unknown>): Promise<T> {
    const requestId = this.generateRequestId();

    const request: CodexAPIRequest = {
      method: endpoint,
      params,
      requestId,
    };

    try {
      const url = `${this.baseUrl.replace(/\/$/, '')}${endpoint}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new EketErrorClass(
          'EXECUTION_ERROR',
          `Codex API error: ${response.status} ${errorText}`,
          { endpoint, status: response.status }
        );
      }

      const result: CodexAPIResponse<T> = (await response.json()) as CodexAPIResponse<T>;

      if (!result.success) {
        throw new EketErrorClass(
          result.error?.code || 'EXECUTION_ERROR',
          result.error?.message || 'Unknown error from Codex',
          { endpoint, requestId }
        );
      }

      if (!result.data) {
        throw new EketErrorClass('EXECUTION_ERROR', 'No data returned from Codex', {
          endpoint,
          requestId,
        });
      }

      return result.data;
    } catch (error) {
      if (error instanceof EketErrorClass) {
        throw error;
      }
      const err = error as Error;
      throw new EketErrorClass('EXECUTION_ERROR', `Failed to call Codex API: ${err.message}`, {
        endpoint,
        baseUrl: this.baseUrl,
      });
    }
  }

  /**
   * 生成请求 ID
   */
  private generateRequestId(): string {
    this.requestIdCounter++;
    return `codex_${Date.now()}_${this.requestIdCounter}`;
  }
}

/**
 * 创建 Codex 适配器实例的辅助函数
 */
export function createCodexAdapter(config: CodexConfig): CodexSkillAdapter {
  return new CodexSkillAdapter(config);
}
