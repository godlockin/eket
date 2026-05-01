/**
 * EKET Framework - Skills System
 * Version: 0.9.4
 *
 * Skills 系统入口文件
 *
 * 注：skill 实现体（.ts execute函数）已删除 — 仅保留基础设施层。
 * 运行时通过 index-loader 读取 .json 元数据（domain/level/model_hint）做模型路由。
 */

// ============================================================================
// Type exports
// ============================================================================
export type {
  Skill,
  SkillInput,
  SkillOutput,
  SkillCategory,
  SkillDefinition,
  SkillMetadata,
  SkillRegistry,
  SkillRegistryConfig,
  SkillLoaderConfig,
  LoadedSkill,
  SkillLoadResult,
  SkillExecutionContext,
  UnifiedSkillExecuteParams,
  UnifiedSkillExecuteResult,
  SkillInterceptor,
  SkillExecutionEvent,
  SkillEventListener,
} from './types.js';

// ============================================================================
// Infrastructure exports
// ============================================================================

export { SkillsRegistry, createSkillsRegistry } from './registry.js';
export { SkillLoader, createSkillLoader, loadSkillsFromDirectory, loadSkill } from './loader.js';
export {
  UnifiedSkillInterface,
  createUnifiedSkillInterface,
  LoggingInterceptor,
  ValidationInterceptor,
  CachingInterceptor,
} from './unified-interface.js';

// JSON 元数据索引（供 claim/complete 模型路由使用）
export { loadSkillIndex, getSkillIndex } from './index-loader.js';
