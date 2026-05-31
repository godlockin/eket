/// team:status — Show all registered slaver instances and their workloads
use anyhow::Result;
use clap::Args;
use eket_core::db::{create_pool, SqliteClient};
use serde_json::json;

#[derive(Args, Debug)]
pub struct TeamStatusArgs {
    /// SQLite DB path
    #[arg(long)]
    pub db_path: Option<String>,

    /// Tickets directory (unused, for API parity)
    #[arg(long)]
    pub tickets_dir: Option<String>,

    /// Output structured JSON
    #[arg(long)]
    pub json: bool,
}

pub async fn run(args: TeamStatusArgs) -> Result<()> {
    let db_path = args.db_path.unwrap_or_else(|| ".eket/eket.db".to_string());

    let report = match create_pool(&db_path) {
        Err(e) => json!({ "error": format!("db error: {e}") }),
        Ok(pool) => {
            let client = SqliteClient::new(pool);
            build_team_status(&client)
        }
    };

    println!("{}", serde_json::to_string_pretty(&report)?);
    Ok(())
}

pub fn build_team_status(client: &SqliteClient) -> serde_json::Value {
    let instances = match client.list_instances(None) {
        Ok(v) => v,
        Err(e) => return json!({ "error": format!("{e}") }),
    };

    // For each instance, find their current ticket (in_progress)
    let tickets = client
        .list_tickets(Some("in_progress"), None, None)
        .unwrap_or_default();

    let agents: Vec<serde_json::Value> = instances
        .iter()
        .map(|inst| {
            let current_ticket = tickets
                .iter()
                .find(|t| t.assignee.as_deref() == Some(&inst.id))
                .map(|t| t.id.clone());
            json!({
                "id": inst.id,
                "role": inst.role,
                "status": inst.status,
                "current_ticket": current_ticket,
            })
        })
        .collect();

    let total = agents.len();
    let idle = agents.iter().filter(|a| a["status"] == "idle").count();
    let busy = agents.iter().filter(|a| a["status"] == "busy").count();
    let offline = agents.iter().filter(|a| a["status"] == "offline").count();

    json!({
        "agents": agents,
        "summary": {
            "total": total,
            "idle": idle,
            "busy": busy,
            "offline": offline,
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use eket_core::db::{create_pool, SqliteClient};
    use tempfile::tempdir;

    #[test]
    fn empty_team() {
        let dir = tempdir().unwrap();
        let db_path = dir.path().join("test.db").to_string_lossy().to_string();
        let pool = create_pool(&db_path).unwrap();
        let client = SqliteClient::new(pool);

        let result = build_team_status(&client);
        assert_eq!(result["summary"]["total"], 0);
        assert_eq!(result["agents"].as_array().unwrap().len(), 0);
    }

    #[test]
    fn team_with_agents() {
        let dir = tempdir().unwrap();
        let db_path = dir.path().join("test.db").to_string_lossy().to_string();
        let pool = create_pool(&db_path).unwrap();
        let client = SqliteClient::new(pool);

        client
            .upsert_instance("slaver_1", "backend", &[], "busy")
            .unwrap();
        client
            .upsert_instance("slaver_2", "frontend", &[], "idle")
            .unwrap();

        let result = build_team_status(&client);
        assert_eq!(result["summary"]["total"], 2);
        assert_eq!(result["summary"]["busy"], 1);
        assert_eq!(result["summary"]["idle"], 1);
    }
}
