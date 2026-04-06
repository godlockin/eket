/**
 * EKET Framework - Workflow Judgment Point Tests
 * Phase 6.1 Enhancement: Judgment Point Mechanism
 *
 * 测试覆盖：
 * - 工作流到达判断点时暂停（status = 'paused'）
 * - resolveJudgment 后工作流恢复执行
 * - 超时触发 escalate_to_master 行为
 * - 超时触发 skip 行为（自动继续）
 * - 超时触发 fail_workflow 行为
 * - getPendingJudgments 正确返回待判断列表
 * - 向后兼容：无 judgment_required 的步骤行为不变
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import {
  WorkflowEngine,
  createWorkflowEngine,
  type WorkflowEngineConfig,
  type WorkflowContext,
  type JudgmentAwareStep,
  type ExtendedWorkflowEvent,
} from '../src/core/workflow-engine.js';
import type { WorkflowDefinition, WorkflowJudgmentRequest } from '../src/types/index.js';

// ============================================================================
// Helpers
// ============================================================================

/** 创建一个带有判断点步骤的工作流定义 */
function createJudgmentWorkflow(
  overrides: Partial<JudgmentAwareStep> = {}
): WorkflowDefinition {
  return {
    id: 'test_judgment_workflow',
    name: 'Test Judgment Workflow',
    description: '用于测试判断点机制',
    steps: [
      {
        id: 'step_before',
        name: 'Step Before',
        action: 'prepare',
        on_complete: 'judgment_step',
      },
      {
        id: 'judgment_step',
        name: 'Judgment Step',
        action: 'wait',
        judgment_required: true,
        judgment_prompt: '请确认是否可以继续执行？',
        judgment_timeout_ms: 5000,
        fallback_on_timeout: 'escalate_to_master',
        on_complete: 'step_after',
        ...overrides,
      } as JudgmentAwareStep,
      {
        id: 'step_after',
        name: 'Step After',
        action: 'finalize',
      },
    ],
    triggers: [],
  };
}

/** 创建已连接的 WorkflowEngine（mock protocol）*/
async function createConnectedEngine(instanceId = 'test_instance'): Promise<WorkflowEngine> {
  const config: WorkflowEngineConfig = {
    instanceId,
    defaultStepTimeout_ms: 10000,
  };
  const engine = createWorkflowEngine(config);

  // Mock protocol.isReady() to return true so startWorkflow proceeds
  // We access the private protocol via a cast for testing purposes
  const engineAny = engine as unknown as {
    protocol: { isReady: () => boolean; connect: () => Promise<{ success: boolean }> };
  };
  engineAny.protocol.isReady = () => true;
  engineAny.protocol.connect = async () => ({ success: true });

  return engine;
}

// ============================================================================
// Tests
// ============================================================================

describe('WorkflowEngine - Judgment Points', () => {
  let engine: WorkflowEngine;

  beforeEach(async () => {
    jest.useFakeTimers();
    engine = await createConnectedEngine();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // --------------------------------------------------------------------------
  // 1. 到达判断点时工作流暂停
  // --------------------------------------------------------------------------

  describe('judgment point pauses workflow', () => {
    it('should set workflow status to paused when judgment_required step is reached', async () => {
      const definition = createJudgmentWorkflow();
      engine.registerDefinition(definition);

      // 注册 step_before 执行器，直接完成并跳到判断步骤
      engine.registerStepExecutor('step_before', async (_ctx: WorkflowContext) => ({
        success: true,
        nextStepId: 'judgment_step',
      }));

      const startResult = await engine.startWorkflow('test_judgment_workflow', { taskId: 'T-1' });
      expect(startResult.success).toBe(true);
      const instanceId = startResult.data!;

      // 工作流应已暂停
      const statusResult = engine.getWorkflowStatus(instanceId);
      expect(statusResult.success).toBe(true);
      expect(statusResult.data!.status).toBe('paused');
      expect(statusResult.data!.currentStepId).toBe('judgment_step');
    });

    it('should create a pending judgment request when paused', async () => {
      const definition = createJudgmentWorkflow();
      engine.registerDefinition(definition);
      engine.registerStepExecutor('step_before', async () => ({
        success: true,
        nextStepId: 'judgment_step',
      }));

      const startResult = await engine.startWorkflow('test_judgment_workflow');
      const instanceId = startResult.data!;

      // 应有一个待处理的判断请求
      const pending = engine.getPendingJudgments(instanceId);
      expect(pending).toHaveLength(1);
      expect(pending[0].stepId).toBe('judgment_step');
      expect(pending[0].status).toBe('pending');
      expect(pending[0].judgmentPrompt).toBe('请确认是否可以继续执行？');
      expect(pending[0].workflowInstanceId).toBe(instanceId);
    });

    it('should emit judgment_required event when reaching judgment point', async () => {
      const definition = createJudgmentWorkflow();
      engine.registerDefinition(definition);
      engine.registerStepExecutor('step_before', async () => ({
        success: true,
        nextStepId: 'judgment_step',
      }));

      const emittedEvents: ExtendedWorkflowEvent[] = [];
      engine.onEvent('judgment_required', async (event) => {
        emittedEvents.push(event);
      });

      const startResult = await engine.startWorkflow('test_judgment_workflow');
      expect(startResult.success).toBe(true);

      expect(emittedEvents).toHaveLength(1);
      expect(emittedEvents[0].type).toBe('judgment_required');
      expect(emittedEvents[0].stepId).toBe('judgment_step');
      expect(emittedEvents[0].data?.judgmentRequest).toBeDefined();

      const req = emittedEvents[0].data!.judgmentRequest as WorkflowJudgmentRequest;
      expect(req.judgmentPrompt).toBe('请确认是否可以继续执行？');
      expect(req.fallbackOnTimeout).toBe('escalate_to_master');
    });
  });

  // --------------------------------------------------------------------------
  // 2. resolveJudgment 恢复工作流
  // --------------------------------------------------------------------------

  describe('resolveJudgment resumes workflow', () => {
    it('should resume workflow and execute next step after resolution', async () => {
      const definition = createJudgmentWorkflow();
      engine.registerDefinition(definition);
      engine.registerStepExecutor('step_before', async () => ({
        success: true,
        nextStepId: 'judgment_step',
      }));

      const completedSteps: string[] = [];
      engine.registerStepExecutor('step_after', async (_ctx: WorkflowContext) => {
        completedSteps.push('step_after');
        return { success: true };
      });

      const startResult = await engine.startWorkflow('test_judgment_workflow');
      const instanceId = startResult.data!;

      // 获取 judgmentId
      const pending = engine.getPendingJudgments(instanceId);
      expect(pending).toHaveLength(1);
      const judgmentId = pending[0].id;

      // 提交判断结果
      const resolveResult = await engine.resolveJudgment(judgmentId, 'yes, proceed', 'master_001');
      expect(resolveResult.success).toBe(true);

      // step_after 应该已被执行
      expect(completedSteps).toContain('step_after');
    });

    it('should write resolution into workflow context.judgments', async () => {
      const definition = createJudgmentWorkflow();
      engine.registerDefinition(definition);
      engine.registerStepExecutor('step_before', async () => ({
        success: true,
        nextStepId: 'judgment_step',
      }));
      engine.registerStepExecutor('step_after', async () => ({ success: true }));

      const startResult = await engine.startWorkflow('test_judgment_workflow');
      const instanceId = startResult.data!;

      const judgmentId = engine.getPendingJudgments(instanceId)[0].id;
      await engine.resolveJudgment(judgmentId, 'approved', 'human_reviewer');

      const statusResult = engine.getWorkflowStatus(instanceId);
      const judgments = statusResult.data!.context.judgments as Record<string, string>;
      expect(judgments).toBeDefined();
      expect(judgments['judgment_step']).toBe('approved');
    });

    it('should emit judgment_resolved and workflow_resumed events', async () => {
      const definition = createJudgmentWorkflow();
      engine.registerDefinition(definition);
      engine.registerStepExecutor('step_before', async () => ({
        success: true,
        nextStepId: 'judgment_step',
      }));
      engine.registerStepExecutor('step_after', async () => ({ success: true }));

      const events: ExtendedWorkflowEvent[] = [];
      engine.onEvent('judgment_resolved', async (e) => events.push(e));
      engine.onEvent('workflow_resumed', async (e) => events.push(e));

      const startResult = await engine.startWorkflow('test_judgment_workflow');
      const instanceId = startResult.data!;
      const judgmentId = engine.getPendingJudgments(instanceId)[0].id;

      await engine.resolveJudgment(judgmentId, 'done', 'slaver_002');

      const resolvedEvent = events.find((e) => e.type === 'judgment_resolved');
      expect(resolvedEvent).toBeDefined();
      expect(resolvedEvent?.data?.resolution).toBe('done');
      expect(resolvedEvent?.data?.resolvedBy).toBe('slaver_002');

      const resumedEvent = events.find((e) => e.type === 'workflow_resumed');
      expect(resumedEvent).toBeDefined();
    });

    it('should return error when resolving non-existent judgment', async () => {
      const result = await engine.resolveJudgment('non_existent_id', 'yes', 'master');
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should not re-resolve an already resolved judgment', async () => {
      const definition = createJudgmentWorkflow();
      engine.registerDefinition(definition);
      engine.registerStepExecutor('step_before', async () => ({
        success: true,
        nextStepId: 'judgment_step',
      }));
      engine.registerStepExecutor('step_after', async () => ({ success: true }));

      const startResult = await engine.startWorkflow('test_judgment_workflow');
      const instanceId = startResult.data!;
      const judgmentId = engine.getPendingJudgments(instanceId)[0].id;

      // 第一次 resolve
      await engine.resolveJudgment(judgmentId, 'yes', 'master');

      // 第二次 resolve 应失败
      const second = await engine.resolveJudgment(judgmentId, 'no', 'master');
      expect(second.success).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // 3. getPendingJudgments
  // --------------------------------------------------------------------------

  describe('getPendingJudgments', () => {
    it('should return empty array when no pending judgments', () => {
      const result = engine.getPendingJudgments();
      expect(result).toEqual([]);
    });

    it('should return only pending judgments, filtered by instanceId when provided', async () => {
      // 启动两个工作流
      const defA = { ...createJudgmentWorkflow(), id: 'wf_a' };
      const defB = { ...createJudgmentWorkflow(), id: 'wf_b' };
      engine.registerDefinition(defA);
      engine.registerDefinition(defB);

      engine.registerStepExecutor('step_before', async () => ({
        success: true,
        nextStepId: 'judgment_step',
      }));

      const resA = await engine.startWorkflow('wf_a');
      const resB = await engine.startWorkflow('wf_b');
      const idA = resA.data!;
      const idB = resB.data!;

      // 全部待判断
      const all = engine.getPendingJudgments();
      expect(all.length).toBeGreaterThanOrEqual(2);

      // 按 instanceId 过滤
      const forA = engine.getPendingJudgments(idA);
      expect(forA).toHaveLength(1);
      expect(forA[0].workflowInstanceId).toBe(idA);

      const forB = engine.getPendingJudgments(idB);
      expect(forB).toHaveLength(1);
      expect(forB[0].workflowInstanceId).toBe(idB);
    });

    it('should not include resolved judgments', async () => {
      const definition = createJudgmentWorkflow();
      engine.registerDefinition(definition);
      engine.registerStepExecutor('step_before', async () => ({
        success: true,
        nextStepId: 'judgment_step',
      }));
      engine.registerStepExecutor('step_after', async () => ({ success: true }));

      const startResult = await engine.startWorkflow('test_judgment_workflow');
      const instanceId = startResult.data!;

      expect(engine.getPendingJudgments(instanceId)).toHaveLength(1);

      // 解决判断
      const judgmentId = engine.getPendingJudgments(instanceId)[0].id;
      await engine.resolveJudgment(judgmentId, 'yes', 'master');

      expect(engine.getPendingJudgments(instanceId)).toHaveLength(0);
    });
  });

  // --------------------------------------------------------------------------
  // 4. 超时处理
  // --------------------------------------------------------------------------

  describe('judgment timeout - escalate_to_master', () => {
    it('should escalate and keep workflow paused on timeout', async () => {
      const definition = createJudgmentWorkflow({
        fallback_on_timeout: 'escalate_to_master',
        judgment_timeout_ms: 3000,
      });
      engine.registerDefinition(definition);
      engine.registerStepExecutor('step_before', async () => ({
        success: true,
        nextStepId: 'judgment_step',
      }));

      const escalatedEvents: ExtendedWorkflowEvent[] = [];
      engine.onEvent('judgment_escalated', async (e) => escalatedEvents.push(e));

      const startResult = await engine.startWorkflow('test_judgment_workflow');
      const instanceId = startResult.data!;

      // 快进时间超过超时
      jest.advanceTimersByTime(4000);
      await Promise.resolve(); // flush microtasks

      // 工作流仍为 paused
      const statusResult = engine.getWorkflowStatus(instanceId);
      expect(statusResult.data!.status).toBe('paused');

      // 触发了 judgment_escalated 事件
      expect(escalatedEvents).toHaveLength(1);
      expect(escalatedEvents[0].type).toBe('judgment_escalated');
      expect(escalatedEvents[0].data?.reason).toBe('timeout');
    });

    it('should update judgment status to escalated after timeout', async () => {
      const definition = createJudgmentWorkflow({
        fallback_on_timeout: 'escalate_to_master',
        judgment_timeout_ms: 2000,
      });
      engine.registerDefinition(definition);
      engine.registerStepExecutor('step_before', async () => ({
        success: true,
        nextStepId: 'judgment_step',
      }));

      const startResult = await engine.startWorkflow('test_judgment_workflow');
      const instanceId = startResult.data!;
      const judgmentId = engine.getPendingJudgments(instanceId)[0].id;

      jest.advanceTimersByTime(3000);
      await Promise.resolve();

      // 判断不再处于 pending，应为 escalated
      const pending = engine.getPendingJudgments(instanceId);
      expect(pending).toHaveLength(0); // escalated 的不在 pending 列表

      // 无法再次 resolve（已 escalated）
      const resolveResult = await engine.resolveJudgment(judgmentId, 'late answer', 'master');
      expect(resolveResult.success).toBe(false);
    });
  });

  describe('judgment timeout - skip', () => {
    it('should auto-resume workflow with "skipped" resolution on timeout', async () => {
      const definition = createJudgmentWorkflow({
        fallback_on_timeout: 'skip',
        judgment_timeout_ms: 1000,
      });
      engine.registerDefinition(definition);
      engine.registerStepExecutor('step_before', async () => ({
        success: true,
        nextStepId: 'judgment_step',
      }));

      const completedSteps: string[] = [];
      engine.registerStepExecutor('step_after', async () => {
        completedSteps.push('step_after');
        return { success: true };
      });

      const startResult = await engine.startWorkflow('test_judgment_workflow');
      const instanceId = startResult.data!;

      // 超时前工作流是 paused
      expect(engine.getWorkflowStatus(instanceId).data!.status).toBe('paused');

      // 快进超时并 flush 异步链（多次 await 以排空 microtask 队列）
      jest.advanceTimersByTime(2000);
      // resolveJudgment → executeStep → step_after 有多层 async，需要 flush 多次
      for (let i = 0; i < 10; i++) {
        await Promise.resolve();
      }

      // step_after 应被执行
      expect(completedSteps).toContain('step_after');
    });

    it('should write "skipped" into context.judgments on skip timeout', async () => {
      const definition = createJudgmentWorkflow({
        fallback_on_timeout: 'skip',
        judgment_timeout_ms: 1000,
      });
      engine.registerDefinition(definition);
      engine.registerStepExecutor('step_before', async () => ({
        success: true,
        nextStepId: 'judgment_step',
      }));
      engine.registerStepExecutor('step_after', async () => ({ success: true }));

      const startResult = await engine.startWorkflow('test_judgment_workflow');
      const instanceId = startResult.data!;

      jest.advanceTimersByTime(2000);
      await Promise.resolve();

      const statusResult = engine.getWorkflowStatus(instanceId);
      const judgments = statusResult.data!.context.judgments as Record<string, string>;
      expect(judgments?.['judgment_step']).toBe('skipped');
    });
  });

  describe('judgment timeout - fail_workflow', () => {
    it('should fail workflow on timeout with fail_workflow fallback', async () => {
      const definition = createJudgmentWorkflow({
        fallback_on_timeout: 'fail_workflow',
        judgment_timeout_ms: 1000,
      });
      engine.registerDefinition(definition);
      engine.registerStepExecutor('step_before', async () => ({
        success: true,
        nextStepId: 'judgment_step',
      }));

      const failedEvents: ExtendedWorkflowEvent[] = [];
      engine.onEvent('workflow_failed', async (e) => failedEvents.push(e));

      const startResult = await engine.startWorkflow('test_judgment_workflow');
      const instanceId = startResult.data!;

      jest.advanceTimersByTime(2000);
      await Promise.resolve();

      const statusResult = engine.getWorkflowStatus(instanceId);
      expect(statusResult.data!.status).toBe('failed');

      expect(failedEvents).toHaveLength(1);
      expect(failedEvents[0].data?.reason).toContain('timed out');
    });
  });

  // --------------------------------------------------------------------------
  // 5. 向后兼容：无 judgment_required 步骤行为不变
  // --------------------------------------------------------------------------

  describe('backward compatibility', () => {
    it('should execute steps without judgment_required normally', async () => {
      const definition: WorkflowDefinition = {
        id: 'classic_workflow',
        name: 'Classic Workflow',
        description: '无判断点的传统工作流',
        steps: [
          {
            id: 'step_one',
            name: 'Step One',
            action: 'do_something',
            on_complete: 'step_two',
          },
          {
            id: 'step_two',
            name: 'Step Two',
            action: 'finish',
          },
        ],
        triggers: [],
      };
      engine.registerDefinition(definition);

      const executedSteps: string[] = [];
      engine.registerStepExecutor('step_one', async () => {
        executedSteps.push('step_one');
        return { success: true, nextStepId: 'step_two' };
      });
      engine.registerStepExecutor('step_two', async () => {
        executedSteps.push('step_two');
        return { success: true };
      });

      const startResult = await engine.startWorkflow('classic_workflow');
      const instanceId = startResult.data!;

      expect(executedSteps).toEqual(['step_one', 'step_two']);

      const statusResult = engine.getWorkflowStatus(instanceId);
      expect(statusResult.data!.status).toBe('completed');

      // 无待判断请求
      expect(engine.getPendingJudgments(instanceId)).toHaveLength(0);
    });

    it('should not pause workflow for steps with judgment_required: false', async () => {
      const definition: WorkflowDefinition = {
        id: 'explicit_no_judgment',
        name: 'Explicit No Judgment',
        description: '显式关闭判断点',
        steps: [
          {
            id: 'step_explicit',
            name: 'Step Explicit',
            action: 'run',
            // No judgment_required means it should run normally
          },
        ],
        triggers: [],
      };
      engine.registerDefinition(definition);

      const executed: string[] = [];
      engine.registerStepExecutor('step_explicit', async () => {
        executed.push('step_explicit');
        return { success: true };
      });

      const startResult = await engine.startWorkflow('explicit_no_judgment');
      const instanceId = startResult.data!;

      expect(executed).toContain('step_explicit');
      expect(engine.getWorkflowStatus(instanceId).data!.status).toBe('completed');
    });
  });
});
