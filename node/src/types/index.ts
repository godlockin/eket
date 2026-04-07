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

/**
 * SQLite 客户端统一接口
 * 两个实现：
 *   - SQLiteClient      (sqlite-client.ts)       同步实现，方法返回 Result<T>（不符合此接口）
 *   - AsyncSQLiteClient (sqlite-async-client.ts)  异步实现，方法返回 Promise<Result<T>>，implements 此接口
 *
 * 接口以异步签名为准（Promise<Result<T>>），以便上层代码面向接口编程。
 * SQLiteClient 因方法签名不同（同步）不能直接 implements，需要通过包装器转换。
 */
export interface ISQLiteClient {
  /** 连接数据库并初始化表 */
  connect(): Promise<Result<void>>;
  /** 关闭数据库连接 */
  close(): Promise<void>;
  /** 检查连接是否就绪 */
  isReady(): boolean;
  /** 执行 SQL 语句（DDL / DML，无返回行） */
  execute(sql: string, params?: unknown[]): Promise<Result<void>>;
  /** 查询单行数据 */
  get(sql: string, params?: unknown[]): Promise<Result<unknown>>;
  /** 查询多行数据 */
  all(sql: string, params?: unknown[]): Promise<Result<unknown[]>>;
  /** 插入 Retrospective */
  insertRetrospective(retro: {
    sprintId: string;
    fileName: string;
    title: string;
    date: string;
  }): Promise<Result<number>>;
  /** 查询单条 Retrospective */
  getRetrospective(sprintId: string): Promise<Result<unknown>>;
  /** 列出所有 Retrospective */
  listRetrospectives(): Promise<Result<unknown[]>>;
  /** 插入 Retrospective 内容 */
  insertRetroContent(content: {
    retroId: number;
    category: string;
    content: string;
    createdBy?: string;
  }): Promise<Result<number>>;
  /** 按类别查询内容 */
  getRetroContentByCategory(retroId: number, category: string): Promise<Result<unknown[]>>;
  /** 按关键词搜索 Retrospective */
  searchRetrospectives(keyword: string): Promise<Result<unknown[]>>;
  /** 生成统计报告 */
  generateReport(): Promise<Result<{
    totalRetrospectives: number;
    totalSprints: number;
    totalItems: number;
    byCategory: Array<{ category: string; count: number }>;
  }>>;
}

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
  on_error?: string; // 错误处理步骤 ID
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

// ============================================================================
// Phase 10 - Scalability Types
// ============================================================================

/**
 * Redis Cluster 节点配置
 */
export interface RedisClusterNode {
  host: string;
  port: number;
}

/**
 * Redis Cluster 配置
 */
export interface RedisClusterConfig {
  nodes: RedisClusterNode[];
  password?: string;
  db?: number;
  keyPrefix?: string;
  slotsRefreshTimeout?: number;
  retryDelayOnFail?: number;
}

/**
 * 一致性哈希环配置
 */
export interface ConsistentHashConfig {
  replicas?: number; // 虚拟节点数（默认 150）
  hashFunction?: 'murmur3' | 'sha1' | 'md5'; // 哈希函数
}

/**
 * 消息队列分片配置
 */
export interface MessageQueueShardingConfig {
  enabled: boolean;
  shardCount: number; // 分片数量
  consistentHash?: ConsistentHashConfig;
}

/**
 * 批量心跳配置
 */
export interface BatchHeartbeatConfig {
  enabled: boolean;
  batchSize: number; // 批量大小（默认 100）
  flushInterval: number; // 刷新间隔（毫秒，默认 1000）
}

/**
 * 分布式轮询索引配置
 */
export interface DistributedRoundRobinConfig {
  enabled: boolean;
  ttl: number; // 计数器 TTL（秒，默认 3600）
  keyPrefix?: string;
}

/**
 * 扩展性配置
 */
export interface ScalabilityConfig {
  // Redis Cluster 配置
  cluster?: RedisClusterConfig;
  // 消息队列分片配置
  sharding?: MessageQueueShardingConfig;
  // 批量心跳配置
  batchHeartbeat?: BatchHeartbeatConfig;
  // 分布式轮询索引配置
  roundRobin?: DistributedRoundRobinConfig;
}

// ============================================================================
// OpenCLAW Gateway Types
// ============================================================================

/**
 * Gateway 配置
 */
export interface GatewayConfig {
  enabled: boolean;
  port: number;
  host: string;
  apiKey: string;
  projectRoot: string;
}

/**
 * OpenCLAW 运行模式
 */
export type OpenCLAWMode = 'managed' | 'autonomous';

/**
 * OpenCLAW 集成配置
 */
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

/**
 * Service lifecycle types for DI container
 */
export type ServiceLifetime = 'singleton' | 'transient';

/**
 * Service descriptor for DI registration
 */
export interface ServiceDescriptor {
  lifetime: ServiceLifetime;
  factory?: () => unknown;
  instance?: unknown;
  dependencies?: string[];
}

// ============================================================================
// Phase 10 - Configuration Types
// ============================================================================

/**
 * Application configuration sources
 */
export type ConfigSource = 'env' | 'yaml' | 'default' | 'override';

/**
 * Redis connection configuration
 */
export interface RedisConnectionConfig {
  host: string;
  port: number;
  password?: string;
  db?: number;
}

/**
 * SQLite configuration
 */
export interface SQLiteConnectionConfig {
  path: string;
}

// ============================================================================
// Phase 10 - Event Bus Types
// ============================================================================

/**
 * Domain event interface
 */
export interface DomainEvent<T = unknown> {
  id: string;
  type: string;
  timestamp: number;
  source?: string;
  payload: T;
}

/**
 * Event handler function type
 */
export type EventHandler<T = unknown> = (event: T) => void | Promise<void>;

/**
 * Event interceptor function type
 */
export type EventInterceptor<T = unknown> = (
  event: T,
  next: () => void | Promise<void>
) => void | Promise<void>;

// ============================================================================
// Context Snapshot Types (Tacit Knowledge Externalization)
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
// Knowledge Base Extended Types (Tacit Knowledge Support)
// ============================================================================

/**
 * 扩展的知识条目类型（含默会知识分类）
 * intuition: 直觉性知识，需要被体验而非仅被读到
 * warning:   必须被主动检查的警示
 */
export type ExtendedKnowledgeType =
  | 'artifact'   // 产物（代码、文档、配置）
  | 'pattern'    // 模式（可以被遵循）
  | 'decision'   // 决策（可以被参考）
  | 'lesson'     // 教训（可以被读到）
  | 'api'        // API 信息
  | 'config'     // 配置信息
  | 'intuition'  // 直觉（需要被体验，仅读到不算掌握）
  | 'warning';   // 警示（必须被主动核查）

/**
 * 知识条目的使用指导
 */
export interface KnowledgeUsageGuidance {
  /** 何时应该检索这条知识 */
  whenToConsult: string;
  /** 如何验证自己真正理解了（而不只是读了） */
  howToVerifyUnderstanding?: string;
  /** 对于 intuition/warning 类型，需要主动完成的检查项 */
  requiredChecklist?: string[];
  /** 这条知识失效的条件（什么时候它不再适用） */
  expirationCondition?: string;
}

/**
 * 扩展版知识条目（在 KnowledgeEntry 基础上增加使用指导）
 */
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
  /** 使用指导：让读到条目的 Agent 知道应如何对待这条知识 */
  usageGuidance?: KnowledgeUsageGuidance;
  /** 默会程度：explicit（可编码）/ semi-tacit（半默会）/ tacit（纯默会） */
  tacitLevel: 'explicit' | 'semi-tacit' | 'tacit';
}


// ============================================================================
// Workflow Judgment Point Types
// ============================================================================

/**
 * 工作流判断点状态
 */
export type JudgmentStatus = 'pending' | 'resolved' | 'escalated' | 'timed_out';

/**
 * 工作流判断请求
 */
export interface WorkflowJudgmentRequest {
  id: string;
  workflowInstanceId: string;
  stepId: string;
  judgmentPrompt: string; // 需要判断的问题
  context: Record<string, unknown>;
  options?: string[]; // 可选答案（可选）
  fallbackOnTimeout: 'escalate_to_master' | 'skip' | 'fail_workflow';
  timeoutMs: number;
  createdAt: number;
  status: JudgmentStatus;
  resolution?: string; // 判断结果
  resolvedBy?: string; // 谁做了判断
  resolvedAt?: number;
}
