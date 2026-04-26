/**
 * TASK-198: TicketOutputSchema unit tests
 */

import { validateTicketOutput, TicketOutputSchema } from '../src/types/ticket-output.js';

describe('TicketOutputSchema', () => {
  // ── Valid payloads ───────────────────────────────────────────────────────

  it('accepts minimal valid payload', () => {
    const result = validateTicketOutput({
      status: 'completed',
      knowledgeNotes: ['Learned that Zod safeParse returns typed errors'],
      blockers: [],
    });
    expect(result.success).toBe(true);
  });

  it('accepts full valid payload with all optional fields', () => {
    const result = validateTicketOutput({
      status: 'completed',
      prUrl: 'https://github.com/owner/repo/pull/42',
      testResults: { passed: 10, failed: 0, skipped: 2, coverage: 87.5 },
      knowledgeNotes: ['First note', 'Second note'],
      blockers: [],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.testResults?.passed).toBe(10);
      expect(result.data.testResults?.skipped).toBe(2);
    }
  });

  it('accepts blocked status', () => {
    const result = validateTicketOutput({
      status: 'blocked',
      knowledgeNotes: ['Blocked by upstream dependency'],
      blockers: ['Waiting for TASK-199'],
    });
    expect(result.success).toBe(true);
  });

  it('accepts needs_review status', () => {
    const result = validateTicketOutput({
      status: 'needs_review',
      knowledgeNotes: ['PR ready for review'],
      blockers: [],
    });
    expect(result.success).toBe(true);
  });

  // ── knowledgeNotes validation ───────────────────────────────────────────

  it('rejects missing knowledgeNotes', () => {
    const result = validateTicketOutput({
      status: 'completed',
      blockers: [],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.errors.map((e) => e.path);
      expect(paths).toContain('knowledgeNotes');
    }
  });

  it('rejects empty knowledgeNotes array', () => {
    const result = validateTicketOutput({
      status: 'completed',
      knowledgeNotes: [],
      blockers: [],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const msgs = result.errors.map((e) => e.message);
      expect(msgs.some((m) => m.includes('1 knowledgeNote'))).toBe(true);
    }
  });

  it('rejects knowledgeNotes with empty string item', () => {
    const result = validateTicketOutput({
      status: 'completed',
      knowledgeNotes: [''],
      blockers: [],
    });
    expect(result.success).toBe(false);
  });

  // ── prUrl validation ────────────────────────────────────────────────────

  it('rejects invalid prUrl (not a GitHub PR URL)', () => {
    const result = validateTicketOutput({
      status: 'completed',
      prUrl: 'https://example.com/not-a-pr',
      knowledgeNotes: ['Note'],
      blockers: [],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.errors.map((e) => e.path);
      expect(paths).toContain('prUrl');
    }
  });

  it('rejects prUrl that is not a URL at all', () => {
    const result = validateTicketOutput({
      status: 'completed',
      prUrl: 'not-a-url',
      knowledgeNotes: ['Note'],
      blockers: [],
    });
    expect(result.success).toBe(false);
  });

  it('accepts absent prUrl (optional)', () => {
    const result = validateTicketOutput({
      status: 'completed',
      knowledgeNotes: ['Note'],
      blockers: [],
    });
    expect(result.success).toBe(true);
  });

  // ── testResults validation ──────────────────────────────────────────────

  it('rejects testResults with negative passed count', () => {
    const result = validateTicketOutput({
      status: 'completed',
      testResults: { passed: -1, failed: 0 },
      knowledgeNotes: ['Note'],
      blockers: [],
    });
    expect(result.success).toBe(false);
  });

  it('rejects coverage > 100', () => {
    const result = validateTicketOutput({
      status: 'completed',
      testResults: { passed: 5, failed: 0, coverage: 101 },
      knowledgeNotes: ['Note'],
      blockers: [],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.errors.map((e) => e.path);
      expect(paths.some((p) => p.includes('coverage'))).toBe(true);
    }
  });

  // ── status validation ───────────────────────────────────────────────────

  it('rejects invalid status value', () => {
    const result = validateTicketOutput({
      status: 'done',  // invalid — not in enum
      knowledgeNotes: ['Note'],
      blockers: [],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.errors.map((e) => e.path);
      expect(paths).toContain('status');
    }
  });

  // ── structured error format ─────────────────────────────────────────────

  it('returns structured errors with path and message', () => {
    const result = validateTicketOutput({});
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.length).toBeGreaterThan(0);
      for (const err of result.errors) {
        expect(typeof err.path).toBe('string');
        expect(typeof err.message).toBe('string');
      }
    }
  });

  // ── Zod schema type inference ───────────────────────────────────────────

  it('TicketOutputSchema parses correctly and infers types', () => {
    const data = TicketOutputSchema.parse({
      status: 'completed',
      prUrl: 'https://github.com/a/b/pull/1',
      testResults: { passed: 3, failed: 0 },
      knowledgeNotes: ['abc'],
      blockers: [],
    });
    // TypeScript compile-time assertion via assignment
    const status: 'completed' | 'blocked' | 'needs_review' = data.status;
    expect(status).toBe('completed');
    expect(data.prUrl).toBe('https://github.com/a/b/pull/1');
  });
});
