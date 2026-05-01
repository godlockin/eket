/// task:resume — Resume a ticket from execution checkpoint (TASK-229)
///
/// Uses `TicketEngine::recover()` to query SQLite execution_checkpoints
/// and returns a JSON `RecoveryResult`.
use anyhow::Result;
use clap::Args;
use r2d2::Pool;
use r2d2_sqlite::SqliteConnectionManager;
use std::sync::Arc;

use eket_engine::ticket_engine::{RecoveryResult, TicketEngine};

#[derive(Args, Debug)]
pub struct TaskResumeArgs {
    /// Ticket ID to resume (e.g. TASK-042)
    pub ticket_id: String,

    /// SQLite DB path
    #[arg(long)]
    pub db_path: Option<String>,
}

pub async fn run(args: TaskResumeArgs) -> Result<()> {
    let db_path = args.db_path.clone().unwrap_or_else(|| ".eket/eket.db".to_string());

    let pool = build_pool(&db_path)?;
    let engine = TicketEngine::new(pool);

    let result: RecoveryResult = engine
        .recover(&args.ticket_id)
        .await
        .map_err(|e| anyhow::anyhow!("{e}"))?;

    println!("{}", serde_json::to_string_pretty(&result)?);
    Ok(())
}

fn build_pool(db_path: &str) -> Result<Arc<Pool<SqliteConnectionManager>>> {
    use std::path::Path;
    if db_path != ":memory:" {
        if let Some(parent) = Path::new(db_path).parent() {
            std::fs::create_dir_all(parent)?;
        }
    }
    let manager = SqliteConnectionManager::file(db_path)
        .with_flags(
            rusqlite::OpenFlags::SQLITE_OPEN_READ_WRITE
                | rusqlite::OpenFlags::SQLITE_OPEN_CREATE
                | rusqlite::OpenFlags::SQLITE_OPEN_NO_MUTEX,
        )
        .with_init(|conn| {
            conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")?;
            Ok(())
        });
    let pool = Pool::builder().max_size(4).build(manager)?;
    Ok(Arc::new(pool))
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Utc;
    use r2d2_sqlite::SqliteConnectionManager;
    use tempfile::tempdir;

    fn make_pool_with_checkpoints(db_path: &str) -> Arc<Pool<SqliteConnectionManager>> {
        let pool = build_pool(db_path).unwrap();
        {
            let conn = pool.get().unwrap();
            conn.execute_batch(
                "CREATE TABLE IF NOT EXISTS execution_checkpoints (
                    ticket_id  TEXT NOT NULL,
                    slaver_id  TEXT NOT NULL,
                    phase      TEXT NOT NULL,
                    session_id TEXT,
                    metadata   TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    PRIMARY KEY (ticket_id, slaver_id)
                )",
            )
            .unwrap();
        }
        pool
    }

    #[tokio::test]
    async fn resume_not_found() {
        let dir = tempdir().unwrap();
        let db_path = dir.path().join("test.db").to_string_lossy().to_string();
        let pool = make_pool_with_checkpoints(&db_path);
        let engine = TicketEngine::new(pool);

        let result = engine.recover("TASK-999").await.unwrap();
        assert!(!result.recovered);
        assert!(result.state.is_none());
    }

    #[tokio::test]
    async fn resume_with_checkpoint() {
        let dir = tempdir().unwrap();
        let db_path = dir.path().join("test.db").to_string_lossy().to_string();
        let pool = make_pool_with_checkpoints(&db_path);

        {
            let conn = pool.get().unwrap();
            let now = Utc::now().to_rfc3339();
            conn.execute(
                "INSERT INTO execution_checkpoints \
                 (ticket_id, slaver_id, phase, session_id, metadata, created_at, updated_at) \
                 VALUES (?1, ?2, ?3, NULL, NULL, ?4, ?5)",
                rusqlite::params!["TASK-042", "slaver_1", "in_progress", now, now],
            )
            .unwrap();
        }

        let engine = TicketEngine::new(pool);
        let result = engine.recover("TASK-042").await.unwrap();
        assert!(result.recovered);
        assert!(result.reason.contains("in_progress"));
    }
}
