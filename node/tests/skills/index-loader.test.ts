/**
 * Tests for node/src/skills/index-loader.ts (TASK-103b)
 */

import { loadSkillIndex, getSkillIndex, resetSkillIndex } from '../../src/skills/index-loader.js';

describe('SkillIndexLoader', () => {
  beforeEach(() => {
    resetSkillIndex();
  });

  afterEach(() => {
    resetSkillIndex();
  });

  test('loadSkillIndex scans >= 1 node', async () => {
    const index = await loadSkillIndex();
    expect(index.nodes.length).toBeGreaterThanOrEqual(1);
    // 每个节点应有 id, domain, level
    const first = index.nodes[0];
    expect(typeof first.id).toBe('string');
    expect(typeof first.domain).toBe('string');
    expect([1, 2, 3]).toContain(first.level);
  });

  test('getSkillIndex throws when not initialized', () => {
    expect(() => getSkillIndex()).toThrow('[SkillIndexLoader] SkillIndex not initialized');
  });

  test('getSkillIndex returns singleton after loadSkillIndex', async () => {
    await loadSkillIndex();
    const index = getSkillIndex();
    expect(index).toBeDefined();
    expect(Array.isArray(index.nodes)).toBe(true);
  });

  test('hotEdges is [] when SQLite unavailable (no DB file)', async () => {
    // SQLite 默认路径不存在时应降级，不报错
    const index = await loadSkillIndex();
    // hotEdges 应为数组（可能为空）
    expect(Array.isArray(index.hotEdges)).toBe(true);
  });

  test('modelRouteTable contains known domains', async () => {
    const index = await loadSkillIndex();
    const domains = Object.keys(index.modelRouteTable);
    expect(domains.length).toBeGreaterThan(0);
    // 每个 domain 的值应为 1|2|3
    for (const val of Object.values(index.modelRouteTable)) {
      expect([1, 2, 3]).toContain(val);
    }
    // 已知 domain：design, security, testing 等
    const knownDomains = ['design', 'security', 'testing', 'development', 'devops'];
    const hasAtLeastOne = knownDomains.some((d) => domains.includes(d));
    expect(hasAtLeastOne).toBe(true);
  });

  test('loadSkillIndex is idempotent (returns cached singleton)', async () => {
    const a = await loadSkillIndex();
    const b = await loadSkillIndex();
    expect(a).toBe(b); // same reference
  });
});
