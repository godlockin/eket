/**
 * 进程清理工具
 * 防止孤儿进程，实现优雅关闭
 *
 * 功能：
 * - SIGTERM/SIGINT 信号处理
 * - 30 秒超时保护
 * - 等待活跃连接完成
 * - 清理所有资源（HTTP 服务器、WebSocket、Redis、SQLite）
 */

import * as fs from 'fs';
import * as path from 'path';

import { execFileNoThrow } from './execFileNoThrow.js';

// ============================================================================
// Types
// ============================================================================

export interface CleanupResource {
  name: string;
  cleanup: () => Promise<void>;
}

export interface GracefulShutdownConfig {
  /** 超时时间（毫秒） */
  timeout: number;
  /** 是否记录详细日志 */
  verbose: boolean;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_CONFIG: GracefulShutdownConfig = {
  timeout: 30000, // 30 秒
  verbose: true,
};

// ============================================================================
// State
// ============================================================================

/** 清理函数注册表 */
const cleanupFunctions: Array<() => Promise<void>> = [];

/** 注册的资源 */
const registeredResources: CleanupResource[] = [];

/** 是否正在关闭 */
let isShuttingDown = false;

/** 关闭配置 */
let shutdownConfig: GracefulShutdownConfig = DEFAULT_CONFIG;

// ============================================================================
// Core Functions
// ============================================================================

/**
 * 注册清理函数
 */
export function registerCleanup(fn: () => Promise<void>): void {
  cleanupFunctions.push(fn);
}

/**
 * 注册可清理资源
 */
export function registerResource(resource: CleanupResource): void {
  registeredResources.push(resource);
}

/**
 * 设置关闭配置
 */
export function setShutdownConfig(config: Partial<GracefulShutdownConfig>): void {
  shutdownConfig = { ...shutdownConfig, ...config };
}

/**
 * 检查是否正在关闭
 */
export function getIsShuttingDown(): boolean {
  return isShuttingDown;
}

/**
 * 执行所有清理函数
 */
export async function runCleanup(): Promise<void> {
  const startTime = Date.now();

  if (shutdownConfig.verbose) {
    console.log('\n正在清理资源...');
  }

  // 先清理注册的资源
  for (const resource of registeredResources) {
    try {
      if (shutdownConfig.verbose) {
        console.log(`  清理 ${resource.name}...`);
      }
      await resource.cleanup();
    } catch (error) {
      console.error(`清理 ${resource.name} 失败:`, error);
    }
  }

  // 再执行清理函数
  for (const fn of cleanupFunctions) {
    try {
      await fn();
    } catch {
      console.error('清理函数执行失败');
    }
  }

  if (shutdownConfig.verbose) {
    const duration = Date.now() - startTime;
    console.log(`清理完成 (耗时：${duration}ms)`);
  }
}

/**
 * 优雅关闭
 */
export async function gracefulShutdown(signal: string): Promise<void> {
  if (isShuttingDown) {
    console.log(`已在关闭中，忽略信号：${signal}`);
    return;
  }

  isShuttingDown = true;

  if (shutdownConfig.verbose) {
    console.log(`\n收到关闭信号：${signal}`);
    console.log(`超时保护：${shutdownConfig.timeout / 1000}秒`);
  }

  // 创建超时保护
  const shutdownPromise = runCleanup();
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => {
      reject(new Error(`关闭超时 (${shutdownConfig.timeout / 1000}秒)`));
    }, shutdownConfig.timeout);
  });

  try {
    await Promise.race([shutdownPromise, timeoutPromise]);

    if (shutdownConfig.verbose) {
      console.log('所有资源已清理，准备退出');
    }

    process.exit(0);
  } catch (error) {
    console.error('关闭过程出错:', error);
    // 超时也要退出
    process.exit(1);
  }
}

/**
 * 设置进程退出处理器
 */
export function setupProcessHandlers(config?: Partial<GracefulShutdownConfig>): void {
  if (config) {
    setShutdownConfig(config);
  }

  const exitHandler = async (signal: string): Promise<void> => {
    await gracefulShutdown(signal);
  };

  // 捕获正常的退出信号
  process.on('exit', (code) => {
    if (shutdownConfig.verbose) {
      console.log(`\n进程退出：${code}`);
    }
  });

  // 捕获 Ctrl+C
  process.on('SIGINT', () => exitHandler('SIGINT'));

  // 捕获 kill 命令
  process.on('SIGTERM', () => exitHandler('SIGTERM'));

  // 捕获未处理的异常
  process.on('uncaughtException', (error) => {
    console.error('未捕获的异常:', error);
    runCleanup().then(() => process.exit(1));
  });

  // 捕获未处理的 Promise 拒绝
  process.on('unhandledRejection', (reason) => {
    if (shutdownConfig.verbose) {
      console.error('未处理的 Promise 拒绝:', reason);
    }
    // 不立即退出，让当前操作完成
  });
}

/**
 * 清理 worktree（如果任务中断）
 */
export async function cleanupWorktree(projectRoot: string, worktreePath: string): Promise<void> {
  if (!fs.existsSync(worktreePath)) {
    return;
  }

  console.log(`清理 worktree: ${worktreePath}`);

  // 检查是否有未提交的更改
  const result = await execFileNoThrow('git', ['status', '--porcelain'], {
    cwd: worktreePath,
    timeout: 10000,
  });

  if (result.stdout.trim()) {
    console.log('警告：worktree 有未提交的更改，跳过删除');
    return;
  }

  // 删除 worktree
  await execFileNoThrow('git', ['worktree', 'remove', '-f', worktreePath], {
    cwd: projectRoot,
    timeout: 10000,
  });

  console.log(`worktree 已删除：${worktreePath}`);
}

/**
 * 获取项目根目录
 */
export async function findProjectRoot(): Promise<string | null> {
  let current = process.cwd();
  while (current !== '/') {
    const eketDir = path.join(current, '.eket');
    if (fs.existsSync(eketDir)) {
      return current;
    }
    current = path.dirname(current);
  }
  return null;
}
