use thiserror::Error;

#[derive(Error, Debug)]
pub enum EketError {
    #[error("SQLite error: {0}")]
    Sqlite(#[from] rusqlite::Error),

    #[error("Redis error: {0}")]
    Redis(String),

    #[error("Config error: {0}")]
    Config(#[from] config::ConfigError),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Serialization error: {0}")]
    Serde(#[from] serde_json::Error),

    #[error("Connection pool error: {0}")]
    Pool(String),

    #[error("Not found: {0}")]
    NotFound(String),

    #[error("Permission denied: {0}")]
    PermissionDenied(String),

    #[error("Ticket already claimed: {0}")]
    AlreadyClaimed(String),

    #[error("Invalid state transition: {from} -> {to}")]
    InvalidTransition { from: String, to: String },

    #[error("Circuit breaker open: {service}")]
    CircuitBreakerOpen { service: String },

    #[error("Invalid input: {0}")]
    InvalidInput(String),

    #[error("{0}")]
    Other(String),
}

impl From<r2d2::Error> for EketError {
    fn from(e: r2d2::Error) -> Self {
        EketError::Pool(e.to_string())
    }
}

pub type EketResult<T> = Result<T, EketError>;
