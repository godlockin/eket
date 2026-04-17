/**
 * EKET Framework - Skills System
 * Version: 0.9.2
 *
 * Skills 系统入口文件
 */

// 类型导出
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

// 注册表
export { SkillsRegistry, createSkillsRegistry } from './registry.js';

// 加载器
export { SkillLoader, createSkillLoader, loadSkillsFromDirectory, loadSkill } from './loader.js';

// 统一接口
export {
  UnifiedSkillInterface,
  createUnifiedSkillInterface,
  LoggingInterceptor,
  ValidationInterceptor,
  CachingInterceptor,
} from './unified-interface.js';

// 基础 Skills
// Requirements
export {
  RequirementDecompositionSkill,
  type RequirementDecompositionInput,
  type RequirementDecompositionOutput,
} from './requirements/requirement_decomposition.js';

// Design (api_design.ts removed — use api-design.ts instead)

// Development
export {
  FrontendDevelopmentSkill,
  type FrontendDevelopmentInput,
  type FrontendDevelopmentOutput,
  type PropDefinition,
} from './development/frontend_development.js';

// Testing
export {
  UnitTestSkill,
  type UnitTestInput,
  type UnitTestOutput,
  type TestCaseConfig,
  type MockConfig,
} from './testing/unit_test.js';

// DevOps
export {
  DockerBuildSkill,
  type DockerBuildInput,
  type DockerBuildOutput,
} from './devops/docker_build.js';

// Documentation
// api_documentation.ts removed — use api-docs.ts instead
