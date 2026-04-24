/// task:create — create a new ticket with cycle detection
///
/// 核心流程：
/// 1. 找到 tickets 目录
/// 2. 计算下一个 TASK-NNN 编号
/// 3. 解析 blocked_by 列表
/// 4. 环检测（若有依赖）
/// 5. 生成 ticket markdown，原子写文件
/// 6. 输出 JSON
use anyhow::Result;
use clap::Parser;
use eket_core::dag::{detect_cycle, parse_tickets_dag, DagEdge, DagNode};
use serde_json::json;
use std::fs::OpenOptions;
use std::io::Write as IoWrite;
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

    format!(
        r#"# {ticket_id}: {title}

## 元数据
- **状态**: todo
- **类型**: {ticket_type}
- **优先级**: {priority}
- **负责人**: {assignee_display}
- **创建时间**: {date}
- **依赖**: {deps_display}
- blocked_by: [{blocked_by_comma}]

## 背景

（待填写）

## 验收标准

- [ ] （待填写）

## 技术方案

（待填写）
"#
    )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

pub async fn run(args: TaskCreateArgs) -> Result<()> {
    // Resolve type and priority: explicit > inferred from title
    let ticket_type = args.r#type.as_deref().unwrap_or_else(|| infer_type(&args.title)).to_string();
    let priority = args.priority.as_deref().unwrap_or_else(|| infer_priority(&args.title)).to_string();

    // 1. Find tickets dir
    let tickets_dir = find_tickets_dir(args.tickets_dir)?;

    // 2. Compute next ID
    let ticket_id = next_ticket_id(&tickets_dir)?;

    // 3. Parse blocked_by
    let blocked_by = parse_blocked_by(&args.blocked_by);

    // 4. Cycle detection
    if !blocked_by.is_empty() {
        let mut dag = parse_tickets_dag(&tickets_dir);
        // Add new node and edges to the DAG
        dag.nodes.push(DagNode {
            id: ticket_id.clone(),
            label: args.title.clone(),
            status: "todo".to_string(),
            assignee: None,
        });
        for dep in &blocked_by {
            dag.edges.push(DagEdge {
                source: ticket_id.clone(),
                target: dep.clone(),
            });
        }
        if let Some(cycle_nodes) = detect_cycle(&dag) {
            let cycle_str = cycle_nodes.join(" -> ");
            println!(
                "{}",
                serde_json::to_string_pretty(&json!({
                    "status": "error",
                    "error": format!("cycle detected: {}", cycle_str)
                }))?
            );
            return Ok(());
        }
    }

    // 5. Generate content
    let content = build_ticket_content(
        &ticket_id,
        &args.title,
        &ticket_type,
        &priority,
        &args.assignee,
        &blocked_by,
    );

    // 6. Atomic write (create_new = concurrent-safe)
    let file_path = tickets_dir.join(format!("{}.md", ticket_id));
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&file_path)
        .map_err(|e| anyhow::anyhow!("Failed to create ticket file {}: {}", file_path.display(), e))?;
    file.write_all(content.as_bytes())?;

    // 7. Output JSON
    let report = json!({
        "status": "created",
        "ticket_id": ticket_id,
        "path": file_path.display().to_string(),
        "title": args.title,
        "type": ticket_type,
        "priority": priority,
        "blocked_by": blocked_by,
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

    fn make_args(title: &str, blocked_by: &str, dir: &TempDir) -> TaskCreateArgs {
        TaskCreateArgs {
            title: title.to_string(),
            r#type: Some("feature".to_string()),
            priority: Some("P2".to_string()),
            blocked_by: blocked_by.to_string(),
            assignee: String::new(),
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
        // TASK-1 depends on TASK-2, TASK-2 depends on TASK-1 (cycle when we try to create TASK-2 → TASK-1)
        // Create TASK-1 that depends on TASK-3 (future), then TASK-2 depending on TASK-1,
        // then try TASK-3 depending on TASK-2 → cycle: TASK-1 → TASK-3 → TASK-2 → TASK-1
        fs::write(
            dir.path().join("TASK-1.md"),
            "# TASK-1: A\n- **状态**: todo\n- blocked_by: [TASK-2]\n",
        )
        .unwrap();
        fs::write(
            dir.path().join("TASK-2.md"),
            "# TASK-2: B\n- **状态**: todo\n- blocked_by: []\n",
        )
        .unwrap();

        // Now try to create TASK-3 that TASK-2 blocks_by TASK-3 would form: TASK-1 → TASK-2 and new TASK-3 → TASK-1, creating no cycle
        // Actually let's do direct: TASK-2 depends on something that depends on TASK-2
        // TASK-1 depends on TASK-2; create new ticket depending on TASK-1 → forms TASK-NEW → TASK-1 → TASK-2 (no cycle)
        // For a real cycle: create TASK-2 already depends on new ticket (impossible as new ticket not created yet)
        // Best approach: TASK-1 blocked_by TASK-2, TASK-2 blocked_by TASK-1 (already in files)
        // Re-setup:
        let dir2 = TempDir::new().unwrap();
        fs::write(
            dir2.path().join("TASK-1.md"),
            "# TASK-1: A\n- **状态**: todo\n- blocked_by: [TASK-2]\n",
        )
        .unwrap();
        // TASK-2.md doesn't exist yet. We try to create TASK-2 blocked_by TASK-1 → cycle: TASK-1→TASK-2→TASK-1
        let args = make_args("Will Cycle", "TASK-1", &dir2);
        // Capture stdout by running directly
        // We expect cycle detection; run should succeed (no panic) but print error JSON
        // We'll test by checking the output indirectly: TASK-2.md should NOT be created
        let result = run(args).await;
        assert!(result.is_ok(), "run() itself should not error");
        // File must NOT be created because cycle was detected
        assert!(
            !dir2.path().join("TASK-2.md").exists(),
            "Cycle ticket should not be created"
        );
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
            tickets_dir: Some(dir.path().to_path_buf()),
        };
        run(args).await.unwrap();
        let content = fs::read_to_string(dir.path().join("TASK-1.md")).unwrap();
        assert!(content.contains("**优先级**: P0"));
    }
}
