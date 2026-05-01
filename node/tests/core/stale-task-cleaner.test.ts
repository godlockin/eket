/**
 * TASK-066: failStaleTasks 超时清理测试
 *
 * 验证：in_progress 超过阈值的 ticket 被正确标记为 failed / blocked。
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import { failStaleTasks } from '../../src/core/stale-task-cleaner.js';

// ── helpers ────────────────────────────────────────────────────────────────

function makeTempProject(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eket-stale-test-'));
  fs.mkdirSync(path.join(dir, 'jira', 'tickets'), { recursive: true });
  return dir;
}

/**
 * 写一个 ticket md 文件，可指定 claimed_at 时间戳和状态
 */
function writeTicket(
  ticketsDir: string,
  id: string,
  opts: { status?: string; claimedAt?: Date } = {}
): string {
  const { status = 'in_progress', claimedAt } = opts;
  const claimedLine = claimedAt
    ? `**claimed_at**: ${claimedAt.toISOString()}\n`
    : '';
  const content = `# ${id}: Test Ticket\n\n**状态**: ${status}\n${claimedLine}\n## 执行日志\n`;
  const filePath = path.join(ticketsDir, `${id}.md`);
  fs.writeFileSync(filePath, content, 'utf-8');
  return filePath;
}

// ── tests ──────────────────────────────────────────────────────────────────

describe('failStaleTasks — TASK-066', () => {
  let projectRoot: string;
  let ticketsDir: string;

  beforeEach(() => {
    projectRoot = makeTempProject();
    ticketsDir = path.join(projectRoot, 'jira', 'tickets');
  });

  afterEach(() => {
    try {
      fs.rmSync(projectRoot, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('returns empty lists when no tickets exist', () => {
    const result = failStaleTasks({ projectRoot });
    expect(result.blocked).toHaveLength(0);
    expect(result.failed).toHaveLength(0);
  });

  it('marks in_progress ticket as failed when > failedThresholdMs', () => {
    // 3 hours ago
    const claimedAt = new Date(Date.now() - 3 * 60 * 60 * 1000);
    writeTicket(ticketsDir, 'TASK-STALE', { claimedAt });

    const result = failStaleTasks({
      projectRoot,
      blockedThresholdMs: 30 * 60 * 1000,
      failedThresholdMs: 2 * 60 * 60 * 1000,
    });

    expect(result.failed).toContain('TASK-STALE');
    expect(result.blocked).not.toContain('TASK-STALE');

    // Verify file was updated
    const content = fs.readFileSync(path.join(ticketsDir, 'TASK-STALE.md'), 'utf-8');
    expect(content).toMatch(/\*\*状态\*\*: failed/);
    expect(content).toMatch(/\[TIMEOUT\].*超时自动标记为 failed/);
  });

  it('marks in_progress ticket as blocked when > blockedThresholdMs but < failedThresholdMs', () => {
    // 45 minutes ago
    const claimedAt = new Date(Date.now() - 45 * 60 * 1000);
    writeTicket(ticketsDir, 'TASK-SLOW', { claimedAt });

    const result = failStaleTasks({
      projectRoot,
      blockedThresholdMs: 30 * 60 * 1000,
      failedThresholdMs: 2 * 60 * 60 * 1000,
    });

    expect(result.blocked).toContain('TASK-SLOW');
    expect(result.failed).not.toContain('TASK-SLOW');

    const content = fs.readFileSync(path.join(ticketsDir, 'TASK-SLOW.md'), 'utf-8');
    expect(content).toMatch(/\*\*状态\*\*: blocked/);
    expect(content).toMatch(/\[TIMEOUT\].*超时自动标记为 blocked/);
  });

  it('ignores tickets that are not in_progress', () => {
    const claimedAt = new Date(Date.now() - 5 * 60 * 60 * 1000);
    writeTicket(ticketsDir, 'TASK-DONE', { status: 'done', claimedAt });
    writeTicket(ticketsDir, 'TASK-READY', { status: 'ready', claimedAt });

    const result = failStaleTasks({ projectRoot });
    expect(result.failed).toHaveLength(0);
    expect(result.blocked).toHaveLength(0);
  });

  it('does not touch fresh in_progress tickets', () => {
    // 5 minutes ago — below both thresholds
    const claimedAt = new Date(Date.now() - 5 * 60 * 1000);
    writeTicket(ticketsDir, 'TASK-FRESH', { claimedAt });

    const result = failStaleTasks({
      projectRoot,
      blockedThresholdMs: 30 * 60 * 1000,
      failedThresholdMs: 2 * 60 * 60 * 1000,
    });

    expect(result.failed).not.toContain('TASK-FRESH');
    expect(result.blocked).not.toContain('TASK-FRESH');

    const content = fs.readFileSync(path.join(ticketsDir, 'TASK-FRESH.md'), 'utf-8');
    expect(content).toMatch(/\*\*状态\*\*: in_progress/);
  });

  it('writes audit log to confluence/memory/stale-task-audit.md', () => {
    const claimedAt = new Date(Date.now() - 3 * 60 * 60 * 1000);
    writeTicket(ticketsDir, 'TASK-AUDIT', { claimedAt });

    failStaleTasks({
      projectRoot,
      failedThresholdMs: 2 * 60 * 60 * 1000,
    });

    const auditPath = path.join(projectRoot, 'confluence', 'memory', 'stale-task-audit.md');
    expect(fs.existsSync(auditPath)).toBe(true);
    const auditContent = fs.readFileSync(auditPath, 'utf-8');
    expect(auditContent).toContain('TASK-AUDIT');
    expect(auditContent).toContain('[FAILED]');
  });
});
