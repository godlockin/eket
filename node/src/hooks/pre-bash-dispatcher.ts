/**
 * Pre-Bash Dispatcher Module
 * TASK-E16-04
 *
 * 聚合所有 Bash 相关的 pre-hook checks 到单一入口。
 * 减少每次 Bash 调用的进程启动开销。
 *
 * Checks:
 * - PathTraversalCheck: 检测路径遍历攻击（../）
 * - DangerousCommandCheck: 检测危险命令（rm -rf /, DROP TABLE）
 * - SensitivePathCheck: 检测敏感路径访问（/etc/passwd, ~/.ssh）
 * - CommandInjectionCheck: 检测命令注入
 * - ResourceLimitCheck: 检测资源消耗命令
 */

import {
  Check,
  CheckContext,
  CheckResult,
  HookDispatcher,
  createDispatcher,
  checkRegistry,
} from './dispatcher.js';
import type { HookProfile } from './hook-flags.js';

// ============================================================================
// Bash Check Context
// ============================================================================

/**
 * Bash 命令上下文
 */
export interface BashInput {
  /** 要执行的命令 */
  command: string;
  /** 工作目录 */
  cwd?: string;
  /** 环境变量 */
  env?: Record<string, string>;
  /** 超时时间（毫秒） */
  timeout?: number;
}

// ============================================================================
// Check 实现
// ============================================================================

/**
 * 路径遍历检测
 */
export class PathTraversalCheck implements Check<BashInput> {
  readonly id = 'bash.path-traversal';
  readonly name = 'Path Traversal Check';
  readonly description = 'Detects path traversal attacks (../)';
  readonly profiles: HookProfile[] = ['minimal', 'standard', 'strict'];
  readonly category = 'security' as const;

  async execute(ctx: CheckContext<BashInput>): Promise<CheckResult> {
    const { command, cwd } = ctx.input;
    const combined = `${command} ${cwd ?? ''}`;

    // 检测 ../ 模式
    if (/\.\.\//.test(combined) || /\.\.\\/.test(combined)) {
      return {
        passed: false,
        reason: 'Path traversal pattern detected (../)',
        warnings: ['Potential directory traversal attack'],
      };
    }

    // 检测绝对路径访问敏感目录
    const sensitivePatterns = [
      /\/etc\/passwd/,
      /\/etc\/shadow/,
      /~\/\.ssh/,
      /\/root\//,
      /\/home\/\w+\/\.ssh/,
    ];

    for (const pattern of sensitivePatterns) {
      if (pattern.test(combined)) {
        return {
          passed: false,
          reason: `Access to sensitive path detected: ${pattern.source}`,
        };
      }
    }

    return { passed: true };
  }
}

/**
 * 危险命令检测
 */
export class DangerousCommandCheck implements Check<BashInput> {
  readonly id = 'bash.dangerous-command';
  readonly name = 'Dangerous Command Check';
  readonly description = 'Detects dangerous commands (rm -rf /, dd, mkfs)';
  readonly profiles: HookProfile[] = ['minimal', 'standard', 'strict'];
  readonly category = 'security' as const;

  private static readonly DANGEROUS_PATTERNS = [
    { pattern: /rm\s+(-[rf]+\s+)*\/\s*$/, reason: 'Recursive delete of root directory' },
    { pattern: /rm\s+(-[rf]+\s+)*\/\*/, reason: 'Recursive delete of root contents' },
    { pattern: /\bmkfs\b/, reason: 'Filesystem format command' },
    { pattern: /dd\s+if=.*of=\/dev\//, reason: 'Direct disk write' },
    { pattern: />\s*\/dev\/sd[a-z]/, reason: 'Direct write to disk device' },
    { pattern: /chmod\s+-R\s+777\s+\//, reason: 'Recursive chmod 777 on root' },
    { pattern: /chown\s+-R\s+.*:.*\s+\/\s*$/, reason: 'Recursive chown on root' },
    { pattern: /:(){ :|:& };:/, reason: 'Fork bomb detected' },
    { pattern: /\|\s*base64\s+-d\s*\|\s*bash/, reason: 'Encoded command execution' },
  ];

  async execute(ctx: CheckContext<BashInput>): Promise<CheckResult> {
    const { command } = ctx.input;

    for (const { pattern, reason } of DangerousCommandCheck.DANGEROUS_PATTERNS) {
      if (pattern.test(command)) {
        return {
          passed: false,
          reason: `Dangerous command: ${reason}`,
        };
      }
    }

    return { passed: true };
  }
}

/**
 * 敏感路径访问检测
 */
export class SensitivePathCheck implements Check<BashInput> {
  readonly id = 'bash.sensitive-path';
  readonly name = 'Sensitive Path Check';
  readonly description = 'Detects access to sensitive system paths';
  readonly profiles: HookProfile[] = ['standard', 'strict'];
  readonly category = 'security' as const;

  private static readonly SENSITIVE_PATHS = [
    '/etc/passwd',
    '/etc/shadow',
    '/etc/sudoers',
    '~/.ssh',
    '~/.gnupg',
    '~/.aws',
    '~/.config/gcloud',
    '/var/log/auth.log',
    '/var/log/secure',
  ];

  async execute(ctx: CheckContext<BashInput>): Promise<CheckResult> {
    const { command } = ctx.input;
    const warnings: string[] = [];

    for (const path of SensitivePathCheck.SENSITIVE_PATHS) {
      // 将 ~ 替换为实际用户目录模式
      const normalizedPath = path.replace('~', '(/home/\\w+|/root|~)');
      const regex = new RegExp(normalizedPath);

      if (regex.test(command)) {
        warnings.push(`Access to sensitive path: ${path}`);
      }
    }

    if (warnings.length > 0) {
      // 不直接失败，只返回警告（让调用者决定）
      return {
        passed: true,
        warnings,
        feedback: `Warning: Command accesses sensitive paths: ${warnings.join(', ')}`,
      };
    }

    return { passed: true };
  }
}

/**
 * 命令注入检测
 */
export class CommandInjectionCheck implements Check<BashInput> {
  readonly id = 'bash.command-injection';
  readonly name = 'Command Injection Check';
  readonly description = 'Detects command injection patterns';
  readonly profiles: HookProfile[] = ['minimal', 'standard', 'strict'];
  readonly category = 'security' as const;

  private static readonly INJECTION_PATTERNS = [
    { pattern: /;\s*\w/, reason: 'Command chaining with semicolon' },
    { pattern: /\|\s*\w/, reason: 'Pipe to another command' },
    { pattern: /`[^`]+`/, reason: 'Backtick command substitution' },
    { pattern: /\$\([^)]+\)/, reason: 'Command substitution' },
    { pattern: /&&\s*\w/, reason: 'Command chaining with &&' },
    { pattern: /\|\|\s*\w/, reason: 'Command chaining with ||' },
  ];

  async execute(ctx: CheckContext<BashInput>): Promise<CheckResult> {
    const { command } = ctx.input;
    const warnings: string[] = [];

    // 命令注入检测比较宽松，因为很多正常命令也使用管道和链式调用
    // 这里只检测可疑模式并返回警告
    for (const { pattern, reason } of CommandInjectionCheck.INJECTION_PATTERNS) {
      if (pattern.test(command)) {
        warnings.push(reason);
      }
    }

    // 命令注入检测不直接失败，只返回警告
    return {
      passed: true,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }
}

/**
 * 资源限制检测
 */
export class ResourceLimitCheck implements Check<BashInput> {
  readonly id = 'bash.resource-limit';
  readonly name = 'Resource Limit Check';
  readonly description = 'Detects commands that may consume excessive resources';
  readonly profiles: HookProfile[] = ['strict'];
  readonly category = 'performance' as const;

  private static readonly RESOURCE_PATTERNS = [
    { pattern: /find\s+\/\s+-/, reason: 'Recursive find from root' },
    { pattern: /grep\s+-r\s+.*\s+\/\s*$/, reason: 'Recursive grep from root' },
    { pattern: /du\s+-[^s]*\s+\/\s*$/, reason: 'Disk usage check on root' },
    { pattern: /tar\s+.*-[czf]+.*\/\s*$/, reason: 'Archive of root filesystem' },
    { pattern: /yes\s*$/, reason: 'Infinite yes command' },
    { pattern: /cat\s+\/dev\/(zero|random|urandom)\s*\|/, reason: 'Infinite data stream' },
  ];

  async execute(ctx: CheckContext<BashInput>): Promise<CheckResult> {
    const { command, timeout } = ctx.input;
    const warnings: string[] = [];

    for (const { pattern, reason } of ResourceLimitCheck.RESOURCE_PATTERNS) {
      if (pattern.test(command)) {
        warnings.push(reason);
      }
    }

    // 检查是否设置了合理的超时
    if (!timeout || timeout > 300000) {
      // 5 分钟
      warnings.push('No timeout or timeout > 5 minutes');
    }

    return {
      passed: true,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }
}

// ============================================================================
// Dispatcher 工厂
// ============================================================================

/** Bash checks 分组名 */
export const BASH_CHECKS_GROUP = 'pre-bash';

/**
 * 注册所有 Bash checks
 */
export function registerBashChecks(): void {
  checkRegistry.registerAll<BashInput>(
    [
      new PathTraversalCheck(),
      new DangerousCommandCheck(),
      new SensitivePathCheck(),
      new CommandInjectionCheck(),
      new ResourceLimitCheck(),
    ],
    BASH_CHECKS_GROUP
  );
}

/**
 * 创建 Pre-Bash Dispatcher
 * 聚合所有 Bash 相关 checks
 */
export function createPreBashDispatcher(
  options?: {
    stopOnFirstFailure?: boolean;
    parallel?: boolean;
    verbose?: boolean;
  }
): HookDispatcher<BashInput> {
  // 确保 checks 已注册
  if (checkRegistry.getGroup(BASH_CHECKS_GROUP).length === 0) {
    registerBashChecks();
  }

  return createDispatcher<BashInput>({
    stopOnFirstFailure: options?.stopOnFirstFailure ?? true,
    parallel: options?.parallel ?? false,
    verbose: options?.verbose ?? false,
    timeoutMs: 1000, // Bash checks 应该很快
  }).loadFromRegistry(BASH_CHECKS_GROUP);
}

/**
 * 执行 Bash 前置检查
 * 便捷函数，直接返回是否允许执行
 */
export async function checkBashCommand(
  command: string,
  cwd?: string,
  options?: {
    sessionId?: string;
    stopOnFirstFailure?: boolean;
  }
): Promise<{
  allowed: boolean;
  reason?: string;
  warnings?: string[];
}> {
  const dispatcher = createPreBashDispatcher({
    stopOnFirstFailure: options?.stopOnFirstFailure ?? true,
  });

  const result = await dispatcher.dispatch({
    input: { command, cwd },
    sessionId: options?.sessionId,
    toolName: 'Bash',
  });

  if (!result.allPassed) {
    if (!result.firstFailure) {
      return {
        allowed: true,
        warnings: result.executed.length === 0
          ? ['No checks were executed (all skipped by profile)']
          : undefined,
      };
    }
    const failedResult = result.results.get(result.firstFailure);
    if (!failedResult) {
      return { allowed: false, reason: `Check "${result.firstFailure}" failed but result not found` };
    }
    return {
      allowed: false,
      reason: failedResult.reason ?? 'Check failed',
      warnings: failedResult.warnings,
    };
  }

  // 收集所有警告
  const allWarnings: string[] = [];
  for (const checkResult of result.results.values()) {
    if (checkResult.warnings) {
      allWarnings.push(...checkResult.warnings);
    }
  }

  return {
    allowed: true,
    warnings: allWarnings.length > 0 ? allWarnings : undefined,
  };
}
