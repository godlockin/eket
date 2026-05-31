use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// 对应 TS: TicketStatus
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TicketStatus {
    Todo,
    InProgress,
    Review,
    Done,
    Blocked,
    Cancelled,
}

impl std::fmt::Display for TicketStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let s = match self {
            Self::Todo => "todo",
            Self::InProgress => "in_progress",
            Self::Review => "review",
            Self::Done => "done",
            Self::Blocked => "blocked",
            Self::Cancelled => "cancelled",
        };
        write!(f, "{s}")
    }
}

/// 对应 TS: InstanceRole
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum InstanceRole {
    Master,
    Slaver,
    Unknown,
}

/// TASK-255: 任务来源枚举
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum TaskSource {
    /// Master 拆解创建（expert panel 或 heartbeat 派发）
    Master,
    /// HTTP API 调用创建
    Api,
    /// 依赖解除后自动触发
    Dependency,
    /// 用户手动 `eket task:create` 创建
    #[default]
    Cli,
    /// 批量导入
    Bulk,
    /// MCP / AI Agent 工具调用（预留）
    Mcp,
}

impl std::fmt::Display for TaskSource {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let s = match self {
            Self::Master => "master",
            Self::Api => "api",
            Self::Dependency => "dependency",
            Self::Cli => "cli",
            Self::Bulk => "bulk",
            Self::Mcp => "mcp",
        };
        write!(f, "{s}")
    }
}

/// 对应 TS: Ticket (core fields)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Ticket {
    pub id: String,
    pub title: String,
    pub status: TicketStatus,
    pub priority: String,
    pub r#type: String,
    pub assignee: Option<String>,
    pub dependencies: Vec<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    /// TASK-255: 任务来源
    #[serde(default)]
    pub source: TaskSource,
    /// TASK-256: 领取时间戳
    pub claimed_at: Option<DateTime<Utc>>,
    /// TASK-256: 进入 blocked 状态时间戳（最近一次）
    pub blocked_at: Option<DateTime<Utc>>,
    /// TASK-256: 解除 blocked 时间戳（最近一次）
    pub unblocked_at: Option<DateTime<Utc>>,
    /// TASK-256: 完成时间戳
    pub completed_at: Option<DateTime<Utc>>,
}

impl Ticket {
    /// TASK-256: 队列等待时长（从创建到被领取）
    pub fn queue_wait_duration(&self) -> Option<chrono::Duration> {
        self.claimed_at.map(|c| c - self.created_at)
    }

    /// TASK-256: 净执行时长（从领取到完成）
    pub fn execution_duration(&self) -> Option<chrono::Duration> {
        match (self.claimed_at, self.completed_at) {
            (Some(c), Some(d)) => Some(d - c),
            _ => None,
        }
    }

    /// TASK-256: 阻塞持续时长（最近一次阻塞段）
    pub fn blocked_duration(&self) -> Option<chrono::Duration> {
        match (self.blocked_at, self.unblocked_at) {
            (Some(b), Some(u)) => Some(u - b),
            _ => None,
        }
    }
}

/// 对应 TS: ExecutionCheckpoint
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecutionCheckpoint {
    pub ticket_id: String,
    pub slaver_id: String,
    pub phase: String,
    pub session_id: Option<String>,
    pub metadata: Option<serde_json::Value>,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}

/// 对应 TS: SlaveResult
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SlaveResult {
    pub ticket_id: String,
    pub slaver_id: String,
    pub status: String,
    pub changed_files: Vec<String>,
    pub pr_url: Option<String>,
    pub error: Option<String>,
    pub metadata: Option<serde_json::Value>,
}

/// 对应 TS: Result<T> (API response wrapper)
#[derive(Debug, Serialize, Deserialize)]
pub struct ApiResult<T> {
    pub success: bool,
    pub data: Option<T>,
    pub error: Option<String>,
    pub code: Option<String>,
}

impl<T> ApiResult<T> {
    pub fn ok(data: T) -> Self {
        Self {
            success: true,
            data: Some(data),
            error: None,
            code: None,
        }
    }

    pub fn err(message: impl Into<String>, code: impl Into<String>) -> Self {
        Self {
            success: false,
            data: None,
            error: Some(message.into()),
            code: Some(code.into()),
        }
    }
}
