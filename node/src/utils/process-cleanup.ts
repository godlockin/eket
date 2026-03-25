/**
 * 进程清理工具
 * 防止孤儿进程
 */

import * as path from 'path';
import * as fs from 'fs';
import { execFileNoThrow } from './execFileNoThrow.js';

/**
 * 清理函数注册表
 */
const cleanupFunctions: Array<() => Promise<void>> = [];

/**
 * 注册清理函数
 */
export function registerCleanup(fn: () => Promise<void>): void {
  cleanupFunctions.push(fn);
}

/**
 * 执行所有清理函数
 */
export async function runCleanup(): Promise<void> {
  console.log('\n正在清理资源...');

  for (const fn of cleanupFunctions) {
    try {
      await fn();
    } catch {
      console.error('清理函数执行失败');
    }
  }

  console.log('清理完成');
}

/**
 * 设置进程退出处理器
 */
export function setupProcessHandlers(): void {
  const exitHandler = async (signal: string): Promise<void> => {
    console.log(`\n收到信号：${signal}`);
    await runCleanup();
    process.exit(0);
  };

  // 捕获正常的退出信号
  process.on('exit', () => {
    // 同步清理逻辑（如果有）
  });

  // 捕获 Ctrl+C
  process.on('SIGINT', () => exitHandler('SIGINT'));

  // 捕获 kill 命令
  process.on('SIGTERM', () => exitHandler('SIGTERM'));

  // 捕获未处理的异常
  process.on('uncaughtException', () => {
    console.error('未捕获的异常');
    runCleanup().then(() => process.exit(1));
  });

  // 捕获未处理的 Promise 拒绝
  process.on('unhandledRejection', () => {
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
