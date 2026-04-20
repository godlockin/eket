/// task:resume — Resume a ticket from execution checkpoint
use anyhow::Result;
use clap::Args;
use eket_core::db::{create_pool, SqliteClient};
use serde_json::json;

#[derive(Args, Debug)]
pub struct TaskResumeArgs {
    /// Ticket ID to resume
    pub ticket_id: String,

    /// Slaver ID to look up checkpoint for
    #[arg(long)]
    pub slaver_id: Option<String>,

    /// SQLite DB path
    #[arg(long)]
    pub db_path: Option<String>,
}

pub async fn run(args: TaskResumeArgs) -> Result<()> {
    let db_path = args
        .db_path
        .clone()
        .unwrap_or_else(|| ".eket/eket.db".to_string());

    let slaver_id = args.slaver_id.clone().unwrap_or_else(|| {
        std::env::var("EKET_SLAVER_ID").unwrap_or_else(|_| "unknown".to_string())
    });

    let report = match create_pool(&db_path) {
        Err(e) => json!({
            "status": "error",
            "ticket_id": args.ticket_id,
            "error": format!("db error: {e}"),
        }),
        Ok(pool) => {
            let client = SqliteClient::new(pool);
            match client.get_checkpoint(&args.ticket_id, &slaver_id) {
                Err(e) => json!({
                    "status": "error",
                    "ticket_id": args.ticket_id,
                    "error": format!("{e}"),
                }),
                Ok(None) => json!({
                    "status": "not_found",
                    "ticket_id": args.ticket_id,
                    "checkpoint": null,
                }),
                Ok(Some(cp)) => json!({
                    "status": "resumable",
                    "ticket_id": args.ticket_id,
                    "checkpoint": {
                        "ticket_id": cp.ticket_id,
                        "slaver_id": cp.slaver_id,
                        "phase": cp.phase,
                        "session_id": cp.session_id,
                        "metadata": cp.metadata,
                        "created_at": cp.created_at.to_rfc3339(),
                        "updated_at": cp.updated_at.to_rfc3339(),
                    }
                }),
            }
        }
    };

    println!("{}", serde_json::to_string_pretty(&report)?);
    Ok(())
}

#[cfg(test)]
mod tests {
    use eket_core::{
        db::{create_pool, SqliteClient},
        types::ExecutionCheckpoint,
    };
    use tempfile::tempdir;

    #[test]
    fn resume_not_found() {
        let dir = tempdir().unwrap();
        let db_path = dir.path().join("test.db").to_string_lossy().to_string();
        let pool = create_pool(&db_path).unwrap();
        let client = SqliteClient::new(pool);

        let result = client.get_checkpoint("TASK-999", "slaver_1").unwrap();
        assert!(result.is_none());
    }

    #[test]
    fn resume_with_checkpoint() {
        let dir = tempdir().unwrap();
        let db_path = dir.path().join("test.db").to_string_lossy().to_string();
        let pool = create_pool(&db_path).unwrap();
        let client = SqliteClient::new(pool);

        let cp = ExecutionCheckpoint {
            ticket_id: "TASK-042".to_string(),
            slaver_id: "slaver_1".to_string(),
            phase: "analysis".to_string(),
            session_id: Some("sess-abc".to_string()),
            metadata: Some(serde_json::json!({"step": 2})),
            created_at: chrono::Utc::now(),
            updated_at: chrono::Utc::now(),
        };
        client.save_checkpoint(&cp).unwrap();

        let found = client.get_checkpoint("TASK-042", "slaver_1").unwrap();
        assert!(found.is_some());
        let found = found.unwrap();
        assert_eq!(found.phase, "analysis");
        assert_eq!(found.session_id, Some("sess-abc".to_string()));
    }
}
