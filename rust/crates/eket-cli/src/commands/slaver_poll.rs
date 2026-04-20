/// slaver:poll — 长驻 poll loop，监听 mailbox 消息并输出 JSON 事件到 stdout
use anyhow::Result;
use clap::Args;
use eket_core::db::{create_pool, SqliteClient};
use eket_engine::{
    mailbox::AgentMailbox,
    protocol::{ProtocolMessage, ProtocolSender},
};
use serde_json::json;
use std::sync::Arc;

#[derive(Args, Debug)]
pub struct SlaverPollArgs {
    /// Instance ID to poll for
    #[arg(long)]
    pub id: String,

    /// Poll interval in seconds
    #[arg(long, default_value_t = 5)]
    pub interval: u64,

    /// Directory for mailbox files
    #[arg(long, default_value = "~/.eket/mailbox")]
    pub mailbox_dir: String,

    /// SQLite db path
    #[arg(long, default_value = "~/.eket/eket.db")]
    pub db_path: String,
}

pub async fn run(args: SlaverPollArgs) -> Result<()> {
    let db_path = expand_tilde(&args.db_path);
    let mailbox_dir = expand_tilde(&args.mailbox_dir);
    let instance_id = args.id.clone();
    let interval = std::time::Duration::from_secs(args.interval);

    let pool = create_pool(&db_path).ok();
    let client = pool.map(|p| Arc::new(SqliteClient::new(p)));
    let mailbox = Arc::new(AgentMailbox::new(&mailbox_dir));

    let poll = async {
        loop {
            // 1. Heartbeat
            if let Some(ref c) = client {
                let _ = c.update_instance_last_seen(&instance_id);
            }

            // 2. Read unread messages
            match mailbox.read_messages(&instance_id).await {
                Ok(msgs) => {
                    for msg in msgs {
                        match ProtocolSender::parse_message(&msg) {
                            Ok(ProtocolMessage::TaskAssign(p)) => {
                                let event = json!({
                                    "event": "task_assigned",
                                    "ticket_id": p.ticket_id,
                                    "title": p.title,
                                    "priority": p.priority,
                                    "instructions": p.instructions,
                                    "deadline_secs": p.deadline_secs,
                                });
                                println!("{}", serde_json::to_string(&event).unwrap_or_default());
                            }
                            Ok(ProtocolMessage::Shutdown { reason }) => {
                                let event = json!({
                                    "event": "shutdown",
                                    "reason": reason,
                                });
                                println!("{}", serde_json::to_string(&event).unwrap_or_default());
                                return;
                            }
                            Ok(ProtocolMessage::Heartbeat(_))
                            | Ok(ProtocolMessage::Ack { .. })
                            | Ok(_) => {
                                // ignore
                            }
                            Err(_) => {
                                // ignore parse errors
                            }
                        }
                    }
                }
                Err(e) => {
                    tracing::warn!("mailbox read error: {e}");
                }
            }

            // 3. Sleep
            tokio::time::sleep(interval).await;
        }
    };

    tokio::select! {
        _ = tokio::signal::ctrl_c() => {
            let event = json!({ "event": "stopped" });
            println!("{}", serde_json::to_string(&event).unwrap_or_default());
        }
        _ = poll => {}
    }

    Ok(())
}

fn expand_tilde(path: &str) -> String {
    if path.starts_with("~/") {
        if let Some(home) = std::env::var("HOME").ok() {
            return format!("{}/{}", home, &path[2..]);
        }
    }
    path.to_string()
}

// ─── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use eket_engine::{
        mailbox::{AgentMailbox, MailboxMessage, MailboxMessageType},
        protocol::{ProtocolSender, TaskAssignPayload},
    };
    use tempfile::TempDir;

    #[tokio::test]
    async fn poll_empty_inbox() {
        let dir = TempDir::new().unwrap();
        let mailbox = AgentMailbox::new(dir.path());
        let msgs = mailbox.read_messages("slaver_no_msgs").await.unwrap();
        assert!(msgs.is_empty(), "empty inbox should return no messages");
    }

    #[tokio::test]
    async fn poll_task_assign_event() {
        let dir = TempDir::new().unwrap();
        let mailbox = Arc::new(AgentMailbox::new(dir.path()));
        let sender = ProtocolSender::new(mailbox.clone());

        let payload = TaskAssignPayload {
            ticket_id: "TASK-129".to_string(),
            title: "Implement slaver-register".to_string(),
            priority: "high".to_string(),
            instructions: "Do it".to_string(),
            deadline_secs: None,
        };
        sender
            .send_task_assign("master", "slaver_poll_test", payload)
            .await
            .unwrap();

        let msgs = mailbox.read_messages("slaver_poll_test").await.unwrap();
        assert_eq!(msgs.len(), 1);

        let proto = ProtocolSender::parse_message(&msgs[0]).unwrap();
        match proto {
            ProtocolMessage::TaskAssign(p) => {
                assert_eq!(p.ticket_id, "TASK-129");
                assert_eq!(p.priority, "high");
            }
            other => panic!("expected TaskAssign, got {other:?}"),
        }
    }
}
