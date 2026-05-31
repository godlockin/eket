/// task:test — record test results for a ticket
///
/// 核心流程：
/// 1. 找 project_root (tickets dir)
/// 2. 验证 ticket 文件存在
/// 3. append_section_if_absent 写入测试记录（幂等）
/// 4. 触发 DocEvent::TaskTested
/// 5. 输出 JSON
use anyhow::Result;
use clap::Parser;
use eket_core::doc_lifecycle::{
    append_section_if_absent, handle_event, DocEvent, TemplateRenderer,
};
use serde_json::json;
use std::path::PathBuf;

// ─── Args ────────────────────────────────────────────────────────────────────

#[derive(Parser, Debug)]
pub struct TaskTestArgs {
    /// Ticket ID (e.g. TASK-042)
    pub ticket_id: String,

    /// Test result: pass or fail
    #[arg(long)]
    pub status: String,

    /// Code coverage percentage 0-100 (optional)
    #[arg(long)]
    pub coverage: Option<u8>,

    /// Free-form notes (optional)
    #[arg(long)]
    pub notes: Option<String>,

    /// tickets 目录路径（默认自动探测）
    #[arg(long)]
    pub tickets_dir: Option<PathBuf>,
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

fn find_project_root(tickets_dir_hint: Option<PathBuf>) -> Result<PathBuf> {
    if let Some(p) = tickets_dir_hint {
        // Return parent of tickets dir as project root
        return Ok(p
            .parent()
            .and_then(|p| p.parent())
            .map(|p| p.to_path_buf())
            .unwrap_or(p));
    }
    let mut dir = std::env::current_dir()?;
    loop {
        let candidate = dir.join("jira/tickets");
        if candidate.is_dir() {
            return Ok(dir);
        }
        if !dir.pop() {
            break;
        }
    }
    anyhow::bail!("Cannot find jira/tickets/ directory. Pass --tickets-dir explicitly.")
}

fn find_tickets_dir(tickets_dir_hint: Option<PathBuf>) -> Result<PathBuf> {
    if let Some(p) = tickets_dir_hint {
        return Ok(p);
    }
    let mut dir = std::env::current_dir()?;
    loop {
        let candidate = dir.join("jira/tickets");
        if candidate.is_dir() {
            return Ok(candidate);
        }
        if !dir.pop() {
            break;
        }
    }
    anyhow::bail!("Cannot find jira/tickets/ directory. Pass --tickets-dir explicitly.")
}

// ─── Main ─────────────────────────────────────────────────────────────────────

pub async fn run(args: TaskTestArgs) -> Result<()> {
    // Validate status
    if args.status != "pass" && args.status != "fail" {
        anyhow::bail!("--status must be 'pass' or 'fail', got '{}'", args.status);
    }

    let tickets_dir = find_tickets_dir(args.tickets_dir.clone())?;
    let project_root = find_project_root(args.tickets_dir)?;

    // Verify ticket exists
    let ticket_path = tickets_dir.join(format!("{}.md", args.ticket_id));
    if !ticket_path.exists() {
        anyhow::bail!("Ticket file not found: {}", ticket_path.display());
    }

    let now = chrono::Utc::now();
    let timestamp = now.to_rfc3339();

    // Build section content
    let cov_str = args
        .coverage
        .map(|c| format!("{c}%"))
        .unwrap_or_else(|| "N/A".to_string());
    let notes_str = args.notes.as_deref().unwrap_or("N/A");

    let section_marker = "<!-- eket:section:测试记录 -->";
    let section_content = format!(
        "\n{section_marker}\n## 测试记录\n\n**测试时间**: {timestamp}\n**状态**: {status}\n**覆盖率**: {cov_str}\n**备注**: {notes_str}\n",
        status = args.status,
    );

    // append_section_if_absent uses section_marker as the marker to check
    append_section_if_absent(&ticket_path, section_marker, &section_content)?;

    // Trigger DocEvent::TaskTested (handle_event also calls append_section_if_absent internally,
    // but since section already written above it will be a no-op — idempotent)
    let renderer = TemplateRenderer::new();
    handle_event(
        DocEvent::TaskTested {
            ticket_id: args.ticket_id.clone(),
            status: args.status.clone(),
            coverage: args.coverage,
            project_root,
        },
        &renderer,
    )
    .await?;

    // Output JSON
    let report = json!({
        "success": true,
        "ticket_id": args.ticket_id,
        "status": args.status,
        "coverage": args.coverage,
        "recorded_at": timestamp,
    });
    println!("{}", serde_json::to_string_pretty(&report)?);
    Ok(())
}

// ─── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    fn make_project(dir: &TempDir) -> PathBuf {
        let tickets = dir.path().join("jira/tickets");
        fs::create_dir_all(&tickets).unwrap();
        tickets
    }

    fn make_args(ticket_id: &str, status: &str, tickets_dir: PathBuf) -> TaskTestArgs {
        TaskTestArgs {
            ticket_id: ticket_id.to_string(),
            status: status.to_string(),
            coverage: Some(85),
            notes: Some("All unit tests pass".to_string()),
            tickets_dir: Some(tickets_dir),
        }
    }

    #[tokio::test]
    async fn basic_test_record() {
        let dir = TempDir::new().unwrap();
        let tickets_dir = make_project(&dir);
        let ticket_path = tickets_dir.join("TASK-1.md");
        fs::write(
            &ticket_path,
            "# TASK-1: Test Ticket\n\n## 验收标准\n\n- [ ] todo\n",
        )
        .unwrap();

        let args = make_args("TASK-1", "pass", tickets_dir);
        run(args).await.unwrap();

        let content = fs::read_to_string(&ticket_path).unwrap();
        assert!(content.contains("<!-- eket:section:测试记录 -->"));
        assert!(content.contains("**状态**: pass"));
        assert!(content.contains("**覆盖率**: 85%"));
        assert!(content.contains("All unit tests pass"));
    }

    #[tokio::test]
    async fn idempotent_on_second_run() {
        let dir = TempDir::new().unwrap();
        let tickets_dir = make_project(&dir);
        let ticket_path = tickets_dir.join("TASK-2.md");
        fs::write(
            &ticket_path,
            "# TASK-2: Idempotent Test\n\n## 验收标准\n\n- [ ] todo\n",
        )
        .unwrap();

        // Run twice
        let args1 = make_args("TASK-2", "pass", tickets_dir.clone());
        run(args1).await.unwrap();
        let args2 = make_args("TASK-2", "pass", tickets_dir);
        run(args2).await.unwrap();

        let content = fs::read_to_string(&ticket_path).unwrap();
        // Section marker must appear exactly once
        assert_eq!(
            content.matches("<!-- eket:section:测试记录 -->").count(),
            1,
            "Section should be appended only once"
        );
    }

    #[tokio::test]
    async fn missing_ticket_errors() {
        let dir = TempDir::new().unwrap();
        let tickets_dir = make_project(&dir);
        let args = make_args("TASK-999", "pass", tickets_dir);
        let result = run(args).await;
        assert!(result.is_err(), "Should error when ticket missing");
    }

    #[tokio::test]
    async fn invalid_status_errors() {
        let dir = TempDir::new().unwrap();
        let tickets_dir = make_project(&dir);
        let ticket_path = tickets_dir.join("TASK-3.md");
        fs::write(&ticket_path, "# TASK-3\n").unwrap();

        let args = TaskTestArgs {
            ticket_id: "TASK-3".to_string(),
            status: "unknown".to_string(),
            coverage: None,
            notes: None,
            tickets_dir: Some(tickets_dir),
        };
        let result = run(args).await;
        assert!(result.is_err(), "Invalid status should error");
    }
}
