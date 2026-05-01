/**
 * EKET Framework - Common/Base Types
 */

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
  REDIS_ELECTION_FAILED = 'REDIS_ELECTION_FAILED',
  SQLITE_ELECTION_FAILED = 'SQLITE_ELECTION_FAILED',
  FILE_ELECTION_FAILED = 'FILE_ELECTION_FAILED',
  CREATE_MASTER_MARKER_FAILED = 'CREATE_MASTER_MARKER_FAILED',
  MASTER_ALREADY_EXISTS = 'MASTER_ALREADY_EXISTS',
  CONFLICT_DETECTED = 'CONFLICT_DETECTED',
  LEASE_RENEWAL_FAILED = 'LEASE_RENEWAL_FAILED',
  NOT_MASTER = 'NOT_MASTER',
  BACKUP_REGISTRATION_FAILED = 'BACKUP_REGISTRATION_FAILED',

  // Master Context
  MASTER_CONTEXT_SAVE_FAILED = 'MASTER_CONTEXT_SAVE_FAILED',
  MASTER_CONTEXT_LOAD_FAILED = 'MASTER_CONTEXT_LOAD_FAILED',
  MASTER_CONTEXT_NOT_FOUND = 'MASTER_CONTEXT_NOT_FOUND',
  MASTER_CONTEXT_FILE_NOT_FOUND = 'MASTER_CONTEXT_FILE_NOT_FOUND',
  PENDING_JUDGMENT_NOT_FOUND = 'PENDING_JUDGMENT_NOT_FOUND',
  REDIS_CONTEXT_NOT_FOUND = 'REDIS_CONTEXT_NOT_FOUND',
  REDIS_CLIENT_NOT_AVAILABLE = 'REDIS_CLIENT_NOT_AVAILABLE',
  REDIS_WRITE_FAILED = 'REDIS_WRITE_FAILED',
  REDIS_READ_FAILED = 'REDIS_READ_FAILED',
  FILE_WRITE_FAILED = 'FILE_WRITE_FAILED',
  FILE_READ_FAILED = 'FILE_READ_FAILED',

  // Redis 连接
  REDIS_CONNECTION_FAILED = 'REDIS_CONNECTION_FAILED',
  REDIS_PUBLISH_FAILED = 'REDIS_PUBLISH_FAILED',
  REDIS_FETCH_FAILED = 'REDIS_FETCH_FAILED',
  ALREADY_SUBSCRIBED = 'ALREADY_SUBSCRIBED',
  REDIS_NOT_CONFIGURED = 'REDIS_NOT_CONFIGURED',

  // SQLite 连接
  SQLITE_CONNECTION_FAILED = 'SQLITE_CONNECTION_FAILED',
  SQLITE_CLIENT_NOT_AVAILABLE = 'SQLITE_CLIENT_NOT_AVAILABLE',
  SQLITE_DBPATH_NOT_SET = 'SQLITE_DBPATH_NOT_SET',
  SQLITE_FETCH_FAILED = 'SQLITE_FETCH_FAILED',
  SQLITE_SEARCH_FAILED = 'SQLITE_SEARCH_FAILED',
  SQLITE_REPORT_FAILED = 'SQLITE_REPORT_FAILED',

  // 消息队列
  MQ_CONNECT_FAILED = 'MQ_CONNECT_FAILED',
  MQ_NOT_AVAILABLE = 'MQ_NOT_AVAILABLE',
  MQ_CONNECTION_FAILED = 'MQ_CONNECTION_FAILED',
  MQ_PUBLISH_FAILED = 'MQ_PUBLISH_FAILED',
  MESSAGE_QUEUE_OFFLINE = 'MESSAGE_QUEUE_OFFLINE',
  FILE_QUEUE_WRITE_FAILED = 'FILE_QUEUE_WRITE_FAILED',

  // WebSocket
  WEBSOCKET_ALREADY_CONNECTING = 'WEBSOCKET_ALREADY_CONNECTING',
  WEBSOCKET_CONNECTION_FAILED = 'WEBSOCKET_CONNECTION_FAILED',
  WEBSOCKET_NOT_CONNECTED = 'WEBSOCKET_NOT_CONNECTED',
  WEBSOCKET_SEND_FAILED = 'WEBSOCKET_SEND_FAILED',
  WEBSOCKET_NOT_AVAILABLE = 'WEBSOCKET_NOT_AVAILABLE',

  // Instance 管理
  INSTANCE_NOT_FOUND = 'INSTANCE_NOT_FOUND',
  INSTANCE_FETCH_FAILED = 'INSTANCE_FETCH_FAILED',
  INSTANCE_LIST_FAILED = 'INSTANCE_LIST_FAILED',
  INSTANCE_START_FAILED = 'INSTANCE_START_FAILED',
  INSTANCE_START_ERROR = 'INSTANCE_START_ERROR',

  // 推荐系统
  RECOMMENDER_INIT_FAILED = 'RECOMMENDER_INIT_FAILED',
  RECOMMENDER_NOT_INITIALIZED = 'RECOMMENDER_NOT_INITIALIZED',

  // 冲突/锁
  LOCK_ACQUISITION_FAILED = 'LOCK_ACQUISITION_FAILED',

  // 知识库
  STATS_FETCH_FAILED = 'STATS_FETCH_FAILED',

  // 文件队列
  QUEUE_ERROR = 'QUEUE_ERROR',
  DATA_CORRUPTED = 'DATA_CORRUPTED',

  // Skill 系统
  SKILL_NOT_FOUND = 'SKILL_NOT_FOUND',
  INVALID_SKILL_FORMAT = 'INVALID_SKILL_FORMAT',
  SKILL_LOAD_FAILED = 'SKILL_LOAD_FAILED',
  SKILL_TIMEOUT = 'SKILL_TIMEOUT',
  INVALID_INPUT = 'INVALID_INPUT',
  INVALID_SKILL = 'INVALID_SKILL',
  SKILL_ALREADY_REGISTERED = 'SKILL_ALREADY_REGISTERED',

  // 分片
  SHARD_ALREADY_EXISTS = 'SHARD_ALREADY_EXISTS',

  // 依赖注入
  DI_SERVICE_NOT_FOUND = 'DI_SERVICE_NOT_FOUND',
  DI_CIRCULAR_DEPENDENCY = 'DI_CIRCULAR_DEPENDENCY',
  DI_FACTORY_REQUIRED = 'DI_FACTORY_REQUIRED',
  DI_RESOLUTION_FAILED = 'DI_RESOLUTION_FAILED',

  // 事件总线
  EVENT_BUS_MAX_LISTENERS_EXCEEDED = 'EVENT_BUS_MAX_LISTENERS_EXCEEDED',

  // Agent Mailbox
  MAILBOX_WRITE_FAILED = 'MAILBOX_WRITE_FAILED',
  MAILBOX_MARK_READ_FAILED = 'MAILBOX_MARK_READ_FAILED',
  MAILBOX_CLEAR_FAILED = 'MAILBOX_CLEAR_FAILED',

  // Master 选举扩展
  WARM_STANDBY_NOT_ENABLED = 'WARM_STANDBY_NOT_ENABLED',
  NOT_BACKUP = 'NOT_BACKUP',
  MASTER_STILL_ALIVE = 'MASTER_STILL_ALIVE',

  // Git 操作
  GIT_BRANCH_FAILED = 'GIT_BRANCH_FAILED',
  GIT_PUSH_FAILED = 'GIT_PUSH_FAILED',
  URL_PARSE_ERROR = 'URL_PARSE_ERROR',
  UNSUPPORTED_PLATFORM = 'UNSUPPORTED_PLATFORM',
  PR_CREATE_FAILED = 'PR_CREATE_FAILED',

  // 配置
  CONFIG_ERROR = 'CONFIG_ERROR',
  CONFIG_VALIDATION_FAILED = 'CONFIG_VALIDATION_FAILED',
  CONFIG_NOT_FOUND = 'CONFIG_NOT_FOUND',
  PROJECT_NOT_FOUND = 'PROJECT_NOT_FOUND',
  MODULES_NOT_INSTALLED = 'MODULES_NOT_INSTALLED',
  INIT_FAILED = 'INIT_FAILED',
  MISSING_ROLE = 'MISSING_ROLE',
  MISSING_API_KEY = 'MISSING_API_KEY',

  // Web 服务器
  SERVER_START_FAILED = 'SERVER_START_FAILED',
  DASHBOARD_START_FAILED = 'DASHBOARD_START_FAILED',
  HOOK_SERVER_START_FAILED = 'HOOK_SERVER_START_FAILED',
  GATEWAY_START_FAILED = 'GATEWAY_START_FAILED',
  POOL_START_FAILED = 'POOL_START_FAILED',
  AGENT_SELECTION_FAILED = 'AGENT_SELECTION_FAILED',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  UNAUTHORIZED = 'UNAUTHORIZED',
  INTERNAL_ERROR = 'INTERNAL_ERROR',

  // Hook 管道 (TASK-035)
  HOOK_BLOCKED = 'HOOK_BLOCKED',

  // 消息验证 (TASK-042)
  INVALID_MESSAGE = 'INVALID_MESSAGE',
  FILE_READ_ERROR = 'FILE_READ_ERROR',
}

export interface EketErrorShape {
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

/**
 * Type guard to check if an error is an EketError
 */
export function isEketError(error: unknown): error is EketErrorClass {
  return error instanceof EketErrorClass;
}

// ============================================================================
// Utility Types
// ============================================================================

export type Result<T, E = EketErrorClass> =
  | { success: true; data: T }
  | { success: false; error: E };

export type AsyncResult<T, E = EketErrorClass> = Promise<Result<T, E>>;

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
// Redis Types
// ============================================================================

export interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  db?: number;
  keyPrefix?: string;
}

export interface SlaverCapacity {
  maxConcurrent: number;
  current: number;
}

export interface SlaverHeartbeat {
  slaverId: string;
  timestamp: number;
  status: 'idle' | 'busy' | 'draining' | 'offline';
  capabilities: string[];
  capacity: SlaverCapacity;
  currentTaskId?: string;
  lastTaskCompletedAt?: number;
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
  | 'notification'
  | 'task_assigned'
  | 'task_progress'
  | 'task_complete'
  | 'help_request'
  | 'help_response'
  | 'knowledge_share'
  | 'dependency_notify'
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
// Knowledge Proof Types (TASK-209)
// ============================================================================

export interface KnowledgeProof {
  task_id: string;
  exit_code: 0;
  timestamp: string;
  tool_name?: string;
  ci_url?: string;
}

export interface KnowledgeValidationError {
  field: string;
  message: string;
  received?: unknown;
}

export interface KnowledgeValidationResult {
  valid: boolean;
  errors: KnowledgeValidationError[];
}

export interface KnowledgeIndexEntry {
  content: string;
  proof: KnowledgeProof;
  tags?: string[];
}

// ============================================================================
// Phase 6.1 - Multi-Instance Collaboration Types
// ============================================================================

export interface ConflictResolutionConfig {
  taskConflict: 'first_claim_wins' | 'role_priority' | 'manual';
  resourceConflict: 'lock_queue' | 'read_write_lock';
  priorityConflict: 'master_decision' | 'auto_reassign';
}

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
  on_complete?: string;
  on_error?: string;
}

export interface WorkflowTrigger {
  type: 'message' | 'state_change' | 'schedule';
  condition: string;
  action: string;
}

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

export interface KnowledgeEntry {
  id: string;
  type: 'artifact' | 'pattern' | 'decision' | 'lesson' | 'api' | 'config';
  title: string;
  description: string;
  content: string;
  tags: string[];
  createdBy: string;
  createdAt: number;
  updatedAt: number;
  relatedTickets?: string[];
  metadata?: Record<string, unknown>;
  proof?: KnowledgeProof;
}

export interface ResourceLock {
  resourceId: string;
  lockedBy: string;
  lockedAt: number;
  expiresAt: number;
  purpose: string;
}

export interface CollaborationPayload {
  taskId?: string;
  ticketId?: string;
  requestorId?: string;
  responderId?: string;
  dependencyType?: 'output' | 'resource' | 'approval';
  handoverContext?: Record<string, unknown>;
  progress?: number;
  statusMessage?: string;
}

export interface CommunicationProtocolConfig {
  instanceId: string;
  defaultPriority: MessagePriority;
  messageTTL_ms?: number;
  maxRetries?: number;
}

// ============================================================================
// Phase 9.1 - Connection Manager Types
// ============================================================================

export type ConnectionLevel = 'remote_redis' | 'local_redis' | 'sqlite' | 'file';
export type DriverMode = 'js' | 'shell';

export interface ConnectionManagerConfig {
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
  sqlitePath?: string;
  fileQueueDir?: string;
  driverMode?: DriverMode;
}

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

export type ElectionLevel = 'redis' | 'sqlite' | 'file';

export interface MasterElectionConfig {
  redis?: {
    host: string;
    port: number;
    password?: string;
  };
  sqlitePath?: string;
  projectRoot: string;
  electionTimeout?: number;
  declarationPeriod?: number;
  leaseTime?: number;
}

export interface MasterElectionResult {
  isMaster: boolean;
  electionLevel: ElectionLevel;
  masterId?: string;
  conflictDetected: boolean;
}

// ============================================================================
// Phase 10 - Scalability Types
// ============================================================================

export interface RedisClusterNode {
  host: string;
  port: number;
}

export interface RedisClusterConfig {
  nodes: RedisClusterNode[];
  password?: string;
  db?: number;
  keyPrefix?: string;
  slotsRefreshTimeout?: number;
  retryDelayOnFail?: number;
}

export interface ConsistentHashConfig {
  replicas?: number;
  hashFunction?: 'murmur3' | 'sha1' | 'md5';
}

export interface MessageQueueShardingConfig {
  enabled: boolean;
  shardCount: number;
  consistentHash?: ConsistentHashConfig;
}

export interface BatchHeartbeatConfig {
  enabled: boolean;
  batchSize: number;
  flushInterval: number;
}

export interface DistributedRoundRobinConfig {
  enabled: boolean;
  ttl: number;
  keyPrefix?: string;
}

export interface ScalabilityConfig {
  cluster?: RedisClusterConfig;
  sharding?: MessageQueueShardingConfig;
  batchHeartbeat?: BatchHeartbeatConfig;
  roundRobin?: DistributedRoundRobinConfig;
}

// ============================================================================
// OpenCLAW Gateway Types
// ============================================================================

export interface GatewayConfig {
  enabled: boolean;
  port: number;
  host: string;
  apiKey: string;
  projectRoot: string;
}

export type OpenCLAWMode = 'managed' | 'autonomous';

export interface OpenCLAWConfig {
  enabled: boolean;
  mode: OpenCLAWMode;
  gateway: {
    port: number;
    host: string;
    auth: {
      type: string;
      keyEnv: string;
    };
  };
  messageQueue: {
    type: 'redis' | 'rabbitmq' | 'file';
    connection: {
      host: string;
      port: number;
    };
    channels: {
      taskAssignment: string;
      statusUpdate: string;
      agentLifecycle: string;
    };
  };
  agents: {
    autoSpawn: boolean;
    maxConcurrent: number;
    idleTimeout: number;
  };
  humanInLoop: {
    requirementsReview: boolean;
    techDesignApproval: boolean;
    prFinalSignoff: boolean;
  };
}

// ============================================================================
// Phase 10 - Dependency Injection Types
// ============================================================================

export type ServiceLifetime = 'singleton' | 'transient';

export interface ServiceDescriptor {
  lifetime: ServiceLifetime;
  factory?: () => unknown;
  instance?: unknown;
  dependencies?: string[];
}

// ============================================================================
// Phase 10 - Configuration Types
// ============================================================================

export type ConfigSource = 'env' | 'yaml' | 'default' | 'override';

export interface RedisConnectionConfig {
  host: string;
  port: number;
  password?: string;
  db?: number;
}

export interface SQLiteConnectionConfig {
  path: string;
}

// ============================================================================
// Phase 10 - Event Bus Types
// ============================================================================

export interface DomainEvent<T = unknown> {
  id: string;
  type: string;
  timestamp: number;
  source?: string;
  payload: T;
}

export type EventHandler<T = unknown> = (event: T) => void | Promise<void>;

export type EventInterceptor<T = unknown> = (
  event: T,
  next: () => void | Promise<void>
) => void | Promise<void>;

// ============================================================================
// Context Snapshot Types
// ============================================================================

export interface ContextSnapshot {
  id: string;
  ticketId: string;
  agentId: string;
  agentType: string;
  createdAt: number;
  whatSurprisedMe: string[];
  whatIWouldDoDifferently: string[];
  whatNextPersonNeedsToKnow: string[];
  implicitDependencies: string[];
  technicalPitfalls?: string[];
  keyDecisions?: string[];
  openQuestions?: string[];
}

export interface ContextSnapshotQuery {
  ticketId?: string;
  agentId?: string;
  keyword?: string;
  limit?: number;
  offset?: number;
}

// ============================================================================
// Knowledge Base Extended Types
// ============================================================================

export type ExtendedKnowledgeType =
  | 'artifact'
  | 'pattern'
  | 'decision'
  | 'lesson'
  | 'api'
  | 'config'
  | 'intuition'
  | 'warning';

export interface KnowledgeUsageGuidance {
  whenToConsult: string;
  howToVerifyUnderstanding?: string;
  requiredChecklist?: string[];
  expirationCondition?: string;
}

export interface ExtendedKnowledgeEntry {
  id: string;
  type: ExtendedKnowledgeType;
  title: string;
  description: string;
  content: string;
  tags: string[];
  createdBy: string;
  createdAt: number;
  updatedAt: number;
  relatedTickets: string[];
  metadata?: Record<string, unknown>;
  usageGuidance?: KnowledgeUsageGuidance;
  tacitLevel: 'explicit' | 'semi-tacit' | 'tacit';
}

// ============================================================================
// Workflow Judgment Point Types
// ============================================================================

export type JudgmentStatus = 'pending' | 'resolved' | 'escalated' | 'timed_out';

export interface WorkflowJudgmentRequest {
  id: string;
  workflowInstanceId: string;
  stepId: string;
  judgmentPrompt: string;
  context: Record<string, unknown>;
  options?: string[];
  fallbackOnTimeout: 'escalate_to_master' | 'skip' | 'fail_workflow';
  timeoutMs: number;
  createdAt: number;
  status: JudgmentStatus;
  resolution?: string;
  resolvedBy?: string;
  resolvedAt?: number;
}

// ============================================================================
// Hook Pipeline Types (TASK-035)
// ============================================================================

export interface HookResult {
  passed: boolean;
  errors: string[];
  ticketId: string;
  timestamp: string;
}

// ============================================================================
// Progress Report Types (TASK-039)
// ============================================================================

export interface SelfCheckItem {
  ruleId: string;
  description: string;
  passed: boolean;
  note?: string;
}

export interface ProgressReport {
  ticketId: string;
  slaverId: string;
  phase: 'analysis' | 'implement' | 'test' | 'pr';
  progress: number;
  statusMessage: string;
  timestamp: string;
  selfCheck: {
    rules: Array<{ id: string; desc: string }>;
    checklist: SelfCheckItem[];
    analysisParalysisFlag: boolean;
  };
}

// ============================================================================
// Handoff Types
// ============================================================================

export interface HandoffRequest {
  completedTicketId: string;
  slaverId: string;
  suggestedNextTicketId?: string;
  requestedAt: string;
  confirmed: boolean;
  confirmedAt?: string;
}

// ============================================================================
// Retrospective Types
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
// Web Dashboard Types (Phase 5.1)
// ============================================================================

export interface DashboardSystemStatus {
  level: number;
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
  successRate: number;
}

export interface DashboardData {
  systemStatus: DashboardSystemStatus;
  instances: DashboardInstance[];
  tasks: DashboardTask[];
  stats: DashboardStats;
  timestamp: number;
}
