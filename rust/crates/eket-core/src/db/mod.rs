/// SQLite client — 对应 TS: sqlite-client.ts + sqlite-manager.ts
///
/// 使用 r2d2 连接池 + rusqlite（bundled，无需系统 libsqlite3）
use std::path::Path;
use std::sync::Arc;

use r2d2::Pool;
use r2d2_sqlite::SqliteConnectionManager;
use rusqlite::params;
use tracing::{debug, info};

use crate::error::EketResult;
use crate::types::{ExecutionCheckpoint, Ticket, TicketStatus};

pub type DbPool = Arc<Pool<SqliteConnectionManager>>;

/// 建立连接池，运行 schema 迁移
pub fn create_pool(db_path: &str) -> EketResult<DbPool> {
    if let Some(parent) = Path::new(db_path).parent() {
        std::fs::create_dir_all(parent)?;
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

    let pool = Pool::builder().max_size(8).build(manager)?;
    let pool = Arc::new(pool);

    run_migrations(&pool)?;
    info!("SQLite pool created: {db_path}");
    Ok(pool)
}

// ─── Migrations ───────────────────────────────────────────────────────────────

fn run_migrations(pool: &DbPool) -> EketResult<()> {
    let conn = pool.get()?;
    conn.execute_batch(include_str!("schema.sql"))?;
    debug!("SQLite migrations applied");
    Ok(())
}

// ─── SQLiteClient ─────────────────────────────────────────────────────────────

pub struct SqliteClient {
    pool: DbPool,
}

impl SqliteClient {
    pub fn new(pool: DbPool) -> Self {
        Self { pool }
    }

    // ── Checkpoints (对应 TS: saveCheckpoint / getCheckpoint / deleteCheckpoint) ──

    pub fn save_checkpoint(&self, cp: &ExecutionCheckpoint) -> EketResult<()> {
        let conn = self.pool.get()?;
        conn.execute(
            "INSERT INTO execution_checkpoints
             (ticket_id, slaver_id, phase, session_id, metadata, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
             ON CONFLICT(ticket_id, slaver_id) DO UPDATE SET
               phase = excluded.phase,
               session_id = excluded.session_id,
               metadata = excluded.metadata,
               updated_at = excluded.updated_at",
            params![
                cp.ticket_id,
                cp.slaver_id,
                cp.phase,
                cp.session_id,
                cp.metadata.as_ref().map(|m| m.to_string()),
                cp.created_at.to_rfc3339(),
                cp.updated_at.to_rfc3339(),
            ],
        )?;
        Ok(())
    }

    pub fn get_checkpoint(
        &self,
        ticket_id: &str,
        slaver_id: &str,
    ) -> EketResult<Option<ExecutionCheckpoint>> {
        let conn = self.pool.get()?;
        let mut stmt = conn.prepare(
            "SELECT ticket_id, slaver_id, phase, session_id, metadata, created_at, updated_at
             FROM execution_checkpoints
             WHERE ticket_id = ?1 AND slaver_id = ?2",
        )?;

        let result = stmt.query_row(params![ticket_id, slaver_id], |row| {
            let metadata_str: Option<String> = row.get(4)?;
            Ok(ExecutionCheckpoint {
                ticket_id: row.get(0)?,
                slaver_id: row.get(1)?,
                phase: row.get(2)?,
                session_id: row.get(3)?,
                metadata: metadata_str
                    .as_deref()
                    .and_then(|s| serde_json::from_str(s).ok()),
                created_at: row
                    .get::<_, String>(5)?
                    .parse()
                    .unwrap_or_else(|_| chrono::Utc::now()),
                updated_at: row
                    .get::<_, String>(6)?
                    .parse()
                    .unwrap_or_else(|_| chrono::Utc::now()),
            })
        });

        match result {
            Ok(cp) => Ok(Some(cp)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e.into()),
        }
    }

    pub fn delete_checkpoint(&self, ticket_id: &str, slaver_id: &str) -> EketResult<bool> {
        let conn = self.pool.get()?;
        let rows = conn.execute(
            "DELETE FROM execution_checkpoints WHERE ticket_id = ?1 AND slaver_id = ?2",
            params![ticket_id, slaver_id],
        )?;
        Ok(rows > 0)
    }

    // ── Tickets ───────────────────────────────────────────────────────────────

    pub fn get_ticket(&self, ticket_id: &str) -> EketResult<Option<Ticket>> {
        let conn = self.pool.get()?;
        let mut stmt = conn.prepare(
            "SELECT id, title, status, priority, type, assignee, dependencies, created_at, updated_at
             FROM tickets WHERE id = ?1",
        )?;

        let result = stmt.query_row(params![ticket_id], |row| {
            let deps_str: Option<String> = row.get(6)?;
            let status_str: String = row.get(2)?;
            Ok(Ticket {
                id: row.get(0)?,
                title: row.get(1)?,
                status: parse_status(&status_str),
                priority: row.get(3)?,
                r#type: row.get(4)?,
                assignee: row.get(5)?,
                dependencies: deps_str
                    .as_deref()
                    .and_then(|s| serde_json::from_str::<Vec<String>>(s).ok())
                    .unwrap_or_default(),
                created_at: row
                    .get::<_, String>(7)?
                    .parse()
                    .unwrap_or_else(|_| chrono::Utc::now()),
                updated_at: row
                    .get::<_, String>(8)?
                    .parse()
                    .unwrap_or_else(|_| chrono::Utc::now()),
            })
        });

        match result {
            Ok(t) => Ok(Some(t)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e.into()),
        }
    }

    pub fn update_ticket_status(
        &self,
        ticket_id: &str,
        status: &TicketStatus,
        assignee: Option<&str>,
    ) -> EketResult<bool> {
        let conn = self.pool.get()?;
        let now = chrono::Utc::now().to_rfc3339();
        let rows = conn.execute(
            "UPDATE tickets SET status = ?1, assignee = ?2, updated_at = ?3 WHERE id = ?4",
            params![status.to_string(), assignee, now, ticket_id],
        )?;
        Ok(rows > 0)
    }

    pub fn list_tickets_by_status(&self, status: &TicketStatus) -> EketResult<Vec<Ticket>> {
        let conn = self.pool.get()?;
        let mut stmt = conn.prepare(
            "SELECT id, title, status, priority, type, assignee, dependencies, created_at, updated_at
             FROM tickets WHERE status = ?1 ORDER BY priority ASC, created_at ASC",
        )?;

        let tickets = stmt.query_map(params![status.to_string()], |row| {
            let deps_str: Option<String> = row.get(6)?;
            let status_str: String = row.get(2)?;
            Ok(Ticket {
                id: row.get(0)?,
                title: row.get(1)?,
                status: parse_status(&status_str),
                priority: row.get(3)?,
                r#type: row.get(4)?,
                assignee: row.get(5)?,
                dependencies: deps_str
                    .as_deref()
                    .and_then(|s| serde_json::from_str::<Vec<String>>(s).ok())
                    .unwrap_or_default(),
                created_at: row
                    .get::<_, String>(7)?
                    .parse()
                    .unwrap_or_else(|_| chrono::Utc::now()),
                updated_at: row
                    .get::<_, String>(8)?
                    .parse()
                    .unwrap_or_else(|_| chrono::Utc::now()),
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

        Ok(tickets)
    }

    /// Health check — 对应 TS: sqlite-manager checkHealth()
    pub fn ping(&self) -> EketResult<bool> {
        let conn = self.pool.get()?;
        let n: i64 = conn.query_row("SELECT 1", [], |r| r.get(0))?;
        Ok(n == 1)
    }
}

fn parse_status(s: &str) -> TicketStatus {
    match s {
        "todo" => TicketStatus::Todo,
        "in_progress" => TicketStatus::InProgress,
        "review" => TicketStatus::Review,
        "done" => TicketStatus::Done,
        "blocked" => TicketStatus::Blocked,
        "cancelled" => TicketStatus::Cancelled,
        _ => TicketStatus::Todo,
    }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn make_client() -> SqliteClient {
        let pool = create_pool(":memory:").expect("in-memory db");
        SqliteClient::new(pool)
    }

    #[test]
    fn ping_returns_true() {
        let client = make_client();
        assert!(client.ping().unwrap());
    }

    #[test]
    fn checkpoint_roundtrip() {
        let client = make_client();
        let cp = ExecutionCheckpoint {
            ticket_id: "TASK-001".into(),
            slaver_id: "slaver_1".into(),
            phase: "coding".into(),
            session_id: Some("sess_abc".into()),
            metadata: None,
            created_at: chrono::Utc::now(),
            updated_at: chrono::Utc::now(),
        };

        client.save_checkpoint(&cp).unwrap();
        let fetched = client.get_checkpoint("TASK-001", "slaver_1").unwrap();
        assert!(fetched.is_some());
        let fetched = fetched.unwrap();
        assert_eq!(fetched.phase, "coding");
        assert_eq!(fetched.session_id.as_deref(), Some("sess_abc"));
    }

    #[test]
    fn delete_checkpoint() {
        let client = make_client();
        let cp = ExecutionCheckpoint {
            ticket_id: "TASK-002".into(),
            slaver_id: "slaver_2".into(),
            phase: "review".into(),
            session_id: None,
            metadata: None,
            created_at: chrono::Utc::now(),
            updated_at: chrono::Utc::now(),
        };
        client.save_checkpoint(&cp).unwrap();
        assert!(client.delete_checkpoint("TASK-002", "slaver_2").unwrap());
        assert!(client.get_checkpoint("TASK-002", "slaver_2").unwrap().is_none());
    }

    #[test]
    fn get_nonexistent_checkpoint_returns_none() {
        let client = make_client();
        let result = client.get_checkpoint("TASK-999", "nobody").unwrap();
        assert!(result.is_none());
    }
}
