/// CLI command: dependency:analyze
///
/// 读取目标 ticket 内容，用 TF-IDF 在 ticket_index 表中匹配相似 ticket，
/// 输出建议依赖列表。
use anyhow::Result;
use clap::Args;

use eket_core::db::create_pool;
use eket_engine::recommender::Recommender;

// ─── Args ────────────────────────────────────────────────────────────────────

#[derive(Args, Debug)]
pub struct DependencyAnalyzeArgs {
    /// Ticket ID to analyze (e.g. TASK-042)
    pub ticket_id: String,

    /// Directory containing ticket .md files (for reading ticket content)
    #[arg(long, default_value = "jira/tickets")]
    pub tickets_dir: String,

    /// Number of suggested dependencies to return
    #[arg(long, default_value = "5")]
    pub top: usize,

    /// Minimum similarity threshold (0.0–1.0)
    #[arg(long, default_value = "0.1")]
    pub min_score: f64,

    /// SQLite DB path
    #[arg(long, env = "EKET_DB_PATH", default_value = ".eket/eket.db")]
    pub db_path: String,
}

// ─── Run ─────────────────────────────────────────────────────────────────────

pub async fn run(args: DependencyAnalyzeArgs) -> Result<()> {
    let pool = create_pool(&args.db_path)?;
    let conn = pool.get()?;

    // Ensure ticket_index table exists (may not exist if ticket:index was never run)
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

    // Read target ticket content from file
    let ticket_path = format!("{}/{}.md", args.tickets_dir, args.ticket_id);
    let query_content = std::fs::read_to_string(&ticket_path)
        .map_err(|_| anyhow::anyhow!("Ticket file not found: {}", ticket_path))?;

    // Load corpus from ticket_index (exclude target ticket itself)
    let mut stmt = conn.prepare(
        "SELECT id, title FROM ticket_index WHERE id != ?1",
    )?;
    let rows: Vec<(String, String)> = stmt
        .query_map(rusqlite::params![args.ticket_id], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })?
        .flatten()
        .collect();

    if rows.is_empty() {
        let output = serde_json::json!({
            "ticket_id": args.ticket_id,
            "suggested_dependencies": [],
            "confidence": 0.0,
            "note": "No indexed tickets found. Run `ticket:index` first."
        });
        println!("{}", serde_json::to_string_pretty(&output)?);
        return Ok(());
    }

    // Build corpus: read file content for each indexed ticket
    let corpus: Vec<(String, String, String)> = rows
        .into_iter()
        .filter_map(|(id, title)| {
            let path = format!("{}/{}.md", args.tickets_dir, id);
            std::fs::read_to_string(&path)
                .ok()
                .map(|content| (id, title, content))
        })
        .collect();

    let rec = Recommender::new();
    let results = rec.recommend(&query_content, &corpus, args.top);

    // Filter by min_score threshold
    let deps: Vec<&str> = results
        .iter()
        .filter(|r| r.score >= args.min_score)
        .map(|r| r.ticket_id.as_str())
        .collect();

    let confidence = results
        .first()
        .map(|r| (r.score * 100.0).round() / 100.0)
        .unwrap_or(0.0);

    let output = serde_json::json!({
        "ticket_id": args.ticket_id,
        "suggested_dependencies": deps,
        "confidence": confidence,
        "details": results.iter().map(|r| serde_json::json!({
            "ticket_id": r.ticket_id,
            "title": r.title,
            "score": (r.score * 1000.0).round() / 1000.0,
            "matched_terms": r.matched_terms
        })).collect::<Vec<_>>()
    });
    println!("{}", serde_json::to_string_pretty(&output)?);
    Ok(())
}
