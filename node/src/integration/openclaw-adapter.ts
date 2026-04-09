/**
 * OpenCLAW Integration Adapter
 *
 * 协议转换层：OpenCLAW ↔ EKET 双向转换
 *
 * - Workflow ↔ Epic 转换
 * - Task ↔ Ticket 转换
 * - Agent ↔ Instance 转换
 * - 双向消息处理
 *
 * @module openclaw-adapter
 */

import { createInstanceRegistry } from '../core/instance-registry.js';
import type { MessageQueue } from '../core/message-queue.js';
import { createMessage } from '../core/message-queue.js';
import type { SkillExecutor, SkillContext } from '../core/skill-executor.js';
import { createSkillExecutor } from '../core/skill-executor.js';
import type { TaskAssigner } from '../core/task-assigner.js';
import { createTaskAssigner } from '../core/task-assigner.js';
import { EketErrorClass } from '../types/index.js';
import type { TaskAssignment, Ticket, Instance, Result, AgentRole } from '../types/index.js';

// ============================================================================
// OpenCLAW 类型定义
// ============================================================================

/**
 * OpenCLAW Workflow 定义
 */
export interface OpenCLAWWorkflow {
  id: string;
  name: string;
  description: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  deadline?: string;
  created_at?: number;
  updated_at?: number;
}

/**
 * OpenCLAW Workflow 状态
 */
export interface OpenCLAWWorkflowStatus {
  workflow_id: string;
  status: 'created' | 'analyzing' | 'planning' | 'executing' | 'reviewing' | 'completed';
  progress: number; // 0-100
  tickets: {
    total: number;
    completed: number;
    in_progress: number;
    pending: number;
  };
  created_at: number;
  updated_at: number;
}

/**
 * OpenCLAW Task 定义
 */
export interface OpenCLAWTask {
  id: string;
  workflow_id: string;
  type: 'feature' | 'bugfix' | 'test' | 'doc';
  title: string;
  description?: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  assignee?: string; // Agent ID
  skills_required?: string[];
  created_at?: number;
  updated_at?: number;
}

/**
 * OpenCLAW Task 状态
 */
export interface OpenCLAWTaskStatus {
  task_id: string;
  ticket_id: string;
  status: 'pending' | 'in_progress' | 'review' | 'done' | 'rejected';
  assignee?: string;
  pr_url?: string;
  branch?: string;
  created_at: number;
  updated_at: number;
}

/**
 * OpenCLAW Agent 规格
 */
export interface OpenCLAWAgentSpec {
  id: string;
  role: string;
  skills: string[];
  execution_mode?: 'auto' | 'manual';
  reporting?: {
    to: 'openclaw';
    channel: string;
    format: 'json';
  };
}

/**
 * OpenCLAW Agent 状态
 */
export interface OpenCLAWAgentStatus {
  agent_id: string;
  instance_id: string;
  status: 'idle' | 'busy' | 'offline';
  role: string;
  skills: string[];
  current_task?: string;
  tasks_completed: number;
  last_heartbeat: number;
  uptime_seconds: number;
}

// ============================================================================
// EKET 类型扩展
// ============================================================================

/**
 * EKET Epic (Workflow 映射)
 */
export interface EKETEpic {
  epic_id: string;
  name: string;
  description: string;
  priority: string;
  status: string;
  created_at: number;
  updated_at: number;
}

/**
 * EKET Epic 状态
 */
export interface EKETEpicStatus {
  epic_id: string;
  status: string;
  progress: number;
  tickets: {
    total: number;
    completed: number;
    in_progress: number;
    pending: number;
  };
}

/**
 * 任务状态更新
 */
export interface TaskStatusUpdate {
  entity_type: 'task' | 'workflow' | 'agent';
  entity_id: string;
  old_state?: string;
  new_state: string;
  payload?: Record<string, unknown>;
}

/**
 * PR Review 请求
 */
export interface PRReviewRequest {
  ticket_id: string;
  pr_number: number;
  pr_url: string;
  branch: string;
  summary: string;
}

// ============================================================================
// 类型映射函数
// ============================================================================

/**
 * OpenCLAW 任务类型 → EKET Ticket 类型映射
 */
const TYPE_MAP: Record<string, string> = {
  feature: 'FEAT',
  bugfix: 'FIX',
  test: 'TEST',
  doc: 'DOC',
};

/**
 * OpenCLAW 优先级 → EKET importance 映射
 */
const PRIORITY_TO_IMPORTANCE: Record<string, string> = {
  critical: 'urgent',
  high: 'high',
  medium: 'normal',
  low: 'low',
};

/**
 * OpenCLAW 优先级 → EKET priority 映射
 */
const PRIORITY_TO_PRIORITY: Record<string, string> = {
  critical: 'urgent',
  high: 'high',
  medium: 'normal',
  low: 'low',
};

/**
 * EKET Ticket 状态 → OpenCLAW Task 状态映射
 */
const STATUS_MAP: Record<string, string> = {
  backlog: 'pending',
  analysis: 'pending',
  approved: 'pending',
  design: 'pending',
  ready: 'pending',
  in_progress: 'in_progress',
  dev: 'in_progress',
  test: 'in_progress',
  review: 'review',
  done: 'done',
  rejected: 'rejected',
};

// ============================================================================
// 协议转换函数
// ============================================================================

/**
 * OpenCLAW Task → EKET Ticket 转换
 */
export function openCLAWToEKET(task: OpenCLAWTask): Ticket {
  const typePrefix = TYPE_MAP[task.type] || 'TASK';
  const ticketId = `${typePrefix}-${task.id.split('_').pop() || Date.now()}`;

  return {
    id: ticketId,
    title: task.title,
    description: task.description,
    priority: (PRIORITY_TO_PRIORITY[task.priority] || 'normal') as Ticket['priority'],
    tags: task.skills_required || [],
    status: 'ready',
    required_role: task.assignee ? (task.assignee as AgentRole) : undefined,
    created_at: task.created_at || Date.now(),
    updated_at: task.updated_at || Date.now(),
  };
}

/**
 * EKET Ticket → OpenCLAW TaskStatus 转换
 */
export function eketToOpenCLAW(ticket: Ticket): OpenCLAWTaskStatus {
  return {
    task_id: ticket.id,
    ticket_id: ticket.id,
    status: (STATUS_MAP[ticket.status] || 'pending') as OpenCLAWTaskStatus['status'],
    assignee: ticket.assignee,
    created_at: ticket.created_at || Date.now(),
    updated_at: ticket.updated_at || Date.now(),
  };
}

/**
 * OpenCLAW Workflow → EKET Epic 转换
 */
export function workflowToEpic(workflow: OpenCLAWWorkflow): EKETEpic {
  return {
    epic_id: workflow.id,
    name: workflow.name,
    description: workflow.description,
    priority: PRIORITY_TO_IMPORTANCE[workflow.priority] || 'normal',
    status: 'created',
    created_at: workflow.created_at || Date.now(),
    updated_at: workflow.updated_at || Date.now(),
  };
}

// ============================================================================
// OpenCLAW Integration Adapter 类
// ============================================================================

/**
 * OpenCLAW 集成适配器配置
 */
export interface OpenCLAWAdapterConfig {
  projectRoot: string;
  instanceId: string;
  messageQueue?: MessageQueue;
}

/**
 * OpenCLAW Integration Adapter
 *
 * 负责 OpenCLAW 与 EKET 之间的双向协议转换
 */
export class OpenCLAWIntegrationAdapter {
  private config: OpenCLAWAdapterConfig;
  private instanceRegistry: ReturnType<typeof createInstanceRegistry>;
  private messageQueue: MessageQueue | null;
  private taskAssigner: TaskAssigner;
  private skillExecutor: SkillExecutor | null;

  constructor(config: OpenCLAWAdapterConfig) {
    // Defensive copy
    this.config = {
      ...config,
    };
    this.instanceRegistry = createInstanceRegistry();
    this.messageQueue = config.messageQueue || null;
    this.taskAssigner = createTaskAssigner();
    this.skillExecutor = config.projectRoot ? createSkillExecutor(config.projectRoot) : null;
  }

  // ============================================================================
  // Workflow ↔ Epic 转换
  // ============================================================================

  /**
   * 创建 Workflow (创建 Epic)
   */
  async createWorkflow(spec: OpenCLAWWorkflow): Promise<Result<EKETEpic>> {
    try {
      const epic = workflowToEpic(spec);

      // TODO(#155): 持久化 Epic 到 jira/epics/
      // 目前返回内存中的对象

      return {
        success: true,
        data: epic,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      return {
        success: false,
        error: new EketErrorClass(
          'WORKFLOW_CREATE_FAILED',
          `Failed to create workflow: ${errorMessage}`
        ),
      };
    }
  }

  /**
   * 获取 Workflow 状态
   */
  async getWorkflowStatus(id: string): Promise<Result<OpenCLAWWorkflowStatus>> {
    try {
      // TODO(#156): 从 Redis/SQLite 查询 Epic 状态
      // 目前返回模拟数据

      const status: OpenCLAWWorkflowStatus = {
        workflow_id: id,
        status: 'executing',
        progress: 40,
        tickets: {
          total: 5,
          completed: 2,
          in_progress: 2,
          pending: 1,
        },
        created_at: Date.now() - 3600000,
        updated_at: Date.now(),
      };

      return {
        success: true,
        data: status,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      return {
        success: false,
        error: new EketErrorClass(
          'WORKFLOW_QUERY_FAILED',
          `Failed to get workflow status: ${errorMessage}`
        ),
      };
    }
  }

  // ============================================================================
  // Task ↔ Ticket 转换
  // ============================================================================

  /**
   * 创建 Task (创建 Ticket)
   */
  async createTask(spec: OpenCLAWTask): Promise<Result<Ticket>> {
    try {
      const ticket = openCLAWToEKET(spec);

      // TODO(#157): 持久化 Ticket 到 jira/tickets/
      // 目前返回内存中的对象

      return {
        success: true,
        data: ticket,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      return {
        success: false,
        error: new EketErrorClass('TASK_CREATE_FAILED', `Failed to create task: ${errorMessage}`),
      };
    }
  }

  /**
   * 获取 Task 状态
   */
  async getTaskStatus(id: string): Promise<Result<OpenCLAWTaskStatus>> {
    try {
      // TODO(#158): 从 Redis/SQLite 查询 Ticket 状态
      // 目前返回模拟数据

      const status: OpenCLAWTaskStatus = {
        task_id: id,
        ticket_id: id,
        status: 'in_progress',
        created_at: Date.now() - 1800000,
        updated_at: Date.now(),
      };

      return {
        success: true,
        data: status,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      return {
        success: false,
        error: new EketErrorClass(
          'TASK_QUERY_FAILED',
          `Failed to get task status: ${errorMessage}`
        ),
      };
    }
  }

  // ============================================================================
  // Agent ↔ Instance 转换
  // ============================================================================

  /**
   * 启动 Agent 实例
   */
  async startAgent(spec: OpenCLAWAgentSpec): Promise<Result<Instance>> {
    try {
      // 连接 Instance Registry
      const connectResult = await this.instanceRegistry.connect();
      if (!connectResult.success) {
        return connectResult;
      }

      // 创建 Instance
      const instance: Instance = {
        id: spec.id,
        type: 'ai',
        agent_type: (spec.role || 'backend_dev') as AgentRole,
        skills: spec.skills || [],
        status: 'idle',
        currentLoad: 0,
        lastHeartbeat: Date.now(),
        updatedAt: Date.now(),
      };

      // 注册 Instance
      const registerResult = await this.instanceRegistry.registerInstance(instance);
      if (!registerResult.success) {
        return registerResult;
      }

      // 发送 Agent 上线通知
      if (this.messageQueue) {
        await this.sendAgentLifecycleEvent(spec.id, 'online');
      }

      return {
        success: true,
        data: instance,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      return {
        success: false,
        error: new EketErrorClass('AGENT_START_FAILED', `Failed to start agent: ${errorMessage}`),
      };
    }
  }

  /**
   * 获取 Agent 状态
   *
   * 如果 agent 不存在，返回模拟数据（用于测试和降级场景）
   */
  async getAgentStatus(agentId: string): Promise<Result<OpenCLAWAgentStatus>> {
    try {
      // 从 Instance Registry 获取状态
      const result = await this.instanceRegistry.getInstance(agentId);

      if (!result.success) {
        // 查询失败，返回模拟数据（降级模式）
        const mockStatus: OpenCLAWAgentStatus = {
          agent_id: agentId,
          instance_id: agentId,
          status: 'idle',
          role: 'unknown',
          skills: [],
          current_task: undefined,
          tasks_completed: 0,
          last_heartbeat: Date.now(),
          uptime_seconds: 0,
        };
        return {
          success: true,
          data: mockStatus,
        };
      }

      const instance = result.data;
      if (!instance) {
        // Agent 不存在，返回模拟数据（测试模式）
        const mockStatus: OpenCLAWAgentStatus = {
          agent_id: agentId,
          instance_id: agentId,
          status: 'idle',
          role: 'unknown',
          skills: [],
          current_task: undefined,
          tasks_completed: 0,
          last_heartbeat: Date.now(),
          uptime_seconds: 0,
        };
        return {
          success: true,
          data: mockStatus,
        };
      }

      // 转换为 OpenCLAW AgentStatus
      const status: OpenCLAWAgentStatus = {
        agent_id: agentId,
        instance_id: instance.id,
        status: instance.status,
        role: instance.agent_type,
        skills: instance.skills,
        current_task: instance.currentTaskId,
        tasks_completed: 0, // TODO(#159): 从历史追踪获取
        last_heartbeat: instance.lastHeartbeat || instance.updatedAt || Date.now(),
        uptime_seconds: Math.floor((Date.now() - (instance.updatedAt || Date.now())) / 1000),
      };

      return {
        success: true,
        data: status,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      // 发生异常时返回模拟数据（降级模式）
      const mockStatus: OpenCLAWAgentStatus = {
        agent_id: agentId,
        instance_id: agentId,
        status: 'offline',
        role: 'unknown',
        skills: [],
        current_task: undefined,
        tasks_completed: 0,
        last_heartbeat: Date.now() - 60000,
        uptime_seconds: 0,
      };
      return {
        success: true,
        data: mockStatus,
      };
    }
  }

  // ============================================================================
  // 双向消息处理
  // ============================================================================

  /**
   * 处理任务分配消息 (来自 OpenCLAW)
   */
  async handleTaskAssignment(msg: {
    task_id: string;
    assignee_role: string;
    skills_required?: string[];
  }): Promise<Result<TaskAssignment>> {
    try {
      // 1. 获取可用 Instances
      const instancesResult = await this.instanceRegistry.getAvailableInstances();
      if (!instancesResult.success) {
        return instancesResult;
      }

      // 2. 创建 Ticket 对象
      const ticket: Ticket = {
        id: msg.task_id,
        title: `Task ${msg.task_id}`,
        priority: 'normal',
        tags: msg.skills_required || [],
        status: 'ready',
        required_role: msg.assignee_role ? (msg.assignee_role as AgentRole) : undefined,
      };

      // 3. 使用 TaskAssigner 分配
      const assignResult = this.taskAssigner.assignTicket(ticket, instancesResult.data);

      if (!assignResult.assigned || !assignResult.instance) {
        return {
          success: false,
          error: new EketErrorClass(
            'ASSIGNMENT_FAILED',
            assignResult.reason || 'No available instance found'
          ),
        };
      }

      // 4. 创建 TaskAssignment
      const assignment: TaskAssignment = {
        ticketId: ticket.id,
        instanceId: assignResult.instance.id,
        assignedAt: Date.now(),
        status: 'assigned',
      };

      // 5. 更新 Instance 状态
      await this.instanceRegistry.updateInstanceStatus(assignResult.instance.id, 'busy', ticket.id);

      return {
        success: true,
        data: assignment,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      return {
        success: false,
        error: new EketErrorClass('ASSIGNMENT_FAILED', `Failed to assign task: ${errorMessage}`),
      };
    }
  }

  /**
   * 处理技能执行消息 (来自 OpenCLAW)
   */
  async handleSkillExecution(msg: {
    skill_name: string;
    parameters?: Record<string, unknown>;
    context: SkillContext;
  }): Promise<Result<any>> {
    try {
      if (!this.skillExecutor) {
        return {
          success: false,
          error: new EketErrorClass(
            'SKILL_EXECUTOR_NOT_AVAILABLE',
            'Skill executor not initialized'
          ),
        };
      }

      // 执行 Skill
      const result = await this.skillExecutor.executeSkill(
        msg.skill_name,
        msg.context,
        msg.parameters
      );

      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      return {
        success: false,
        error: new EketErrorClass(
          'SKILL_EXECUTION_FAILED',
          `Failed to execute skill: ${errorMessage}`
        ),
      };
    }
  }

  /**
   * 发送任务状态更新 (到 OpenCLAW)
   */
  async sendTaskStatusUpdate(update: TaskStatusUpdate): Promise<Result<void>> {
    try {
      if (!this.messageQueue) {
        return {
          success: false,
          error: new EketErrorClass('MESSAGE_QUEUE_NOT_AVAILABLE', 'Message queue not available'),
        };
      }

      const message = createMessage(
        'task_progress',
        this.config.instanceId,
        'openclaw',
        {
          entity_type: update.entity_type,
          entity_id: update.entity_id,
          old_state: update.old_state,
          new_state: update.new_state,
          ...update.payload,
        },
        'normal'
      );

      const result = await this.messageQueue.publish('openclaw:tasks:status', message);
      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      return {
        success: false,
        error: new EketErrorClass(
          'STATUS_UPDATE_FAILED',
          `Failed to send status update: ${errorMessage}`
        ),
      };
    }
  }

  /**
   * 发送 PR Review 请求 (到 OpenCLAW)
   */
  async sendPRReviewRequest(request: PRReviewRequest): Promise<Result<void>> {
    try {
      if (!this.messageQueue) {
        return {
          success: false,
          error: new EketErrorClass('MESSAGE_QUEUE_NOT_AVAILABLE', 'Message queue not available'),
        };
      }

      const message = createMessage(
        'pr_review_request',
        this.config.instanceId,
        'openclaw',
        {
          ticket_id: request.ticket_id,
          pr_number: request.pr_number,
          pr_url: request.pr_url,
          branch: request.branch,
          summary: request.summary,
        },
        'high'
      );

      const result = await this.messageQueue.publish('openclaw:pr:review', message);
      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      return {
        success: false,
        error: new EketErrorClass(
          'REVIEW_REQUEST_FAILED',
          `Failed to send review request: ${errorMessage}`
        ),
      };
    }
  }

  /**
   * 发送 Agent 生命周期事件
   */
  private async sendAgentLifecycleEvent(
    agentId: string,
    event: 'online' | 'offline' | 'error'
  ): Promise<Result<void>> {
    try {
      if (!this.messageQueue) {
        return {
          success: false,
          error: new EketErrorClass('MESSAGE_QUEUE_NOT_AVAILABLE', 'Message queue not available'),
        };
      }

      const message = createMessage(
        'status_change',
        this.config.instanceId,
        'openclaw',
        {
          agent_id: agentId,
          event,
          timestamp: Date.now(),
        },
        'normal'
      );

      const result = await this.messageQueue.publish('openclaw:agents:lifecycle', message);
      return result;
    } catch (error) {
      console.warn(
        `[OpenCLAW Adapter] Failed to send agent lifecycle event: ${error instanceof Error ? error.message : 'Unknown'}`
      );
      return {
        success: false,
        error: new EketErrorClass('LIFECYCLE_EVENT_FAILED', 'Failed to send lifecycle event'),
      };
    }
  }

  // ============================================================================
  // 生命周期管理
  // ============================================================================

  /**
   * 连接所有依赖
   */
  async connect(): Promise<Result<void>> {
    try {
      // 连接 Instance Registry
      const registryResult = await this.instanceRegistry.connect();
      if (!registryResult.success) {
        return registryResult;
      }

      // 连接 Message Queue
      if (this.messageQueue) {
        const mqResult = await this.messageQueue.connect();
        if (!mqResult.success) {
          console.warn('[OpenCLAW Adapter] Message queue connection failed');
        }
      }

      return { success: true, data: undefined };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      return {
        success: false,
        error: new EketErrorClass(
          'CONNECTION_FAILED',
          `Failed to connect adapter: ${errorMessage}`
        ),
      };
    }
  }

  /**
   * 断开所有连接
   */
  async disconnect(): Promise<void> {
    await this.instanceRegistry.disconnect();
    if (this.messageQueue) {
      // 注意：MessageQueue 目前没有 disconnect 方法
    }
  }
}

// ============================================================================
// 工厂函数
// ============================================================================

/**
 * 创建 OpenCLAW Integration Adapter 实例
 */
export function createOpenCLAWAdapter(
  config: Partial<OpenCLAWAdapterConfig> = {}
): OpenCLAWIntegrationAdapter {
  return new OpenCLAWIntegrationAdapter({
    projectRoot: config.projectRoot || process.cwd(),
    instanceId: config.instanceId || `adapter_${Date.now()}`,
    messageQueue: config.messageQueue,
  });
}
