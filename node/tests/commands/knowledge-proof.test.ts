/**
 * Unit tests: knowledge:index proof validation
 * TASK-209 — Execution Proof Anchor
 */

import {
  hasProofMetadata,
  validateKnowledgeProof,
} from '../../src/commands/knowledge-index.js';
import type { KnowledgeIndexEntry } from '../../src/types/index.js';

// ============================================================================
// validateKnowledgeProof
// ============================================================================

describe('validateKnowledgeProof', () => {
  const validEntry: KnowledgeIndexEntry = {
    content: 'Some knowledge text',
    proof: {
      task_id: 'TASK-209',
      exit_code: 0,
      timestamp: '2026-04-26T10:00:00.000Z',
    },
  };

  it('accepts valid proof', () => {
    const result = validateKnowledgeProof(validEntry);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('accepts valid proof with optional fields', () => {
    const entry: KnowledgeEntry = {
      ...validEntry,
      proof: {
        ...validEntry.proof,
        tool_name: 'npm test',
        ci_url: 'https://ci.example.com/builds/123',
      },
    };
    const result = validateKnowledgeProof(entry);
    expect(result.valid).toBe(true);
  });

  it('rejects entry with missing proof block', () => {
    const result = validateKnowledgeProof({ content: 'text' });
    expect(result.valid).toBe(false);
    expect(result.errors[0].field).toBe('proof');
  });

  it('rejects entry with empty task_id', () => {
    const entry = {
      ...validEntry,
      proof: { ...validEntry.proof, task_id: '' },
    };
    const result = validateKnowledgeProof(entry);
    expect(result.valid).toBe(false);
    const taskIdError = result.errors.find((e) => e.field === 'proof.task_id');
    expect(taskIdError).toBeDefined();
  });

  it('rejects entry with whitespace-only task_id', () => {
    const entry = {
      ...validEntry,
      proof: { ...validEntry.proof, task_id: '   ' },
    };
    const result = validateKnowledgeProof(entry);
    expect(result.valid).toBe(false);
    expect(result.errors.find((e) => e.field === 'proof.task_id')).toBeDefined();
  });

  it('rejects entry with exit_code !== 0 (exit_code = 1)', () => {
    const entry = {
      ...validEntry,
      proof: { ...validEntry.proof, exit_code: 1 as unknown as 0 },
    };
    const result = validateKnowledgeProof(entry);
    expect(result.valid).toBe(false);
    const ecError = result.errors.find((e) => e.field === 'proof.exit_code');
    expect(ecError).toBeDefined();
    expect(ecError?.received).toBe(1);
  });

  it('rejects entry with exit_code !== 0 (exit_code = -1)', () => {
    const entry = {
      ...validEntry,
      proof: { ...validEntry.proof, exit_code: -1 as unknown as 0 },
    };
    const result = validateKnowledgeProof(entry);
    expect(result.valid).toBe(false);
    expect(result.errors.find((e) => e.field === 'proof.exit_code')).toBeDefined();
  });

  it('rejects entry with missing timestamp', () => {
    const entry = {
      ...validEntry,
      proof: { ...validEntry.proof, timestamp: undefined as unknown as string },
    };
    const result = validateKnowledgeProof(entry);
    expect(result.valid).toBe(false);
    expect(result.errors.find((e) => e.field === 'proof.timestamp')).toBeDefined();
  });

  it('rejects entry with invalid ISO timestamp', () => {
    const entry = {
      ...validEntry,
      proof: { ...validEntry.proof, timestamp: 'not-a-date' },
    };
    const result = validateKnowledgeProof(entry);
    expect(result.valid).toBe(false);
    expect(result.errors.find((e) => e.field === 'proof.timestamp')).toBeDefined();
  });

  it('accumulates multiple errors', () => {
    const entry = {
      content: 'text',
      proof: { task_id: '', exit_code: 2 as unknown as 0, timestamp: 'bad' },
    };
    const result = validateKnowledgeProof(entry);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(2);
  });
});

// ============================================================================
// hasProofMetadata
// ============================================================================

describe('hasProofMetadata', () => {
  it('detects proof in YAML front matter', () => {
    const md = `---
title: My Knowledge
proof:
  task_id: TASK-209
  exit_code: 0
  timestamp: 2026-04-26T10:00:00Z
---

# Content here
`;
    expect(hasProofMetadata(md)).toBe(true);
  });

  it('detects proof inline comment', () => {
    const md = `<!-- proof: { "task_id": "TASK-209", "exit_code": 0 } -->

# Knowledge
`;
    expect(hasProofMetadata(md)).toBe(true);
  });

  it('returns false when no proof in YAML front matter', () => {
    const md = `---
title: Legacy Note
author: slaver-01
---

# Old knowledge without proof
`;
    expect(hasProofMetadata(md)).toBe(false);
  });

  it('returns false for plain markdown without front matter', () => {
    const md = `# Some Knowledge

This is a plain markdown file with no proof metadata.
`;
    expect(hasProofMetadata(md)).toBe(false);
  });

  it('returns false for empty content', () => {
    expect(hasProofMetadata('')).toBe(false);
  });
});
