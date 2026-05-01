/**
 * Tests for commit trailer auto-generation (TASK-108)
 * Uses jest.unstable_mockModule for ESM-compatible mocking
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockExecFileNoThrow = jest.fn();
const mockGetInstance = jest.fn();
const mockCreateInstanceRegistry = jest.fn(() => ({ getInstance: mockGetInstance }));

jest.unstable_mockModule('../../src/utils/execFileNoThrow.js', () => ({
  execFileNoThrow: mockExecFileNoThrow,
}));

jest.unstable_mockModule('../../src/core/instance-registry.js', () => ({
  createInstanceRegistry: mockCreateInstanceRegistry,
}));

// Dynamic import AFTER mocking
const { inferScopeRisk, buildCommitTrailer, getChangedFileCount } = await import(
  '../../src/commands/complete.js'
);

describe('inferScopeRisk', () => {
  it('returns low for ≤5 files', () => {
    expect(inferScopeRisk(0)).toBe('low');
    expect(inferScopeRisk(5)).toBe('low');
  });

  it('returns medium for 6–15 files', () => {
    expect(inferScopeRisk(6)).toBe('medium');
    expect(inferScopeRisk(15)).toBe('medium');
  });

  it('returns high for ≥16 files', () => {
    expect(inferScopeRisk(16)).toBe('high');
    expect(inferScopeRisk(100)).toBe('high');
  });
});

describe('getChangedFileCount', () => {
  beforeEach(() => {
    mockExecFileNoThrow.mockReset();
  });

  it('parses file count from git diff stat output', async () => {
    mockExecFileNoThrow.mockResolvedValueOnce({
      stdout: ' src/foo.ts | 10 ++\n src/bar.ts | 5 -\n 2 files changed, 15 insertions(+)',
      stderr: '',
      status: 0,
    });
    const count = await getChangedFileCount();
    expect(count).toBe(2);
  });

  it('returns 0 for empty output', async () => {
    mockExecFileNoThrow.mockResolvedValueOnce({ stdout: '', stderr: '', status: 0 });
    const count = await getChangedFileCount();
    expect(count).toBe(0);
  });
});

describe('buildCommitTrailer', () => {
  beforeEach(() => {
    mockExecFileNoThrow.mockReset();
    mockGetInstance.mockReset();
    mockCreateInstanceRegistry.mockReset();
    mockCreateInstanceRegistry.mockImplementation(() => ({ getInstance: mockGetInstance }));
  });

  it('returns trailer with Confidence:high for 0 level changes', async () => {
    mockGetInstance.mockResolvedValue({ data: { currentLevel: 1, levelChanges: [] } });
    mockExecFileNoThrow.mockResolvedValueOnce({
      stdout: ' a.ts | 1 +\n b.ts | 2 +\n c.ts | 1 -\n 3 files changed, 4 insertions(+)',
      stderr: '',
      status: 0,
    });

    const trailer = await buildCommitTrailer('TASK-108', 'slaver-1');
    expect(trailer).toContain('Confidence: high');
    expect(trailer).toContain('Scope-risk: low');
    expect(trailer).toContain('Directive: TASK-108');
    expect(trailer).toContain('Rejected-approaches: none');
  });

  it('infers medium confidence for 1 level change', async () => {
    mockGetInstance.mockResolvedValue({
      data: {
        currentLevel: 2,
        levelChanges: [{ reason: 'redis-unavailable', timestamp: Date.now() }],
      },
    });
    mockExecFileNoThrow.mockResolvedValueOnce({ stdout: '', stderr: '', status: 0 });

    const trailer = await buildCommitTrailer('TASK-108', 'slaver-1');
    expect(trailer).toContain('Confidence: medium');
  });

  it('infers low confidence for 2+ level changes', async () => {
    mockGetInstance.mockResolvedValue({
      data: {
        currentLevel: 3,
        levelChanges: [
          { reason: 'redis-unavailable', timestamp: Date.now() },
          { reason: 'sqlite-fallback', timestamp: Date.now() },
        ],
      },
    });
    mockExecFileNoThrow.mockResolvedValueOnce({ stdout: '', stderr: '', status: 0 });

    const trailer = await buildCommitTrailer('TASK-108', 'slaver-1');
    expect(trailer).toContain('Confidence: low');
  });

  it('falls back gracefully when registry unavailable', async () => {
    mockCreateInstanceRegistry.mockImplementation(() => {
      throw new Error('Redis unavailable');
    });
    mockExecFileNoThrow.mockResolvedValueOnce({ stdout: '', stderr: '', status: 0 });

    const trailer = await buildCommitTrailer('TASK-108', 'slaver-x');
    expect(trailer).toContain('Confidence: high');
  });

  it('infers high scope-risk for 16+ files', async () => {
    mockGetInstance.mockResolvedValue({ data: { currentLevel: 1, levelChanges: [] } });
    mockExecFileNoThrow.mockResolvedValueOnce({
      stdout: '16 files changed, 50 insertions(+)',
      stderr: '',
      status: 0,
    });

    const trailer = await buildCommitTrailer('TASK-108', 'slaver-1');
    expect(trailer).toContain('Scope-risk: high');
  });
});
