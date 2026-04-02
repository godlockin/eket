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

import { EketError } from '../types/index.js';
import type {
  WorkflowDefinition,
  WorkflowInstance,
  WorkflowStep,
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

/**
 * 工作流引擎类
 */
export class WorkflowEngine {
  private config: WorkflowEngineConfig;
  private protocol: CommunicationProtocol;
  private definitions: Map<string, WorkflowDefinition> = new Map();
  private instances: Map<string, WorkflowInstance> = new Map();
  private stepExecutors: Map<string, StepExecutor> = new Map();
  private eventHandlers: Map<WorkflowEventType, Set<WorkflowEventHandler>> = new Map();
  private readonly defaultTimeout: number;
  private runningTimers: Map<string, NodeJS.Timeout> = new Map();

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
   * 注册事件处理器
   */
  onEvent(eventType: WorkflowEventType, handler: WorkflowEventHandler): void {
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
        error: new EketError('WORKFLOW_NOT_FOUND', `Workflow definition ${definitionId} not found`),
      };
    }

    if (!this.protocol.isReady()) {
      return {
        success: false,
        error: new EketError('PROTOCOL_NOT_CONNECTED', 'Communication protocol not connected'),
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
        error: new EketError('WORKFLOW_NOT_FOUND', `Workflow instance ${instanceId} not found`),
      };
    }

    if (instance.status !== 'running') {
      return {
        success: false,
        error: new EketError('WORKFLOW_NOT_RUNNING', `Workflow ${instanceId} is not running`),
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
        error: new EketError('WORKFLOW_NOT_FOUND', `Workflow instance ${instanceId} not found`),
      };
    }

    if (instance.status !== 'paused') {
      return {
        success: false,
        error: new EketError('WORKFLOW_NOT_PAUSED', `Workflow ${instanceId} is not paused`),
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
        error: new EketError('WORKFLOW_NOT_FOUND', `Workflow instance ${instanceId} not found`),
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
   * 触发事件
   */
  private async emitEvent(event: WorkflowEvent): Promise<void> {
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
}

/**
 * 创建工作流引擎实例
 */
export function createWorkflowEngine(config: WorkflowEngineConfig): WorkflowEngine {
  return new WorkflowEngine(config);
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
        timeout_ms: 600000, // 10 分钟超时
        on_complete: 'process_dependency_output',
        on_error: 'handle_dependency_timeout',
      },
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
