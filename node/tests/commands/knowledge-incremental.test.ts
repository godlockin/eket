/**
 * Tests for TASK-213: incremental knowledge:index with SHA-256 state
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import {
  emptyState,
  hashFileContent,
  incrementalIndex,
  loadState,
  rebuildIndex,
  saveState,
} from '../../src/commands/knowledge.js';

// ── helpers ───────────────────────────────────────────────────────────────────

function mkTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'eket-incr-test-'));
}

function writeFile(dir: string, relPath: string, content: string): string {
  const full = path.join(dir, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf-8');
  return full;
}

function cleanup(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

// ── hashFileContent ───────────────────────────────────────────────────────────

describe('hashFileContent', () => {
  it('returns hex sha256 of file', () => {
    const dir = mkTmpDir();
    const f = writeFile(dir, 'a.md', 'hello world');
    const hash = hashFileContent(f);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    cleanup(dir);
  });

  it('different content → different hash', () => {
    const dir = mkTmpDir();
    const a = writeFile(dir, 'a.md', 'content A');
    const b = writeFile(dir, 'b.md', 'content B');
    expect(hashFileContent(a)).not.toBe(hashFileContent(b));
    cleanup(dir);
  });

  it('same content → same hash', () => {
    const dir = mkTmpDir();
    const a = writeFile(dir, 'a.md', 'same');
    const b = writeFile(dir, 'b.md', 'same');
    expect(hashFileContent(a)).toBe(hashFileContent(b));
    cleanup(dir);
  });
});

// ── loadState / saveState ─────────────────────────────────────────────────────

describe('loadState / saveState', () => {
  it('returns emptyState when no file', () => {
    const dir = mkTmpDir();
    const state = loadState(dir);
    expect(state.version).toBe(1);
    expect(state.files).toEqual({});
    expect(state.last_full_rebuild).toBeNull();
    cleanup(dir);
  });

  it('round-trips state correctly', () => {
    const dir = mkTmpDir();
    const state = emptyState();
    state.files['foo.md'] = { sha256: 'abc', indexed_at: '2026-01-01T00:00:00Z', entry_count: 3 };
    state.last_full_rebuild = '2026-01-01T00:00:00Z';
    saveState(dir, state);
    const loaded = loadState(dir);
    expect(loaded.files['foo.md'].sha256).toBe('abc');
    expect(loaded.last_full_rebuild).toBe('2026-01-01T00:00:00Z');
    cleanup(dir);
  });

  it('returns emptyState for wrong version', () => {
    const dir = mkTmpDir();
    const statePath = path.join(dir, '.eket-index-state.json');
    fs.writeFileSync(statePath, JSON.stringify({ version: 99, files: {}, last_full_rebuild: null }));
    const state = loadState(dir);
    expect(state.files).toEqual({});
    cleanup(dir);
  });
});

// ── rebuildIndex (with state) ─────────────────────────────────────────────────

describe('rebuildIndex state update', () => {
  it('creates state file after full rebuild', async () => {
    const dir = mkTmpDir();
    writeFile(dir, 'lessons/a.md', '# Lesson A');
    writeFile(dir, 'pitfalls/b.md', '# Pitfall B');

    const result = await rebuildIndex(dir);
    expect(result.lines).toBe(2);

    const state = loadState(dir);
    expect(state.last_full_rebuild).toBeTruthy();
    expect(Object.keys(state.files)).toHaveLength(2);
    expect(state.files['lessons/a.md']).toBeDefined();
    expect(state.files['pitfalls/b.md']).toBeDefined();
    cleanup(dir);
  });
});

// ── incrementalIndex ──────────────────────────────────────────────────────────

describe('incrementalIndex', () => {
  it('首次建索引（无state）— indexes all as changed', async () => {
    const dir = mkTmpDir();
    writeFile(dir, 'a.md', '# A');
    writeFile(dir, 'b.md', '# B');

    const result = await incrementalIndex(dir);
    expect(result.changed).toBe(2);
    expect(result.unchanged).toBe(0);
    expect(result.deleted).toBe(0);

    // index file created
    expect(fs.existsSync(path.join(dir, 'memory-index.md'))).toBe(true);
    // state saved
    const state = loadState(dir);
    expect(Object.keys(state.files)).toHaveLength(2);

    cleanup(dir);
  });

  it('增量检测变更文件 — only changed file re-indexed', async () => {
    const dir = mkTmpDir();
    writeFile(dir, 'a.md', '# A original');
    writeFile(dir, 'b.md', '# B unchanged');

    // First run — build state
    await incrementalIndex(dir);

    // Modify only a.md
    writeFile(dir, 'a.md', '# A modified');

    const result = await incrementalIndex(dir);
    expect(result.changed).toBe(1);
    expect(result.unchanged).toBe(1);
    expect(result.deleted).toBe(0);

    cleanup(dir);
  });

  it('no changes — all unchanged', async () => {
    const dir = mkTmpDir();
    writeFile(dir, 'a.md', '# A');
    await incrementalIndex(dir);
    const result = await incrementalIndex(dir);
    expect(result.changed).toBe(0);
    expect(result.unchanged).toBe(1);
    expect(result.deleted).toBe(0);
    cleanup(dir);
  });

  it('删除文件从索引移除', async () => {
    const dir = mkTmpDir();
    writeFile(dir, 'a.md', '# A');
    writeFile(dir, 'b.md', '# B');
    await incrementalIndex(dir);

    // Delete b.md
    fs.unlinkSync(path.join(dir, 'b.md'));

    const result = await incrementalIndex(dir);
    expect(result.deleted).toBe(1);
    expect(result.changed).toBe(0);
    expect(result.unchanged).toBe(1);

    // State should not contain b.md
    const state = loadState(dir);
    expect(state.files['b.md']).toBeUndefined();
    expect(state.files['a.md']).toBeDefined();

    cleanup(dir);
  });

  it('--rebuild 强制全量 — last_full_rebuild updated, all in state', async () => {
    const dir = mkTmpDir();
    writeFile(dir, 'a.md', '# A');
    writeFile(dir, 'b.md', '# B');

    // Run incremental first to establish state
    await incrementalIndex(dir);

    // Now force full rebuild
    const before = loadState(dir).last_full_rebuild;
    await new Promise((r) => setTimeout(r, 10)); // ensure timestamp differs
    await rebuildIndex(dir);

    const after = loadState(dir).last_full_rebuild;
    expect(after).not.toBeNull();
    expect(after).not.toBe(before);

    cleanup(dir);
  });

  it('output summary fields present', async () => {
    const dir = mkTmpDir();
    writeFile(dir, 'x.md', '# X');
    const result = await incrementalIndex(dir);
    expect(result).toHaveProperty('changed');
    expect(result).toHaveProperty('unchanged');
    expect(result).toHaveProperty('deleted');
    expect(result).toHaveProperty('elapsedMs');
    expect(result.elapsedMs).toBeGreaterThanOrEqual(0);
    cleanup(dir);
  });

  it('excludes memory-index.md and state file from processing', async () => {
    const dir = mkTmpDir();
    writeFile(dir, 'a.md', '# A');
    // pre-create index and state
    writeFile(dir, 'memory-index.md', '# old index');

    const result = await incrementalIndex(dir);
    expect(result.changed).toBe(1); // only a.md

    const state = loadState(dir);
    expect(state.files['memory-index.md']).toBeUndefined();

    cleanup(dir);
  });
});
