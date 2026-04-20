/// task:claim — 对应 TS: commands/claim.ts
///
/// 核心流程：
/// 1. 读取 jira/tickets/ 找 todo ticket（按优先级排序）
/// 2. 原子 claim：SQLite BEGIN IMMEDIATE + ticket file update（防双领）
/// 3. 写 .eket/ACTIVE_CONTEXT.md
/// 4. 输出 JSON 结果（兼容 TS 版本格式）

use anyhow::Result;
use eket_core::{
    config::EketConfig,
    db::{create_pool, SqliteClient},
    ticket::{find_ticket, scan_todo_tickets, TicketFile},
    types::{ExecutionCheckpoint, TicketStatus},
};
use serde_json::json;
use std::path::{Path, PathBuf};

// ─── Slaver ID ────────────────────────────────────────────────────────────────

fn get_or_create_slaver_id(project_root: &Path) -> String {
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
    let id = format!(
        "slaver_{}_{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis(),
        &uuid::Uuid::new_v4().to_string()[..8]
    );
    if let Some(parent) = id_file.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let _ = std::fs::write(&id_file, &id);
    id
}

// ─── Active Context ───────────────────────────────────────────────────────────

fn write_active_context(
    project_root: &Path,
    ticket: &TicketFile,
    slaver_id: &str,
) -> Result<()> {
    let dir = project_root.join(".eket");
    std::fs::create_dir_all(&dir)?;
    let now = chrono::Utc::now().to_rfc3339();
    let content = format!(
        r#"# EKET Active Context

> 此文件由 task:claim 自动生成，ticket 完成后删除。
> 生成时间: {now}

## Active Ticket

- **ID**: {id}
- **Title**: {title}

## Identity

- **Slaver ID**: {slaver_id}
- **Started At**: {now}

## Commands

- `eket task:complete {id}` — 完成任务
- `eket system:doctor` — 系统诊断
"#,
        id = ticket.id,
        title = ticket.title,
    );
    std::fs::write(dir.join("ACTIVE_CONTEXT.md"), content)?;
    Ok(())
}

// ─── Atomic claim via SQLite ──────────────────────────────────────────────────

/// Try to atomically claim a ticket using SQLite as coordination lock.
/// Returns true if this slaver won the claim; false if already claimed by another.
/// Uses BEGIN IMMEDIATE to serialize concurrent claims.
fn try_atomic_claim(client: &SqliteClient, ticket_id: &str, slaver_id: &str) -> bool {
    use eket_core::types::TicketStatus;
    // Use SQLite transaction to atomically check+update status
    match client.claim_ticket_atomic(ticket_id, slaver_id) {
        Ok(claimed) => claimed,
        Err(_) => {
            // SQLite unavailable → fall through (best-effort, ticket file is still updated)
            true
        }
    }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

pub async fn run(ticket_id: Option<String>) -> Result<()> {
    let config = EketConfig::load().unwrap_or_default();

    // Locate project root: must have BOTH jira/tickets/ AND .eket/
    let project_root = find_project_root().unwrap_or_else(|| std::env::current_dir().unwrap());
    let tickets_dir = project_root.join("jira/tickets");
    let slaver_id = get_or_create_slaver_id(&project_root);

    // Open SQLite early (needed for atomic claim)
    let pool = create_pool(&config.sqlite.path).ok();
    let client = pool.as_ref().map(|p| SqliteClient::new(p.clone()));

    // Select ticket
    let mut ticket = match ticket_id {
        Some(ref id) => find_ticket(&tickets_dir, id)
            .map_err(|e| anyhow::anyhow!("{e}"))?,
        None => {
            let todos = scan_todo_tickets(&tickets_dir)
                .map_err(|e| anyhow::anyhow!("{e}"))?;
            if todos.is_empty() {
                println!("{}", serde_json::to_string_pretty(&json!({
                    "status": "no_tickets",
                    "message": "No todo tickets available",
                }))?);
                return Ok(());
            }
            todos.into_iter().next().unwrap()
        }
    };

    // Validate status
    if ticket.status != TicketStatus::Todo {
        let report = json!({
            "status": "error",
            "message": format!("Ticket {} is already {}", ticket.id, ticket.status),
            "ticket_id": ticket.id,
        });
        println!("{}", serde_json::to_string_pretty(&report)?);
        return Ok(());
    }

    // Atomic claim: SQLite lock prevents two slavers from claiming the same ticket
    if let Some(ref c) = client {
        if !try_atomic_claim(c, &ticket.id, &slaver_id) {
            let report = json!({
                "status": "error",
                "message": format!("Ticket {} was just claimed by another slaver", ticket.id),
                "ticket_id": ticket.id,
            });
            println!("{}", serde_json::to_string_pretty(&report)?);
            return Ok(());
        }
    }

    // Update ticket file: todo → in_progress
    ticket.set_status(TicketStatus::InProgress, Some(&slaver_id))
        .map_err(|e| anyhow::anyhow!("Failed to update ticket: {e}"))?;

    // Save checkpoint to SQLite
    if let Some(c) = client {
        let cp = ExecutionCheckpoint {
            ticket_id: ticket.id.clone(),
            slaver_id: slaver_id.clone(),
            phase: "claimed".to_string(),
            session_id: None,
            metadata: Some(json!({ "claimed_at": chrono::Utc::now().to_rfc3339() })),
            created_at: chrono::Utc::now(),
            updated_at: chrono::Utc::now(),
        };
        let _ = c.save_checkpoint(&cp);
    }

    // Write ACTIVE_CONTEXT.md
    let _ = write_active_context(&project_root, &ticket, &slaver_id);

    // Determine rules path (SLAVER-RULES.md)
    let rules_path = find_rules_path(&project_root);

    // Output JSON (compatible with TS version — includes type, assignee, worktree_path, rules_path)
    let report = json!({
        "status": "claimed",
        "ticket_id": ticket.id,
        "title": ticket.title,
        "type": ticket.ticket_type.as_deref().unwrap_or("feature"),
        "priority": ticket.priority,
        "assignee": slaver_id,
        "slaver_id": slaver_id,
        "worktree_path": "",   // populated in Phase 4 when worktree support added
        "rules_path": rules_path,
        "project_root": project_root.display().to_string(),
        "instructions": format!(
            "Ticket {} claimed. Implement the requirements, then run: eket task:complete {}",
            ticket.id, ticket.id
        ),
    });

    println!("{}", serde_json::to_string_pretty(&report)?);
    Ok(())
}

fn find_rules_path(project_root: &Path) -> String {
    let candidates = [
        "template/docs/SLAVER-RULES.md",
        "docs/SLAVER-RULES.md",
        ".eket/SLAVER-RULES.md",
    ];
    for c in &candidates {
        let p = project_root.join(c);
        if p.exists() {
            return p.display().to_string();
        }
    }
    String::new()
}

fn find_project_root() -> Option<PathBuf> {
    let mut dir = std::env::current_dir().ok()?;
    loop {
        // Require BOTH markers for unambiguous project root
        if dir.join("jira/tickets").exists() && dir.join(".eket").exists() {
            return Some(dir);
        }
        // Fallback: either marker (compatibility)
        if dir.join("jira/tickets").exists() || dir.join(".eket").exists() {
            return Some(dir);
        }
        if !dir.pop() {
            return None;
        }
    }
}
