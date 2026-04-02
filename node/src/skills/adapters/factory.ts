/**
 * EKET Framework - Adapter Factory
 * Version: 0.9.2
 *
 * Factory for creating external AI adapters
 */

import { EketErrorClass } from '../../types/index.js';

import { createClaudeCodeAdapter } from './claude-code-adapter.js';
import { createCodexAdapter } from './codex-adapter.js';
import { createOpenCLAWAdapter } from './openclaw-adapter.js';
import type {
  SkillAdapter,
  AnyAdapterConfig,
  OpenCLAWConfig,
  ClaudeCodeConfig,
  CodexConfig,
} from './types.js';

/**
 * 适配器工厂实现
 */
export class AdapterFactory {
  /**
   * 创建适配器实例
   *
   * @param type 适配器类型
   * @param config 配置
   * @returns 适配器实例
   */
  static createAdapter<T extends 'openclaw' | 'claude-code' | 'codex'>(
    type: T,
    config: T extends 'openclaw'
      ? OpenCLAWConfig
      : T extends 'claude-code'
        ? ClaudeCodeConfig
        : CodexConfig
  ): SkillAdapter {
    switch (type) {
      case 'openclaw':
        return createOpenCLAWAdapter(config as OpenCLAWConfig);

      case 'claude-code':
        return createClaudeCodeAdapter(config as ClaudeCodeConfig);

      case 'codex':
        return createCodexAdapter(config as CodexConfig);

      default:
        throw new EketErrorClass('NOT_SUPPORTED', `Unsupported adapter type: ${type}`, {
          supportedTypes: ['openclaw', 'claude-code', 'codex'],
        });
    }
  }

  /**
   * 从配置创建适配器（运行时类型检查）
   *
   * @param config 适配器配置
   * @returns 适配器实例
   */
  static fromConfig(config: AnyAdapterConfig): SkillAdapter {
    return AdapterFactory.createAdapter(config.type, config as never);
  }

  /**
   * 创建并连接适配器
   *
   * @param type 适配器类型
   * @param config 配置
   * @returns 已连接的适配器实例
   */
  static async createAndConnect<T extends 'openclaw' | 'claude-code' | 'codex'>(
    type: T,
    config: T extends 'openclaw'
      ? OpenCLAWConfig
      : T extends 'claude-code'
        ? ClaudeCodeConfig
        : CodexConfig
  ): Promise<SkillAdapter> {
    const adapter = AdapterFactory.createAdapter(type, config);
    await adapter.connect();
    return adapter;
  }

  /**
   * 验证配置
   *
   * @param config 适配器配置
   * @returns 验证结果
   */
  static validateConfig(config: AnyAdapterConfig): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // 通用验证
    if (config.connectionTimeout !== undefined && config.connectionTimeout <= 0) {
      errors.push('connectionTimeout must be positive');
    }
    if (config.requestTimeout !== undefined && config.requestTimeout <= 0) {
      errors.push('requestTimeout must be positive');
    }
    if (config.maxRetries !== undefined && config.maxRetries < 0) {
      errors.push('maxRetries must be non-negative');
    }

    // 类型特定验证
    switch (config.type) {
      case 'openclaw': {
        const openclawConfig = config as OpenCLAWConfig;
        if (!openclawConfig.host) {
          errors.push('OpenCLAW config requires host');
        }
        if (!openclawConfig.port) {
          errors.push('OpenCLAW config requires port');
        }
        if (!openclawConfig.projectRoot) {
          errors.push('OpenCLAW config requires projectRoot');
        }
        break;
      }

      case 'claude-code': {
        const claudeCodeConfig = config as ClaudeCodeConfig;
        if (!claudeCodeConfig.projectRoot) {
          errors.push('Claude Code config requires projectRoot');
        }
        break;
      }

      case 'codex': {
        const codexConfig = config as CodexConfig;
        if (!codexConfig.baseUrl) {
          errors.push('Codex config requires baseUrl');
        }
        if (!codexConfig.apiKey) {
          errors.push('Codex config requires apiKey');
        }
        break;
      }

      default:
        errors.push(`Unknown adapter type: ${(config as AnyAdapterConfig).type}`);
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}

/**
 * 默认工厂实例
 */
export const defaultAdapterFactory = new AdapterFactory();

export default AdapterFactory;
