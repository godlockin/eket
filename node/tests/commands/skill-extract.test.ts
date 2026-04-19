/**
 * EKET Framework - skill:extract tests (TASK-043)
 */

import { describe, it, expect, afterEach } from '@jest/globals';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, rmSync } from 'fs';
import {
  inferCategory,
  summaryToId,
  generateSkillFile,
} from '../../src/core/skill-generator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname_here = dirname(__filename);
// tests/commands/ → ../../../.. = repo root
const REPO_ROOT = join(__dirname_here, '..', '..', '..', '..');

describe('inferCategory', () => {
  it('detects requirements for zod/schema', () => {
    expect(inferCategory('Zod schema driven message validation')).toBe('requirements');
  });

  it('detects testing for test/hook', () => {
    expect(inferCategory('hook pipeline test assertion')).toBe('testing');
  });

  it('falls back to development for unknown', () => {
    expect(inferCategory('random unrelated summary')).toBe('development');
  });
});

describe('summaryToId', () => {
  it('generates kebab-case id from summary', () => {
    const id = summaryToId('Zod schema driven message validation');
    expect(id).toBe('zod-schema-driven-message-validation');
  });
});

describe('generateSkillFile', () => {
  const generatedFiles: string[] = [];

  afterEach(() => {
    generatedFiles.forEach((f) => { if (existsSync(f)) rmSync(f); });
    generatedFiles.length = 0;
  });

  it('generates .ts file with AUTO-GENERATED header', async () => {
    const { filePath, skill } = await generateSkillFile(REPO_ROOT, {
      ticket: 'TASK-043',
      summary: 'test auto skill generator output',
    });
    generatedFiles.push(filePath);
    expect(existsSync(filePath)).toBe(true);
    const { readFileSync } = await import('fs');
    const content = readFileSync(filePath, 'utf-8');
    expect(content).toContain('AUTO-GENERATED');
    expect(content).toContain('TASK-043');
    expect(skill.relatedTicket).toBe('TASK-043');
  });
});
