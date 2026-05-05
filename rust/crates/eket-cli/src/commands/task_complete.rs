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

use anyhow::{bail, Result};
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


// ─── Step 6: RemoveWorktree ───────────────────────────────────────────────────

struct RemoveWorktree;

#[async_trait]
impl SagaStep<CompleteState> for RemoveWorktree {
    fn name(&self) -> &str { "RemoveWorktree" }

    async fn forward(
        &self,
        state: CompleteState,
    ) -> Result<CompleteState, Box<dyn std::error::Error + Send + Sync>> {
        let worktree_dir = state.project_root.join(".worktrees").join(&state.ticket_id);
        if !worktree_dir.exists() {
            return Ok(state); // nothing to remove
        }

        let status = std::process::Command::new("git")
            .args(["worktree", "remove", "--force", &worktree_dir.to_string_lossy()])
            .current_dir(&state.project_root)
            .status();

        match status {
            Ok(s) if s.success() => {}
            Ok(s) => eprintln!("[WARN] worktree remove exited {}: {:?}", s.code().unwrap_or(-1), worktree_dir),
            Err(e) => eprintln!("[WARN] worktree remove failed: {e}"),
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
        .add_step(RemoveWorktree)
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

        // Step 7: Memory quality gate — review 知识沉淀 entries via Knowledge Curator
        let memory_blocked = run_memory_quality_gate(
            &result.state.project_root,
            &args.ticket_id,
        );
        if memory_blocked {
            // 阻断：Curator 要求修改，退出码非零让调用方感知
            bail!("task:complete BLOCKED — memory:review 要求修改知识沉淀内容。\n\
                   修改后重提：eket memory:review --ticket {} \n\
                   通过后再次运行：eket task:complete {}",
                   args.ticket_id, args.ticket_id);
        }

        // Step 8: 累计 complete 计数，达到阈值触发 knowledge index 重建
        maybe_rebuild_knowledge_index(&result.state.project_root);

        // Step 10: fire task.completed webhooks (non-blocking, failures → warn only)
        {
            use eket_core::webhook::{WebhookEvent, dispatch_event};
            let db_path = result.state.db_path.clone();
            let ticket_id_clone = args.ticket_id.clone();
            let slaver_id_clone = slaver_id.clone();
            let pr_url_clone = result.state.pr_url.clone();
            tokio::spawn(async move {
                if let Ok(pool) = eket_core::db::create_pool(&db_path) {
                    let payload = serde_json::json!({
                        "ticket_id": ticket_id_clone,
                        "slaver_id": slaver_id_clone,
                        "pr_url": pr_url_clone,
                    });
                    dispatch_event(
                        pool,
                        WebhookEvent::TaskCompleted,
                        payload,
                    )
                    .await;
                }
            });
        }

        // Step 9: 扫描依赖已解除的 ticket，写入 unblocked-queue.json
        if let Err(e) = notify_unblocked_tickets(&result.state.project_root, &args.ticket_id) {
            eprintln!("[WARN] notify_unblocked_tickets: {e}");
        }

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

// ─── Memory quality gate ──────────────────────────────────────────────────────

/// 检查 ticket 的 ## 知识沉淀 section，若有 confluence/memory/ 文件引用则触发 Curator 评审。
/// 返回 true = 阻断（需要修改），false = 放行。
/// 静默失败：找不到文件、无知识沉淀 → 放行。
fn run_memory_quality_gate(project_root: &Path, ticket_id: &str) -> bool {
    let ticket_path = project_root.join("jira/tickets").join(format!("{ticket_id}.md"));
    let Ok(ticket_content) = std::fs::read_to_string(&ticket_path) else { return false };

    // 找 ## 知识沉淀 section
    let Some(section_start) = ticket_content.find("## 知识沉淀") else { return false };
    let section = &ticket_content[section_start..];

    // 提取 confluence/memory/ 文件路径
    let memory_files: Vec<std::path::PathBuf> = section.lines()
        .filter(|l| l.contains("confluence/memory/"))
        .filter_map(|l| {
            // 支持 markdown link `(path)` 和裸路径
            let raw = if l.contains('(') {
                l.split('(').nth(1)?.split(')').next()?
            } else {
                l.split_whitespace().find(|w| w.contains("confluence/memory/"))?
            };
            let p = project_root.join(raw.trim_matches('`'));
            if p.exists() { Some(p) } else { None }
        })
        .collect();

    if memory_files.is_empty() { return false; }

    let mut blocked = false;
    for file_path in &memory_files {
        let rel = file_path.strip_prefix(project_root)
            .map(|p| p.display().to_string())
            .unwrap_or_else(|_| file_path.display().to_string());

        // 跳过已通过评审的文件（frontmatter review_status: accepted）
        let content = std::fs::read_to_string(file_path).unwrap_or_default();
        if content.contains("review_status: accepted") {
            eprintln!("[memory:review] ✅ 已通过评审，跳过：{rel}");
            continue;
        }

        // 结构校验（快速，无需 LLM）
        let structure_ok = check_memory_structure(&content);
        if !structure_ok.is_empty() {
            eprintln!("[memory:review] ⚠️  结构不完整：{rel}");
            for issue in &structure_ok {
                eprintln!("    • {issue}");
            }
            eprintln!("  修复后重提：eket memory:review {rel} --ticket {ticket_id}");

            // 写 frontmatter 标记
            let stamped = inject_frontmatter_status(&content, "needs_revision", ticket_id);
            let _ = std::fs::write(file_path, stamped);
            blocked = true;
            continue;
        }

        // 内容质量：输出 Curator prompt，提示 Claude 在当前 session 评审
        eprintln!("[memory:review] 📋 内容质量评审：{rel}");
        let prompt = super::memory_review::build_curator_prompt(&rel, &content, Some(ticket_id));
        eprintln!("CURATOR_REVIEW_NEEDED");
        eprintln!("FILE: {rel}");
        eprintln!("TICKET: {ticket_id}");
        eprintln!("---PROMPT_START---");
        eprintln!("{prompt}");
        eprintln!("---PROMPT_END---");
        eprintln!("\n请按上述 prompt 评审后，将结论写入文件 frontmatter（review_status: accepted/needs_revision）");
        eprintln!("通过后重新运行：eket task:complete {ticket_id}");
        blocked = true;
    }

    blocked
}

fn check_memory_structure(content: &str) -> Vec<String> {
    let lower = content.to_lowercase();
    let mut issues = Vec::new();
    if !content.lines().any(|l| l.starts_with('#')) {
        issues.push("缺少标题".to_string());
    }
    if !lower.contains("场景") && !lower.contains("症状") && !lower.contains("问题") {
        issues.push("缺少场景/症状描述".to_string());
    }
    if !lower.contains("方案") && !lower.contains("解法") && !lower.contains("根因") {
        issues.push("缺少方案/解法/根因".to_string());
    }
    if !content.contains("TASK-") {
        issues.push("缺少来源 TASK-ID 引用".to_string());
    }
    if content.split_whitespace().count() < 30 {
        issues.push(format!("内容过短（{}词，建议≥30）", content.split_whitespace().count()));
    }
    issues
}

fn inject_frontmatter_status(content: &str, status: &str, ticket_id: &str) -> String {
    let timestamp = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string();
    let new_fields = format!("review_status: {status}\nreview_ticket: {ticket_id}\nreviewed_at: {timestamp}\n");
    if content.starts_with("---") {
        if let Some(end) = content[3..].find("---") {
            let insert_at = end + 3; // after opening ---
            return format!("{}{new_fields}{}", &content[..insert_at], &content[insert_at..]);
        }
    }
    format!("---\n{new_fields}---\n{content}")
}

// ─── Knowledge index rebuild ──────────────────────────────────────────────────

/// 每完成 N 次 task:complete，触发一次 `eket knowledge:index --dir confluence/memory/`。
/// 计数存于 .git/eket-complete-count（不影响 git 状态）。
/// N 可通过 .eket/config.yml knowledge_rebuild_threshold 覆盖，默认 5。
fn maybe_rebuild_knowledge_index(project_root: &Path) {
    let counter_file = project_root.join(".git/eket-complete-count");
    let threshold = read_rebuild_threshold(project_root);

    let count = std::fs::read_to_string(&counter_file)
        .ok()
        .and_then(|s| s.trim().parse::<u32>().ok())
        .unwrap_or(0) + 1;

    if count >= threshold {
        // 触发重建
        let memory_dir = project_root.join("confluence/memory");
        if memory_dir.exists() {
            eprintln!("[knowledge:index] 🔄 已完成 {count} 次 task:complete，触发 memory 知识库重建...");
            let db_path = project_root.join(".eket/eket.db");
            let status = std::process::Command::new("eket")
                .args(["knowledge:index", "--dir",
                       &memory_dir.display().to_string(),
                       "--db-path", &db_path.display().to_string()])
                .current_dir(project_root)
                .status();
            match status {
                Ok(s) if s.success() => {
                    eprintln!("[knowledge:index] ✅ 重建完成");
                    let _ = std::fs::write(&counter_file, "0");
                }
                Ok(_) | Err(_) => {
                    eprintln!("[knowledge:index] ⚠️  重建失败，跳过（不影响完成流程）");
                    let _ = std::fs::write(&counter_file, count.to_string());
                }
            }
        }
    } else {
        let _ = std::fs::write(&counter_file, count.to_string());
        let remaining = threshold - count;
        if remaining <= 2 {
            eprintln!("[knowledge:index] 再完成 {remaining} 次将触发知识库重建");
        }
    }
}

// ─── Step 9: Unblocked ticket notification ────────────────────────────────────

/// 扫描所有 ticket，找出 blocked_by 含 completed_id 且全部依赖已 done 的 ticket，
/// 写入 .eket/state/unblocked-queue.json，并打印 [UNBLOCKED] 通知。
fn notify_unblocked_tickets(project_root: &Path, completed_id: &str) -> Result<()> {
    let tickets_dir = project_root.join("jira/tickets");
    if !tickets_dir.exists() {
        return Ok(());
    }

    let mut newly_unblocked: Vec<String> = vec![];

    for entry in std::fs::read_dir(&tickets_dir)?.flatten() {
        let path = entry.path();
        if path.extension().and_then(|s| s.to_str()) != Some("md") {
            continue;
        }
        let content = std::fs::read_to_string(&path).unwrap_or_default();

        if let Some(deps) = parse_blocked_by_field(&content) {
            if deps.contains(&completed_id.to_string())
                && all_deps_done(project_root, &deps)
            {
                if let Some(tid) = extract_ticket_id_from_path(&path) {
                    newly_unblocked.push(tid);
                }
            }
        }
    }

    if !newly_unblocked.is_empty() {
        append_unblocked_queue(project_root, &newly_unblocked)?;
        for id in &newly_unblocked {
            eprintln!("[UNBLOCKED] {} 依赖已解除，可领取", id);
        }
    }
    Ok(())
}

/// 解析 ticket markdown 中的 blocked_by / 依赖 字段，返回 TASK-ID 列表。
/// 支持格式：
///   - **依赖**: TASK-98, TASK-99
///   - blocked_by: [TASK-98, TASK-99]
///   - blocked_by: TASK-98
fn parse_blocked_by_field(content: &str) -> Option<Vec<String>> {
    let re = regex::Regex::new(r"TASK-\d+").ok()?;
    for line in content.lines() {
        let lower = line.to_lowercase();
        if lower.contains("blocked_by") || lower.contains("**依赖**") {
            let ids: Vec<String> = re
                .find_iter(line)
                .map(|m| m.as_str().to_string())
                .collect();
            if !ids.is_empty() {
                return Some(ids);
            }
        }
    }
    None
}

/// 检查给定依赖列表是否全部处于 done 状态。
fn all_deps_done(project_root: &Path, deps: &[String]) -> bool {
    let tickets_dir = project_root.join("jira/tickets");
    for dep in deps {
        let path = tickets_dir.join(format!("{dep}.md"));
        let content = std::fs::read_to_string(&path).unwrap_or_default();
        let done = content.lines().any(|l| {
            let lower = l.to_lowercase();
            (lower.contains("**状态**") || lower.contains("status")) && lower.contains("done")
        });
        if !done {
            return false;
        }
    }
    true
}

/// 从文件路径提取 ticket ID（如 TASK-101）。
fn extract_ticket_id_from_path(path: &std::path::Path) -> Option<String> {
    let stem = path.file_stem()?.to_str()?;
    // 验证是合法 TASK-NNN 格式
    if regex::Regex::new(r"^TASK-\d+$").ok()?.is_match(stem) {
        Some(stem.to_string())
    } else {
        None
    }
}

/// 幂等地追加 ticket_id 到 .eket/state/unblocked-queue.json。
fn append_unblocked_queue(project_root: &Path, ids: &[String]) -> Result<()> {
    let state_dir = project_root.join(".eket/state");
    std::fs::create_dir_all(&state_dir)?;
    let queue_path = state_dir.join("unblocked-queue.json");

    // 读现有数据
    let mut entries: Vec<serde_json::Value> = if queue_path.exists() {
        let raw = std::fs::read_to_string(&queue_path).unwrap_or_default();
        serde_json::from_str(&raw).unwrap_or_default()
    } else {
        vec![]
    };

    // 收集已有 ticket_id（幂等去重）
    let existing_ids: std::collections::HashSet<String> = entries
        .iter()
        .filter_map(|v| v.get("ticket_id").and_then(|s| s.as_str()).map(|s| s.to_string()))
        .collect();

    let now = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string();
    for id in ids {
        if !existing_ids.contains(id) {
            entries.push(serde_json::json!({
                "ticket_id": id,
                "unblocked_at": now,
                "dispatched": false
            }));
        }
    }

    std::fs::write(&queue_path, serde_json::to_string_pretty(&entries)?)?;
    Ok(())
}

fn read_rebuild_threshold(project_root: &Path) -> u32 {
    let config_path = project_root.join(".eket/config.yml");
    let Ok(content) = std::fs::read_to_string(config_path) else { return 5 };
    // 简单解析：knowledge_rebuild_threshold: N
    content.lines()
        .find(|l| l.contains("knowledge_rebuild_threshold"))
        .and_then(|l| l.split(':').nth(1))
        .and_then(|v| v.trim().parse().ok())
        .unwrap_or(5)
}


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
