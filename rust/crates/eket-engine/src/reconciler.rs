use std::path::PathBuf;
use std::sync::Arc;
use serde::{Deserialize, Serialize};
use tokio::fs;
use tracing::{debug, error, info, warn};
use eket_core::db::SqliteClient;
use eket_core::pubsub::RedisPubSub;
use eket_core::error::{EketError, EketResult};
use rusqlite::params;

#[cfg(unix)]
extern "C" {
    fn kill(pid: i32, sig: i32) -> i32;
}

#[cfg(unix)]
fn is_pid_running(pid: u32) -> bool {
    unsafe { kill(pid as i32, 0) == 0 }
}

#[cfg(not(unix))]
fn is_pid_running(_pid: u32) -> bool {
    false
}

fn find_project_root() -> PathBuf {
    let mut current = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    while let Some(parent) = current.parent() {
        if current.join(".eket").exists() {
            return current.to_path_buf();
        }
        current = parent.to_path_buf();
    }
    std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."))
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReconciledMessage {
    pub id: String,
    pub file_path: PathBuf,
    pub timestamp: i64,
    pub channel: String,
    pub data: serde_json::Value,
    pub file_type: String, // "json" or "msg"
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct ProcessedJson {
    pub ids: Vec<String>,
}

pub struct StateReconciler {
    queue_dir: PathBuf,
    db: Option<Arc<SqliteClient>>,
    pubsub: Option<Arc<RedisPubSub>>,
}

impl StateReconciler {
    pub fn new(
        queue_dir: Option<PathBuf>,
        db: Option<Arc<SqliteClient>>,
        pubsub: Option<Arc<RedisPubSub>>,
    ) -> Self {
        let q_dir = queue_dir.unwrap_or_else(|| {
            find_project_root()
                .join(".eket")
                .join("data")
                .join("queue")
        });
        Self {
            queue_dir: q_dir,
            db,
            pubsub,
        }
    }

    /// Triggers the state alignment flow
    pub async fn reconcile(&self) -> EketResult<usize> {
        info!("[StateReconciler] Starting data alignment, scanning: {:?}", self.queue_dir);

        if !self.queue_dir.exists() {
            return Ok(0);
        }

        // 1. Acquire distributed lock to prevent concurrent alignment tasks
        if !self.acquire_reconcile_lock().await {
            info!("[StateReconciler] Failed to acquire lock or reconciler already running, skipping");
            return Ok(0);
        }

        let result = self.do_reconcile().await;

        // Ensure lock is released even if reconcile fails
        self.release_reconcile_lock().await;

        result
    }

    async fn do_reconcile(&self) -> EketResult<usize> {
        // 2. Scan fallback queue directory for JSON and MSG files
        let mut entries = fs::read_dir(&self.queue_dir).await.map_err(|e| {
            EketError::Other(format!("Failed to read queue dir: {e}"))
        })?;

        let mut reconciled_msgs = Vec::new();

        while let Some(entry) = entries.next_entry().await.map_err(|e| {
            EketError::Other(format!("Failed to read entry: {e}"))
        })? {
            let path = entry.path();
            if !path.is_file() {
                continue;
            }

            let file_name = match path.file_name().and_then(|s| s.to_str()) {
                Some(name) => name,
                None => continue,
            };

            if file_name == "processed.json" || file_name.contains(".tmp.") {
                continue;
            }

            let is_json = file_name.ends_with(".json");
            let is_msg = file_name.ends_with(".msg");

            if !is_json && !is_msg {
                continue;
            }

            // 3. Read and parse message contents
            let content = match fs::read_to_string(&path).await {
                Ok(c) => c,
                Err(e) => {
                    warn!("[StateReconciler] Failed to read message file {:?}: {}", path, e);
                    continue;
                }
            };

            let parsed: serde_json::Value = match serde_json::from_str(&content) {
                Ok(val) => val,
                Err(e) => {
                    warn!("[StateReconciler] Failed to parse message file JSON {:?}: {}", path, e);
                    continue;
                }
            };

            #[allow(unused_assignments)]
            let mut id = String::new();
            let mut timestamp = chrono::Utc::now().timestamp_millis();
            #[allow(unused_assignments)]
            let mut channel = String::from("default");
            let mut data = parsed.clone();
            let file_type = if is_msg { "msg" } else { "json" };

            if is_msg {
                // Shell fallback message
                let file_stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("unknown");
                id = format!("shell_fallback_{}", file_stem);
                if let Some(ts_val) = parsed.get("timestamp") {
                    if let Some(ts_str) = ts_val.as_str() {
                        if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(ts_str) {
                            timestamp = dt.timestamp_millis();
                        }
                    } else if let Some(ts_int) = ts_val.as_i64() {
                        timestamp = ts_int;
                    }
                }
                channel = String::from("commands");
            } else {
                // Regular JSON file message
                let has_version2 = parsed.get("metadata")
                    .and_then(|m| m.get("version"))
                    .and_then(|v| v.as_u64())
                    .map(|v| v == 2)
                    .unwrap_or(false);

                let message_val = if has_version2 {
                    parsed.get("message").unwrap_or(&parsed).clone()
                } else {
                    parsed.clone()
                };

                id = message_val.get("id")
                    .and_then(|i| i.as_str())
                    .map(|s| s.to_string())
                    .unwrap_or_else(|| format!("file_msg_{}", chrono::Utc::now().timestamp_millis()));

                channel = message_val.get("_channel")
                    .and_then(|c| c.as_str())
                    .map(|s| s.to_string())
                    .unwrap_or_else(|| String::from("default"));

                if let Some(ts_val) = message_val.get("timestamp") {
                    if let Some(ts_str) = ts_val.as_str() {
                        if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(ts_str) {
                            timestamp = dt.timestamp_millis();
                        }
                    } else if let Some(ts_int) = ts_val.as_i64() {
                        timestamp = ts_int;
                    }
                } else if let Some(eq_val) = message_val.get("_enqueue_time").and_then(|v| v.as_i64()) {
                    timestamp = eq_val;
                }

                data = message_val;
            }

            reconciled_msgs.push(ReconciledMessage {
                id,
                file_path: path,
                timestamp,
                channel,
                data,
                file_type: file_type.to_string(),
            });
        }

        if reconciled_msgs.is_empty() {
            return Ok(0);
        }

        // 4. Sort messages chronologically by timestamp
        reconciled_msgs.sort_by_key(|m| m.timestamp);

        // 5. Replay and align messages one by one idemptotently
        let mut replayed_count = 0;
        for msg in reconciled_msgs {
            match self.check_duplicate(&msg.id).await {
                Ok(true) => {
                    debug!("[StateReconciler] Duplicate found for message {}, deleting file", msg.id);
                    let _ = fs::remove_file(&msg.file_path).await;
                }
                _ => {
                    match self.replay_message(&msg).await {
                        Ok(replayed) => {
                            if replayed {
                                replayed_count += 1;
                                let _ = fs::remove_file(&msg.file_path).await;
                            }
                        }
                        Err(e) => {
                            error!("[StateReconciler] Failed to replay message {}: {}", msg.id, e);
                        }
                    }
                }
            }
        }

        info!("[StateReconciler] Data alignment complete. Replayed {} messages.", replayed_count);
        Ok(replayed_count)
    }

    /// Checks if a message has already been processed using processed.json and SQLite
    async fn check_duplicate(&self, message_id: &str) -> EketResult<bool> {
        // 1. Check local processed.json list
        let processed_path = self.queue_dir.join("processed.json");
        if processed_path.exists() {
            if let Ok(content) = fs::read_to_string(&processed_path).await {
                if let Ok(parsed) = serde_json::from_str::<ProcessedJson>(&content) {
                    if parsed.ids.iter().any(|id| id == message_id) {
                        return Ok(true);
                    }
                }
            }
        }

        // 2. Check SQLite message_history table
        if let Some(db) = &self.db {
            let conn = db.pool().get().map_err(EketError::from)?;

            let mut stmt = conn.prepare("SELECT 1 FROM message_history WHERE message_id = ?1").map_err(EketError::from)?;

            let exists = stmt.exists(params![message_id]).unwrap_or(false);
            if exists {
                return Ok(true);
            }
        }

        Ok(false)
    }

    /// Replays a single message
    async fn replay_message(&self, msg: &ReconciledMessage) -> EketResult<bool> {
        let now_rfc3339 = chrono::Utc::now().to_rfc3339();

        if msg.file_type == "msg" {
            info!("[StateReconciler] Replaying shell fallback command: {:?}", msg.data);
            if let Some(db) = &self.db {
                let conn = db.pool().get().map_err(EketError::from)?;

                let payload_str = serde_json::to_string(&msg.data).unwrap_or_default();
                conn.execute(
                    "INSERT OR REPLACE INTO message_history (message_id, from_agent, to_agent, type, payload, created_at)
                     VALUES (?1, 'shell_fallback', 'all', 'shell_command', ?2, ?3)",
                    params![msg.id, payload_str, now_rfc3339],
                ).map_err(EketError::from)?;
            }
            return Ok(true);
        }

        // Standard message replay
        // 1. If high performance pub/sub connection available (e.g. Redis), publish to Redis
        if let Some(pubsub) = &self.pubsub {
            // Note: RedisPubSub.publish will fallback internally if Redis is down,
            // but we can check if the subscriber client is actually available to publish.
            // If Redis is active, publish and return true
            let msg_str = serde_json::to_string(&msg.data).unwrap_or_default();
            if pubsub.publish(&msg.channel, &msg_str).await.is_ok() {
                // Only return success if published successfully to actual MQ (or we also update SQLite)
                // Let's write to SQLite message_history too for complete synchronization.
            }
        }

        // 2. Perform SQLite persistence alignment
        if let Some(db) = &self.db {
            let conn = db.pool().get().map_err(EketError::from)?;

            let from = msg.data.get("from").and_then(|v| v.as_str()).unwrap_or("file_queue");
            let to = msg.data.get("to").and_then(|v| v.as_str()).unwrap_or("all");
            let type_str = msg.data.get("type").and_then(|v| v.as_str()).unwrap_or("file_message");
            let payload_str = msg.data.get("payload")
                .map(|v| serde_json::to_string(v).unwrap_or_default())
                .unwrap_or_else(|| serde_json::to_string(&msg.data).unwrap_or_default());

            conn.execute(
                "INSERT OR REPLACE INTO message_history (message_id, from_agent, to_agent, type, payload, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![msg.id, from, to, type_str, payload_str, now_rfc3339],
            ).map_err(EketError::from)?;

            // 3. If it contains ticket information, upsert it into the tickets table
            let ticket_id_val = msg.data.get("ticketId").or_else(|| msg.data.get("ticket_id"));
            if let Some(tid_val) = ticket_id_val {
                if let Some(tid) = tid_val.as_str() {
                    let title = msg.data.get("title").and_then(|v| v.as_str()).unwrap_or("");
                    let status = msg.data.get("status").and_then(|v| v.as_str()).unwrap_or("ready");
                    let priority = msg.data.get("priority")
                        .and_then(|v| {
                            if let Some(p_str) = v.as_str() {
                                Some(p_str.to_string())
                            } else { v.as_i64().map(|p_int| p_int.to_string()) }
                        })
                        .unwrap_or_else(|| "P2".to_string());
                    let assignee = msg.data.get("assignee").and_then(|v| v.as_str());
                    let claimed_at = msg.data.get("claimedAt")
                        .or_else(|| msg.data.get("claimed_at"))
                        .and_then(|v| v.as_str());
                    let created_at = msg.data.get("createdAt")
                        .or_else(|| msg.data.get("created_at"))
                        .and_then(|v| v.as_str())
                        .unwrap_or(&now_rfc3339);

                    conn.execute(
                        "INSERT OR REPLACE INTO tickets (id, title, status, priority, assignee, claimed_at, created_at, updated_at)
                         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                        params![tid, title, status, priority, assignee, claimed_at, created_at, now_rfc3339],
                    ).map_err(EketError::from)?;
                }
            }
        }

        Ok(true)
    }

    /// Acquires lock file for reconciliation
    async fn acquire_reconcile_lock(&self) -> bool {
        let lock_path = self.queue_dir.join("reconcile.lock");
        if lock_path.exists() {
            if let Ok(content) = fs::read_to_string(&lock_path).await {
                if let Ok(pid) = content.trim().parse::<u32>() {
                    if is_pid_running(pid) {
                        return false;
                    }
                }
            }
        }

        let pid_str = std::process::id().to_string();
        fs::write(&lock_path, pid_str).await.is_ok()
    }

    /// Releases lock file
    async fn release_reconcile_lock(&self) {
        let lock_path = self.queue_dir.join("reconcile.lock");
        if lock_path.exists() {
            let _ = fs::remove_file(&lock_path).await;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use eket_core::db::create_pool;
    use tempfile::TempDir;

    fn init_test_db(db_path: &str) -> Arc<SqliteClient> {
        let pool = create_pool(db_path).unwrap();
        Arc::new(SqliteClient::new(pool))
    }

    #[tokio::test]
    async fn test_reconcile_empty_dir() {
        let temp_dir = TempDir::new().unwrap();
        let db = init_test_db(":memory:");
        let reconciler = StateReconciler::new(Some(temp_dir.path().to_path_buf()), Some(db), None);

        let count = reconciler.reconcile().await.unwrap();
        assert_eq!(count, 0);
    }

    #[tokio::test]
    async fn test_reconcile_json_message_replay() {
        let temp_dir = TempDir::new().unwrap();
        let db = init_test_db(":memory:");
        let reconciler = StateReconciler::new(Some(temp_dir.path().to_path_buf()), Some(db.clone()), None);

        // Write a mock JSON file message
        let msg_id = "test_msg_123";
        let msg_file = temp_dir.path().join(format!("{}.json", msg_id));
        let msg_data = json!({
            "metadata": { "version": 2 },
            "message": {
                "id": msg_id,
                "from": "agent_1",
                "to": "agent_2",
                "type": "test_event",
                "payload": { "data": "hello" },
                "_channel": "custom_channel",
                "ticketId": "TICKET-789",
                "title": "Fix bug",
                "status": "in_progress",
                "priority": "P1"
            }
        });

        fs::write(&msg_file, serde_json::to_string(&msg_data).unwrap()).await.unwrap();

        let count = reconciler.reconcile().await.unwrap();
        assert_eq!(count, 1);

        // File should be deleted
        assert!(!msg_file.exists());

        // Check SQLite message_history
        let conn = db.pool().get().unwrap();
        let exists: bool = conn.query_row(
            "SELECT 1 FROM message_history WHERE message_id = ?1",
            params![msg_id],
            |_| Ok(true)
        ).unwrap_or(false);
        assert!(exists);

        // Check SQLite tickets
        let t_exists: bool = conn.query_row(
            "SELECT 1 FROM tickets WHERE id = 'TICKET-789' AND status = 'in_progress'",
            [],
            |_| Ok(true)
        ).unwrap_or(false);
        assert!(t_exists);
    }

    #[tokio::test]
    async fn test_reconcile_shell_msg_replay() {
        let temp_dir = TempDir::new().unwrap();
        let db = init_test_db(":memory:");
        let reconciler = StateReconciler::new(Some(temp_dir.path().to_path_buf()), Some(db.clone()), None);

        // Write a mock shell fallback command file (.msg)
        let file_stem = "cmd_456";
        let msg_file = temp_dir.path().join(format!("{}.msg", file_stem));
        let msg_data = json!({
            "command": "git pull origin main",
            "timestamp": "2026-05-24T12:00:00Z"
        });

        fs::write(&msg_file, serde_json::to_string(&msg_data).unwrap()).await.unwrap();

        let count = reconciler.reconcile().await.unwrap();
        assert_eq!(count, 1);

        // File should be deleted
        assert!(!msg_file.exists());

        // Check SQLite message_history
        let conn = db.pool().get().unwrap();
        let exists: bool = conn.query_row(
            "SELECT 1 FROM message_history WHERE message_id = ?1",
            params![format!("shell_fallback_{}", file_stem)],
            |_| Ok(true)
        ).unwrap_or(false);
        assert!(exists);
    }

    #[tokio::test]
    async fn test_reconcile_duplicate_handling() {
        let temp_dir = TempDir::new().unwrap();
        let db = init_test_db(":memory:");
        let reconciler = StateReconciler::new(Some(temp_dir.path().to_path_buf()), Some(db.clone()), None);

        let msg_id = "test_msg_dup";
        let msg_file = temp_dir.path().join(format!("{}.json", msg_id));
        let msg_data = json!({
            "id": msg_id,
            "from": "agent_1",
            "to": "agent_2",
            "type": "test_event",
            "payload": { "data": "hello" }
        });

        fs::write(&msg_file, serde_json::to_string(&msg_data).unwrap()).await.unwrap();

        // 1. Manually insert the message into message_history to simulate duplicate
        {
            let conn = db.pool().get().unwrap();
            conn.execute(
                "INSERT INTO message_history (message_id, from_agent, to_agent, type, payload) VALUES (?1, 'a', 'b', 'c', '{}')",
                params![msg_id]
            ).unwrap();
        }

        let count = reconciler.reconcile().await.unwrap();
        // Should be 0 since it is duplicate, and file should be deleted
        assert_eq!(count, 0);
        assert!(!msg_file.exists());
    }

    #[tokio::test]
    async fn test_reconcile_processed_json_duplicate() {
        let temp_dir = TempDir::new().unwrap();
        let db = init_test_db(":memory:");
        let reconciler = StateReconciler::new(Some(temp_dir.path().to_path_buf()), Some(db.clone()), None);

        let msg_id = "processed_dup";
        let msg_file = temp_dir.path().join(format!("{}.json", msg_id));
        let msg_data = json!({
            "id": msg_id,
            "from": "agent_1"
        });

        fs::write(&msg_file, serde_json::to_string(&msg_data).unwrap()).await.unwrap();

        // Create processed.json containing the message ID
        let processed_file = temp_dir.path().join("processed.json");
        let processed_data = json!({
            "ids": [msg_id]
        });
        fs::write(&processed_file, serde_json::to_string(&processed_data).unwrap()).await.unwrap();

        let count = reconciler.reconcile().await.unwrap();
        assert_eq!(count, 0);
        assert!(!msg_file.exists());
    }

    #[tokio::test]
    async fn test_reconcile_concurrent_lock() {
        let temp_dir = TempDir::new().unwrap();
        let db = init_test_db(":memory:");
        let reconciler1 = StateReconciler::new(Some(temp_dir.path().to_path_buf()), Some(db.clone()), None);
        let reconciler2 = StateReconciler::new(Some(temp_dir.path().to_path_buf()), Some(db), None);

        // Manually write lock with a running pid (our own pid is always running!)
        let lock_path = temp_dir.path().join("reconcile.lock");
        fs::write(&lock_path, std::process::id().to_string()).await.unwrap();

        let count = reconciler2.reconcile().await.unwrap();
        // Should bypass because of concurrent run lock
        assert_eq!(count, 0);

        // Clean up lock and it should succeed
        fs::remove_file(&lock_path).await.unwrap();
        let count = reconciler1.reconcile().await.unwrap();
        assert_eq!(count, 0);
    }
}
