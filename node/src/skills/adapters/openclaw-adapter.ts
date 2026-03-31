/**
 * EKET Framework - OpenCLAW Skill Adapter
 * Version: 0.9.2
 *
 * Adapter for integrating with OpenCLAW AI system
 */

import type {
  SkillAdapter,
  OpenCLAWConfig,
  ProtocolMessage,
  SkillRequestPayload,
} from './types.js';
import type { SkillDefinition, SkillExecutionResult } from '../../types/index.js';
import { EketErrorClass } from '../../types/index.js';

/**
 * OpenCLAW API 响应类型
 */
interface OpenCLAWResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

/**
 * OpenCLAW Skill 数据格式
 */
interface OpenCLAWSkillData {
  name: string;
  description: string;
  category: string;
  input_schema?: Record<string, unknown>;
  output_schema?: Record<string, unknown>;
  steps: Array<{
    name: string;
    action: string;
    parameters?: Record<string, unknown>;
  }>;
}

/**
 * OpenCLAW 适配器实现
 *
 * 通过 HTTP API 与 OpenCLAW 系统交互
 */
export class OpenCLAWSkillAdapter implements SkillAdapter {
  readonly source = 'openclaw' as const;
  readonly connected: boolean = false;

  private config: OpenCLAWConfig;
  private baseUrl: string;
  private headers: Record<string, string>;
  private requestIdCounter: number = 0;

  constructor(config: OpenCLAWConfig) {
    this.config = config;
    this.baseUrl = `${config.useHttps !== false ? 'https' : 'http'}://${config.host}:${config.port}`;
    this.headers = {
      'Content-Type': 'application/json',
      'User-Agent': 'EKET-OpenCLAW-Adapter/0.9.2',
    };

    if (config.apiKey) {
      this.headers['Authorization'] = `Bearer ${config.apiKey}`;
    }
  }

  /**
   * 连接到 OpenCLAW 服务器
   */
  async connect(): Promise<void> {
    try {
      // 发送心跳检测连接
      await this.callOpenCLAW<{ status: string }>('health', {});
      Object.defineProperty(this, 'connected', {
        value: true,
        writable: false,
      });
    } catch (error) {
      const err = error as Error;
      throw new EketErrorClass(
        'CONNECTION_FAILED',
        `Failed to connect to OpenCLAW: ${err.message}`,
        { host: this.config.host, port: this.config.port }
      );
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
      const response = await this.callOpenCLAW<OpenCLAWSkillData>('skill.get', { name });

      if (!response) {
        return null;
      }

      return {
        name: response.name,
        description: response.description,
        category: response.category,
        input_schema: response.input_schema,
        output_schema: response.output_schema,
        steps: response.steps.map((step) => ({
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
      const response = await this.callOpenCLAW<{ skills: string[] }>('skill.list', {});
      return response.skills || [];
    } catch (error) {
      const err = error as Error;
      throw new EketErrorClass(
        'EXECUTION_ERROR',
        `Failed to list skills from OpenCLAW: ${err.message}`,
        { source: 'openclaw' }
      );
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

    try {
      const response = await this.callOpenCLAW<Record<string, unknown>>('skill.execute', {
        name: skillName,
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
   * 调用 OpenCLAW API
   */
  private async callOpenCLAW<T>(method: string, params: Record<string, unknown>): Promise<T> {
    const messageId = this.generateMessageId();

    const message: ProtocolMessage<SkillRequestPayload> = {
      id: messageId,
      type: 'skill_request',
      from: 'eket-adapter',
      to: 'openclaw',
      timestamp: Date.now(),
      payload: {
        skillName: method,
        params,
        timeout: this.config.requestTimeout || 30000,
      },
    };

    try {
      const url = `${this.baseUrl}/api/v1/rpc`;
      const response = await fetch(url, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(message),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new EketErrorClass(
          'EXECUTION_ERROR',
          `OpenCLAW API error: ${response.status} ${errorText}`,
          { method, status: response.status }
        );
      }

      const result: OpenCLAWResponse<T> = await response.json() as OpenCLAWResponse<T>;

      if (!result.success) {
        throw new EketErrorClass(
          result.error?.code || 'EXECUTION_ERROR',
          result.error?.message || 'Unknown error from OpenCLAW',
          { method }
        );
      }

      if (!result.data) {
        throw new EketErrorClass('EXECUTION_ERROR', 'No data returned from OpenCLAW', { method });
      }

      return result.data;
    } catch (error) {
      if (error instanceof EketErrorClass) {
        throw error;
      }
      const err = error as Error;
      throw new EketErrorClass(
        'EXECUTION_ERROR',
        `Failed to call OpenCLAW API: ${err.message}`,
        { method, url: this.baseUrl }
      );
    }
  }

  /**
   * 生成消息 ID
   */
  private generateMessageId(): string {
    this.requestIdCounter++;
    return `ocl_${Date.now()}_${this.requestIdCounter}`;
  }
}

/**
 * 创建 OpenCLAW 适配器实例的辅助函数
 */
export function createOpenCLAWAdapter(config: OpenCLAWConfig): OpenCLAWSkillAdapter {
  return new OpenCLAWSkillAdapter(config);
}
