/// task:create — create a new ticket with cycle detection and size checking
///
/// 核心流程：
/// 1. 找到 tickets 目录
/// 2. 计算下一个 TASK-NNN 编号
/// 3. 解析 blocked_by 列表
/// 4. 环检测（若有依赖）
/// 5. 卡大小检测（若传 --effort）
/// 6. 生成 ticket markdown，原子写文件
/// 7. 输出 JSON
use anyhow::Result;
use clap::Parser;
use eket_core::config::EketConfig;
use eket_core::dag::{detect_cycle, parse_tickets_dag, DagEdge, DagNode, TriggerRule};
use eket_core::db::{create_pool, SqliteClient};
use eket_core::expert_skill_bridge::ExpertSkillBridge;
use serde_json::json;
use std::fs::OpenOptions;
use std::io::{self, BufRead, Write as IoWrite};
use std::path::{Path, PathBuf};

// ─── Args ────────────────────────────────────────────────────────────────────

#[derive(Parser, Debug)]
pub struct TaskCreateArgs {
    /// Ticket 标题
    pub title: String,

    /// Ticket 类型（可选，支持从 title 关键词自动推断）
    #[arg(long)]
    pub r#type: Option<String>,

    /// 优先级（可选，支持从 title 关键词自动推断）
    #[arg(long)]
    pub priority: Option<String>,

    /// 前置依赖，逗号分隔，如 "TASK-001,TASK-002"
    #[arg(long, default_value = "")]
    pub blocked_by: String,

    #[arg(long, default_value = "")]
    pub assignee: String,

    /// Associate with EPIC ID (e.g. EPIC-001)
    #[arg(long)]
    pub epic: Option<String>,

    /// Required expertise tags, comma-separated.
    /// Valid: rust, node, python, go, java, frontend, devops, qa, docs, ux, data, security, any
    #[arg(
        long,
        value_delimiter = ',',
        required = true,
        help = "Required expertise: rust,node,python,go,java,frontend,devops,qa,docs,ux,data,security,any"
    )]
    pub expertise: Vec<String>,

    /// Estimated effort: supports 2d / 0.5d / 3h / 480 (plain = minutes)
    #[arg(long, help = "Estimated effort: 2d, 0.5d, 3h, or plain minutes (e.g. 480)")]
    pub effort: Option<String>,

    /// Skip interactive prompts (CI mode)
    #[arg(long, help = "Skip interactive prompts (CI mode)")]
    pub no_interactive: bool,

    /// tickets 目录路径（默认自动探测）
    #[arg(long)]
    pub tickets_dir: Option<PathBuf>,
}

// ─── Inference helpers ────────────────────────────────────────────────────────

/// Infer ticket type from title keywords.
//NOTE: Order matters — check more specific terms first.
fn infer_type(title: &str) -> &'static str {
    let lower = title.to_lowercase();
    if lower.contains("fix") || lower.contains("bug") {
        "bugfix"
    } else if lower.contains("refactor") {
        "refactor"
    } else if lower.contains("test") {
        "test"
    } else if lower.contains("docs") || lower.contains("doc") {
        "docs"
    } else {
        // default: feature (also covers feat/add/新增)
        "feature"
    }
}

/// Infer priority from title keywords.
fn infer_priority(title: &str) -> &'static str {
    let lower = title.to_lowercase();
    if lower.contains("p0") || lower.contains("urgent") || lower.contains("紧急") {
        "P0"
    } else if lower.contains("p1") || lower.contains("critical") {
        "P1"
    } else {
        "P2"
    }
}

// ─── Size check helpers ───────────────────────────────────────────────────────

/// Parse effort string to minutes.
/// Supported formats: "2d", "0.5d", "3h", "480" (plain number = minutes).
/// 1d = 8h = 480min.
fn parse_effort(s: &str) -> Option<u32> {
    let s = s.trim();
    if let Some(days_str) = s.strip_suffix('d') {
        let days: f64 = days_str.parse().ok()?;
        Some((days * 480.0).round() as u32)
    } else if let Some(hours_str) = s.strip_suffix('h') {
        let hours: f64 = hours_str.parse().ok()?;
        Some((hours * 60.0).round() as u32)
    } else {
        s.parse::<u32>().ok()
    }
}

/// Format minutes back to human-readable string.
fn format_effort(minutes: u32) -> String {
    if minutes % 480 == 0 {
        format!("{}天", minutes / 480)
    } else if minutes % 60 == 0 {
        format!("{}小时", minutes / 60)
    } else {
        format!("{}min", minutes)
    }
}

/// Read warn threshold (in minutes) from .eket/config.yml.
/// Checks `task_size.warn_days` first (1d=480min), then `task_size.warn_minutes`.
/// Falls back to 480 (1 day).
fn read_threshold(project_root: &Path) -> u32 {
    let config_path = project_root.join(".eket").join("config.yml");
    let Ok(content) = std::fs::read_to_string(&config_path) else {
        return 480;
    };
    let Ok(value) = serde_yaml::from_str::<serde_yaml::Value>(&content) else {
        return 480;
    };
    // Prefer warn_days (human-friendly), fall back to warn_minutes
    if let Some(days) = value
        .get("task_size")
        .and_then(|ts| ts.get("warn_days"))
        .and_then(|v| v.as_f64())
    {
        return (days * 480.0).round() as u32;
    }
    value
        .get("task_size")
        .and_then(|ts| ts.get("warn_minutes"))
        .and_then(|v| v.as_u64())
        .map(|n| n as u32)
        .unwrap_or(480)
}

/// Print yellow warning to stderr. Returns true if effort > threshold.
fn check_and_warn_size(effort_minutes: u32, threshold: u32) -> bool {
    if effort_minutes > threshold {
        eprintln!(
            "\x1b[33m⚠ 预估工时 {} 超过阈值 {}，建议拆分\x1b[0m",
            format_effort(effort_minutes),
            format_effort(threshold),
        );
        true
    } else {
        false
    }
}

/// Read a trimmed line from stdin.
fn read_line_trimmed() -> Result<String> {
    let stdin = io::stdin();
    let mut line = String::new();
    stdin.lock().read_line(&mut line)?;
    Ok(line.trim().to_string())
}

/// Interactive: ask user how many subtasks and collect titles.
/// Returns list of titles (empty = user cancelled).
fn interactive_split(count_min: u32, count_max: u32) -> Result<Vec<String>> {
    eprint!("输入子任务数量（{}-{}）: ", count_min, count_max);
    io::stderr().flush()?;

    let count_str = read_line_trimmed()?;
    let count: u32 = match count_str.parse() {
        Ok(n) if n >= count_min && n <= count_max => n,
        _ => {
            eprintln!("无效数量，取消拆分。");
            return Ok(vec![]);
        }
    };

    let mut titles = Vec::with_capacity(count as usize);
    for i in 1..=count {
        eprint!("子任务 {} 标题: ", i);
        io::stderr().flush()?;
        let t = read_line_trimmed()?;
        if t.is_empty() {
            eprintln!("标题不能为空，取消拆分。");
            return Ok(vec![]);
        }
        titles.push(t);
    }
    Ok(titles)
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

fn find_tickets_dir(hint: Option<PathBuf>) -> Result<PathBuf> {
    if let Some(p) = hint {
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

fn next_ticket_id(tickets_dir: &Path) -> Result<String> {
    let mut max_n: u64 = 0;
    let entries = std::fs::read_dir(tickets_dir)?;
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if let Some(rest) = name.strip_prefix("TASK-") {
            if let Some(num_str) = rest.strip_suffix(".md") {
                if !num_str.is_empty() && num_str.chars().all(|c| c.is_ascii_digit()) {
                    if let Ok(n) = num_str.parse::<u64>() {
                        if n > max_n {
                            max_n = n;
                        }
                    }
                }
            }
        }
    }
    Ok(format!("TASK-{}", max_n + 1))
}

fn parse_blocked_by(s: &str) -> Vec<String> {
    if s.is_empty() {
        return vec![];
    }
    s.split(',')
        .map(|x| x.trim().to_string())
        .filter(|x| !x.is_empty())
        .collect()
}

fn build_ticket_content(
    ticket_id: &str,
    title: &str,
    ticket_type: &str,
    priority: &str,
    assignee: &str,
    blocked_by: &[String],
    required_expertise: &[String],
) -> String {
    let date = chrono::Utc::now().format("%Y-%m-%d").to_string();
    let assignee_display = if assignee.is_empty() {
        "待认领"
    } else {
        assignee
    };
    let deps_display = if blocked_by.is_empty() {
        "[]".to_string()
    } else {
        blocked_by.join(", ")
    };
    let blocked_by_comma = if blocked_by.is_empty() {
        String::new()
    } else {
        blocked_by.join(", ")
    };
    let expertise_display = if required_expertise.is_empty() {
        "any".to_string()
    } else {
        required_expertise.join(", ")
    };

    format!(
        r#"# {ticket_id}: {title}

## 元数据
- **状态**: todo
- **类型**: {ticket_type}
- **优先级**: {priority}
- **负责人**: {assignee_display}
- **创建时间**: {date}
- **依赖**: {deps_display}
- **所需专家**: {expertise_display}
- blocked_by: [{blocked_by_comma}]
- required_expertise: [{expertise_display}]

## 背景

（待填写）

## 验收标准

- [ ] （待填写）

## 技术方案

（待填写）
"#
    )
}

/// Core create logic: write ticket file, link to EPIC, write to DB, return JSON value.
async fn create_single_ticket(
    tickets_dir: &Path,
    title: &str,
    ticket_type: &str,
    priority: &str,
    assignee: &str,
    blocked_by: &[String],
    expertise: &[String],
    epic: Option<&str>,
    db_client: Option<&SqliteClient>,
) -> Result<serde_json::Value> {
    let ticket_id = next_ticket_id(tickets_dir)?;

    // Cycle detection
    if !blocked_by.is_empty() {
        let mut dag = parse_tickets_dag(tickets_dir);
        dag.nodes.push(DagNode {
            id: ticket_id.clone(),
            label: title.to_string(),
            status: "todo".to_string(),
            assignee: None,
            trigger_rule: TriggerRule::AllSuccess,
        });
        for dep in blocked_by {
            dag.edges.push(DagEdge {
                source: ticket_id.clone(),
                target: dep.clone(),
            });
        }
        if let Some(cycle_nodes) = detect_cycle(&dag) {
            let cycle_str = cycle_nodes.join(" -> ");
            return Ok(json!({
                "status": "error",
                "error": format!("cycle detected: {}", cycle_str)
            }));
        }
    }

    let content = build_ticket_content(
        &ticket_id,
        title,
        ticket_type,
        priority,
        assignee,
        blocked_by,
        expertise,
    );

    let file_path = tickets_dir.join(format!("{}.md", ticket_id));
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&file_path)
        .map_err(|e| anyhow::anyhow!("Failed to create ticket file {}: {}", file_path.display(), e))?;
    file.write_all(content.as_bytes())?;

    // Write to SQLite DB (TASK-270)
    if let Some(db) = db_client {
        if let Err(e) = db.create_ticket_with_source(
            &ticket_id,
            title,
            priority,
            ticket_type,
            "cli", // source = "cli" for command-line created tickets
        ) {
            eprintln!("[WARN] Failed to write ticket to DB: {}", e);
            // Continue execution — MD file is primary source of truth
        }
    }

    // Link to EPIC if given
    if let Some(epic_id) = epic {
        let project_root = tickets_dir
            .parent() // jira/
            .and_then(|p| p.parent()); // project root
        if let Some(root) = project_root {
            let plan_path = root
                .join("confluence")
                .join("architecture")
                .join(format!("{epic_id}-plan.md"));
            if plan_path.exists() {
                let marker = "<!-- eket:section:tickets -->";
                let existing = std::fs::read_to_string(&plan_path)?;
                if existing.contains(marker) {
                    let replacement = format!("{marker}\n- {ticket_id}: {title}");
                    let updated = existing.replacen(marker, &replacement, 1);
                    std::fs::write(&plan_path, updated)?;
                }
            } else {
                eprintln!("[WARN] EPIC plan not found for {epic_id}, skipping");
            }
        }
    }

    Ok(json!({
        "status": "created",
        "ticket_id": ticket_id,
        "path": file_path.display().to_string(),
        "title": title,
        "type": ticket_type,
        "priority": priority,
        "blocked_by": blocked_by,
        "epic": epic,
        "required_expertise": expertise,
    }))
}

// ─── Expert scaffold helpers ──────────────────────────────────────────────────

/// Returns `~/.claude/skills/eket/experts` (or `$EKET_EXPERTS_DIR` override).
pub fn default_experts_dir() -> PathBuf {
    if let Ok(val) = std::env::var("EKET_EXPERTS_DIR") {
        return PathBuf::from(val);
    }
    // Use `dirs` crate (already in workspace deps)
    if let Some(home) = dirs::home_dir() {
        return home.join(".claude/skills/eket/experts");
    }
    // Absolute fallback via $HOME
    if let Ok(home) = std::env::var("HOME") {
        return PathBuf::from(home).join(".claude/skills/eket/experts");
    }
    PathBuf::from(".claude/skills/eket/experts")
}

/// For each tag in `tags` (skipping "any"), check if an expert profile already
/// exists (id contains tag OR domain == tag). If not, write a scaffold .md to
/// `{experts_base}/extended/{tag}.md`. Skips write if file already exists.
/// Returns the list of tags that were newly scaffolded.
pub fn scaffold_missing_experts(tags: &[String], experts_base: &Path) -> Vec<String> {
    // Load existing experts from default + extended dirs (skip if not present)
    let default_dir = experts_base.join("default");
    let extended_dir = experts_base.join("extended");

    let mut dirs_to_load: Vec<(PathBuf, String)> = Vec::new();
    if default_dir.is_dir() {
        dirs_to_load.push((default_dir.clone(), "default".to_string()));
    }
    if extended_dir.is_dir() {
        dirs_to_load.push((extended_dir.clone(), "extended".to_string()));
    }

    let bridge = match ExpertSkillBridge::load_from_dirs(&dirs_to_load) {
        Ok(b) => b,
        Err(e) => {
            eprintln!("[WARN] scaffold_missing_experts: failed to load bridge: {}", e);
            return vec![];
        }
    };

    let all = bridge.all_experts();
    let mut scaffolded = Vec::new();

    for tag in tags {
        if tag == "any" {
            continue;
        }
        // Check if any existing expert matches this tag
        let exists = all.iter().any(|p| {
            p.id.contains(tag.as_str()) || p.domain == *tag
        });
        if exists {
            continue;
        }

        // Ensure extended/ dir exists
        if let Err(e) = std::fs::create_dir_all(&extended_dir) {
            eprintln!("[WARN] scaffold_missing_experts: cannot create {}: {}", extended_dir.display(), e);
            continue;
        }

        let file_path = extended_dir.join(format!("{}.md", tag));
        if file_path.exists() {
            // Already scaffolded previously, skip
            continue;
        }

        // Capitalise tag for display name
        let tag_cap = {
            let mut c = tag.chars();
            match c.next() {
                None => String::new(),
                Some(f) => f.to_uppercase().collect::<String>() + c.as_str(),
            }
        };

        let content = format!(
            r#"```yaml
id: eket.{tag}.scaffold
name: {tag_cap} Expert
name_cn: {tag} 专家
role: {tag_cap} 专家（待完善）
emoji: 🤖
domain: {tag}
tier: extended
skills:
  primary:
    - systematic-debugging
    - test-driven-development
  contextual: []
```

> ⚠ 此文件由 eket 自动生成，请补充完整的专家 persona 设定。
> 参考模板：~/.claude/skills/eket/experts/default/backend.md
"#,
            tag = tag,
            tag_cap = tag_cap,
        );

        match std::fs::write(&file_path, &content) {
            Ok(_) => {
                scaffolded.push(tag.clone());
            }
            Err(e) => {
                eprintln!("[WARN] scaffold_missing_experts: failed to write {}: {}", file_path.display(), e);
            }
        }
    }

    scaffolded
}

// ─── Main ─────────────────────────────────────────────────────────────────────

pub async fn run(args: TaskCreateArgs) -> Result<()> {
    // Initialize DB client (TASK-270)
    let db_client = match EketConfig::load() {
        Ok(config) => {
            match create_pool(&config.sqlite.path) {
                Ok(pool) => Some(SqliteClient::new(pool)),
                Err(e) => {
                    eprintln!("[WARN] Failed to create DB pool: {}", e);
                    None
                }
            }
        }
        Err(e) => {
            eprintln!("[WARN] Failed to load config: {}", e);
            None
        }
    };

    // Resolve type and priority: explicit > inferred from title
    let ticket_type = args.r#type.as_deref().unwrap_or_else(|| infer_type(&args.title)).to_string();
    let priority = args.priority.as_deref().unwrap_or_else(|| infer_priority(&args.title)).to_string();

    // Validate expertise tags (warn on unknown, allow custom)
    const KNOWN_TAGS: &[&str] = &[
        "rust", "node", "python", "go", "java", "frontend",
        "devops", "qa", "docs", "ux", "data", "security", "any",
    ];
    for tag in &args.expertise {
        if !KNOWN_TAGS.contains(&tag.as_str()) {
            eprintln!("[WARN] Unknown expertise tag '{}'. Known: {}", tag, KNOWN_TAGS.join(", "));
        }
    }

    // Auto-scaffold missing expert personas
    let experts_base = default_experts_dir();
    let scaffolded = scaffold_missing_experts(&args.expertise, &experts_base);
    if !scaffolded.is_empty() {
        eprintln!("scaffolded_experts: {:?}", scaffolded);
    }

    // 1. Find tickets dir
    let tickets_dir = find_tickets_dir(args.tickets_dir.clone())?;

    // 2. Parse blocked_by
    let blocked_by = parse_blocked_by(&args.blocked_by);

    // ── Size check ──────────────────────────────────────────────────────────
    if let Some(ref effort_str) = args.effort {
        // Resolve project root from tickets_dir (tickets_dir = <root>/jira/tickets)
        let project_root = tickets_dir
            .parent()
            .and_then(|p| p.parent())
            .map(|p| p.to_path_buf())
            .unwrap_or_else(|| PathBuf::from("."));

        let effort_minutes = match parse_effort(effort_str) {
            Some(m) => m,
            None => {
                eprintln!("[WARN] Cannot parse --effort '{}'. Use formats like: 2d, 0.5d, 3h, 480", effort_str);
                0
            }
        };

        if effort_minutes > 0 {
            let threshold = read_threshold(&project_root);
            let oversized = check_and_warn_size(effort_minutes, threshold);

            if oversized {
                if args.no_interactive {
                    // CI mode: warn only, proceed with single ticket creation
                } else {
                    // Interactive: ask user
                    eprint!("继续创建单张卡？(y/N) ");
                    io::stderr().flush()?;
                    let answer = read_line_trimmed()?;

                    match answer.to_lowercase().as_str() {
                        "y" | "yes" => {
                            // fall through to normal creation below
                        }
                        _ => {
                            // Enter subtask batch mode
                            eprintln!("进入子任务批量创建模式（数量 2-5）");
                            let subtask_titles = interactive_split(2, 5)?;
                            if subtask_titles.is_empty() {
                                return Ok(());
                            }

                            let mut results = Vec::new();
                            for sub_title in &subtask_titles {
                                let report = create_single_ticket(
                                    &tickets_dir,
                                    sub_title,
                                    &ticket_type,
                                    &priority,
                                    &args.assignee,
                                    &[], // subtasks have no blocked_by by default
                                    &args.expertise,
                                    args.epic.as_deref(),
                                    db_client.as_ref(),
                                )
                                .await?;
                                results.push(report);
                            }

                            println!("{}", serde_json::to_string_pretty(&json!({
                                "status": "split_created",
                                "count": results.len(),
                                "tickets": results,
                            }))?);
                            return Ok(());
                        }
                    }
                }
            }
        } // end if effort_minutes > 0
    } // end if let Some(effort_str)

    // ── Single ticket creation ───────────────────────────────────────────────
    let report = create_single_ticket(
        &tickets_dir,
        &args.title,
        &ticket_type,
        &priority,
        &args.assignee,
        &blocked_by,
        &args.expertise,
        args.epic.as_deref(),
        db_client.as_ref(),
    )
    .await?;

    println!("{}", serde_json::to_string_pretty(&report)?);
    Ok(())
}

// ─── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    fn make_args(title: &str, blocked_by: &str, dir: &TempDir) -> TaskCreateArgs {
        TaskCreateArgs {
            title: title.to_string(),
            r#type: Some("feature".to_string()),
            priority: Some("P2".to_string()),
            blocked_by: blocked_by.to_string(),
            assignee: String::new(),
            epic: None,
            expertise: vec!["any".to_string()],
            effort: None,
            no_interactive: false,
            tickets_dir: Some(dir.path().to_path_buf()),
        }
    }

    #[tokio::test]
    async fn basic_create() {
        let dir = TempDir::new().unwrap();
        let args = make_args("My New Ticket", "", &dir);
        run(args).await.unwrap();

        let ticket_path = dir.path().join("TASK-1.md");
        assert!(ticket_path.exists(), "Ticket file should exist");
        let content = fs::read_to_string(&ticket_path).unwrap();
        assert!(content.contains("# TASK-1: My New Ticket"));
        assert!(content.contains("**状态**: todo"));
    }

    #[tokio::test]
    async fn auto_numbering() {
        let dir = TempDir::new().unwrap();
        // Pre-create TASK-5.md
        fs::write(
            dir.path().join("TASK-5.md"),
            "# TASK-5: Existing\n- **状态**: todo\n- blocked_by: []\n",
        )
        .unwrap();

        let args = make_args("Next Ticket", "", &dir);
        run(args).await.unwrap();

        let ticket_path = dir.path().join("TASK-6.md");
        assert!(ticket_path.exists(), "Should create TASK-6");
    }

    #[tokio::test]
    async fn blocked_by_parsed() {
        let dir = TempDir::new().unwrap();
        // Pre-create deps
        fs::write(
            dir.path().join("TASK-1.md"),
            "# TASK-1: Dep1\n- **状态**: todo\n- blocked_by: []\n",
        )
        .unwrap();
        fs::write(
            dir.path().join("TASK-2.md"),
            "# TASK-2: Dep2\n- **状态**: todo\n- blocked_by: []\n",
        )
        .unwrap();

        let args = make_args("Dependent Ticket", "TASK-1,TASK-2", &dir);
        run(args).await.unwrap();

        let ticket_path = dir.path().join("TASK-3.md");
        assert!(ticket_path.exists());
        let content = fs::read_to_string(&ticket_path).unwrap();
        assert!(content.contains("TASK-1"));
        assert!(content.contains("TASK-2"));
        assert!(content.contains("blocked_by: [TASK-1, TASK-2]"));
    }

    #[tokio::test]
    async fn cycle_detection_rejects() {
        let dir = TempDir::new().unwrap();
        let dir2 = TempDir::new().unwrap();
        fs::write(
            dir2.path().join("TASK-1.md"),
            "# TASK-1: A\n- **状态**: todo\n- blocked_by: [TASK-2]\n",
        )
        .unwrap();
        // TASK-2.md doesn't exist yet. We try to create TASK-2 blocked_by TASK-1 → cycle
        let args = make_args("Will Cycle", "TASK-1", &dir2);
        let result = run(args).await;
        assert!(result.is_ok(), "run() itself should not error");
        // File must NOT be created because cycle was detected
        assert!(
            !dir2.path().join("TASK-2.md").exists(),
            "Cycle ticket should not be created"
        );
        // suppress unused warning
        drop(dir);
    }

    #[tokio::test]
    async fn type_inferred_from_title() {
        let dir = TempDir::new().unwrap();
        let args = TaskCreateArgs {
            title: "fix login bug".to_string(),
            r#type: None,
            priority: None,
            blocked_by: String::new(),
            assignee: String::new(),
            epic: None,
            expertise: vec!["any".to_string()],
            effort: None,
            no_interactive: false,
            tickets_dir: Some(dir.path().to_path_buf()),
        };
        run(args).await.unwrap();
        let content = fs::read_to_string(dir.path().join("TASK-1.md")).unwrap();
        assert!(content.contains("**类型**: bugfix"));
        assert!(content.contains("**优先级**: P2"));
    }

    #[tokio::test]
    async fn priority_inferred_from_title() {
        let dir = TempDir::new().unwrap();
        let args = TaskCreateArgs {
            title: "urgent: fix crash".to_string(),
            r#type: None,
            priority: None,
            blocked_by: String::new(),
            assignee: String::new(),
            epic: None,
            expertise: vec!["any".to_string()],
            effort: None,
            no_interactive: false,
            tickets_dir: Some(dir.path().to_path_buf()),
        };
        run(args).await.unwrap();
        let content = fs::read_to_string(dir.path().join("TASK-1.md")).unwrap();
        assert!(content.contains("**优先级**: P0"));
    }

    #[tokio::test]
    async fn effort_below_threshold_no_warn() {
        let dir = TempDir::new().unwrap();
        let args = TaskCreateArgs {
            title: "Small task".to_string(),
            r#type: None,
            priority: None,
            blocked_by: String::new(),
            assignee: String::new(),
            epic: None,
            expertise: vec!["any".to_string()],
            effort: Some("120".to_string()),
            no_interactive: true, // CI mode
            tickets_dir: Some(dir.path().to_path_buf()),
        };
        run(args).await.unwrap();
        assert!(dir.path().join("TASK-1.md").exists());
    }

    #[tokio::test]
    async fn effort_above_threshold_no_interactive_creates() {
        let dir = TempDir::new().unwrap();
        // effort=600 > default 480, but --no-interactive → just warn and create
        let args = TaskCreateArgs {
            title: "Big task".to_string(),
            r#type: None,
            priority: None,
            blocked_by: String::new(),
            assignee: String::new(),
            epic: None,
            expertise: vec!["rust".to_string()],
            effort: Some("600".to_string()),
            no_interactive: true,
            tickets_dir: Some(dir.path().to_path_buf()),
        };
        run(args).await.unwrap();
        // Ticket should still be created despite warning
        assert!(dir.path().join("TASK-1.md").exists());
        let content = fs::read_to_string(dir.path().join("TASK-1.md")).unwrap();
        assert!(content.contains("Big task"));
    }

    #[tokio::test]
    async fn check_and_warn_size_logic() {
        // above threshold → true
        assert!(check_and_warn_size(600, 480));
        // at threshold → false
        assert!(!check_and_warn_size(480, 480));
        // below threshold → false
        assert!(!check_and_warn_size(120, 480));
    }

    #[test]
    fn test_parse_effort() {
        assert_eq!(parse_effort("2d"), Some(960));
        assert_eq!(parse_effort("1d"), Some(480));
        assert_eq!(parse_effort("0.5d"), Some(240));
        assert_eq!(parse_effort("3h"), Some(180));
        assert_eq!(parse_effort("1h"), Some(60));
        assert_eq!(parse_effort("480"), Some(480));
        assert_eq!(parse_effort("0"), Some(0));
        assert_eq!(parse_effort("abc"), None);
        assert_eq!(parse_effort("1.5x"), None);
    }

    #[test]
    fn test_format_effort() {
        assert_eq!(format_effort(480), "1天");
        assert_eq!(format_effort(960), "2天");
        assert_eq!(format_effort(240), "4小时");
        assert_eq!(format_effort(90), "90min");
    }

    #[tokio::test]
    async fn read_threshold_missing_config() {
        let dir = TempDir::new().unwrap();
        // No .eket/config.yml → default 480
        assert_eq!(read_threshold(dir.path()), 480);
    }

    #[tokio::test]
    async fn read_threshold_from_config() {
        let dir = TempDir::new().unwrap();
        let eket_dir = dir.path().join(".eket");
        fs::create_dir_all(&eket_dir).unwrap();
        fs::write(
            eket_dir.join("config.yml"),
            "task_size:\n  warn_minutes: 240\n",
        )
        .unwrap();
        assert_eq!(read_threshold(dir.path()), 240);
    }

    #[test]
    fn scaffold_creates_missing_persona() {
        let tmp = TempDir::new().unwrap();
        let experts_base = tmp.path();

        // Create empty default/ dir; no extended/
        fs::create_dir_all(experts_base.join("default")).unwrap();

        let result = scaffold_missing_experts(&["data-engineer".to_string()], experts_base);
        assert_eq!(result, vec!["data-engineer".to_string()]);

        let scaffold_path = experts_base.join("extended/data-engineer.md");
        assert!(scaffold_path.exists(), "scaffold file should be created");

        let content = fs::read_to_string(&scaffold_path).unwrap();
        assert!(content.contains("id: eket.data-engineer.scaffold"), "content should contain scaffold id");

        // Second call must NOT overwrite the file
        let original_content = content.clone();
        // Mutate file so we can detect overwrite
        fs::write(&scaffold_path, "MODIFIED").unwrap();
        let result2 = scaffold_missing_experts(&["data-engineer".to_string()], experts_base);
        // File already exists → skip → empty returned list
        assert!(result2.is_empty(), "should not scaffold again");
        let after = fs::read_to_string(&scaffold_path).unwrap();
        assert_eq!(after, "MODIFIED", "file should not be overwritten");
        drop(original_content);
    }

    #[test]
    fn scaffold_skips_existing_persona() {
        let tmp = TempDir::new().unwrap();
        let experts_base = tmp.path();
        let default_dir = experts_base.join("default");
        fs::create_dir_all(&default_dir).unwrap();

        // Write a real-looking expert md with domain: rust
        let rust_md = r#"```yaml
id: eket.rust.001
name: Rust Expert
name_cn: Rust 专家
role: Rust 工程师
emoji: 🦀
domain: rust
tier: default
skills:
  primary:
    - systems-programming
  contextual: []
```
"#;
        fs::write(default_dir.join("rust.md"), rust_md).unwrap();

        let result = scaffold_missing_experts(&["rust".to_string()], experts_base);
        assert!(result.is_empty(), "should skip existing persona");
        assert!(
            !experts_base.join("extended/rust.md").exists(),
            "extended/rust.md should NOT be created"
        );
    }
}
