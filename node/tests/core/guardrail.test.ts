/**
 * Tests for ParallelGuardrail (TASK-203)
 */

import {
  ciPassGuardrail,
  coverageGuardrail,
  DEFAULT_GUARDRAILS,
  GuardrailTripwireError,
  knowledgeNotesGuardrail,
  prFormatGuardrail,
  runGuardrails,
  runGuardrailsStrict,
  runGuardrailsWithShortCircuit,
  type GuardrailFn,
  type GuardrailInput,
  type GuardrailResult,
} from '../../src/core/guardrail.js';

const baseInput: GuardrailInput = {
  ticketId: 'TASK-001',
  ticketContent: 'Test ticket content',
  ciStatus: 'green',
  coveragePercent: 85,
  coverageThreshold: 80,
  knowledgeNotes: ['Learned something'],
  prTitle: 'feat(auth): add login endpoint',
  prDescription: 'Adds a new login endpoint with JWT support',
};

// ============================================================================
// Built-in guardrails
// ============================================================================

describe('ciPassGuardrail', () => {
  it('passes when CI is green', async () => {
    const r = await ciPassGuardrail({ ...baseInput, ciStatus: 'green' });
    expect(r.passed).toBe(true);
    expect(r.guardrailName).toBe('ciPassGuardrail');
  });

  it('fails when CI is red', async () => {
    const r = await ciPassGuardrail({ ...baseInput, ciStatus: 'red' });
    expect(r.passed).toBe(false);
    expect(r.reason).toContain('red');
  });

  it('fails when CI status unknown', async () => {
    const r = await ciPassGuardrail({ ...baseInput, ciStatus: 'unknown' });
    expect(r.passed).toBe(false);
  });
});

describe('coverageGuardrail', () => {
  it('passes when coverage meets threshold', async () => {
    const r = await coverageGuardrail({ ...baseInput, coveragePercent: 80, coverageThreshold: 80 });
    expect(r.passed).toBe(true);
  });

  it('fails when coverage below threshold', async () => {
    const r = await coverageGuardrail({ ...baseInput, coveragePercent: 75, coverageThreshold: 80 });
    expect(r.passed).toBe(false);
    expect(r.reason).toContain('75%');
  });

  it('fails when coverage data missing', async () => {
    const r = await coverageGuardrail({ ...baseInput, coveragePercent: undefined });
    expect(r.passed).toBe(false);
  });

  it('uses default threshold 80 when not specified', async () => {
    const r = await coverageGuardrail({
      ...baseInput,
      coveragePercent: 79,
      coverageThreshold: undefined,
    });
    expect(r.passed).toBe(false);
  });
});

describe('knowledgeNotesGuardrail', () => {
  it('passes when at least one note exists', async () => {
    const r = await knowledgeNotesGuardrail({ ...baseInput, knowledgeNotes: ['Note 1'] });
    expect(r.passed).toBe(true);
  });

  it('fails when notes array is empty', async () => {
    const r = await knowledgeNotesGuardrail({ ...baseInput, knowledgeNotes: [] });
    expect(r.passed).toBe(false);
  });

  it('fails when notes undefined', async () => {
    const r = await knowledgeNotesGuardrail({ ...baseInput, knowledgeNotes: undefined });
    expect(r.passed).toBe(false);
  });
});

describe('prFormatGuardrail', () => {
  it('passes with valid PR title and description', async () => {
    const r = await prFormatGuardrail(baseInput);
    expect(r.passed).toBe(true);
  });

  it('fails when PR title is missing', async () => {
    const r = await prFormatGuardrail({ ...baseInput, prTitle: undefined });
    expect(r.passed).toBe(false);
    expect(r.reason).toContain('标题缺失');
  });

  it('fails when PR title does not match pattern', async () => {
    const r = await prFormatGuardrail({ ...baseInput, prTitle: 'bad title format' });
    expect(r.passed).toBe(false);
    expect(r.reason).toContain('格式不符合规范');
  });

  it('fails when PR description is missing', async () => {
    const r = await prFormatGuardrail({ ...baseInput, prDescription: undefined });
    expect(r.passed).toBe(false);
  });

  it('fails when PR description is too short', async () => {
    const r = await prFormatGuardrail({ ...baseInput, prDescription: 'Too short' });
    expect(r.passed).toBe(false);
    expect(r.reason).toContain('过短');
  });
});

// ============================================================================
// runGuardrails: parallel execution
// ============================================================================

describe('runGuardrails', () => {
  it('runs all guardrails even when one fails', async () => {
    const executionOrder: string[] = [];

    const slow: GuardrailFn = async (input) => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      executionOrder.push('slow');
      return { passed: false, guardrailName: 'slow', reason: 'deliberately failed' };
    };

    const fast: GuardrailFn = async (input) => {
      executionOrder.push('fast');
      return { passed: true, guardrailName: 'fast' };
    };

    const results = await runGuardrails([slow, fast], baseInput);

    // All 2 ran
    expect(results).toHaveLength(2);
    expect(results.some((r) => r.guardrailName === 'slow')).toBe(true);
    expect(results.some((r) => r.guardrailName === 'fast')).toBe(true);

    // Both appear in execution order
    expect(executionOrder).toContain('slow');
    expect(executionOrder).toContain('fast');
  });

  it('returns passed=false for guardrail that throws', async () => {
    const throwing: GuardrailFn = async () => {
      throw new Error('unexpected error');
    };
    const results = await runGuardrails([throwing], baseInput);
    expect(results[0]?.passed).toBe(false);
    expect(results[0]?.reason).toContain('unexpected error');
  });

  it('returns all results with correct names', async () => {
    const results = await runGuardrails(DEFAULT_GUARDRAILS, baseInput);
    expect(results).toHaveLength(DEFAULT_GUARDRAILS.length);
    expect(results.every((r) => r.guardrailName.length > 0)).toBe(true);
  });
});

// ============================================================================
// runGuardrailsStrict: throw on failure
// ============================================================================

describe('runGuardrailsStrict', () => {
  it('resolves when all pass', async () => {
    const passing: GuardrailFn = async () => ({ passed: true, guardrailName: 'passing' });
    const results = await runGuardrailsStrict([passing], baseInput);
    expect(results[0]?.passed).toBe(true);
  });

  it('throws GuardrailTripwireError containing all failures', async () => {
    const fail1: GuardrailFn = async () => ({
      passed: false,
      guardrailName: 'fail1',
      reason: 'reason1',
    });
    const fail2: GuardrailFn = async () => ({
      passed: false,
      guardrailName: 'fail2',
      reason: 'reason2',
    });
    const pass1: GuardrailFn = async () => ({ passed: true, guardrailName: 'pass1' });

    let thrown: unknown;
    try {
      await runGuardrailsStrict([fail1, fail2, pass1], baseInput);
    } catch (e) {
      thrown = e;
    }

    expect(thrown).toBeInstanceOf(GuardrailTripwireError);
    const err = thrown as GuardrailTripwireError;
    expect(err.failures).toHaveLength(2);
    expect(err.failures.map((f) => f.guardrailName)).toContain('fail1');
    expect(err.failures.map((f) => f.guardrailName)).toContain('fail2');
    expect(err.message).toContain('fail1');
    expect(err.message).toContain('fail2');
  });
});

// ============================================================================
// runGuardrailsWithShortCircuit: stops on first failure
// ============================================================================

describe('runGuardrailsWithShortCircuit', () => {
  it('stops after first failure', async () => {
    const ran: string[] = [];

    const g1: GuardrailFn = async () => {
      ran.push('g1');
      return { passed: true, guardrailName: 'g1' };
    };
    const g2: GuardrailFn = async () => {
      ran.push('g2');
      return { passed: false, guardrailName: 'g2', reason: 'fails' };
    };
    const g3: GuardrailFn = async () => {
      ran.push('g3');
      return { passed: true, guardrailName: 'g3' };
    };

    const results = await runGuardrailsWithShortCircuit([g1, g2, g3], baseInput);

    // Only g1 and g2 ran
    expect(ran).toEqual(['g1', 'g2']);
    expect(results).toHaveLength(2);
    expect(results[1]?.passed).toBe(false);
  });

  it('returns all results when all pass', async () => {
    const g: GuardrailFn = async () => ({ passed: true, guardrailName: 'g' });
    const results = await runGuardrailsWithShortCircuit([g, g, g], baseInput);
    expect(results).toHaveLength(3);
  });

  it('handles throwing guardrail as failure and stops', async () => {
    const ran: string[] = [];
    const throwing: GuardrailFn = async () => {
      ran.push('throwing');
      throw new Error('boom');
    };
    const after: GuardrailFn = async () => {
      ran.push('after');
      return { passed: true, guardrailName: 'after' };
    };

    const results = await runGuardrailsWithShortCircuit([throwing, after], baseInput);
    expect(ran).toEqual(['throwing']);
    expect(results[0]?.passed).toBe(false);
    expect(results[0]?.reason).toContain('boom');
  });
});
