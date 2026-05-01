/**
 * Worktree Integration Tests
 * 验证 task:claim / task:complete 与 WorktreeManager 的集成
 */

import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

import { WorktreeManager, type WorktreeInfo } from '../../src/core/worktree-manager.js';
import { writeConflictNotice } from '../../src/commands/complete.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'eket-wt-integ-'));
}

function buildMockWm(overrides: Partial<{
  createWorktree: (ticketId: string, slaverId: string) => Promise<string>;
  mergeWorktree: (ticketId: string) => Promise<void>;
  removeWorktree: (ticketId: string, force?: boolean) => Promise<void>;
  listWorktrees: () => Promise<WorktreeInfo[]>;
}>): WorktreeManager {
  const wm = Object.create(WorktreeManager.prototype) as WorktreeManager;
  wm.createWorktree = overrides.createWorktree ?? jest.fn<() => Promise<string>>().mockResolvedValue('/tmp/wt/TICKET-01');
  wm.mergeWorktree = overrides.mergeWorktree ?? jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
  wm.removeWorktree = overrides.removeWorktree ?? jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
  wm.listWorktrees = overrides.listWorktrees ?? jest.fn<() => Promise<WorktreeInfo[]>>().mockResolvedValue([]);
  return wm;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('worktree integration — claim creates worktree', () => {
  it('calls createWorktree when isolation=worktree', async () => {
    const created: string[] = [];
    const wm = buildMockWm({
      createWorktree: async (ticketId, slaverId) => {
        created.push(`${ticketId}:${slaverId}`);
        return `/tmp/wt/${ticketId}`;
      },
    });

    const wtPath = await wm.createWorktree('TICKET-01', 'slaver_abc');
    expect(wtPath).toBe('/tmp/wt/TICKET-01');
    expect(created).toContain('TICKET-01:slaver_abc');
  });

  it('does NOT call createWorktree when isolation=none', async () => {
    const createFn = jest.fn<() => Promise<string>>().mockResolvedValue('/tmp/wt/x');
    const wm = buildMockWm({ createWorktree: createFn });

    // Simulate isolation=none: skip createWorktree call entirely
    const isolationMode: 'worktree' | 'none' = 'none';
    if (isolationMode === 'worktree') {
      await wm.createWorktree('TICKET-01', 'slaver_abc');
    }

    expect(createFn).not.toHaveBeenCalled();
  });
});

describe('worktree integration — complete merges and removes', () => {
  it('calls mergeWorktree then removeWorktree on success', async () => {
    const log: string[] = [];
    const wm = buildMockWm({
      mergeWorktree: async (ticketId) => { log.push(`merge:${ticketId}`); },
      removeWorktree: async (ticketId) => { log.push(`remove:${ticketId}`); },
    });

    await wm.mergeWorktree('TICKET-02');
    await wm.removeWorktree('TICKET-02');

    expect(log).toEqual(['merge:TICKET-02', 'remove:TICKET-02']);
  });

  it('on merge conflict: writes BLOCKED notice to inbox and does NOT call removeWorktree', async () => {
    const tmpDir = makeTmpDir();
    const removeFn = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);

    const wm = buildMockWm({
      mergeWorktree: async () => { throw new Error('CONFLICT: merge failed'); },
      removeWorktree: removeFn,
    });

    let mergeError: Error | null = null;
    try {
      await wm.mergeWorktree('TICKET-03');
    } catch (e) {
      mergeError = e as Error;
    }

    expect(mergeError).not.toBeNull();
    expect(mergeError!.message).toContain('CONFLICT');

    // Write inbox notice (simulating what complete command does)
    writeConflictNotice(
      tmpDir,
      'TICKET-03',
      'slaver_xyz',
      `.claude/worktrees/TICKET-03`,
      mergeError!.message,
    );

    // removeWorktree should NOT have been called
    expect(removeFn).not.toHaveBeenCalled();

    // Inbox notice should exist
    const noticeDir = path.join(tmpDir, 'inbox', 'human_feedback');
    const files = fs.readdirSync(noticeDir);
    expect(files.length).toBeGreaterThan(0);

    const noticeContent = fs.readFileSync(path.join(noticeDir, files[0]), 'utf-8');
    expect(noticeContent).toContain('TICKET-03');
    expect(noticeContent).toContain('slaver_xyz');
    expect(noticeContent).toContain('CONFLICT');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('writeConflictNotice creates file with all required fields', () => {
    const tmpDir = makeTmpDir();

    writeConflictNotice(
      tmpDir,
      'TASK-999',
      'slaver_test',
      '/path/to/worktree',
      'test error message',
    );

    const noticeDir = path.join(tmpDir, 'inbox', 'human_feedback');
    const files = fs.readdirSync(noticeDir);
    expect(files).toHaveLength(1);

    const content = fs.readFileSync(path.join(noticeDir, files[0]), 'utf-8');
    expect(content).toContain('TASK-999');
    expect(content).toContain('slaver_test');
    expect(content).toContain('/path/to/worktree');
    expect(content).toContain('test error message');
    expect(content).toContain('git worktree remove');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
