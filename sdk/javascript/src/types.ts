/**
 * EKET Protocol TypeScript Type Definitions
 *
 * Complete type definitions for EKET Protocol v1.0.0
 *
 * @module types
 */

// ============================================================================
// Client Configuration
// ============================================================================

/**
 * EKET Client configuration
 */
export interface EketClientConfig {
  /** Base URL of EKET server (e.g., http://localhost:8080) */
  serverUrl: string;
  /** JWT authentication token (optional for registration) */
  jwtToken?: string;
  /** Request timeout in milliseconds */
  timeout?: number;
  /** Enable WebSocket for real-time messaging */
  enableWebSocket?: boolean;
}

// ============================================================================
// Agent Types
// ============================================================================

/**
 * Supported AI agent types
 */
export type AgentType =
  | 'claude_code'
  | 'openclaw'
  | 'cursor'
  | 'windsurf'
  | 'gemini'
  | 'custom';

/**
 * Agent roles in collaboration
 */
export type AgentRole = 'master' | 'slaver';

/**
 * Agent specialty areas
 */
export type AgentSpecialty =
  | 'frontend'
  | 'backend'
  | 'fullstack'
  | 'qa'
  | 'devops'
  | 'designer'
  | 'general';

/**
 * Agent status
 */
export type AgentStatus = 'active' | 'idle' | 'stale';

/**
 * Agent registration request
 */
export interface AgentRegistration {
  /** Type of AI agent */
  agent_type: AgentType;
  /** Agent version (semver format) */
  agent_version?: string;
  /** Agent role */
  role: AgentRole;
  /** Agent specialty area */
  specialty?: AgentSpecialty;
  /** Agent capabilities (e.g., ['react', 'typescript', 'python']) */
  capabilities?: string[];
  /** Additional metadata */
  metadata?: {
    user?: string;
    machine?: string;
    timezone?: string;
    [key: string]: unknown;
  };
  /** Protocol version (default: "1.0.0") */
  protocol_version?: string;
}

/**
 * Agent registration response
 */
export interface AgentRegistrationResponse {
  /** Registration successful */
  success: true;
  /** Unique instance ID */
  instance_id: string;
  /** Server HTTP URL */
  server_url: string;
  /** WebSocket URL (if enabled) */
  websocket_url?: string;
  /** Heartbeat interval in seconds */
  heartbeat_interval: number;
  /** JWT authentication token */
  token: string;
}

/**
 * Agent details
 */
export interface Agent {
  /** Unique instance ID */
  instance_id: string;
  /** Agent type */
  agent_type: AgentType;
  /** Agent role */
  role: AgentRole;
  /** Agent specialty */
  specialty?: AgentSpecialty;
  /** Current status */
  status: AgentStatus;
  /** Current task being worked on */
  current_task?: string;
  /** Registration timestamp (ISO 8601) */
  registered_at: string;
  /** Last heartbeat timestamp (ISO 8601) */
  last_heartbeat: string;
}

/**
 * Agent filters for listing
 */
export interface AgentFilters {
  /** Filter by role */
  role?: AgentRole;
  /** Filter by status */
  status?: AgentStatus;
}

/**
 * Heartbeat parameters
 */
export interface HeartbeatParams {
  /** Current status */
  status?: 'active' | 'idle' | 'busy';
  /** Current task ID */
  current_task?: string;
  /** Task progress (0.0 - 1.0) */
  progress?: number;
}

/**
 * Heartbeat response
 */
export interface HeartbeatResponse {
  /** Request successful */
  success: boolean;
  /** Server time (ISO 8601) */
  server_time: string;
  /** Pending messages for this agent */
  messages: Message[];
}

// ============================================================================
// Task Types
// ============================================================================

/**
 * Task types
 */
export type TaskType =
  | 'feature'
  | 'bugfix'
  | 'task'
  | 'test'
  | 'doc'
  | 'refactor';

/**
 * Task priorities
 */
export type TaskPriority = 'P0' | 'P1' | 'P2' | 'P3';

/**
 * Task status
 */
export type TaskStatus =
  | 'backlog'
  | 'ready'
  | 'in_progress'
  | 'review'
  | 'done';

/**
 * Acceptance criterion
 */
export interface AcceptanceCriterion {
  /** Criterion description */
  description: string;
  /** Whether completed */
  completed: boolean;
}

/**
 * Task details
 */
export interface Task {
  /** Task ID (e.g., FEAT-001) */
  id: string;
  /** Task title */
  title: string;
  /** Task type */
  type: TaskType;
  /** Priority level */
  priority: TaskPriority;
  /** Current status */
  status: TaskStatus;
  /** Assigned agent instance ID */
  assigned_to?: string;
  /** Creation timestamp (ISO 8601) */
  created_at: string;
  /** Last update timestamp (ISO 8601) */
  updated_at: string;
  /** Detailed description */
  description?: string;
  /** Acceptance criteria */
  acceptance_criteria?: AcceptanceCriterion[];
  /** Tags */
  tags?: string[];
  /** Time estimate (e.g., "8h", "2d") */
  estimate?: string;
}

/**
 * Task filters for listing
 */
export interface TaskFilters {
  /** Filter by status */
  status?: TaskStatus;
  /** Filter by assignee */
  assigned_to?: string;
  /** Filter by specialty */
  specialty?: string;
  /** Filter by tags (comma-separated) */
  tags?: string;
}

/**
 * Task update parameters
 */
export interface TaskUpdate {
  /** New status */
  status?: TaskStatus;
  /** Progress (0.0 - 1.0) */
  progress?: number;
  /** Update notes */
  notes?: string;
}

// ============================================================================
// Message Types
// ============================================================================

/**
 * Message types
 */
export type MessageType =
  | 'pr_review_request'
  | 'task_claimed'
  | 'help_request'
  | 'status_update'
  | 'task_assigned'
  | 'pr_approved'
  | 'pr_rejected'
  | 'blocker_alert';

/**
 * Message priority
 */
export type MessagePriority = 'low' | 'normal' | 'high' | 'critical';

/**
 * Message structure
 */
export interface Message {
  /** Unique message ID */
  id?: string;
  /** Sender instance ID */
  from: string;
  /** Recipient instance ID */
  to: string;
  /** Message type */
  type: MessageType;
  /** Message priority */
  priority?: MessagePriority;
  /** Timestamp (ISO 8601) */
  timestamp?: string;
  /** Type-specific payload */
  payload: Record<string, unknown>;
  /** Correlation ID for replies */
  correlation_id?: string;
  /** Time-to-live in seconds */
  ttl?: number;
}

/**
 * Parameters for sending a message
 */
export interface SendMessageParams {
  /** Sender instance ID */
  from: string;
  /** Recipient instance ID (or "master") */
  to: string;
  /** Message type */
  type: MessageType;
  /** Message payload */
  payload: Record<string, unknown>;
  /** Message priority */
  priority?: MessagePriority;
  /** Correlation ID */
  correlation_id?: string;
  /** TTL in seconds */
  ttl?: number;
}

/**
 * Options for getting messages
 */
export interface GetMessagesOptions {
  /** Unix timestamp to get messages since */
  since?: number;
  /** Maximum number of messages to retrieve */
  limit?: number;
}

// ============================================================================
// PR Types
// ============================================================================

/**
 * Test status for PR
 */
export type TestStatus = 'passed' | 'failed' | 'skipped';

/**
 * PR review status
 */
export type ReviewStatus = 'approved' | 'changes_requested' | 'rejected';

/**
 * PR submission parameters
 */
export interface SubmitPRParams {
  /** Submitter instance ID */
  instance_id: string;
  /** Associated task ID */
  task_id: string;
  /** Source branch name */
  branch: string;
  /** PR description */
  description: string;
  /** Test execution status */
  test_status: TestStatus;
}

/**
 * PR review comment
 */
export interface PRComment {
  /** File path */
  file: string;
  /** Line number */
  line: number;
  /** Comment text */
  comment: string;
}

/**
 * PR review
 */
export interface PRReview {
  /** Reviewer instance ID */
  reviewer: string;
  /** Review status */
  status: ReviewStatus;
  /** Review comments */
  comments?: PRComment[];
  /** Review summary */
  summary?: string;
}

/**
 * PR merge parameters
 */
export interface MergePRParams {
  /** Merger instance ID */
  merger: string;
  /** Target branch (e.g., "main") */
  target_branch: string;
  /** Whether to squash commits */
  squash?: boolean;
}

/**
 * PR merge result
 */
export interface MergeResult {
  /** Merge successful */
  success: boolean;
  /** Merge commit SHA */
  merge_commit: string;
  /** Merge timestamp (ISO 8601) */
  merged_at: string;
}

// ============================================================================
// API Response Types
// ============================================================================

/**
 * Success response wrapper
 */
export interface SuccessResponse<T> {
  /** Always true for success */
  success: true;
  /** Response data */
  data?: T;
}

/**
 * Error response wrapper
 */
export interface ErrorResponse {
  /** Always false for error */
  success: false;
  /** Error details */
  error: {
    /** Error code */
    code: string;
    /** Error message */
    message: string;
    /** Additional details */
    details?: Record<string, unknown>;
  };
}

/**
 * Generic API response
 */
export type ApiResponse<T> = SuccessResponse<T> | ErrorResponse;

// ============================================================================
// WebSocket Types
// ============================================================================

/**
 * WebSocket message types
 */
export type WSMessageType = 'message' | 'ping' | 'pong' | 'error';

/**
 * WebSocket message
 */
export interface WSMessage {
  /** Message type */
  type: WSMessageType;
  /** Message data */
  data?: unknown;
  /** Timestamp */
  timestamp?: string;
}

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Health check response
 */
export interface HealthResponse {
  /** Health status */
  status: 'ok' | 'degraded' | 'down';
  /** Server version */
  version: string;
  /** Server uptime in seconds */
  uptime: number;
}
