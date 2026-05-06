/// task:progress — Show ticket completion statistics and critical path
use anyhow::Result;
use clap::Args;
use eket_core::dag::{critical_path, parse_tickets_dag};
use serde_json::json;
use std::path::PathBuf;

#[derive(Args, Debug)]
pub struct TaskProgressArgs {
    /// Tickets directory (jira/tickets)
    #[arg(long)]
    pub tickets_dir: Option<String>,

    /// SQLite DB path (unused, for API parity)
    #[arg(long)]
    pub db_path: Option<String>,

    /// Output structured JSON
    #[arg(long)]
    pub json: bool,
}

pub async fn run(args: TaskProgressArgs) -> Result<()> {
    let tickets_dir = args
        .tickets_dir
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("jira/tickets"));

    let report = build_progress(&tickets_dir);
    println!("{}", serde_json::to_string_pretty(&report)?);
    Ok(())
}

pub fn build_progress(tickets_dir: &std::path::Path) -> serde_json::Value {
    let dag = parse_tickets_dag(tickets_dir);

    let total = dag.nodes.len();
    let done = dag.nodes.iter().filter(|n| n.status == "done" || n.status == "completed").count();
    let in_progress = dag.nodes.iter().filter(|n| n.status == "in_progress").count();
    let failed = dag.nodes.iter().filter(|n| n.status == "failed").count();
    let todo = total - done - in_progress - failed;

    let completion_rate = if total == 0 {
        0.0_f64
    } else {
        done as f64 / total as f64
    };

    let cp = critical_path(&dag);
    let cp_total = cp.len();
    let cp_done = cp
        .iter()
        .filter(|id| {
            dag.nodes
                .iter()
                .find(|n| &n.id == *id)
                .map(|n| n.status == "done" || n.status == "completed")
                .unwrap_or(false)
        })
        .count();

    json!({
        "total": total,
        "done": done,
        "in_progress": in_progress,
        "todo": todo,
        "failed": failed,
        "completion_rate": (completion_rate * 100.0).round() / 100.0,
        "critical_path": cp,
        "critical_path_done": cp_done,
        "critical_path_total": cp_total,
        // TASK-255: ticket list with id/status/assignee for source column display
        "tickets": dag.nodes.iter().map(|n| json!({
            "id": n.id,
            "status": n.status,
            "assignee": n.assignee,
            "label": n.label,
        })).collect::<Vec<_>>(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn empty_tickets() {
        let dir = tempdir().unwrap();
        let result = build_progress(dir.path());
        assert_eq!(result["total"], 0);
        assert_eq!(result["done"], 0);
        assert_eq!(result["completion_rate"], 0.0);
    }

    #[test]
    fn progress_calculation() {
        let dir = tempdir().unwrap();
        // Create 3 ticket files: 1 done, 1 in_progress, 1 todo
        fs::write(
            dir.path().join("TASK-001.md"),
            "# TASK-001: Setup\n**状态**: done\n",
        ).unwrap();
        fs::write(
            dir.path().join("TASK-002.md"),
            "# TASK-002: Impl\n**状态**: in_progress\n",
        ).unwrap();
        fs::write(
            dir.path().join("TASK-003.md"),
            "# TASK-003: Tests\n**状态**: todo\n- blocked_by: [TASK-002]\n",
        ).unwrap();

        let result = build_progress(dir.path());
        assert_eq!(result["total"], 3);
        assert_eq!(result["done"], 1);
        assert_eq!(result["in_progress"], 1);
        assert_eq!(result["todo"], 1);
    }
}
