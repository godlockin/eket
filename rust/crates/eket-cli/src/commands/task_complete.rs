/// task:complete — 对应 TS: commands/complete.ts
///
/// 核心流程：
/// 1. 找到 ticket 文件，验证状态是 in_progress
/// 2. 更新状态 → done
/// 3. 删除 SQLite checkpoint
/// 4. 删除 .eket/ACTIVE_CONTEXT.md
/// 5. 可选：追加 git commit trailer（Confidence / Scope-risk）
/// 6. 输出 JSON 结果

use anyhow::Result;
use eket_core::{
    config::EketConfig,
    db::{create_pool, SqliteClient},
    ticket::{find_ticket, TicketFile},
    types::TicketStatus,
};
use serde_json::json;
use std::path::{Path, PathBuf};

// ─── Git helpers ──────────────────────────────────────────────────────────────

async fn git_changed_file_count() -> u32 {
    let out = tokio::process::Command::new("git")
        .args(["diff", "HEAD~1", "--stat"])
        .output()
        .await;
    let Ok(out) = out else { return 0 };
    let text = String::from_utf8_lossy(&out.stdout);
    let last = text.lines().last().unwrap_or("");
    last.split_whitespace()
        .next()
        .and_then(|s| s.parse().ok())
        .unwrap_or(0)
}

fn scope_risk(file_count: u32) -> &'static str {
    if file_count <= 5 { "low" }
    else if file_count <= 15 { "medium" }
    else { "high" }
}

async fn append_commit_trailer(ticket_id: &str, slaver_id: &str) {
    // Check existing commit message
    let log = tokio::process::Command::new("git")
        .args(["log", "-1", "--format=%B"])
        .output()
        .await;
    let Ok(log) = log else { return };
    let current_msg = String::from_utf8_lossy(&log.stdout);

    if current_msg.contains("Confidence:") {
        return; // Already has trailer
    }

    let file_count = git_changed_file_count().await;
    let trailer = format!(
        "Confidence: high\nRejected-approaches: none\nDirective: {}\nScope-risk: {}",
        &ticket_id[..ticket_id.len().min(80)],
        scope_risk(file_count)
    );
    let new_msg = format!("{}\n\n{trailer}", current_msg.trim());

    let _ = tokio::process::Command::new("git")
        .args(["commit", "--amend", "-m", &new_msg])
        .output()
        .await;
}

// ─── Conflict notice ──────────────────────────────────────────────────────────

fn write_conflict_notice(
    project_root: &Path,
    ticket_id: &str,
    slaver_id: &str,
    error_msg: &str,
) {
    let dir = project_root.join("inbox/human_feedback");
    let _ = std::fs::create_dir_all(&dir);
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let filename = format!("worktree-conflict-{ticket_id}-{ts}.md");
    let content = format!(
        "## Worktree 合并冲突 — {ticket_id}\nSlaver: {slaver_id}\n错误: {error_msg}\n"
    );
    let _ = std::fs::write(dir.join(filename), content);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

pub async fn run(ticket_id: String, skip_trailer: bool) -> Result<()> {
    let config = EketConfig::load().unwrap_or_default();
    let project_root = find_project_root().unwrap_or_else(|| std::env::current_dir().unwrap());
    let tickets_dir = project_root.join("jira/tickets");

    let slaver_id = get_slaver_id(&project_root);

    // Find and validate ticket
    let mut ticket = find_ticket(&tickets_dir, &ticket_id)
        .map_err(|e| anyhow::anyhow!("{e}"))?;

    if ticket.status == TicketStatus::Done {
        println!("{}", serde_json::to_string_pretty(&json!({
            "status": "already_done",
            "ticket_id": ticket_id,
            "message": "Ticket is already marked done",
        }))?);
        return Ok(());
    }

    if ticket.status != TicketStatus::InProgress && ticket.status != TicketStatus::Review {
        let report = json!({
            "status": "error",
            "message": format!("Expected in_progress/review, got: {}", ticket.status),
            "ticket_id": ticket_id,
        });
        println!("{}", serde_json::to_string_pretty(&report)?);
        return Ok(());
    }

    // Update ticket → done
    ticket.set_status(TicketStatus::Done, Some(&slaver_id))
        .map_err(|e| anyhow::anyhow!("Failed to update ticket: {e}"))?;

    // Delete checkpoint from SQLite
    let pool = create_pool(&config.sqlite.path).ok();
    if let Some(pool) = pool {
        let client = SqliteClient::new(pool);
        let _ = client.delete_checkpoint(&ticket_id, &slaver_id);
    }

    // Remove ACTIVE_CONTEXT.md
    let _ = std::fs::remove_file(project_root.join(".eket/ACTIVE_CONTEXT.md"));

    // Append git commit trailer
    if !skip_trailer {
        append_commit_trailer(&ticket_id, &slaver_id).await;
    }

    // Output
    let report = json!({
        "status": "completed",
        "ticket_id": ticket_id,
        "title": ticket.title,
        "slaver_id": slaver_id,
        "next": "Submit PR: gh pr create --base miao",
    });
    println!("{}", serde_json::to_string_pretty(&report)?);
    Ok(())
}

fn get_slaver_id(project_root: &Path) -> String {
    if let Ok(id) = std::env::var("EKET_SLAVER_ID") {
        return id;
    }
    let id_file = project_root.join(".eket/slaver-id");
    if let Ok(id) = std::fs::read_to_string(&id_file) {
        let id = id.trim().to_string();
        if !id.is_empty() {
            return id;
        }
    }
    format!("slaver_{}", std::process::id())
}

fn find_project_root() -> Option<PathBuf> {
    let mut dir = std::env::current_dir().ok()?;
    loop {
        if dir.join("jira/tickets").exists() || dir.join(".eket").exists() {
            return Some(dir);
        }
        if !dir.pop() {
            return None;
        }
    }
}
