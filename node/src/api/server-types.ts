/**
 * EKET Server Types
 *
 * Shared type definitions for the EKET Protocol HTTP server.
 */

export interface EketServerConfig {
  port: number;
  host: string;
  jwtSecret: string;
  projectRoot: string;
  enableWebSocket?: boolean;
  heartbeatInterval?: number; // seconds
  heartbeatTimeout?: number; // seconds
}

export interface AgentRegistration {
  agent_type: 'claude_code' | 'openclaw' | 'cursor' | 'windsurf' | 'gemini' | 'custom';
  agent_version?: string;
  role: 'master' | 'slaver';
  specialty?: 'frontend' | 'backend' | 'fullstack' | 'qa' | 'devops' | 'designer' | 'general';
  capabilities?: string[];
  metadata?: {
    user?: string;
    machine?: string;
    timezone?: string;
  };
  protocol_version?: string;
}

export interface AgentDetails {
  instance_id: string;
  agent_type: string;
  role: string;
  specialty?: string;
  status: 'active' | 'idle' | 'stale';
  current_task?: string;
  registered_at: string;
  last_heartbeat: string;
}

export interface Task {
  id: string;
  title: string;
  type: 'feature' | 'bugfix' | 'task' | 'test' | 'doc' | 'refactor';
  priority: 'P0' | 'P1' | 'P2' | 'P3';
  status: 'backlog' | 'ready' | 'in_progress' | 'review' | 'done';
  assigned_to?: string;
  created_at: string;
  updated_at: string;
  description?: string;
  acceptance_criteria?: Array<{ description: string; completed: boolean }>;
  tags?: string[];
  estimate?: string;
}

export interface PRSubmission {
  instance_id: string;
  task_id: string;
  branch: string;
  description: string;
  test_status: 'passed' | 'failed' | 'skipped';
}

export interface PRReview {
  reviewer: string;
  status: 'approved' | 'changes_requested' | 'rejected';
  comments?: Array<{ file: string; line: number; comment: string }>;
  summary?: string;
}

export interface PRMerge {
  merger: string;
  target_branch: string;
  squash?: boolean;
}
