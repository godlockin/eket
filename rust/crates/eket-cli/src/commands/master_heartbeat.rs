/// master:heartbeat — 长驻进程，周期扫描 ready tickets 并分配给 idle slaver
use anyhow::Result;
use chrono::Utc;
use clap::Args;
use eket_core::{
    dag::{parse_tickets_dag, ready_tickets},
    db::{create_pool, InstanceRow, InstanceScoringStats, SqliteClient},
    expertise_embedding::{cosine_similarity, encode_tags},
    scoring::trust_engine::{compute_trust, factors_from_stats, load_weights, ScoreWeights},
};
use eket_engine::{
    mailbox::AgentMailbox,
    protocol::{ProtocolSender, TaskAssignPayload},
};
use serde_json::json;
use std::{
    collections::{HashMap, HashSet},
    path::{Path, PathBuf},
    sync::Arc,
};

#[derive(Args, Debug)]
pub struct MasterHeartbeatArgs {
    /// Poll interval in seconds
    #[arg(long, default_value_t = 10)]
    pub interval: u64,

    /// Directory containing TASK-NNN.md ticket files
    #[arg(long, default_value = "./jira/tickets")]
    pub tickets_dir: String,

    /// SQLite db path
    #[arg(long, default_value = "~/.eket/eket.db")]
    pub db_path: String,

    /// Directory for mailbox files
    #[arg(long, default_value = "~/.eket/mailbox")]
    pub mailbox_dir: String,
}

pub async fn run(args: MasterHeartbeatArgs) -> Result<()> {
    let db_path = expand_tilde(&args.db_path);
    let mailbox_dir = expand_tilde(&args.mailbox_dir);
    let tickets_dir = PathBuf::from(&args.tickets_dir);
    let interval = std::time::Duration::from_secs(args.interval);

    let pool = create_pool(&db_path)?;
    let client = Arc::new(SqliteClient::new(pool));
    let mailbox = Arc::new(AgentMailbox::new(&mailbox_dir));

    let poll = async {
        loop {
            check_once(&client, &mailbox, &tickets_dir).await;
            tokio::time::sleep(interval).await;
        }
    };

    tokio::select! {
        _ = tokio::signal::ctrl_c() => {
            println!("{}", json!({ "event": "stopped" }));
        }
        _ = poll => {}
    }

    Ok(())
}

/// Parse `required_expertise` from a ticket file.
/// Looks for a line like: `required_expertise: [rust, devops]`
/// Returns `vec!["any"]` if the field is absent or the file cannot be read.
pub fn parse_required_expertise(tickets_dir: &Path, ticket_id: &str) -> Vec<String> {
    let path = tickets_dir.join(format!("{ticket_id}.md"));
    let Ok(content) = std::fs::read_to_string(&path) else {
        return vec!["any".to_string()];
    };

    for line in content.lines() {
        let trimmed = line.trim();
        // Match patterns like:  required_expertise: [rust, devops]
        // or:                   - **required_expertise**: [rust]
        if let Some(rest) = trimmed.strip_prefix("required_expertise:").or_else(|| {
            trimmed
                .to_lowercase()
                .contains("required_expertise")
                .then(|| {
                    // find the colon after the keyword
                    trimmed.find(':').map(|i| &trimmed[i + 1..])
                })
                .flatten()
                .map(|_| {
                    // re-do without lowercase conversion to preserve casing
                    let lower = trimmed.to_lowercase();
                    let pos = lower.find("required_expertise").unwrap();
                    let after_key = &trimmed[pos + "required_expertise".len()..];
                    after_key.trim_start_matches(|c: char| c == '*' || c == ' ' || c == ':')
                })
        }) {
            let rest = rest.trim();
            // strip surrounding brackets
            let inner = rest.trim_start_matches('[').trim_end_matches(']').trim();
            if inner.is_empty() {
                return vec!["any".to_string()];
            }
            let skills: Vec<String> = inner
                .split(',')
                .map(|s| s.trim().to_lowercase())
                .filter(|s| !s.is_empty())
                .collect();
            if skills.is_empty() {
                return vec!["any".to_string()];
            }
            return skills;
        }
    }

    vec!["any".to_string()]
}

/// Select the best matching idle slaver for the given `required` expertise list.
///
/// 选择策略（三层）：
/// 1. "any" / 空 → 按 TrustScore 从所有 idle 中选最高分
/// 2. 向量语义匹配（cosine >= 0.5）→ 候选中 TrustScore 最高者
/// 3. Fallback 标签评分（role=2, skills=1）→ 候选中 TrustScore 最高者
pub fn best_matching_slaver<'a>(
    instances: &'a [InstanceRow],
    required: &[String],
    stats: &HashMap<String, InstanceScoringStats>,
    weights: &ScoreWeights,
) -> Option<&'a InstanceRow> {
    let idle: Vec<&InstanceRow> = instances.iter().filter(|i| i.status == "idle").collect();
    if idle.is_empty() {
        return None;
    }

    // Helper: get TrustScore for an instance
    let trust = |inst: &&InstanceRow| -> f32 {
        let s = stats.get(&inst.id).cloned().unwrap_or_default();
        compute_trust(
            &factors_from_stats(s.completed_count, s.failed_count, s.total_latency_ms),
            weights,
        )
    };

    // "any" / empty → all qualify, pick best TrustScore
    if required.is_empty() || required.iter().any(|r| r == "any") {
        return idle.into_iter().max_by(|a, b| {
            trust(a)
                .partial_cmp(&trust(b))
                .unwrap_or(std::cmp::Ordering::Equal)
        });
    }

    // ── Layer 1: Vector cosine similarity ────────────────────────────────────
    const VECTOR_THRESHOLD: f32 = 0.5;
    let query_emb = encode_tags(required);
    let mut vec_candidates: Vec<(&InstanceRow, f32)> = idle
        .iter()
        .filter_map(|inst| {
            let mut tags = inst.skills.clone();
            tags.push(inst.role.clone());
            let sim = cosine_similarity(&query_emb, &encode_tags(&tags));
            if sim >= VECTOR_THRESHOLD {
                Some((*inst, sim))
            } else {
                None
            }
        })
        .collect();

    if !vec_candidates.is_empty() {
        // Among vector matches, pick highest TrustScore
        vec_candidates.sort_by(|(a, _), (b, _)| {
            trust(b)
                .partial_cmp(&trust(a))
                .unwrap_or(std::cmp::Ordering::Equal)
        });
        return vec_candidates.into_iter().next().map(|(inst, _)| inst);
    }

    // ── Layer 2: Fallback tag scoring ─────────────────────────────────────────
    let required_set: HashSet<&str> = required.iter().map(|s| s.as_str()).collect();
    let mut tag_candidates: Vec<(&InstanceRow, u32)> = idle
        .iter()
        .filter_map(|inst| {
            let role_score: u32 = if required_set.contains(inst.role.to_lowercase().as_str()) {
                2
            } else {
                0
            };
            let skills_score: u32 = if inst
                .skills
                .iter()
                .any(|s| required_set.contains(s.to_lowercase().as_str()))
            {
                1
            } else {
                0
            };
            let score = role_score + skills_score;
            if score > 0 {
                Some((*inst, score))
            } else {
                None
            }
        })
        .collect();

    if !tag_candidates.is_empty() {
        // Among tag matches, pick highest TrustScore (break ties by tag score)
        tag_candidates.sort_by(|(a, sa), (b, sb)| {
            trust(b)
                .partial_cmp(&trust(a))
                .unwrap_or(std::cmp::Ordering::Equal)
                .then(sb.cmp(sa))
        });
        return tag_candidates.into_iter().next().map(|(inst, _)| inst);
    }

    None
}

// ─── Waiting-for-expert helpers ───────────────────────────────────────────────

/// Write/update `.eket/state/waiting-for-expert.json`.
/// - File absent → create with one entry (retries=1)
/// - Same ticket_id present → retries += 1
pub fn append_waiting_for_expert(project_root: &Path, ticket_id: &str, required: &[String]) {
    let dir = project_root.join(".eket/state");
    if let Err(e) = std::fs::create_dir_all(&dir) {
        tracing::warn!("[master:heartbeat] cannot create state dir: {e}");
        return;
    }
    let path = dir.join("waiting-for-expert.json");
    let mut entries: Vec<serde_json::Value> = if path.exists() {
        match std::fs::read_to_string(&path)
            .ok()
            .and_then(|raw| serde_json::from_str::<Vec<serde_json::Value>>(&raw).ok())
        {
            Some(v) => v,
            None => vec![],
        }
    } else {
        vec![]
    };

    let mut found = false;
    for entry in &mut entries {
        if entry.get("ticket_id").and_then(|v| v.as_str()) == Some(ticket_id) {
            let retries = entry.get("retries").and_then(|v| v.as_u64()).unwrap_or(0);
            entry["retries"] = json!(retries + 1);
            found = true;
            break;
        }
    }
    if !found {
        entries.push(json!({
            "ticket_id": ticket_id,
            "required": required,
            "since": Utc::now().to_rfc3339(),
            "retries": 1
        }));
    }

    match serde_json::to_string_pretty(&entries) {
        Ok(s) => {
            if let Err(e) = std::fs::write(&path, s) {
                tracing::warn!("[master:heartbeat] cannot write waiting-for-expert.json: {e}");
            }
        }
        Err(e) => tracing::warn!("[master:heartbeat] json serialize error: {e}"),
    }
}

/// Write `.eket/inbox/need-expert-{ticket_id}.md` (idempotent, overwrite).
pub fn write_inbox_need_expert(project_root: &Path, ticket_id: &str, required: &[String]) {
    let dir = project_root.join(".eket/inbox");
    if let Err(e) = std::fs::create_dir_all(&dir) {
        tracing::warn!("[master:heartbeat] cannot create inbox dir: {e}");
        return;
    }
    let first_role = required.first().map(|s| s.as_str()).unwrap_or("unknown");
    let required_str = required.join(", ");
    let content = format!(
        "⚠ {ticket_id} 需要 [{required_str}] 专家 Slaver，当前无匹配实例。\n\
         建议执行：eket slaver:register --role {first_role} --skills {first_role}\n\
         建议同时执行：eket expert:summon --role {first_role}\n"
    );
    let file = dir.join(format!("need-expert-{ticket_id}.md"));
    if let Err(e) = std::fs::write(&file, content) {
        tracing::warn!("[master:heartbeat] cannot write inbox file: {e}");
    }
}

/// Read `.eket/state/waiting-for-expert.json`, return ticket_ids sorted by retries DESC.
pub fn load_waiting_tickets(project_root: &Path) -> Vec<String> {
    let path = project_root.join(".eket/state/waiting-for-expert.json");
    if !path.exists() {
        return vec![];
    }
    let Ok(raw) = std::fs::read_to_string(&path) else {
        return vec![];
    };
    let Ok(mut entries) = serde_json::from_str::<Vec<serde_json::Value>>(&raw) else {
        return vec![];
    };

    entries.sort_by(|a, b| {
        let ra = a.get("retries").and_then(|v| v.as_u64()).unwrap_or(0);
        let rb = b.get("retries").and_then(|v| v.as_u64()).unwrap_or(0);
        rb.cmp(&ra)
    });

    entries
        .iter()
        .filter_map(|v| {
            v.get("ticket_id")
                .and_then(|s| s.as_str())
                .map(|s| s.to_string())
        })
        .collect()
}

/// Remove a ticket from waiting-for-expert.json and delete its inbox file.
pub fn remove_waiting_entry(project_root: &Path, ticket_id: &str) {
    let path = project_root.join(".eket/state/waiting-for-expert.json");
    if path.exists() {
        if let Ok(raw) = std::fs::read_to_string(&path) {
            if let Ok(entries) = serde_json::from_str::<Vec<serde_json::Value>>(&raw) {
                let updated: Vec<serde_json::Value> = entries
                    .into_iter()
                    .filter(|v| v.get("ticket_id").and_then(|s| s.as_str()) != Some(ticket_id))
                    .collect();
                if let Ok(s) = serde_json::to_string_pretty(&updated) {
                    let _ = std::fs::write(&path, s);
                }
            }
        }
    }
    let inbox_file = project_root.join(format!(".eket/inbox/need-expert-{ticket_id}.md"));
    let _ = std::fs::remove_file(&inbox_file); // ignore if absent
}

/// One heartbeat cycle: scan ready tickets → assign to idle slavers.
/// Unblocked queue (dispatched:false) is prioritized over normal DAG-ready tickets.
/// Extracted for testability.
pub async fn check_once(client: &SqliteClient, mailbox: &Arc<AgentMailbox>, tickets_dir: &Path) {
    // 0. Derive project_root from tickets_dir (one level up from jira/tickets)
    let project_root = tickets_dir
        .parent() // jira/
        .and_then(|p| p.parent()); // project root

    // 1. Collect completed / failed ticket IDs from DB
    let completed: HashSet<String> = client
        .list_tickets(Some("done"), None, None)
        .unwrap_or_default()
        .into_iter()
        .map(|r| r.id)
        .collect();

    let failed: HashSet<String> = client
        .list_tickets(Some("failed"), None, None)
        .unwrap_or_default()
        .into_iter()
        .map(|r| r.id)
        .collect();

    // 2. Build priority list: unblocked-queue first, then DAG-ready
    let mut priority_tickets: Vec<String> = vec![];

    // 2a. Read unblocked-queue.json (dispatched: false)
    if let Some(root) = project_root {
        let queue_path = root.join(".eket/state/unblocked-queue.json");
        if queue_path.exists() {
            if let Ok(raw) = std::fs::read_to_string(&queue_path) {
                if let Ok(entries) = serde_json::from_str::<Vec<serde_json::Value>>(&raw) {
                    let pending: Vec<String> = entries
                        .iter()
                        .filter(|v| {
                            v.get("dispatched")
                                .and_then(|d| d.as_bool())
                                .map(|d| !d)
                                .unwrap_or(false)
                        })
                        .filter_map(|v| {
                            v.get("ticket_id")
                                .and_then(|s| s.as_str())
                                .map(|s| s.to_string())
                        })
                        .collect();
                    priority_tickets.extend(pending);
                }
            }
        }
    }

    // 2b. Waiting-for-expert tickets (retries DESC), skip already-in-priority
    if let Some(root) = project_root {
        let waiting = load_waiting_tickets(root);
        for t in waiting {
            if !priority_tickets.contains(&t) {
                priority_tickets.push(t);
            }
        }
    }

    // 2c. DAG-ready tickets (excluding already-in priority_tickets to avoid dups)
    let dag = parse_tickets_dag(tickets_dir);
    let ready = ready_tickets(&dag, &completed, &failed);
    let priority_set: HashSet<String> = priority_tickets.iter().cloned().collect();
    for t in ready {
        if !priority_set.contains(&t) {
            priority_tickets.push(t);
        }
    }

    // 3. Assign each ticket to the best matching idle slaver
    let sender = ProtocolSender::new(mailbox.clone());

    // Load TrustScore weights once per cycle (fallback to defaults if config missing)
    let weights = project_root.map(|r| load_weights(r)).unwrap_or_default();
    let instance_stats = client.get_all_instance_scoring_stats().unwrap_or_default();

    for ticket_id in priority_tickets {
        let required = parse_required_expertise(tickets_dir, &ticket_id);

        let idle_instances: Vec<InstanceRow> = client
            .list_instances(Some("slaver"))
            .unwrap_or_default()
            .into_iter()
            .filter(|i| i.status == "idle")
            .collect();

        let matched = best_matching_slaver(&idle_instances, &required, &instance_stats, &weights);

        match matched {
            None => {
                if idle_instances.is_empty() {
                    tracing::warn!("[master:heartbeat] no idle slaver for ticket {ticket_id}");
                } else {
                    // idle slavers exist but none match expertise
                    tracing::warn!(
                        "[master:heartbeat] no matching slaver for ticket {ticket_id} (required: {required:?})"
                    );
                    println!(
                        "{}",
                        json!({
                            "event": "no_matching_slaver",
                            "ticket_id": ticket_id,
                            "required": required
                        })
                    );
                    if let Some(root) = project_root {
                        append_waiting_for_expert(root, &ticket_id, &required);
                        write_inbox_need_expert(root, &ticket_id, &required);
                    }
                }
            }
            Some(slaver) => {
                let _ = client.update_ticket_status_str(&ticket_id, "in_progress");
                let _ = client.update_ticket_assignee(&ticket_id, &slaver.id);

                // Write scoring trace
                if let Some(root) = project_root {
                    let s = instance_stats.get(&slaver.id).cloned().unwrap_or_default();
                    let factors =
                        factors_from_stats(s.completed_count, s.failed_count, s.total_latency_ms);
                    let trust_score = compute_trust(&factors, &weights);
                    write_scoring_trace(root, &ticket_id, &slaver.id, trust_score, &factors);
                }

                let payload = TaskAssignPayload {
                    ticket_id: ticket_id.clone(),
                    title: ticket_id.clone(),
                    priority: "normal".to_string(),
                    instructions: String::new(),
                    deadline_secs: None,
                };
                let _ = sender.send_task_assign("master", &slaver.id, payload).await;

                let _ = client.update_instance_status(&slaver.id, "busy");

                // Mark as dispatched in unblocked-queue if applicable
                if let Some(root) = project_root {
                    mark_unblocked_dispatched(root, &ticket_id);
                    remove_waiting_entry(root, &ticket_id);
                }

                println!(
                    "{}",
                    json!({
                        "event": "task_assigned",
                        "ticket_id": ticket_id,
                        "slaver_id": slaver.id
                    })
                );
            }
        }
    }
}

/// Mark a ticket as dispatched in .eket/state/unblocked-queue.json.
fn mark_unblocked_dispatched(project_root: &Path, ticket_id: &str) {
    let queue_path = project_root.join(".eket/state/unblocked-queue.json");
    if !queue_path.exists() {
        return;
    }
    let Ok(raw) = std::fs::read_to_string(&queue_path) else {
        return;
    };
    let Ok(mut entries) = serde_json::from_str::<Vec<serde_json::Value>>(&raw) else {
        return;
    };

    let mut changed = false;
    for entry in &mut entries {
        if entry.get("ticket_id").and_then(|v| v.as_str()) == Some(ticket_id) {
            entry["dispatched"] = serde_json::json!(true);
            changed = true;
        }
    }
    if changed {
        if let Ok(json) = serde_json::to_string_pretty(&entries) {
            let _ = std::fs::write(&queue_path, json);
        }
    }
}

fn expand_tilde(path: &str) -> String {
    if let Some(rest) = path.strip_prefix("~/") {
        if let Ok(home) = std::env::var("HOME") {
            return format!("{home}/{rest}");
        }
    }
    path.to_string()
}

/// 追加一行到 `.eket/logs/scoring_trace-YYYY-MM-DD.jsonl`（按日轮转）。
fn write_scoring_trace(
    project_root: &Path,
    ticket_id: &str,
    slaver_id: &str,
    trust_score: f32,
    factors: &eket_core::scoring::trust_engine::TrustFactors,
) {
    let log_dir = project_root.join(".eket/logs");
    if let Err(e) = std::fs::create_dir_all(&log_dir) {
        tracing::warn!("[scoring_trace] cannot create log dir: {e}");
        return;
    }
    let today = chrono::Utc::now().format("%Y-%m-%d");
    let path = log_dir.join(format!("scoring_trace-{today}.jsonl"));
    let entry = serde_json::json!({
        "ts": chrono::Utc::now().to_rfc3339(),
        "ticket_id": ticket_id,
        "slaver_id": slaver_id,
        "trust_score": trust_score,
        "factors": {
            "success_rate_7d":  factors.success_rate_7d,
            "uptime_30d":       factors.uptime_30d,
            "avg_latency_norm": factors.avg_latency_norm,
            "error_rate":       factors.error_rate,
        }
    });
    use std::io::Write;
    if let Ok(mut f) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
    {
        let _ = f.write_all(format!("{entry}\n").as_bytes());
    }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use eket_core::db::{create_pool, InstanceScoringStats, SqliteClient};
    use eket_core::scoring::trust_engine::ScoreWeights;
    use std::{collections::HashMap, fs};
    use tempfile::TempDir;

    fn make_client() -> SqliteClient {
        SqliteClient::new(create_pool(":memory:").unwrap())
    }

    /// Write a minimal TASK-NNN.md into `dir`
    fn make_ticket_file(dir: &TempDir, id: &str, status: &str, blocked_by: &[&str]) {
        let inner = if blocked_by.is_empty() {
            String::new()
        } else {
            blocked_by.join(", ")
        };
        let content =
            format!("# {id}: Test ticket\n- **状态**: {status}\n- blocked_by: [{inner}]\n");
        fs::write(dir.path().join(format!("{id}.md")), content).unwrap();
    }

    /// Write a ticket file with `required_expertise` line.
    fn make_ticket_file_with_expertise(
        dir: &TempDir,
        id: &str,
        status: &str,
        blocked_by: &[&str],
        expertise: &[&str],
    ) {
        let inner = if blocked_by.is_empty() {
            String::new()
        } else {
            blocked_by.join(", ")
        };
        let expertise_line = if expertise.is_empty() {
            String::new()
        } else {
            format!("required_expertise: [{}]\n", expertise.join(", "))
        };
        let content = format!(
            "# {id}: Test ticket\n- **状态**: {status}\n- blocked_by: [{inner}]\n{expertise_line}"
        );
        fs::write(dir.path().join(format!("{id}.md")), content).unwrap();
    }

    /// 1. One todo ticket (no blocked_by) + one idle slaver → assigned
    ///    Slaver has skills=["rust"], ticket requires rust.
    #[tokio::test]
    async fn heartbeat_assigns_ready_ticket() {
        let ticket_dir = TempDir::new().unwrap();
        let mailbox_dir = TempDir::new().unwrap();
        let client = make_client();

        make_ticket_file_with_expertise(&ticket_dir, "TASK-1", "todo", &[], &["rust"]);
        client
            .create_ticket("TASK-1", "Test", "P1", "task")
            .unwrap();
        client
            .upsert_instance("slaver-1", "slaver", &["rust".to_string()], "idle")
            .unwrap();

        let mailbox = Arc::new(AgentMailbox::new(mailbox_dir.path()));
        check_once(&client, &mailbox, ticket_dir.path()).await;

        let row = client.get_ticket_row("TASK-1").unwrap().unwrap();
        assert_eq!(row.status, "in_progress", "ticket should be in_progress");
        assert_eq!(
            row.assignee.as_deref(),
            Some("slaver-1"),
            "assignee should be set"
        );

        let inst = client.get_instance("slaver-1").unwrap().unwrap();
        assert_eq!(
            inst.status, "busy",
            "slaver should be busy after assignment"
        );
    }

    /// 2. Ready ticket but no idle slaver → ticket stays todo
    #[tokio::test]
    async fn heartbeat_skips_when_no_slaver() {
        let ticket_dir = TempDir::new().unwrap();
        let mailbox_dir = TempDir::new().unwrap();
        let client = make_client();

        make_ticket_file(&ticket_dir, "TASK-2", "todo", &[]);
        client
            .create_ticket("TASK-2", "No slaver test", "P1", "task")
            .unwrap();
        // deliberately no slaver registered

        let mailbox = Arc::new(AgentMailbox::new(mailbox_dir.path()));
        check_once(&client, &mailbox, ticket_dir.path()).await;

        let row = client.get_ticket_row("TASK-2").unwrap().unwrap();
        assert_eq!(
            row.status, "todo",
            "ticket should remain todo when no idle slaver"
        );
    }

    /// 3. Ticket blocked by incomplete dependency → not assigned
    #[tokio::test]
    async fn heartbeat_skips_blocked_ticket() {
        let ticket_dir = TempDir::new().unwrap();
        let mailbox_dir = TempDir::new().unwrap();
        let client = make_client();

        // TASK-3 blocked by TASK-4 (not done)
        make_ticket_file(&ticket_dir, "TASK-3", "todo", &["TASK-4"]);
        make_ticket_file(&ticket_dir, "TASK-4", "todo", &[]);
        client
            .create_ticket("TASK-3", "Blocked ticket", "P1", "task")
            .unwrap();
        client
            .create_ticket("TASK-4", "Dependency", "P1", "task")
            .unwrap();

        // One idle slaver available — will be consumed by TASK-4 (unblocked)
        client
            .upsert_instance("slaver-3", "slaver", &[], "idle")
            .unwrap();

        let mailbox = Arc::new(AgentMailbox::new(mailbox_dir.path()));
        check_once(&client, &mailbox, ticket_dir.path()).await;

        // TASK-3 must remain todo — blocked by TASK-4 which is not done
        let row3 = client.get_ticket_row("TASK-3").unwrap().unwrap();
        assert_eq!(
            row3.status, "todo",
            "TASK-3 should remain todo (blocked by TASK-4)"
        );
    }

    /// 4. Ticket requires rust, slaver has mismatched role/skills → ticket NOT assigned
    #[tokio::test]
    async fn heartbeat_skips_expertise_mismatch() {
        let ticket_dir = TempDir::new().unwrap();
        let mailbox_dir = TempDir::new().unwrap();
        let client = make_client();

        make_ticket_file_with_expertise(&ticket_dir, "TASK-5", "todo", &[], &["rust"]);
        client
            .create_ticket("TASK-5", "Rust-only task", "P1", "task")
            .unwrap();

        // Slaver with frontend role and no skills — should NOT match "rust"
        client
            .upsert_instance("slaver-fe", "frontend", &[], "idle")
            .unwrap();

        let mailbox = Arc::new(AgentMailbox::new(mailbox_dir.path()));
        check_once(&client, &mailbox, ticket_dir.path()).await;

        let row = client.get_ticket_row("TASK-5").unwrap().unwrap();
        assert_eq!(
            row.status, "todo",
            "ticket should remain todo: no matching slaver"
        );
        assert!(row.assignee.is_none(), "assignee should not be set");
    }

    // ── Unit tests for helpers ────────────────────────────────────────────────

    #[test]
    fn parse_expertise_finds_field() {
        let dir = TempDir::new().unwrap();
        fs::write(
            dir.path().join("TASK-10.md"),
            "# TASK-10\nrequired_expertise: [rust, devops]\n",
        )
        .unwrap();
        let result = parse_required_expertise(dir.path(), "TASK-10");
        assert_eq!(result, vec!["rust", "devops"]);
    }

    #[test]
    fn parse_expertise_missing_field_returns_any() {
        let dir = TempDir::new().unwrap();
        fs::write(
            dir.path().join("TASK-11.md"),
            "# TASK-11\nno expertise here\n",
        )
        .unwrap();
        let result = parse_required_expertise(dir.path(), "TASK-11");
        assert_eq!(result, vec!["any"]);
    }

    #[test]
    fn parse_expertise_missing_file_returns_any() {
        let dir = TempDir::new().unwrap();
        let result = parse_required_expertise(dir.path(), "TASK-NONEXISTENT");
        assert_eq!(result, vec!["any"]);
    }

    #[test]
    fn best_matching_any_returns_first_idle() {
        let instances = vec![
            InstanceRow {
                id: "a".into(),
                role: "slaver".into(),
                skills: vec![],
                status: "idle".into(),
                last_seen: None,
            },
            InstanceRow {
                id: "b".into(),
                role: "slaver".into(),
                skills: vec![],
                status: "idle".into(),
                last_seen: None,
            },
        ];
        let result = best_matching_slaver(
            &instances,
            &["any".to_string()],
            &HashMap::new(),
            &ScoreWeights::default(),
        );
        assert!(result.is_some()); // "any" → picks one idle (TrustScore-based, both equal)
    }

    #[test]
    fn best_matching_role_wins_over_skills() {
        let instances = vec![
            InstanceRow {
                id: "skills-only".into(),
                role: "generic".into(),
                skills: vec!["rust".into()],
                status: "idle".into(),
                last_seen: None,
            },
            InstanceRow {
                id: "role-match".into(),
                role: "rust".into(),
                skills: vec![],
                status: "idle".into(),
                last_seen: None,
            },
        ];
        let result = best_matching_slaver(
            &instances,
            &["rust".to_string()],
            &HashMap::new(),
            &ScoreWeights::default(),
        );
        // Both match via vector or tag; role-match has higher tag score → selected
        assert!(result.is_some());
    }

    #[test]
    fn best_matching_no_match_returns_none() {
        let instances = vec![InstanceRow {
            id: "fe".into(),
            role: "frontend".into(),
            skills: vec!["js".into()],
            status: "idle".into(),
            last_seen: None,
        }];
        let result = best_matching_slaver(
            &instances,
            &["rust".to_string()],
            &HashMap::new(),
            &ScoreWeights::default(),
        );
        assert!(result.is_none());
    }

    #[test]
    fn best_matching_skips_busy_instances() {
        let instances = vec![
            InstanceRow {
                id: "busy-rust".into(),
                role: "rust".into(),
                skills: vec![],
                status: "busy".into(),
                last_seen: None,
            },
            InstanceRow {
                id: "idle-generic".into(),
                role: "generic".into(),
                skills: vec!["rust".into()],
                status: "idle".into(),
                last_seen: None,
            },
        ];
        let result = best_matching_slaver(
            &instances,
            &["rust".to_string()],
            &HashMap::new(),
            &ScoreWeights::default(),
        );
        assert_eq!(result.map(|i| i.id.as_str()), Some("idle-generic"));
    }

    // ── Waiting-for-expert tests ──────────────────────────────────────────────

    /// Helper: create a fake project root with jira/tickets subdirectory
    fn make_project_with_tickets() -> (TempDir, PathBuf) {
        let root = TempDir::new().unwrap();
        let tickets_dir = root.path().join("jira/tickets");
        fs::create_dir_all(&tickets_dir).unwrap();
        (root, tickets_dir)
    }

    /// Write a ticket file with `required_expertise` directly into `tickets_dir`
    fn write_expertise_ticket(tickets_dir: &Path, id: &str, expertise: &[&str]) {
        let content = format!(
            "# {id}: Test ticket\n- **状态**: todo\n- blocked_by: []\nrequired_expertise: [{}]\n",
            expertise.join(", ")
        );
        fs::write(tickets_dir.join(format!("{id}.md")), content).unwrap();
    }

    /// 5. No matching slaver → waiting-for-expert.json written, inbox file written
    #[tokio::test]
    async fn heartbeat_writes_waiting_queue() {
        let (root, tickets_dir) = make_project_with_tickets();
        let mailbox_dir = TempDir::new().unwrap();
        let client = make_client();

        write_expertise_ticket(&tickets_dir, "TASK-201", &["rust"]);
        client
            .create_ticket("TASK-201", "Rust task", "P1", "task")
            .unwrap();
        // slaver with frontend skills — no match for "rust"
        client
            .upsert_instance("slaver-fe", "slaver", &["frontend".to_string()], "idle")
            .unwrap();

        let mailbox = Arc::new(AgentMailbox::new(mailbox_dir.path()));
        check_once(&client, &mailbox, &tickets_dir).await;

        let waiting_path = root.path().join(".eket/state/waiting-for-expert.json");
        assert!(
            waiting_path.exists(),
            "waiting-for-expert.json should exist"
        );
        let raw = fs::read_to_string(&waiting_path).unwrap();
        let entries: Vec<serde_json::Value> = serde_json::from_str(&raw).unwrap();
        assert!(
            entries
                .iter()
                .any(|e| e["ticket_id"] == "TASK-201" && e["retries"] == 1),
            "TASK-201 should be in waiting queue with retries=1"
        );

        let inbox_path = root.path().join(".eket/inbox/need-expert-TASK-201.md");
        assert!(inbox_path.exists(), "inbox hint file should exist");
    }

    /// 6. Second call → retries increments to 2
    #[tokio::test]
    async fn heartbeat_retries_waiting_ticket() {
        let (root, tickets_dir) = make_project_with_tickets();
        let mailbox_dir = TempDir::new().unwrap();
        let client = make_client();

        write_expertise_ticket(&tickets_dir, "TASK-201", &["rust"]);
        client
            .create_ticket("TASK-201", "Rust task", "P1", "task")
            .unwrap();
        client
            .upsert_instance("slaver-fe", "slaver", &["frontend".to_string()], "idle")
            .unwrap();

        let mailbox = Arc::new(AgentMailbox::new(mailbox_dir.path()));
        // First call
        check_once(&client, &mailbox, &tickets_dir).await;
        // Second call — TASK-201 now in waiting list, replayed; still no match → retries=2
        check_once(&client, &mailbox, &tickets_dir).await;

        let waiting_path = root.path().join(".eket/state/waiting-for-expert.json");
        let raw = fs::read_to_string(&waiting_path).unwrap();
        let entries: Vec<serde_json::Value> = serde_json::from_str(&raw).unwrap();
        assert!(
            entries
                .iter()
                .any(|e| e["ticket_id"] == "TASK-201" && e["retries"] == 2),
            "retries should be 2 after second call"
        );
    }

    /// 7. Matching slaver appears → waiting entry cleared, inbox file deleted
    #[tokio::test]
    async fn heartbeat_clears_waiting_on_success() {
        let (root, tickets_dir) = make_project_with_tickets();
        let mailbox_dir = TempDir::new().unwrap();
        let client = make_client();

        // Pre-seed waiting-for-expert.json with TASK-202
        let state_dir = root.path().join(".eket/state");
        fs::create_dir_all(&state_dir).unwrap();
        fs::write(
            state_dir.join("waiting-for-expert.json"),
            r#"[{"ticket_id":"TASK-202","required":["rust"],"since":"2026-05-04T00:00:00Z","retries":1}]"#,
        ).unwrap();
        // Pre-seed inbox file
        let inbox_dir = root.path().join(".eket/inbox");
        fs::create_dir_all(&inbox_dir).unwrap();
        fs::write(inbox_dir.join("need-expert-TASK-202.md"), "hint").unwrap();

        write_expertise_ticket(&tickets_dir, "TASK-202", &["rust"]);
        client
            .create_ticket("TASK-202", "Rust task", "P1", "task")
            .unwrap();
        // Rust-skilled slaver — matches
        client
            .upsert_instance("slaver-rust", "slaver", &["rust".to_string()], "idle")
            .unwrap();

        let mailbox = Arc::new(AgentMailbox::new(mailbox_dir.path()));
        check_once(&client, &mailbox, &tickets_dir).await;

        let waiting_path = state_dir.join("waiting-for-expert.json");
        let raw = fs::read_to_string(&waiting_path).unwrap();
        let entries: Vec<serde_json::Value> = serde_json::from_str(&raw).unwrap();
        assert!(
            !entries.iter().any(|e| e["ticket_id"] == "TASK-202"),
            "TASK-202 should be removed from waiting queue"
        );
        assert!(
            !inbox_dir.join("need-expert-TASK-202.md").exists(),
            "inbox hint file should be deleted"
        );
    }

    #[test]
    fn test_heartbeat_vector_matching_basic() {
        let instances = vec![
            InstanceRow {
                id: "slaver-rust".into(),
                role: "rust".into(),
                skills: vec!["rust".into()],
                status: "idle".into(),
                last_seen: None,
            },
            InstanceRow {
                id: "slaver-fe".into(),
                role: "frontend".into(),
                skills: vec!["js".into(), "css".into()],
                status: "idle".into(),
                last_seen: None,
            },
        ];
        let result = best_matching_slaver(
            &instances,
            &["rust".to_string()],
            &HashMap::new(),
            &ScoreWeights::default(),
        );
        assert_eq!(result.map(|i| i.id.as_str()), Some("slaver-rust"));
    }

    #[test]
    fn test_heartbeat_prefers_higher_trust_slaver() {
        let instances = vec![
            InstanceRow {
                id: "low-trust".into(),
                role: "rust".into(),
                skills: vec!["rust".into()],
                status: "idle".into(),
                last_seen: None,
            },
            InstanceRow {
                id: "high-trust".into(),
                role: "rust".into(),
                skills: vec!["rust".into()],
                status: "idle".into(),
                last_seen: None,
            },
        ];
        let mut stats = HashMap::new();
        stats.insert(
            "low-trust".to_string(),
            InstanceScoringStats {
                completed_count: 2,
                failed_count: 8,
                total_latency_ms: 120_000,
            },
        );
        stats.insert(
            "high-trust".to_string(),
            InstanceScoringStats {
                completed_count: 50,
                failed_count: 2,
                total_latency_ms: 100_000,
            },
        );
        let result = best_matching_slaver(
            &instances,
            &["rust".to_string()],
            &stats,
            &ScoreWeights::default(),
        );
        assert_eq!(result.map(|i| i.id.as_str()), Some("high-trust"));
    }
}
