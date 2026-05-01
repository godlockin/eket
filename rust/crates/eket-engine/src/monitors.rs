/// monitors.rs — 守护进程
///
/// HeartbeatMonitor: 定期扫描所有实例，TTL 超时则标记 offline + 发布事件
/// StaleCleaner:     定期扫描 in_progress ticket，文件 mtime 超时则重置为 todo
<<<<<<< HEAD
=======

>>>>>>> c4fd2af4b (feat(TASK-003): complete)
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use serde_json::json;
use tokio::task::AbortHandle;
use tracing::{debug, warn};

use eket_core::db::SqliteClient;
use eket_core::registry::InstanceRegistry;

use crate::event_bus::{events, DomainEvent, EventBus};

// ─── HeartbeatMonitor ─────────────────────────────────────────────────────────

pub struct HeartbeatMonitor {
    /// Used for listing ALL instances (including stale) — registry.discover() already filters by TTL
    db: Arc<SqliteClient>,
    registry: Arc<InstanceRegistry>,
    event_bus: Arc<EventBus>,
    check_interval: Duration,
    ttl: Duration,
}

impl HeartbeatMonitor {
    pub fn new(
        db: Arc<SqliteClient>,
        registry: Arc<InstanceRegistry>,
        event_bus: Arc<EventBus>,
    ) -> Self {
        Self {
            db,
            registry,
            event_bus,
            check_interval: Duration::from_secs(30),
            ttl: Duration::from_secs(90),
        }
    }

    /// 自定义间隔/TTL（测试用）
    pub fn with_intervals(mut self, check_interval: Duration, ttl: Duration) -> Self {
        self.check_interval = check_interval;
        self.ttl = ttl;
        self
    }

    /// 启动后台任务，返回 AbortHandle 用于停止
    pub fn start(self: Arc<Self>) -> AbortHandle {
        let handle = tokio::spawn(async move {
            let mut interval = tokio::time::interval(self.check_interval);
            loop {
                interval.tick().await;
                self.check_once().await;
            }
        });
        handle.abort_handle()
    }

    pub async fn check_once(&self) {
<<<<<<< HEAD
        // list_instances reads last_seen as i64 (unix ts), but InstanceRegistry stores as RFC3339.
        // Use direct SQL to handle both formats.
        struct RawInst {
            id: String,
            status: String,
            last_seen_str: Option<String>,
        }

        let db = Arc::clone(&self.db);
        let instances = match tokio::task::spawn_blocking(move || {
            let conn = db.pool().get()?;
            let mut stmt = conn.prepare(
                "SELECT id, status, CAST(last_seen AS TEXT) FROM slaver_instances",
            )?;
            let rows = stmt.query_map([], |row| {
                Ok(RawInst {
                    id: row.get(0)?,
                    status: row.get(1)?,
                    last_seen_str: row.get::<_, Option<String>>(2)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
            Ok::<_, eket_core::error::EketError>(rows)
        })
        .await
        {
            Ok(Ok(v)) => v,
            Ok(Err(e)) => {
                warn!("[HeartbeatMonitor] list_instances failed: {e}");
                return;
            }
            Err(e) => {
                warn!("[HeartbeatMonitor] spawn_blocking failed: {e}");
=======
        let instances = match self.db.list_instances(None) {
            Ok(v) => v,
            Err(e) => {
                warn!("[HeartbeatMonitor] list_instances failed: {e}");
>>>>>>> c4fd2af4b (feat(TASK-003): complete)
                return;
            }
        };

        let now_ts = chrono::Utc::now().timestamp();
        let ttl_secs = self.ttl.as_secs() as i64;

        for inst in instances {
            if inst.status == "offline" {
                continue;
            }
<<<<<<< HEAD
            // Parse last_seen: try i64 first, then RFC3339
            let last_seen_ts: Option<i64> = inst.last_seen_str.as_deref().and_then(|s| {
                s.parse::<i64>().ok().or_else(|| {
                    s.parse::<chrono::DateTime<chrono::Utc>>()
                        .ok()
                        .map(|dt| dt.timestamp())
                })
            });

            let stale = match last_seen_ts {
                Some(ts) => now_ts - ts > ttl_secs,
                None => true,
            };

=======
            let stale = match inst.last_seen {
                Some(ts) => now_ts - ts > ttl_secs,
                None => true, // no last_seen = assume stale
            };
>>>>>>> c4fd2af4b (feat(TASK-003): complete)
            if stale {
                debug!("[HeartbeatMonitor] marking offline: {}", inst.id);
                if let Err(e) = self.registry.mark_offline(&inst.id).await {
                    warn!("[HeartbeatMonitor] mark_offline({}) failed: {e}", inst.id);
                    continue;
                }
                let event = DomainEvent::new(
                    events::AGENT_OFFLINE,
                    json!({ "instance_id": inst.id }),
                    None,
                );
                self.event_bus.publish(event).await;
            }
        }
    }
}

// ─── StaleCleaner ─────────────────────────────────────────────────────────────

pub struct StaleCleaner {
    db: Arc<SqliteClient>,
    tickets_dir: PathBuf,
    event_bus: Arc<EventBus>,
    check_interval: Duration,
    stale_ttl: Duration,
}

impl StaleCleaner {
    pub fn new(db: Arc<SqliteClient>, tickets_dir: PathBuf, event_bus: Arc<EventBus>) -> Self {
        Self {
            db,
            tickets_dir,
            event_bus,
            check_interval: Duration::from_secs(60),
            stale_ttl: Duration::from_secs(30 * 60),
        }
    }

    /// 自定义间隔/TTL（测试用）
    pub fn with_intervals(mut self, check_interval: Duration, stale_ttl: Duration) -> Self {
        self.check_interval = check_interval;
        self.stale_ttl = stale_ttl;
        self
    }

    /// 启动后台任务，返回 AbortHandle 用于停止
    pub fn start(self: Arc<Self>) -> AbortHandle {
        let handle = tokio::spawn(async move {
            let mut interval = tokio::time::interval(self.check_interval);
            loop {
                interval.tick().await;
                self.check_once().await;
            }
        });
        handle.abort_handle()
    }

    pub async fn check_once(&self) {
        let tickets = match self.db.list_tickets(Some("in_progress"), None, None) {
            Ok(v) => v,
            Err(e) => {
                warn!("[StaleCleaner] list_tickets failed: {e}");
                return;
            }
        };

        for ticket in tickets {
            let path = self.tickets_dir.join(format!("{}.md", ticket.id));
            let elapsed = match std::fs::metadata(&path) {
                Ok(meta) => match meta.modified() {
                    Ok(mtime) => match mtime.elapsed() {
                        Ok(d) => d,
                        Err(_) => continue, // mtime in future
                    },
                    Err(e) => {
                        debug!("[StaleCleaner] mtime unavailable for {}: {e}", ticket.id);
                        continue;
                    }
                },
                Err(_) => {
                    // File missing — treat as stale
                    self.reset_ticket(&ticket.id).await;
                    continue;
                }
            };

            if elapsed > self.stale_ttl {
                self.reset_ticket(&ticket.id).await;
            }
        }
    }

    async fn reset_ticket(&self, ticket_id: &str) {
        debug!("[StaleCleaner] resetting stale ticket: {ticket_id}");
        if let Err(e) = self.db.update_ticket_status_str(ticket_id, "todo") {
            warn!("[StaleCleaner] update_ticket_status_str({ticket_id}) failed: {e}");
            return;
        }
        let event = DomainEvent::new(
            "task.stale",
            json!({ "ticket_id": ticket_id }),
            None,
        );
        self.event_bus.publish(event).await;
    }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    use std::sync::Arc;

    use eket_core::db::{create_pool, SqliteClient};
    use eket_core::redis::EketRedisClient;
    use eket_core::registry::{InstanceInfo, InstanceRegistry};
    use serde_json::json;

    fn make_db() -> Arc<SqliteClient> {
        let pool = create_pool(":memory:").expect("in-memory db");
        Arc::new(SqliteClient::new(pool))
    }

    fn make_registry(db: Arc<SqliteClient>) -> Arc<InstanceRegistry> {
        let redis = Arc::new(EketRedisClient::new_unavailable());
        Arc::new(InstanceRegistry::new(db, redis))
    }

    fn make_bus() -> Arc<EventBus> {
        Arc::new(EventBus::with_defaults())
    }

    fn sample_instance(id: &str) -> InstanceInfo {
        InstanceInfo {
            id: id.into(),
            role: "slaver".into(),
            skills: vec![],
            status: "idle".into(),
            last_seen: chrono::Utc::now(),
            metadata: json!({}),
        }
    }

    // ── HeartbeatMonitor ──────────────────────────────────────────────────────

    #[tokio::test]
    async fn heartbeat_monitor_marks_stale_offline() {
        let db = make_db();
        let registry = make_registry(Arc::clone(&db));
        let bus = make_bus();

        // Register fresh instance
        registry.register(sample_instance("inst-stale")).await.unwrap();

        // Backdate last_seen to 200s ago via direct SQL
        {
            let db2 = Arc::clone(&db);
            let old_ts = chrono::Utc::now().timestamp() - 200;
            tokio::task::spawn_blocking(move || {
                let conn = db2.pool().get().unwrap();
                conn.execute(
                    "UPDATE slaver_instances SET last_seen = ?1 WHERE id = 'inst-stale'",
                    rusqlite::params![old_ts],
                )
                .unwrap();
            })
            .await
            .unwrap();
        }

        let monitor = Arc::new(HeartbeatMonitor::new(
            Arc::clone(&db),
            Arc::clone(&registry),
            Arc::clone(&bus),
        ));
        monitor.check_once().await;

<<<<<<< HEAD
        // Check via direct SQL
        let status: String = tokio::task::spawn_blocking({
            let db2 = Arc::clone(&db);
            move || {
                let conn = db2.pool().get().unwrap();
                conn.query_row(
                    "SELECT status FROM slaver_instances WHERE id = 'inst-stale'",
                    [],
                    |r| r.get(0),
                )
                .unwrap()
            }
        })
        .await
        .unwrap();
        assert_eq!(status, "offline", "stale instance must be marked offline");
=======
        // Verify status = offline via direct DB query
        let inst = db.get_instance("inst-stale").unwrap().unwrap();
        assert_eq!(inst.status, "offline", "stale instance must be marked offline");
>>>>>>> c4fd2af4b (feat(TASK-003): complete)
    }

    #[tokio::test]
    async fn heartbeat_monitor_skips_fresh_instance() {
        let db = make_db();
        let registry = make_registry(Arc::clone(&db));
        let bus = make_bus();

        registry.register(sample_instance("inst-fresh")).await.unwrap();

        let monitor = Arc::new(HeartbeatMonitor::new(
            Arc::clone(&db),
            Arc::clone(&registry),
            Arc::clone(&bus),
        ));
        monitor.check_once().await;

<<<<<<< HEAD
        // Check via direct SQL (registry stores last_seen as RFC3339, db.get_instance expects i64)
        let status: String = tokio::task::spawn_blocking({
            let db2 = Arc::clone(&db);
            move || {
                let conn = db2.pool().get().unwrap();
                conn.query_row(
                    "SELECT status FROM slaver_instances WHERE id = 'inst-fresh'",
                    [],
                    |r| r.get(0),
                )
                .unwrap()
            }
        })
        .await
        .unwrap();
        assert_ne!(status, "offline", "fresh instance must not be marked offline");
=======
        let inst = db.get_instance("inst-fresh").unwrap().unwrap();
        assert_ne!(inst.status, "offline", "fresh instance must not be marked offline");
>>>>>>> c4fd2af4b (feat(TASK-003): complete)
    }

    #[tokio::test]
    async fn heartbeat_monitor_skips_already_offline() {
        let db = make_db();
        let registry = make_registry(Arc::clone(&db));
        let bus = make_bus();

        registry.register(sample_instance("inst-already-off")).await.unwrap();
        registry.mark_offline("inst-already-off").await.unwrap();

        // Backdate last_seen to trigger TTL if status check is missing
        {
            let db2 = Arc::clone(&db);
            let old_ts = chrono::Utc::now().timestamp() - 200;
            tokio::task::spawn_blocking(move || {
                let conn = db2.pool().get().unwrap();
                conn.execute(
                    "UPDATE slaver_instances SET last_seen = ?1 WHERE id = 'inst-already-off'",
                    rusqlite::params![old_ts],
                )
                .unwrap();
            })
            .await
            .unwrap();
        }

        let monitor = Arc::new(HeartbeatMonitor::new(
            Arc::clone(&db),
            Arc::clone(&registry),
            Arc::clone(&bus),
        ));
        // Should not error or double-publish
        monitor.check_once().await;

<<<<<<< HEAD
        let status: String = tokio::task::spawn_blocking({
            let db2 = Arc::clone(&db);
            move || {
                let conn = db2.pool().get().unwrap();
                conn.query_row(
                    "SELECT status FROM slaver_instances WHERE id = 'inst-already-off'",
                    [],
                    |r| r.get(0),
                )
                .unwrap()
            }
        })
        .await
        .unwrap();
        assert_eq!(status, "offline");
=======
        let inst = db.get_instance("inst-already-off").unwrap().unwrap();
        assert_eq!(inst.status, "offline");
>>>>>>> c4fd2af4b (feat(TASK-003): complete)
    }

    // ── StaleCleaner ─────────────────────────────────────────────────────────

    #[tokio::test]
    async fn stale_cleaner_resets_old_ticket() {
        let db = make_db();
        let bus = make_bus();

        db.create_ticket("T-stale", "Stale task", "P1", "task").unwrap();
        db.update_ticket_status_str("T-stale", "in_progress").unwrap();

        let dir = tempfile::tempdir().unwrap();
        let ticket_path = dir.path().join("T-stale.md");
        std::fs::write(&ticket_path, "# T-stale").unwrap();

        // Use tiny stale_ttl (1ms) + sleep 5ms to trigger stale detection
        tokio::time::sleep(Duration::from_millis(5)).await;

        let cleaner = Arc::new(
            StaleCleaner::new(Arc::clone(&db), dir.path().to_path_buf(), Arc::clone(&bus))
                .with_intervals(Duration::from_secs(60), Duration::from_millis(1)),
        );
        cleaner.check_once().await;

        let row = db.get_ticket_row("T-stale").unwrap().unwrap();
        assert_eq!(row.status, "todo", "stale ticket must be reset to todo");
    }

    #[tokio::test]
    async fn stale_cleaner_skips_recent_ticket() {
        let db = make_db();
        let bus = make_bus();

        db.create_ticket("T-fresh", "Fresh task", "P1", "task").unwrap();
        db.update_ticket_status_str("T-fresh", "in_progress").unwrap();

        let dir = tempfile::tempdir().unwrap();
        let ticket_path = dir.path().join("T-fresh.md");
        std::fs::write(&ticket_path, "# T-fresh").unwrap();

        // stale_ttl = 1h → file just written, won't be stale
        let cleaner = Arc::new(StaleCleaner::new(
            Arc::clone(&db),
            dir.path().to_path_buf(),
            Arc::clone(&bus),
        ));
        cleaner.check_once().await;

        let row = db.get_ticket_row("T-fresh").unwrap().unwrap();
        assert_eq!(row.status, "in_progress", "recent ticket must remain in_progress");
    }
}
