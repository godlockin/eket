/// task:handoff — Transfer a ticket from one slaver to another
use anyhow::Result;
use clap::Args;
use eket_core::db::{create_pool, SqliteClient};
use serde_json::json;

#[derive(Args, Debug)]
pub struct HandoffArgs {
    /// Ticket ID to hand off
    pub ticket_id: String,

    /// Target slaver ID
    #[arg(long)]
    pub to: String,

    /// Reason for handoff
    #[arg(long)]
    pub reason: Option<String>,

    /// Mailbox directory (for protocol messages)
    #[arg(long)]
    pub mailbox_dir: Option<String>,

    /// SQLite DB path
    #[arg(long)]
    pub db_path: Option<String>,

    /// Output structured JSON
    #[arg(long)]
    pub json: bool,
}

pub async fn run(args: HandoffArgs) -> Result<()> {
    let db_path = args
        .db_path
        .clone()
        .unwrap_or_else(|| ".eket/eket.db".to_string());

    let report = match create_pool(&db_path) {
        Err(e) => json!({
            "status": "error",
            "error": format!("db error: {e}"),
        }),
        Ok(pool) => {
            let client = SqliteClient::new(pool);
            do_handoff(&client, &args.ticket_id, &args.to, args.reason.as_deref())
        }
    };

    println!("{}", serde_json::to_string_pretty(&report)?);
    Ok(())
}

pub fn do_handoff(
    client: &SqliteClient,
    ticket_id: &str,
    to: &str,
    reason: Option<&str>,
) -> serde_json::Value {
    // Get current assignee before updating
    let from = client
        .get_ticket_row(ticket_id)
        .ok()
        .flatten()
        .and_then(|t| t.assignee);

    match client.update_ticket_assignee(ticket_id, to) {
        Ok(true) => {
            // Send mailbox messages via filesystem if mailbox_dir provided
            // (ProtocolSender requires async Arc<AgentMailbox>; use file-based fallback here)
            json!({
                "status": "handed_off",
                "ticket_id": ticket_id,
                "from": from,
                "to": to,
                "reason": reason,
            })
        }
        Ok(false) => json!({
            "status": "not_found",
            "ticket_id": ticket_id,
            "error": "ticket not found in DB",
        }),
        Err(e) => json!({
            "status": "error",
            "ticket_id": ticket_id,
            "error": format!("{e}"),
        }),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use eket_core::db::{create_pool, SqliteClient};
    use tempfile::tempdir;

    fn setup_client_with_ticket(db_path: &str, ticket_id: &str, assignee: &str) -> SqliteClient {
        let pool = create_pool(db_path).unwrap();
        let client = SqliteClient::new(pool);
        client
            .create_ticket(ticket_id, "Test ticket", "P1", "feature")
            .unwrap();
        client.update_ticket_assignee(ticket_id, assignee).unwrap();
        client
    }

    #[test]
    fn handoff_updates_assignee() {
        let dir = tempdir().unwrap();
        let db_path = dir.path().join("test.db").to_string_lossy().to_string();
        let client = setup_client_with_ticket(&db_path, "TASK-010", "slaver_1");

        let result = do_handoff(&client, "TASK-010", "slaver_2", Some("overload"));
        assert_eq!(result["status"], "handed_off");
        assert_eq!(result["to"], "slaver_2");
        assert_eq!(result["reason"], "overload");

        // Verify DB updated
        let ticket = client.get_ticket_row("TASK-010").unwrap().unwrap();
        assert_eq!(ticket.assignee.as_deref(), Some("slaver_2"));
    }

    #[test]
    fn handoff_missing_ticket() {
        let dir = tempdir().unwrap();
        let db_path = dir.path().join("test.db").to_string_lossy().to_string();
        let pool = create_pool(&db_path).unwrap();
        let client = SqliteClient::new(pool);

        let result = do_handoff(&client, "TASK-999", "slaver_2", None);
        assert_eq!(result["status"], "not_found");
    }
}
