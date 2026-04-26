/**
 * Tests for ModelProvider (TASK-202)
 */

import {
  EnvModelProvider,
  BuiltinModelProvider,
  FallbackModelProvider,
  createModelConfig,
} from '../../src/core/model-provider.js';

describe('BuiltinModelProvider', () => {
  const provider = new BuiltinModelProvider();

  test('master → opus', () => {
    const cfg = provider.modelForRole('master');
    expect(cfg.model).toContain('opus');
  });

  test('slaver → sonnet', () => {
    const cfg = provider.modelForRole('slaver');
    expect(cfg.model).toContain('sonnet');
  });

  test('reviewer → haiku', () => {
    const cfg = provider.modelForRole('reviewer');
    expect(cfg.model).toContain('haiku');
  });

  test('sub-role: backend_slaver → slaver config', () => {
    const cfg = provider.modelForRole('backend_slaver');
    expect(cfg.model).toContain('sonnet');
  });

  test('sub-role: code_reviewer → reviewer config', () => {
    const cfg = provider.modelForRole('code_reviewer');
    expect(cfg.model).toContain('haiku');
  });

  test('unknown role → default model (sonnet)', () => {
    const cfg = provider.modelForRole('unknown_agent');
    expect(cfg.model).toBeTruthy();
    expect(cfg.provider).toBe('anthropic');
  });

  test('case-insensitive: MASTER', () => {
    const cfg = provider.modelForRole('MASTER');
    expect(cfg.model).toContain('opus');
  });
});

describe('EnvModelProvider', () => {
  test('reads EKET_MASTER_MODEL', () => {
    const env = { EKET_MASTER_MODEL: 'claude-custom-master' };
    const provider = new EnvModelProvider(env);
    const cfg = provider.modelForRole('master');
    expect(cfg?.model).toBe('claude-custom-master');
  });

  test('reads EKET_SLAVER_MODEL for slaver sub-roles', () => {
    const env = { EKET_SLAVER_MODEL: 'claude-custom-slaver' };
    const provider = new EnvModelProvider(env);
    const cfg = provider.modelForRole('backend_slaver');
    expect(cfg?.model).toBe('claude-custom-slaver');
  });

  test('EKET_DEFAULT_MODEL as fallback', () => {
    const env = { EKET_DEFAULT_MODEL: 'claude-default-custom' };
    const provider = new EnvModelProvider(env);
    const cfg = provider.modelForRole('some_unknown_role');
    expect(cfg?.model).toBe('claude-default-custom');
  });

  test('returns null when no env vars match', () => {
    const provider = new EnvModelProvider({});
    const cfg = provider.modelForRole('master');
    expect(cfg).toBeNull();
  });

  test('specific EKET_{ROLE}_MODEL wins over EKET_DEFAULT_MODEL', () => {
    const env = {
      EKET_REVIEWER_MODEL: 'claude-cheap',
      EKET_DEFAULT_MODEL: 'claude-expensive',
    };
    const provider = new EnvModelProvider(env);
    const cfg = provider.modelForRole('reviewer');
    expect(cfg?.model).toBe('claude-cheap');
  });
});

describe('FallbackModelProvider', () => {
  test('env wins over builtin', () => {
    const env = { EKET_MASTER_MODEL: 'claude-env-override' };
    const provider = new FallbackModelProvider([new EnvModelProvider(env)]);
    const cfg = provider.modelForRole('master');
    expect(cfg.model).toBe('claude-env-override');
  });

  test('falls back to builtin when env empty', () => {
    const provider = new FallbackModelProvider([new EnvModelProvider({})]);
    const cfg = provider.modelForRole('master');
    expect(cfg.model).toContain('opus');
  });

  test('always returns non-null', () => {
    const provider = new FallbackModelProvider([new EnvModelProvider({})]);
    const cfg = provider.modelForRole('completely_unknown_role_xyz');
    expect(cfg).not.toBeNull();
    expect(cfg.model).toBeTruthy();
  });

  test('chain: first non-null wins', () => {
    const env1 = { EKET_DEFAULT_MODEL: 'claude-chain-1' };
    const env2 = { EKET_DEFAULT_MODEL: 'claude-chain-2' };
    const provider = new FallbackModelProvider([
      new EnvModelProvider(env1),
      new EnvModelProvider(env2),
    ]);
    // env1 matches EKET_DEFAULT_MODEL first
    const cfg = provider.modelForRole('unknown_role');
    expect(cfg.model).toBe('claude-chain-1');
  });
});

describe('createModelConfig factory', () => {
  test('env overrides builtin for master', () => {
    const env = { EKET_MASTER_MODEL: 'claude-factory-test' };
    const cfg = createModelConfig('master', env);
    expect(cfg.model).toBe('claude-factory-test');
  });

  test('builtin used when no env vars', () => {
    const cfg = createModelConfig('reviewer', {});
    expect(cfg.model).toContain('haiku');
  });

  test('config has required fields', () => {
    const cfg = createModelConfig('slaver', {});
    expect(cfg).toMatchObject({
      model: expect.any(String),
      provider: 'anthropic',
      maxTokens: expect.any(Number),
      temperature: expect.any(Number),
    });
  });
});
