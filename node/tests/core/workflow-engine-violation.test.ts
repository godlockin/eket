/**
 * EKET Framework - Violation Report Tests (TASK-040)
 *
 * 覆盖：
 * - hook 违规时生成 inbox/human_feedback/violation-{ticketId}-{ts}.md
 * - 违规文件包含 ticket ID、时间、违规项列表
 * - hook 通过时不生成违规文件
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, readdirSync, readFileSync, rmSync, mkdirSync } from 'fs';
import { EketErrorCode } from '../../src/types/index.js';
import { transitionStatus } from '../../src/core/workflow-engine.js';

// ─── path helpers ─────────────────────────────────────────────────────────────

// Use import.meta.url for reliable path resolution in ts-jest ESM mode
// workflow-engine-violation.test.ts is at node/tests/core/ → ../../../ = repo root
const __filename = fileURLToPath(new URL(import.meta.url));
const __dirname_here = dirname(__filename);
const REPO_ROOT = join(__dirname_here, '..', '..', '..');
const INBOX_DIR = join(REPO_ROOT, 'inbox', 'human_feedback');
const VALID_TICKET_PATH = join(REPO_ROOT, 'test-fixtures', 'valid-ticket.md');
const INVALID_TICKET_PATH = join(REPO_ROOT, 'test-fixtures', 'invalid-ticket-no-pr.md');

// ─── helpers ─────────────────────────────────────────────────────────────────

function listViolationFiles(ticketId: string): string[] {
  if (!existsSync(INBOX_DIR)) return [];
  return readdirSync(INBOX_DIR).filter((f) => f.startsWith(`violation-${ticketId}-`));
}

function cleanViolationFiles(ticketId: string): void {
  listViolationFiles(ticketId).forEach((f) => {
    rmSync(join(INBOX_DIR, f));
  });
}

// ─── tests ────────────────────────────────────────────────────────────────────

describe('writeViolationReport — violation file generation', () => {
  const TEST_TICKET_ID = 'invalid-ticket-no-pr';

  beforeEach(() => {
    cleanViolationFiles(TEST_TICKET_ID);
    // Suppress console output in these tests
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    cleanViolationFiles(TEST_TICKET_ID);
    jest.restoreAllMocks();
  });

  it('generates violation file when hook fails', async () => {
    const before = listViolationFiles(TEST_TICKET_ID);
    expect(before).toHaveLength(0);

    const result = await transitionStatus(INVALID_TICKET_PATH, 'ready', 'pr_review');

    // Hook should have failed (MISSING_PR_URL)
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe(EketErrorCode.HOOK_BLOCKED);
    }

    // Violation file should have been created
    const after = listViolationFiles(TEST_TICKET_ID);
    expect(after.length).toBeGreaterThan(0);
  });

  it('violation file contains ticket ID and violation description', async () => {
    await transitionStatus(INVALID_TICKET_PATH, 'ready', 'pr_review');

    const files = listViolationFiles(TEST_TICKET_ID);
    expect(files.length).toBeGreaterThan(0);

    const content = readFileSync(join(INBOX_DIR, files[0]!), 'utf-8');
    expect(content).toContain(TEST_TICKET_ID);
    expect(content).toContain('MISSING_PR_URL');
  });

  it('violation file has correct structure (header + time + violations + fix hint)', async () => {
    await transitionStatus(INVALID_TICKET_PATH, 'ready', 'pr_review');

    const files = listViolationFiles(TEST_TICKET_ID);
    const content = readFileSync(join(INBOX_DIR, files[0]!), 'utf-8');

    expect(content).toMatch(/^# Hook 违规报告/m);
    expect(content).toMatch(/\*\*时间\*\*:/m);
    expect(content).toMatch(/\*\*触发事件\*\*/m);
    expect(content).toContain('请修复后重新推进状态');
  });
});

describe('writeViolationReport — no file when hook passes', () => {
  const TEST_TICKET_ID = 'valid-ticket';

  beforeEach(() => {
    cleanViolationFiles(TEST_TICKET_ID);
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    cleanViolationFiles(TEST_TICKET_ID);
    jest.restoreAllMocks();
  });

  it('does NOT generate violation file when hook passes', async () => {
    const result = await transitionStatus(VALID_TICKET_PATH, 'ready', 'pr_review');

    expect(result.success).toBe(true);

    // No violation file should be created
    const files = listViolationFiles(TEST_TICKET_ID);
    expect(files).toHaveLength(0);
  });
});
