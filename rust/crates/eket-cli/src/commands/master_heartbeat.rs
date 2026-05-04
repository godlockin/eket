/// master:heartbeat — 长驻进程，周期扫描 ready tickets 并分配给 idle slaver
use anyhow::Result;
use clap::Args;
use eket_core::{
    dag::{parse_tickets_dag, ready_tickets},
    db::{create_pool, InstanceRow, SqliteClient},
};
use eket_engine::{
    mailbox::AgentMailbox,
    protocol::{ProtocolSender, TaskAssignPayload},
};
use serde_json::json;
use std::{collections::HashSet, path::{Path, PathBuf}, sync::Arc};

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
        if let Some(rest) = trimmed
            .strip_prefix("required_expertise:")
            .or_else(|| {
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
            })
        {
            let rest = rest.trim();
            // strip surrounding brackets
            let inner = rest
                .trim_start_matches('[')
                .trim_end_matches(']')
                .trim();
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
/// Scoring:
/// - `required` is empty or contains "any" → return first idle (original behaviour)
/// - `i.role` is in `required` → score 2
/// - `i.skills` has any intersection with `required` → score 1
/// - No match → `None`
pub fn best_matching_slaver<'a>(
    instances: &'a [InstanceRow],
    required: &[String],
) -> Option<&'a InstanceRow> {
    let idle: Vec<&InstanceRow> = instances.iter().filter(|i| i.status == "idle").collect();

    if idle.is_empty() {
        return None;
    }

    // "any" / empty required → original first-idle logic
    if required.is_empty() || required.iter().any(|r| r == "any") {
        return idle.into_iter().next();
    }

    let required_set: HashSet<&str> = required.iter().map(|s| s.as_str()).collect();

    let mut best: Option<(&InstanceRow, u32)> = None;
    for inst in idle {
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
            match best {
                None => best = Some((inst, score)),
                Some((_, prev)) if score > prev => best = Some((inst, score)),
                _ => {}
            }
        }
    }

    best.map(|(inst, _)| inst)
}

/// One heartbeat cycle: scan ready tickets → assign to idle slavers.
/// Unblocked queue (dispatched:false) is prioritized over normal DAG-ready tickets.
/// Extracted for testability.
pub async fn check_once(client: &SqliteClient, mailbox: &Arc<AgentMailbox>, tickets_dir: &Path) {
    // 0. Derive project_root from tickets_dir (one level up from jira/tickets)
    let project_root = tickets_dir
        .parent()    // jira/
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
                            v.get("ticket_id").and_then(|s| s.as_str()).map(|s| s.to_string())
                        })
                        .collect();
                    priority_tickets.extend(pending);
                }
            }
        }
    }

    // 2b. DAG-ready tickets (excluding already-in priority_tickets to avoid dups)
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

    for ticket_id in priority_tickets {
        let required = parse_required_expertise(tickets_dir, &ticket_id);

        let idle_instances: Vec<InstanceRow> = client
            .list_instances(Some("slaver"))
            .unwrap_or_default()
            .into_iter()
            .filter(|i| i.status == "idle")
            .collect();

        let matched = best_matching_slaver(&idle_instances, &required);

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
                }
            }
            Some(slaver) => {
                let _ = client.update_ticket_status_str(&ticket_id, "in_progress");
                let _ = client.update_ticket_assignee(&ticket_id, &slaver.id);

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
    let Ok(raw) = std::fs::read_to_string(&queue_path) else { return };
    let Ok(mut entries) = serde_json::from_str::<Vec<serde_json::Value>>(&raw) else { return };

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

// ─── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use eket_core::db::{create_pool, SqliteClient};
    use std::fs;
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
        let content = format!(
            "# {id}: Test ticket\n- **状态**: {status}\n- blocked_by: [{inner}]\n"
        );
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
        client.create_ticket("TASK-1", "Test", "P1", "task").unwrap();
        client
            .upsert_instance("slaver-1", "slaver", &["rust".to_string()], "idle")
            .unwrap();

        let mailbox = Arc::new(AgentMailbox::new(mailbox_dir.path()));
        check_once(&client, &mailbox, ticket_dir.path()).await;

        let row = client.get_ticket_row("TASK-1").unwrap().unwrap();
        assert_eq!(row.status, "in_progress", "ticket should be in_progress");
        assert_eq!(row.assignee.as_deref(), Some("slaver-1"), "assignee should be set");

        let inst = client.get_instance("slaver-1").unwrap().unwrap();
        assert_eq!(inst.status, "busy", "slaver should be busy after assignment");
    }

    /// 2. Ready ticket but no idle slaver → ticket stays todo
    #[tokio::test]
    async fn heartbeat_skips_when_no_slaver() {
        let ticket_dir = TempDir::new().unwrap();
        let mailbox_dir = TempDir::new().unwrap();
        let client = make_client();

        make_ticket_file(&ticket_dir, "TASK-2", "todo", &[]);
        client.create_ticket("TASK-2", "No slaver test", "P1", "task").unwrap();
        // deliberately no slaver registered

        let mailbox = Arc::new(AgentMailbox::new(mailbox_dir.path()));
        check_once(&client, &mailbox, ticket_dir.path()).await;

        let row = client.get_ticket_row("TASK-2").unwrap().unwrap();
        assert_eq!(row.status, "todo", "ticket should remain todo when no idle slaver");
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
        client.create_ticket("TASK-3", "Blocked ticket", "P1", "task").unwrap();
        client.create_ticket("TASK-4", "Dependency", "P1", "task").unwrap();

        // One idle slaver available — will be consumed by TASK-4 (unblocked)
        client.upsert_instance("slaver-3", "slaver", &[], "idle").unwrap();

        let mailbox = Arc::new(AgentMailbox::new(mailbox_dir.path()));
        check_once(&client, &mailbox, ticket_dir.path()).await;

        // TASK-3 must remain todo — blocked by TASK-4 which is not done
        let row3 = client.get_ticket_row("TASK-3").unwrap().unwrap();
        assert_eq!(row3.status, "todo", "TASK-3 should remain todo (blocked by TASK-4)");
    }

    /// 4. Ticket requires rust, slaver has mismatched role/skills → ticket NOT assigned
    #[tokio::test]
    async fn heartbeat_skips_expertise_mismatch() {
        let ticket_dir = TempDir::new().unwrap();
        let mailbox_dir = TempDir::new().unwrap();
        let client = make_client();

        make_ticket_file_with_expertise(&ticket_dir, "TASK-5", "todo", &[], &["rust"]);
        client.create_ticket("TASK-5", "Rust-only task", "P1", "task").unwrap();

        // Slaver with frontend role and no skills — should NOT match "rust"
        client
            .upsert_instance("slaver-fe", "frontend", &[], "idle")
            .unwrap();

        let mailbox = Arc::new(AgentMailbox::new(mailbox_dir.path()));
        check_once(&client, &mailbox, ticket_dir.path()).await;

        let row = client.get_ticket_row("TASK-5").unwrap().unwrap();
        assert_eq!(row.status, "todo", "ticket should remain todo: no matching slaver");
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
        fs::write(dir.path().join("TASK-11.md"), "# TASK-11\nno expertise here\n").unwrap();
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
            InstanceRow { id: "a".into(), role: "slaver".into(), skills: vec![], status: "idle".into(), last_seen: None },
            InstanceRow { id: "b".into(), role: "slaver".into(), skills: vec![], status: "idle".into(), last_seen: None },
        ];
        let result = best_matching_slaver(&instances, &["any".to_string()]);
        assert_eq!(result.map(|i| i.id.as_str()), Some("a"));
    }

    #[test]
    fn best_matching_role_wins_over_skills() {
        let instances = vec![
            InstanceRow { id: "skills-only".into(), role: "generic".into(), skills: vec!["rust".into()], status: "idle".into(), last_seen: None },
            InstanceRow { id: "role-match".into(), role: "rust".into(), skills: vec![], status: "idle".into(), last_seen: None },
        ];
        let result = best_matching_slaver(&instances, &["rust".to_string()]);
        assert_eq!(result.map(|i| i.id.as_str()), Some("role-match"));
    }

    #[test]
    fn best_matching_no_match_returns_none() {
        let instances = vec![
            InstanceRow { id: "fe".into(), role: "frontend".into(), skills: vec!["js".into()], status: "idle".into(), last_seen: None },
        ];
        let result = best_matching_slaver(&instances, &["rust".to_string()]);
        assert!(result.is_none());
    }

    #[test]
    fn best_matching_skips_busy_instances() {
        let instances = vec![
            InstanceRow { id: "busy-rust".into(), role: "rust".into(), skills: vec![], status: "busy".into(), last_seen: None },
            InstanceRow { id: "idle-generic".into(), role: "generic".into(), skills: vec!["rust".into()], status: "idle".into(), last_seen: None },
        ];
        let result = best_matching_slaver(&instances, &["rust".to_string()]);
        assert_eq!(result.map(|i| i.id.as_str()), Some("idle-generic"));
    }
}
