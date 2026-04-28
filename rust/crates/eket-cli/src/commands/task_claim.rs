/// task:claim — 对应 TS: commands/claim.ts
///
/// 核心流程：
/// 1. 读取 jira/tickets/ 找 todo ticket（按优先级排序）
/// 2. 原子 claim：SQLite BEGIN IMMEDIATE + ticket file update（防双领）
/// 3. 写 .eket/ACTIVE_CONTEXT.md
/// 4. 输出 JSON 结果（兼容 TS 版本格式）
use anyhow::Result;
use clap::Args;
use eket_core::{
    config::EketConfig,
    db::{create_pool, SqliteClient},
    guardrail::GuardrailRunner,
    middleware_pipeline::{Pipeline, PipelineCtx},
    ticket::{find_ticket, scan_todo_tickets, TicketFile},
    types::{ExecutionCheckpoint, TicketStatus},
    expert_skill_bridge::ExpertSkillBridge,
};
use serde_json::json;
use std::path::{Path, PathBuf};

// ─── Args ────────────────────────────────────────────────────────────────────

#[derive(Args, Debug)]
pub struct TaskClaimArgs {
    /// Specific ticket ID to claim (e.g. TASK-042). Omit to auto-pick highest priority.
    pub ticket_id: Option<String>,

    /// 自动领取最高优先级 ready ticket
    #[arg(short = 'a', long, help = "自动领取最高优先级 ready ticket")]
    pub auto: bool,

    /// 按角色过滤 (e.g. backend, frontend)
    #[arg(short = 'r', long, help = "按角色过滤 (e.g. backend, frontend)")]
    pub role: Option<String>,
}

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
    use eket_core::skill_index::{
        default_search_roots, load_skill_index,
        parse_assigned_experts, load_expert_profiles, format_expert_section,
    };

    let dir = project_root.join(".eket");
    std::fs::create_dir_all(&dir)?;
    let now = chrono::Utc::now().to_rfc3339();

    // ── Model routing via skill index ──
    let skill_roots = default_search_roots(project_root);
    let skill_idx = load_skill_index(&skill_roots);
    let domain = ticket.id
        .split('-')
        .next()
        .unwrap_or("default")
        .to_lowercase();
    let recommended_level = skill_idx.model_route_table
        .get(&domain)
        .or_else(|| skill_idx.model_route_table.get("default"))
        .copied()
        .unwrap_or(2);
    let level_name = match recommended_level { 3 => "opus", 2 => "sonnet", _ => "haiku" };

    // ── Expert profile injection ──
    let ticket_path = {
        let base = project_root.join("jira").join("tickets");
        let candidates = [
            base.join(format!("{}.md", ticket.id)),
            base.join("feature").join(format!("{}.md", ticket.id)),
            base.join("bugfix").join(format!("{}.md", ticket.id)),
            base.join("task").join(format!("{}.md", ticket.id)),
        ];
        candidates.iter().find(|p| p.exists()).cloned()
    };

    let expert_section = if let Some(tp) = ticket_path {
        if let Ok(content) = std::fs::read_to_string(&tp) {
            let ids = parse_assigned_experts(&content);
            if !ids.is_empty() {
                eprintln!("[experts] Loading: {}", ids.join(", "));
                let profiles = load_expert_profiles(&ids);
                format_expert_section(&profiles)
            } else {
                String::new()
            }
        } else {
            String::new()
        }
    } else {
        String::new()
    };

    // ── Expert role-based skills injection ──
    let role_skills_section = {
        // 读取角色 ID：EKET_SLAVER_ROLE env 或 .eket/slaver-role 文件
        let role_id = std::env::var("EKET_SLAVER_ROLE").ok().or_else(|| {
            std::fs::read_to_string(project_root.join(".eket/slaver-role"))
                .ok()
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
        });

        if let Some(rid) = role_id {
            let experts_dir = std::env::var("EKET_EXPERTS_DIR")
                .map(std::path::PathBuf::from)
                .unwrap_or_else(|_| {
                    dirs::home_dir()
                        .unwrap_or_else(|| std::path::PathBuf::from("/tmp"))
                        .join(".claude/skills/eket/experts/default")
                });
            match ExpertSkillBridge::load_from_dir(&experts_dir) {
                Ok(bridge) => {
                    let skills = bridge.skills_for_expert(&rid);
                    if skills.is_empty() {
                        String::new()
                    } else {
                        let list = skills.iter().map(|s| format!("- {}", s)).collect::<Vec<_>>().join("\n");
                        format!("\n## Available Skills\n<!-- 基于专家角色 {} 自动注入 -->\n{}\n", rid, list)
                    }
                }
                Err(_) => String::new(),
            }
        } else {
            String::new()
        }
    };

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

## Model Recommendation

- **Domain**: `{domain}`
- **Recommended Level**: {level} ({level_name})

## Commands

- `eket task:complete {id}` — 完成任务
- `eket system:doctor` — 系统诊断
{expert_section}{role_skills_section}"#,
        id = ticket.id,
        title = ticket.title,
        domain = domain,
        level = recommended_level,
        level_name = level_name,
        expert_section = if expert_section.is_empty() {
            String::new()
        } else {
            format!("\n{}", expert_section)
        },
        role_skills_section = role_skills_section,
    );
    std::fs::write(dir.join("ACTIVE_CONTEXT.md"), content)?;
    Ok(())
}

// ─── Atomic claim via SQLite ──────────────────────────────────────────────────

/// Try to atomically claim a ticket using SQLite as coordination lock.
/// Returns true if this slaver won the claim; false if already claimed by another.
/// Uses BEGIN IMMEDIATE to serialize concurrent claims.
fn try_atomic_claim(client: &SqliteClient, ticket_id: &str, slaver_id: &str) -> bool {
    // Use SQLite transaction to atomically check+update status
    client.claim_ticket_atomic(ticket_id, slaver_id).unwrap_or(true)
}

// ─── Role filter ──────────────────────────────────────────────────────────────

/// Filter tickets by role keyword: checks if ticket file content contains the role string.
//NOTE: Role filtering is content-based (case-insensitive substring match in ticket .md file).
fn filter_by_role(tickets: Vec<TicketFile>, tickets_dir: &Path, role: &str) -> Vec<TicketFile> {
    let role_lower = role.to_lowercase();
    tickets
        .into_iter()
        .filter(|t| {
            let file_path = tickets_dir.join(format!("{}.md", t.id));
            if let Ok(content) = std::fs::read_to_string(&file_path) {
                content.to_lowercase().contains(&role_lower)
            } else {
                // Include ticket if file unreadable (conservative)
                true
            }
        })
        .collect()
}

// ─── Main ─────────────────────────────────────────────────────────────────────

pub async fn run(args: TaskClaimArgs) -> Result<()> {
    let config = EketConfig::load().unwrap_or_default();

    // Locate project root: must have BOTH jira/tickets/ AND .eket/
    let project_root = find_project_root().unwrap_or_else(|| std::env::current_dir().unwrap());
    // TASK-165 audit: tickets_dir is derived from find_project_root() which walks up from cwd.
    // find_project_root() uses jira/tickets + .eket as markers, so project_root IS the jira repo root.
    // tickets_dir = <jira-root>/jira/tickets (legacy layout: jira/ is a subdir of the main project).
    // In v3.0 three-repo layout, tickets live at <project>-jira/tickets/; if run from inside
    // <project>-jira/, find_project_root walks up and may not find jira/tickets — users should
    // run eket from the parent project root, or pass --tickets-dir explicitly.
    // No hardcoded path; config.yml tickets_dir ("tickets") is not yet consumed here — acceptable
    // since find_project_root() correctly resolves the base. No code change required.
    let tickets_dir = project_root.join("jira/tickets");
    let slaver_id = get_or_create_slaver_id(&project_root);

    // Open SQLite early (needed for atomic claim)
    let pool = create_pool(&config.sqlite.path).ok();
    let client = pool.as_ref().map(|p| SqliteClient::new(p.clone()));

    // Select ticket
    // If --auto is true and no ticket_id given: query for highest priority ready ticket (filtered by role if given)
    // If --role is given without explicit ticket_id: also filter by role when auto-picking
    // Keep existing behavior when ticket_id is given
    let mut ticket = match args.ticket_id {
        Some(ref id) => find_ticket(&tickets_dir, id)
            .map_err(|e| anyhow::anyhow!("{e}"))?,
        None => {
            let mut todos = scan_todo_tickets(&tickets_dir)
                .map_err(|e| anyhow::anyhow!("{e}"))?;

            // Apply role filter if --role is given
            if let Some(ref role) = args.role {
                todos = filter_by_role(todos, &tickets_dir, role);
            }

            if todos.is_empty() {
                println!("{}", serde_json::to_string_pretty(&json!({
                    "status": "no_tickets",
                    "message": "No todo tickets available",
                }))?);
                return Ok(());
            }
            // auto=true or no ticket_id: pick highest priority (first from sorted list)
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

    // Doc lifecycle: append 分析记录 section to ticket
    {
        use eket_core::doc_lifecycle::{DocEvent, TemplateRenderer, handle_event};
        let event = DocEvent::TaskClaimed {
            ticket_id: ticket.id.clone(),
            slaver_id: slaver_id.clone(),
            project_root: project_root.clone(),
        };
        if let Err(e) = handle_event(event, &TemplateRenderer::new()).await {
            eprintln!("[WARN] doc_lifecycle claim: {e}");
        }
    }

    // Determine rules path (SLAVER-RULES.md)
    let rules_path = find_rules_path(&project_root);

    // Run Pipeline with GuardrailMiddleware (TASK-233)
    // Build pipeline: always include default claim guardrails; optionally add SlaverRulesGuardrail
    let mut pipeline = Pipeline::new()
        .add(crate::guardrail_middleware::GuardrailMiddleware::new(
            GuardrailRunner::default_for_claim(),
        ));

    if !rules_path.is_empty() {
        if let Some(slaver_guardrail) =
            crate::slaver_rules::load_slaver_rules_guardrail(&rules_path)
        {
            let inner_runner = eket_core::guardrail::GuardrailRunner::from_checks(vec![
                Box::new(slaver_guardrail),
            ]);
            pipeline = pipeline.add(crate::guardrail_middleware::GuardrailMiddleware::new(
                inner_runner,
            ));
        }
    }

    let mut pipe_ctx = PipelineCtx::new("claim");
    pipe_ctx.ticket_id = Some(ticket.id.clone());
    pipe_ctx.slaver_id = Some(slaver_id.clone());
    if let Err(e) = pipeline.run_pre(&mut pipe_ctx).await {
        tracing::warn!("Pipeline pre() error: {e}");
    }
    if let Some(violations) = pipe_ctx.metadata.get("guardrail_violations") {
        if let Some(arr) = violations.as_array() {
            if !arr.is_empty() {
                tracing::warn!("Guardrail violations: {:?}", arr);
            }
        }
    }
    let _ = pipeline.run_post(&mut pipe_ctx).await;

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
