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
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
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
        Self { success: true, data: Some(data), error: None, code: None }
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
