/// CLI command: ticket:index
///
/// 扫描 tickets_dir/**/*.md，提取元数据写入 SQLite tickets 表。
use anyhow::Result;
use clap::Args;
use std::path::Path;
use std::time::Instant;

use eket_core::db::create_pool;
use eket_core::ticket::TicketFile;

// ─── Args ────────────────────────────────────────────────────────────────────

#[derive(Args, Debug)]
pub struct TicketIndexArgs {
    /// Directory containing ticket .md files (scanned recursively)
    #[arg(long, default_value = "jira/tickets")]
    pub tickets_dir: String,

    /// SQLite DB path
    #[arg(long, env = "EKET_DB_PATH", default_value = ".eket/eket.db")]
    pub db_path: String,
}

// ─── Run ─────────────────────────────────────────────────────────────────────

pub async fn run(args: TicketIndexArgs) -> Result<()> {
    let start = Instant::now();
    let dir = Path::new(&args.tickets_dir);

    let pool = create_pool(&args.db_path)?;
    let conn = pool.get()?;

    // CREATE TABLE IF NOT EXISTS for tickets index
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS ticket_index (
            id          TEXT PRIMARY KEY,
            title       TEXT NOT NULL,
            status      TEXT NOT NULL DEFAULT 'todo',
            priority    TEXT NOT NULL DEFAULT 'P2',
            ticket_type TEXT,
            indexed_at  INTEGER NOT NULL
        );
        "#,
    )?;

    let mut indexed = 0usize;
    let mut failed = 0usize;

    scan_dir(dir, &mut |path| {
        match TicketFile::read(path) {
            Ok(ticket) => {
                let now = chrono::Utc::now().timestamp();
                let status_str = format!("{:?}", ticket.status).to_lowercase();
                let result = conn.execute(
                    r#"INSERT INTO ticket_index (id, title, status, priority, ticket_type, indexed_at)
                       VALUES (?1, ?2, ?3, ?4, ?5, ?6)
                       ON CONFLICT(id) DO UPDATE SET
                           title = excluded.title,
                           status = excluded.status,
                           priority = excluded.priority,
                           ticket_type = excluded.ticket_type,
                           indexed_at = excluded.indexed_at"#,
                    rusqlite::params![
                        ticket.id,
                        ticket.title,
                        status_str,
                        ticket.priority,
                        ticket.ticket_type,
                        now,
                    ],
                );
                match result {
                    Ok(_) => indexed += 1,
                    Err(_) => failed += 1,
                }
            }
            Err(_) => failed += 1,
        }
    });

    let elapsed_ms = start.elapsed().as_millis();
    let output = serde_json::json!({
        "indexed": indexed,
        "failed": failed,
        "elapsed_ms": elapsed_ms
    });
    println!("{}", serde_json::to_string_pretty(&output)?);
    Ok(())
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/// Recursively scan directory for .md files, call callback for each.
fn scan_dir(dir: &Path, cb: &mut impl FnMut(&Path)) {
    if !dir.exists() {
        return;
    }
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                scan_dir(&path, cb);
            } else if path.extension().map(|e| e == "md").unwrap_or(false) {
                cb(&path);
            }
        }
    }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use tempfile::TempDir;

    fn write_ticket(dir: &Path, name: &str, content: &str) {
        let mut f = std::fs::File::create(dir.join(name)).unwrap();
        f.write_all(content.as_bytes()).unwrap();
    }

    #[tokio::test]
    async fn ticket_index_scans_and_inserts() {
        let tmp_tickets = TempDir::new().unwrap();
        let tmp_db = TempDir::new().unwrap();
        let db_path = tmp_db.path().join("test.db").to_string_lossy().to_string();

        write_ticket(
            tmp_tickets.path(),
            "TASK-001.md",
            "# TASK-001: 实现登录\n\n- **状态**: todo\n- **优先级**: P1\n",
        );
        write_ticket(
            tmp_tickets.path(),
            "TASK-002.md",
            "# TASK-002: 实现注册\n\n- **状态**: in_progress\n- **优先级**: P2\n",
        );

        let args = TicketIndexArgs {
            tickets_dir: tmp_tickets.path().to_string_lossy().to_string(),
            db_path,
        };

        run(args).await.unwrap();
    }

    #[tokio::test]
    async fn ticket_index_empty_dir() {
        let tmp_tickets = TempDir::new().unwrap();
        let tmp_db = TempDir::new().unwrap();
        let db_path = tmp_db.path().join("test.db").to_string_lossy().to_string();

        let args = TicketIndexArgs {
            tickets_dir: tmp_tickets.path().to_string_lossy().to_string(),
            db_path,
        };

        run(args).await.unwrap();
    }

    #[tokio::test]
    async fn ticket_index_nonexistent_dir() {
        let tmp_db = TempDir::new().unwrap();
        let db_path = tmp_db.path().join("test.db").to_string_lossy().to_string();

        let args = TicketIndexArgs {
            tickets_dir: "/nonexistent/path/tickets".to_string(),
            db_path,
        };

        // Should succeed (gracefully skip missing dir, indexed=0)
        run(args).await.unwrap();
    }
}
