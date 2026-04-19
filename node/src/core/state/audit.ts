/**
 * node/src/core/state/audit.ts — 审计日志
 *
 * 规范: Shell 对应 lib/state/audit.sh
 * 格式: ISO8601 | actor | engine | op | target | details
 * 跨引擎的每行必须字节等价（除时间戳与 engine 列）。
 */

import { appendFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { getEketRoot, getNodeId } from './env.js';

function auditLogPath(): string {
  return process.env.EKET_AUDIT_LOG ?? join(getEketRoot(), 'shared', 'audit.log');
}

/**
 * 追加审计记录。
 *
 * 详情中若含 `|`，会被替换为 `\|` 以保留列分隔。
 */
export async function audit(
  op: string,
  target: string,
  actor: string = getNodeId(),
  details: string = ''
): Promise<void> {
  const ts = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  const safeDetails = details.replace(/\|/g, '\\|');
  const line = `${ts} | ${actor} | node | ${op} | ${target} | ${safeDetails}\n`;

  const path = auditLogPath();
  await mkdir(dirname(path), { recursive: true });
  // O_APPEND 保证单次 write 原子
  await appendFile(path, line, 'utf-8');
}
