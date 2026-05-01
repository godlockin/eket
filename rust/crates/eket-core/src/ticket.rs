/// Ticket file reader/writer — 对应 TS: jira/tickets/*.md 文件操作
///
/// 读取 markdown ticket 文件中的元数据字段（**状态**: xxx 格式）
/// 用于 task:claim 和 task:complete 命令
use std::path::{Path, PathBuf};

use crate::error::{EketError, EketResult};
use crate::types::TicketStatus;

// ─── TicketFile ───────────────────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct TicketFile {
    pub path: PathBuf,
    pub id: String,
    pub title: String,
    pub status: TicketStatus,
    pub priority: String,
    pub assignee: Option<String>,
    /// Ticket type: feature / bug / refactor / chore
    pub ticket_type: Option<String>,
    pub raw: String,
}

impl TicketFile {
    /// 从文件路径解析 ticket
    pub fn read(path: impl AsRef<Path>) -> EketResult<Self> {
        let path = path.as_ref();
        let raw = std::fs::read_to_string(path)
            .map_err(EketError::Io)?;

        let id = path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_string();

        let title = extract_field(&raw, "title")
            .or_else(|| extract_h1_title(&raw))
            .unwrap_or_else(|| id.clone());

        let status = extract_field(&raw, "状态")
            .or_else(|| extract_field(&raw, "status"))
            .as_deref()
            .map(parse_status)
            .unwrap_or(TicketStatus::Todo);

        let priority = extract_field(&raw, "优先级")
            .or_else(|| extract_field(&raw, "priority"))
            .unwrap_or_else(|| "P2".to_string());

        let assignee = extract_field(&raw, "负责人")
            .or_else(|| extract_field(&raw, "assignee"))
            .filter(|s| s != "待领取" && !s.is_empty());

        let ticket_type = extract_field(&raw, "类型")
            .or_else(|| extract_field(&raw, "type"))
            .filter(|s| !s.is_empty());

        Ok(Self { path: path.to_path_buf(), id, title, status, priority, assignee, ticket_type, raw })
    }

    /// 更新 ticket 文件中的 **状态** 字段（原子写）
    pub fn set_status(&mut self, status: TicketStatus, assignee: Option<&str>) -> EketResult<()> {
        let status_str = match status {
            TicketStatus::Todo => "todo",
            TicketStatus::InProgress => "in_progress",
            TicketStatus::Review => "review",
            TicketStatus::Done => "done",
            TicketStatus::Blocked => "blocked",
            TicketStatus::Cancelled => "cancelled",
        };

        // Replace **状态**: xxx
        let new_raw = regex_replace(
            &self.raw,
            r"\*\*状态\*\*:\s*\S+",
            &format!("**状态**: {status_str}"),
        );

        // Replace **负责人**: xxx if assignee provided
        let new_raw = if let Some(a) = assignee {
            regex_replace(
                &new_raw,
                r"\*\*负责人\*\*:\s*.*",
                &format!("**负责人**: {a}"),
            )
        } else {
            new_raw
        };

        // Atomic write: tmp → rename
        let tmp = self.path.with_extension("md.tmp");
        std::fs::write(&tmp, &new_raw).map_err(EketError::Io)?;
        std::fs::rename(&tmp, &self.path).map_err(EketError::Io)?;

        self.raw = new_raw;
        self.status = status;
        if let Some(a) = assignee {
            self.assignee = Some(a.to_string());
        }
        Ok(())
    }
}

// ─── Scanner ──────────────────────────────────────────────────────────────────

/// 扫描 tickets 目录，返回所有 todo 状态的 ticket（按优先级排序）
pub fn scan_todo_tickets(tickets_dir: impl AsRef<Path>) -> EketResult<Vec<TicketFile>> {
    let dir = tickets_dir.as_ref();
    if !dir.exists() {
        return Ok(vec![]);
    }

    let mut tickets = Vec::new();

    for entry in std::fs::read_dir(dir).map_err(EketError::Io)? {
        let entry = entry.map_err(EketError::Io)?;
        let path = entry.path();
        if path.extension().map(|e| e == "md").unwrap_or(false) {
            if let Ok(ticket) = TicketFile::read(&path) {
                if ticket.status == TicketStatus::Todo && ticket.assignee.is_none() {
                    tickets.push(ticket);
                }
            }
        }
    }

    // Sort: P0 > P1 > P2, then by ticket number ascending
    tickets.sort_by(|a, b| {
        priority_order(&a.priority)
            .cmp(&priority_order(&b.priority))
            .then(ticket_number(&a.id).cmp(&ticket_number(&b.id)))
    });

    Ok(tickets)
}

/// 按 ticketId 查找 ticket 文件（在 jira/tickets/ 下）
pub fn find_ticket(tickets_dir: impl AsRef<Path>, ticket_id: &str) -> EketResult<TicketFile> {
    let path = tickets_dir.as_ref().join(format!("{ticket_id}.md"));
    if path.exists() {
        return TicketFile::read(&path);
    }
    Err(EketError::NotFound(format!("Ticket {ticket_id} not found")))
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

fn extract_field(content: &str, field: &str) -> Option<String> {
    // Match: **field**: value  OR  - **field**: value
    for line in content.lines() {
        let trimmed = line.trim().trim_start_matches("- ");
        let prefix = format!("**{field}**:");
        if let Some(rest) = trimmed.strip_prefix(&prefix) {
            let val = rest.trim().to_string();
            if !val.is_empty() {
                return Some(val);
            }
        }
    }
    None
}

fn extract_h1_title(content: &str) -> Option<String> {
    // Match: # TASK-XXX: Title
    for line in content.lines() {
        if let Some(rest) = line.strip_prefix("# ") {
            // Strip ticket ID prefix if present: "TASK-123: Title" → "Title"
            let title = if let Some(colon) = rest.find(": ") {
                rest[colon + 2..].trim().to_string()
            } else {
                rest.trim().to_string()
            };
            if !title.is_empty() {
                return Some(title);
            }
        }
    }
    None
}

fn parse_status(s: &str) -> TicketStatus {
    match s.to_lowercase().trim() {
        "todo" => TicketStatus::Todo,
        "in_progress" | "in progress" | "doing" => TicketStatus::InProgress,
        "review" => TicketStatus::Review,
        "done" | "completed" => TicketStatus::Done,
        "blocked" => TicketStatus::Blocked,
        "cancelled" | "canceled" => TicketStatus::Cancelled,
        _ => TicketStatus::Todo,
    }
}

fn priority_order(p: &str) -> u8 {
    match p.to_uppercase().trim() {
        "P0" => 0,
        "P1" => 1,
        _ => 2, // P2 and unknown
    }
}

fn ticket_number(id: &str) -> u32 {
    // Extract numeric part: "TASK-123" → 123, "TASK-123a" → 123
    id.chars()
        .skip_while(|c| !c.is_ascii_digit())
        .take_while(|c| c.is_ascii_digit())
        .collect::<String>()
        .parse()
        .unwrap_or(u32::MAX)
}

fn regex_replace(input: &str, pattern: &str, replacement: &str) -> String {
    // Simple line-by-line replacement (avoid regex dep overhead)
    // Pattern is used as a suffix-stripped prefix match
    let lines: Vec<&str> = input.lines().collect();
    let mut result = Vec::with_capacity(lines.len());

    for line in &lines {
        if is_match(line, pattern) {
            result.push(replacement.to_string());
        } else {
            result.push(line.to_string());
        }
    }

    let joined = result.join("\n");
    // Preserve trailing newline
    if input.ends_with('\n') { format!("{joined}\n") } else { joined }
}

fn is_match(line: &str, pattern: &str) -> bool {
    // Handle the two patterns we use:
    // r"\*\*状态\*\*:\s*\S+" → line contains "**状态**:"
    // r"\*\*负责人\*\*:\s*.*" → line contains "**负责人**:"
    let trimmed = line.trim().trim_start_matches("- ");
    if pattern.contains("状态") {
        trimmed.starts_with("**状态**:")
    } else if pattern.contains("负责人") {
        trimmed.starts_with("**负责人**:")
    } else {
        false
    }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use tempfile::NamedTempFile;

    fn make_ticket_file(content: &str) -> NamedTempFile {
        let mut f = tempfile::Builder::new()
            .prefix("TASK-001")
            .suffix(".md")
            .tempfile()
            .unwrap();
        f.write_all(content.as_bytes()).unwrap();
        f
    }

    const SAMPLE: &str = r#"# TASK-001: 实现用户登录

## 元数据
- **状态**: todo
- **类型**: feature
- **优先级**: P1
- **负责人**: 待领取
- **创建时间**: 2026-04-20
"#;

    #[test]
    fn parse_ticket_fields() {
        let f = make_ticket_file(SAMPLE);
        let t = TicketFile::read(f.path()).unwrap();
        assert_eq!(t.status, TicketStatus::Todo);
        assert_eq!(t.priority, "P1");
        assert_eq!(t.title, "实现用户登录");
        assert!(t.assignee.is_none());
    }

    #[test]
    fn set_status_updates_file() {
        let f = make_ticket_file(SAMPLE);
        let mut t = TicketFile::read(f.path()).unwrap();
        t.set_status(TicketStatus::InProgress, Some("slaver_123")).unwrap();

        let updated = std::fs::read_to_string(f.path()).unwrap();
        assert!(updated.contains("**状态**: in_progress"));
        assert!(updated.contains("**负责人**: slaver_123"));
    }

    #[test]
    fn priority_sort_order() {
        assert!(priority_order("P0") < priority_order("P1"));
        assert!(priority_order("P1") < priority_order("P2"));
    }

    #[test]
    fn ticket_number_extraction() {
        assert_eq!(ticket_number("TASK-042"), 42);
        assert_eq!(ticket_number("TASK-001a"), 1);
    }
}
