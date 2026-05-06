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

// ─── Row structs ─────────────────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct TicketRow {
    pub id: String,
    pub title: String,
    pub status: String,
    pub priority: String,
    pub assignee: Option<String>,
    pub ticket_type: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
    /// TASK-255
    pub source: String,
    /// TASK-256
    pub claimed_at: Option<String>,
    pub blocked_at: Option<String>,
    pub unblocked_at: Option<String>,
    pub completed_at: Option<String>,
}

#[derive(Debug, Clone)]
pub struct InstanceRow {
    pub id: String,
    pub role: String,
    pub skills: Vec<String>,
    pub status: String,
    pub last_seen: Option<String>,
}

#[derive(Debug, Clone)]
pub struct RetroRow {
    pub id: String,
    pub ticket_id: Option<String>,
    pub content: String,
    pub tags: Vec<String>,
    pub created_at: i64,
}

/// TrustScore 用的统计数据（从 slaver_instances 读取）
#[derive(Debug, Clone, Default)]
pub struct InstanceScoringStats {
    pub completed_count: i64,
    pub failed_count: i64,
    pub total_latency_ms: i64,
}

// ─── Pool factory ─────────────────────────────────────────────────────────────

/// 建立连接池，运行 schema 迁移
pub fn create_pool(db_path: &str) -> EketResult<DbPool> {
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

    // Backfill trust-score columns for pre-existing slaver_instances tables
    let existing_cols: Vec<String> = {
        let mut stmt = conn.prepare("PRAGMA table_info(slaver_instances)")?;
        let cols = stmt.query_map([], |row| row.get::<_, String>(1))?
            .collect::<Result<Vec<_>, _>>()?;
        cols
    };
    for (col, ddl) in &[
        ("completed_count",  "ALTER TABLE slaver_instances ADD COLUMN completed_count  INTEGER NOT NULL DEFAULT 0"),
        ("failed_count",     "ALTER TABLE slaver_instances ADD COLUMN failed_count     INTEGER NOT NULL DEFAULT 0"),
        ("total_latency_ms", "ALTER TABLE slaver_instances ADD COLUMN total_latency_ms INTEGER NOT NULL DEFAULT 0"),
    ] {
        if !existing_cols.iter().any(|c| c == col) {
            conn.execute_batch(ddl)?;
            debug!("Added column {col} to slaver_instances");
        }
    }

    // TASK-255 + TASK-256: Backfill tickets table columns (idempotent)
    let ticket_cols: Vec<String> = {
        let mut stmt = conn.prepare("PRAGMA table_info(tickets)")?;
        let cols = stmt.query_map([], |row| row.get::<_, String>(1))?
            .collect::<Result<Vec<_>, _>>()?;
        cols
    };
    for (col, ddl) in &[
        ("source",       "ALTER TABLE tickets ADD COLUMN source TEXT NOT NULL DEFAULT 'cli'"),
        ("claimed_at",   "ALTER TABLE tickets ADD COLUMN claimed_at   DATETIME"),
        ("blocked_at",   "ALTER TABLE tickets ADD COLUMN blocked_at   DATETIME"),
        ("unblocked_at", "ALTER TABLE tickets ADD COLUMN unblocked_at DATETIME"),
        ("completed_at", "ALTER TABLE tickets ADD COLUMN completed_at DATETIME"),
        ("type",         "ALTER TABLE tickets ADD COLUMN type TEXT NOT NULL DEFAULT 'feature'"),
        ("updated_at",   "ALTER TABLE tickets ADD COLUMN updated_at TEXT NOT NULL DEFAULT (datetime('now'))"),
    ] {
        if !ticket_cols.iter().any(|c| c == col) {
            conn.execute_batch(ddl)?;
            debug!("Added column {col} to tickets");
        }
    }
    // Source index (idempotent)
    conn.execute_batch(
        "CREATE INDEX IF NOT EXISTS idx_tickets_source ON tickets(source);"
    )?;

    // TASK-278: Migrate legacy priority values (INTEGER or numeric TEXT) to Px format
    conn.execute_batch(
        "UPDATE tickets SET priority =
            CASE
                WHEN typeof(priority) = 'integer' THEN
                    CASE CAST(priority AS INTEGER)
                        WHEN 0 THEN 'P0'
                        WHEN 1 THEN 'P1'
                        WHEN 2 THEN 'P2'
                        WHEN 3 THEN 'P3'
                        ELSE 'P2'
                    END
                WHEN priority GLOB '[0-3]' THEN
                    CASE priority
                        WHEN '0' THEN 'P0'
                        WHEN '1' THEN 'P1'
                        WHEN '2' THEN 'P2'
                        WHEN '3' THEN 'P3'
                    END
                ELSE priority
            END
        WHERE typeof(priority) = 'integer' OR priority GLOB '[0-3]';"
    )?;
    debug!("TASK-278: Migrated priority INTEGER/numeric TEXT → Px format");

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


    /// Expose pool for advanced consumers (e.g. registry).
    pub fn pool(&self) -> &DbPool {
        &self.pool
    }
    // ── Checkpoints ───────────────────────────────────────────────────────────

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

    // ── Tickets (legacy — uses Ticket type from types.rs) ─────────────────────

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
                source: Default::default(),
                claimed_at: None,
                blocked_at: None,
                unblocked_at: None,
                completed_at: None,
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
                source: Default::default(),
                claimed_at: None,
                blocked_at: None,
                unblocked_at: None,
                completed_at: None,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

        Ok(tickets)
    }

    // ── Ticket CRUD (TicketRow) ────────────────────────────────────────────────

    /// Create new ticket.
    pub fn create_ticket(
        &self,
        id: &str,
        title: &str,
        priority: &str,
        ticket_type: &str,
    ) -> EketResult<()> {
        let conn = self.pool.get()?;
        let now = chrono::Utc::now().to_rfc3339();
        conn.execute(
            "INSERT INTO tickets (id, title, priority, type, status, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, 'todo', ?5, ?5)",
            params![id, title, priority, ticket_type, now],
        )?;
        Ok(())
    }

    /// Create new ticket with explicit source (TASK-255).
    /// TASK-272: priority 直接存 TEXT (P0/P1/P2)，废弃 priority_text 列
    pub fn create_ticket_with_source(
        &self,
        id: &str,
        title: &str,
        priority: &str,
        ticket_type: &str,
        source: &str,
    ) -> EketResult<()> {
        let conn = self.pool.get()?;
        let now = chrono::Utc::now().to_rfc3339();

        conn.execute(
            "INSERT INTO tickets (id, title, priority, type, status, source, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, 'todo', ?5, ?6, ?6)",
            params![id, title, priority, ticket_type, source, now],
        )?;
        Ok(())
    }

    /// TASK-256: Write claimed_at when task is claimed.
    pub fn set_ticket_claimed_at(&self, id: &str) -> EketResult<bool> {
        let conn = self.pool.get()?;
        let now = chrono::Utc::now().to_rfc3339();
        let rows = conn.execute(
            "UPDATE tickets SET claimed_at = ?1, updated_at = ?1 WHERE id = ?2 AND claimed_at IS NULL",
            params![now, id],
        )?;
        Ok(rows > 0)
    }

    /// TASK-256: Write blocked_at when ticket enters blocked state.
    pub fn set_ticket_blocked_at(&self, id: &str) -> EketResult<bool> {
        let conn = self.pool.get()?;
        let now = chrono::Utc::now().to_rfc3339();
        let rows = conn.execute(
            "UPDATE tickets SET blocked_at = ?1, updated_at = ?1 WHERE id = ?2",
            params![now, id],
        )?;
        Ok(rows > 0)
    }

    /// TASK-256: Write unblocked_at when dependency is resolved.
    pub fn set_ticket_unblocked_at(&self, id: &str) -> EketResult<bool> {
        let conn = self.pool.get()?;
        let now = chrono::Utc::now().to_rfc3339();
        let rows = conn.execute(
            "UPDATE tickets SET unblocked_at = ?1, updated_at = ?1 WHERE id = ?2",
            params![now, id],
        )?;
        Ok(rows > 0)
    }

    /// TASK-256: Write completed_at when task is completed.
    pub fn set_ticket_completed_at(&self, id: &str) -> EketResult<bool> {
        let conn = self.pool.get()?;
        let now = chrono::Utc::now().to_rfc3339();
        let rows = conn.execute(
            "UPDATE tickets SET completed_at = ?1, updated_at = ?1 WHERE id = ?2 AND completed_at IS NULL",
            params![now, id],
        )?;
        Ok(rows > 0)
    }

    /// Get ticket as raw TicketRow.
    /// TASK-272: 直接读 priority (TEXT)，无需 fallback
    pub fn get_ticket_row(&self, id: &str) -> EketResult<Option<TicketRow>> {
        let conn = self.pool.get()?;
        let mut stmt = conn.prepare(
            "SELECT id, title, status, priority, assignee, type,
                    strftime('%s', created_at) as created_ts,
                    strftime('%s', updated_at) as updated_ts,
                    COALESCE(source, 'cli'),
                    claimed_at, blocked_at, unblocked_at, completed_at
             FROM tickets WHERE id = ?1",
        )?;
        let result = stmt.query_row(params![id], map_ticket_row);
        match result {
            Ok(r) => Ok(Some(r)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e.into()),
        }
    }

    /// List tickets with optional filters (status / assignee / priority).
    pub fn list_tickets(
        &self,
        status: Option<&str>,
        assignee: Option<&str>,
        priority: Option<&str>,
    ) -> EketResult<Vec<TicketRow>> {
        let conn = self.pool.get()?;

        let mut conditions: Vec<String> = Vec::new();
        let mut param_values: Vec<String> = Vec::new();

        if let Some(s) = status {
            param_values.push(s.to_owned());
            conditions.push(format!("status = ?{}", param_values.len()));
        }
        if let Some(a) = assignee {
            param_values.push(a.to_owned());
            conditions.push(format!("assignee = ?{}", param_values.len()));
        }
        if let Some(p) = priority {
            param_values.push(p.to_owned());
            conditions.push(format!("priority = ?{}", param_values.len()));
        }

        let where_clause = if conditions.is_empty() {
            String::new()
        } else {
            format!("WHERE {}", conditions.join(" AND "))
        };

        let sql = format!(
            "SELECT id, title, status, priority, assignee, type,
                    strftime('%s', created_at) as created_ts,
                    strftime('%s', updated_at) as updated_ts,
                    COALESCE(source, 'cli'),
                    claimed_at, blocked_at, unblocked_at, completed_at
             FROM tickets {where_clause}
             ORDER BY priority ASC, created_at ASC"
        );

        let mut stmt = conn.prepare(&sql)?;
        let rows = stmt
            .query_map(rusqlite::params_from_iter(param_values.iter()), map_ticket_row)?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    }

    /// Update ticket status (string). Returns true if updated.
    pub fn update_ticket_status_str(&self, id: &str, status: &str) -> EketResult<bool> {
        let conn = self.pool.get()?;
        let now = chrono::Utc::now().to_rfc3339();
        let rows = conn.execute(
            "UPDATE tickets SET status = ?1, updated_at = ?2 WHERE id = ?3",
            params![status, now, id],
        )?;
        Ok(rows > 0)
    }

    /// Update ticket assignee.
    pub fn update_ticket_assignee(&self, id: &str, assignee: &str) -> EketResult<bool> {
        let conn = self.pool.get()?;
        let now = chrono::Utc::now().to_rfc3339();
        let rows = conn.execute(
            "UPDATE tickets SET assignee = ?1, updated_at = ?2 WHERE id = ?3",
            params![assignee, now, id],
        )?;
        Ok(rows > 0)
    }

    /// Delete ticket by id.
    pub fn delete_ticket(&self, id: &str) -> EketResult<bool> {
        let conn = self.pool.get()?;
        let rows = conn.execute("DELETE FROM tickets WHERE id = ?1", params![id])?;
        Ok(rows > 0)
    }

    // ── Instance CRUD ─────────────────────────────────────────────────────────

    /// Upsert slaver instance.
    pub fn upsert_instance(
        &self,
        id: &str,
        role: &str,
        skills: &[String],
        status: &str,
    ) -> EketResult<()> {
        let conn = self.pool.get()?;
        let skills_json = serde_json::to_string(skills).unwrap_or_else(|_| "[]".to_owned());
        let now_rfc3339 = chrono::Utc::now().to_rfc3339();
        conn.execute(
            "INSERT INTO slaver_instances (id, role, skills_json, status, last_seen, metadata_json)
             VALUES (?1, ?2, ?3, ?4, ?5, '{}')
             ON CONFLICT(id) DO UPDATE SET
               role = excluded.role,
               skills_json = excluded.skills_json,
               status = excluded.status,
               last_seen = excluded.last_seen",
            params![id, role, skills_json, status, now_rfc3339],
        )?;
        Ok(())
    }

    /// Get instance by id.
    pub fn get_instance(&self, id: &str) -> EketResult<Option<InstanceRow>> {
        let conn = self.pool.get()?;
        let mut stmt = conn.prepare(
            "SELECT id, role, skills_json, status, last_seen FROM slaver_instances WHERE id = ?1",
        )?;
        let result = stmt.query_row(params![id], map_instance_row);
        match result {
            Ok(r) => Ok(Some(r)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e.into()),
        }
    }

    /// List instances with optional role filter.
    pub fn list_instances(&self, role_filter: Option<&str>) -> EketResult<Vec<InstanceRow>> {
        let conn = self.pool.get()?;
        if let Some(role) = role_filter {
            let mut stmt = conn.prepare(
                "SELECT id, role, skills_json, status, last_seen FROM slaver_instances
                 WHERE role = ?1 ORDER BY last_seen DESC",
            )?;
            let rows = stmt
                .query_map(params![role], map_instance_row)?
                .collect::<Result<Vec<_>, _>>()?;
            Ok(rows)
        } else {
            let mut stmt = conn.prepare(
                "SELECT id, role, skills_json, status, last_seen FROM slaver_instances
                 ORDER BY last_seen DESC",
            )?;
            let rows = stmt
                .query_map([], map_instance_row)?
                .collect::<Result<Vec<_>, _>>()?;
            Ok(rows)
        }
    }

    /// Update instance status.
    pub fn update_instance_status(&self, id: &str, status: &str) -> EketResult<bool> {
        let conn = self.pool.get()?;
        let rows = conn.execute(
            "UPDATE slaver_instances SET status = ?1 WHERE id = ?2",
            params![status, id],
        )?;
        Ok(rows > 0)
    }

    /// Update instance last_seen to current time in ISO 8601 format.
    pub fn update_instance_last_seen(&self, id: &str) -> EketResult<bool> {
        let conn = self.pool.get()?;
        let now_rfc3339 = chrono::Utc::now().to_rfc3339();
        let rows = conn.execute(
            "UPDATE slaver_instances SET last_seen = ?1 WHERE id = ?2",
            params![now_rfc3339, id],
        )?;
        Ok(rows > 0)
    }

    /// Delete instance.
    pub fn delete_instance(&self, id: &str) -> EketResult<bool> {
        let conn = self.pool.get()?;
        let rows = conn.execute(
            "DELETE FROM slaver_instances WHERE id = ?1",
            params![id],
        )?;
        Ok(rows > 0)
    }

    // ── Retro CRUD ────────────────────────────────────────────────────────────

    /// Insert retro. Returns generated UUID.
    pub fn insert_retro(
        &self,
        ticket_id: &str,
        content: &str,
        tags: &[String],
    ) -> EketResult<String> {
        let id = uuid::Uuid::new_v4().to_string();
        let conn = self.pool.get()?;
        let tags_json = serde_json::to_string(tags).unwrap_or_else(|_| "[]".to_owned());
        let now = chrono::Utc::now().to_rfc3339();
        conn.execute(
            "INSERT INTO retros (id, ticket_id, content, tags, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![id, ticket_id, content, tags_json, now],
        )?;
        Ok(id)
    }

    /// List retros with optional ticket_id filter.
    pub fn list_retros(&self, ticket_id: Option<&str>) -> EketResult<Vec<RetroRow>> {
        let conn = self.pool.get()?;
        if let Some(tid) = ticket_id {
            let mut stmt = conn.prepare(
                "SELECT id, ticket_id, content, tags,
                        strftime('%s', created_at) as created_ts
                 FROM retros WHERE ticket_id = ?1 ORDER BY created_at DESC",
            )?;
            let rows = stmt
                .query_map(params![tid], map_retro_row)?
                .collect::<Result<Vec<_>, _>>()?;
            Ok(rows)
        } else {
            let mut stmt = conn.prepare(
                "SELECT id, ticket_id, content, tags,
                        strftime('%s', created_at) as created_ts
                 FROM retros ORDER BY created_at DESC",
            )?;
            let rows = stmt
                .query_map([], map_retro_row)?
                .collect::<Result<Vec<_>, _>>()?;
            Ok(rows)
        }
    }

    /// Search retros by keyword in content or tags (LIKE).
    pub fn search_retros(&self, keyword: &str) -> EketResult<Vec<RetroRow>> {
        let conn = self.pool.get()?;
        let pattern = format!("%{keyword}%");
        let mut stmt = conn.prepare(
            "SELECT id, ticket_id, content, tags,
                    strftime('%s', created_at) as created_ts
             FROM retros
             WHERE content LIKE ?1 OR tags LIKE ?1
             ORDER BY created_at DESC",
        )?;
        let rows = stmt
            .query_map(params![pattern], map_retro_row)?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    }

    // ── Atomic claim ──────────────────────────────────────────────────────────

    /// Atomically claim a ticket: BEGIN IMMEDIATE → check → INSERT checkpoint.
    /// Returns true if claim succeeded, false if already claimed.
    pub fn claim_ticket_atomic(&self, ticket_id: &str, slaver_id: &str) -> EketResult<bool> {
        let conn = self.pool.get()?;
        conn.execute_batch("BEGIN IMMEDIATE")?;

        let existing: i64 = conn.query_row(
            "SELECT COUNT(*) FROM execution_checkpoints WHERE ticket_id = ?1",
            params![ticket_id],
            |r| r.get(0),
        ).unwrap_or(0);

        if existing > 0 {
            conn.execute_batch("ROLLBACK")?;
            return Ok(false);
        }

        let now = chrono::Utc::now().to_rfc3339();
        conn.execute(
            "INSERT INTO execution_checkpoints
             (ticket_id, slaver_id, phase, session_id, metadata, created_at, updated_at)
             VALUES (?1, ?2, 'claimed', NULL, NULL, ?3, ?3)",
            params![ticket_id, slaver_id, now],
        )?;

        conn.execute_batch("COMMIT")?;
        Ok(true)
    }

    /// Health check.
    pub fn ping(&self) -> EketResult<bool> {
        let conn = self.pool.get()?;
        let n: i64 = conn.query_row("SELECT 1", [], |r| r.get(0))?;
        Ok(n == 1)
    }

    // ─── TrustScore counters ──────────────────────────────────────────────────

    /// 完成任务时更新 completed_count 和 total_latency_ms。
    pub fn update_instance_completion(&self, id: &str, latency_ms: i64) -> EketResult<()> {
        let conn = self.pool.get()?;
        conn.execute(
            "UPDATE slaver_instances
             SET completed_count  = completed_count  + 1,
                 total_latency_ms = total_latency_ms + ?1
             WHERE id = ?2",
            params![latency_ms, id],
        )?;
        Ok(())
    }

    /// 任务失败/回滚时更新 failed_count。
    pub fn update_instance_failure(&self, id: &str) -> EketResult<()> {
        let conn = self.pool.get()?;
        conn.execute(
            "UPDATE slaver_instances SET failed_count = failed_count + 1 WHERE id = ?1",
            params![id],
        )?;
        Ok(())
    }

    /// 获取所有 instance 的评分统计数据（heartbeat 派送前调用）。
    pub fn get_all_instance_scoring_stats(
        &self,
    ) -> EketResult<std::collections::HashMap<String, InstanceScoringStats>> {
        let conn = self.pool.get()?;
        let mut stmt = conn.prepare(
            "SELECT id, completed_count, failed_count, total_latency_ms FROM slaver_instances",
        )?;
        let map = stmt
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    InstanceScoringStats {
                        completed_count:  row.get(1)?,
                        failed_count:     row.get(2)?,
                        total_latency_ms: row.get(3)?,
                    },
                ))
            })?
            .collect::<Result<std::collections::HashMap<_, _>, _>>()?;
        Ok(map)
    }
}

// ─── Row mappers ─────────────────────────────────────────────────────────────

fn map_ticket_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<TicketRow> {
    Ok(TicketRow {
        id: row.get(0)?,
        title: row.get(1)?,
        status: row.get(2)?,
        priority: row.get(3)?,
        assignee: row.get(4)?,
        ticket_type: row.get(5)?,
        created_at: row
            .get::<_, Option<String>>(6)?
            .and_then(|s| s.parse().ok())
            .unwrap_or(0),
        updated_at: row
            .get::<_, Option<String>>(7)?
            .and_then(|s| s.parse().ok())
            .unwrap_or(0),
        source: row.get::<_, Option<String>>(8)?.unwrap_or_else(|| "cli".to_owned()),
        claimed_at: row.get(9)?,
        blocked_at: row.get(10)?,
        unblocked_at: row.get(11)?,
        completed_at: row.get(12)?,
    })
}

fn map_instance_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<InstanceRow> {
    let skills_json: String =
        row.get::<_, Option<String>>(2)?.unwrap_or_else(|| "[]".to_owned());
    let skills: Vec<String> = serde_json::from_str(&skills_json).unwrap_or_default();
    Ok(InstanceRow {
        id: row.get(0)?,
        role: row.get(1)?,
        skills,
        status: row.get(3)?,
        last_seen: row.get::<_, Option<String>>(4)?,
    })
}

fn map_retro_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<RetroRow> {
    let tags_json: String =
        row.get::<_, Option<String>>(3)?.unwrap_or_else(|| "[]".to_owned());
    let tags: Vec<String> = serde_json::from_str(&tags_json).unwrap_or_default();
    Ok(RetroRow {
        id: row.get(0)?,
        ticket_id: row.get(1)?,
        content: row.get(2)?,
        tags,
        created_at: row
            .get::<_, Option<String>>(4)?
            .and_then(|s| s.parse().ok())
            .unwrap_or(0),
    })
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

    // ── checkpoint (existing) ─────────────────────────────────────────────────

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
        assert!(client.get_checkpoint("TASK-999", "nobody").unwrap().is_none());
    }

    #[test]
    fn atomic_claim_first_slaver_wins() {
        let client = make_client();
        assert!(client.claim_ticket_atomic("TASK-001", "slaver_1").unwrap());
        assert!(!client.claim_ticket_atomic("TASK-001", "slaver_2").unwrap());
    }

    #[test]
    fn atomic_claim_different_tickets_independent() {
        let client = make_client();
        assert!(client.claim_ticket_atomic("TASK-001", "slaver_1").unwrap());
        assert!(client.claim_ticket_atomic("TASK-002", "slaver_2").unwrap());
    }

    #[test]
    fn atomic_claim_same_slaver_same_ticket_idempotent() {
        let client = make_client();
        assert!(client.claim_ticket_atomic("TASK-001", "slaver_1").unwrap());
        // Same slaver re-claiming same ticket = already exists → false
        assert!(!client.claim_ticket_atomic("TASK-001", "slaver_1").unwrap());
    }

    // ── Ticket CRUD ───────────────────────────────────────────────────────────

    #[test]
    fn ticket_create_and_get() {
        let client = make_client();
        client.create_ticket("T-1", "Fix bug", "P1", "bug").unwrap();
        let row = client.get_ticket_row("T-1").unwrap();
        assert!(row.is_some());
        let row = row.unwrap();
        assert_eq!(row.id, "T-1");
        assert_eq!(row.title, "Fix bug");
        assert_eq!(row.status, "todo");
        assert_eq!(row.priority, "P1");
        assert_eq!(row.ticket_type.as_deref(), Some("bug"));
    }

    #[test]
    fn ticket_get_nonexistent_returns_none() {
        let client = make_client();
        assert!(client.get_ticket_row("NOT-EXIST").unwrap().is_none());
    }

    #[test]
    fn ticket_list_with_filters() {
        let client = make_client();
        client.create_ticket("T-1", "Alpha", "P1", "bug").unwrap();
        client.create_ticket("T-2", "Beta", "P2", "feature").unwrap();
        client.update_ticket_status_str("T-1", "in_progress").unwrap();

        let all = client.list_tickets(None, None, None).unwrap();
        assert_eq!(all.len(), 2);

        let in_progress = client.list_tickets(Some("in_progress"), None, None).unwrap();
        assert_eq!(in_progress.len(), 1);
        assert_eq!(in_progress[0].id, "T-1");

        let todo = client.list_tickets(Some("todo"), None, None).unwrap();
        assert_eq!(todo.len(), 1);
        assert_eq!(todo[0].id, "T-2");
    }

    #[test]
    fn ticket_update_status_and_assignee() {
        let client = make_client();
        client.create_ticket("T-3", "Gamma", "P2", "task").unwrap();
        assert!(client.update_ticket_status_str("T-3", "review").unwrap());
        assert!(client.update_ticket_assignee("T-3", "slaver_5").unwrap());
        let row = client.get_ticket_row("T-3").unwrap().unwrap();
        assert_eq!(row.status, "review");
        assert_eq!(row.assignee.as_deref(), Some("slaver_5"));
    }

    #[test]
    fn ticket_delete() {
        let client = make_client();
        client.create_ticket("T-4", "Delete me", "P3", "chore").unwrap();
        assert!(client.delete_ticket("T-4").unwrap());
        assert!(client.get_ticket_row("T-4").unwrap().is_none());
        assert!(!client.delete_ticket("T-4").unwrap());
    }

    // ── Instance CRUD ─────────────────────────────────────────────────────────

    #[test]
    fn instance_upsert_and_get() {
        let client = make_client();
        let skills = vec!["rust".to_owned(), "sql".to_owned()];
        client.upsert_instance("inst-1", "slaver", &skills, "idle").unwrap();
        let inst = client.get_instance("inst-1").unwrap().unwrap();
        assert_eq!(inst.role, "slaver");
        assert_eq!(inst.skills, skills);
        assert_eq!(inst.status, "idle");
    }

    #[test]
    fn instance_upsert_updates_existing() {
        let client = make_client();
        client.upsert_instance("inst-2", "slaver", &[], "idle").unwrap();
        client
            .upsert_instance("inst-2", "master", &["planning".to_owned()], "busy")
            .unwrap();
        let inst = client.get_instance("inst-2").unwrap().unwrap();
        assert_eq!(inst.role, "master");
        assert_eq!(inst.status, "busy");
    }

    #[test]
    fn instance_list_with_role_filter() {
        let client = make_client();
        client.upsert_instance("inst-3", "slaver", &[], "idle").unwrap();
        client.upsert_instance("inst-4", "master", &[], "idle").unwrap();
        let slavers = client.list_instances(Some("slaver")).unwrap();
        assert_eq!(slavers.len(), 1);
        assert_eq!(slavers[0].id, "inst-3");
        let all = client.list_instances(None).unwrap();
        assert_eq!(all.len(), 2);
    }

    #[test]
    fn instance_update_status_and_last_seen() {
        let client = make_client();
        client.upsert_instance("inst-5", "slaver", &[], "idle").unwrap();
        assert!(client.update_instance_status("inst-5", "busy").unwrap());
        assert!(client.update_instance_last_seen("inst-5").unwrap());
        let inst = client.get_instance("inst-5").unwrap().unwrap();
        assert_eq!(inst.status, "busy");
        assert!(inst.last_seen.is_some());
    }

    #[test]
    fn instance_delete() {
        let client = make_client();
        client.upsert_instance("inst-6", "slaver", &[], "idle").unwrap();
        assert!(client.delete_instance("inst-6").unwrap());
        assert!(client.get_instance("inst-6").unwrap().is_none());
    }

    // ── Retro CRUD ────────────────────────────────────────────────────────────

    #[test]
    fn retro_insert_and_list() {
        let client = make_client();
        let tags = vec!["perf".to_owned(), "db".to_owned()];
        let id = client
            .insert_retro("TASK-10", "Great progress", &tags)
            .unwrap();
        assert!(!id.is_empty());
        let retros = client.list_retros(Some("TASK-10")).unwrap();
        assert_eq!(retros.len(), 1);
        assert_eq!(retros[0].content, "Great progress");
        assert_eq!(retros[0].tags, tags);
    }

    #[test]
    fn retro_list_all() {
        let client = make_client();
        client.insert_retro("TASK-1", "content A", &[]).unwrap();
        client.insert_retro("TASK-2", "content B", &[]).unwrap();
        let all = client.list_retros(None).unwrap();
        assert_eq!(all.len(), 2);
    }

    #[test]
    fn retro_search_by_content() {
        let client = make_client();
        client
            .insert_retro("TASK-1", "memory leak fixed", &[])
            .unwrap();
        client
            .insert_retro("TASK-2", "UI redesign done", &[])
            .unwrap();
        let results = client.search_retros("leak").unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].ticket_id.as_deref(), Some("TASK-1"));
    }

    #[test]
    fn retro_search_no_match() {
        let client = make_client();
        client.insert_retro("TASK-1", "hello world", &[]).unwrap();
        let empty = client.search_retros("nonexistent_xyz_abc").unwrap();
        assert!(empty.is_empty());
    }

    // ── TASK-278: Priority migration tests ───────────────────────────────────

    #[test]
    fn priority_migration_numeric_text_to_px() {
        let client = make_client();

        // Directly create tickets with legacy numeric TEXT priorities via raw SQL
        // (bypassing create_ticket() to simulate pre-TASK-278 data)
        {
            let conn = client.pool().get().unwrap();
            conn.execute_batch(
                "INSERT INTO tickets (id, title, priority, type, status, created_at, updated_at)
                 VALUES
                   ('T-LEG-1', 'Legacy 1', '1', 'task', 'todo', datetime('now'), datetime('now')),
                   ('T-LEG-2', 'Legacy 2', '2', 'bug', 'todo', datetime('now'), datetime('now')),
                   ('T-LEG-0', 'Legacy 0', '0', 'critical', 'todo', datetime('now'), datetime('now'));"
            ).unwrap();

            // Run migration (simulate startup migration)
            conn.execute_batch(
                "UPDATE tickets SET priority =
                    CASE
                        WHEN typeof(priority) = 'integer' THEN
                            CASE CAST(priority AS INTEGER)
                                WHEN 0 THEN 'P0'
                                WHEN 1 THEN 'P1'
                                WHEN 2 THEN 'P2'
                                WHEN 3 THEN 'P3'
                                ELSE 'P2'
                            END
                        WHEN priority GLOB '[0-3]' THEN
                            CASE priority
                                WHEN '0' THEN 'P0'
                                WHEN '1' THEN 'P1'
                                WHEN '2' THEN 'P2'
                                WHEN '3' THEN 'P3'
                            END
                        ELSE priority
                    END
                WHERE typeof(priority) = 'integer' OR priority GLOB '[0-3]';"
            ).unwrap();
        }

        // Verify migration
        let t1 = client.get_ticket_row("T-LEG-1").unwrap().unwrap();
        let t2 = client.get_ticket_row("T-LEG-2").unwrap().unwrap();
        let t0 = client.get_ticket_row("T-LEG-0").unwrap().unwrap();

        assert_eq!(t1.priority, "P1");
        assert_eq!(t2.priority, "P2");
        assert_eq!(t0.priority, "P0");
    }

    #[test]
    fn priority_order_by_works_correctly() {
        let client = make_client();
        client.create_ticket("T-P2", "Priority 2", "P2", "task").unwrap();
        client.create_ticket("T-P0", "Priority 0", "P0", "bug").unwrap();
        client.create_ticket("T-P1", "Priority 1", "P1", "feature").unwrap();

        let all = client.list_tickets(None, None, None).unwrap();
        assert_eq!(all.len(), 3);

        // Verify ORDER BY priority ASC: P0 < P1 < P2 (lexicographic)
        assert_eq!(all[0].id, "T-P0", "P0 should be first");
        assert_eq!(all[1].id, "T-P1", "P1 should be second");
        assert_eq!(all[2].id, "T-P2", "P2 should be third");
    }
}
