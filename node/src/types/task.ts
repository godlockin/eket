/**
 * EKET Framework - Task Types
 */

import type { AgentRole } from './common.js';

// ============================================================================
// Task Types (Phase 4.3)
// ============================================================================

export interface Ticket {
  id: string;
  title: string;
  description?: string;
  priority: 'urgent' | 'high' | 'normal' | 'low';
  tags: string[];
  status: string;
  required_role?: AgentRole;
  assignee?: string;
  created_at?: number;
  updated_at?: number;
}

export interface TaskAssignment {
  ticketId: string;
  instanceId: string;
  assignedAt: number;
  status: 'assigned' | 'accepted' | 'in_progress' | 'completed' | 'failed';
}

// ============================================================================
// SSE Task Event Types (TASK-109)
// ============================================================================

export type TaskEventType =
  | 'task_started'
  | 'task_running'
  | 'task_completed'
  | 'task_failed'
  | 'task_timed_out';

export interface TaskEvent {
  type: TaskEventType;
  ticketId: string;
  slaverId: string;
  timestamp: string;
  payload?: Record<string, unknown>;
}

/**
 * Task Message — 结构化存储 Slaver 执行过程中的 LLM 消息
 */
export interface TaskMessage {
  id?: number;
  task_id: string;
  seq: number;
  type: 'text' | 'tool_use' | 'tool_result' | 'thinking' | 'error';
  tool?: string | null;
  content?: string | null;
  input_json?: string | null;
  output?: string | null;
  created_at?: string;
}

/**
 * Task Envelope — Master 派发任务时附带的完整上下文
 */
export interface TaskEnvelope {
  ticketId: string;
  mode: 'default' | 'ultrawork' | 'debug';
  requiredSkills: string[];
  contextSnapshot?: string;
  dispatchedAt: number;
}

// ============================================================================
// TaskCheckpoint Types (TASK-199)
// ============================================================================

export interface CheckpointItem {
  role: 'user' | 'assistant' | 'tool_result';
  content: string;
  toolCallId?: string;
  toolName?: string;
  timestamp?: number;
}

export interface TaskCheckpoint {
  taskId: string;
  stepIndex: number;
  agentFacingItems: CheckpointItem[];
  fullHistoryItems: CheckpointItem[];
  executedToolCalls: string[];
  version: number;
  createdAt: number;
  updatedAt: number;
}

export interface TaskCheckpointRow {
  task_id: string;
  data: string;
  version: number;
  updated_at: number;
}
