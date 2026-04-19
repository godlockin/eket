/**
 * node/src/core/state/lock.ts — 文件锁
 *
 * 规范: protocol/conventions/file-locking.md
 * Shell 对应: lib/state/lock.sh
 */

import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { dirname } from 'node:path';

import lockfile from 'proper-lockfile';

import { getEketRoot } from './env.js';

export interface LockOptions {
  /** 最大等待毫秒数，默认 5000 */
  timeoutMs?: number;
  /** stale 锁判定毫秒数，默认 10000 */
  staleMs?: number;
}

const DEFAULT_TIMEOUT = 5_000;
const DEFAULT_STALE = 10_000;

function lockPath(resource: string): string {
  const safe = resource.replace(/[:/]/g, '_');
  return `${getEketRoot()}/.eket/locks/${safe}.lock`;
}

/**
 * 资源级文件锁。
 *
 * 与 Shell `state_with_lock` 在**同一 lockfile** 上协作：
 * - Shell 使用 flock(2)，Node 使用 proper-lockfile（mkdir 原子）
 * - 双方都写 `<lockfile>.holder` 声明持有者
 * - stale 超过 staleMs 时允许接管
 *
 * @param resource 资源 key，如 `ticket:FEAT-001`
 * @param fn       加锁内执行的异步函数
 * @param opts     超时配置
 */
export async function withLock<T>(
  resource: string,
  fn: () => Promise<T>,
  opts: LockOptions = {}
): Promise<T> {
  const lp = lockPath(resource);
  await mkdir(dirname(lp), { recursive: true });

  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT;
  const staleMs = opts.staleMs ?? DEFAULT_STALE;

  // 保证 lockfile 存在（proper-lockfile 要求存在的文件）
  await writeFile(lp, '', { flag: 'a' });

  const release = await lockfile.lock(lp, {
    stale: staleMs,
    retries: {
      retries: Math.max(1, Math.floor(timeoutMs / 200)),
      minTimeout: 100,
      maxTimeout: 500,
    },
  });

  const holderPath = `${lp}.holder`;
  const holderContent =
    `pid=${process.pid}\n` +
    `engine=node\n` +
    `ts=${new Date().toISOString()}\n` +
    `resource=${resource}\n`;

  try {
    await writeFile(holderPath, holderContent, 'utf-8');
    return await fn();
  } finally {
    // 无论业务成败都清理 holder + 释放锁
    await unlink(holderPath).catch(() => {
      /* already gone */
    });
    await release().catch(() => {
      /* already released */
    });
  }
}
