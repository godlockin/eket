import { resolveModel, getModelDisplayName } from '../../src/core/model-router.js';

describe('model-router', () => {
  it('tag=classify → haiku', () => {
    expect(resolveModel({ tags: ['classify'] })).toBe('haiku');
  });

  it('tag=implement → opus', () => {
    expect(resolveModel({ tags: ['implement'] })).toBe('opus');
  });

  it('tag=docs (no match) → sonnet (default)', () => {
    expect(resolveModel({ tags: ['docs'] })).toBe('sonnet');
  });

  it('explicit model field overrides tag rules', () => {
    expect(resolveModel({ tags: ['implement'], model: 'haiku' })).toBe('haiku');
  });

  it('多 tag 中有一个命中 → 返回对应模型', () => {
    expect(resolveModel({ tags: ['docs', 'triage', 'unrelated'] })).toBe('haiku');
  });

  it('getModelDisplayName maps tiers correctly', () => {
    expect(getModelDisplayName('haiku')).toBe('claude-haiku-4-5');
    expect(getModelDisplayName('sonnet')).toBe('claude-sonnet-4-5');
    expect(getModelDisplayName('opus')).toBe('claude-opus-4-5');
  });
});
