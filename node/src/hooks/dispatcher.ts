/**
 * Hook Dispatcher Module
 * TASK-E16-04
 *
 * 借鉴 ECC 的 Dispatcher 模式，将多个 pre/post hooks 聚合到单一入口。
 * 优势：
 * - 减少进程启动开销（单一入口代替多个独立 hooks）
 * - 支持 profile 过滤（快速跳过不需要的 checks）
 * - 统一的错误处理和日志
 * - 可扩展的 check 注册机制
 */

import {
  type HookProfile,
  type HookContext,
  getHookContext,
  shouldRunHook,
  isDebugEnabled,
} from './hook-flags.js';

// ============================================================================
// 类型定义
// ============================================================================

/**
 * Check 执行上下文
 */
export interface CheckContext<T = unknown> {
  /** 输入数据 */
  input: T;
  /** 会话 ID */
  sessionId?: string;
  /** 工具名称（如果是工具相关的 check） */
  toolName?: string;
  /** 额外元数据 */
  metadata?: Record<string, unknown>;
}

/**
 * Check 执行结果
 */
export interface CheckResult {
  /** 是否通过 */
  passed: boolean;
  /** 如果失败，原因 */
  reason?: string;
  /** 修改后的输入（可选） */
  modifiedInput?: unknown;
  /** 反馈信息（注入 LLM context） */
  feedback?: string;
  /** 警告信息 */
  warnings?: string[];
  /** 执行耗时（毫秒） */
  durationMs?: number;
}

/**
 * Check 接口
 * 所有 check 必须实现此接口
 */
export interface Check<T = unknown> {
  /** 唯一标识符 */
  readonly id: string;
  /** 显示名称 */
  readonly name: string;
  /** 描述 */
  readonly description?: string;
  /** 在哪些 profile 下启用（minimal/standard/strict） */
  readonly profiles: HookProfile[];
  /** 分类（用于组织） */
  readonly category?: 'security' | 'quality' | 'performance' | 'audit' | 'custom';
  /** 执行 check */
  execute(ctx: CheckContext<T>): Promise<CheckResult>;
}

/**
 * Dispatcher 配置
 */
export interface DispatcherConfig {
  /** 是否在第一个失败时停止 */
  stopOnFirstFailure?: boolean;
  /** 超时时间（毫秒） */
  timeoutMs?: number;
  /** 是否启用并行执行 */
  parallel?: boolean;
  /** 详细日志 */
  verbose?: boolean;
}

/**
 * Dispatcher 执行结果
 */
export interface DispatcherResult<T = unknown> {
  /** 所有 check 是否通过 */
  allPassed: boolean;
  /** 各 check 的结果 */
  results: Map<string, CheckResult>;
  /** 执行的 check IDs */
  executed: string[];
  /** 跳过的 check IDs（profile 过滤） */
  skipped: string[];
  /** 首个失败的 check ID（如果有） */
  firstFailure?: string;
  /** 合并后的输入（如果有 check 修改了输入） */
  finalInput?: T;
  /** 合并后的反馈 */
  combinedFeedback?: string;
  /** 总耗时（毫秒） */
  totalDurationMs: number;
}

// ============================================================================
// Check Registry
// ============================================================================

/**
 * Check 注册表
 * 全局单例，管理所有注册的 checks
 */
export class CheckRegistry {
  private checks: Map<string, Check<unknown>> = new Map();
  private groups: Map<string, Set<string>> = new Map();

  /**
   * 注册一个 check
   */
  register<T>(check: Check<T>, group?: string): void {
    if (this.checks.has(check.id)) {
      console.warn(`[CheckRegistry] Check "${check.id}" already registered, overwriting`);
    }
    this.checks.set(check.id, check as Check<unknown>);

    // 添加到分组
    if (group) {
      if (!this.groups.has(group)) {
        this.groups.set(group, new Set());
      }
      const groupSet = this.groups.get(group);
      if (groupSet) {
        groupSet.add(check.id);
      }
    }
  }

  /**
   * 批量注册
   */
  registerAll<T>(checks: Array<Check<T>>, group?: string): void {
    for (const check of checks) {
      this.register(check, group);
    }
  }

  /**
   * 获取 check
   */
  get<T>(id: string): Check<T> | undefined {
    return this.checks.get(id) as Check<T> | undefined;
  }

  /**
   * 获取分组内的所有 check IDs
   */
  getGroup(group: string): string[] {
    return Array.from(this.groups.get(group) ?? []);
  }

  /**
   * 获取所有 check IDs
   */
  getAllIds(): string[] {
    return Array.from(this.checks.keys());
  }

  /**
   * 获取分组内应执行的 checks（根据当前 profile 过滤）
   */
  getEnabledChecks<T>(group: string, context?: HookContext): Array<Check<T>> {
    const ids = this.getGroup(group);
    const ctx = context ?? getHookContext();
    const result: Array<Check<T>> = [];

    for (const id of ids) {
      const check = this.checks.get(id);
      if (check && shouldRunHook(check.id, { profiles: check.profiles }, ctx)) {
        result.push(check as Check<T>);
      }
    }

    return result;
  }

  /**
   * 清空注册表（主要用于测试）
   */
  clear(): void {
    this.checks.clear();
    this.groups.clear();
  }
}

/** 全局注册表实例 */
export const checkRegistry = new CheckRegistry();

// ============================================================================
// Dispatcher
// ============================================================================

/**
 * Hook Dispatcher
 * 聚合多个 checks 到单一入口，支持 profile 过滤
 */
export class HookDispatcher<T = unknown> {
  private checks: Array<Check<T>> = [];
  private config: DispatcherConfig;

  constructor(config: DispatcherConfig = {}) {
    this.config = {
      stopOnFirstFailure: true,
      timeoutMs: 5000,
      parallel: false,
      verbose: false,
      ...config,
    };
  }

  /**
   * 添加 check
   */
  addCheck(check: Check<T>): this {
    this.checks.push(check);
    return this;
  }

  /**
   * 添加多个 checks
   */
  addChecks(checks: Array<Check<T>>): this {
    this.checks.push(...checks);
    return this;
  }

  /**
   * 从注册表加载分组内的所有 checks
   * 过滤在 dispatch 时进行，不在加载时
   */
  loadFromRegistry(group: string): this {
    const ids = checkRegistry.getGroup(group);
    for (const id of ids) {
      const check = checkRegistry.get<T>(id);
      if (check) {
        this.checks.push(check);
      }
    }
    return this;
  }

  /**
   * 执行所有 checks
   */
  async dispatch(ctx: CheckContext<T>): Promise<DispatcherResult<T>> {
    const startTime = Date.now();
    const results = new Map<string, CheckResult>();
    const executed: string[] = [];
    const skipped: string[] = [];
    let allPassed = true;
    let firstFailure: string | undefined;
    let currentInput = ctx.input;
    const feedbacks: string[] = [];

    const hookContext = getHookContext();
    const verbose = this.config.verbose || isDebugEnabled();

    // 过滤应执行的 checks
    const checksToRun: Array<Check<T>> = [];
    for (const check of this.checks) {
      if (shouldRunHook(check.id, { profiles: check.profiles }, hookContext)) {
        checksToRun.push(check);
      } else {
        skipped.push(check.id);
        if (verbose) {
          console.log(`[HookDispatcher] Skipped check "${check.id}" (profile filter)`);
        }
      }
    }

    // 执行 checks
    if (this.config.parallel) {
      // 并行执行
      const promises = checksToRun.map(async (check) => {
        const checkStart = Date.now();
        try {
          const checkCtx: CheckContext<T> = { ...ctx, input: currentInput };
          const result = await this.executeWithTimeout(check, checkCtx);
          return { check, result, durationMs: Date.now() - checkStart };
        } catch (error) {
          return {
            check,
            result: {
              passed: false,
              reason: `Check "${check.id}" threw error: ${(error as Error).message}`,
            } as CheckResult,
            durationMs: Date.now() - checkStart,
          };
        }
      });

      const outcomes = await Promise.all(promises);

      for (const { check, result, durationMs } of outcomes) {
        result.durationMs = durationMs;
        results.set(check.id, result);
        executed.push(check.id);

        if (!result.passed) {
          allPassed = false;
          if (!firstFailure) {
            firstFailure = check.id;
          }
        }

        if (result.feedback) {
          feedbacks.push(result.feedback);
        }
      }
    } else {
      // 串行执行
      for (const check of checksToRun) {
        const checkStart = Date.now();

        try {
          const checkCtx: CheckContext<T> = { ...ctx, input: currentInput };
          const result = await this.executeWithTimeout(check, checkCtx);
          result.durationMs = Date.now() - checkStart;

          results.set(check.id, result);
          executed.push(check.id);

          if (verbose) {
            console.log(
              `[HookDispatcher] Check "${check.id}" ${result.passed ? 'PASSED' : 'FAILED'} (${result.durationMs}ms)`
            );
          }

          if (!result.passed) {
            allPassed = false;
            if (!firstFailure) {
              firstFailure = check.id;
            }
            if (this.config.stopOnFirstFailure) {
              break;
            }
          }

          // 如果 check 修改了输入，更新 currentInput
          if (result.modifiedInput !== undefined) {
            currentInput = result.modifiedInput as T;
          }

          if (result.feedback) {
            feedbacks.push(result.feedback);
          }
        } catch (error) {
          const durationMs = Date.now() - checkStart;
          const result: CheckResult = {
            passed: false,
            reason: `Check "${check.id}" threw error: ${(error as Error).message}`,
            durationMs,
          };
          results.set(check.id, result);
          executed.push(check.id);
          allPassed = false;

          if (!firstFailure) {
            firstFailure = check.id;
          }

          if (this.config.stopOnFirstFailure) {
            break;
          }
        }
      }
    }

    return {
      allPassed,
      results,
      executed,
      skipped,
      firstFailure,
      finalInput: currentInput,
      combinedFeedback: feedbacks.length > 0 ? feedbacks.join('\n') : undefined,
      totalDurationMs: Date.now() - startTime,
    };
  }

  /**
   * 带超时执行 check
   */
  private async executeWithTimeout(check: Check<T>, ctx: CheckContext<T>): Promise<CheckResult> {
    const timeoutMs = this.config.timeoutMs ?? 5000;

    return Promise.race([
      check.execute(ctx),
      new Promise<CheckResult>((_, reject) =>
        setTimeout(() => reject(new Error(`Check "${check.id}" timed out after ${timeoutMs}ms`)), timeoutMs)
      ),
    ]);
  }

  /**
   * 获取当前配置
   */
  getConfig(): DispatcherConfig {
    return { ...this.config };
  }

  /**
   * 获取已添加的 checks
   */
  getChecks(): ReadonlyArray<Check<T>> {
    return this.checks;
  }
}

// ============================================================================
// 工厂函数
// ============================================================================

/**
 * 创建 dispatcher
 */
export function createDispatcher<T = unknown>(config?: DispatcherConfig): HookDispatcher<T> {
  return new HookDispatcher<T>(config);
}

/**
 * 创建并加载分组 checks 的 dispatcher
 */
export function createGroupDispatcher<T = unknown>(
  group: string,
  config?: DispatcherConfig
): HookDispatcher<T> {
  const dispatcher = new HookDispatcher<T>(config);
  dispatcher.loadFromRegistry(group);
  return dispatcher;
}
