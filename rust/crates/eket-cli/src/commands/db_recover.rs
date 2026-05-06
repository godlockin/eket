//! TASK-273: DB ↔ MD 双向同步恢复机制
//!
//! `eket db:recover --from-md` — 从 MD 文件批量恢复 DB 记录

use anyhow::{Context, Result};
use clap::Args;
use glob::glob;
use regex::Regex;
use std::fs;
use std::path::PathBuf;

use eket_core::config::EketConfig;
use eket_core::db::{create_pool, SqliteClient};

#[derive(Debug, Args)]
pub struct DbRecoverArgs {
    /// 恢复方向：from-md（从 MD 恢复到 DB）
    #[arg(long, default_value = "from-md")]
    from: String,

    /// Tickets 目录路径（默认：jira/tickets）
    #[arg(long)]
    tickets_dir: Option<PathBuf>,

    /// Dry-run 模式：只打印将恢复的内容，不写入 DB
    #[arg(long)]
    dry_run: bool,
}

/// 从 MD 文件解析的 ticket 元数据
#[derive(Debug)]
struct TicketMetadata {
    id: String,
    title: String,
    status: String,
    priority: u8,
    ticket_type: String,
    assignee: Option<String>,
    created_at: Option<String>,
}

/// 归一化状态字符串
fn normalize_status(raw: &str) -> &'static str {
    let lower = raw.to_lowercase();
    let trimmed = lower.trim();

    // done 类
    if trimmed.contains("done") || trimmed.contains("完成") || trimmed.contains("✅") {
        return "done";
    }
    // in_progress 类
    if trimmed.contains("progress") || trimmed == "wip" || trimmed == "pr_review" {
        return "in_progress";
    }
    // blocked
    if trimmed.contains("blocked") {
        return "blocked";
    }
    // review
    if trimmed.contains("review") {
        return "review";
    }
    // 默认 todo（包含 ready/backlog/等待中等）
    "todo"
}

/// 解析优先级字符串：P0/P1/P2 → 0/1/2
fn parse_priority(raw: &str) -> u8 {
    let s = raw.trim().to_uppercase();
    if s.contains("P0") || s.contains("紧急") {
        0
    } else if s.contains("P1") || s.contains("高") {
        1
    } else if s.contains("P2") || s.contains("中") {
        2
    } else {
        3 // P3/低优先级
    }
}

/// 从 MD 文件解析 ticket 元数据
///
/// 支持两种格式：
/// 1. YAML front-matter（优先）
/// 2. Markdown list（兼容历史格式）
fn parse_ticket_md(path: &PathBuf) -> Result<TicketMetadata> {
    let content = fs::read_to_string(path)
        .with_context(|| format!("Failed to read ticket file: {}", path.display()))?;

    // 提取 ticket ID（从文件名）
    let filename = path
        .file_stem()
        .and_then(|s| s.to_str())
        .context("Invalid filename")?;
    let ticket_id = filename.to_string();

    // 提取标题（第一个 # 行）
    let title_re = Regex::new(r"^#\s*(.+)$").unwrap();
    let title = content
        .lines()
        .find_map(|line| title_re.captures(line))
        .and_then(|cap| cap.get(1))
        .map(|m| m.as_str().trim().to_string())
        .unwrap_or_else(|| ticket_id.clone());

    // 解析元数据区块（支持多种格式）
    let status = extract_field(&content, &["状态", "status"]).unwrap_or_else(|| "todo".to_string());
    let priority_str = extract_field(&content, &["优先级", "priority"]).unwrap_or_else(|| "P2".to_string());
    let ticket_type = extract_field(&content, &["类型", "type"]).unwrap_or_else(|| "feature".to_string());
    let assignee = extract_field(&content, &["负责人", "assignee"]);
    let created_at = extract_field(&content, &["创建时间", "created_at"]);

    Ok(TicketMetadata {
        id: ticket_id,
        title: title
            .trim_start_matches("TASK-")
            .trim_start_matches("FEAT-")
            .trim_start_matches("FIX-")
            .split(':')
            .nth(1)
            .unwrap_or(&title)
            .trim()
            .to_string(),
        status: normalize_status(&status).to_string(),
        priority: parse_priority(&priority_str),
        ticket_type: ticket_type.to_string(),
        assignee,
        created_at,
    })
}

/// 提取元数据字段（支持 `- **key**: value` 和 `**key**: value` 格式）
fn extract_field(content: &str, keys: &[&str]) -> Option<String> {
    for key in keys {
        // 格式 1: - **key**: value
        let pattern1 = format!(r"(?m)^-?\s*\*\*{}\*\*:\s*(.+)$", regex::escape(key));
        if let Ok(re) = Regex::new(&pattern1) {
            if let Some(cap) = re.captures(content) {
                if let Some(val) = cap.get(1) {
                    return Some(val.as_str().trim().to_string());
                }
            }
        }

        // 格式 2: key: value （YAML front-matter）
        let pattern2 = format!(r"(?m)^{}: (.+)$", regex::escape(key));
        if let Ok(re) = Regex::new(&pattern2) {
            if let Some(cap) = re.captures(content) {
                if let Some(val) = cap.get(1) {
                    return Some(val.as_str().trim().to_string());
                }
            }
        }
    }
    None
}

pub async fn run(args: DbRecoverArgs) -> Result<()> {
    if args.from != "from-md" {
        anyhow::bail!("目前仅支持 --from=from-md");
    }

    // 1. 确定 tickets 目录
    let tickets_dir = if let Some(dir) = args.tickets_dir {
        dir
    } else {
        let mut path = std::env::current_dir()?;
        path.push("jira");
        path.push("tickets");
        path
    };

    if !tickets_dir.exists() {
        anyhow::bail!("Tickets 目录不存在: {}", tickets_dir.display());
    }

    // 2. 初始化 DB 客户端（非 dry-run 时）
    let db_client = if args.dry_run {
        None
    } else {
        match EketConfig::load() {
            Ok(config) => match create_pool(&config.sqlite.path) {
                Ok(pool) => Some(SqliteClient::new(pool)),
                Err(e) => {
                    eprintln!("[WARN] Failed to create DB pool: {}", e);
                    None
                }
            },
            Err(e) => {
                eprintln!("[WARN] Failed to load config: {}", e);
                None
            }
        }
    };

    // 3. Glob 扫描 TASK-*.md
    let pattern = tickets_dir.join("TASK-*.md");
    let pattern_str = pattern.to_str().context("Invalid pattern")?;

    let mut total = 0;
    let mut success = 0;
    let mut failed = 0;

    println!("🔍 扫描 MD 文件：{}", pattern_str);

    for entry in glob(pattern_str)? {
        match entry {
            Ok(path) => {
                total += 1;
                match parse_ticket_md(&path) {
                    Ok(ticket) => {
                        if args.dry_run {
                            println!(
                                "  [DRY-RUN] {} | {} | {} | P{}",
                                ticket.id, ticket.status, ticket.ticket_type, ticket.priority
                            );
                            success += 1;
                        } else if let Some(ref db) = db_client {
                            // 写入 DB
                            let priority_str = format!("P{}", ticket.priority);
                            match db.create_ticket_with_source(
                                &ticket.id,
                                &ticket.title,
                                &priority_str,
                                &ticket.ticket_type,
                                "bulk", // source = bulk for recovery
                            ) {
                                Ok(_) => {
                                    // 更新状态（create_ticket_with_source 只创建，状态需单独更新）
                                    if ticket.status != "todo" {
                                        let _ = db.update_ticket_status_str(&ticket.id, &ticket.status);
                                    }
                                    success += 1;
                                }
                                Err(e) => {
                                    eprintln!("  ❌ {} 写入失败: {}", ticket.id, e);
                                    failed += 1;
                                }
                            }
                        }
                    }
                    Err(e) => {
                        eprintln!("  ⚠️  {} 解析失败: {}", path.display(), e);
                        failed += 1;
                    }
                }
            }
            Err(e) => {
                eprintln!("  ⚠️  Glob 错误: {}", e);
                failed += 1;
            }
        }
    }

    // 4. 输出统计
    println!("\n📊 恢复结果：");
    println!("  - 总计扫描：{} 个文件", total);
    println!("  - 成功：{}", success);
    println!("  - 失败：{}", failed);

    if args.dry_run {
        println!("\n💡 Dry-run 模式，未写入 DB。移除 --dry-run 执行实际恢复。");
    } else {
        println!("\n✅ DB 恢复完成！");
    }

    Ok(())
}
