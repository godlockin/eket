/**
 * EKET Framework - ResultAggregator Tests (TASK-121)
 */

import { describe, it, expect } from '@jest/globals';
import { ResultAggregator } from '../../src/core/result-aggregator.js';
import type { SlaveResult } from '../../src/types/index.js';

function makeResult(ticketId: string, filesChanged: string[], testsAdded = 0, testsPassed = 0): SlaveResult {
  return {
    ticketId,
    slaverId: `slaver_${ticketId}`,
    completedAt: Date.now(),
    filesChanged,
    testsAdded,
    testsPassed,
    keyDecisions: [],
    deferredIssues: [],
  };
}

describe('ResultAggregator', () => {
  const aggregator = new ResultAggregator();

  // 1. No conflicts when files are disjoint
  it('returns no conflicts when all files are distinct across tickets', () => {
    const results = [
      makeResult('TASK-1', ['src/a.ts', 'src/b.ts']),
      makeResult('TASK-2', ['src/c.ts', 'src/d.ts']),
    ];
    const conflicts = aggregator.detectConflicts(results);
    expect(conflicts).toHaveLength(0);
  });

  // 2. Detects conflict when same file modified by two tickets
  it('detects conflict for file changed by two tickets', () => {
    const results = [
      makeResult('TASK-1', ['src/shared.ts', 'src/a.ts']),
      makeResult('TASK-2', ['src/shared.ts', 'src/b.ts']),
    ];
    const conflicts = aggregator.detectConflicts(results);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].file).toBe('src/shared.ts');
    expect(conflicts[0].tickets).toContain('TASK-1');
    expect(conflicts[0].tickets).toContain('TASK-2');
  });

  // 3. Detects multi-ticket conflict (3 tickets same file)
  it('detects conflict involving three tickets for same file', () => {
    const results = [
      makeResult('TASK-A', ['src/common.ts']),
      makeResult('TASK-B', ['src/common.ts']),
      makeResult('TASK-C', ['src/common.ts']),
    ];
    const conflicts = aggregator.detectConflicts(results);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].tickets).toHaveLength(3);
  });

  // 4. aggregate sums tests correctly
  it('aggregates totalTestsAdded and totalTestsPassed', () => {
    const results = [
      makeResult('TASK-1', ['a.ts'], 3, 3),
      makeResult('TASK-2', ['b.ts'], 5, 4),
      makeResult('TASK-3', ['c.ts'], 2, 2),
    ];
    const agg = aggregator.aggregate(results);
    expect(agg.totalTestsAdded).toBe(10);
    expect(agg.totalTestsPassed).toBe(9);
  });

  // 5. aggregate deduplicates allFilesChanged
  it('deduplicates files in allFilesChanged', () => {
    const results = [
      makeResult('TASK-1', ['src/shared.ts', 'src/a.ts']),
      makeResult('TASK-2', ['src/shared.ts', 'src/b.ts']),
    ];
    const agg = aggregator.aggregate(results);
    const occurrences = agg.allFilesChanged.filter((f) => f === 'src/shared.ts');
    expect(occurrences).toHaveLength(1);
    expect(agg.allFilesChanged).toHaveLength(3); // shared, a, b
  });

  // 6. aggregate ticket list matches input
  it('includes all ticketIds in aggregated result', () => {
    const results = [
      makeResult('TASK-X', []),
      makeResult('TASK-Y', []),
    ];
    const agg = aggregator.aggregate(results);
    expect(agg.tickets).toEqual(['TASK-X', 'TASK-Y']);
  });

  // 7. empty input returns empty aggregate
  it('handles empty result list gracefully', () => {
    const agg = aggregator.aggregate([]);
    expect(agg.tickets).toHaveLength(0);
    expect(agg.conflicts).toHaveLength(0);
    expect(agg.totalTestsAdded).toBe(0);
    expect(agg.allFilesChanged).toHaveLength(0);
  });
});
