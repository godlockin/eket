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
  // 原有类型
  | 'pr_review_request'
  | 'task_claimed'
  | 'task_completed'
  | 'task_blocked'
  | 'notification'
  // 任务相关
  | 'task_assigned'
  | 'task_progress'
  | 'task_complete'
  // 协作相关
  | 'help_request'
  | 'help_response'
  | 'knowledge_share'
  | 'dependency_notify'
  // 状态相关
  | 'status_change'
  | 'handover_request'
  | 'handover_complete';

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
  | 'reviewer'
  | 'business_analyst'
  | 'ux_designer'
  | 'security_expert'
  | 'data_scientist'
  | 'doc_monitor';

export type AgentMode = 'setup' | 'execution' | 'auto';

export interface AgentProfile {
  id: string;
  role: AgentRole;
  mode: AgentMode;
  capabilities: string[];
}

// ============================================================================
// Instance Types (Phase 4.1)
// ============================================================================

export interface Instance {
  id: string;
  type: 'human' | 'ai';
  agent_type: AgentRole;
  skills: string[];
  status: 'idle' | 'busy' | 'offline';
  currentTaskId?: string;
  currentLoad: number; // Number of active tasks
  lastHeartbeat?: number;
  metadata?: Record<string, unknown>;
  updatedAt?: number; // Added for compatibility
}

export interface InstanceRegistryConfig {
  redisPrefix?: string;
  heartbeatTimeout?: number; // milliseconds (default: 30000)
}

// ============================================================================
// Web Dashboard Types (Phase 5.1)
// ============================================================================

export interface DashboardSystemStatus {
  level: number; // 1-5 degradation level
  description: string;
  redisConnected: boolean;
  sqliteConnected: boolean;
  messageQueueConnected: boolean;
}

export interface DashboardInstance {
  id: string;
  type: 'human' | 'ai';
  agent_type: AgentRole;
  skills: string[];
  status: 'idle' | 'busy' | 'offline';
  currentTaskId?: string;
  currentLoad: number;
  lastHeartbeat?: number;
  updatedAt?: number;
}

export interface DashboardTask {
  id: string;
  title: string;
  priority: 'urgent' | 'high' | 'normal' | 'low';
  tags: string[];
  status: string;
  assignee?: string;
}

export interface DashboardStats {
  totalInstances: number;
  activeInstances: number;
  idleInstances: number;
  offlineInstances: number;
  totalTasks: number;
  inProgressTasks: number;
  completedTasksToday: number;
  successRate: number; // percentage
}

export interface DashboardData {
  systemStatus: DashboardSystemStatus;
  instances: DashboardInstance[];
  tasks: DashboardTask[];
  stats: DashboardStats;
  timestamp: number;
}

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
  assignee?: string; // Instance ID
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
// Skill Types (Phase 4.3)
// ============================================================================

export interface SkillDefinition {
  name: string;
  description: string;
  category: string;
  input_schema?: Record<string, unknown>;
  output_schema?: Record<string, unknown>;
  steps: SkillStep[];
}

export interface SkillStep {
  name: string;
  action: string;
  parameters?: Record<string, unknown>;
}

export interface SkillExecutionResult {
  success: boolean;
  output?: Record<string, unknown>;
  error?: string;
  duration: number; // milliseconds
}

// ============================================================================
// Error Types
// ============================================================================

/**
 * EKET 错误码
 */
export enum EketErrorCode {
  // 通用错误
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
  NOT_IMPLEMENTED = 'NOT_IMPLEMENTED',
  NOT_SUPPORTED = 'NOT_SUPPORTED',

  // Redis 相关
  REDIS_NOT_CONNECTED = 'REDIS_NOT_CONNECTED',
  REDIS_OPERATION_FAILED = 'REDIS_OPERATION_FAILED',

  // SQLite 相关
  SQLITE_NOT_CONNECTED = 'SQLITE_NOT_CONNECTED',
  SQLITE_OPERATION_FAILED = 'SQLITE_OPERATION_FAILED',

  // 任务相关
  TASK_NOT_FOUND = 'TASK_NOT_FOUND',
  TASK_ALREADY_CLAIMED = 'TASK_ALREADY_CLAIMED',
  TASK_CLAIM_FAILED = 'TASK_CLAIM_FAILED',

  // 票务相关
  TICKET_NOT_FOUND = 'TICKET_NOT_FOUND',
  TICKET_UPDATE_FAILED = 'TICKET_UPDATE_FAILED',

  // 依赖分析
  DEPENDENCY_ANALYSIS_FAILED = 'DEPENDENCY_ANALYSIS_FAILED',

  // 告警相关
  ALERT_RULE_NOT_FOUND = 'ALERT_RULE_NOT_FOUND',
  ALERT_RULE_DISABLED = 'ALERT_RULE_DISABLED',
  ALERT_IN_COOLDOWN = 'ALERT_IN_COOLDOWN',
  ALERT_NOT_FOUND = 'ALERT_NOT_FOUND',

  // 消息队列
  MESSAGE_QUEUE_ERROR = 'MESSAGE_QUEUE_ERROR',

  // 数据库
  DB_NOT_CONNECTED = 'DB_NOT_CONNECTED',

  // 知识条目
  ENTRY_CREATE_FAILED = 'ENTRY_CREATE_FAILED',
  ENTRY_FETCH_FAILED = 'ENTRY_FETCH_FAILED',
  ENTRY_QUERY_FAILED = 'ENTRY_QUERY_FAILED',
  ENTRY_UPDATE_FAILED = 'ENTRY_UPDATE_FAILED',
  ENTRY_DELETE_FAILED = 'ENTRY_DELETE_FAILED',
  ENTRY_NOT_FOUND = 'ENTRY_NOT_FOUND',

  // 工作流
  WORKFLOW_NOT_FOUND = 'WORKFLOW_NOT_FOUND',
  WORKFLOW_NOT_RUNNING = 'WORKFLOW_NOT_RUNNING',
  WORKFLOW_NOT_PAUSED = 'WORKFLOW_NOT_PAUSED',

  // 通信协议
  PROTOCOL_NOT_CONNECTED = 'PROTOCOL_NOT_CONNECTED',
  MESSAGE_SEND_FAILED = 'MESSAGE_SEND_FAILED',
  MESSAGE_SEND_ERROR = 'MESSAGE_SEND_ERROR',

  // 锁管理
  LOCK_QUEUED = 'LOCK_QUEUED',
  NOT_LOCK_HOLDER = 'NOT_LOCK_HOLDER',
  LOCK_RELEASE_FAILED = 'LOCK_RELEASE_FAILED',
  LOCK_STATUS_FAILED = 'LOCK_STATUS_FAILED',
  QUEUE_LENGTH_FAILED = 'QUEUE_LENGTH_FAILED',

  // 推荐系统
  RECOMMENDATION_FAILED = 'RECOMMENDATION_FAILED',

  // Phase 7 - 错误恢复
  CIRCUIT_OPEN = 'CIRCUIT_OPEN',
  MAX_RETRIES_EXCEEDED = 'MAX_RETRIES_EXCEEDED',
  EXECUTION_ERROR = 'EXECUTION_ERROR',

  // Phase 7 - 性能优化
  CACHE_MISS = 'CACHE_MISS',
  CACHE_PENETRATION = 'CACHE_PENETRATION',
  REDIS_POOL_EXHAUSTED = 'REDIS_POOL_EXHAUSTED',
  REDIS_POOL_INIT_FAILED = 'REDIS_POOL_INIT_FAILED',

  // Phase 7 - 文件队列优化
  DUPLICATE_MESSAGE = 'DUPLICATE_MESSAGE',
  FILE_LOCK_FAILED = 'FILE_LOCK_FAILED',
  CHECKSUM_MISMATCH = 'CHECKSUM_MISMATCH',
  FILE_CORRUPTED = 'FILE_CORRUPTED',

  // Phase 9.1 - 连接管理
  CONNECTION_FAILED = 'CONNECTION_FAILED',
  REMOTE_REDIS_NOT_CONFIGURED = 'REMOTE_REDIS_NOT_CONFIGURED',
  LOCAL_REDIS_NOT_CONFIGURED = 'LOCAL_REDIS_NOT_CONFIGURED',
  SQLITE_CONNECT_FAILED = 'SQLITE_CONNECT_FAILED',
  FILE_CONNECT_FAILED = 'FILE_CONNECT_FAILED',
  UPGRADE_FAILED = 'UPGRADE_FAILED',
  DOWNGRADE_FAILED = 'DOWNGRADE_FAILED',

  // Phase 9.1 - Master 选举
  ELECTION_FAILED = 'ELECTION_FAILED',
  MASTER_ALREADY_EXISTS = 'MASTER_ALREADY_EXISTS',
  CONFLICT_DETECTED = 'CONFLICT_DETECTED',
  LEASE_RENEWAL_FAILED = 'LEASE_RENEWAL_FAILED',
  NOT_MASTER = 'NOT_MASTER',
}

export interface EketError {
  code: string;
  message: string;
  context?: Record<string, unknown>;
  cause?: Error;
}

export class EketErrorClass extends Error {
  readonly code: string;
  readonly context?: Record<string, unknown>;

  constructor(code: string, message: string, context?: Record<string, unknown>) {
    super(message);
    this.code = code;
    this.context = context;
    this.name = 'EketError';

    // Capture stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, EketErrorClass);
    }
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

// ============================================================================
// Phase 6.1 - Multi-Instance Collaboration Types
// ============================================================================

/**
 * 冲突解决策略配置
 */
export interface ConflictResolutionConfig {
  // 任务冲突：多个 Instance claim 同一任务
  taskConflict: 'first_claim_wins' | 'role_priority' | 'manual';
  // 资源冲突：多个 Instance 访问同一资源
  resourceConflict: 'lock_queue' | 'read_write_lock';
  // 优先级冲突：任务优先级变化
  priorityConflict: 'master_decision' | 'auto_reassign';
}

/**
 * 工作流定义
 */
export interface WorkflowDefinition {
  id: string;
  name: string;
  description: string;
  steps: WorkflowStep[];
  triggers: WorkflowTrigger[];
}

export interface WorkflowStep {
  id: string;
  name: string;
  action: string;
  required_role?: AgentRole;
  timeout_ms?: number;
  on_complete?: string; // 下一步骤 ID
  on_error?: string;    // 错误处理步骤 ID
}

export interface WorkflowTrigger {
  type: 'message' | 'state_change' | 'schedule';
  condition: string;
  action: string;
}

/**
 * 工作流实例状态
 */
export interface WorkflowInstance {
  id: string;
  definitionId: string;
  status: 'running' | 'paused' | 'completed' | 'failed';
  currentStepId?: string;
  context: Record<string, unknown>;
  startedAt: number;
  updatedAt: number;
  completedAt?: number;
}

/**
 * 知识库条目
 */
export interface KnowledgeEntry {
  id: string;
  type: 'artifact' | 'pattern' | 'decision' | 'lesson' | 'api' | 'config';
  title: string;
  description: string;
  content: string;
  tags: string[];
  createdBy: string; // Instance ID
  createdAt: number;
  updatedAt: number;
  relatedTickets?: string[];
  metadata?: Record<string, unknown>;
}

/**
 * 资源锁信息
 */
export interface ResourceLock {
  resourceId: string;
  lockedBy: string; // Instance ID
  lockedAt: number;
  expiresAt: number;
  purpose: string;
}

/**
 * 协作消息负载类型
 */
export interface CollaborationPayload {
  // 任务相关
  taskId?: string;
  ticketId?: string;
  // 协作相关
  requestorId?: string;
  responderId?: string;
  // 依赖相关
  dependencyType?: 'output' | 'resource' | 'approval';
  // 交接相关
  handoverContext?: Record<string, unknown>;
  // 进度相关
  progress?: number; // 0-100
  statusMessage?: string;
}

/**
 * 通信协议配置
 */
export interface CommunicationProtocolConfig {
  instanceId: string;
  defaultPriority: MessagePriority;
  messageTTL_ms?: number;
  maxRetries?: number;
}

// ============================================================================
// Phase 5.2 - Recommender Types (re-export from recommender.ts)
// ============================================================================

export type {
  Recommendation,
  RecommenderConfig,
  TaskHistory,
  InstancePerformance,
  SkillMatchResult,
  InstanceWorkload,
  RecommendationRequest,
  RecommendationResponse,
} from './recommender.js';

// ============================================================================
// Phase 9.1 - Connection Manager Types
// ============================================================================

/**
 * 连接级别
 */
export type ConnectionLevel = 'remote_redis' | 'local_redis' | 'sqlite' | 'file';

/**
 * 驱动模式
 */
export type DriverMode = 'js' | 'shell';

/**
 * 连接管理器配置
 */
export interface ConnectionManagerConfig {
  // Redis 配置
  remoteRedis?: {
    host: string;
    port: number;
    password?: string;
    db?: number;
  };
  localRedis?: {
    host: string;
    port: number;
  };
  // SQLite 配置
  sqlitePath?: string;
  // 文件队列配置
  fileQueueDir?: string;
  // 驱动模式
  driverMode?: DriverMode;
}

/**
 * 连接统计信息
 */
export interface ConnectionStats {
  currentLevel: ConnectionLevel;
  driverMode: DriverMode;
  remoteRedisAvailable: boolean;
  localRedisAvailable: boolean;
  sqliteAvailable: boolean;
  fileAvailable: boolean;
  lastFallbackTime?: number;
  fallbackCount: number;
}

// ============================================================================
// Phase 9.1 - Master Election Types
// ============================================================================

/**
 * 选举级别
 */
export type ElectionLevel = 'redis' | 'sqlite' | 'file';

/**
 * Master 选举配置
 */
export interface MasterElectionConfig {
  // Redis 配置
  redis?: {
    host: string;
    port: number;
    password?: string;
  };
  // SQLite 配置
  sqlitePath?: string;
  // 文件配置
  projectRoot: string;
  // 选举超时（毫秒）
  electionTimeout?: number;
  // 声明等待期（毫秒）
  declarationPeriod?: number;
  // Master 租约时间（毫秒）
  leaseTime?: number;
}

/**
 * Master 选举结果
 */
export interface MasterElectionResult {
  isMaster: boolean;
  electionLevel: ElectionLevel;
  masterId?: string;
  conflictDetected: boolean;
}
