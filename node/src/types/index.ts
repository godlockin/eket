/**
 * EKET Framework - Core Types
 * Version: 0.7.0
 */

// ============================================================================
// Job Types
// ============================================================================

export interface Job {
  id: string;
  status: JobStatus;
  action: string;
  data: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: string;
  createdAt: number;
  updatedAt: number;
}

export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed';

// ============================================================================
// Redis Types
// ============================================================================

export interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  db?: number;
  keyPrefix?: string;
}

export interface SlaverHeartbeat {
  slaverId: string;
  timestamp: number;
  status: 'active' | 'busy' | 'offline';
  currentTaskId?: string;
}

// ============================================================================
// SQLite Types
// ============================================================================

export interface Retrospective {
  id: number;
  sprintId: string;
  fileName: string;
  title: string;
  date: string;
  createdAt: string;
  updatedAt: string;
}

export interface RetroContent {
  id: number;
  retroId: number;
  category: string;
  content: string;
  voteCount: number;
  createdBy?: string;
}

export interface RetroTag {
  id: number;
  retroId: number;
  tag: string;
}

// ============================================================================
// Message Queue Types
// ============================================================================

export interface Message {
  id: string;
  timestamp: string;
  from: string;
  to: string;
  type: MessageType;
  priority: MessagePriority;
  payload: Record<string, unknown>;
}

export type MessageType =
  | 'pr_review_request'
  | 'task_claimed'
  | 'task_completed'
  | 'task_blocked'
  | 'notification';

export type MessagePriority = 'low' | 'normal' | 'high' | 'urgent';

// ============================================================================
// CLI Types
// ============================================================================

export interface CLICommand {
  name: string;
  description: string;
  handler: (args: Record<string, unknown>) => Promise<void>;
  options?: CLIOption[];
}

export interface CLIOption {
  flags: string;
  description: string;
  required?: boolean;
  defaultValue?: unknown;
}

export interface CLIConfig {
  name: string;
  version: string;
  description: string;
  commands: CLICommand[];
}

// ============================================================================
// Agent Types
// ============================================================================

export type AgentRole =
  | 'product_manager'
  | 'architect'
  | 'frontend_dev'
  | 'backend_dev'
  | 'qa_engineer'
  | 'devops_engineer'
  | 'reviewer';

export type AgentMode = 'setup' | 'execution' | 'auto';

export interface AgentProfile {
  id: string;
  role: AgentRole;
  mode: AgentMode;
  capabilities: string[];
}

// ============================================================================
// Error Types
// ============================================================================

export interface EketError {
  code: string;
  message: string;
  context?: Record<string, unknown>;
  cause?: Error;
}

export class EketErrorClass extends Error {
  code: string;
  context?: Record<string, unknown>;

  constructor(code: string, message: string, context?: Record<string, unknown>) {
    super(message);
    this.code = code;
    this.context = context;
    this.name = 'EketError';
  }
}

// 导出别名方便使用
export const EketError = EketErrorClass;

// ============================================================================
// Utility Types
// ============================================================================

export type Result<T, E = EketErrorClass> =
  | { success: true; data: T }
  | { success: false; error: E };

export type AsyncResult<T, E = EketErrorClass> = Promise<Result<T, E>>;
