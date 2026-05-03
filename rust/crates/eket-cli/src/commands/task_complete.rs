/// task:complete — Saga-based ticket completion with rollback + Master notification
///
/// Flow:
///   1. ValidateTicket   — ticket exists + in_progress
///   2. CommitWork       — git add -A && git commit (skip if nothing to commit)
///   3. UpdateTicketStatus — ticket status → done (compensate: → in_progress)
///   4. NotifyMaster     — send TaskResult via ProtocolSender (compensate: send failure)
///   5. RecordCompletion — db.update_ticket_status + update_ticket_assignee
///
/// --rollback mode: bypass saga, set status → todo, notify master failed
use std::path::{Path, PathBuf};
use std::sync::Arc;

use anyhow::Result;
use async_trait::async_trait;
use eket_core::{
    config::EketConfig,
    db::{create_pool, SqliteClient},
    saga::{SagaExecutor, SagaStep},
    ticket::find_ticket,
    types::TicketStatus,
};
use eket_engine::{
    mailbox::AgentMailbox,
    protocol::{ProtocolSender, TaskResultPayload},
};
use serde_json::json;

// ─── CompleteState ────────────────────────────────────────────────────────────

#[derive(Clone, Debug)]
pub struct CompleteState {
    pub ticket_id: String,
    pub slaver_id: String,
    pub project_root: PathBuf,
    pub pr_url: Option<String>,
    pub mailbox_dir: PathBuf,
    pub db_path: String,
    pub ticket_updated: bool,
    pub master_notified: bool,
}

// ─── Step 1: ValidateTicket ───────────────────────────────────────────────────

struct ValidateTicket;

#[async_trait]
impl SagaStep<CompleteState> for ValidateTicket {
    fn name(&self) -> &str { "ValidateTicket" }

    async fn forward(
        &self,
        state: CompleteState,
    ) -> Result<CompleteState, Box<dyn std::error::Error + Send + Sync>> {
        let tickets_dir = state.project_root.join("jira/tickets");
        let ticket = find_ticket(&tickets_dir, &state.ticket_id)
            .map_err(|e| format!("Ticket not found: {e}"))?;

        if ticket.status != TicketStatus::InProgress {
            return Err(format!(
                "Expected in_progress, got: {}",
                format_status(&ticket.status)
            )
            .into());
        }
        Ok(state)
    }

    async fn compensate(
        &self,
        _state: &CompleteState,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        Ok(())
    }
}

// ─── Step 2: CommitWork ───────────────────────────────────────────────────────

struct CommitWork;

#[async_trait]
impl SagaStep<CompleteState> for CommitWork {
    fn name(&self) -> &str { "CommitWork" }

    async fn forward(
        &self,
        state: CompleteState,
    ) -> Result<CompleteState, Box<dyn std::error::Error + Send + Sync>> {
        // git add -A
        let add = std::process::Command::new("git")
            .args(["add", "-A"])
            .current_dir(&state.project_root)
            .output();

        if let Ok(add_out) = add {
            if !add_out.status.success() {
                // non-fatal: continue
            }
        }

        // git commit
        let msg = format!("feat({}): complete", state.ticket_id);
        let commit = std::process::Command::new("git")
            .args(["commit", "-m", &msg])
            .current_dir(&state.project_root)
            .output();

        match commit {
            Ok(out) => {
                let stdout = String::from_utf8_lossy(&out.stdout);
                let stderr = String::from_utf8_lossy(&out.stderr);
                let combined = format!("{stdout}{stderr}");
                if out.status.success() || combined.contains("nothing to commit") {
                    Ok(state)
                } else {
                    // git not available or other non-fatal errors — skip
                    Ok(state)
                }
            }
            Err(_) => Ok(state), // git not available — skip
        }
    }

    async fn compensate(
        &self,
        _state: &CompleteState,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        // Too dangerous to revert git commits
        Ok(())
    }
}

// ─── Step 3: UpdateTicketStatus ───────────────────────────────────────────────

struct UpdateTicketStatus;

#[async_trait]
impl SagaStep<CompleteState> for UpdateTicketStatus {
    fn name(&self) -> &str { "UpdateTicketStatus" }

    async fn forward(
        &self,
        mut state: CompleteState,
    ) -> Result<CompleteState, Box<dyn std::error::Error + Send + Sync>> {
        let tickets_dir = state.project_root.join("jira/tickets");
        let mut ticket = find_ticket(&tickets_dir, &state.ticket_id)
            .map_err(|e| format!("Ticket not found for update: {e}"))?;

        ticket
            .set_status(TicketStatus::Done, Some(&state.slaver_id))
            .map_err(|e| format!("Failed to set status done: {e}"))?;

        state.ticket_updated = true;
        Ok(state)
    }

    async fn compensate(
        &self,
        state: &CompleteState,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        if !state.ticket_updated {
            return Ok(());
        }
        let tickets_dir = state.project_root.join("jira/tickets");
        if let Ok(mut ticket) = find_ticket(&tickets_dir, &state.ticket_id) {
            let _ = ticket.set_status(TicketStatus::InProgress, None);
        }
        Ok(())
    }
}

// ─── Step 4: NotifyMaster ─────────────────────────────────────────────────────

struct NotifyMaster;

#[async_trait]
impl SagaStep<CompleteState> for NotifyMaster {
    fn name(&self) -> &str { "NotifyMaster" }

    async fn forward(
        &self,
        mut state: CompleteState,
    ) -> Result<CompleteState, Box<dyn std::error::Error + Send + Sync>> {
        if !state.mailbox_dir.exists() {
            // Non-fatal: silently skip
            state.master_notified = false;
            return Ok(state);
        }

        let mailbox = Arc::new(AgentMailbox::new(&state.mailbox_dir));
        let sender = ProtocolSender::new(mailbox);

        let payload = TaskResultPayload {
            ticket_id: state.ticket_id.clone(),
            success: true,
            output: Some("Ticket completed via saga".into()),
            pr_url: state.pr_url.clone(),
            error: None,
        };

        let _ = sender
            .send_task_result(&state.slaver_id, "master", payload)
            .await;

        state.master_notified = true;
        Ok(state)
    }

    async fn compensate(
        &self,
        state: &CompleteState,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        if !state.mailbox_dir.exists() {
            return Ok(());
        }

        let mailbox = Arc::new(AgentMailbox::new(&state.mailbox_dir));
        let sender = ProtocolSender::new(mailbox);

        let payload = TaskResultPayload {
            ticket_id: state.ticket_id.clone(),
            success: false,
            output: None,
            pr_url: None,
            error: Some("Saga rolled back".into()),
        };

        let _ = sender
            .send_task_result(&state.slaver_id, "master", payload)
            .await;

        Ok(())
    }
}

// ─── Step 5: RecordCompletion ─────────────────────────────────────────────────

struct RecordCompletion;

#[async_trait]
impl SagaStep<CompleteState> for RecordCompletion {
    fn name(&self) -> &str { "RecordCompletion" }

    async fn forward(
        &self,
        state: CompleteState,
    ) -> Result<CompleteState, Box<dyn std::error::Error + Send + Sync>> {
        if let Ok(pool) = create_pool(&state.db_path) {
            let client = SqliteClient::new(pool);
            let _ = client.update_ticket_status_str(&state.ticket_id, "done");
            let _ = client.update_ticket_assignee(&state.ticket_id, &state.slaver_id);
        }
        Ok(state)
    }

    async fn compensate(
        &self,
        state: &CompleteState,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        if let Ok(pool) = create_pool(&state.db_path) {
            let client = SqliteClient::new(pool);
            let _ = client.update_ticket_status_str(&state.ticket_id, "in_progress");
        }
        Ok(())
    }
}

// ─── Public API ───────────────────────────────────────────────────────────────

pub struct CompleteArgs {
    pub ticket_id: String,
    pub slaver_id: Option<String>,
    pub pr_url: Option<String>,
    pub rollback: bool,
    pub mailbox_dir: Option<PathBuf>,
    pub db_path: Option<String>,
    /// Override project root (used in tests)
    pub project_root: Option<PathBuf>,
}

pub async fn run_complete(args: CompleteArgs) -> Result<()> {
    let config = EketConfig::load().unwrap_or_default();
    let project_root = args
        .project_root
        .or_else(find_project_root)
        .unwrap_or_else(|| std::env::current_dir().unwrap());

    let slaver_id = args
        .slaver_id
        .unwrap_or_else(|| get_slaver_id(&project_root));

    let mailbox_dir = args.mailbox_dir.unwrap_or_else(|| {
        dirs::home_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join(".eket/mailbox")
    });

    let db_path = args.db_path.unwrap_or(config.sqlite.path.clone());

    // ── --rollback mode ──────────────────────────────────────────────────────
    if args.rollback {
        let tickets_dir = project_root.join("jira/tickets");
        if let Ok(mut ticket) = find_ticket(&tickets_dir, &args.ticket_id) {
            let _ = ticket.set_status(TicketStatus::Todo, None);
        }
        if let Ok(pool) = create_pool(&db_path) {
            let client = SqliteClient::new(pool);
            let _ = client.update_ticket_status_str(&args.ticket_id, "todo");
        }
        // Notify master of rollback
        if mailbox_dir.exists() {
            let mailbox = Arc::new(AgentMailbox::new(&mailbox_dir));
            let sender = ProtocolSender::new(mailbox);
            let payload = TaskResultPayload {
                ticket_id: args.ticket_id.clone(),
                success: false,
                output: None,
                pr_url: None,
                error: Some("Manual rollback".into()),
            };
            let _ = sender.send_task_result(&slaver_id, "master", payload).await;
        }

        let report = json!({
            "status": "rolled_back",
            "ticket_id": args.ticket_id,
            "slaver_id": slaver_id,
        });
        println!("{}", serde_json::to_string_pretty(&report)?);
        return Ok(());
    }

    // ── Pre-saga: doc warn ────────────────────────────────────────────────────
    {
        let tickets_dir = project_root.join("jira/tickets");
        let ticket_path_glob = tickets_dir.join(format!("{}.md", args.ticket_id));
        let ticket_content = std::fs::read_to_string(&ticket_path_glob).unwrap_or_default();
        if !ticket_content.contains("<!-- eket:section:分析记录 -->") {
            eprintln!(
                "[WARN] ticket {} 缺少分析记录，建议先 task:claim 后记录分析思路",
                args.ticket_id
            );
        }
    }

    // ── Saga mode ────────────────────────────────────────────────────────────
    let initial_state = CompleteState {
        ticket_id: args.ticket_id.clone(),
        slaver_id: slaver_id.clone(),
        project_root,
        pr_url: args.pr_url,
        mailbox_dir,
        db_path,
        ticket_updated: false,
        master_notified: false,
    };

    let result = SagaExecutor::new()
        .add_step(ValidateTicket)
        .add_step(CommitWork)
        .add_step(UpdateTicketStatus)
        .add_step(NotifyMaster)
        .add_step(RecordCompletion)
        .execute(initial_state)
        .await;

    let compensation_errors: Vec<serde_json::Value> = result
        .compensation_errors
        .iter()
        .map(|e| json!({"step": e.step, "error": e.error}))
        .collect();

    if result.success {
        // Doc lifecycle: write retrospective
        {
            use eket_core::doc_lifecycle::{DocEvent, TemplateRenderer, handle_event};
            let tickets_dir = result.state.project_root.join("jira/tickets");
            let title = eket_core::ticket::find_ticket(&tickets_dir, &args.ticket_id)
                .map(|t| t.title)
                .unwrap_or_else(|_| args.ticket_id.clone());
            let event = DocEvent::TaskCompleted {
                ticket_id: args.ticket_id.clone(),
                title,
                slaver_id: slaver_id.clone(),
                project_root: result.state.project_root.clone(),
            };
            if let Err(e) = handle_event(event, &TemplateRenderer::new()).await {
                eprintln!("[WARN] doc_lifecycle complete: {e}");
            }
        }

        // Step 6: Generate ticket summary (rule-based, no LLM, idempotent)
        generate_ticket_summary(&result.state.project_root, &args.ticket_id);

        let report = json!({
            "status": "completed",
            "ticket_id": args.ticket_id,
            "slaver_id": slaver_id,
            "pr_url": result.state.pr_url,
            "saga_steps": result.completed_steps,
            "compensation_errors": compensation_errors,
        });
        println!("{}", serde_json::to_string_pretty(&report)?);
    } else {
        let report = json!({
            "status": "failed",
            "ticket_id": args.ticket_id,
            "failed_step": result.failed_step,
            "error": result.error,
            "compensation_errors": compensation_errors,
        });
        println!("{}", serde_json::to_string_pretty(&report)?);
    }

    Ok(())
}

/// Legacy entry point for backward compat (called from main.rs)
pub async fn run(ticket_id: String, skip_trailer: bool) -> Result<()> {
    let _ = skip_trailer;
    run_complete(CompleteArgs {
        ticket_id,
        slaver_id: None,
        pr_url: None,
        rollback: false,
        mailbox_dir: None,
        db_path: None,
        project_root: None,
    })
    .await
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

fn format_status(s: &TicketStatus) -> &'static str {
    match s {
        TicketStatus::Todo => "todo",
        TicketStatus::InProgress => "in_progress",
        TicketStatus::Review => "review",
        TicketStatus::Done => "done",
        TicketStatus::Blocked => "blocked",
        TicketStatus::Cancelled => "cancelled",
    }
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

// ─── Step 6: Ticket Summary (rule-based, no LLM) ─────────────────────────────

/// Extract a concise summary from ticket sections and append as `## Summary`.
/// Idempotent: skips if `## Summary` already exists.
/// Failures are silent (only warn), never block task:complete.
fn generate_ticket_summary(project_root: &Path, ticket_id: &str) {
    let ticket_path = project_root
        .join("jira/tickets")
        .join(format!("{ticket_id}.md"));

    let content = match std::fs::read_to_string(&ticket_path) {
        Ok(c) => c,
        Err(e) => {
            eprintln!("[WARN] summary: read ticket failed: {e}");
            return;
        }
    };

    // Idempotent guard
    if content.contains("## Summary") {
        return;
    }

    let title = extract_section(&content, "title_line")
        .unwrap_or_else(|| ticket_id.to_string());
    let test_result = extract_section(&content, "## 测试结果")
        .or_else(|| extract_section(&content, "## 测试"))
        .unwrap_or_else(|| "—".to_string());
    let knowledge = extract_section(&content, "## 知识沉淀")
        .or_else(|| extract_section(&content, "## 经验总结"))
        .unwrap_or_else(|| "—".to_string());
    let pr = extract_pr_link(&content).unwrap_or_else(|| "—".to_string());

    let summary = format!(
        "\n## Summary\n\n> 自动生成摘要（rule-based）\n\n| 项 | 内容 |\n|---|---|\n| Ticket | {title} |\n| 测试结果 | {test_result} |\n| PR | {pr} |\n| 知识沉淀 | {knowledge} |\n"
    );

    let new_content = format!("{content}{summary}");
    if let Err(e) = std::fs::write(&ticket_path, new_content) {
        eprintln!("[WARN] summary: write failed: {e}");
    }
}

/// Extract the first line of a section (## heading), trimmed to 80 chars.
fn extract_section(content: &str, heading: &str) -> Option<String> {
    if heading == "title_line" {
        // First non-empty, non-frontmatter line starting with #
        return content
            .lines()
            .find(|l| l.starts_with("# "))
            .map(|l| l.trim_start_matches("# ").trim().to_string())
            .map(|s| truncate(&s, 80));
    }

    let mut in_section = false;
    let mut lines: Vec<&str> = Vec::new();
    for line in content.lines() {
        if line.trim_start_matches('#').trim() == heading.trim_start_matches('#').trim()
            || line == heading
        {
            in_section = true;
            continue;
        }
        if in_section {
            if line.starts_with("## ") {
                break;
            }
            let trimmed = line.trim();
            if !trimmed.is_empty() {
                lines.push(trimmed);
                if lines.len() >= 2 {
                    break;
                }
            }
        }
    }

    if lines.is_empty() {
        None
    } else {
        Some(truncate(&lines.join(" / "), 80))
    }
}

fn extract_pr_link(content: &str) -> Option<String> {
    for line in content.lines() {
        let lower = line.to_lowercase();
        if (lower.contains("pr") || lower.contains("pull")) && lower.contains("http") {
            if let Some(url) = line.split_whitespace().find(|w| w.starts_with("http")) {
                return Some(truncate(url, 80));
            }
        }
    }
    None
}

fn truncate(s: &str, max: usize) -> String {
    if s.chars().count() <= max {
        s.to_string()
    } else {
        let t: String = s.chars().take(max - 1).collect();
        format!("{t}…")
    }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    /// Create a minimal project structure with a ticket file
    fn setup_project(dir: &TempDir, ticket_id: &str, status: &str) -> PathBuf {
        let root = dir.path().to_path_buf();
        let tickets_dir = root.join("jira/tickets");
        std::fs::create_dir_all(&tickets_dir).unwrap();

        let ticket_content = format!(
            "# {ticket_id}: Test ticket\n\n## 元数据\n- **状态**: {status}\n- **优先级**: P1\n- **负责人**: 待领取\n"
        );
        std::fs::write(tickets_dir.join(format!("{ticket_id}.md")), &ticket_content).unwrap();
        root
    }

    fn read_ticket_status(root: &Path, ticket_id: &str) -> String {
        let path = root.join("jira/tickets").join(format!("{ticket_id}.md"));
        let content = std::fs::read_to_string(&path).unwrap();
        for line in content.lines() {
            if line.contains("**状态**:") {
                return line.split(':').nth(1).unwrap_or("").trim().to_string();
            }
        }
        String::new()
    }

    fn args(dir: &TempDir, ticket_id: &str, root: &Path) -> CompleteArgs {
        CompleteArgs {
            ticket_id: ticket_id.into(),
            slaver_id: Some("slaver_test".into()),
            pr_url: None,
            rollback: false,
            mailbox_dir: Some(dir.path().join("mailbox")),
            db_path: Some(":memory:".into()),
            project_root: Some(root.to_path_buf()),
        }
    }

    #[tokio::test]
    async fn complete_success_updates_ticket_status() {
        let dir = TempDir::new().unwrap();
        let root = setup_project(&dir, "TASK-001", "in_progress");

        let result = run_complete(args(&dir, "TASK-001", &root)).await;

        assert!(result.is_ok(), "run_complete failed: {result:?}");
        let status = read_ticket_status(&root, "TASK-001");
        assert_eq!(status, "done", "ticket status should be done, got: {status}");
    }

    #[tokio::test]
    async fn complete_rollback_flag() {
        let dir = TempDir::new().unwrap();
        let root = setup_project(&dir, "TASK-002", "in_progress");

        let result = run_complete(CompleteArgs {
            rollback: true,
            ..args(&dir, "TASK-002", &root)
        })
        .await;

        assert!(result.is_ok());
        let status = read_ticket_status(&root, "TASK-002");
        assert_eq!(status, "todo", "rollback should set status to todo, got: {status}");
    }

    #[tokio::test]
    async fn complete_missing_ticket_fails() {
        let dir = TempDir::new().unwrap();
        let root = dir.path().to_path_buf();
        let tickets_dir = root.join("jira/tickets");
        std::fs::create_dir_all(&tickets_dir).unwrap();

        let result = run_complete(CompleteArgs {
            ticket_id: "TASK-999".into(),
            slaver_id: Some("slaver_test".into()),
            pr_url: None,
            rollback: false,
            mailbox_dir: Some(dir.path().join("mailbox")),
            db_path: Some(":memory:".into()),
            project_root: Some(root),
        })
        .await;

        // Should not panic; outputs failed JSON, returns Ok
        assert!(result.is_ok(), "should not return Err, got: {result:?}");
    }

    #[tokio::test]
    async fn saga_step_failure_compensates() {
        // ticket status = "todo" → ValidateTicket fails (expects in_progress)
        // Step3 (UpdateTicketStatus) never ran → nothing to compensate
        // ticket stays "todo"
        let dir = TempDir::new().unwrap();
        let root = setup_project(&dir, "TASK-003", "todo");

        let result = run_complete(args(&dir, "TASK-003", &root)).await;

        assert!(result.is_ok());
        let status = read_ticket_status(&root, "TASK-003");
        assert_eq!(status, "todo", "ticket should remain todo after saga failure");
    }

    #[tokio::test]
    async fn complete_no_git_ok() {
        // git commit "nothing to commit" must NOT fail the saga
        let dir = TempDir::new().unwrap();
        let root = setup_project(&dir, "TASK-004", "in_progress");

        // Init git repo + initial commit so subsequent commit = "nothing to commit"
        let _ = std::process::Command::new("git").args(["init"]).current_dir(&root).output();
        let _ = std::process::Command::new("git")
            .args(["config", "user.email", "test@test.com"])
            .current_dir(&root).output();
        let _ = std::process::Command::new("git")
            .args(["config", "user.name", "Test"])
            .current_dir(&root).output();
        let _ = std::process::Command::new("git").args(["add", "-A"]).current_dir(&root).output();
        let _ = std::process::Command::new("git")
            .args(["commit", "-m", "initial"])
            .current_dir(&root).output();

        let result = run_complete(args(&dir, "TASK-004", &root)).await;

        assert!(result.is_ok());
        let status = read_ticket_status(&root, "TASK-004");
        assert_eq!(status, "done");
    }

    #[tokio::test]
    async fn complete_with_pr_url() {
        let dir = TempDir::new().unwrap();
        let root = setup_project(&dir, "TASK-005", "in_progress");

        let result = run_complete(CompleteArgs {
            pr_url: Some("https://github.com/org/repo/pull/42".into()),
            ..args(&dir, "TASK-005", &root)
        })
        .await;

        assert!(result.is_ok());
        let status = read_ticket_status(&root, "TASK-005");
        assert_eq!(status, "done");
    }

    // ─── Summary tests ────────────────────────────────────────────────────────

    #[test]
    fn summary_appended_after_complete() {
        let dir = TempDir::new().unwrap();
        let root = dir.path().to_path_buf();
        let tickets_dir = root.join("jira/tickets");
        std::fs::create_dir_all(&tickets_dir).unwrap();

        let content = "# TASK-S01: 测试摘要功能\n\n## 测试结果\n全部通过\n\n## 知识沉淀\n- 关键经验\n";
        std::fs::write(tickets_dir.join("TASK-S01.md"), content).unwrap();

        generate_ticket_summary(&root, "TASK-S01");

        let updated = std::fs::read_to_string(tickets_dir.join("TASK-S01.md")).unwrap();
        assert!(updated.contains("## Summary"), "Summary section should be added");
        assert!(updated.contains("全部通过"), "Test result should appear in summary");
    }

    #[test]
    fn summary_idempotent() {
        let dir = TempDir::new().unwrap();
        let root = dir.path().to_path_buf();
        let tickets_dir = root.join("jira/tickets");
        std::fs::create_dir_all(&tickets_dir).unwrap();

        let content = "# TASK-S02: 幂等测试\n\n## Summary\n已有摘要\n";
        std::fs::write(tickets_dir.join("TASK-S02.md"), content).unwrap();

        generate_ticket_summary(&root, "TASK-S02");

        let updated = std::fs::read_to_string(tickets_dir.join("TASK-S02.md")).unwrap();
        // Should not duplicate
        assert_eq!(updated.matches("## Summary").count(), 1, "Summary should not be duplicated");
    }

    #[test]
    fn summary_missing_sections_uses_dash() {
        let dir = TempDir::new().unwrap();
        let root = dir.path().to_path_buf();
        let tickets_dir = root.join("jira/tickets");
        std::fs::create_dir_all(&tickets_dir).unwrap();

        let content = "# TASK-S03: 最小 ticket\n\n## 元数据\n- **状态**: done\n";
        std::fs::write(tickets_dir.join("TASK-S03.md"), content).unwrap();

        generate_ticket_summary(&root, "TASK-S03");

        let updated = std::fs::read_to_string(tickets_dir.join("TASK-S03.md")).unwrap();
        assert!(updated.contains("## Summary"));
        assert!(updated.contains("—"), "Missing sections should show dash");
    }
}
