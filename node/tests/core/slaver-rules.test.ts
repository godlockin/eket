/**
 * Tests for TASK-039: slaver-rules + buildProgressReport selfCheck injection
 */

import { SLAVER_HARD_RULES, SlaverHardRule } from '../../src/core/slaver-rules.js';
import { buildProgressReport } from '../../src/core/message-queue.js';

// ---------------------------------------------------------------------------
// Suite 1: Rule integrity
// ---------------------------------------------------------------------------

describe('SLAVER_HARD_RULES — rule integrity', () => {
  it('contains exactly 5 rules', () => {
    expect(SLAVER_HARD_RULES).toHaveLength(5);
  });

  it('rule IDs are SR-01 through SR-05 in order', () => {
    const ids = SLAVER_HARD_RULES.map((r: SlaverHardRule) => r.id);
    expect(ids).toEqual(['SR-01', 'SR-02', 'SR-03', 'SR-04', 'SR-05']);
  });

  it('each rule has non-empty desc', () => {
    for (const rule of SLAVER_HARD_RULES) {
      expect(rule.desc.trim().length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Suite 2: buildProgressReport — selfCheck injection
// ---------------------------------------------------------------------------

describe('buildProgressReport — selfCheck injection', () => {
  const baseParams = {
    ticketId: 'TASK-039',
    slaverId: 'slaver-test-01',
    phase: 'implement' as const,
    progress: 50,
    statusMessage: 'midway',
  };

  it('returns a ProgressReport with selfCheck containing 5 checklist items', () => {
    const report = buildProgressReport(baseParams);
    expect(report.selfCheck.checklist).toHaveLength(5);
  });

  it('all rules default to passed: true when no overrides provided', () => {
    const report = buildProgressReport(baseParams);
    for (const item of report.selfCheck.checklist) {
      expect(item.passed).toBe(true);
    }
  });

  it('selfCheck.rules matches SLAVER_HARD_RULES', () => {
    const report = buildProgressReport(baseParams);
    expect(report.selfCheck.rules).toEqual(SLAVER_HARD_RULES);
  });

  it('analysisParalysisFlag is false when SR-03 passes', () => {
    const report = buildProgressReport(baseParams);
    expect(report.selfCheck.analysisParalysisFlag).toBe(false);
  });

  it('analysisParalysisFlag is true when SR-03 fails', () => {
    const report = buildProgressReport({
      ...baseParams,
      overrides: [{ ruleId: 'SR-03', passed: false, note: '读了 6 个文件未产出代码' }],
    });
    expect(report.selfCheck.analysisParalysisFlag).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Suite 3: Schema validation — passed: false requires non-empty note
// ---------------------------------------------------------------------------

describe('buildProgressReport — schema validation', () => {
  const baseParams = {
    ticketId: 'TASK-039',
    slaverId: 'slaver-test-01',
    phase: 'test' as const,
    progress: 80,
    statusMessage: 'testing',
  };

  it('throws when passed: false and note is undefined', () => {
    expect(() =>
      buildProgressReport({
        ...baseParams,
        overrides: [{ ruleId: 'SR-01', passed: false }],
      })
    ).toThrow(/note.*empty|empty.*note|SR-01/i);
  });

  it('throws when passed: false and note is empty string', () => {
    expect(() =>
      buildProgressReport({
        ...baseParams,
        overrides: [{ ruleId: 'SR-02', passed: false, note: '' }],
      })
    ).toThrow(/note.*empty|empty.*note|SR-02/i);
  });

  it('does NOT throw when passed: false and note is non-empty', () => {
    expect(() =>
      buildProgressReport({
        ...baseParams,
        overrides: [{ ruleId: 'SR-01', passed: false, note: '审查了自己的 PR，需要复盘' }],
      })
    ).not.toThrow();
  });

  it('violating item has correct ruleId and note in checklist', () => {
    const report = buildProgressReport({
      ...baseParams,
      overrides: [{ ruleId: 'SR-04', passed: false, note: '擅自决定了架构变更' }],
    });
    const item = report.selfCheck.checklist.find((c) => c.ruleId === 'SR-04');
    expect(item).toBeDefined();
    expect(item!.passed).toBe(false);
    expect(item!.note).toBe('擅自决定了架构变更');
  });
});
