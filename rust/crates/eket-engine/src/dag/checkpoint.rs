//! TASK-650: DAG Checkpoint - WAL-based persistence for crash recovery
//! TASK-656: SQLite Sync Pragma for crash safety
//!
//! Implements Write-Ahead Logging (WAL) pattern:
//! - `before_dispatch()`: Mark node as dispatched BEFORE execution
//! - `after_complete()`: Mark node as done/failed AFTER execution
//!
//! Crash recovery: On restart, nodes in 'dispatched' status are re-queued.
//!
//! ## Crash Safety (TASK-656)
//!
//! This module uses `PRAGMA synchronous = FULL` to ensure data durability:
//! - All writes are synced to disk before returning
//! - Power failure or OS crash will not lose committed data
//!
//! ## Idempotency Requirements
//!
//! **IMPORTANT**: DAG nodes are executed with **at-least-once** semantics.
//! If a crash occurs after `before_dispatch()` but before `after_complete()`,
//! the node will be re-executed on recovery.
//!
//! For non-idempotent operations (payments, API calls), implementers MUST:
//! 1. Use the `(run_id, node_id, attempt)` tuple as an idempotency key
//! 2. Check for previous execution before performing side effects
//! 3. Store execution results externally with the idempotency key
//!
//! Example idempotency check:
//! ```ignore
//! // In your node executor:
//! let idem_key = format!("{}:{}:{}", run_id, node_id, attempt);
//! if external_store.has_completed(&idem_key) {
//!     return cached_result;
//! }
//! // Perform operation...
//! external_store.mark_completed(&idem_key, result);
//! ```

use std::sync::Arc;

use r2d2::Pool;
use r2d2_sqlite::SqliteConnectionManager;
use rusqlite::params;
use tracing::{debug, info, warn};
use uuid::Uuid;

use crate::dag::executor::NodeExecutionResult;
use crate::dag::schema::DagSchema;

/// Database pool type alias
pub type DbPool = Arc<Pool<SqliteConnectionManager>>;

/// Node status in checkpoint
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum NodeStatus {
    Pending,
    Ready,
    Dispatched,
    Running,
    Done,
    Failed,
    Skipped,
}

impl NodeStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            NodeStatus::Pending => "pending",
            NodeStatus::Ready => "ready",
            NodeStatus::Dispatched => "dispatched",
            NodeStatus::Running => "running",
            NodeStatus::Done => "done",
            NodeStatus::Failed => "failed",
            NodeStatus::Skipped => "skipped",
        }
    }

    #[allow(clippy::should_implement_trait)]
    pub fn from_str(s: &str) -> Self {
        match s {
            "pending" => NodeStatus::Pending,
            "ready" => NodeStatus::Ready,
            "dispatched" => NodeStatus::Dispatched,
            "running" => NodeStatus::Running,
            "done" => NodeStatus::Done,
            "failed" => NodeStatus::Failed,
            "skipped" => NodeStatus::Skipped,
            _ => NodeStatus::Pending,
        }
    }
}

/// Run status
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RunStatus {
    Pending,
    Running,
    Done,
    Failed,
    Aborted,
}

impl RunStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            RunStatus::Pending => "pending",
            RunStatus::Running => "running",
            RunStatus::Done => "done",
            RunStatus::Failed => "failed",
            RunStatus::Aborted => "aborted",
        }
    }

    #[allow(dead_code)]
    #[allow(clippy::should_implement_trait)]
    pub fn from_str(s: &str) -> Self {
        match s {
            "pending" => RunStatus::Pending,
            "running" => RunStatus::Running,
            "done" => RunStatus::Done,
            "failed" => RunStatus::Failed,
            "aborted" => RunStatus::Aborted,
            _ => RunStatus::Pending,
        }
    }
}

/// Checkpoint entry for a DAG run
#[derive(Debug, Clone)]
pub struct DagRunCheckpoint {
    pub id: String,
    pub epic_id: String,
    pub yaml_content: String,
    pub status: String,
    pub started_at: Option<i64>,
    pub finished_at: Option<i64>,
    pub engine_level: i32,
    pub error_msg: Option<String>,
}

/// Checkpoint entry for a node state
#[derive(Debug, Clone)]
pub struct NodeStateCheckpoint {
    pub run_id: String,
    pub node_id: String,
    pub status: String,
    pub started_at: Option<i64>,
    pub finished_at: Option<i64>,
    pub exit_code: Option<i32>,
    pub error_msg: Option<String>,
    pub attempt: i32,
}

/// DAG Checkpoint manager - provides WAL semantics for crash recovery
///
/// ## Crash Safety
///
/// Uses `PRAGMA synchronous = FULL` and `PRAGMA journal_mode = WAL` for:
/// - Durability: committed data survives power loss
/// - Consistency: partial writes are rolled back on recovery
///
/// ## Idempotency
///
/// The `attempt` field in `dag_node_states` serves as part of the idempotency key.
/// Use `(run_id, node_id, attempt)` for deduplication in external systems.
pub struct DagCheckpoint {
    pool: DbPool,
}

impl DagCheckpoint {
    /// Create new checkpoint manager with crash-safe pragmas
    ///
    /// Initializes SQLite with:
    /// - `synchronous = FULL`: Ensure all writes are synced to disk
    /// - `journal_mode = WAL`: Enable write-ahead logging for crash recovery
    /// - `busy_timeout = 5000`: Wait up to 5s for locks
    pub fn new(pool: DbPool) -> Self {
        // Apply crash-safety pragmas on first connection
        // Note: These pragmas affect the entire database, not just this connection
        if let Ok(conn) = pool.get() {
            // PRAGMA synchronous = FULL ensures data is synced to disk before returning
            // This is critical for crash safety - without it, data may be lost on power failure
            if let Err(e) = conn.execute_batch(
                "PRAGMA synchronous = FULL; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;",
            ) {
                tracing::warn!("[DagCheckpoint] Failed to set crash-safety pragmas: {}", e);
            } else {
                debug!("[DagCheckpoint] Crash-safety pragmas applied (synchronous=FULL, journal_mode=WAL)");
            }
        }
        Self { pool }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // DAG Run Lifecycle
    // ═══════════════════════════════════════════════════════════════════════════

    /// Create a new DAG run record
    pub fn create_run(&self, schema: &DagSchema, engine_level: i32) -> Result<String, rusqlite::Error> {
        let run_id = Uuid::new_v4().to_string();
        let epic_id = &schema.epic;
        let yaml_content = serde_yaml::to_string(schema).unwrap_or_default();
        let now = current_timestamp();

        let conn = self.pool.get().map_err(|e| {
            rusqlite::Error::SqliteFailure(
                rusqlite::ffi::Error::new(1),
                Some(e.to_string()),
            )
        })?;

        conn.execute(
            r#"
            INSERT INTO dag_runs (id, epic_id, yaml_content, status, engine_level, created_at)
            VALUES (?1, ?2, ?3, 'pending', ?4, ?5)
            "#,
            params![run_id, epic_id, yaml_content, engine_level, now],
        )?;

        // Initialize all node states as pending
        for node in &schema.nodes {
            conn.execute(
                r#"
                INSERT INTO dag_node_states (run_id, node_id, status, attempt)
                VALUES (?1, ?2, 'pending', 0)
                "#,
                params![run_id, node.id],
            )?;
        }

        info!(
            "[DagCheckpoint] Created run {} for epic {} with {} nodes",
            run_id,
            epic_id,
            schema.nodes.len()
        );

        Ok(run_id)
    }

    /// Start a DAG run (mark as running)
    pub fn start_run(&self, run_id: &str) -> Result<(), rusqlite::Error> {
        let now = current_timestamp();
        let conn = self.pool.get().map_err(pool_to_sqlite_error)?;

        conn.execute(
            "UPDATE dag_runs SET status = 'running', started_at = ?1 WHERE id = ?2",
            params![now, run_id],
        )?;

        debug!("[DagCheckpoint] Run {} started", run_id);
        Ok(())
    }

    /// Complete a DAG run (mark as done or failed)
    pub fn complete_run(
        &self,
        run_id: &str,
        success: bool,
        error_msg: Option<&str>,
    ) -> Result<(), rusqlite::Error> {
        let now = current_timestamp();
        let status = if success { "done" } else { "failed" };
        let conn = self.pool.get().map_err(pool_to_sqlite_error)?;

        conn.execute(
            "UPDATE dag_runs SET status = ?1, finished_at = ?2, error_msg = ?3 WHERE id = ?4",
            params![status, now, error_msg, run_id],
        )?;

        info!(
            "[DagCheckpoint] Run {} completed with status={}",
            run_id, status
        );
        Ok(())
    }

    /// Abort a DAG run
    pub fn abort_run(&self, run_id: &str, reason: &str) -> Result<(), rusqlite::Error> {
        let now = current_timestamp();
        let conn = self.pool.get().map_err(pool_to_sqlite_error)?;

        conn.execute(
            "UPDATE dag_runs SET status = 'aborted', finished_at = ?1, error_msg = ?2 WHERE id = ?3",
            params![now, reason, run_id],
        )?;

        warn!("[DagCheckpoint] Run {} aborted: {}", run_id, reason);
        Ok(())
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Node WAL Operations (Critical Path)
    // ═══════════════════════════════════════════════════════════════════════════

    /// WAL: Mark node as dispatched BEFORE execution starts
    /// This is the "write-ahead" part - if we crash after dispatch but before
    /// completion, we can detect dispatched nodes on recovery.
    pub fn before_dispatch(&self, run_id: &str, node_id: &str) -> Result<(), rusqlite::Error> {
        let now = current_timestamp();
        let conn = self.pool.get().map_err(pool_to_sqlite_error)?;

        conn.execute(
            r#"
            UPDATE dag_node_states
            SET status = 'dispatched', started_at = ?1, attempt = attempt + 1
            WHERE run_id = ?2 AND node_id = ?3
            "#,
            params![now, run_id, node_id],
        )?;

        debug!(
            "[DagCheckpoint] WAL: Node {}/{} dispatched",
            run_id, node_id
        );
        Ok(())
    }

    /// WAL: Mark node as completed AFTER execution finishes
    pub fn after_complete(
        &self,
        run_id: &str,
        node_id: &str,
        result: &NodeExecutionResult,
    ) -> Result<(), rusqlite::Error> {
        let now = current_timestamp();
        let status = if result.success { "done" } else { "failed" };
        let conn = self.pool.get().map_err(pool_to_sqlite_error)?;

        conn.execute(
            r#"
            UPDATE dag_node_states
            SET status = ?1, finished_at = ?2, exit_code = ?3, error_msg = ?4
            WHERE run_id = ?5 AND node_id = ?6
            "#,
            params![
                status,
                now,
                result.exit_code,
                result.error_msg,
                run_id,
                node_id
            ],
        )?;

        debug!(
            "[DagCheckpoint] WAL: Node {}/{} completed (status={})",
            run_id, node_id, status
        );
        Ok(())
    }

    /// Mark node as skipped (due to gate condition or failed dependency)
    pub fn skip_node(
        &self,
        run_id: &str,
        node_id: &str,
        reason: &str,
    ) -> Result<(), rusqlite::Error> {
        let now = current_timestamp();
        let conn = self.pool.get().map_err(pool_to_sqlite_error)?;

        conn.execute(
            r#"
            UPDATE dag_node_states
            SET status = 'skipped', finished_at = ?1, error_msg = ?2
            WHERE run_id = ?3 AND node_id = ?4
            "#,
            params![now, reason, run_id, node_id],
        )?;

        debug!(
            "[DagCheckpoint] Node {}/{} skipped: {}",
            run_id, node_id, reason
        );
        Ok(())
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Recovery Operations
    // ═══════════════════════════════════════════════════════════════════════════

    /// Find runs that need recovery (status = 'running' on startup)
    pub fn find_interrupted_runs(&self) -> Result<Vec<DagRunCheckpoint>, rusqlite::Error> {
        let conn = self.pool.get().map_err(pool_to_sqlite_error)?;

        let mut stmt = conn.prepare(
            r#"
            SELECT id, epic_id, yaml_content, status, started_at, finished_at,
                   engine_level, error_msg
            FROM dag_runs
            WHERE status = 'running'
            ORDER BY created_at ASC
            "#,
        )?;

        let runs = stmt
            .query_map([], |row| {
                Ok(DagRunCheckpoint {
                    id: row.get(0)?,
                    epic_id: row.get(1)?,
                    yaml_content: row.get(2)?,
                    status: row.get(3)?,
                    started_at: row.get(4)?,
                    finished_at: row.get(5)?,
                    engine_level: row.get(6)?,
                    error_msg: row.get(7)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;

        if !runs.is_empty() {
            info!(
                "[DagCheckpoint] Found {} interrupted runs for recovery",
                runs.len()
            );
        }

        Ok(runs)
    }

    /// Get nodes that were dispatched but not completed (need re-execution)
    pub fn find_dispatched_nodes(&self, run_id: &str) -> Result<Vec<String>, rusqlite::Error> {
        let conn = self.pool.get().map_err(pool_to_sqlite_error)?;

        let mut stmt = conn.prepare(
            r#"
            SELECT node_id FROM dag_node_states
            WHERE run_id = ?1 AND status = 'dispatched'
            "#,
        )?;

        let nodes = stmt
            .query_map([run_id], |row| row.get(0))?
            .collect::<Result<Vec<String>, _>>()?;

        if !nodes.is_empty() {
            warn!(
                "[DagCheckpoint] Found {} dispatched nodes for recovery in run {}",
                nodes.len(),
                run_id
            );
        }

        Ok(nodes)
    }

    /// Get completed nodes (for dependency checking during recovery)
    pub fn find_completed_nodes(&self, run_id: &str) -> Result<Vec<String>, rusqlite::Error> {
        let conn = self.pool.get().map_err(pool_to_sqlite_error)?;

        let mut stmt = conn.prepare(
            r#"
            SELECT node_id FROM dag_node_states
            WHERE run_id = ?1 AND status = 'done'
            "#,
        )?;

        let nodes = stmt
            .query_map([run_id], |row| row.get(0))?
            .collect::<Result<Vec<String>, _>>()?;

        Ok(nodes)
    }

    /// Get failed nodes (for reporting)
    pub fn find_failed_nodes(&self, run_id: &str) -> Result<Vec<NodeStateCheckpoint>, rusqlite::Error> {
        let conn = self.pool.get().map_err(pool_to_sqlite_error)?;

        let mut stmt = conn.prepare(
            r#"
            SELECT run_id, node_id, status, started_at, finished_at,
                   exit_code, error_msg, attempt
            FROM dag_node_states
            WHERE run_id = ?1 AND status = 'failed'
            "#,
        )?;

        let nodes = stmt
            .query_map([run_id], |row| {
                Ok(NodeStateCheckpoint {
                    run_id: row.get(0)?,
                    node_id: row.get(1)?,
                    status: row.get(2)?,
                    started_at: row.get(3)?,
                    finished_at: row.get(4)?,
                    exit_code: row.get(5)?,
                    error_msg: row.get(6)?,
                    attempt: row.get(7)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(nodes)
    }

    /// Reset dispatched nodes back to pending for retry (recovery)
    pub fn reset_dispatched_nodes(&self, run_id: &str) -> Result<usize, rusqlite::Error> {
        let conn = self.pool.get().map_err(pool_to_sqlite_error)?;

        let count = conn.execute(
            r#"
            UPDATE dag_node_states
            SET status = 'pending', started_at = NULL
            WHERE run_id = ?1 AND status = 'dispatched'
            "#,
            params![run_id],
        )?;

        if count > 0 {
            info!(
                "[DagCheckpoint] Reset {} dispatched nodes in run {}",
                count, run_id
            );
        }

        Ok(count)
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Query Operations
    // ═══════════════════════════════════════════════════════════════════════════

    /// Get run status
    pub fn get_run(&self, run_id: &str) -> Result<Option<DagRunCheckpoint>, rusqlite::Error> {
        let conn = self.pool.get().map_err(pool_to_sqlite_error)?;

        let mut stmt = conn.prepare(
            r#"
            SELECT id, epic_id, yaml_content, status, started_at, finished_at,
                   engine_level, error_msg
            FROM dag_runs WHERE id = ?1
            "#,
        )?;

        let mut rows = stmt.query([run_id])?;
        if let Some(row) = rows.next()? {
            Ok(Some(DagRunCheckpoint {
                id: row.get(0)?,
                epic_id: row.get(1)?,
                yaml_content: row.get(2)?,
                status: row.get(3)?,
                started_at: row.get(4)?,
                finished_at: row.get(5)?,
                engine_level: row.get(6)?,
                error_msg: row.get(7)?,
            }))
        } else {
            Ok(None)
        }
    }

    /// Get all node states for a run
    pub fn get_node_states(&self, run_id: &str) -> Result<Vec<NodeStateCheckpoint>, rusqlite::Error> {
        let conn = self.pool.get().map_err(pool_to_sqlite_error)?;

        let mut stmt = conn.prepare(
            r#"
            SELECT run_id, node_id, status, started_at, finished_at,
                   exit_code, error_msg, attempt
            FROM dag_node_states
            WHERE run_id = ?1
            ORDER BY node_id
            "#,
        )?;

        let states = stmt
            .query_map([run_id], |row| {
                Ok(NodeStateCheckpoint {
                    run_id: row.get(0)?,
                    node_id: row.get(1)?,
                    status: row.get(2)?,
                    started_at: row.get(3)?,
                    finished_at: row.get(4)?,
                    exit_code: row.get(5)?,
                    error_msg: row.get(6)?,
                    attempt: row.get(7)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(states)
    }

    /// Count nodes by status
    pub fn count_by_status(&self, run_id: &str) -> Result<std::collections::HashMap<String, i64>, rusqlite::Error> {
        let conn = self.pool.get().map_err(pool_to_sqlite_error)?;

        let mut stmt = conn.prepare(
            r#"
            SELECT status, COUNT(*) FROM dag_node_states
            WHERE run_id = ?1
            GROUP BY status
            "#,
        )?;

        let mut counts = std::collections::HashMap::new();
        let mut rows = stmt.query([run_id])?;
        while let Some(row) = rows.next()? {
            let status: String = row.get(0)?;
            let count: i64 = row.get(1)?;
            counts.insert(status, count);
        }

        Ok(counts)
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════════

fn current_timestamp() -> i64 {
    chrono::Utc::now().timestamp()
}

fn pool_to_sqlite_error(e: r2d2::Error) -> rusqlite::Error {
    rusqlite::Error::SqliteFailure(
        rusqlite::ffi::Error::new(1),
        Some(e.to_string()),
    )
}

// ═══════════════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════════════

#[cfg(test)]
mod tests {
    use super::*;
    use r2d2_sqlite::SqliteConnectionManager;
    use std::sync::Arc;

    fn create_test_pool() -> DbPool {
        let manager = SqliteConnectionManager::memory();
        let pool = Pool::builder().max_size(1).build(manager).unwrap();
        let pool = Arc::new(pool);

        // Run migrations
        let conn = pool.get().unwrap();
        conn.execute_batch(include_str!("../../../eket-core/src/db/schema.sql"))
            .unwrap();

        pool
    }

    fn create_test_schema() -> DagSchema {
        DagSchema::from_yaml(
            r#"
version: "1.0"
epic: EPIC-017
nodes:
  - id: TASK-001
    script: "echo hello"
  - id: TASK-002
    script: "echo world"
    deps: [TASK-001]
settings:
  max_parallel: 2
"#,
        )
        .unwrap()
    }

    #[test]
    fn test_create_run() {
        let pool = create_test_pool();
        let checkpoint = DagCheckpoint::new(pool);
        let schema = create_test_schema();

        let run_id = checkpoint.create_run(&schema, 3).unwrap();
        assert!(!run_id.is_empty());

        // Verify run was created
        let run = checkpoint.get_run(&run_id).unwrap().unwrap();
        assert_eq!(run.epic_id, "EPIC-017");
        assert_eq!(run.status, "pending");
        assert_eq!(run.engine_level, 3);

        // Verify node states were initialized
        let states = checkpoint.get_node_states(&run_id).unwrap();
        assert_eq!(states.len(), 2);
        assert!(states.iter().all(|s| s.status == "pending"));
    }

    #[test]
    fn test_run_lifecycle() {
        let pool = create_test_pool();
        let checkpoint = DagCheckpoint::new(pool);
        let schema = create_test_schema();

        let run_id = checkpoint.create_run(&schema, 3).unwrap();

        // Start run
        checkpoint.start_run(&run_id).unwrap();
        let run = checkpoint.get_run(&run_id).unwrap().unwrap();
        assert_eq!(run.status, "running");
        assert!(run.started_at.is_some());

        // Complete run
        checkpoint.complete_run(&run_id, true, None).unwrap();
        let run = checkpoint.get_run(&run_id).unwrap().unwrap();
        assert_eq!(run.status, "done");
        assert!(run.finished_at.is_some());
    }

    #[test]
    fn test_wal_before_after_dispatch() {
        let pool = create_test_pool();
        let checkpoint = DagCheckpoint::new(pool);
        let schema = create_test_schema();

        let run_id = checkpoint.create_run(&schema, 3).unwrap();

        // Before dispatch - WAL write
        checkpoint.before_dispatch(&run_id, "TASK-001").unwrap();

        // Verify dispatched state
        let states = checkpoint.get_node_states(&run_id).unwrap();
        let task1 = states.iter().find(|s| s.node_id == "TASK-001").unwrap();
        assert_eq!(task1.status, "dispatched");
        assert!(task1.started_at.is_some());
        assert_eq!(task1.attempt, 1);

        // After complete - WAL write
        let result = NodeExecutionResult {
            node_id: "TASK-001".to_string(),
            success: true,
            exit_code: Some(0),
            stdout: "hello".to_string(),
            stderr: String::new(),
            error_msg: None,
            duration_ms: 100,
            is_gate: false,
            gate_passed: false,
        };
        checkpoint.after_complete(&run_id, "TASK-001", &result).unwrap();

        // Verify completed state
        let states = checkpoint.get_node_states(&run_id).unwrap();
        let task1 = states.iter().find(|s| s.node_id == "TASK-001").unwrap();
        assert_eq!(task1.status, "done");
        assert!(task1.finished_at.is_some());
        assert_eq!(task1.exit_code, Some(0));
    }

    #[test]
    fn test_node_failure() {
        let pool = create_test_pool();
        let checkpoint = DagCheckpoint::new(pool);
        let schema = create_test_schema();

        let run_id = checkpoint.create_run(&schema, 3).unwrap();

        checkpoint.before_dispatch(&run_id, "TASK-001").unwrap();

        let result = NodeExecutionResult {
            node_id: "TASK-001".to_string(),
            success: false,
            exit_code: Some(1),
            stdout: String::new(),
            stderr: "error output".to_string(),
            error_msg: Some("Exit code 1".to_string()),
            duration_ms: 50,
            is_gate: false,
            gate_passed: false,
        };
        checkpoint.after_complete(&run_id, "TASK-001", &result).unwrap();

        let failed = checkpoint.find_failed_nodes(&run_id).unwrap();
        assert_eq!(failed.len(), 1);
        assert_eq!(failed[0].node_id, "TASK-001");
        assert_eq!(failed[0].exit_code, Some(1));
    }

    #[test]
    fn test_crash_recovery() {
        let pool = create_test_pool();
        let checkpoint = DagCheckpoint::new(pool.clone());
        let schema = create_test_schema();

        // Simulate a run that crashed mid-execution
        let run_id = checkpoint.create_run(&schema, 3).unwrap();
        checkpoint.start_run(&run_id).unwrap();

        // TASK-001 dispatched but not completed (simulates crash)
        checkpoint.before_dispatch(&run_id, "TASK-001").unwrap();

        // Simulate restart - find interrupted runs
        let interrupted = checkpoint.find_interrupted_runs().unwrap();
        assert_eq!(interrupted.len(), 1);
        assert_eq!(interrupted[0].id, run_id);

        // Find dispatched nodes that need re-execution
        let dispatched = checkpoint.find_dispatched_nodes(&run_id).unwrap();
        assert_eq!(dispatched.len(), 1);
        assert_eq!(dispatched[0], "TASK-001");

        // Reset for retry
        let reset_count = checkpoint.reset_dispatched_nodes(&run_id).unwrap();
        assert_eq!(reset_count, 1);

        // Verify reset
        let states = checkpoint.get_node_states(&run_id).unwrap();
        let task1 = states.iter().find(|s| s.node_id == "TASK-001").unwrap();
        assert_eq!(task1.status, "pending");
    }

    #[test]
    fn test_skip_node() {
        let pool = create_test_pool();
        let checkpoint = DagCheckpoint::new(pool);
        let schema = create_test_schema();

        let run_id = checkpoint.create_run(&schema, 3).unwrap();

        checkpoint.skip_node(&run_id, "TASK-002", "gate condition false").unwrap();

        let states = checkpoint.get_node_states(&run_id).unwrap();
        let task2 = states.iter().find(|s| s.node_id == "TASK-002").unwrap();
        assert_eq!(task2.status, "skipped");
        assert!(task2.error_msg.as_ref().unwrap().contains("gate condition"));
    }

    #[test]
    fn test_count_by_status() {
        let pool = create_test_pool();
        let checkpoint = DagCheckpoint::new(pool);
        let schema = create_test_schema();

        let run_id = checkpoint.create_run(&schema, 3).unwrap();

        // Complete one, leave one pending
        checkpoint.before_dispatch(&run_id, "TASK-001").unwrap();
        let result = NodeExecutionResult {
            node_id: "TASK-001".to_string(),
            success: true,
            exit_code: Some(0),
            stdout: String::new(),
            stderr: String::new(),
            error_msg: None,
            duration_ms: 100,
            is_gate: false,
            gate_passed: false,
        };
        checkpoint.after_complete(&run_id, "TASK-001", &result).unwrap();

        let counts = checkpoint.count_by_status(&run_id).unwrap();
        assert_eq!(counts.get("done"), Some(&1));
        assert_eq!(counts.get("pending"), Some(&1));
    }

    #[test]
    fn test_abort_run() {
        let pool = create_test_pool();
        let checkpoint = DagCheckpoint::new(pool);
        let schema = create_test_schema();

        let run_id = checkpoint.create_run(&schema, 3).unwrap();
        checkpoint.start_run(&run_id).unwrap();

        checkpoint.abort_run(&run_id, "user requested abort").unwrap();

        let run = checkpoint.get_run(&run_id).unwrap().unwrap();
        assert_eq!(run.status, "aborted");
        assert!(run.error_msg.as_ref().unwrap().contains("user requested"));
    }

    #[test]
    fn test_retry_increment() {
        let pool = create_test_pool();
        let checkpoint = DagCheckpoint::new(pool);
        let schema = create_test_schema();

        let run_id = checkpoint.create_run(&schema, 3).unwrap();

        // First dispatch
        checkpoint.before_dispatch(&run_id, "TASK-001").unwrap();
        let states = checkpoint.get_node_states(&run_id).unwrap();
        let task1 = states.iter().find(|s| s.node_id == "TASK-001").unwrap();
        assert_eq!(task1.attempt, 1);

        // Simulate failure + reset for retry
        checkpoint.reset_dispatched_nodes(&run_id).unwrap();

        // Second dispatch
        checkpoint.before_dispatch(&run_id, "TASK-001").unwrap();
        let states = checkpoint.get_node_states(&run_id).unwrap();
        let task1 = states.iter().find(|s| s.node_id == "TASK-001").unwrap();
        assert_eq!(task1.attempt, 2);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // TASK-656: Crash Safety Tests
    // ═══════════════════════════════════════════════════════════════════════════

    #[test]
    fn test_crash_safety_pragmas_applied() {
        let pool = create_test_pool();
        let _checkpoint = DagCheckpoint::new(pool.clone());

        // Verify pragmas were set correctly
        let conn = pool.get().unwrap();

        // Check synchronous mode (2 = FULL, 1 = NORMAL, 0 = OFF)
        let sync_mode: i32 = conn
            .query_row("PRAGMA synchronous", [], |row| row.get(0))
            .unwrap();
        assert_eq!(sync_mode, 2, "synchronous should be FULL (2)");

        // Note: In-memory SQLite doesn't support WAL mode (returns "memory")
        // WAL mode is only meaningful for file-based databases.
        // The pragma is still applied but has no effect on :memory: databases.
        let journal_mode: String = conn
            .query_row("PRAGMA journal_mode", [], |row| row.get(0))
            .unwrap();
        // For in-memory databases, journal_mode is "memory", not "wal"
        // This is expected behavior - WAL requires a file-based database
        assert!(
            journal_mode == "wal" || journal_mode == "memory",
            "journal_mode should be WAL (file) or memory (in-memory db), got: {}",
            journal_mode
        );
    }

    #[test]
    fn test_idempotency_key_available() {
        // Verify that (run_id, node_id, attempt) tuple is available for idempotency
        let pool = create_test_pool();
        let checkpoint = DagCheckpoint::new(pool);
        let schema = create_test_schema();

        let run_id = checkpoint.create_run(&schema, 3).unwrap();

        // Dispatch and get state
        checkpoint.before_dispatch(&run_id, "TASK-001").unwrap();
        let states = checkpoint.get_node_states(&run_id).unwrap();
        let task1 = states.iter().find(|s| s.node_id == "TASK-001").unwrap();

        // Verify idempotency key components are present
        assert!(!task1.run_id.is_empty(), "run_id should be present");
        assert!(!task1.node_id.is_empty(), "node_id should be present");
        assert!(task1.attempt >= 1, "attempt should be >= 1 after dispatch");

        // Simulate idempotency key generation
        let idem_key = format!("{}:{}:{}", task1.run_id, task1.node_id, task1.attempt);
        assert!(
            idem_key.contains(&run_id),
            "idempotency key should contain run_id"
        );
        assert!(
            idem_key.contains("TASK-001"),
            "idempotency key should contain node_id"
        );
    }

    #[test]
    fn test_crash_recovery_preserves_attempt_count() {
        // TASK-656: Verify attempt count is preserved across crash recovery
        let pool = create_test_pool();
        let checkpoint = DagCheckpoint::new(pool.clone());
        let schema = create_test_schema();

        let run_id = checkpoint.create_run(&schema, 3).unwrap();
        checkpoint.start_run(&run_id).unwrap();

        // First attempt - dispatch then simulate crash
        checkpoint.before_dispatch(&run_id, "TASK-001").unwrap();

        // Verify attempt = 1
        let states = checkpoint.get_node_states(&run_id).unwrap();
        let task1 = states.iter().find(|s| s.node_id == "TASK-001").unwrap();
        assert_eq!(task1.attempt, 1);

        // Simulate crash recovery: reset dispatched nodes
        checkpoint.reset_dispatched_nodes(&run_id).unwrap();

        // Second attempt
        checkpoint.before_dispatch(&run_id, "TASK-001").unwrap();

        // Verify attempt = 2 (preserved across recovery)
        let states = checkpoint.get_node_states(&run_id).unwrap();
        let task1 = states.iter().find(|s| s.node_id == "TASK-001").unwrap();
        assert_eq!(task1.attempt, 2, "attempt should increment on retry");

        // Third recovery cycle
        checkpoint.reset_dispatched_nodes(&run_id).unwrap();
        checkpoint.before_dispatch(&run_id, "TASK-001").unwrap();

        let states = checkpoint.get_node_states(&run_id).unwrap();
        let task1 = states.iter().find(|s| s.node_id == "TASK-001").unwrap();
        assert_eq!(task1.attempt, 3, "attempt should be 3 on third try");
    }
}
