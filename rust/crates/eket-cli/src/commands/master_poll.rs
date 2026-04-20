/// master:poll — 长驻进程，轮询 "master" mailbox 处理 Slaver 回报消息
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
pub struct MasterPollArgs {
    /// Poll interval in seconds
    #[arg(long, default_value_t = 3)]
    pub interval: u64,

    /// Directory for mailbox files
    #[arg(long, default_value = "~/.eket/mailbox")]
    pub mailbox_dir: String,

    /// SQLite db path
    #[arg(long, default_value = "~/.eket/eket.db")]
    pub db_path: String,
}

pub async fn run(args: MasterPollArgs) -> Result<()> {
    let db_path = expand_tilde(&args.db_path);
    let mailbox_dir = expand_tilde(&args.mailbox_dir);
    let interval = std::time::Duration::from_secs(args.interval);

    let pool = create_pool(&db_path)?;
    let client = Arc::new(SqliteClient::new(pool));
    let mailbox = Arc::new(AgentMailbox::new(&mailbox_dir));

    let poll = async {
        loop {
            poll_once(&client, &mailbox).await;
            tokio::time::sleep(interval).await;
        }
    };

    tokio::select! {
        _ = tokio::signal::ctrl_c() => {
            println!("{}", json!({ "event": "stopped" }));
        }
        _ = poll => {}
    }

    Ok(())
}

/// One poll cycle: drain master mailbox and handle each message.
/// Extracted for testability.
pub async fn poll_once(client: &SqliteClient, mailbox: &Arc<AgentMailbox>) {
    match mailbox.read_messages("master").await {
        Ok(msgs) => {
            for msg in msgs {
                let sender_id = msg.from.clone();
                match ProtocolSender::parse_message(&msg) {
                    Ok(ProtocolMessage::TaskResult(p)) => {
                        let status = if p.success { "done" } else { "failed" };
                        let _ = client.update_ticket_status_str(&p.ticket_id, status);
                        let _ = client.update_instance_status(&sender_id, "idle");
                        println!(
                            "{}",
                            json!({
                                "event": "task_result",
                                "ticket_id": p.ticket_id,
                                "success": p.success
                            })
                        );
                    }
                    Ok(ProtocolMessage::Heartbeat(p)) => {
                        let _ = client.update_instance_last_seen(&p.instance_id);
                    }
                    Ok(ProtocolMessage::StatusUpdate(p)) => {
                        let _ = client.update_instance_status(&p.instance_id, &p.status);
                    }
                    Ok(_) => {} // ignore other variants
                    Err(e) => {
                        tracing::warn!("[master:poll] parse error: {e}");
                    }
                }
            }
        }
        Err(e) => {
            tracing::warn!("[master:poll] mailbox read error: {e}");
        }
    }
}

fn expand_tilde(path: &str) -> String {
    if path.starts_with("~/") {
        if let Ok(home) = std::env::var("HOME") {
            return format!("{}/{}", home, &path[2..]);
        }
    }
    path.to_string()
}

// ─── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use eket_core::db::{create_pool, SqliteClient};
    use eket_engine::{
        mailbox::AgentMailbox,
        protocol::{HeartbeatPayload, ProtocolSender, TaskResultPayload},
    };
    use std::sync::Arc;
    use tempfile::TempDir;

    fn make_client() -> SqliteClient {
        SqliteClient::new(create_pool(":memory:").unwrap())
    }

    fn make_setup(dir: &TempDir) -> (SqliteClient, Arc<AgentMailbox>, ProtocolSender) {
        let client = make_client();
        let mailbox = Arc::new(AgentMailbox::new(dir.path()));
        let sender = ProtocolSender::new(mailbox.clone());
        (client, mailbox, sender)
    }

    /// 1. TaskResult{success:true} → ticket becomes "done", slaver becomes "idle"
    #[tokio::test]
    async fn poll_task_result_success() {
        let dir = TempDir::new().unwrap();
        let (client, mailbox, sender) = make_setup(&dir);

        client.create_ticket("TASK-10", "Test", "P1", "task").unwrap();
        client.upsert_instance("slaver-a", "slaver", &[], "busy").unwrap();

        sender
            .send_task_result(
                "slaver-a",
                "master",
                TaskResultPayload {
                    ticket_id: "TASK-10".into(),
                    success: true,
                    output: None,
                    pr_url: None,
                    error: None,
                },
            )
            .await
            .unwrap();

        poll_once(&client, &mailbox).await;

        let row = client.get_ticket_row("TASK-10").unwrap().unwrap();
        assert_eq!(row.status, "done");

        let inst = client.get_instance("slaver-a").unwrap().unwrap();
        assert_eq!(inst.status, "idle");
    }

    /// 2. TaskResult{success:false} → ticket becomes "failed"
    #[tokio::test]
    async fn poll_task_result_failure() {
        let dir = TempDir::new().unwrap();
        let (client, mailbox, sender) = make_setup(&dir);

        client.create_ticket("TASK-11", "Fail test", "P2", "task").unwrap();
        client.upsert_instance("slaver-b", "slaver", &[], "busy").unwrap();

        sender
            .send_task_result(
                "slaver-b",
                "master",
                TaskResultPayload {
                    ticket_id: "TASK-11".into(),
                    success: false,
                    output: None,
                    pr_url: None,
                    error: Some("compile error".into()),
                },
            )
            .await
            .unwrap();

        poll_once(&client, &mailbox).await;

        let row = client.get_ticket_row("TASK-11").unwrap().unwrap();
        assert_eq!(row.status, "failed");
    }

    /// 3. Heartbeat message → update_instance_last_seen called (last_seen timestamp updated)
    #[tokio::test]
    async fn poll_heartbeat_updates_last_seen() {
        let dir = TempDir::new().unwrap();
        let (client, mailbox, sender) = make_setup(&dir);

        client.upsert_instance("slaver-c", "slaver", &[], "idle").unwrap();

        // Record initial last_seen
        let before = client.get_instance("slaver-c").unwrap().unwrap().last_seen;

        // Sleep 1s so timestamp changes
        tokio::time::sleep(std::time::Duration::from_millis(1100)).await;

        sender
            .send_heartbeat(
                "slaver-c",
                "master",
                HeartbeatPayload {
                    instance_id: "slaver-c".into(),
                    role: "slaver".into(),
                    timestamp: chrono::Utc::now(),
                    load: 0,
                },
            )
            .await
            .unwrap();

        poll_once(&client, &mailbox).await;

        let after = client.get_instance("slaver-c").unwrap().unwrap().last_seen;
        assert!(after > before, "last_seen should be updated after heartbeat");
    }
}
