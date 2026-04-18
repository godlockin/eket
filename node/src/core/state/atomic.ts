/**
 * node/src/core/state/atomic.ts — 原子写入
 *
 * 规范: protocol/conventions/atomic-write.md
 * Shell 对应: lib/state/atomic.sh
 */

import { mkdir, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, basename, join } from 'node:path';

/**
 * 原子写入：先写 tmp，再 rename。
 *
 * 保证读方只会看到完整旧版本或完整新版本，绝不看到中间态。
 *
 * @param target  目标路径
 * @param content 要写入的内容
 */
export async function atomicWrite(target: string, content: string): Promise<void> {
  if (!target) {
    throw new Error('atomicWrite: target path required');
  }

  const dir = dirname(target);
  await mkdir(dir, { recursive: true });

  // tmp 必须在同一挂载点，保证 rename 原子
  const tmp = join(
    dir,
    `.${basename(target)}.tmp.${process.pid}.${Math.random().toString(36).slice(2, 8)}`
  );

  try {
    await writeFile(tmp, content, 'utf-8');
    await rename(tmp, target);
  } catch (err) {
    await unlink(tmp).catch(() => {
      /* already cleaned or never created */
    });
    throw err;
  }
}
