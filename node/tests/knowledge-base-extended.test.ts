/**
 * EKET Framework - Extended Knowledge Base Tests
 * 波兰尼默会知识分类体系 (Tacit Knowledge Support)
 *
 * 测试覆盖：
 * - saveExtendedEntry 可以保存 intuition 类型条目
 * - getRequiredChecklist 只返回 warning 和 intuition 类型
 * - getEntriesByTacitLevel('tacit') 正确过滤
 *
 * 所有测试使用 SQLite in-memory（':memory:'），彼此完全隔离。
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { KnowledgeBase, createKnowledgeBase } from '../src/core/knowledge-base.js';
import type { ExtendedKnowledgeEntry } from '../src/types/index.js';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const intuitionEntry: Omit<ExtendedKnowledgeEntry, 'id' | 'createdAt' | 'updatedAt'> = {
  type: 'intuition',
  title: '代码审查直觉：不要只看单元测试覆盖率',
  description: '高覆盖率不等于高质量，这种判断力需要亲身体验大量代码库才能形成',
  content:
    '许多新手工程师会被 95% 的测试覆盖率迷惑。真正的问题往往藏在 "happy path" 之外：' +
    '并发场景、网络超时、数据库约束边界。这种敏感度无法通过阅读文档获得，' +
    '只能通过亲历生产故障才能真正内化。',
  tags: ['code-review', 'testing', 'intuition', 'experience'],
  createdBy: 'instance_senior_dev',
  relatedTickets: ['FEAT-042'],
  tacitLevel: 'tacit',
  usageGuidance: {
    whenToConsult: '在进行 PR review 决策前，或评估测试质量时',
    howToVerifyUnderstanding: '能否举出一个高覆盖率但仍然出现生产故障的真实案例？',
    requiredChecklist: [
      '检查测试是否覆盖了异常路径（网络超时、DB 约束）',
      '检查是否有集成测试，而不只是 mock 测试',
      '确认测试数据是否覆盖了边界值',
    ],
    expirationCondition: '当项目技术栈发生根本性变化时（如从单体迁移到微服务）',
  },
};

const warningEntry: Omit<ExtendedKnowledgeEntry, 'id' | 'createdAt' | 'updatedAt'> = {
  type: 'warning',
  title: '警告：直接在 main 分支上 rebase feature 分支会破坏他人工作',
  description: '此操作会重写提交历史，导致其他人的分支出现不可预期的冲突',
  content:
    '如果团队中有多人在同一 feature 分支上工作，对该分支执行 rebase 会重写所有提交的哈希值。' +
    '其他人的本地分支将与远端产生分叉，push 时会被拒绝。' +
    '正确做法：使用 merge 替代 rebase，或确认只有自己在使用该分支。',
  tags: ['git', 'warning', 'team-workflow'],
  createdBy: 'instance_devops',
  relatedTickets: ['OPS-007'],
  tacitLevel: 'semi-tacit',
  usageGuidance: {
    whenToConsult: '任何执行 git rebase 操作之前',
    requiredChecklist: [
      '确认当前分支上是否只有自己在提交',
      '确认该分支是否已推送到远端',
      '若已推送，使用 git merge 而非 git rebase',
    ],
    expirationCondition: '团队统一切换到使用 squash merge 工作流之后',
  },
};

const artifactEntry: Omit<ExtendedKnowledgeEntry, 'id' | 'createdAt' | 'updatedAt'> = {
  type: 'artifact',
  title: 'API Gateway 配置模板',
  description: '经过生产验证的 API Gateway 超时和重试配置',
  content: 'timeout: 30s\nretry:\n  attempts: 3\n  backoff: exponential',
  tags: ['api-gateway', 'config', 'production'],
  createdBy: 'instance_backend_dev',
  relatedTickets: [],
  tacitLevel: 'explicit',
};

const lessonEntry: Omit<ExtendedKnowledgeEntry, 'id' | 'createdAt' | 'updatedAt'> = {
  type: 'lesson',
  title: 'Redis 连接池耗尽导致级联故障的教训',
  description: '2024-Q2 生产故障复盘：连接池配置不当引发服务全面不可用',
  content:
    '故障根因：Redis maxmemory-policy 设置为 noeviction，连接池 maxConnections=10 远不足以处理峰值流量。' +
    '解决方案：调整连接池大小，添加断路器，设置合理的超时。',
  tags: ['redis', 'lesson', 'postmortem', 'performance'],
  createdBy: 'instance_sre',
  relatedTickets: ['INC-2024-042'],
  tacitLevel: 'semi-tacit',
};

// ---------------------------------------------------------------------------
// saveExtendedEntry Tests
// ---------------------------------------------------------------------------

describe('KnowledgeBase - saveExtendedEntry', () => {
  let kb: KnowledgeBase;

  beforeEach(async () => {
    kb = createKnowledgeBase(':memory:');
    const connectResult = await kb.connect();
    expect(connectResult.success).toBe(true);
  });

  afterEach(async () => {
    await kb.disconnect();
  });

  it('should save an intuition entry and return the full entry with generated fields', async () => {
    const result = await kb.saveExtendedEntry(intuitionEntry);

    expect(result.success).toBe(true);
    if (!result.success) return;

    const saved = result.data;
    expect(saved.id).toMatch(/^kb_/);
    expect(saved.type).toBe('intuition');
    expect(saved.title).toBe(intuitionEntry.title);
    expect(saved.tacitLevel).toBe('tacit');
    expect(saved.createdAt).toBeGreaterThan(0);
    expect(saved.updatedAt).toBeGreaterThan(0);
  });

  it('should persist usageGuidance and requiredChecklist correctly', async () => {
    const result = await kb.saveExtendedEntry(intuitionEntry);

    expect(result.success).toBe(true);
    if (!result.success) return;

    const saved = result.data;
    expect(saved.usageGuidance).toBeDefined();
    expect(saved.usageGuidance?.whenToConsult).toBe(intuitionEntry.usageGuidance?.whenToConsult);
    expect(saved.usageGuidance?.requiredChecklist).toHaveLength(3);
    expect(saved.usageGuidance?.requiredChecklist?.[0]).toContain('异常路径');
  });

  it('should save a warning entry with semi-tacit level', async () => {
    const result = await kb.saveExtendedEntry(warningEntry);

    expect(result.success).toBe(true);
    if (!result.success) return;

    const saved = result.data;
    expect(saved.type).toBe('warning');
    expect(saved.tacitLevel).toBe('semi-tacit');
    expect(saved.tags).toContain('git');
  });

  it('should save an artifact entry with explicit tacit level', async () => {
    const result = await kb.saveExtendedEntry(artifactEntry);

    expect(result.success).toBe(true);
    if (!result.success) return;

    const saved = result.data;
    expect(saved.type).toBe('artifact');
    expect(saved.tacitLevel).toBe('explicit');
    expect(saved.usageGuidance).toBeUndefined();
  });

  it('should save entries with empty relatedTickets array', async () => {
    const result = await kb.saveExtendedEntry(artifactEntry);

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.relatedTickets).toEqual([]);
  });

  it('should assign different IDs to distinct entries', async () => {
    const r1 = await kb.saveExtendedEntry(intuitionEntry);
    const r2 = await kb.saveExtendedEntry(warningEntry);

    expect(r1.success).toBe(true);
    expect(r2.success).toBe(true);
    if (!r1.success || !r2.success) return;

    expect(r1.data.id).not.toBe(r2.data.id);
  });
});

// ---------------------------------------------------------------------------
// getRequiredChecklist Tests
// ---------------------------------------------------------------------------

describe('KnowledgeBase - getRequiredChecklist', () => {
  let kb: KnowledgeBase;

  beforeEach(async () => {
    kb = createKnowledgeBase(':memory:');
    const connectResult = await kb.connect();
    expect(connectResult.success).toBe(true);

    // Pre-populate with mixed types
    await kb.saveExtendedEntry(intuitionEntry);
    await kb.saveExtendedEntry(warningEntry);
    await kb.saveExtendedEntry(artifactEntry);  // explicit artifact — should NOT appear
    await kb.saveExtendedEntry(lessonEntry);    // lesson — should NOT appear
  });

  afterEach(async () => {
    await kb.disconnect();
  });

  it('should return only warning and intuition entries', async () => {
    const result = await kb.getRequiredChecklist();

    expect(result.success).toBe(true);
    if (!result.success) return;

    const types = result.data.map((e) => e.type);
    expect(types).not.toContain('artifact');
    expect(types).not.toContain('lesson');
    expect(types).not.toContain('pattern');
    expect(types).not.toContain('config');

    for (const type of types) {
      expect(['warning', 'intuition']).toContain(type);
    }
  });

  it('should return at least the seeded warning and intuition entries', async () => {
    const result = await kb.getRequiredChecklist();

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.length).toBeGreaterThanOrEqual(2);
  });

  it('should filter by tags when provided', async () => {
    const result = await kb.getRequiredChecklist(['git']);

    expect(result.success).toBe(true);
    if (!result.success) return;

    // Only the warning entry has 'git' tag
    expect(result.data.length).toBeGreaterThanOrEqual(1);
    for (const entry of result.data) {
      expect(entry.tags).toContain('git');
    }
  });

  it('should return empty array when tag filter matches nothing', async () => {
    const result = await kb.getRequiredChecklist(['nonexistent-tag-xyz']);

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data).toHaveLength(0);
  });

  it('should include usageGuidance in returned entries', async () => {
    const result = await kb.getRequiredChecklist(['code-review']);

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.length).toBeGreaterThanOrEqual(1);
    const intuition = result.data.find((e) => e.type === 'intuition');
    expect(intuition).toBeDefined();
    expect(intuition?.usageGuidance?.whenToConsult).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// getEntriesByTacitLevel Tests
// ---------------------------------------------------------------------------

describe('KnowledgeBase - getEntriesByTacitLevel', () => {
  let kb: KnowledgeBase;

  beforeEach(async () => {
    kb = createKnowledgeBase(':memory:');
    const connectResult = await kb.connect();
    expect(connectResult.success).toBe(true);

    // Seed all three tacit levels
    await kb.saveExtendedEntry(intuitionEntry);   // tacit
    await kb.saveExtendedEntry(warningEntry);     // semi-tacit
    await kb.saveExtendedEntry(lessonEntry);      // semi-tacit
    await kb.saveExtendedEntry(artifactEntry);    // explicit
  });

  afterEach(async () => {
    await kb.disconnect();
  });

  it('should return only tacit entries when querying level "tacit"', async () => {
    const result = await kb.getEntriesByTacitLevel('tacit');

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.length).toBeGreaterThanOrEqual(1);
    for (const entry of result.data) {
      expect(entry.tacitLevel).toBe('tacit');
    }
  });

  it('should return only semi-tacit entries when querying level "semi-tacit"', async () => {
    const result = await kb.getEntriesByTacitLevel('semi-tacit');

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.length).toBeGreaterThanOrEqual(2);
    for (const entry of result.data) {
      expect(entry.tacitLevel).toBe('semi-tacit');
    }
  });

  it('should return only explicit entries when querying level "explicit"', async () => {
    const result = await kb.getEntriesByTacitLevel('explicit');

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.length).toBeGreaterThanOrEqual(1);
    for (const entry of result.data) {
      expect(entry.tacitLevel).toBe('explicit');
    }
  });

  it('should NOT mix levels in results', async () => {
    const tacitResult = await kb.getEntriesByTacitLevel('tacit');
    const explicitResult = await kb.getEntriesByTacitLevel('explicit');

    expect(tacitResult.success).toBe(true);
    expect(explicitResult.success).toBe(true);
    if (!tacitResult.success || !explicitResult.success) return;

    const tacitIds = new Set(tacitResult.data.map((e) => e.id));
    const explicitIds = new Set(explicitResult.data.map((e) => e.id));

    // No overlap between the two result sets
    for (const id of tacitIds) {
      expect(explicitIds.has(id)).toBe(false);
    }
  });

  it('should return correct entry shape including all required fields', async () => {
    const result = await kb.getEntriesByTacitLevel('tacit');

    expect(result.success).toBe(true);
    if (!result.success) return;

    const entry = result.data[0];
    expect(entry).toBeDefined();
    expect(typeof entry.id).toBe('string');
    expect(typeof entry.title).toBe('string');
    expect(typeof entry.content).toBe('string');
    expect(Array.isArray(entry.tags)).toBe(true);
    expect(Array.isArray(entry.relatedTickets)).toBe(true);
    expect(typeof entry.createdAt).toBe('number');
    expect(typeof entry.updatedAt).toBe('number');
    expect(entry.tacitLevel).toBe('tacit');
  });
});
