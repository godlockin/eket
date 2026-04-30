/// Agent Mailbox — 对应 TS: agent-mailbox.ts
///
/// 基于文件系统的 P2P 消息通信（Redis 不可用时的容灾）
/// - 每个 Agent 有独立 inbox：{mailbox_dir}/{agent_id}.json
/// - 原子写：tmp→rename（防并发损坏）
/// - 消息类型：task_assigned, task_completed, idle, shutdown, permission_request
/// - 结构化消息，JSON 序列化
///
/// 与 TS 版本差异：
/// - TS 使用 proper-lockfile（进程级文件锁）；Rust 用 tokio::sync::Mutex per-agent
/// - TS 支持加密（encrypt/decrypt）；Rust 版本预留 encrypted 字段，不加密
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use serde::{Deserialize, Serialize};
use tokio::sync::Mutex;
use tracing::debug;
use uuid::Uuid;

use crate::context_filter::MailboxContextFilter;

// ─── Message Types ────────────────────────────────────────────────────────────

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MailboxMessageType {
    TaskAssigned,
    TaskCompleted,
    AgentIdle,
    Shutdown,
    PermissionRequest,
    Custom(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MailboxMessage {
    pub id: String,
    pub from: String,
    pub to: String,
    pub message_type: MailboxMessageType,
    pub payload: serde_json::Value,
    pub timestamp: chrono::DateTime<chrono::Utc>,
    pub read: bool,
}

impl MailboxMessage {
    pub fn new(
        from: impl Into<String>,
        to: impl Into<String>,
        message_type: MailboxMessageType,
        payload: serde_json::Value,
    ) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            from: from.into(),
            to: to.into(),
            message_type,
            payload,
            timestamp: chrono::Utc::now(),
            read: false,
        }
    }
}

// ─── MailboxStore ─────────────────────────────────────────────────────────────

/// Per-agent mailbox on disk + in-memory mutex to prevent concurrent writes
type AgentLock = Arc<Mutex<()>>;

pub struct AgentMailbox {
    mailbox_dir: PathBuf,
    /// Per-agent write locks (created lazily)
    locks: Arc<tokio::sync::RwLock<HashMap<String, AgentLock>>>,
}

impl AgentMailbox {
    pub fn new(mailbox_dir: impl AsRef<Path>) -> Self {
        Self {
            mailbox_dir: mailbox_dir.as_ref().to_path_buf(),
            locks: Arc::new(tokio::sync::RwLock::new(HashMap::new())),
        }
    }

    /// Send a message to an agent's inbox
    pub async fn send(&self, msg: MailboxMessage) -> Result<(), String> {
        let agent_id = msg.to.clone();
        let lock = self.get_or_create_lock(&agent_id).await;
        let _guard = lock.lock().await;

        let inbox_path = self.inbox_path(&agent_id);
        tokio::fs::create_dir_all(inbox_path.parent().unwrap())
            .await
            .map_err(|e| format!("mkdir failed: {e}"))?;

        // Read existing messages
        let mut messages: Vec<MailboxMessage> = if inbox_path.exists() {
            let data = tokio::fs::read_to_string(&inbox_path)
                .await
                .unwrap_or_default();
            serde_json::from_str(&data).unwrap_or_default()
        } else {
            Vec::new()
        };

        messages.push(msg);

        // Atomic write
        let json = serde_json::to_string_pretty(&messages)
            .map_err(|e| format!("serialize failed: {e}"))?;
        let tmp = inbox_path.with_extension("json.tmp");
        tokio::fs::write(&tmp, &json)
            .await
            .map_err(|e| format!("write tmp failed: {e}"))?;

        // rename (cross-fs fallback: copy+delete)
        if let Err(e) = tokio::fs::rename(&tmp, &inbox_path).await {
            if e.raw_os_error() == Some(18) {
                tokio::fs::copy(&tmp, &inbox_path)
                    .await
                    .map_err(|e| format!("copy failed: {e}"))?;
                let _ = tokio::fs::remove_file(&tmp).await;
            } else {
                return Err(format!("rename failed: {e}"));
            }
        }

        debug!("[Mailbox] sent to {agent_id}: {:?}", json.len());
        Ok(())
    }

    /// Read all unread messages for an agent (marks them as read)
    pub async fn read_messages(&self, agent_id: &str) -> Result<Vec<MailboxMessage>, String> {
        let lock = self.get_or_create_lock(agent_id).await;
        let _guard = lock.lock().await;

        let inbox_path = self.inbox_path(agent_id);
        if !inbox_path.exists() {
            return Ok(Vec::new());
        }

        // Atomic rename to .processing to prevent cross-process race
        let processing_path = inbox_path.with_extension("json.processing");
        if let Err(e) = tokio::fs::rename(&inbox_path, &processing_path).await {
            return Err(format!("rename to .processing failed: {e}"));
        }

        let data = tokio::fs::read_to_string(&processing_path)
            .await
            .map_err(|e| format!("read failed: {e}"))?;

        let mut messages: Vec<MailboxMessage> = serde_json::from_str(&data)
            .unwrap_or_default();

        let unread: Vec<MailboxMessage> = messages
            .iter()
            .filter(|m| !m.read)
            .cloned()
            .collect();

        // Mark all as read
        for m in &mut messages {
            m.read = true;
        }

        let json = serde_json::to_string_pretty(&messages)
            .map_err(|e| format!("serialize: {e}"))?;
        // Write remaining (all-read) messages back atomically, then remove processing file
        let tmp = inbox_path.with_extension("json.tmp");
        tokio::fs::write(&tmp, &json).await.ok();
        tokio::fs::rename(&tmp, &inbox_path).await.ok();
        // Remove the .processing sentinel
        tokio::fs::remove_file(&processing_path).await.ok();

        Ok(unread)
    }

    /// Read unread messages with context filter applied
    pub async fn read_messages_filtered(
        &self,
        agent_id: &str,
        filter: &MailboxContextFilter,
    ) -> Result<Vec<MailboxMessage>, String> {
        let messages = self.read_messages(agent_id).await?;
        Ok(filter.filter(&messages))
    }

    /// Clear all messages for an agent
    pub async fn clear(&self, agent_id: &str) -> Result<(), String> {
        let lock = self.get_or_create_lock(agent_id).await;
        let _guard = lock.lock().await;
        let inbox_path = self.inbox_path(agent_id);
        if inbox_path.exists() {
            tokio::fs::remove_file(&inbox_path)
                .await
                .map_err(|e| format!("remove failed: {e}"))?;
        }
        Ok(())
    }

    /// Count unread messages
    pub async fn unread_count(&self, agent_id: &str) -> usize {
        let inbox_path = self.inbox_path(agent_id);
        if !inbox_path.exists() {
            return 0;
        }
        let data = tokio::fs::read_to_string(&inbox_path).await.unwrap_or_default();
        let messages: Vec<MailboxMessage> = serde_json::from_str(&data).unwrap_or_default();
        messages.iter().filter(|m| !m.read).count()
    }

    fn inbox_path(&self, agent_id: &str) -> PathBuf {
        self.mailbox_dir.join(format!("{agent_id}.json"))
    }

    async fn get_or_create_lock(&self, agent_id: &str) -> AgentLock {
        {
            let locks = self.locks.read().await;
            if let Some(lock) = locks.get(agent_id) {
                return lock.clone();
            }
        }
        let mut locks = self.locks.write().await;
        locks
            .entry(agent_id.to_string())
            .or_insert_with(|| Arc::new(Mutex::new(())))
            .clone()
    }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn make_msg(from: &str, to: &str, t: MailboxMessageType) -> MailboxMessage {
        MailboxMessage::new(from, to, t, serde_json::json!({"test": true}))
    }

    #[tokio::test]
    async fn send_and_read() {
        let dir = TempDir::new().unwrap();
        let mailbox = AgentMailbox::new(dir.path());

        let msg = make_msg("master", "slaver_1", MailboxMessageType::TaskAssigned);
        mailbox.send(msg).await.unwrap();

        let messages = mailbox.read_messages("slaver_1").await.unwrap();
        assert_eq!(messages.len(), 1);
        assert_eq!(messages[0].from, "master");
        assert_eq!(messages[0].message_type, MailboxMessageType::TaskAssigned);
    }

    #[tokio::test]
    async fn read_marks_as_read() {
        let dir = TempDir::new().unwrap();
        let mailbox = AgentMailbox::new(dir.path());

        mailbox.send(make_msg("m", "a1", MailboxMessageType::AgentIdle)).await.unwrap();

        // First read: 1 unread
        let first = mailbox.read_messages("a1").await.unwrap();
        assert_eq!(first.len(), 1);

        // Second read: 0 unread
        let second = mailbox.read_messages("a1").await.unwrap();
        assert_eq!(second.len(), 0);
    }

    #[tokio::test]
    async fn multiple_messages_queued() {
        let dir = TempDir::new().unwrap();
        let mailbox = AgentMailbox::new(dir.path());

        for _ in 0..5 {
            mailbox.send(make_msg("master", "slaver_2", MailboxMessageType::TaskAssigned)).await.unwrap();
        }

        let messages = mailbox.read_messages("slaver_2").await.unwrap();
        assert_eq!(messages.len(), 5);
    }

    #[tokio::test]
    async fn empty_inbox_returns_empty() {
        let dir = TempDir::new().unwrap();
        let mailbox = AgentMailbox::new(dir.path());
        let messages = mailbox.read_messages("nonexistent").await.unwrap();
        assert!(messages.is_empty());
    }

    #[tokio::test]
    async fn clear_removes_all_messages() {
        let dir = TempDir::new().unwrap();
        let mailbox = AgentMailbox::new(dir.path());
        mailbox.send(make_msg("m", "a1", MailboxMessageType::Shutdown)).await.unwrap();
        mailbox.clear("a1").await.unwrap();
        assert_eq!(mailbox.unread_count("a1").await, 0);
    }

    #[tokio::test]
    async fn concurrent_writes_no_corruption() {
        let dir = TempDir::new().unwrap();
        let mailbox = Arc::new(AgentMailbox::new(dir.path()));

        let mut handles = vec![];
        for i in 0..10 {
            let m = mailbox.clone();
            handles.push(tokio::spawn(async move {
                let msg = MailboxMessage::new(
                    format!("sender_{i}"),
                    "agent_concurrent",
                    MailboxMessageType::Custom("ping".into()),
                    serde_json::json!({"i": i}),
                );
                m.send(msg).await.unwrap();
            }));
        }

        futures::future::join_all(handles).await;

        let messages = mailbox.read_messages("agent_concurrent").await.unwrap();
        assert_eq!(messages.len(), 10, "all 10 messages must be delivered");
    }
}
