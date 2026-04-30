/// master:heartbeat — 长驻进程，周期扫描 ready tickets 并分配给 idle slaver
use anyhow::Result;
use clap::Args;
use eket_core::{
    dag::{parse_tickets_dag, ready_tickets},
    db::{create_pool, SqliteClient},
};
use eket_engine::{
    mailbox::AgentMailbox,
    protocol::{ProtocolSender, TaskAssignPayload},
};
use serde_json::json;
use std::{collections::HashSet, path::{Path, PathBuf}, sync::Arc};

#[derive(Args, Debug)]
pub struct MasterHeartbeatArgs {
    /// Poll interval in seconds
    #[arg(long, default_value_t = 10)]
    pub interval: u64,

    /// Directory containing TASK-NNN.md ticket files
    #[arg(long, default_value = "./jira/tickets")]
    pub tickets_dir: String,

    /// SQLite db path
    #[arg(long, default_value = "~/.eket/eket.db")]
    pub db_path: String,

    /// Directory for mailbox files
    #[arg(long, default_value = "~/.eket/mailbox")]
    pub mailbox_dir: String,
}

pub async fn run(args: MasterHeartbeatArgs) -> Result<()> {
    let db_path = expand_tilde(&args.db_path);
    let mailbox_dir = expand_tilde(&args.mailbox_dir);
    let tickets_dir = PathBuf::from(&args.tickets_dir);
    let interval = std::time::Duration::from_secs(args.interval);

    let pool = create_pool(&db_path)?;
    let client = Arc::new(SqliteClient::new(pool));
    let mailbox = Arc::new(AgentMailbox::new(&mailbox_dir));

    let poll = async {
        loop {
            check_once(&client, &mailbox, &tickets_dir).await;
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

/// One heartbeat cycle: scan ready tickets → assign to idle slavers.
/// Extracted for testability.
pub async fn check_once(client: &SqliteClient, mailbox: &Arc<AgentMailbox>, tickets_dir: &Path) {
    // 1. Collect completed / failed ticket IDs from DB
    let completed: HashSet<String> = client
        .list_tickets(Some("done"), None, None)
        .unwrap_or_default()
        .into_iter()
        .map(|r| r.id)
        .collect();

    let failed: HashSet<String> = client
        .list_tickets(Some("failed"), None, None)
        .unwrap_or_default()
        .into_iter()
        .map(|r| r.id)
        .collect();

    // 2. Parse DAG from filesystem → derive ready tickets
    let dag = parse_tickets_dag(tickets_dir);
    let ready = ready_tickets(&dag, &completed, &failed);

    // 3. Assign each ready ticket to the first idle slaver
    let sender = ProtocolSender::new(mailbox.clone());

    for ticket_id in ready {
        let instances = client.list_instances(Some("slaver")).unwrap_or_default();
        let idle = instances.into_iter().find(|i| i.status == "idle");

        match idle {
            None => {
                tracing::warn!("[master:heartbeat] no idle slaver for ticket {ticket_id}");
            }
            Some(slaver) => {
                let _ = client.update_ticket_status_str(&ticket_id, "in_progress");
                let _ = client.update_ticket_assignee(&ticket_id, &slaver.id);

                let payload = TaskAssignPayload {
                    ticket_id: ticket_id.clone(),
                    title: ticket_id.clone(),
                    priority: "normal".to_string(),
                    instructions: String::new(),
                    deadline_secs: None,
                };
                let _ = sender.send_task_assign("master", &slaver.id, payload).await;

                let _ = client.update_instance_status(&slaver.id, "busy");

                println!(
                    "{}",
                    json!({
                        "event": "task_assigned",
                        "ticket_id": ticket_id,
                        "slaver_id": slaver.id
                    })
                );
            }
        }
    }
}

fn expand_tilde(path: &str) -> String {
    if let Some(rest) = path.strip_prefix("~/") {
        if let Ok(home) = std::env::var("HOME") {
            return format!("{home}/{rest}");
        }
    }
    path.to_string()
}

// ─── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use eket_core::db::{create_pool, SqliteClient};
    use std::fs;
    use tempfile::TempDir;

    fn make_client() -> SqliteClient {
        SqliteClient::new(create_pool(":memory:").unwrap())
    }

    /// Write a minimal TASK-NNN.md into `dir`
    fn make_ticket_file(dir: &TempDir, id: &str, status: &str, blocked_by: &[&str]) {
        let inner = if blocked_by.is_empty() {
            String::new()
        } else {
            blocked_by.join(", ")
        };
        let content = format!(
            "# {id}: Test ticket\n- **状态**: {status}\n- blocked_by: [{inner}]\n"
        );
        fs::write(dir.path().join(format!("{id}.md")), content).unwrap();
    }

    /// 1. One todo ticket (no blocked_by) + one idle slaver → assigned
    #[tokio::test]
    async fn heartbeat_assigns_ready_ticket() {
        let ticket_dir = TempDir::new().unwrap();
        let mailbox_dir = TempDir::new().unwrap();
        let client = make_client();

        make_ticket_file(&ticket_dir, "TASK-1", "todo", &[]);
        client.create_ticket("TASK-1", "Test", "P1", "task").unwrap();
        client.upsert_instance("slaver-1", "slaver", &[], "idle").unwrap();

        let mailbox = Arc::new(AgentMailbox::new(mailbox_dir.path()));
        check_once(&client, &mailbox, ticket_dir.path()).await;

        let row = client.get_ticket_row("TASK-1").unwrap().unwrap();
        assert_eq!(row.status, "in_progress", "ticket should be in_progress");
        assert_eq!(row.assignee.as_deref(), Some("slaver-1"), "assignee should be set");

        let inst = client.get_instance("slaver-1").unwrap().unwrap();
        assert_eq!(inst.status, "busy", "slaver should be busy after assignment");
    }

    /// 2. Ready ticket but no idle slaver → ticket stays todo
    #[tokio::test]
    async fn heartbeat_skips_when_no_slaver() {
        let ticket_dir = TempDir::new().unwrap();
        let mailbox_dir = TempDir::new().unwrap();
        let client = make_client();

        make_ticket_file(&ticket_dir, "TASK-2", "todo", &[]);
        client.create_ticket("TASK-2", "No slaver test", "P1", "task").unwrap();
        // deliberately no slaver registered

        let mailbox = Arc::new(AgentMailbox::new(mailbox_dir.path()));
        check_once(&client, &mailbox, ticket_dir.path()).await;

        let row = client.get_ticket_row("TASK-2").unwrap().unwrap();
        assert_eq!(row.status, "todo", "ticket should remain todo when no idle slaver");
    }

    /// 3. Ticket blocked by incomplete dependency → not assigned
    #[tokio::test]
    async fn heartbeat_skips_blocked_ticket() {
        let ticket_dir = TempDir::new().unwrap();
        let mailbox_dir = TempDir::new().unwrap();
        let client = make_client();

        // TASK-3 blocked by TASK-4 (not done)
        make_ticket_file(&ticket_dir, "TASK-3", "todo", &["TASK-4"]);
        make_ticket_file(&ticket_dir, "TASK-4", "todo", &[]);
        client.create_ticket("TASK-3", "Blocked ticket", "P1", "task").unwrap();
        client.create_ticket("TASK-4", "Dependency", "P1", "task").unwrap();

        // One idle slaver available — will be consumed by TASK-4 (unblocked)
        client.upsert_instance("slaver-3", "slaver", &[], "idle").unwrap();

        let mailbox = Arc::new(AgentMailbox::new(mailbox_dir.path()));
        check_once(&client, &mailbox, ticket_dir.path()).await;

        // TASK-3 must remain todo — blocked by TASK-4 which is not done
        let row3 = client.get_ticket_row("TASK-3").unwrap().unwrap();
        assert_eq!(row3.status, "todo", "TASK-3 should remain todo (blocked by TASK-4)");
    }
}
