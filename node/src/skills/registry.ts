/**
 * EKET Framework - Skills Registry
 * Version: 0.9.2
 *
 * Skills 注册表：管理所有已注册的 Skills 和外部 AI 适配器
 */

import type { Skill, SkillRegistry, SkillRegistryConfig } from './types.js';
import type { SkillAdapter, AnyAdapterConfig } from './adapters/types.js';
import { EketError } from '../types/index.js';

/**
 * Skills 注册表实现
 * 提供 Skill 的注册、查询、列表、注销功能以及适配器管理
 */
export class SkillsRegistry implements SkillRegistry {
  /** 存储所有已注册的 Skills */
  private registry: Map<string, Skill>;

  /** 按分类索引 */
  private byCategory: Map<string, Set<string>>;

  /** 配置 */
  private config: Required<SkillRegistryConfig>;

  /** 外部 AI 适配器注册表 */
  private adapters: Map<string, SkillAdapter>;

  /** 适配器配置 */
  private adapterConfigs: Map<string, AnyAdapterConfig>;

  constructor(config?: Partial<SkillRegistryConfig>) {
    this.registry = new Map();
    this.byCategory = new Map();
    this.adapters = new Map();
    this.adapterConfigs = new Map();

    // 默认配置
    this.config = {
      allowOverwrite: false,
      enableLogging: true,
      defaultCategory: 'custom',
      ...config,
    };

    this.log('SkillsRegistry initialized');
  }

  /**
   * 注册 Skill
   * @param skill - 要注册的 Skill 实例
   * @throws EketError 如果注册失败
   */
  register(skill: Skill): void {
    const { name, category } = skill;

    // 检查是否已存在
    if (this.registry.has(name)) {
      if (!this.config.allowOverwrite) {
        throw new EketError(
          'SKILL_ALREADY_REGISTERED',
          `Skill "${name}" is already registered. Set allowOverwrite=true to force.`
        );
      }
      this.log(`Overwriting existing skill: ${name}`);
      this.unregister(name);
    }

    // 验证 Skill
    if (!this.validateSkill(skill)) {
      throw new EketError(
        'INVALID_SKILL',
        `Skill "${name}" does not implement required methods`
      );
    }

    // 注册到主索引
    this.registry.set(name, skill);

    // 注册到分类索引
    const categoryKey = category.toString().toLowerCase();
    if (!this.byCategory.has(categoryKey)) {
      this.byCategory.set(categoryKey, new Set());
    }
    this.byCategory.get(categoryKey)!.add(name);

    this.log(`Registered skill: ${name} (category: ${categoryKey})`);
  }

  /**
   * 获取 Skill
   * @param name - Skill 名称
   * @returns Skill 实例或 undefined
   */
  getSkill(name: string): Skill | undefined {
    const skill = this.registry.get(name);

    if (!skill) {
      this.log(`Skill not found: ${name}`, 'warn');
      return undefined;
    }

    return skill;
  }

  /**
   * 列出所有已注册的 Skills
   * @returns Skill 名称数组
   */
  listSkills(): string[] {
    return Array.from(this.registry.keys());
  }

  /**
   * 注销 Skill
   * @param name - 要注销的 Skill 名称
   */
  unregister(name: string): void {
    const skill = this.registry.get(name);

    if (skill) {
      // 从主索引移除
      this.registry.delete(name);

      // 从分类索引移除
      const categoryKey = skill.category.toString().toLowerCase();
      const categorySet = this.byCategory.get(categoryKey);
      if (categorySet) {
        categorySet.delete(name);
        if (categorySet.size === 0) {
          this.byCategory.delete(categoryKey);
        }
      }

      this.log(`Unregistered skill: ${name}`);
    }
  }

  /**
   * 检查 Skill 是否存在
   * @param name - Skill 名称
   * @returns 是否存在
   */
  hasSkill(name: string): boolean {
    return this.registry.has(name);
  }

  /**
   * 获取指定分类下的所有 Skills
   * @param category - 分类名称
   * @returns 该分类下的所有 Skills
   */
  getSkillsByCategory(category: string): Skill[] {
    const categoryKey = category.toLowerCase();
    const skillNames = this.byCategory.get(categoryKey);

    if (!skillNames) {
      return [];
    }

    const skills: Skill[] = [];
    for (const name of skillNames) {
      const skill = this.registry.get(name);
      if (skill) {
        skills.push(skill);
      }
    }

    return skills;
  }

  /**
   * 清空所有注册
   */
  async clear(): Promise<void> {
    const skillCount = this.registry.size;
    const adapterCount = this.adapters.size;
    const disconnectErrors: string[] = [];

    // 断开所有适配器连接
    for (const [adapterName, adapter] of this.adapters.entries()) {
      try {
        await adapter.disconnect();
      } catch (error) {
        disconnectErrors.push(`${adapterName}: ${error instanceof Error ? error.message : 'Unknown'}`);
      }
    }

    this.registry.clear();
    this.byCategory.clear();
    this.adapters.clear();
    this.adapterConfigs.clear();

    if (disconnectErrors.length > 0) {
      console.warn('[SkillsRegistry] Some adapters failed to disconnect:', disconnectErrors);
    }

    this.log(`Cleared all ${skillCount} registered skills and ${adapterCount} adapters`);
  }

  /**
   * 注册外部 AI 适配器
   * @param name - 适配器名称
   * @param adapter - 适配器实例
   * @param config - 适配器配置
   */
  registerAdapter(name: string, adapter: SkillAdapter, config: AnyAdapterConfig): void {
    this.adapters.set(name, adapter);
    this.adapterConfigs.set(name, config);
    this.log(`Registered adapter: ${name} (source: ${adapter.source})`);
  }

  /**
   * 获取适配器
   * @param name - 适配器名称
   * @returns 适配器实例或 undefined
   */
  getAdapter(name: string): SkillAdapter | undefined {
    const adapter = this.adapters.get(name);

    if (!adapter) {
      this.log(`Adapter not found: ${name}`, 'warn');
      return undefined;
    }

    return adapter;
  }

  /**
   * 检查适配器是否存在
   * @param name - 适配器名称
   */
  hasAdapter(name: string): boolean {
    return this.adapters.has(name);
  }

  /**
   * 注销适配器
   * @param name - 适配器名称
   */
  async unregisterAdapter(name: string): Promise<void> {
    const adapter = this.adapters.get(name);

    if (adapter) {
      try {
        await adapter.disconnect();
      } catch (error) {
        this.log(`Error disconnecting adapter ${name}: ${(error as Error).message}`, 'warn');
      }

      this.adapters.delete(name);
      this.adapterConfigs.delete(name);
      this.log(`Unregistered adapter: ${name}`);
    }
  }

  /**
   * 列出所有已注册的适配器
   * @returns 适配器名称数组
   */
  listAdapters(): string[] {
    return Array.from(this.adapters.keys());
  }

  /**
   * 获取适配器配置
   * @param name - 适配器名称
   * @returns 适配器配置或 undefined
   */
  getAdapterConfig(name: string): AnyAdapterConfig | undefined {
    return this.adapterConfigs.get(name);
  }

  /**
   * 获取注册统计信息
   */
  getStats(): {
    total: number;
    byCategory: Record<string, number>;
    adapters: {
      total: number;
      bySource: Record<string, number>;
    };
  } {
    const stats: Record<string, number> = {};

    for (const [category, skills] of this.byCategory.entries()) {
      stats[category] = skills.size;
    }

    // 适配器统计
    const adapterBySource: Record<string, number> = {};
    for (const adapter of this.adapters.values()) {
      const source = adapter.source;
      adapterBySource[source] = (adapterBySource[source] || 0) + 1;
    }

    return {
      total: this.registry.size,
      byCategory: stats,
      adapters: {
        total: this.adapters.size,
        bySource: adapterBySource,
      },
    };
  }

  /**
   * 验证 Skill 实现
   */
  private validateSkill(skill: Skill): boolean {
    // 必须属性检查
    if (!skill.name || typeof skill.name !== 'string') {
      return false;
    }

    if (!skill.description || typeof skill.description !== 'string') {
      return false;
    }

    if (!skill.category) {
      return false;
    }

    // 必须方法检查
    if (typeof skill.execute !== 'function') {
      return false;
    }

    return true;
  }

  /**
   * 日志输出
   */
  private log(message: string, level: 'info' | 'warn' | 'error' = 'info'): void {
    if (!this.config.enableLogging) {
      return;
    }

    const prefix = '[SkillsRegistry]';
    switch (level) {
      case 'error':
        console.error(`${prefix} [ERROR] ${message}`);
        break;
      case 'warn':
        console.warn(`${prefix} [WARN] ${message}`);
        break;
      default:
        console.log(`${prefix} ${message}`);
    }
  }
}

/**
 * 创建 Skill 注册表实例
 */
export function createSkillsRegistry(config?: Partial<SkillRegistryConfig>): SkillsRegistry {
  return new SkillsRegistry(config);
}

/**
 * 全局单例（延迟初始化）
 */
let globalRegistry: SkillsRegistry | null = null;

/**
 * 获取全局 Skills 注册表
 *
 * @deprecated Use dependency injection instead. Will be removed in v1.1.0.
 *
 * @example
 * ```typescript
 * // Old way (deprecated)
 * const registry = getGlobalSkillsRegistry();
 *
 * // New way (recommended)
 * const registry = new SkillsRegistry(config);
 * const adapter = new OpenCLAWAdapter(config);
 * registry.registerAdapter(adapter);
 * ```
 */
export function getGlobalSkillsRegistry(): SkillsRegistry {
  if (!globalRegistry) {
    globalRegistry = createSkillsRegistry();
  }
  return globalRegistry;
}

/**
 * 重置全局注册表（用于测试）
 */
export function resetGlobalSkillsRegistry(): void {
  globalRegistry = null;
}

// ============================================================================
// 适配器相关导出
// ============================================================================

export type {
  SkillAdapter,
  RemoteSkill,
  ProtocolMessage,
  AdapterConfig,
  OpenCLAWConfig,
  ClaudeCodeConfig,
  CodexConfig,
} from './adapters/types.js';

export {
  OpenCLAWSkillAdapter,
  createOpenCLAWAdapter,
} from './adapters/openclaw-adapter.js';

export {
  ClaudeCodeSkillAdapter,
  createClaudeCodeAdapter,
} from './adapters/claude-code-adapter.js';

export { CodexSkillAdapter, createCodexAdapter } from './adapters/codex-adapter.js';

export { AdapterFactory, defaultAdapterFactory } from './adapters/factory.js';
