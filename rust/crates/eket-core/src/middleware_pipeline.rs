/// Middleware pipeline for EKET commands.
///
/// Provides pre/post hooks around command execution:
/// - AuditMiddleware: logs to SQLite audit_log table
/// - TimingMiddleware: records elapsed_ms in ctx.metadata
use async_trait::async_trait;
use std::sync::Arc;

use crate::db::DbPool;

// ─── Context ──────────────────────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct PipelineCtx {
    pub command: String,
    pub ticket_id: Option<String>,
    pub slaver_id: Option<String>,
    pub metadata: serde_json::Value,
    pub started_at: std::time::Instant,
}

impl PipelineCtx {
    pub fn new(command: impl Into<String>) -> Self {
        Self {
            command: command.into(),
            ticket_id: None,
            slaver_id: None,
            metadata: serde_json::Value::Object(serde_json::Map::new()),
            started_at: std::time::Instant::now(),
        }
    }
}

// ─── Trait ────────────────────────────────────────────────────────────────────

#[async_trait]
pub trait Middleware: Send + Sync {
    fn name(&self) -> &str;
    async fn pre(&self, ctx: &mut PipelineCtx) -> anyhow::Result<()>;
    async fn post(&self, ctx: &mut PipelineCtx) -> anyhow::Result<()>;
}

// ─── Pipeline ─────────────────────────────────────────────────────────────────

pub struct Pipeline {
    pub middlewares: Vec<Arc<dyn Middleware>>,
}

impl Pipeline {
    pub fn new() -> Self {
        Self { middlewares: Vec::new() }
    }

    pub fn add_middleware(mut self, m: impl Middleware + 'static) -> Self {
        self.middlewares.push(Arc::new(m));
        self
    }

    pub async fn run_pre(&self, ctx: &mut PipelineCtx) -> anyhow::Result<()> {
        for m in &self.middlewares {
            m.pre(ctx).await?;
        }
        Ok(())
    }

    pub async fn run_post(&self, ctx: &mut PipelineCtx) -> anyhow::Result<()> {
        for m in &self.middlewares {
            m.post(ctx).await?;
        }
        Ok(())
    }
}

impl Default for Pipeline {
    fn default() -> Self {
        Self::new()
    }
}

// ─── TimingMiddleware ─────────────────────────────────────────────────────────

/// Records elapsed_ms in ctx.metadata after command execution.
pub struct TimingMiddleware;

#[async_trait]
impl Middleware for TimingMiddleware {
    fn name(&self) -> &str {
        "timing"
    }

    async fn pre(&self, _ctx: &mut PipelineCtx) -> anyhow::Result<()> {
        // started_at already set in PipelineCtx::new
        Ok(())
    }

    async fn post(&self, ctx: &mut PipelineCtx) -> anyhow::Result<()> {
        let elapsed_ms = ctx.started_at.elapsed().as_millis() as u64;
        if let serde_json::Value::Object(ref mut map) = ctx.metadata {
            map.insert("elapsed_ms".to_string(), serde_json::json!(elapsed_ms));
        }
        Ok(())
    }
}

// ─── AuditMiddleware ──────────────────────────────────────────────────────────

/// Logs command execution to SQLite audit_log table.
pub struct AuditMiddleware {
    pool: DbPool,
}

impl AuditMiddleware {
    pub fn new(pool: DbPool) -> Self {
        Self { pool }
    }

    fn ensure_table(conn: &rusqlite::Connection) -> anyhow::Result<()> {
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS audit_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                command TEXT NOT NULL,
                ticket_id TEXT,
                slaver_id TEXT,
                elapsed_ms INTEGER,
                created_at TEXT NOT NULL
            );",
        )?;
        Ok(())
    }
}

#[async_trait]
impl Middleware for AuditMiddleware {
    fn name(&self) -> &str {
        "audit"
    }

    async fn pre(&self, _ctx: &mut PipelineCtx) -> anyhow::Result<()> {
        // Record start time (already in ctx.started_at)
        Ok(())
    }

    async fn post(&self, ctx: &mut PipelineCtx) -> anyhow::Result<()> {
        let elapsed_ms = ctx.started_at.elapsed().as_millis() as i64;
        let created_at = chrono::Utc::now().to_rfc3339();

        let command = ctx.command.clone();
        let ticket_id = ctx.ticket_id.clone();
        let slaver_id = ctx.slaver_id.clone();

        let conn = self.pool.get().map_err(|e| anyhow::anyhow!("DB pool error: {e}"))?;
        Self::ensure_table(&conn)?;
        conn.execute(
            "INSERT INTO audit_log (command, ticket_id, slaver_id, elapsed_ms, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
            rusqlite::params![command, ticket_id, slaver_id, elapsed_ms, created_at],
        )?;
        Ok(())
    }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn pipeline_timing() {
        let pipeline = Pipeline::new().add_middleware(TimingMiddleware);
        let mut ctx = PipelineCtx::new("test");
        ctx.ticket_id = Some("TASK-001".to_string());

        pipeline.run_pre(&mut ctx).await.unwrap();
        // Simulate some work
        tokio::time::sleep(std::time::Duration::from_millis(5)).await;
        pipeline.run_post(&mut ctx).await.unwrap();

        let elapsed = ctx.metadata["elapsed_ms"].as_u64().expect("elapsed_ms missing");
        assert!(elapsed > 0, "elapsed_ms should be > 0, got {elapsed}");
    }

    #[tokio::test]
    async fn pipeline_audit() {
        let dir = tempfile::tempdir().unwrap();
        let db_path = dir.path().join("test.db").to_string_lossy().to_string();

        let pool = crate::db::create_pool(&db_path).expect("create pool");

        let pipeline = Pipeline::new()
            .add_middleware(TimingMiddleware)
            .add_middleware(AuditMiddleware::new(pool.clone()));

        let mut ctx = PipelineCtx::new("claim");
        ctx.ticket_id = Some("TASK-226".to_string());
        ctx.slaver_id = Some("slaver_test".to_string());

        pipeline.run_pre(&mut ctx).await.unwrap();
        pipeline.run_post(&mut ctx).await.unwrap();

        // Verify audit_log has a record
        let conn = pool.get().unwrap();
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM audit_log", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 1, "audit_log should have 1 record");

        let (cmd, ticket_id): (String, Option<String>) = conn
            .query_row(
                "SELECT command, ticket_id FROM audit_log LIMIT 1",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!(cmd, "claim");
        assert_eq!(ticket_id.as_deref(), Some("TASK-226"));
    }
}
