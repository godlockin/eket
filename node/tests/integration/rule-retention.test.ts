/**
 * TASK-041: Rule Retention Integration Test
 * Verifies all 3 layers work together:
 *   Layer 1 — CLAUDE.md token compression (count-tokens.sh)
 *   Layer 2 — Mini-rules constants + SLAVER/MASTER rules docs
 *   Layer 3b — Hook pipeline: pr_review trigger + violation reporting
 */
import { describe, it, expect, jest } from '@jest/globals';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { execSync } from 'child_process';

// Use import.meta.url for reliable path resolution in ts-jest ESM mode
const __filename = fileURLToPath(import.meta.url);
const __dirnamePath = dirname(__filename);
// tests/integration/ -> node/ -> repo root
const REPO_ROOT = join(__dirnamePath, '..', '..', '..');

import { transitionStatus } from '../../src/core/workflow-engine.js';
import { SLAVER_HARD_RULES } from '../../src/core/slaver-rules.js';
import { EketErrorCode } from '../../src/types/index.js';

const VALID_TICKET = join(REPO_ROOT, 'test-fixtures', 'valid-ticket.md');
const INVALID_TICKET = join(REPO_ROOT, 'test-fixtures', 'invalid-ticket-no-pr.md');
const INBOX_DIR = join(REPO_ROOT, 'inbox', 'human_feedback');

// ---------------------------------------------------------------------------
// Layer 1: Token compression script
// ---------------------------------------------------------------------------
describe('Layer 1: Token compression script', () => {
  it('scripts/count-tokens.sh exists', () => {
    expect(existsSync(join(REPO_ROOT, 'scripts', 'count-tokens.sh'))).toBe(true);
  });

  it('count-tokens.sh --role master runs and prints token estimate', () => {
    const scriptPath = join(REPO_ROOT, 'scripts', 'count-tokens.sh');
    const result = execSync(`bash "${scriptPath}" --role master`, { cwd: REPO_ROOT }).toString();
    expect(result).toMatch(/Master session: ~\d+ tokens/);
  });
});

// ---------------------------------------------------------------------------
// Layer 2: Mini-rules constants + rules docs
// ---------------------------------------------------------------------------
describe('Layer 2: Mini-rules in progress report', () => {
  it('SLAVER_HARD_RULES has exactly 5 items', () => {
    expect(SLAVER_HARD_RULES).toHaveLength(5);
  });

  it('SLAVER_HARD_RULES contains all required rule IDs SR-01..SR-05', () => {
    const ids = SLAVER_HARD_RULES.map((r) => r.id);
    expect(ids).toContain('SR-01');
    expect(ids).toContain('SR-02');
    expect(ids).toContain('SR-03');
    expect(ids).toContain('SR-04');
    expect(ids).toContain('SR-05');
  });

  it('SLAVER-RULES.md contains hard rule content matching SLAVER_HARD_RULES items', () => {
    const slaverRules = readFileSync(join(REPO_ROOT, 'template', 'docs', 'SLAVER-RULES.md'), 'utf8');
    // SLAVER_HARD_RULES SR-03: analysis paralysis rule
    expect(slaverRules).toContain('BLOCKED');
    // SLAVER_HARD_RULES SR-02: no self-review
    expect(slaverRules).toContain('PR');
  });

  it('MASTER-RULES.md contains anti-hallucination rule', () => {
    const masterRules = readFileSync(join(REPO_ROOT, 'template', 'docs', 'MASTER-RULES.md'), 'utf8');
    expect(masterRules).toContain('禁止伪造测试结果');
  });
});

// ---------------------------------------------------------------------------
// Layer 3b: Hook pipeline
// ---------------------------------------------------------------------------
describe('Layer 3b: Hook pipeline', () => {
  it('pr_review transition 100% triggers hook log in DRYRUN mode', async () => {
    process.env['EKET_HOOK_DRYRUN'] = 'true';
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const result = await transitionStatus(VALID_TICKET, 'ready', 'pr_review');
      expect(result.success).toBe(true);
      const hookLogged = logSpy.mock.calls.some((args) =>
        String(args[0]).includes('DRYRUN'),
      );
      expect(hookLogged).toBe(true);
    } finally {
      delete process.env['EKET_HOOK_DRYRUN'];
      logSpy.mockRestore();
    }
  });

  it('valid ticket passes hook validation (real mode)', async () => {
    delete process.env['EKET_HOOK_DRYRUN'];
    const result = await transitionStatus(VALID_TICKET, 'ready', 'pr_review');
    expect(result.success).toBe(true);
  });

  it('invalid ticket generates violation file in inbox/human_feedback/', async () => {
    delete process.env['EKET_HOOK_DRYRUN'];

    // Snapshot files before
    const before = existsSync(INBOX_DIR)
      ? readdirSync(INBOX_DIR).filter((f) => f.startsWith('violation-invalid-ticket-no-pr-'))
      : [];

    const result = await transitionStatus(INVALID_TICKET, 'ready', 'pr_review');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe(EketErrorCode.HOOK_BLOCKED);
    }

    // Violation file must have been created
    const after = existsSync(INBOX_DIR)
      ? readdirSync(INBOX_DIR).filter((f) => f.startsWith('violation-invalid-ticket-no-pr-'))
      : [];
    expect(after.length).toBeGreaterThan(before.length);
  });
});
