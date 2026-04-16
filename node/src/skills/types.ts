/**
 * EKET Framework - Skills System Types
 * Version: 0.9.2
 */

// ============================================================================
// Skill Category Enumeration
// ============================================================================

/**
 * Skill 分类枚举
 * 定义所有支持的 Skill 类别
 */
export enum SkillCategory {
  REQUIREMENTS = 'requirements',
  DESIGN = 'design',
  DEVELOPMENT = 'development',
  TESTING = 'testing',
  DEVOPS = 'devops',
  DOCUMENTATION = 'documentation',
  ANALYSIS = 'analysis',
  SECURITY = 'security',
  DATA = 'data',
  CUSTOM = 'custom',
  UX = 'ux',
}

// ============================================================================
// Skill Input/Output Types
// ============================================================================

/**
 * Skill 输入接口
 * 泛型 T 表示具体的输入数据类型
 */
export interface SkillInput<T = Record<string, unknown>> {
  /** 输入数据 */
  data: T;
  /** 执行上下文 */
  context: SkillExecutionContext;
  /** 额外参数 */
  parameters?: Record<string, unknown>;
}

/**
 * Skill 输出接口
 * 泛型 T 表示具体的输出数据类型
 */
export interface SkillOutput<T = Record<string, unknown>> {
  /** 是否成功 */
  success: boolean;
  /** 输出数据 */
  data?: T;
  /** 错误信息（如果失败） */
  error?: string;
  /** 错误码 */
  errorCode?: string;
  /** 执行时长（毫秒） */
  duration: number;
  /** 日志信息 */
  logs?: string[];
}

/**
 * Skill 执行上下文
 * 在 Skill 执行过程中传递的状态信息
 */
export interface SkillExecutionContext {
  /** 项目根目录 */
  projectRoot: string;
  /** 关联的 Ticket ID */
  ticketId?: string;
  /** 关联的 Instance ID */
  instanceId?: string;
  /** Worktree 路径 */
  worktreePath?: string;
  /** 执行模式 */
  mode?: 'dry_run' | 'verification' | 'production';
  /** 变量存储 */
  variables: Record<string, unknown>;
}

// ============================================================================
// Skill Definition Types
// ============================================================================

/**
 * Skill 接口
 * 泛型 P: 输入参数类型
 * 泛型 R: 返回结果类型
 */
export interface Skill<P = Record<string, unknown>, R = Record<string, unknown>> {
  /** Skill 名称 */
  readonly name: string;
  /** Skill 描述 */
  readonly description: string;
  /** 所属分类 */
  readonly category: SkillCategory | string;
  /** 输入参数 Schema */
  readonly inputSchema?: Record<string, unknown>;
  /** 输出结果 Schema */
  readonly outputSchema?: Record<string, unknown>;
  /** 执行方法 */
  execute(input: SkillInput<P>): Promise<SkillOutput<R>>;
  /** 验证输入 */
  validateInput?(input: unknown): boolean;
  /** 技能标签 */
  readonly tags?: string[];
  /** 技能版本 */
  readonly version?: string;
}

/**
 * Skill 元数据
 */
export interface SkillMetadata {
  /** Skill 名称 */
  name: string;
  /** 描述 */
  description: string;
  /** 分类 */
  category: string;
  /** 标签 */
  tags: string[];
  /** 版本 */
  version: string;
  /** 作者 */
  author?: string;
  /** 创建时间 */
  createdAt?: number;
  /** 更新时间 */
  updatedAt?: number;
}

// ============================================================================
// Skill Registry Types
// ============================================================================

/**
 * Skill 注册表接口
 * 管理所有已注册的 Skills
 */
export interface SkillRegistry {
  /** 注册 Skill */
  register(skill: Skill): void;
  /** 获取 Skill */
  getSkill(name: string): Skill | undefined;
  /** 列出所有 Skills */
  listSkills(): string[];
  /** 注销 Skill */
  unregister(name: string): void;
  /** 检查 Skill 是否存在 */
  hasSkill(name: string): boolean;
  /** 获取分类下的所有 Skills */
  getSkillsByCategory(category: string): Skill[];
  /** 清空所有注册 */
  clear(): void;
}

/**
 * Skill 注册配置
 */
export interface SkillRegistryConfig {
  /** 是否允许重复注册 */
  allowOverwrite: boolean;
  /** 是否启用日志 */
  enableLogging: boolean;
  /** 默认分类 */
  defaultCategory: string;
}

// ============================================================================
// Skill Loader Types
// ============================================================================

/**
 * Skill 加载器配置
 */
export interface SkillLoaderConfig {
  /** Skills 根目录 */
  skillsRootDir: string;
  /** 是否递归加载子目录 */
  recursive: boolean;
  /** 文件扩展名 */
  fileExtension: string;
  /** 是否启用缓存 */
  enableCache: boolean;
  /** 缓存 TTL（毫秒） */
  cacheTTL: number;
}

/**
 * 已加载的 Skill 信息
 */
export interface LoadedSkill {
  /** Skill 实例 */
  skill: Skill;
  /** 文件路径 */
  filePath: string;
  /** 加载时间 */
  loadedAt: number;
  /** 是否已过期 */
  expired: boolean;
}

/**
 * Skill 加载结果
 */
export interface SkillLoadResult {
  /** 是否成功 */
  success: boolean;
  /** 加载的 Skills */
  skills?: Skill[];
  /** 错误信息 */
  error?: string;
  /** 统计信息 */
  stats?: {
    total: number;
    loaded: number;
    failed: number;
    skipped: number;
  };
}

// ============================================================================
// Unified Interface Types
// ============================================================================

/**
 * 统一 Skill 接口执行参数
 */
export interface UnifiedSkillExecuteParams {
  /** Skill 名称 */
  skillName: string;
  /** 输入数据 */
  inputs: Record<string, unknown>;
  /** 执行上下文 */
  context?: Partial<SkillExecutionContext>;
}

/**
 * 统一 Skill 接口执行结果
 */
export interface UnifiedSkillExecuteResult {
  /** 是否成功 */
  success: boolean;
  /** 输出数据 */
  output?: Record<string, unknown>;
  /** 错误信息 */
  error?: string;
  /** 执行时长 */
  duration: number;
}

/**
 * 拦截器接口
 * 用于在执行前后添加额外逻辑
 */
export interface SkillInterceptor {
  /** 执行前钩子 */
  beforeExecute?<T>(skill: Skill, input: SkillInput<T>): Promise<void>;
  /** 执行后钩子 */
  afterExecute?<R>(skill: Skill, result: SkillOutput<R>): Promise<void>;
}

// ============================================================================
// Skill Execution Event Types
// ============================================================================

/**
 * Skill 执行事件
 */
export interface SkillExecutionEvent {
  /** 事件类型 */
  type: 'before_execute' | 'after_execute' | 'error' | 'log';
  /** Skill 名称 */
  skillName: string;
  /** 时间戳 */
  timestamp: number;
  /** 事件数据 */
  data?: Record<string, unknown>;
}

/**
 * Skill 事件监听器
 */
export type SkillEventListener = (event: SkillExecutionEvent) => void;

// Re-export SkillDefinition from core types for convenience
export type { SkillDefinition } from '../types/index.js';
