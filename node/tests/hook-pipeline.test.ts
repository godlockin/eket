/**
 * EKET Framework - Hook Pipeline Tests (TASK-035/036)
 *
 * 覆盖：
 * - transitionStatus(id, 'ready', 'pr_review') 触发 runPrePrReviewHook
 * - EKET_HOOK_DRYRUN=true 不触发真实 hook，只记日志
 * - hookOverride: true 跳过 hook
 * - 非 pr_review 目标状态不触发 hook
 * - hook 失败返回 HOOK_BLOCKED 错误
 *
 * 注意：runPrePrReviewHook 现在调用真实脚本 scripts/validate-ticket-pr.sh。
 * 需要传入合规的 ticket 文件路径，或使用 EKET_HOOK_DRYRUN=true 绕过真实调用。
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { join } from 'path';
import { EketErrorCode } from '../src/types/index.js';

// ─── import module under test ────────────────────────────────────────────────
import {
  transitionStatus,
  runPrePrReviewHook,
} from '../src/core/workflow-engine.js';

// ─── helpers ─────────────────────────────────────────────────────────────────

// Use process.cwd() which resolves to the node/ directory when running npm test
// Then go up one level to reach repo root
const REPO_ROOT = join(process.cwd(), '..');
console.log(`[TEST DEBUG] process.cwd()=${process.cwd()} REPO_ROOT=${REPO_ROOT}`);
const VALID_TICKET_PATH = join(REPO_ROOT, 'test-fixtures', 'valid-ticket.md');
const INVALID_TICKET_PATH = join(REPO_ROOT, 'test-fixtures', 'invalid-ticket-no-pr.md');

describe('runPrePrReviewHook (real script)', () => {
  it('returns success: true for a valid ticket fixture', async () => {
    const result = await runPrePrReviewHook(VALID_TICKET_PATH);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBeUndefined();
    }
  });

  it('returns success: false (HOOK_BLOCKED) for an invalid ticket fixture', async () => {
    const result = await runPrePrReviewHook(INVALID_TICKET_PATH);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe(EketErrorCode.HOOK_BLOCKED);
    }
  });
});

describe('transitionStatus — pr_review hook injection', () => {
  const originalDryrun = process.env['EKET_HOOK_DRYRUN'];

  afterEach(() => {
    // Restore env
    if (originalDryrun === undefined) {
      delete process.env['EKET_HOOK_DRYRUN'];
    } else {
      process.env['EKET_HOOK_DRYRUN'] = originalDryrun;
    }
    jest.restoreAllMocks();
  });

  it('triggers runPrePrReviewHook when transitioning to pr_review (dryrun mode)', async () => {
    // Use DRYRUN so we don't need a real valid ticket file; just verify hook is invoked
    process.env['EKET_HOOK_DRYRUN'] = 'true';
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    const result = await transitionStatus(VALID_TICKET_PATH, 'ready', 'pr_review');

    expect(result.success).toBe(true);
    // DRYRUN mode should log hook invocation
    const hookLogged = consoleSpy.mock.calls.some(
      (args) => String(args[0]).includes('runPrePrReviewHook') || String(args[0]).includes('DRYRUN'),
    );
    expect(hookLogged).toBe(true);
  });

  it('returns success when hook passes (valid ticket fixture)', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const result = await transitionStatus(VALID_TICKET_PATH, 'ready', 'pr_review');
    expect(result.success).toBe(true);
  });

  it('EKET_HOOK_DRYRUN=true: does not call real hook, logs only, returns success', async () => {
    process.env['EKET_HOOK_DRYRUN'] = 'true';

    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    const result = await transitionStatus(VALID_TICKET_PATH, 'ready', 'pr_review');

    expect(result.success).toBe(true);
    // Dryrun log should include DRYRUN marker
    const dryrunLogged = consoleSpy.mock.calls.some(
      (args) => String(args[0]).includes('DRYRUN'),
    );
    expect(dryrunLogged).toBe(true);
  });

  it('hookOverride: true skips hook entirely', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    const result = await transitionStatus(VALID_TICKET_PATH, 'ready', 'pr_review', {
      hookOverride: true,
    });

    expect(result.success).toBe(true);
    // No hook-related log should appear
    const hookLogged = consoleSpy.mock.calls.some(
      (args) => String(args[0]).includes('runPrePrReviewHook'),
    );
    expect(hookLogged).toBe(false);
  });

  it('non-pr_review target does not trigger hook', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    const result = await transitionStatus(VALID_TICKET_PATH, 'ready', 'in_progress');

    expect(result.success).toBe(true);
    const hookLogged = consoleSpy.mock.calls.some(
      (args) => String(args[0]).includes('runPrePrReviewHook'),
    );
    expect(hookLogged).toBe(false);
  });

  it('returns HOOK_BLOCKED when hook returns failure (invalid ticket fixture)', async () => {
    const result = await transitionStatus(INVALID_TICKET_PATH, 'ready', 'pr_review');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe(EketErrorCode.HOOK_BLOCKED);
    }
  });
});

describe('transitionStatus — non-pr_review transitions', () => {
  it('backlog → analysis succeeds without hook', async () => {
    const result = await transitionStatus(VALID_TICKET_PATH, 'backlog', 'analysis');
    expect(result.success).toBe(true);
  });

  it('test → pr_review triggers hook (valid ticket passes)', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const result = await transitionStatus(VALID_TICKET_PATH, 'test', 'pr_review');
    expect(result.success).toBe(true);
    jest.restoreAllMocks();
  });

  it('pr_review → done does NOT trigger hook', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const result = await transitionStatus(VALID_TICKET_PATH, 'pr_review', 'done');
    expect(result.success).toBe(true);

    const hookLogged = consoleSpy.mock.calls.some(
      (args) => String(args[0]).includes('runPrePrReviewHook'),
    );
    expect(hookLogged).toBe(false);

    jest.restoreAllMocks();
  });
});

describe('HookResult type and HOOK_BLOCKED error code', () => {
  it('EketErrorCode.HOOK_BLOCKED exists as string', () => {
    expect(typeof EketErrorCode.HOOK_BLOCKED).toBe('string');
    expect(EketErrorCode.HOOK_BLOCKED).toBe('HOOK_BLOCKED');
  });
});
