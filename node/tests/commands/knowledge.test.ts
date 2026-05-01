/**
 * Tests for knowledge:index + knowledge:gc (TASK-210)
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { jest } from '@jest/globals';

import {
  buildIndexLines,
  extractSummary,
  findGcCandidates,
  loadMemoryMeta,
  parseFrontmatterTags,
  rebuildIndex,
} from '../../src/commands/knowledge.js';

// ── helpers ──────────────────────────────────────────────────────────────────

function mkTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'eket-knowledge-test-'));
}

function writeFile(dir: string, relPath: string, content: string, mtimeOffset = 0): string {
  const full = path.join(dir, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf-8');
  if (mtimeOffset !== 0) {
    const mtime = new Date(Date.now() - mtimeOffset);
    fs.utimesSync(full, mtime, mtime);
  }
  return full;
}

// ── parseFrontmatterTags ──────────────────────────────────────────────────────

describe('parseFrontmatterTags', () => {
  it('parses inline tags', () => {
    const content = '---\ntags: [foo, bar, baz]\n---\n# title';
    expect(parseFrontmatterTags(content)).toEqual(['foo', 'bar', 'baz']);
  });

  it('parses block tags', () => {
    const content = '---\ntags:\n  - alpha\n  - beta\n---\n# title';
    expect(parseFrontmatterTags(content)).toEqual(['alpha', 'beta']);
  });

  it('returns empty array when no frontmatter', () => {
    expect(parseFrontmatterTags('# just a title')).toEqual([]);
  });

  it('returns empty array when no tags key', () => {
    expect(parseFrontmatterTags('---\nauthor: someone\n---\n# title')).toEqual([]);
  });
});

// ── extractSummary ────────────────────────────────────────────────────────────

describe('extractSummary', () => {
  it('extracts first heading without #', () => {
    expect(extractSummary('# My Title\nsome text')).toBe('My Title');
  });

  it('skips frontmatter', () => {
    const content = '---\ntags: [x]\n---\n\n# Real Title';
    expect(extractSummary(content)).toBe('Real Title');
  });

  it('returns (empty) for blank file', () => {
    expect(extractSummary('   \n\n')).toBe('(empty)');
  });

  it('strips heading markers', () => {
    expect(extractSummary('## Sub Section\ndetail')).toBe('Sub Section');
  });
});

// ── buildIndexLines ──────────────────────────────────────────────────────────

describe('buildIndexLines', () => {
  it('formats lines correctly', () => {
    const metas = [
      {
        absPath: '/tmp/a.md',
        relPath: 'lessons/a.md',
        summary: 'Summary A',
        tags: ['tag1', 'tag2'],
        mtime: new Date(),
        sizeBytes: 100,
      },
      {
        absPath: '/tmp/b.md',
        relPath: 'pitfalls/b.md',
        summary: 'Summary B',
        tags: [],
        mtime: new Date(),
        sizeBytes: 200,
      },
    ];
    const lines = buildIndexLines(metas);
    expect(lines[0]).toBe('lessons/a.md: Summary A #tag1 #tag2');
    expect(lines[1]).toBe('pitfalls/b.md: Summary B');
  });
});

// ── rebuildIndex ──────────────────────────────────────────────────────────────

describe('rebuildIndex', () => {
  it('generates memory-index.md with correct entries', async () => {
    const dir = mkTmpDir();
    writeFile(dir, 'lessons/a.md', '# Lesson A\nsome detail');
    writeFile(dir, 'pitfalls/b.md', '---\ntags: [crash]\n---\n# Pitfall B');

    const result = await rebuildIndex(dir);
    expect(result.warned).toBe(false);
    expect(result.lines).toBe(2);

    const idx = fs.readFileSync(path.join(dir, 'memory-index.md'), 'utf-8');
    expect(idx).toContain('lessons/a.md: Lesson A');
    expect(idx).toContain('pitfalls/b.md: Pitfall B #crash');

    // cleanup
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('warns when lines exceed 50', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const dir = mkTmpDir();

    // create 55 files
    for (let i = 0; i < 55; i++) {
      writeFile(dir, `lessons/file${i}.md`, `# File ${i}\n`);
    }

    const result = await rebuildIndex(dir);
    expect(result.warned).toBe(true);
    expect(result.lines).toBeGreaterThan(50);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('memory index exceeds 50 lines'),
    );

    warnSpy.mockRestore();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('excludes memory-index.md itself from index', async () => {
    const dir = mkTmpDir();
    writeFile(dir, 'lessons/a.md', '# Lesson A');
    // pre-existing index
    writeFile(dir, 'memory-index.md', '# old index');

    await rebuildIndex(dir);
    const idx = fs.readFileSync(path.join(dir, 'memory-index.md'), 'utf-8');
    expect(idx).not.toContain('memory-index.md:');
    expect(idx).toContain('lessons/a.md:');

    fs.rmSync(dir, { recursive: true, force: true });
  });
});

// ── findGcCandidates ──────────────────────────────────────────────────────────

describe('findGcCandidates', () => {
  it('returns files older than threshold', () => {
    const dir = mkTmpDir();
    const MS = 86400 * 1000;
    writeFile(dir, 'old/file.md', '# Old File', 100 * MS);  // 100 days old
    writeFile(dir, 'new/file.md', '# New File', 1 * MS);    // 1 day old

    const candidates = findGcCandidates(dir, 90);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].relPath).toBe('old/file.md');
    expect(candidates[0].daysSinceModified).toBeGreaterThanOrEqual(90);

    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('sorts by mtime ascending (oldest first)', () => {
    const dir = mkTmpDir();
    const MS = 86400 * 1000;
    writeFile(dir, 'a.md', '# A', 200 * MS);
    writeFile(dir, 'b.md', '# B', 150 * MS);
    writeFile(dir, 'c.md', '# C', 100 * MS);

    const candidates = findGcCandidates(dir, 90);
    expect(candidates[0].relPath).toBe('a.md');
    expect(candidates[1].relPath).toBe('b.md');
    expect(candidates[2].relPath).toBe('c.md');

    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('dry-run output format includes days, size, path', () => {
    const dir = mkTmpDir();
    const MS = 86400 * 1000;
    writeFile(dir, 'old.md', '# Old', 95 * MS);

    const candidates = findGcCandidates(dir, 90);
    expect(candidates).toHaveLength(1);
    const c = candidates[0];
    // dry-run format fields exist
    expect(c).toHaveProperty('daysSinceModified');
    expect(c).toHaveProperty('sizeBytes');
    expect(c).toHaveProperty('relPath');
    expect(c.daysSinceModified).toBeGreaterThanOrEqual(90);

    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('returns empty array when no files exceed threshold', () => {
    const dir = mkTmpDir();
    writeFile(dir, 'new.md', '# New', 1 * 86400 * 1000);

    const candidates = findGcCandidates(dir, 90);
    expect(candidates).toHaveLength(0);

    fs.rmSync(dir, { recursive: true, force: true });
  });
});
