/**
 * MasterContextManager 单元测试
 * Master Cognitive Continuity 功能
 *
 * 测试覆盖：
 * - 保存和加载 context（文件降级模式）
 * - generateHandoverSummary 生成非空摘要
 * - addActiveRisk 完整流程
 * - resolvePendingJudgment 完整流程
 * - 双写策略和降级逻辑
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';

import { MasterContextManager } from '../src/core/master-context.js';
import type {
  MasterContext,
  ProjectPulse,
} from '../src/core/master-context.js';

// ============================================================================
// Test Fixtures
// ============================================================================

const TEST_PROJECT_ROOT = '/tmp/test-eket-master-context';

function makeDefaultPulse(): ProjectPulse {
  return {
    overallHealth: 'healthy',
    blockedTickets: [],
    criticalPath: ['FEAT-001', 'FEAT-002'],
    estimatedCompletionRisk: 'low',
    lastAssessedAt: Date.now(),
  };
}

function makeMinimalContext(
  override: Partial<Omit<MasterContext, 'capturedAt'>> = {}
): Omit<MasterContext, 'capturedAt'> {
  return {
    masterId: 'instance_test_1234_5678',
    leaseExpiresAt: Date.now() + 30000,
    activeRisks: [],
    pendingJudgments: [],
    recentDecisions: [],
    projectPulse: makeDefaultPulse(),
    ...override,
  };
}

// ============================================================================
// Test Suite
// ============================================================================

describe('MasterContextManager', () => {
  let manager: MasterContextManager;
  let stateFilePath: string;

  beforeEach(() => {
    // 使用唯一临时目录，隔离每个测试
    const uniqueRoot = `${TEST_PROJECT_ROOT}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    manager = new MasterContextManager(uniqueRoot);
    stateFilePath = path.join(uniqueRoot, '.eket', 'state', 'master-context.json');

    fs.mkdirSync(path.join(uniqueRoot, '.eket', 'state'), { recursive: true });
  });

  afterEach(() => {
    // 清理测试目录（用正则找到所有临时目录）
    try {
      const parentDir = path.dirname(TEST_PROJECT_ROOT);
      const entries = fs.readdirSync(parentDir);
      for (const entry of entries) {
        if (entry.startsWith(path.basename(TEST_PROJECT_ROOT))) {
          fs.rmSync(path.join(parentDir, entry), { recursive: true, force: true });
        }
      }
    } catch {
      // Ignore cleanup errors
    }
  });

  // --------------------------------------------------------------------------
  // saveContext / loadContext
  // --------------------------------------------------------------------------

  describe('saveContext / loadContext', () => {
    it('should save context to file when Redis is unavailable', async () => {
      const ctx = makeMinimalContext();
      const saveResult = await manager.saveContext(ctx);

      // 只要文件写入成功，saveContext 就成功（即使 Redis 失败）
      expect(saveResult.success).toBe(true);
      expect(fs.existsSync(stateFilePath)).toBe(true);
    });

    it('should load saved context from file', async () => {
      const ctx = makeMinimalContext({ masterId: 'master_file_test' });
      await manager.saveContext(ctx);

      const loadResult = await manager.loadContext();

      expect(loadResult.success).toBe(true);
      if (loadResult.success) {
        expect(loadResult.data).not.toBeNull();
        expect(loadResult.data?.masterId).toBe('master_file_test');
      }
    });

    it('should add capturedAt timestamp on save', async () => {
      const before = Date.now();
      const ctx = makeMinimalContext();
      await manager.saveContext(ctx);

      const loadResult = await manager.loadContext();
      const after = Date.now();

      expect(loadResult.success).toBe(true);
      if (loadResult.success && loadResult.data) {
        expect(loadResult.data.capturedAt).toBeGreaterThanOrEqual(before);
        expect(loadResult.data.capturedAt).toBeLessThanOrEqual(after);
      }
    });

    it('should return null when no context exists', async () => {
      const loadResult = await manager.loadContext();

      expect(loadResult.success).toBe(true);
      if (loadResult.success) {
        expect(loadResult.data).toBeNull();
      }
    });

    it('should overwrite existing context on re-save', async () => {
      await manager.saveContext(makeMinimalContext({ masterId: 'master_v1' }));
      await manager.saveContext(makeMinimalContext({ masterId: 'master_v2' }));

      const loadResult = await manager.loadContext();

      expect(loadResult.success).toBe(true);
      if (loadResult.success) {
        expect(loadResult.data?.masterId).toBe('master_v2');
      }
    });

    it('should preserve all fields through save/load round-trip', async () => {
      const ctx = makeMinimalContext({
        masterId: 'round_trip_master',
        leaseExpiresAt: 9999999999999,
        projectPulse: {
          overallHealth: 'stressed',
          blockedTickets: ['BUG-001', 'BUG-002'],
          criticalPath: ['FEAT-010'],
          estimatedCompletionRisk: 'high',
          lastAssessedAt: 12345,
        },
      });

      await manager.saveContext(ctx);
      const loadResult = await manager.loadContext();

      expect(loadResult.success).toBe(true);
      if (loadResult.success && loadResult.data) {
        expect(loadResult.data.masterId).toBe('round_trip_master');
        expect(loadResult.data.leaseExpiresAt).toBe(9999999999999);
        expect(loadResult.data.projectPulse.overallHealth).toBe('stressed');
        expect(loadResult.data.projectPulse.blockedTickets).toEqual(['BUG-001', 'BUG-002']);
        expect(loadResult.data.projectPulse.estimatedCompletionRisk).toBe('high');
      }
    });
  });

  // --------------------------------------------------------------------------
  // generateHandoverSummary
  // --------------------------------------------------------------------------

  describe('generateHandoverSummary', () => {
    it('should return error when no context exists', async () => {
      const result = await manager.generateHandoverSummary();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('MASTER_CONTEXT_NOT_FOUND');
      }
    });

    it('should generate non-empty summary', async () => {
      await manager.saveContext(makeMinimalContext({ masterId: 'summary_master' }));

      const result = await manager.generateHandoverSummary();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.length).toBeGreaterThan(0);
        expect(result.data).toContain('Master Handover Summary');
      }
    });

    it('should include master ID in summary', async () => {
      await manager.saveContext(makeMinimalContext({ masterId: 'specific_master_id' }));

      const result = await manager.generateHandoverSummary();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toContain('specific_master_id');
      }
    });

    it('should include project health information', async () => {
      await manager.saveContext(
        makeMinimalContext({
          projectPulse: {
            overallHealth: 'blocked',
            blockedTickets: ['BUG-100'],
            criticalPath: [],
            estimatedCompletionRisk: 'high',
            lastAssessedAt: Date.now(),
          },
        })
      );

      const result = await manager.generateHandoverSummary();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toContain('blocked');
        expect(result.data).toContain('BUG-100');
        expect(result.data).toContain('high');
      }
    });

    it('should include active risks in summary', async () => {
      await manager.saveContext(
        makeMinimalContext({
          activeRisks: [
            {
              id: 'risk_001',
              description: 'Database migration risk',
              severity: 'critical',
              relatedTickets: ['FEAT-050'],
              detectedAt: Date.now(),
              mitigationStatus: 'in_progress',
            },
          ],
        })
      );

      const result = await manager.generateHandoverSummary();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toContain('Active Risks');
        expect(result.data).toContain('Database migration risk');
        expect(result.data).toContain('CRITICAL');
      }
    });

    it('should include pending judgments in summary', async () => {
      await manager.saveContext(
        makeMinimalContext({
          pendingJudgments: [
            {
              id: 'judgment_001',
              question: 'Should we use PostgreSQL or MySQL?',
              context: 'Both have tradeoffs for our use case',
              options: ['PostgreSQL', 'MySQL'],
              urgency: 'high',
              raisedAt: Date.now(),
              raisedBy: 'instance_arch_001',
            },
          ],
        })
      );

      const result = await manager.generateHandoverSummary();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toContain('Pending Judgments');
        expect(result.data).toContain('Should we use PostgreSQL or MySQL?');
        expect(result.data).toContain('HIGH');
      }
    });

    it('should include recent decisions in summary', async () => {
      await manager.saveContext(
        makeMinimalContext({
          recentDecisions: [
            {
              id: 'decision_001',
              summary: 'Chose Redis over Memcached',
              rationale: 'Redis supports persistence and pub/sub which we need',
              affectedTickets: ['INFRA-010'],
              madeAt: Date.now(),
              madeBy: 'instance_arch_001',
            },
          ],
        })
      );

      const result = await manager.generateHandoverSummary();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toContain('Recent Non-Obvious Decisions');
        expect(result.data).toContain('Chose Redis over Memcached');
        expect(result.data).toContain('Redis supports persistence');
      }
    });

    it('should show placeholder when no risks/judgments/decisions', async () => {
      await manager.saveContext(makeMinimalContext());

      const result = await manager.generateHandoverSummary();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toContain('No significant risks');
      }
    });
  });

  // --------------------------------------------------------------------------
  // addActiveRisk
  // --------------------------------------------------------------------------

  describe('addActiveRisk', () => {
    it('should return error if no context exists', async () => {
      const result = await manager.addActiveRisk({
        description: 'Test risk',
        severity: 'low',
        relatedTickets: [],
        mitigationStatus: 'none',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('MASTER_CONTEXT_NOT_FOUND');
      }
    });

    it('should add risk and return it with generated id and detectedAt', async () => {
      await manager.saveContext(makeMinimalContext());

      const before = Date.now();
      const result = await manager.addActiveRisk({
        description: 'Performance degradation risk',
        severity: 'medium',
        relatedTickets: ['PERF-001'],
        mitigationStatus: 'none',
      });
      const after = Date.now();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.id).toMatch(/^risk_/);
        expect(result.data.description).toBe('Performance degradation risk');
        expect(result.data.severity).toBe('medium');
        expect(result.data.relatedTickets).toEqual(['PERF-001']);
        expect(result.data.mitigationStatus).toBe('none');
        expect(result.data.detectedAt).toBeGreaterThanOrEqual(before);
        expect(result.data.detectedAt).toBeLessThanOrEqual(after);
      }
    });

    it('should persist risk to storage', async () => {
      await manager.saveContext(makeMinimalContext());

      await manager.addActiveRisk({
        description: 'Security vulnerability in deps',
        severity: 'critical',
        relatedTickets: ['SEC-001'],
        mitigationStatus: 'none',
      });

      const loadResult = await manager.loadContext();

      expect(loadResult.success).toBe(true);
      if (loadResult.success && loadResult.data) {
        expect(loadResult.data.activeRisks).toHaveLength(1);
        expect(loadResult.data.activeRisks[0].description).toBe(
          'Security vulnerability in deps'
        );
        expect(loadResult.data.activeRisks[0].severity).toBe('critical');
      }
    });

    it('should accumulate multiple risks', async () => {
      await manager.saveContext(makeMinimalContext());

      await manager.addActiveRisk({
        description: 'Risk A',
        severity: 'low',
        relatedTickets: [],
        mitigationStatus: 'none',
      });
      await manager.addActiveRisk({
        description: 'Risk B',
        severity: 'high',
        relatedTickets: [],
        mitigationStatus: 'in_progress',
      });

      const loadResult = await manager.loadContext();

      expect(loadResult.success).toBe(true);
      if (loadResult.success && loadResult.data) {
        expect(loadResult.data.activeRisks).toHaveLength(2);
      }
    });
  });

  // --------------------------------------------------------------------------
  // addPendingJudgment
  // --------------------------------------------------------------------------

  describe('addPendingJudgment', () => {
    it('should add a pending judgment with generated id and raisedAt', async () => {
      await manager.saveContext(makeMinimalContext());

      const before = Date.now();
      const result = await manager.addPendingJudgment({
        question: 'Should we migrate to TypeScript 5.5?',
        context: 'Breaking changes in strict mode',
        options: ['Yes, now', 'Wait for 5.6', 'Skip'],
        urgency: 'normal',
        raisedBy: 'instance_arch_002',
      });
      const after = Date.now();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.id).toMatch(/^judgment_/);
        expect(result.data.question).toBe('Should we migrate to TypeScript 5.5?');
        expect(result.data.raisedAt).toBeGreaterThanOrEqual(before);
        expect(result.data.raisedAt).toBeLessThanOrEqual(after);
      }
    });
  });

  // --------------------------------------------------------------------------
  // resolvePendingJudgment
  // --------------------------------------------------------------------------

  describe('resolvePendingJudgment', () => {
    it('should return error for unknown judgment id', async () => {
      await manager.saveContext(makeMinimalContext());

      const result = await manager.resolvePendingJudgment('nonexistent_id', 'some resolution');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('PENDING_JUDGMENT_NOT_FOUND');
      }
    });

    it('should remove judgment from pendingJudgments and add to recentDecisions', async () => {
      await manager.saveContext(makeMinimalContext());

      // 添加一个判断
      const addResult = await manager.addPendingJudgment({
        question: 'Which database to use?',
        context: 'We need to choose between PostgreSQL and MongoDB',
        options: ['PostgreSQL', 'MongoDB'],
        urgency: 'high',
        raisedBy: 'instance_pm_001',
      });

      expect(addResult.success).toBe(true);
      if (!addResult.success) return;

      const judgmentId = addResult.data.id;

      // 解决该判断
      const resolveResult = await manager.resolvePendingJudgment(
        judgmentId,
        'Chose PostgreSQL for better ACID compliance and team familiarity'
      );

      expect(resolveResult.success).toBe(true);

      // 验证判断已从 pendingJudgments 中移除
      const loadResult = await manager.loadContext();
      expect(loadResult.success).toBe(true);
      if (loadResult.success && loadResult.data) {
        expect(loadResult.data.pendingJudgments).toHaveLength(0);
        expect(loadResult.data.recentDecisions).toHaveLength(1);
        expect(loadResult.data.recentDecisions[0].rationale).toContain(
          'Chose PostgreSQL'
        );
      }
    });

    it('should complete the full addActiveRisk → addPendingJudgment → resolvePendingJudgment workflow', async () => {
      // 1. 初始化 context
      await manager.saveContext(makeMinimalContext({ masterId: 'workflow_master' }));

      // 2. 添加风险
      const riskResult = await manager.addActiveRisk({
        description: 'Auth service latency spike',
        severity: 'high',
        relatedTickets: ['SRE-042'],
        mitigationStatus: 'none',
      });
      expect(riskResult.success).toBe(true);

      // 3. 添加判断（如何缓解风险）
      const judgmentResult = await manager.addPendingJudgment({
        question: 'Should we add Redis cache layer for auth tokens?',
        context: 'Auth service P99 latency is 800ms, SLA is 500ms',
        options: ['Add Redis cache', 'Scale horizontally', 'Optimize DB queries'],
        urgency: 'high',
        raisedBy: 'instance_sre_001',
      });
      expect(judgmentResult.success).toBe(true);
      if (!judgmentResult.success) return;

      // 4. 解决判断
      const resolveResult = await manager.resolvePendingJudgment(
        judgmentResult.data.id,
        'Decided to add Redis cache layer - fastest time to fix, team has Redis expertise'
      );
      expect(resolveResult.success).toBe(true);

      // 5. 生成交接摘要
      const summaryResult = await manager.generateHandoverSummary();
      expect(summaryResult.success).toBe(true);
      if (summaryResult.success) {
        const summary = summaryResult.data;
        expect(summary).toContain('workflow_master');
        expect(summary).toContain('Active Risks');
        expect(summary).toContain('Auth service latency spike');
        expect(summary).toContain('Recent Non-Obvious Decisions');
        // resolved judgment 应该以 decision 形式出现
        expect(summary).toContain('Resolved:');
      }
    });
  });

  // --------------------------------------------------------------------------
  // addRecentDecision
  // --------------------------------------------------------------------------

  describe('addRecentDecision', () => {
    it('should add decision with generated id and madeAt', async () => {
      await manager.saveContext(makeMinimalContext());

      const before = Date.now();
      const result = await manager.addRecentDecision({
        summary: 'Switched from npm to pnpm',
        rationale: 'pnpm saves 40% disk space with symlink strategy',
        affectedTickets: ['DEVX-001'],
        madeBy: 'instance_devops_001',
      });
      const after = Date.now();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.id).toMatch(/^decision_/);
        expect(result.data.madeAt).toBeGreaterThanOrEqual(before);
        expect(result.data.madeAt).toBeLessThanOrEqual(after);
        expect(result.data.summary).toBe('Switched from npm to pnpm');
      }
    });
  });

  // --------------------------------------------------------------------------
  // updateProjectPulse
  // --------------------------------------------------------------------------

  describe('updateProjectPulse', () => {
    it('should update project pulse in context', async () => {
      await manager.saveContext(makeMinimalContext());

      const newPulse: ProjectPulse = {
        overallHealth: 'blocked',
        blockedTickets: ['FEAT-100', 'BUG-200'],
        criticalPath: ['FEAT-100'],
        estimatedCompletionRisk: 'high',
        lastAssessedAt: 99999,
      };

      const updateResult = await manager.updateProjectPulse(newPulse);
      expect(updateResult.success).toBe(true);

      const loadResult = await manager.loadContext();
      expect(loadResult.success).toBe(true);
      if (loadResult.success && loadResult.data) {
        expect(loadResult.data.projectPulse.overallHealth).toBe('blocked');
        expect(loadResult.data.projectPulse.blockedTickets).toEqual([
          'FEAT-100',
          'BUG-200',
        ]);
        expect(loadResult.data.projectPulse.lastAssessedAt).toBe(99999);
      }
    });
  });
});
