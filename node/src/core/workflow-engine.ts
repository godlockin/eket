/**
 * EKET Framework - Workflow Engine
 * Phase 6.1: Multi-Instance Collaboration
 *
 * 工作流引擎，支持定义和执行协作工作流
 * - 工作流定义和实例化
 * - 步骤执行和状态跟踪
 * - 超时处理和错误恢复
 * - 事件驱动的触发器
 */

import { EketError, EketErrorCode } from '../types/index.js';
import type {
  WorkflowDefinition,
  WorkflowInstance,
  WorkflowStep,
  WorkflowJudgmentRequest,
  JudgmentStatus,
  Result,
  CommunicationProtocolConfig,
} from '../types/index.js';

import { CommunicationProtocol, createCommunicationProtocol } from './communication-protocol.js';

/**
 * 工作流引擎配置
 */
export interface WorkflowEngineConfig {
  instanceId: string;
  protocolConfig?: Partial<CommunicationProtocolConfig>;
  defaultStepTimeout_ms?: number;
}

/**
 * 工作流执行上下文
 */
export interface WorkflowContext {
  [key: string]: unknown;
  currentStepId?: string;
  previousStepId?: string;
  error?: string;
  retryCount?: number;
}

/**
 * 步骤执行器类型
 */
export type StepExecutor = (context: WorkflowContext) => Promise<StepExecutionResult>;

/**
 * 步骤执行结果
 */
export interface StepExecutionResult {
  success: boolean;
  nextStepId?: string;
  output?: Record<string, unknown>;
  error?: string;
}

/**
 * 工作流事件
 */
export type WorkflowEventType =
  | 'workflow_started'
  | 'workflow_completed'
  | 'workflow_failed'
  | 'workflow_paused'
  | 'workflow_resumed'
  | 'step_started'
  | 'step_completed'
  | 'step_failed'
  | 'step_timeout';

export interface WorkflowEvent {
  type: WorkflowEventType;
  workflowId: string;
  stepId?: string;
  timestamp: number;
  data?: Record<string, unknown>;
}

/**
 * 工作流事件处理器
 */
export type WorkflowEventHandler = (event: WorkflowEvent) => Promise<void>;

// ============================================================================
// Judgment Point Local Types
// ============================================================================

/**
 * 扩展 WorkflowStep，增加判断点支持（本地扩展，不改 types/index.ts）
 */
export interface JudgmentAwareStep extends WorkflowStep {
  judgment_required?: boolean; // 是否需要判断
  judgment_prompt?: string; // 判断提示
  judgment_timeout_ms?: number; // 判断超时（覆盖 timeout_ms）
  fallback_on_timeout?: 'escalate_to_master' | 'skip' | 'fail_workflow';
}

/**
 * 扩展事件类型，包含判断点事件
 */
export type ExtendedWorkflowEventType =
  | WorkflowEventType
  | 'judgment_required'
  | 'judgment_resolved'
  | 'judgment_escalated';

/**
 * 扩展工作流事件（携带判断请求数据）
 */
export interface ExtendedWorkflowEvent {
  type: ExtendedWorkflowEventType;
  workflowId: string;
  stepId?: string;
  timestamp: number;
  data?: Record<string, unknown>;
}

/**
 * 扩展事件处理器（支持判断点事件）
 */
export type ExtendedWorkflowEventHandler = (event: ExtendedWorkflowEvent) => Promise<void>;

/**
 * 工作流引擎类
 */
export class WorkflowEngine {
  private config: WorkflowEngineConfig;
  private protocol: CommunicationProtocol;
  private definitions: Map<string, WorkflowDefinition> = new Map();
  private instances: Map<string, WorkflowInstance> = new Map();
  private stepExecutors: Map<string, StepExecutor> = new Map();
  private eventHandlers: Map<ExtendedWorkflowEventType, Set<ExtendedWorkflowEventHandler>> =
    new Map();
  private readonly defaultTimeout: number;
  private runningTimers: Map<string, NodeJS.Timeout> = new Map();
  /** 待判断的判断点请求（key: judgmentId） */
  private pendingJudgments: Map<string, WorkflowJudgmentRequest> = new Map();

  constructor(config: WorkflowEngineConfig) {
    this.config = {
      instanceId: config.instanceId,
      defaultStepTimeout_ms: config.defaultStepTimeout_ms || 300000, // 默认 5 分钟
    };
    this.defaultTimeout = config.defaultStepTimeout_ms || 300000;

    this.protocol = createCommunicationProtocol({
      instanceId: config.instanceId,
      defaultPriority: config.protocolConfig?.defaultPriority || 'normal',
      ...config.protocolConfig,
    });
  }

  /**
   * 连接通信协议
   */
  async connect(): Promise<Result<void>> {
    return await this.protocol.connect();
  }

  /**
   * 断开连接
   */
  async disconnect(): Promise<void> {
    // 清理所有定时器
    for (const [, timer] of this.runningTimers.entries()) {
      clearTimeout(timer);
    }
    this.runningTimers.clear();

    await this.protocol.disconnect();
  }

  /**
   * 注册工作流定义
   */
  registerDefinition(definition: WorkflowDefinition): void {
    if (this.definitions.has(definition.id)) {
      throw new Error(`Workflow definition ${definition.id} already exists`);
    }
    this.definitions.set(definition.id, definition);
    console.log(`[WorkflowEngine] Registered workflow: ${definition.name}`);
  }

  /**
   * 注册步骤执行器
   */
  registerStepExecutor(stepId: string, executor: StepExecutor): void {
    this.stepExecutors.set(stepId, executor);
  }

  /**
   * 注册事件处理器（支持标准事件类型和判断点扩展事件类型）
   */
  onEvent(
    eventType: WorkflowEventType | ExtendedWorkflowEventType,
    handler: ExtendedWorkflowEventHandler
  ): void {
    if (!this.eventHandlers.has(eventType)) {
      this.eventHandlers.set(eventType, new Set());
    }
    this.eventHandlers.get(eventType)!.add(handler);
  }

  /**
   * 启动工作流实例
   */
  async startWorkflow(
    definitionId: string,
    initialContext: Record<string, unknown> = {}
  ): Promise<Result<string>> {
    const definition = this.definitions.get(definitionId);
    if (!definition) {
      return {
        success: false,
        error: new EketError(EketErrorCode.WORKFLOW_NOT_FOUND, `Workflow definition ${definitionId} not found`),
      };
    }

    if (!this.protocol.isReady()) {
      return {
        success: false,
        error: new EketError(EketErrorCode.PROTOCOL_NOT_CONNECTED, 'Communication protocol not connected'),
      };
    }

    const instanceId = this.generateInstanceId();
    const instance: WorkflowInstance = {
      id: instanceId,
      definitionId,
      status: 'running',
      currentStepId: definition.steps[0]?.id,
      context: { ...initialContext },
      startedAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.instances.set(instanceId, instance);

    // 触发 workflow_started 事件
    await this.emitEvent({
      type: 'workflow_started',
      workflowId: instanceId,
      timestamp: Date.now(),
      data: { definitionId, initialContext },
    });

    // 开始执行第一步
    if (instance.currentStepId) {
      await this.executeStep(instanceId, instance.currentStepId);
    }

    return { success: true, data: instanceId };
  }

  /**
   * 执行工作流步骤
   */
  private async executeStep(instanceId: string, stepId: string): Promise<void> {
    const instance = this.instances.get(instanceId);
    if (!instance || instance.status !== 'running') {
      return;
    }

    const definition = this.definitions.get(instance.definitionId);
    if (!definition) {
      return;
    }

    const step = definition.steps.find((s) => s.id === stepId);
    if (!step) {
      await this.failWorkflow(instanceId, `Step ${stepId} not found`);
      return;
    }

    // 更新当前步骤
    instance.context.previousStepId = instance.context.currentStepId;
    instance.context.currentStepId = stepId;
    instance.currentStepId = stepId;
    instance.updatedAt = Date.now();

    // 触发 step_started 事件
    await this.emitEvent({
      type: 'step_started',
      workflowId: instanceId,
      stepId,
      timestamp: Date.now(),
    });

    // 判断点检查：如果步骤标记为 judgment_required，挂起工作流等待判断
    const stepAsJudgment = step as JudgmentAwareStep;
    if (stepAsJudgment.judgment_required) {
      await this.handleJudgmentPoint(instanceId, stepAsJudgment, instance.context);
      return; // 挂起，等待外部调用 resolveJudgment
    }

    // 设置超时
    const timeout = step.timeout_ms || this.defaultTimeout;
    const timer = setTimeout(async () => {
      await this.handleStepTimeout(instanceId, stepId);
    }, timeout);
    this.runningTimers.set(`${instanceId}:${stepId}`, timer);

    try {
      // 执行步骤
      const executor = this.stepExecutors.get(stepId);
      let result: StepExecutionResult;

      if (executor) {
        result = await executor(instance.context);
      } else {
        // 没有注册执行器，使用默认行为（通过通信协议通知）
        result = await this.executeDefaultStep(step, instance.context);
      }

      // 清理定时器
      clearTimeout(timer);
      this.runningTimers.delete(`${instanceId}:${stepId}`);

      if (result.success) {
        // 触发 step_completed 事件
        await this.emitEvent({
          type: 'step_completed',
          workflowId: instanceId,
          stepId,
          timestamp: Date.now(),
          data: { output: result.output },
        });

        // 确定下一步
        const nextStepId = result.nextStepId || step.on_complete;
        if (nextStepId) {
          instance.currentStepId = nextStepId;
          await this.executeStep(instanceId, nextStepId);
        } else {
          // 没有下一步，工作流完成
          await this.completeWorkflow(instanceId, result.output);
        }
      } else {
        // 步骤失败
        await this.handleStepError(instanceId, stepId, result.error);
      }
    } catch (err) {
      clearTimeout(timer);
      this.runningTimers.delete(`${instanceId}:${stepId}`);
      await this.handleStepError(
        instanceId,
        stepId,
        err instanceof Error ? err.message : 'Unknown error'
      );
    }
  }

  /**
   * 默认步骤执行（通过通信协议）
   */
  private async executeDefaultStep(
    step: WorkflowStep,
    context: WorkflowContext
  ): Promise<StepExecutionResult> {
    console.log(`[WorkflowEngine] Executing default step: ${step.name} (${step.action})`);

    // 如果步骤需要特定角色，发送依赖通知
    if (step.required_role) {
      await this.protocol.sendDependencyNotify('all', {
        dependencyId: `step:${step.id}`,
        taskId: String(context.taskId || context.ticketId || 'unknown'),
        dependencyType: 'approval',
        isReady: true,
      });
    }

    return {
      success: true,
      output: { action: step.action, executedAt: Date.now() },
    };
  }

  /**
   * 处理步骤超时
   */
  private async handleStepTimeout(instanceId: string, stepId: string): Promise<void> {
    console.error(`[WorkflowEngine] Step timeout: ${stepId} in workflow ${instanceId}`);

    await this.emitEvent({
      type: 'step_timeout',
      workflowId: instanceId,
      stepId,
      timestamp: Date.now(),
    });

    // 尝试错误处理步骤
    const instance = this.instances.get(instanceId);
    if (!instance) {
      return;
    }

    const definition = this.definitions.get(instance.definitionId);
    const step = definition?.steps.find((s) => s.id === stepId);

    if (step?.on_error) {
      await this.executeStep(instanceId, step.on_error);
    } else {
      await this.failWorkflow(instanceId, `Step ${stepId} timed out`);
    }
  }

  /**
   * 处理步骤错误
   */
  private async handleStepError(instanceId: string, stepId: string, error?: string): Promise<void> {
    console.error(`[WorkflowEngine] Step error: ${stepId} in workflow ${instanceId}: ${error}`);

    const instance = this.instances.get(instanceId);
    if (!instance) {
      return;
    }

    const definition = this.definitions.get(instance.definitionId);
    const step = definition?.steps.find((s) => s.id === stepId);

    instance.context.error = error;

    // 触发 step_failed 事件
    await this.emitEvent({
      type: 'step_failed',
      workflowId: instanceId,
      stepId,
      timestamp: Date.now(),
      data: { error },
    });

    if (step?.on_error) {
      await this.executeStep(instanceId, step.on_error);
    } else {
      await this.failWorkflow(instanceId, error || 'Step execution failed');
    }
  }

  /**
   * 完成工作流
   */
  private async completeWorkflow(
    instanceId: string,
    output?: Record<string, unknown>
  ): Promise<void> {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      return;
    }

    instance.status = 'completed';
    instance.completedAt = Date.now();
    instance.updatedAt = Date.now();

    console.log(`[WorkflowEngine] Workflow completed: ${instanceId}`);

    await this.emitEvent({
      type: 'workflow_completed',
      workflowId: instanceId,
      timestamp: Date.now(),
      data: { output },
    });
  }

  /**
   * 失败工作流
   */
  private async failWorkflow(instanceId: string, reason: string): Promise<void> {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      return;
    }

    instance.status = 'failed';
    instance.completedAt = Date.now();
    instance.updatedAt = Date.now();
    instance.context.error = reason;

    console.error(`[WorkflowEngine] Workflow failed: ${instanceId}: ${reason}`);

    await this.emitEvent({
      type: 'workflow_failed',
      workflowId: instanceId,
      timestamp: Date.now(),
      data: { reason },
    });
  }

  /**
   * 暂停工作流
   */
  pauseWorkflow(instanceId: string): Result<void> {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      return {
        success: false,
        error: new EketError(EketErrorCode.WORKFLOW_NOT_FOUND, `Workflow instance ${instanceId} not found`),
      };
    }

    if (instance.status !== 'running') {
      return {
        success: false,
        error: new EketError(EketErrorCode.WORKFLOW_NOT_RUNNING, `Workflow ${instanceId} is not running`),
      };
    }

    instance.status = 'paused';
    instance.updatedAt = Date.now();

    this.emitEvent({
      type: 'workflow_paused',
      workflowId: instanceId,
      timestamp: Date.now(),
    });

    return { success: true, data: undefined };
  }

  /**
   * 恢复工作流
   */
  async resumeWorkflow(instanceId: string): Promise<Result<void>> {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      return {
        success: false,
        error: new EketError(EketErrorCode.WORKFLOW_NOT_FOUND, `Workflow instance ${instanceId} not found`),
      };
    }

    if (instance.status !== 'paused') {
      return {
        success: false,
        error: new EketError(EketErrorCode.WORKFLOW_NOT_PAUSED, `Workflow ${instanceId} is not paused`),
      };
    }

    instance.status = 'running';
    instance.updatedAt = Date.now();

    await this.emitEvent({
      type: 'workflow_resumed',
      workflowId: instanceId,
      timestamp: Date.now(),
    });

    // 继续执行当前步骤
    if (instance.currentStepId) {
      await this.executeStep(instanceId, instance.currentStepId);
    }

    return { success: true, data: undefined };
  }

  /**
   * 获取工作流实例状态
   */
  getWorkflowStatus(instanceId: string): Result<WorkflowInstance> {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      return {
        success: false,
        error: new EketError(EketErrorCode.WORKFLOW_NOT_FOUND, `Workflow instance ${instanceId} not found`),
      };
    }

    return { success: true, data: { ...instance } };
  }

  /**
   * 获取所有工作流实例
   */
  getAllWorkflows(): WorkflowInstance[] {
    return Array.from(this.instances.values());
  }

  /**
   * 触发事件（支持标准事件和判断点扩展事件）
   */
  private async emitEvent(event: ExtendedWorkflowEvent): Promise<void> {
    const handlers = this.eventHandlers.get(event.type);
    if (handlers) {
      for (const handler of handlers) {
        try {
          await handler(event);
        } catch (err) {
          console.error(
            `[WorkflowEngine] Event handler error for ${event.type}:`,
            err instanceof Error ? err.message : err
          );
        }
      }
    }

    console.log(
      `[WorkflowEngine] Event: ${event.type} (workflow: ${event.workflowId}${event.stepId ? `, step: ${event.stepId}` : ''})`
    );
  }

  /**
   * 生成实例 ID
   */
  private generateInstanceId(): string {
    return `wf_${this.config.instanceId}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  // ============================================================================
  // Judgment Point Methods
  // ============================================================================

  /**
   * 处理判断点——挂起工作流等待判断
   *
   * 流程：
   * 1. 创建 WorkflowJudgmentRequest 并存入 pendingJudgments
   * 2. 将工作流实例状态设为 'paused'
   * 3. 触发 'judgment_required' 事件
   * 4. 设置超时定时器
   */
  private async handleJudgmentPoint(
    instanceId: string,
    step: JudgmentAwareStep,
    context: WorkflowContext
  ): Promise<void> {
    const judgmentId = `jdg_${instanceId}_${step.id}_${Date.now()}`;
    const timeoutMs = step.judgment_timeout_ms ?? step.timeout_ms ?? this.defaultTimeout;
    const fallback = step.fallback_on_timeout ?? 'escalate_to_master';

    const judgmentRequest: WorkflowJudgmentRequest = {
      id: judgmentId,
      workflowInstanceId: instanceId,
      stepId: step.id,
      judgmentPrompt: step.judgment_prompt ?? `步骤 "${step.name}" 需要人工判断，请提供决策。`,
      context: { ...context },
      fallbackOnTimeout: fallback,
      timeoutMs,
      createdAt: Date.now(),
      status: 'pending' as JudgmentStatus,
    };

    this.pendingJudgments.set(judgmentId, judgmentRequest);

    // 暂停工作流
    const instance = this.instances.get(instanceId);
    if (instance) {
      instance.status = 'paused';
      instance.updatedAt = Date.now();
    }

    console.log(
      `[WorkflowEngine] Judgment required for step "${step.id}" in workflow ${instanceId} (judgmentId: ${judgmentId})`
    );

    // 触发 judgment_required 事件
    await this.emitEvent({
      type: 'judgment_required',
      workflowId: instanceId,
      stepId: step.id,
      timestamp: Date.now(),
      data: { judgmentRequest },
    });

    // 设置超时定时器
    const timerKey = `judgment:${judgmentId}`;
    const timer = setTimeout(async () => {
      await this.handleJudgmentTimeout(instanceId, judgmentId, fallback);
    }, timeoutMs);
    this.runningTimers.set(timerKey, timer);
  }

  /**
   * 提交判断结果，恢复工作流
   *
   * @param judgmentId - 判断请求 ID
   * @param resolution - 判断结果
   * @param resolvedBy - 做出判断的主体（Instance ID 或 'master'）
   */
  async resolveJudgment(
    judgmentId: string,
    resolution: string,
    resolvedBy: string
  ): Promise<Result<void>> {
    const judgment = this.pendingJudgments.get(judgmentId);
    if (!judgment) {
      return {
        success: false,
        error: new EketError(
          'WORKFLOW_NOT_FOUND',
          `Judgment request ${judgmentId} not found or already resolved`
        ),
      };
    }

    if (judgment.status !== 'pending') {
      return {
        success: false,
        error: new EketError(
          'WORKFLOW_NOT_FOUND',
          `Judgment request ${judgmentId} is not in pending state (current: ${judgment.status})`
        ),
      };
    }

    // 清理超时定时器
    const timerKey = `judgment:${judgmentId}`;
    const timer = this.runningTimers.get(timerKey);
    if (timer) {
      clearTimeout(timer);
      this.runningTimers.delete(timerKey);
    }

    // 更新判断请求状态
    judgment.status = 'resolved';
    judgment.resolution = resolution;
    judgment.resolvedBy = resolvedBy;
    judgment.resolvedAt = Date.now();

    // 将判断结果写入工作流上下文
    const instance = this.instances.get(judgment.workflowInstanceId);
    if (!instance) {
      return {
        success: false,
        error: new EketError(
          'WORKFLOW_NOT_FOUND',
          `Workflow instance ${judgment.workflowInstanceId} not found`
        ),
      };
    }

    // 将结果存入 context.judgments[stepId]
    if (!instance.context.judgments) {
      instance.context.judgments = {};
    }
    (instance.context.judgments as Record<string, string>)[judgment.stepId] = resolution;

    console.log(
      `[WorkflowEngine] Judgment resolved for step "${judgment.stepId}" in workflow ${judgment.workflowInstanceId}: "${resolution}" by ${resolvedBy}`
    );

    // 触发 judgment_resolved 事件
    await this.emitEvent({
      type: 'judgment_resolved',
      workflowId: judgment.workflowInstanceId,
      stepId: judgment.stepId,
      timestamp: Date.now(),
      data: { judgmentId, resolution, resolvedBy },
    });

    // 恢复工作流：将状态改回 running，然后执行步骤的 on_complete
    instance.status = 'running';
    instance.updatedAt = Date.now();

    await this.emitEvent({
      type: 'workflow_resumed',
      workflowId: judgment.workflowInstanceId,
      timestamp: Date.now(),
      data: { reason: 'judgment_resolved' },
    });

    // 获取步骤定义，执行后续步骤
    const definition = this.definitions.get(instance.definitionId);
    const step = definition?.steps.find((s) => s.id === judgment.stepId) as
      | JudgmentAwareStep
      | undefined;

    if (step?.on_complete) {
      instance.currentStepId = step.on_complete;
      await this.executeStep(judgment.workflowInstanceId, step.on_complete);
    } else {
      // 没有下一步，工作流完成
      await this.completeWorkflow(judgment.workflowInstanceId, {
        lastJudgment: resolution,
        resolvedBy,
      });
    }

    return { success: true, data: undefined };
  }

  /**
   * 获取所有待判断的请求
   *
   * @param workflowInstanceId - 可选，按工作流实例 ID 过滤
   */
  getPendingJudgments(workflowInstanceId?: string): WorkflowJudgmentRequest[] {
    const all = Array.from(this.pendingJudgments.values()).filter(
      (j) => j.status === 'pending'
    );
    if (workflowInstanceId) {
      return all.filter((j) => j.workflowInstanceId === workflowInstanceId);
    }
    return all;
  }

  /**
   * 处理判断点超时
   *
   * - escalate_to_master: 触发 judgment_escalated 事件，工作流继续 paused 状态
   * - skip: 用 'skipped' 作为 resolution，继续执行工作流
   * - fail_workflow: 令工作流失败
   */
  private async handleJudgmentTimeout(
    instanceId: string,
    judgmentId: string,
    fallback: 'escalate_to_master' | 'skip' | 'fail_workflow'
  ): Promise<void> {
    const judgment = this.pendingJudgments.get(judgmentId);
    if (!judgment || judgment.status !== 'pending') {
      return; // 已被处理（resolved 或 escalated）
    }

    console.warn(
      `[WorkflowEngine] Judgment timed out: ${judgmentId} (fallback: ${fallback})`
    );

    switch (fallback) {
      case 'escalate_to_master': {
        judgment.status = 'escalated';
        judgment.resolvedAt = Date.now();

        // 触发 judgment_escalated 事件，工作流保持 paused
        await this.emitEvent({
          type: 'judgment_escalated',
          workflowId: instanceId,
          stepId: judgment.stepId,
          timestamp: Date.now(),
          data: {
            judgmentId,
            reason: 'timeout',
            prompt: judgment.judgmentPrompt,
            workflowInstanceId: instanceId,
          },
        });

        console.warn(
          `[WorkflowEngine] Judgment escalated to master: workflow ${instanceId} remains paused`
        );
        break;
      }

      case 'skip': {
        // 以 'skipped' 作为 resolution 继续工作流
        // 注意：此处不预先修改 status，让 resolveJudgment 完成正常的恢复流程
        await this.resolveJudgment(judgmentId, 'skipped', 'system:timeout');
        // resolveJudgment 成功后，更新最终状态为 timed_out 而非 resolved
        judgment.status = 'timed_out';
        break;
      }

      case 'fail_workflow': {
        judgment.status = 'timed_out';
        await this.failWorkflow(instanceId, `Judgment timed out for step "${judgment.stepId}"`);
        break;
      }
    }
  }
}

/**
 * 创建工作流引擎实例
 */
export function createWorkflowEngine(config: WorkflowEngineConfig): WorkflowEngine {
  return new WorkflowEngine(config);
}

// ─── 工作流类型枚举（借鉴 CrewAI Flows）────────────────────────────
export enum WorkflowType {
  SEQUENTIAL = 'sequential',
  PARALLEL = 'parallel',
  DAG = 'dag',
}

// ─── 预设工作流模板步骤类型 ────────────────────────────────────────
export interface WorkflowTemplateStep {
  id: string;
  role: string;
  action: string;
  timeout: number;
  dependsOn?: string[];
}

// ─── 预设工作流模板（借鉴 CrewAI Flows）────────────────────────────
export const WORKFLOW_TEMPLATES = {
  FEATURE_DEV: {
    name: 'feature-dev',
    description: 'Feature 开发标准流：analysis → in_progress → test → pr_review',
    type: WorkflowType.SEQUENTIAL,
    steps: [
      { id: 'analysis', role: 'analyzer', action: 'analyze_ticket', timeout: 30 },
      { id: 'implement', role: 'developer', action: 'implement', timeout: 120 },
      { id: 'test', role: 'tester', action: 'run_tests', timeout: 30 },
      { id: 'pr', role: 'developer', action: 'create_pr', timeout: 10 },
    ],
  },
  PARALLEL_REVIEW: {
    name: 'parallel-review',
    description: '并行代码审查：2 个 reviewer 独立审查后汇总',
    type: WorkflowType.PARALLEL,
    steps: [
      { id: 'review_a', role: 'reviewer', action: 'code_review', timeout: 30 },
      { id: 'review_b', role: 'reviewer', action: 'security_review', timeout: 30 },
      { id: 'merge', role: 'master', action: 'merge_reviews', timeout: 10, dependsOn: ['review_a', 'review_b'] },
    ],
  },
  BUG_FIX: {
    name: 'bug-fix',
    description: 'Bug 修复快速流：reproduce → locate → fix → verify',
    type: WorkflowType.SEQUENTIAL,
    steps: [
      { id: 'reproduce', role: 'analyzer', action: 'reproduce_bug', timeout: 20 },
      { id: 'locate', role: 'analyzer', action: 'locate_root_cause', timeout: 20 },
      { id: 'fix', role: 'developer', action: 'implement_fix', timeout: 60 },
      { id: 'verify', role: 'tester', action: 'verify_fix', timeout: 20 },
    ],
  },
} as const;

export type WorkflowTemplateName = keyof typeof WORKFLOW_TEMPLATES;

/**
 * 通过模板名称获取工作流配置
 * @param name 模板名称（FEATURE_DEV | PARALLEL_REVIEW | BUG_FIX）
 * @returns 模板对象或 null
 */
export function getWorkflowTemplate(name: WorkflowTemplateName) {
  return WORKFLOW_TEMPLATES[name] ?? null;
}

// ============================================================================
// Hook Pipeline (TASK-035)
// ============================================================================

/**
 * Ticket 状态类型（与 jira/tickets 状态机对应）
 */
export type TicketStatus =
  | 'backlog'
  | 'analysis'
  | 'ready'
  | 'gate_review'
  | 'in_progress'
  | 'test'
  | 'pr_review'
  | 'done';

/**
 * transitionStatus 选项
 */
export interface TransitionStatusOptions {
  /** 设为 true 可跳过 hook（ticket 元数据 hookOverride） */
  hookOverride?: boolean;
}

/**
 * runPrePrReviewHook — 进入 pr_review 状态前的 hook 执行点
 *
 * 此阶段为 stub，直接返回 { success: true, data: undefined }。
 * TASK-036 实现真实 shell 脚本后接入此函数。
 *
 * @param ticketId - 目标 ticket ID
 * @returns Result<undefined>
 */
export async function runPrePrReviewHook(ticketId: string): Promise<Result<undefined>> {
  console.log(`[Hook] runPrePrReviewHook stub called for ticket: ${ticketId}`);
  // Stub: TASK-036 will replace this with real shell invocation
  return { success: true, data: undefined };
}

/**
 * transitionStatus — ticket 状态变更，进入 pr_review 时自动触发 hook
 *
 * 行为：
 * - 若 `to === 'pr_review'` 且未设置 hookOverride，执行 runPrePrReviewHook
 * - 若环境变量 `EKET_HOOK_DRYRUN=true`，只记录日志不执行 hook
 * - hook 失败则返回 HOOK_BLOCKED 错误（dryrun 模式不阻断）
 *
 * @param ticketId   - 目标 ticket ID
 * @param from       - 当前状态
 * @param to         - 目标状态
 * @param options    - 可选：{ hookOverride: true } 跳过 hook
 * @returns Result<void>
 */
export async function transitionStatus(
  ticketId: string,
  from: TicketStatus,
  to: TicketStatus,
  options?: TransitionStatusOptions,
): Promise<Result<void>> {
  if (to === 'pr_review' && !options?.hookOverride) {
    if (process.env['EKET_HOOK_DRYRUN'] === 'true') {
      // Dryrun：只记日志，不执行 hook，不阻断
      console.log(`[Hook][DRYRUN] Would run pre-pr_review hook for ticket: ${ticketId} (from: ${from})`);
    } else {
      const hookResult = await runPrePrReviewHook(ticketId);
      if (!hookResult.success) {
        return {
          success: false,
          error: new EketError(EketErrorCode.HOOK_BLOCKED, `Pre-PR-review hook blocked ticket ${ticketId}: ${hookResult.error.message}`),
        };
      }
    }
  }

  // Transition logic placeholder — downstream implementations wire real persistence
  console.log(`[Workflow] Transition ${ticketId}: ${from} → ${to}`);
  return { success: true, data: undefined };
}

// ============================================================================
// 预定义工作流模板
// ============================================================================

/**
 * 创建依赖协作工作流定义
 *
 * 场景：Instance A 需要 Instance B 的输出
 * 1. A 发送 dependency_notify → B
 * 2. B 确认并继续工作
 * 3. B 完成 → 发送 knowledge_share → A
 * 4. A 接收到通知后继续
 */
export function createDependencyCollaborationWorkflow(): WorkflowDefinition {
  return {
    id: 'dependency_collaboration',
    name: 'Dependency Collaboration Workflow',
    description: '处理 Instance 之间的依赖协作',
    steps: [
      {
        id: 'notify_dependency',
        name: 'Notify Dependency',
        action: 'send_dependency_notify',
        on_complete: 'wait_for_dependency',
        on_error: 'handle_dependency_error',
      },
      {
        id: 'wait_for_dependency',
        name: 'Wait for Dependency',
        action: 'wait',
        judgment_required: true, // 需要人工/Master 确认依赖已就绪
        judgment_prompt: '依赖任务是否已完成并可以继续？请确认前序任务输出满足当前任务需求。',
        judgment_timeout_ms: 600000, // 10 分钟
        fallback_on_timeout: 'escalate_to_master',
        on_complete: 'process_dependency_output',
        on_error: 'handle_dependency_timeout',
      } as JudgmentAwareStep,
      {
        id: 'process_dependency_output',
        name: 'Process Dependency Output',
        action: 'process_output',
        on_complete: 'acknowledge_completion',
      },
      {
        id: 'acknowledge_completion',
        name: 'Acknowledge Completion',
        action: 'send_knowledge_share',
        on_complete: 'continue_workflow',
      },
      {
        id: 'handle_dependency_error',
        name: 'Handle Dependency Error',
        action: 'handle_error',
        on_complete: 'escalate_if_needed',
      },
      {
        id: 'handle_dependency_timeout',
        name: 'Handle Dependency Timeout',
        action: 'handle_timeout',
        on_complete: 'escalate_if_needed',
      },
      {
        id: 'escalate_if_needed',
        name: 'Escalate if Needed',
        action: 'escalate',
        on_complete: 'continue_workflow',
      },
      {
        id: 'continue_workflow',
        name: 'Continue Workflow',
        action: 'continue',
      },
    ],
    triggers: [
      {
        type: 'message',
        condition: 'dependency_notify received',
        action: 'start_workflow',
      },
    ],
  };
}

/**
 * 创建任务交接工作流定义
 */
export function createHandoverWorkflow(): WorkflowDefinition {
  return {
    id: 'task_handover',
    name: 'Task Handover Workflow',
    description: '处理任务在 Instance 之间的交接',
    steps: [
      {
        id: 'initiate_handover',
        name: 'Initiate Handover',
        action: 'send_handover_request',
        required_role: 'product_manager',
        on_complete: 'wait_for_acceptance',
      },
      {
        id: 'wait_for_acceptance',
        name: 'Wait for Acceptance',
        action: 'wait',
        timeout_ms: 300000, // 5 分钟
        on_complete: 'transfer_context',
        on_error: 'handover_failed',
      },
      {
        id: 'transfer_context',
        name: 'Transfer Context',
        action: 'transfer_knowledge',
        on_complete: 'confirm_handover',
      },
      {
        id: 'confirm_handover',
        name: 'Confirm Handover',
        action: 'send_handover_complete',
        on_complete: 'complete',
      },
      {
        id: 'handover_failed',
        name: 'Handover Failed',
        action: 'notify_failure',
      },
      {
        id: 'complete',
        name: 'Complete',
        action: 'complete',
      },
    ],
    triggers: [
      {
        type: 'state_change',
        condition: 'instance_offline',
        action: 'initiate_handover',
      },
    ],
  };
}
