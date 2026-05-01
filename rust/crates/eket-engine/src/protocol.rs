/// Master↔Slaver 通信协议 — protocol.rs
///
/// 基于 AgentMailbox 的类型化消息协议层。
/// 每条 ProtocolMessage 序列化为 MailboxMessage.payload，
/// message_type 统一使用 Custom("protocol:<kind>")。
use std::sync::Arc;

use serde::{Deserialize, Serialize};

use crate::mailbox::{AgentMailbox, MailboxMessage, MailboxMessageType};

// ── Payload 类型 ───────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct TaskAssignPayload {
    pub ticket_id: String,
    pub title: String,
    pub priority: String,
    pub instructions: String,
    pub deadline_secs: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct TaskResultPayload {
    pub ticket_id: String,
    pub success: bool,
    pub output: Option<String>,
    pub pr_url: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct StatusUpdatePayload {
    pub instance_id: String,
    pub status: String, // "idle" | "busy" | "offline"
    pub current_task: Option<String>,
    pub load: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct HeartbeatPayload {
    pub instance_id: String,
    pub role: String,
    pub timestamp: chrono::DateTime<chrono::Utc>,
    pub load: u32,
}

// ── ProtocolMessage 枚举 ────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum ProtocolMessage {
    TaskAssign(TaskAssignPayload),
    TaskResult(TaskResultPayload),
    StatusUpdate(StatusUpdatePayload),
    Heartbeat(HeartbeatPayload),
    Shutdown { reason: Option<String> },
    Ack { message_id: String },
    Error { code: String, message: String },
}

impl ProtocolMessage {
    fn kind_str(&self) -> &'static str {
        match self {
            ProtocolMessage::TaskAssign(_) => "task_assign",
            ProtocolMessage::TaskResult(_) => "task_result",
            ProtocolMessage::StatusUpdate(_) => "status_update",
            ProtocolMessage::Heartbeat(_) => "heartbeat",
            ProtocolMessage::Shutdown { .. } => "shutdown",
            ProtocolMessage::Ack { .. } => "ack",
            ProtocolMessage::Error { .. } => "error",
        }
    }
}

// ── ProtocolSender ─────────────────────────────────────────────────────────────

pub struct ProtocolSender {
    mailbox: Arc<AgentMailbox>,
}

impl ProtocolSender {
    pub fn new(mailbox: Arc<AgentMailbox>) -> Self {
        Self { mailbox }
    }

    async fn send_proto(&self, from: &str, to: &str, msg: ProtocolMessage) -> Result<(), String> {
        let kind = msg.kind_str();
        let payload = serde_json::to_value(&msg)
            .map_err(|e| format!("serialize ProtocolMessage failed: {e}"))?;
        let mailbox_msg = MailboxMessage::new(
            from,
            to,
            MailboxMessageType::Custom(format!("protocol:{kind}")),
            payload,
        );
        self.mailbox.send(mailbox_msg).await
    }

    pub async fn send_task_assign(
        &self,
        from: &str,
        to: &str,
        payload: TaskAssignPayload,
    ) -> Result<(), String> {
        self.send_proto(from, to, ProtocolMessage::TaskAssign(payload)).await
    }

    pub async fn send_task_result(
        &self,
        from: &str,
        to: &str,
        payload: TaskResultPayload,
    ) -> Result<(), String> {
        self.send_proto(from, to, ProtocolMessage::TaskResult(payload)).await
    }

    pub async fn send_status_update(
        &self,
        from: &str,
        to: &str,
        payload: StatusUpdatePayload,
    ) -> Result<(), String> {
        self.send_proto(from, to, ProtocolMessage::StatusUpdate(payload)).await
    }

    pub async fn send_heartbeat(
        &self,
        from: &str,
        to: &str,
        payload: HeartbeatPayload,
    ) -> Result<(), String> {
        self.send_proto(from, to, ProtocolMessage::Heartbeat(payload)).await
    }

    pub async fn send_shutdown(
        &self,
        from: &str,
        to: &str,
        reason: Option<String>,
    ) -> Result<(), String> {
        self.send_proto(from, to, ProtocolMessage::Shutdown { reason }).await
    }

    pub async fn send_ack(
        &self,
        from: &str,
        to: &str,
        message_id: &str,
    ) -> Result<(), String> {
        self.send_proto(
            from,
            to,
            ProtocolMessage::Ack {
                message_id: message_id.to_string(),
            },
        )
        .await
    }

    /// 从 MailboxMessage.payload 反序列化为 ProtocolMessage
    pub fn parse_message(msg: &MailboxMessage) -> Result<ProtocolMessage, String> {
        // payload 本身就是整个 ProtocolMessage（含 `kind` tag）
        let kind = msg
            .payload
            .get("kind")
            .and_then(|v| v.as_str())
            .ok_or_else(|| "missing 'kind' field in payload".to_string())?;

        serde_json::from_value::<ProtocolMessage>(msg.payload.clone())
            .map_err(|e| format!("parse ProtocolMessage (kind={kind}) failed: {e}"))
    }
}

// ── Tests ──────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn make_sender(dir: &TempDir) -> (ProtocolSender, Arc<AgentMailbox>) {
        let mailbox = Arc::new(AgentMailbox::new(dir.path()));
        let sender = ProtocolSender::new(mailbox.clone());
        (sender, mailbox)
    }

    #[tokio::test]
    async fn send_and_parse_task_assign() {
        let dir = TempDir::new().unwrap();
        let (sender, mailbox) = make_sender(&dir);

        let payload = TaskAssignPayload {
            ticket_id: "TASK-128".into(),
            title: "Implement protocol".into(),
            priority: "high".into(),
            instructions: "write it".into(),
            deadline_secs: Some(3600),
        };

        sender.send_task_assign("master", "slaver_1", payload.clone()).await.unwrap();

        let msgs = mailbox.read_messages("slaver_1").await.unwrap();
        assert_eq!(msgs.len(), 1);

        let proto = ProtocolSender::parse_message(&msgs[0]).unwrap();
        match proto {
            ProtocolMessage::TaskAssign(p) => {
                assert_eq!(p.ticket_id, "TASK-128");
                assert_eq!(p.priority, "high");
                assert_eq!(p.deadline_secs, Some(3600));
            }
            other => panic!("unexpected variant: {other:?}"),
        }
    }

    #[tokio::test]
    async fn send_and_parse_task_result() {
        let dir = TempDir::new().unwrap();
        let (sender, mailbox) = make_sender(&dir);

        let payload = TaskResultPayload {
            ticket_id: "TASK-128".into(),
            success: true,
            output: Some("done".into()),
            pr_url: Some("https://github.com/pr/1".into()),
            error: None,
        };

        sender.send_task_result("slaver_1", "master", payload.clone()).await.unwrap();

        let msgs = mailbox.read_messages("master").await.unwrap();
        assert_eq!(msgs.len(), 1);

        let proto = ProtocolSender::parse_message(&msgs[0]).unwrap();
        match proto {
            ProtocolMessage::TaskResult(p) => {
                assert!(p.success);
                assert_eq!(p.pr_url.as_deref(), Some("https://github.com/pr/1"));
                assert!(p.error.is_none());
            }
            other => panic!("unexpected: {other:?}"),
        }
    }

    #[tokio::test]
    async fn send_and_parse_heartbeat() {
        let dir = TempDir::new().unwrap();
        let (sender, mailbox) = make_sender(&dir);

        let payload = HeartbeatPayload {
            instance_id: "inst-1".into(),
            role: "slaver".into(),
            timestamp: chrono::Utc::now(),
            load: 42,
        };

        sender.send_heartbeat("slaver_1", "master", payload.clone()).await.unwrap();

        let msgs = mailbox.read_messages("master").await.unwrap();
        assert_eq!(msgs.len(), 1);

        let proto = ProtocolSender::parse_message(&msgs[0]).unwrap();
        match proto {
            ProtocolMessage::Heartbeat(p) => {
                assert_eq!(p.instance_id, "inst-1");
                assert_eq!(p.load, 42);
            }
            other => panic!("unexpected: {other:?}"),
        }
    }

    #[tokio::test]
    async fn send_and_parse_shutdown() {
        let dir = TempDir::new().unwrap();
        let (sender, mailbox) = make_sender(&dir);

        sender
            .send_shutdown("master", "slaver_1", Some("maintenance".into()))
            .await
            .unwrap();

        let msgs = mailbox.read_messages("slaver_1").await.unwrap();
        assert_eq!(msgs.len(), 1);

        let proto = ProtocolSender::parse_message(&msgs[0]).unwrap();
        match proto {
            ProtocolMessage::Shutdown { reason } => {
                assert_eq!(reason.as_deref(), Some("maintenance"));
            }
            other => panic!("unexpected: {other:?}"),
        }
    }

    #[tokio::test]
    async fn parse_unknown_kind_returns_err() {
        let dir = TempDir::new().unwrap();
        let _mailbox = Arc::new(AgentMailbox::new(dir.path()));

        // 手动构造 payload with unknown kind
        let bad_payload = serde_json::json!({ "kind": "nonsense", "data": {} });
        let msg = MailboxMessage::new(
            "x",
            "y",
            MailboxMessageType::Custom("protocol:nonsense".into()),
            bad_payload,
        );

        let result = ProtocolSender::parse_message(&msg);
        assert!(result.is_err(), "expected Err for unknown kind");
        let err = result.unwrap_err();
        assert!(err.contains("nonsense") || err.contains("parse") || err.contains("kind"), "err msg: {err}");
    }

    #[tokio::test]
    async fn send_and_parse_ack() {
        let dir = TempDir::new().unwrap();
        let (sender, mailbox) = make_sender(&dir);

        sender.send_ack("slaver_1", "master", "msg-abc-123").await.unwrap();

        let msgs = mailbox.read_messages("master").await.unwrap();
        assert_eq!(msgs.len(), 1);

        let proto = ProtocolSender::parse_message(&msgs[0]).unwrap();
        match proto {
            ProtocolMessage::Ack { message_id } => {
                assert_eq!(message_id, "msg-abc-123");
            }
            other => panic!("unexpected: {other:?}"),
        }
    }
}
