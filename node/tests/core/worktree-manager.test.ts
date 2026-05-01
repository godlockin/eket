/**
 * TASK-105a: WorktreeManager tests
 * 6 tests covering createWorktree / removeWorktree / listWorktrees / error paths
 *
 * Strategy: dependency injection via config.execFn — no jest.mock needed.
 */

import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { WorktreeManager } from '../../src/core/worktree-manager.js';
import type { ExecFn, ExecResult } from '../../src/core/worktree-manager.js';

// ============================================================================
// Helpers
// ============================================================================

function makeOkResult(stdout = ''): ExecResult {
  return { stdout, stderr: '', status: 0 };
}

function makeErrResult(stderr = 'git error'): ExecResult {
  return { stdout: '', stderr, status: 1 };
}

function makeExecFn(results: ExecResult[]): ExecFn {
  let idx = 0;
  return async () => results[idx++ % results.length] ?? makeOkResult();
}

function makeOkExecFn(): ExecFn {
  return async () => makeOkResult();
}

// ============================================================================
// Test setup
// ============================================================================

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'eket-wt-test-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

function makeManager(execFn: ExecFn) {
  return new WorktreeManager({
    projectRoot: tmpDir,
    hookServerPort: 19999, // nothing listens → sendHookEvent fails silently
    execFn,
  });
}

// ============================================================================
// Test 1: createWorktree returns correct path and writes index
// ============================================================================
test('createWorktree returns correct path and writes index', async () => {
  const mgr = makeManager(makeOkExecFn());

  const result = await mgr.createWorktree('TASK-001', 'slaver-1');

  const expectedPath = path.join(tmpDir, '.claude', 'worktrees', 'TASK-001');
  expect(result).toBe(expectedPath);

  // Verify index.json was written
  const indexRaw = await fs.readFile(
    path.join(tmpDir, '.claude', 'worktrees', 'index.json'),
    'utf-8',
  );
  const index = JSON.parse(indexRaw) as Record<string, unknown>;
  expect(index['TASK-001']).toMatchObject({
    ticketId: 'TASK-001',
    slaverId: 'slaver-1',
    path: expectedPath,
    branch: 'worktree/TASK-001/slaver-1',
  });
});

// ============================================================================
// Test 2: createWorktree throws when git exits non-zero
// ============================================================================
test('createWorktree throws on git failure', async () => {
  const mgr = makeManager(makeExecFn([makeErrResult('branch already exists')]));

  await expect(mgr.createWorktree('TASK-002', 'slaver-1')).rejects.toThrow(
    /createWorktree failed/,
  );
});

// ============================================================================
// Test 3: listWorktrees returns empty array when no worktrees exist
// ============================================================================
test('listWorktrees returns empty array when index absent', async () => {
  const mgr = makeManager(makeOkExecFn());
  const list = await mgr.listWorktrees();
  expect(list).toEqual([]);
});

// ============================================================================
// Test 4: listWorktrees returns all entries after creation
// ============================================================================
test('listWorktrees returns entries written by createWorktree', async () => {
  const mgr = makeManager(makeOkExecFn());

  await mgr.createWorktree('TASK-003', 'slaver-2');
  await mgr.createWorktree('TASK-004', 'slaver-3');

  const list = await mgr.listWorktrees();
  expect(list).toHaveLength(2);
  const ids = list.map((w) => w.ticketId).sort();
  expect(ids).toEqual(['TASK-003', 'TASK-004']);
});

// ============================================================================
// Test 5: removeWorktree removes entry from index
// ============================================================================
test('removeWorktree removes entry from index', async () => {
  const mgr = makeManager(makeOkExecFn());

  await mgr.createWorktree('TASK-005', 'slaver-4');
  let list = await mgr.listWorktrees();
  expect(list).toHaveLength(1);

  await mgr.removeWorktree('TASK-005');
  list = await mgr.listWorktrees();
  expect(list).toHaveLength(0);
});

// ============================================================================
// Test 6: removeWorktree throws when ticketId not in index
// ============================================================================
test('removeWorktree throws when worktree not found', async () => {
  const mgr = makeManager(makeOkExecFn());

  await expect(mgr.removeWorktree('TASK-NONEXISTENT')).rejects.toThrow(
    /no worktree found/,
  );
});
