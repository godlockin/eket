/**
 * Tool Output Filter Tests
 * TASK-605: Covers all 5 ACs
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { filterToolOutput } from '../../src/utils/tool-output-filter.js';

describe('tool-output-filter', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'filter-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ==========================================================================
  // AC1: Grep - Exact Match Priority
  // ==========================================================================

  it('AC1: grep keeps exact matches first, limits to 100', () => {
    // Generate 150 grep lines (mixed exact/fuzzy)
    const lines: string[] = [];

    for (let i = 0; i < 150; i++) {
      const exact = i % 2 === 0;
      const content = exact ? 'exact pattern match' : 'fuzzy ptrn result';
      lines.push(`file${i}.ts:${i + 1}:${content}`);
    }

    const input = lines.join('\n');
    const output = filterToolOutput('Grep', input, tmpDir);

    const outLines = output.split('\n').filter(Boolean);

    // Should keep 100 results + 1 footer
    expect(outLines.length).toBeLessThanOrEqual(101);

    // Footer should mention 50 omitted
    expect(output).toContain('[... 50 more results omitted]');

    // First results should be exact (heuristic: "exact" in content)
    const firstLine = outLines[0];
    expect(firstLine).toContain('exact');
  });

  it('AC1: grep no filter if ≤100 results', () => {
    const lines = Array.from({ length: 50 }, (_, i) => `file${i}.ts:${i}:content`);
    const input = lines.join('\n');
    const output = filterToolOutput('Grep', input, tmpDir);

    expect(output).toBe(input); // No change
  });

  // ==========================================================================
  // AC2: Glob - mtime Descending
  // ==========================================================================

  it('AC2: glob sorts by mtime desc, limits stat to 200', async () => {
    // Create 250 files with known mtime
    const files: string[] = [];

    for (let i = 0; i < 250; i++) {
      const file = path.join(tmpDir, `file${i}.txt`);
      fs.writeFileSync(file, 'content');

      // Set mtime: newer files have higher index
      const mtime = new Date(2020, 0, 1 + i);
      fs.utimesSync(file, mtime, mtime);

      files.push(file);
    }

    const input = files.join('\n');
    const output = filterToolOutput('Glob', input, tmpDir);

    const outLines = output.split('\n').filter((l) => l && !l.startsWith('[...'));

    // Should keep 100 results (stat limit 200, then filter top 100)
    expect(outLines.length).toBe(100);

    // Footer should mention 150 omitted
    expect(output).toContain('[... 150 more results omitted]');

    // First result should be file199 (newest among first 200 stat'd)
    expect(outLines[0]).toContain('file199');

    // Last result should be file100 (100th newest after sorting first 200)
    expect(outLines[outLines.length - 1]).toContain('file100');
  });

  it('AC2: glob no filter if ≤100 files', () => {
    // Create 50 files
    const files: string[] = [];

    for (let i = 0; i < 50; i++) {
      const file = path.join(tmpDir, `file${i}.txt`);
      fs.writeFileSync(file, 'content');
      files.push(file);
    }

    const input = files.join('\n');
    const output = filterToolOutput('Glob', input, tmpDir);

    expect(output).toBe(input); // No change
  });

  // ==========================================================================
  // AC3: ls - Original Order
  // ==========================================================================

  it('AC3: ls keeps original order, no filter', () => {
    const input = `file3.txt\nfile1.txt\nfile2.txt`;
    const output = filterToolOutput('ls', input, tmpDir);

    expect(output).toBe(input); // Unchanged
  });

  // ==========================================================================
  // AC4: Unknown - Truncate 5000 chars
  // ==========================================================================

  it('AC4: unknown tool truncates to 5000 chars', () => {
    const input = 'x'.repeat(8000);
    const output = filterToolOutput('UnknownTool', input, tmpDir);

    expect(output.length).toBeLessThan(input.length);
    expect(output).toContain('[... output truncated');
    expect(output).toContain('3000 chars omitted]'); // 8000 - 5000
  });

  it('AC4: unknown no truncate if ≤5000 chars', () => {
    const input = 'x'.repeat(3000);
    const output = filterToolOutput('UnknownTool', input, tmpDir);

    expect(output).toBe(input); // No change
  });

  // ==========================================================================
  // AC5: Footer Appended
  // ==========================================================================

  it('AC5: footer shows omitted count', () => {
    const lines = Array.from({ length: 150 }, (_, i) => `result${i}`);
    const input = lines.join('\n');
    const output = filterToolOutput('Grep', input, tmpDir);

    expect(output).toContain('[... 50 more results omitted]');
  });

  it('AC5: no footer if nothing omitted', () => {
    const input = 'result1\nresult2';
    const output = filterToolOutput('Grep', input, tmpDir);

    expect(output).not.toContain('[...');
  });
});
