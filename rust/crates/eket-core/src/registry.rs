/// InstanceRegistry — 对应 TS: instance-registry.ts
///
/// SQLite 主存储 + Redis 缓存/TTL，Redis 不可用时降级到纯 SQLite。
use std::sync::Arc;

use chrono::{DateTime, Utc};
use rusqlite::params;
use serde_json::Value;
use tracing::{debug, warn};

use crate::db::SqliteClient;
use crate::error::{EketError, EketResult};
use crate::redis::EketRedisClient;

const HEARTBEAT_TTL_SECS: u64 = 90;
const REDIS_KEY_PREFIX: &str = "eket:instance:";

// ─── InstanceInfo ─────────────────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct InstanceInfo {
    pub id: String,
    pub role: String,
    pub skills: Vec<String>,
    pub status: String, // "idle" | "busy" | "offline"
    pub last_seen: DateTime<Utc>,
    pub metadata: Value,
}

// ─── InstanceRegistry ────────────────────────────────────────────────────────

pub struct InstanceRegistry {
    db: Arc<SqliteClient>,
    redis: Arc<EketRedisClient>,
}

impl InstanceRegistry {
    pub fn new(db: Arc<SqliteClient>, redis: Arc<EketRedisClient>) -> Self {
        Self { db, redis }
    }

    /// Register or update an instance (upsert).
    pub async fn register(&self, instance: InstanceInfo) -> EketResult<()> {
        let db = Arc::clone(&self.db);
        let info = instance.clone();

        tokio::task::spawn_blocking(move || {
            let conn = db.pool().get()?;
            conn.execute(
                "INSERT INTO slaver_instances (id, role, skills_json, status, last_seen, metadata_json)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)
                 ON CONFLICT(id) DO UPDATE SET
                   role      = excluded.role,
                   skills_json = excluded.skills_json,
                   status    = excluded.status,
                   last_seen = excluded.last_seen,
                   metadata_json  = excluded.metadata_json",
                params![
                    info.id,
                    info.role,
                    serde_json::to_string(&info.skills).unwrap_or_else(|_| "[]".into()),
                    info.status,
                    info.last_seen.to_rfc3339(),
                    info.metadata.to_string(),
                ],
            )?;
            Ok::<_, EketError>(())
        })
        .await
        .map_err(|e| EketError::Other(e.to_string()))??;

        // Redis cache — degraded gracefully
        if self.redis.is_available() {
            let key = format!("{}{}", REDIS_KEY_PREFIX, instance.id);
            let val = serde_json::json!({
                "id": instance.id,
                "role": instance.role,
                "skills": instance.skills,
                "status": instance.status,
                "last_seen": instance.last_seen.to_rfc3339(),
                "metadata": instance.metadata,
            })
            .to_string();
            if let Err(e) = self.redis.set(&key, &val, Some(HEARTBEAT_TTL_SECS)).await {
                warn!("Redis register failed (degraded to SQLite-only): {e}");
            }
        }

        debug!("Registered instance: {}", instance.id);
        Ok(())
    }

    /// Refresh last_seen timestamp and extend Redis TTL.
    pub async fn heartbeat(&self, instance_id: &str) -> EketResult<()> {
        let db = Arc::clone(&self.db);
        let id = instance_id.to_string();
        let now = Utc::now().to_rfc3339();

        tokio::task::spawn_blocking(move || {
            let conn = db.pool().get()?;
            let rows = conn.execute(
                "UPDATE slaver_instances SET last_seen = ?1 WHERE id = ?2",
                params![now, id],
            )?;
            if rows == 0 {
                return Err(EketError::NotFound(format!("instance {id}")));
            }
            Ok::<_, EketError>(())
        })
        .await
        .map_err(|e| EketError::Other(e.to_string()))??;

        // Extend Redis TTL
        if self.redis.is_available() {
            let key = format!("{}{}", REDIS_KEY_PREFIX, instance_id);
            // Re-fetch current value to set new expiry (EXPIRE-like via SET with new TTL)
            if let Ok(Some(val)) = self.redis.get(&key).await {
                let _ = self
                    .redis
                    .set(&key, &val, Some(HEARTBEAT_TTL_SECS))
                    .await;
            }
        }

        debug!("Heartbeat: {}", instance_id);
        Ok(())
    }

    /// Discover active instances (last_seen within 90s). Optional role filter.
    pub async fn discover(&self, role_filter: Option<&str>) -> EketResult<Vec<InstanceInfo>> {
        let db = Arc::clone(&self.db);
        let role = role_filter.map(|r| r.to_string());

        tokio::task::spawn_blocking(move || {
            let conn = db.pool().get()?;
            let cutoff = (Utc::now() - chrono::Duration::seconds(HEARTBEAT_TTL_SECS as i64))
                .to_rfc3339();

            let (sql, params_vec): (String, Vec<String>) = match &role {
                Some(r) => (
                    "SELECT id, role, skills_json, status, last_seen, metadata_json
                     FROM slaver_instances
                     WHERE last_seen > ?1 AND role = ?2 AND status != 'offline'"
                        .into(),
                    vec![cutoff, r.clone()],
                ),
                None => (
                    "SELECT id, role, skills_json, status, last_seen, metadata_json
                     FROM slaver_instances
                     WHERE last_seen > ?1 AND status != 'offline'"
                        .into(),
                    vec![cutoff],
                ),
            };

            let mut stmt = conn.prepare(&sql)?;
            let rows = match params_vec.len() {
                1 => stmt.query_map(params![params_vec[0]], row_to_info)?,
                2 => stmt.query_map(params![params_vec[0], params_vec[1]], row_to_info)?,
                _ => unreachable!(),
            };

            rows.collect::<Result<Vec<_>, _>>().map_err(EketError::from)
        })
        .await
        .map_err(|e| EketError::Other(e.to_string()))?
    }

    /// Mark instance as offline.
    pub async fn mark_offline(&self, instance_id: &str) -> EketResult<()> {
        let db = Arc::clone(&self.db);
        let id = instance_id.to_string();

        tokio::task::spawn_blocking(move || {
            let conn = db.pool().get()?;
            conn.execute(
                "UPDATE slaver_instances SET status = 'offline' WHERE id = ?1",
                params![id],
            )?;
            Ok::<_, EketError>(())
        })
        .await
        .map_err(|e| EketError::Other(e.to_string()))??;

        // Remove Redis cache entry
        if self.redis.is_available() {
            let key = format!("{}{}", REDIS_KEY_PREFIX, instance_id);
            let _ = self.redis.del(&key).await;
        }

        debug!("Marked offline: {}", instance_id);
        Ok(())
    }

    /// Save execution state for a ticket (upsert).
    pub async fn save_execution_state(
        &self,
        ticket_id: &str,
        slaver_id: &str,
        state: Value,
    ) -> EketResult<()> {
        let db = Arc::clone(&self.db);
        let tid = ticket_id.to_string();
        let sid = slaver_id.to_string();
        let now = Utc::now().timestamp();

        tokio::task::spawn_blocking(move || {
            let conn = db.pool().get()?;
            conn.execute(
                "INSERT INTO instance_execution_states (ticket_id, slaver_id, state_json, updated_at)
                 VALUES (?1, ?2, ?3, ?4)
                 ON CONFLICT(ticket_id) DO UPDATE SET
                   slaver_id  = excluded.slaver_id,
                   state_json = excluded.state_json,
                   updated_at = excluded.updated_at",
                params![tid, sid, state.to_string(), now],
            )?;
            Ok::<_, EketError>(())
        })
        .await
        .map_err(|e| EketError::Other(e.to_string()))?
    }

    /// Get execution state for a ticket.
    pub async fn get_execution_state(&self, ticket_id: &str) -> EketResult<Option<Value>> {
        let db = Arc::clone(&self.db);
        let tid = ticket_id.to_string();

        tokio::task::spawn_blocking(move || {
            let conn = db.pool().get()?;
            let mut stmt = conn.prepare(
                "SELECT state_json FROM instance_execution_states WHERE ticket_id = ?1",
            )?;
            let result = stmt.query_row(params![tid], |row| row.get::<_, String>(0));
            match result {
                Ok(s) => {
                    let v: Value = serde_json::from_str(&s)
                        .map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
                    Ok(Some(v))
                }
                Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
                Err(e) => Err(EketError::from(e)),
            }
        })
        .await
        .map_err(|e| EketError::Other(e.to_string()))?
    }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

fn row_to_info(row: &rusqlite::Row<'_>) -> rusqlite::Result<InstanceInfo> {
    let skills_str: String = row.get(2)?;
    let metadata_str: Option<String> = row.get(5)?;
    let last_seen_str: String = row.get(4)?;

    Ok(InstanceInfo {
        id: row.get(0)?,
        role: row.get(1)?,
        skills: serde_json::from_str(&skills_str).unwrap_or_default(),
        status: row.get(3)?,
        last_seen: last_seen_str
            .parse::<DateTime<Utc>>()
            .unwrap_or_else(|_| Utc::now()),
        metadata: metadata_str
            .as_deref()
            .and_then(|s| serde_json::from_str(s).ok())
            .unwrap_or(Value::Null),
    })
}

// ─── Tests ───────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::create_pool;
    use serde_json::json;

    fn make_registry() -> InstanceRegistry {
        let pool = create_pool(":memory:").expect("in-memory db");
        let db = Arc::new(SqliteClient::new(pool));
        let redis = Arc::new(EketRedisClient::new_unavailable());
        InstanceRegistry::new(db, redis)
    }

    fn sample_instance(id: &str, role: &str, status: &str) -> InstanceInfo {
        InstanceInfo {
            id: id.into(),
            role: role.into(),
            skills: vec!["coding".into(), "review".into()],
            status: status.into(),
            last_seen: Utc::now(),
            metadata: json!({"version": "1.0"}),
        }
    }

    #[tokio::test]
    async fn test_register_and_discover() {
        let reg = make_registry();
        reg.register(sample_instance("inst-1", "slaver", "idle"))
            .await
            .unwrap();

        let all = reg.discover(None).await.unwrap();
        assert_eq!(all.len(), 1);
        assert_eq!(all[0].id, "inst-1");
        assert_eq!(all[0].role, "slaver");
    }

    #[tokio::test]
    async fn test_discover_role_filter() {
        let reg = make_registry();
        reg.register(sample_instance("inst-1", "slaver", "idle"))
            .await
            .unwrap();
        reg.register(sample_instance("inst-2", "master", "idle"))
            .await
            .unwrap();

        let slavers = reg.discover(Some("slaver")).await.unwrap();
        assert_eq!(slavers.len(), 1);
        assert_eq!(slavers[0].id, "inst-1");

        let masters = reg.discover(Some("master")).await.unwrap();
        assert_eq!(masters.len(), 1);
        assert_eq!(masters[0].id, "inst-2");
    }

    #[tokio::test]
    async fn test_heartbeat_updates_last_seen() {
        let reg = make_registry();
        reg.register(sample_instance("inst-hb", "slaver", "idle"))
            .await
            .unwrap();

        // Should not error
        reg.heartbeat("inst-hb").await.unwrap();

        let all = reg.discover(None).await.unwrap();
        assert_eq!(all.len(), 1);
    }

    #[tokio::test]
    async fn test_heartbeat_unknown_instance_errors() {
        let reg = make_registry();
        let result = reg.heartbeat("ghost-instance").await;
        assert!(result.is_err());
        matches!(result.unwrap_err(), EketError::NotFound(_));
    }

    #[tokio::test]
    async fn test_mark_offline_excludes_from_discover() {
        let reg = make_registry();
        reg.register(sample_instance("inst-off", "slaver", "idle"))
            .await
            .unwrap();

        reg.mark_offline("inst-off").await.unwrap();
        let all = reg.discover(None).await.unwrap();
        assert!(all.is_empty(), "offline instances must not appear in discover");
    }

    #[tokio::test]
    async fn test_ttl_offline_discover() {
        let reg = make_registry();
        // Insert instance with last_seen far in the past (> 90s ago)
        {
            let db = Arc::clone(&reg.db);
            let old_ts = (Utc::now() - chrono::Duration::seconds(200)).to_rfc3339();
            tokio::task::spawn_blocking(move || {
                let conn = db.pool().get().unwrap();
                conn.execute(
                    "INSERT INTO slaver_instances (id, role, skills_json, status, last_seen, metadata_json)
                     VALUES ('old-inst', 'slaver', '[]', 'idle', ?1, '{}')",
                    params![old_ts],
                )
                .unwrap();
            })
            .await
            .unwrap();
        }

        let all = reg.discover(None).await.unwrap();
        assert!(
            all.iter().all(|i| i.id != "old-inst"),
            "stale instance must not appear in discover"
        );
    }

    #[tokio::test]
    async fn test_execution_state_save_and_get() {
        let reg = make_registry();
        let state = json!({"step": "analysis", "progress": 42});

        reg.save_execution_state("TASK-123", "slaver-1", state.clone())
            .await
            .unwrap();

        let fetched = reg
            .get_execution_state("TASK-123")
            .await
            .unwrap()
            .expect("state must exist");
        assert_eq!(fetched["step"], "analysis");
        assert_eq!(fetched["progress"], 42);
    }

    #[tokio::test]
    async fn test_execution_state_upsert() {
        let reg = make_registry();
        reg.save_execution_state("TASK-200", "slaver-1", json!({"v": 1}))
            .await
            .unwrap();
        reg.save_execution_state("TASK-200", "slaver-1", json!({"v": 2}))
            .await
            .unwrap();

        let fetched = reg.get_execution_state("TASK-200").await.unwrap().unwrap();
        assert_eq!(fetched["v"], 2);
    }

    #[tokio::test]
    async fn test_execution_state_missing_returns_none() {
        let reg = make_registry();
        let result = reg.get_execution_state("TASK-NONE").await.unwrap();
        assert!(result.is_none());
    }
}
