/// memory:review — Knowledge Curator 质量门
///
/// 评审写入 confluence/memory/ 的知识条目，判定：
///   ACCEPT  → 入库，写 frontmatter review_status
///   REVISE  → 给出具体修改意见，阻断，Slaver 改完后重提
///   REJECT  → 说明原因，阻断
///
/// 调用方式：
///   eket memory:review confluence/memory/pitfalls/xxx.md [--ticket TASK-NNN]
///   eket memory:review --ticket TASK-NNN   (自动从 ticket 知识沉淀 section 找文件)
use anyhow::{bail, Result};
use clap::Args;
use serde_json::json;
use std::path::{Path, PathBuf};

#[derive(Args, Debug)]
pub struct MemoryReviewArgs {
    /// 要评审的 memory 文件路径（相对或绝对）
    #[arg(value_name = "FILE")]
    pub file: Option<String>,

    /// 关联的 ticket ID（用于写回评审结论）
    #[arg(long)]
    pub ticket: Option<String>,

    /// 仅做结构校验，不做内容质量评审（快速模式）
    #[arg(long)]
    pub structure_only: bool,
}

// ─── 评审结论 ────────────────────────────────────────────────────────────────

#[derive(Debug, PartialEq)]
#[allow(dead_code)]
pub enum ReviewVerdict {
    Accept,
    Revise(Vec<String>), // 具体修改意见列表
    Reject(String),      // 拒绝原因
}

// ─── 结构校验 ────────────────────────────────────────────────────────────────

struct StructureCheck {
    has_title: bool,
    has_scene: bool,       // 场景/症状
    has_solution: bool,    // 方案/解法/根因
    has_proof: bool,       // Execution Proof (frontmatter proof: 或 TASK- 引用)
    has_source: bool,      // 来源：TASK-XXX
    word_count: usize,
}

fn check_structure(content: &str) -> StructureCheck {
    let lower = content.to_lowercase();
    StructureCheck {
        has_title: content.lines().any(|l| l.starts_with('#')),
        has_scene: lower.contains("场景") || lower.contains("症状") || lower.contains("when") || lower.contains("问题"),
        has_solution: lower.contains("方案") || lower.contains("解法") || lower.contains("根因")
            || lower.contains("solution") || lower.contains("fix") || lower.contains("如何"),
        has_proof: content.contains("proof:") || content.contains("exit_code")
            || (content.contains("TASK-") && content.contains("timestamp")),
        has_source: content.contains("来源") || content.contains("source") || content.contains("TASK-"),
        word_count: content.split_whitespace().count(),
    }
}

// ─── 内容质量评审（Knowledge Curator prompt） ───────────────────────────────

/// 生成给 Claude/LLM 的 curator prompt。
/// 在 eket 框架里，task:complete 触发时 Claude 自身就是执行环境，
/// 所以这里输出 prompt 文本 + 结构化评分项，让 Claude 直接评审。
pub fn build_curator_prompt(file_path: &str, content: &str, ticket_id: Option<&str>) -> String {
    let ticket_ref = ticket_id
        .map(|t| format!("关联 Ticket：{t}\n"))
        .unwrap_or_default();

    format!(r#"
# Knowledge Curator 评审任务

你是 EKET 框架的知识策展专家（Knowledge Curator）。
你的职责是评审写入知识库的条目，确保每一条沉淀都有复利价值。

{ticket_ref}评审文件：{file_path}

---

## 待评审内容

{content}

---

## 评审维度（每项 0-10 分）

1. **有效性**（accuracy）
   - 内容是否准确？结论有没有经过实际验证？
   - 有没有 Execution Proof（exit_code / timestamp / tool_name）？
   - 扣分：纯推测、没有验证的结论、缺少 proof

2. **价值密度**（density）
   - 信息是否足够精炼？有没有废话/重复/显而易见的内容？
   - 扣分：流水账式记录、过于具体导致无法泛化

3. **复利潜力**（compounding）
   - 这条知识能帮助未来 Slaver 避开多大的坑，或节省多少时间？
   - 它是只适用于这个 ticket 的特例，还是框架级可复用的规律？
   - 扣分：只描述了 what happened 而没有 why 和 how to avoid

---

## 输出格式（严格按此格式）

```
VERDICT: ACCEPT | REVISE | REJECT

SCORES:
  有效性: X/10
  价值密度: X/10
  复利潜力: X/10
  综合: X/10

ISSUES:
  - [issue1]
  - [issue2]（无问题时写"无"）

SUGGESTIONS:
  - [具体修改建议，精确到段落或句子]（仅 REVISE 时填写）

REASON:
  [一句话总结判定原因]
```

判定规则：
- 综合分 ≥ 7 → ACCEPT
- 综合分 5-6，有明确可改进项 → REVISE
- 综合分 < 5，或有效性 < 5 → REJECT
"#, ticket_ref = ticket_ref, file_path = file_path, content = content)
}

// ─── 解析 curator 输出 ───────────────────────────────────────────────────────

#[allow(dead_code)]
pub fn parse_curator_output(output: &str) -> ReviewVerdict {
    let verdict_line = output.lines()
        .find(|l| l.starts_with("VERDICT:"))
        .unwrap_or("VERDICT: REVISE");

    if verdict_line.contains("ACCEPT") {
        return ReviewVerdict::Accept;
    }

    // 提取 ISSUES + SUGGESTIONS
    let mut issues = Vec::new();
    let mut in_section = false;
    for line in output.lines() {
        if line.starts_with("ISSUES:") || line.starts_with("SUGGESTIONS:") {
            in_section = true;
            continue;
        }
        if in_section && line.starts_with("  - ") {
            let item = line.trim_start_matches("  - ").trim().to_string();
            if item != "无" && !item.is_empty() {
                issues.push(item);
            }
        }
        if in_section && (line.starts_with("REASON:") || line.starts_with("SCORES:")) {
            // next section
            if !issues.is_empty() { in_section = false; }
        }
    }

    let reason = output.lines()
        .skip_while(|l| !l.starts_with("REASON:"))
        .nth(1)
        .unwrap_or("内容质量不足")
        .trim()
        .to_string();

    if verdict_line.contains("REJECT") {
        ReviewVerdict::Reject(reason)
    } else {
        ReviewVerdict::Revise(if issues.is_empty() { vec![reason] } else { issues })
    }
}

// ─── frontmatter 写回 ────────────────────────────────────────────────────────

pub fn stamp_reviewed(file_path: &Path, verdict: &ReviewVerdict, ticket_id: Option<&str>) -> Result<()> {
    let content = std::fs::read_to_string(file_path)?;

    let status = match verdict {
        ReviewVerdict::Accept => "accepted",
        ReviewVerdict::Revise(_) => "needs_revision",
        ReviewVerdict::Reject(_) => "rejected",
    };
    let timestamp = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string();
    let ticket_ref = ticket_id.unwrap_or("-");

    // 如果已有 frontmatter (---) 则插入字段，否则在文件头加 frontmatter
    let stamped = if content.starts_with("---") {
        // 在第一个 --- 之后、第二个 --- 之前插入
        let end = content[3..].find("---").map(|i| i + 6).unwrap_or(content.len());
        let (front, rest) = content.split_at(end);
        let insert = format!(
            "review_status: {status}\nreview_ticket: {ticket_ref}\nreviewed_at: {timestamp}\n"
        );
        // 找到 frontmatter 结束位置（第二个 ---）并插入
        if let Some(pos) = front.rfind("---") {
            format!("{}{insert}{}", &front[..pos], &content[pos..])
        } else {
            format!("---\n{insert}---\n{rest}")
        }
    } else {
        format!("---\nreview_status: {status}\nreview_ticket: {ticket_ref}\nreviewed_at: {timestamp}\n---\n{content}")
    };

    std::fs::write(file_path, stamped)?;
    Ok(())
}

// ─── ticket 写回 ─────────────────────────────────────────────────────────────

pub fn stamp_ticket(tickets_dir: &Path, ticket_id: &str, verdict: &ReviewVerdict, file_name: &str) {
    let ticket_path = tickets_dir.join(format!("{ticket_id}.md"));
    let Ok(content) = std::fs::read_to_string(&ticket_path) else { return };

    let icon = match verdict {
        ReviewVerdict::Accept => "✅",
        ReviewVerdict::Revise(_) => "⚠️",
        ReviewVerdict::Reject(_) => "❌",
    };
    let date = chrono::Utc::now().format("%Y-%m-%d").to_string();
    let annotation = format!("\n> 知识审核 {icon} Curator {date} — `{file_name}`\n");

    // 追加到 ## 知识沉淀 section 下方
    let updated = if let Some(pos) = content.find("## 知识沉淀") {
        let after = &content[pos..];
        let insert_at = pos + after.find('\n').unwrap_or(after.len()) + 1;
        format!("{}{annotation}{}", &content[..insert_at], &content[insert_at..])
    } else {
        format!("{content}{annotation}")
    };

    let _ = std::fs::write(&ticket_path, updated);
}

// ─── main run ────────────────────────────────────────────────────────────────

pub async fn run(args: MemoryReviewArgs) -> Result<()> {
    let project_root = find_project_root().unwrap_or_else(|| std::env::current_dir().unwrap());
    let tickets_dir = project_root.join("jira/tickets");

    // 解析目标文件
    let file_path: PathBuf = match &args.file {
        Some(f) => {
            let p = PathBuf::from(f);
            if p.is_absolute() { p } else { project_root.join(f) }
        }
        None => {
            // 从 ticket 知识沉淀 section 自动找文件
            let ticket_id = args.ticket.as_deref()
                .ok_or_else(|| anyhow::anyhow!("需要指定 FILE 或 --ticket <ID>"))?;
            let ticket_path = tickets_dir.join(format!("{ticket_id}.md"));
            let ticket_content = std::fs::read_to_string(&ticket_path)
                .map_err(|_| anyhow::anyhow!("找不到 ticket: {ticket_id}"))?;
            extract_memory_file_from_ticket(&ticket_content, &project_root)
                .ok_or_else(|| anyhow::anyhow!("ticket 中未找到 confluence/memory/ 文件引用"))?
        }
    };

    if !file_path.exists() {
        bail!("文件不存在：{}", file_path.display());
    }

    let content = std::fs::read_to_string(&file_path)?;
    let file_name = file_path.file_name().and_then(|n| n.to_str()).unwrap_or("unknown");
    let rel_path = file_path.strip_prefix(&project_root)
        .map(|p| p.display().to_string())
        .unwrap_or_else(|_| file_path.display().to_string());

    // ── 结构校验 ──────────────────────────────────────────────────────────────
    let structure = check_structure(&content);
    let mut struct_issues: Vec<String> = Vec::new();

    if !structure.has_title    { struct_issues.push("缺少标题（# 开头）".to_string()); }
    if !structure.has_scene    { struct_issues.push("缺少场景/症状描述".to_string()); }
    if !structure.has_solution { struct_issues.push("缺少方案/解法/根因".to_string()); }
    if !structure.has_proof    { struct_issues.push("缺少 Execution Proof（proof: frontmatter 或 timestamp+exit_code）".to_string()); }
    if !structure.has_source   { struct_issues.push("缺少来源 TASK-ID 引用".to_string()); }
    if structure.word_count < 30 { struct_issues.push(format!("内容过于简短（{} 词，建议 ≥30）", structure.word_count)); }

    if !struct_issues.is_empty() {
        let report = json!({
            "verdict": "REVISE",
            "reason": "结构不完整",
            "issues": struct_issues,
            "file": rel_path,
            "next_step": format!("修复上述问题后重新提交：eket memory:review {rel_path}{}",
                args.ticket.as_deref().map(|t| format!(" --ticket {t}")).unwrap_or_default())
        });
        println!("{}", serde_json::to_string_pretty(&report)?);

        // 写 frontmatter
        let _ = stamp_reviewed(&file_path, &ReviewVerdict::Revise(struct_issues.clone()),
                               args.ticket.as_deref());
        if let Some(ref tid) = args.ticket {
            stamp_ticket(&tickets_dir, tid,
                         &ReviewVerdict::Revise(struct_issues), file_name);
        }
        bail!("memory:review REVISE — 结构不完整，请修复后重提");
    }

    if args.structure_only {
        let report = json!({ "verdict": "ACCEPT", "reason": "结构完整", "file": rel_path });
        println!("{}", serde_json::to_string_pretty(&report)?);
        return Ok(());
    }

    // ── 内容质量评审：输出 Curator prompt 供执行环境（Claude）评审 ───────────
    // 在 CLI 模式下，输出 prompt + 说明，让调用者（Claude Code session）执行评审
    // task:complete 的 Saga 中会捕获此输出并触发 Claude 自评
    let prompt = build_curator_prompt(&rel_path, &content, args.ticket.as_deref());

    // 输出结构化指令，task:complete 会识别 CURATOR_REVIEW_NEEDED 标记
    println!("CURATOR_REVIEW_NEEDED");
    println!("FILE: {rel_path}");
    println!("TICKET: {}", args.ticket.as_deref().unwrap_or("-"));
    println!("---PROMPT_START---");
    println!("{prompt}");
    println!("---PROMPT_END---");

    Ok(())
}

// ─── 从 ticket 提取 memory 文件引用 ──────────────────────────────────────────

fn extract_memory_file_from_ticket(ticket_content: &str, project_root: &Path) -> Option<PathBuf> {
    // 找 ## 知识沉淀 section，提取第一个 confluence/memory/ 路径引用
    let section_start = ticket_content.find("## 知识沉淀")?;
    let section = &ticket_content[section_start..];
    for line in section.lines() {
        if line.contains("confluence/memory/") {
            // 提取路径（支持 markdown link 格式和纯路径）
            let path_str = if line.contains('(') {
                line.split('(').nth(1)?.split(')').next()?
            } else {
                line.split_whitespace()
                    .find(|w| w.contains("confluence/memory/"))?
            };
            let path = project_root.join(path_str.trim_matches('`'));
            if path.exists() { return Some(path); }
        }
    }
    None
}

fn find_project_root() -> Option<PathBuf> {
    let mut dir = std::env::current_dir().ok()?;
    loop {
        if dir.join("jira/tickets").exists() && dir.join(".eket").exists() {
            return Some(dir);
        }
        if !dir.pop() { break; }
    }
    None
}
