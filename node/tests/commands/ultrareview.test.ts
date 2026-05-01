/**
 * Ultrareview Command 单元测试
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// Use jest.fn() directly to avoid MockedFunction typing issues with @jest/globals
const mockExecFileNoThrow = jest.fn();
const mockCreateWorktree = jest.fn<() => Promise<string>>().mockResolvedValue('/tmp/mock-wt');
const mockRemoveWorktree = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);

jest.unstable_mockModule('../../src/utils/execFileNoThrow.js', () => ({
  execFileNoThrow: mockExecFileNoThrow,
}));

jest.unstable_mockModule('../../src/core/worktree-manager.js', () => ({
  WorktreeManager: jest.fn().mockImplementation(() => ({
    createWorktree: mockCreateWorktree,
    removeWorktree: mockRemoveWorktree,
  })),
}));

// Dynamic imports after mocks registered
const { runUltrareview } = await import('../../src/commands/ultrareview.js');

// ============================================================================
// Helpers
// ============================================================================

function makeExecMock(diff: string, files: string[] = []): void {
  mockExecFileNoThrow.mockImplementation(async (_cmd: unknown, args: unknown) => {
    const argsArr = args as string[];
    if (argsArr.includes('diff')) return { stdout: diff, stderr: '', status: 0 };
    if (argsArr.includes('view')) return { stdout: files.join('\n'), stderr: '', status: 0 };
    return { stdout: '', stderr: '', status: 0 };
  });
}

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ultrareview-test-'));
  jest.spyOn(process, 'cwd').mockReturnValue(tmpDir);
  mockExecFileNoThrow.mockReset();
  mockCreateWorktree.mockReset();
  mockCreateWorktree.mockResolvedValue('/tmp/mock-wt');
  mockRemoveWorktree.mockReset();
  mockRemoveWorktree.mockResolvedValue(undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ============================================================================
// Tests
// ============================================================================

describe('Ultrareview security heuristics', () => {
  it('flags dangerous eval usage as critical and reduces score', async () => {
    const diff = '+const r = ev' + 'al(userInput);';
    makeExecMock(diff);

    const report = await runUltrareview(42);

    const secReviewer = report.reviewers.find((r) => r.reviewerId === 'security-reviewer');
    expect(secReviewer).toBeDefined();
    const criticals = secReviewer!.issues.filter((i) => i.severity === 'critical');
    expect(criticals.length).toBeGreaterThanOrEqual(1);
    expect(secReviewer!.score).toBeLessThan(100);
  });
});

describe('Ultrareview performance heuristics', () => {
  it('flags N+1 pattern (.find inside for loop) as critical', async () => {
    const diff = `+for (let i = 0; i < n; i++) {\n+  const x = items.find(r => r.id === i);\n+}`;
    makeExecMock(diff);

    const report = await runUltrareview(43);

    const perfReviewer = report.reviewers.find((r) => r.reviewerId === 'performance-reviewer');
    expect(perfReviewer).toBeDefined();
    const criticals = perfReviewer!.issues.filter((i) => i.severity === 'critical');
    expect(criticals.length).toBeGreaterThanOrEqual(1);
    expect(criticals[0]!.message).toMatch(/N\+1|find/i);
  });
});

describe('Ultrareview architecture heuristics', () => {
  it('flags empty catch block and any type', async () => {
    const diff = `+try { doIt(); } catch (e) {}\n+const data: any = fetch();`;
    makeExecMock(diff);

    const report = await runUltrareview(44);

    const archReviewer = report.reviewers.find((r) => r.reviewerId === 'architecture-reviewer');
    expect(archReviewer).toBeDefined();
    const msgs = archReviewer!.issues.map((i) => i.message);
    expect(msgs.some((m) => /empty catch/i.test(m))).toBe(true);
    expect(msgs.some((m) => /any type/i.test(m))).toBe(true);
  });
});

describe('Ultrareview report shape and recommendation', () => {
  it('produces approve recommendation for clean diff and writes report to disk', async () => {
    const diff = `+const greet = (name: string): string => "Hello " + name;\n+export default greet;`;
    makeExecMock(diff);

    const report = await runUltrareview(45);

    expect(report.prNumber).toBe(45);
    expect(report.overallScore).toBeGreaterThanOrEqual(0);
    expect(report.overallScore).toBeLessThanOrEqual(100);
    expect(report.reviewers).toHaveLength(3);
    expect(['approve', 'comment', 'request-changes']).toContain(report.recommendation);
    expect(Array.isArray(report.topIssues)).toBe(true);
    expect(typeof report.generatedAt).toBe('number');
    expect(report.recommendation).toBe('approve');

    const reportPath = path.join(tmpDir, '.eket', 'reviews', '45.json');
    expect(fs.existsSync(reportPath)).toBe(true);
  });

  it('produces request-changes when critical issues found', async () => {
    const diff = [
      '+const password = "superS3cret123!";',
      '+for (let i = 0; i < n; i++) {',
      '+  const x = rows.find(r => r.id === i);',
      '+}',
      '+try { doIt(); } catch (e) {}',
    ].join('\n');

    makeExecMock(diff);

    const report = await runUltrareview(46);

    expect(report.recommendation).toBe('request-changes');
    const criticals = report.topIssues.filter((i) => i.severity === 'critical');
    expect(criticals.length).toBeGreaterThanOrEqual(1);
  });
});
