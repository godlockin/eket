/**
 * node/src/core/state/env.ts — 共享状态层的环境变量
 */

import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

let _cachedRoot: string | null = null;

/**
 * 解析 EKET_ROOT:
 * 1. 显式环境变量
 * 2. `git rev-parse --show-toplevel`
 * 3. 退化到 cwd
 */
export function getEketRoot(): string {
  if (_cachedRoot) {
    return _cachedRoot;
  }
  if (process.env.EKET_ROOT) {
    _cachedRoot = resolve(process.env.EKET_ROOT);
    return _cachedRoot;
  }
  try {
    const r = execSync('git rev-parse --show-toplevel', {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (r && existsSync(r)) {
      _cachedRoot = r;
      return _cachedRoot;
    }
  } catch {
    /* not a git repo */
  }
  _cachedRoot = process.cwd();
  return _cachedRoot;
}

export function getNodeId(): string {
  return process.env.EKET_NODE_ID ?? 'unknown';
}

/** 仅测试用 — 清空根目录缓存 */
export function _resetForTest(): void {
  _cachedRoot = null;
}
