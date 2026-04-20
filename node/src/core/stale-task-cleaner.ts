/**
 * Stale Task Cleaner (TASK-066)
 *
 * 清理超时的 in_progress ticket，防止 Slaver 失联后任务永久卡住。
 *
 * 逻辑：
 * - in_progress 超过 blockedThresholdMs（默认 30 min） → status = 'blocked'
 * - in_progress/blocked 超过 failedThresholdMs（默认 2h）  → status = 'failed'
 *
 * ticket 文件的 `## 执行日志` 节会追加超时记录。
 */

import * as fs from 'fs';
import * as path from 'path';
import { sseBus } from './sse-bus.js';

// ============================================================================
// Types
// ============================================================================

export interface StaleTaskCleanerConfig {
  /** 项目根目录（用于定位 jira/tickets 和 confluence/memory） */
  projectRoot: string;
  /** in_progress 超过此时长 → blocked（毫秒，默认 30 min） */
  blockedThresholdMs?: number;
  /** in_progress/blocked 超过此时长 → failed（毫秒，默认 2h） */
  failedThresholdMs?: number;
}

export interface StaleTaskResult {
  blocked: string[];
  failed: string[];
}

// ============================================================================
// Internal helpers
// ============================================================================

const DEFAULT_BLOCKED_MS = 30 * 60 * 1000; // 30 min
const DEFAULT_FAILED_MS = 2 * 60 * 60 * 1000; // 2 h

/**
 * 从 ticket 内容解析 claimed_at / started_at 时间戳
 */
function parseClaimedAt(content: string): Date | null {
  // 尝试 claimed_at 字段（SQLite 风格），再回退到 started_at（文件风格）
  const patterns = [
    /\*\*claimed_at\*\*:\s*(\S+)/i,
    /\*\*started_at\*\*:\s*(\S+)/i,
  ];
  for (const re of patterns) {
    const m = content.match(re);
    if (m?.[1] && !m[1].startsWith('<!--')) {
      const d = new Date(m[1]);
      if (!isNaN(d.getTime())) return d;
    }
  }
  return null;
}

/**
 * 更新 ticket 文件内的状态字段
 */
function updateTicketStatus(filePath: string, newStatus: string): void {
  let content = fs.readFileSync(filePath, 'utf-8');
  content = content.replace(/(\*\*状态\*\*:\s*)\S+/i, `$1${newStatus}`);
  fs.writeFileSync(filePath, content, 'utf-8');
}

/**
 * 在 ticket 文件的 `## 执行日志` 节追加超时记录（如无该节则新建）
 */
function appendTimeoutLog(filePath: string, message: string): void {
  let content = fs.readFileSync(filePath, 'utf-8');
  const logLine = `- [TIMEOUT] ${new Date().toISOString()} — ${message}`;

  if (content.includes('## 执行日志')) {
    // 找到节标题，在其后第一个空行后追加
    content = content.replace(/(## 执行日志\n)/, `$1${logLine}\n`);
  } else {
    content = content + `\n## 执行日志\n${logLine}\n`;
  }

  fs.writeFileSync(filePath, content, 'utf-8');
}

/**
 * 写审计日志到 confluence/memory/stale-task-audit.md
 */
function writeAuditLog(projectRoot: string, entries: string[]): void {
  if (entries.length === 0) return;

  const memoryDir = path.join(projectRoot, 'confluence', 'memory');
  fs.mkdirSync(memoryDir, { recursive: true });

  const auditFile = path.join(memoryDir, 'stale-task-audit.md');
  const header = `\n## ${new Date().toISOString()}\n`;
  const body = entries.map((e) => `- ${e}`).join('\n') + '\n';

  fs.appendFileSync(auditFile, header + body, 'utf-8');
}

// ============================================================================
// Public API
// ============================================================================

/**
 * 扫描并清理超时 ticket。
 *
 * @returns blocked / failed ticket id 列表
 */
export function failStaleTasks(config: StaleTaskCleanerConfig): StaleTaskResult {
  const {
    projectRoot,
    blockedThresholdMs = DEFAULT_BLOCKED_MS,
    failedThresholdMs = DEFAULT_FAILED_MS,
  } = config;

  const ticketsDir = path.join(projectRoot, 'jira', 'tickets');
  if (!fs.existsSync(ticketsDir)) {
    return { blocked: [], failed: [] };
  }

  const result: StaleTaskResult = { blocked: [], failed: [] };
  const auditEntries: string[] = [];
  const now = Date.now();

  // Scan all .md files directly under tickets/ (flat layout observed in codebase)
  let files: string[] = [];
  try {
    files = fs.readdirSync(ticketsDir).filter((f) => f.endsWith('.md'));
  } catch {
    return result;
  }

  for (const file of files) {
    const filePath = path.join(ticketsDir, file);
    let content: string;
    try {
      content = fs.readFileSync(filePath, 'utf-8');
    } catch {
      continue;
    }

    // Process in_progress and blocked tickets (blocked can escalate to failed)
    const statusMatch = content.match(/\*\*(状态|status)\*\*:\s*(\S+)/i);
    const status = statusMatch?.[2]?.toLowerCase();
    if (status !== 'in_progress' && status !== 'blocked') continue;

    const ticketId = file.replace('.md', '');
    const claimedAt = parseClaimedAt(content);

    // Use file mtime as fallback when no timestamp found in content
    let elapsed: number;
    if (claimedAt) {
      elapsed = now - claimedAt.getTime();
    } else {
      const mtime = fs.statSync(filePath).mtime.getTime();
      elapsed = now - mtime;
    }

    if (elapsed >= failedThresholdMs) {
      const hours = Math.round(elapsed / 3600000);
      const msg = `超时自动标记为 failed（已运行约 ${hours}h）`;
      updateTicketStatus(filePath, 'failed');
      appendTimeoutLog(filePath, msg);
      result.failed.push(ticketId);
      auditEntries.push(`[FAILED] ${ticketId}: ${msg}`);
      sseBus.publish({ type: 'task_timed_out', ticketId, slaverId: 'stale-cleaner', timestamp: new Date().toISOString(), payload: { reason: 'failed_threshold', elapsed } });
    } else if (elapsed >= blockedThresholdMs) {
      const minutes = Math.round(elapsed / 60000);
      const msg = `超时自动标记为 blocked（已运行约 ${minutes}min）`;
      updateTicketStatus(filePath, 'blocked');
      appendTimeoutLog(filePath, msg);
      result.blocked.push(ticketId);
      auditEntries.push(`[BLOCKED] ${ticketId}: ${msg}`);
    }
  }

  writeAuditLog(projectRoot, auditEntries);

  return result;
}
