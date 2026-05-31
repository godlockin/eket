/// Ticket Workflow Engine (TASK-228 / TASK-229)
///
/// Atomic SQLite-backed state transitions for EKET ticket state machine.
/// Also provides `recover()` to resume interrupted workflows from checkpoint.
use std::sync::Arc;

use chrono::Utc;
use r2d2::Pool;
use r2d2_sqlite::SqliteConnectionManager;
use serde::Serialize;
use tokio::sync::broadcast;

use crate::workflow::{WorkflowState, WorkflowTransition};
use eket_core::error::EketError;

// ─── Types ────────────────────────────────────────────────────────────────────

/// Event emitted after every successful state transition (or ESCALATE).
#[derive(Debug, Clone, Serialize)]
pub struct WorkflowEvent {
    pub ticket_id: String,
    pub from: WorkflowState,
    pub to: WorkflowState,
    pub timestamp: String,
}

/// Returned by a successful `transition()` call.
#[derive(Debug, Serialize)]
pub struct TransitionResult {
    pub ticket_id: String,
    pub from: WorkflowState,
    pub to: WorkflowState,
    pub timestamp: String,
}

/// Returned by `recover()`.
#[derive(Debug, Serialize)]
pub struct RecoveryResult {
    pub ticket_id: String,
    pub recovered: bool,
    pub state: Option<WorkflowState>,
    pub reason: String,
}

// ─── Engine ───────────────────────────────────────────────────────────────────

const BROADCAST_CAPACITY: usize = 256;

pub struct TicketEngine {
    pool: Arc<Pool<SqliteConnectionManager>>,
    event_tx: broadcast::Sender<WorkflowEvent>,
}

impl TicketEngine {
    pub fn new(pool: Arc<Pool<SqliteConnectionManager>>) -> Self {
        let (event_tx, _) = broadcast::channel(BROADCAST_CAPACITY);
        let conn = pool
            .get()
            .expect("TicketEngine::new: failed to get connection");
        Self::ensure_table(&conn).expect("TicketEngine::new: failed to ensure table");
        Self { pool, event_tx }
    }

    pub fn subscribe(&self) -> broadcast::Receiver<WorkflowEvent> {
        self.event_tx.subscribe()
    }

    /// Atomically validate + persist state transition, then broadcast.
    pub async fn transition(
        &self,
        ticket_id: &str,
        from: WorkflowState,
        to: WorkflowState,
    ) -> Result<TransitionResult, EketError> {
        WorkflowTransition::validate(&from, &to)?;

        let timestamp = Utc::now().to_rfc3339();
        let tid = ticket_id.to_string();
        let from_s = from.to_string();
        let to_s = to.to_string();
        let ts_clone = timestamp.clone();

        let pool = Arc::clone(&self.pool);
        tokio::task::spawn_blocking(move || -> Result<(), EketError> {
            let conn = pool.get().map_err(|e| EketError::Pool(e.to_string()))?;
            conn.execute_batch("BEGIN IMMEDIATE")?;
            let result = conn.execute(
                "INSERT INTO workflow_transitions (ticket_id, from_state, to_state, timestamp) \
                 VALUES (?1, ?2, ?3, ?4)",
                rusqlite::params![tid, from_s, to_s, ts_clone],
            );
            match result {
                Ok(_) => {
                    conn.execute_batch("COMMIT")?;
                    Ok(())
                }
                Err(e) => {
                    let _ = conn.execute_batch("ROLLBACK");
                    Err(EketError::Sqlite(e))
                }
            }
        })
        .await
        .map_err(|e| EketError::Other(e.to_string()))??;

        let result = TransitionResult {
            ticket_id: ticket_id.to_string(),
            from: from.clone(),
            to: to.clone(),
            timestamp: timestamp.clone(),
        };
        let event = WorkflowEvent {
            ticket_id: ticket_id.to_string(),
            from,
            to,
            timestamp,
        };
        let _ = self.event_tx.send(event);
        Ok(result)
    }

    /// Recover a ticket from its latest `execution_checkpoints` record.
    ///
    /// - Queries `execution_checkpoints` for most-recent row by `ticket_id`.
    /// - Parses `phase` → `WorkflowState`.
    /// - If `InProgress` and `updated_at < now-5min` → broadcasts ESCALATE event.
    pub async fn recover(&self, ticket_id: &str) -> Result<RecoveryResult, EketError> {
        let tid = ticket_id.to_string();
        let pool = Arc::clone(&self.pool);

        let row: Option<(String, String)> = tokio::task::spawn_blocking(move || {
            let conn = pool.get().map_err(|e| EketError::Pool(e.to_string()))?;
            // Ensure table exists (idempotent — matches schema.sql)
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
            )?;
            let result = conn.query_row(
                "SELECT phase, updated_at FROM execution_checkpoints \
                 WHERE ticket_id = ?1 ORDER BY updated_at DESC LIMIT 1",
                rusqlite::params![tid],
                |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
            );
            match result {
                Ok(row) => Ok(Some(row)),
                Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
                Err(e) => Err(EketError::Sqlite(e)),
            }
        })
        .await
        .map_err(|e| EketError::Other(e.to_string()))??;

        let Some((phase, updated_at_str)) = row else {
            return Ok(RecoveryResult {
                ticket_id: ticket_id.to_string(),
                recovered: false,
                state: None,
                reason: "no checkpoint found".to_string(),
            });
        };

        let state: WorkflowState = phase.parse()?;

        if state == WorkflowState::InProgress {
            if let Ok(updated_at) = chrono::DateTime::parse_from_rfc3339(&updated_at_str) {
                let age = Utc::now().signed_duration_since(updated_at.with_timezone(&Utc));
                if age > chrono::Duration::minutes(5) {
                    let event = WorkflowEvent {
                        ticket_id: ticket_id.to_string(),
                        from: WorkflowState::InProgress,
                        to: WorkflowState::InProgress,
                        timestamp: format!("{}:ESCALATE", Utc::now().to_rfc3339()),
                    };
                    let _ = self.event_tx.send(event);
                    return Ok(RecoveryResult {
                        ticket_id: ticket_id.to_string(),
                        recovered: true,
                        state: Some(state),
                        reason: format!(
                            "stale in_progress (idle {}min): ESCALATE broadcast",
                            age.num_minutes()
                        ),
                    });
                }
            }
        }

        Ok(RecoveryResult {
            ticket_id: ticket_id.to_string(),
            recovered: true,
            state: Some(state),
            reason: format!("checkpoint phase={phase}"),
        })
    }

    fn ensure_table(conn: &rusqlite::Connection) -> Result<(), EketError> {
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS workflow_transitions (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                ticket_id   TEXT NOT NULL,
                from_state  TEXT NOT NULL,
                to_state    TEXT NOT NULL,
                timestamp   TEXT NOT NULL
            )",
        )?;
        Ok(())
    }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use r2d2_sqlite::SqliteConnectionManager;

    fn make_pool() -> Arc<Pool<SqliteConnectionManager>> {
        // Use in-memory DB (max_size=1 — in-memory DBs are connection-scoped)
        let pool = Arc::new(
            r2d2::Pool::builder()
                .max_size(1)
                .build(SqliteConnectionManager::memory())
                .expect("pool"),
        );
        {
            let conn = pool.get().unwrap();
            conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;")
                .unwrap();
        }
        pool
    }

    fn make_engine() -> (TicketEngine, Arc<Pool<SqliteConnectionManager>>) {
        let pool = make_pool();
        let engine = TicketEngine::new(Arc::clone(&pool));
        (engine, pool)
    }

    fn make_engine_with_checkpoints() -> (TicketEngine, Arc<Pool<SqliteConnectionManager>>) {
        let (engine, pool) = make_engine();
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
        (engine, pool)
    }

    // ── workflow_transition_db ─────────────────────────────────────────────────

    #[tokio::test]
    async fn workflow_transition_db() {
        let (engine, pool) = make_engine();

        let result = engine
            .transition("TASK-001", WorkflowState::Backlog, WorkflowState::Analysis)
            .await
            .expect("transition failed");

        assert_eq!(result.ticket_id, "TASK-001");
        assert_eq!(result.from, WorkflowState::Backlog);
        assert_eq!(result.to, WorkflowState::Analysis);

        let conn = pool.get().unwrap();
        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM workflow_transitions WHERE ticket_id = 'TASK-001'",
                [],
                |row| row.get(0),
            )
            .expect("count query");
        assert_eq!(count, 1);

        let (from_s, to_s): (String, String) = conn.query_row(
            "SELECT from_state, to_state FROM workflow_transitions WHERE ticket_id = 'TASK-001'",
            [], |row| Ok((row.get(0)?, row.get(1)?)),
        ).expect("select query");
        assert_eq!(from_s, "backlog");
        assert_eq!(to_s, "analysis");
    }

    // ── workflow_transition_invalid ───────────────────────────────────────────

    #[tokio::test]
    async fn workflow_transition_invalid() {
        let (engine, pool) = make_engine();

        let err = engine
            .transition("TASK-002", WorkflowState::Backlog, WorkflowState::Done)
            .await
            .expect_err("should fail");

        assert!(
            matches!(err, EketError::InvalidTransition { .. }),
            "expected InvalidTransition, got: {err:?}"
        );

        let conn = pool.get().unwrap();
        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM workflow_transitions WHERE ticket_id = 'TASK-002'",
                [],
                |row| row.get(0),
            )
            .expect("count query");
        assert_eq!(count, 0);
    }

    // ── workflow_concurrent ───────────────────────────────────────────────────

    #[tokio::test]
    async fn workflow_concurrent() {
        let (engine, pool) = make_engine();
        let engine = Arc::new(engine);
        let e1 = Arc::clone(&engine);
        let e2 = Arc::clone(&engine);

        let (r1, r2) = tokio::join!(
            tokio::spawn(async move {
                e1.transition("TASK-010", WorkflowState::Backlog, WorkflowState::Analysis)
                    .await
            }),
            tokio::spawn(async move {
                e2.transition("TASK-011", WorkflowState::Analysis, WorkflowState::Ready)
                    .await
            }),
        );
        r1.expect("join1").expect("transition1");
        r2.expect("join2").expect("transition2");

        let conn = pool.get().unwrap();
        let count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM workflow_transitions WHERE ticket_id IN ('TASK-010','TASK-011')",
            [], |row| row.get(0),
        ).unwrap();
        assert_eq!(count, 2);
    }

    // ── workflow_event_broadcast ──────────────────────────────────────────────

    #[tokio::test]
    async fn workflow_event_broadcast() {
        let (engine, _pool) = make_engine();
        let mut rx = engine.subscribe();

        engine
            .transition("TASK-020", WorkflowState::Analysis, WorkflowState::Ready)
            .await
            .expect("transition");

        let event = tokio::time::timeout(std::time::Duration::from_millis(500), async {
            rx.recv().await
        })
        .await
        .expect("timeout waiting for event")
        .expect("recv error");

        assert_eq!(event.ticket_id, "TASK-020");
        assert_eq!(event.from, WorkflowState::Analysis);
        assert_eq!(event.to, WorkflowState::Ready);
        assert!(!event.timestamp.is_empty());
    }

    // ── workflow_recover_inprogress ───────────────────────────────────────────

    #[tokio::test]
    async fn workflow_recover_inprogress() {
        let (engine, pool) = make_engine_with_checkpoints();

        {
            let conn = pool.get().unwrap();
            let now = Utc::now().to_rfc3339();
            conn.execute(
                "INSERT INTO execution_checkpoints \
                 (ticket_id, slaver_id, phase, session_id, metadata, created_at, updated_at) \
                 VALUES (?1, ?2, ?3, NULL, NULL, ?4, ?5)",
                rusqlite::params!["TASK-300", "slaver_1", "in_progress", now, now],
            )
            .unwrap();
        }

        let result = engine.recover("TASK-300").await.expect("recover failed");
        assert!(result.recovered);
        assert_eq!(result.state, Some(WorkflowState::InProgress));
        assert!(result.reason.contains("in_progress"));
    }

    // ── workflow_recover_no_checkpoint ────────────────────────────────────────

    #[tokio::test]
    async fn workflow_recover_no_checkpoint() {
        let (engine, _pool) = make_engine_with_checkpoints();

        let result = engine.recover("TASK-999").await.expect("recover failed");
        assert!(!result.recovered);
        assert!(result.state.is_none());
        assert_eq!(result.reason, "no checkpoint found");
    }

    // ── workflow_recover_escalate ─────────────────────────────────────────────

    #[tokio::test]
    async fn workflow_recover_escalate() {
        let (engine, pool) = make_engine_with_checkpoints();
        let mut rx = engine.subscribe();

        {
            let conn = pool.get().unwrap();
            let ten_min_ago = (Utc::now() - chrono::Duration::minutes(10)).to_rfc3339();
            conn.execute(
                "INSERT INTO execution_checkpoints \
                 (ticket_id, slaver_id, phase, session_id, metadata, created_at, updated_at) \
                 VALUES (?1, ?2, ?3, NULL, NULL, ?4, ?5)",
                rusqlite::params![
                    "TASK-301",
                    "slaver_1",
                    "in_progress",
                    ten_min_ago,
                    ten_min_ago
                ],
            )
            .unwrap();
        }

        let result = engine.recover("TASK-301").await.expect("recover failed");
        assert!(result.recovered);
        assert_eq!(result.state, Some(WorkflowState::InProgress));
        assert!(result.reason.contains("ESCALATE"));

        let event = tokio::time::timeout(std::time::Duration::from_millis(500), async {
            rx.recv().await
        })
        .await
        .expect("timeout waiting for ESCALATE event")
        .expect("recv error");

        assert_eq!(event.ticket_id, "TASK-301");
        assert!(event.timestamp.contains("ESCALATE"));
    }
}
