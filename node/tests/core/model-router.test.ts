/**
 * Tests for model-router and claude-runner (TASK-081)
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { resolveModel, getModelDisplayName } from '../../src/core/model-router.js';
import {
  readModelFromProfile,
  writeModelToProfile,
  resolveAndPersistModel,
} from '../../src/core/claude-runner.js';

// ============================================================================
// resolveModel tests
// ============================================================================

describe('resolveModel', () => {
  it('returns sonnet by default when no tags', () => {
    expect(resolveModel({})).toBe('sonnet');
  });

  it('returns opus for implement tag', () => {
    expect(resolveModel({ tags: ['implement'] })).toBe('opus');
  });

  it('returns opus for build tag', () => {
    expect(resolveModel({ tags: ['build'] })).toBe('opus');
  });

  it('returns haiku for classify tag', () => {
    expect(resolveModel({ tags: ['classify'] })).toBe('haiku');
  });

  it('returns haiku for lint tag', () => {
    expect(resolveModel({ tags: ['lint'] })).toBe('haiku');
  });

  it('respects explicit model field', () => {
    expect(resolveModel({ model: 'opus' })).toBe('opus');
    expect(resolveModel({ model: 'haiku' })).toBe('haiku');
  });

  it('ignores invalid explicit model and falls back to tag resolution', () => {
    expect(resolveModel({ model: 'gpt-4', tags: ['implement'] })).toBe('opus');
  });

  it('first matching rule wins (haiku rules listed before opus)', () => {
    // classify rule appears before implement in DEFAULT_RULES → haiku wins
    expect(resolveModel({ tags: ['implement', 'classify'] })).toBe('haiku');
  });
});

describe('getModelDisplayName', () => {
  it('maps haiku correctly', () => {
    expect(getModelDisplayName('haiku')).toBe('claude-haiku-4-5');
  });

  it('maps sonnet correctly', () => {
    expect(getModelDisplayName('sonnet')).toBe('claude-sonnet-4-5');
  });

  it('maps opus correctly', () => {
    expect(getModelDisplayName('opus')).toBe('claude-opus-4-5');
  });
});

// ============================================================================
// claude-runner profile I/O tests
// ============================================================================

describe('readModelFromProfile / writeModelToProfile', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eket-model-test-'));
    fs.mkdirSync(path.join(tmpDir, '.eket', 'state'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns sonnet when profile does not exist', () => {
    expect(readModelFromProfile(tmpDir)).toBe('sonnet');
  });

  it('reads model from profile', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.eket', 'state', 'agent_profile.yml'),
      'role: slaver\nmodel: opus\n'
    );
    expect(readModelFromProfile(tmpDir)).toBe('opus');
  });

  it('falls back to sonnet for unknown model value', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.eket', 'state', 'agent_profile.yml'),
      'model: gpt-4\n'
    );
    expect(readModelFromProfile(tmpDir)).toBe('sonnet');
  });

  it('writeModelToProfile adds model field', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.eket', 'state', 'agent_profile.yml'),
      'role: slaver\nagent_type: frontend\n'
    );
    writeModelToProfile(tmpDir, 'opus');
    const content = fs.readFileSync(
      path.join(tmpDir, '.eket', 'state', 'agent_profile.yml'),
      'utf-8'
    );
    expect(content).toContain('model: opus');
  });

  it('writeModelToProfile updates existing model field', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.eket', 'state', 'agent_profile.yml'),
      'role: slaver\nmodel: haiku\n'
    );
    writeModelToProfile(tmpDir, 'sonnet');
    const content = fs.readFileSync(
      path.join(tmpDir, '.eket', 'state', 'agent_profile.yml'),
      'utf-8'
    );
    expect(content).toContain('model: sonnet');
    expect(content).not.toContain('model: haiku');
  });
});

// ============================================================================
// Integration: tags=['implement'] → resolveModel → 'opus'
// ============================================================================

describe('resolveAndPersistModel integration', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eket-model-int-'));
    fs.mkdirSync(path.join(tmpDir, '.eket', 'state'), { recursive: true });
    // Pre-create profile as claim would
    fs.writeFileSync(
      path.join(tmpDir, '.eket', 'state', 'agent_profile.yml'),
      'role: slaver\nagent_type: backend\n'
    );
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('tags=[implement] → resolveModel → opus → written to profile', () => {
    const tier = resolveAndPersistModel(tmpDir, { tags: ['implement'] });
    expect(tier).toBe('opus');

    const written = readModelFromProfile(tmpDir);
    expect(written).toBe('opus');
  });

  it('tags=[lint] → haiku → written to profile', () => {
    const tier = resolveAndPersistModel(tmpDir, { tags: ['lint'] });
    expect(tier).toBe('haiku');
    expect(readModelFromProfile(tmpDir)).toBe('haiku');
  });

  it('no tags → sonnet default', () => {
    const tier = resolveAndPersistModel(tmpDir, {});
    expect(tier).toBe('sonnet');
    expect(readModelFromProfile(tmpDir)).toBe('sonnet');
  });
});
