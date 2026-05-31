/// CLI commands: knowledge:index, knowledge:search, recommend
use anyhow::Result;
use clap::Args;
use std::path::PathBuf;
use std::sync::Arc;

use eket_core::db::{create_pool, SqliteClient};
use eket_engine::knowledge::{KnowledgeBase, KnowledgeEntry};
use eket_engine::recommender::Recommender;

// ─── knowledge:index ─────────────────────────────────────────────────────────

#[derive(Args, Debug)]
pub struct KnowledgeIndexArgs {
    /// Ticket ID to associate the entry with (e.g. TASK-001). Optional when --dir is used.
    #[arg(long)]
    pub ticket_id: Option<String>,

    /// Path to the .md file to index
    #[arg(long)]
    pub file: Option<String>,

    /// Content to index (alternative to --file)
    #[arg(long)]
    pub content: Option<String>,

    /// Title for the entry
    #[arg(long, default_value = "")]
    pub title: String,

    /// Tags (comma-separated)
    #[arg(long, default_value = "")]
    pub tags: String,

    /// Batch scan directory for .md files (conflicts with --file, --content, --ticket-id)
    #[arg(long, conflicts_with_all = ["file", "content", "ticket_id"])]
    pub dir: Option<PathBuf>,

    /// SQLite DB path
    #[arg(long, env = "EKET_DB_PATH", default_value = ".eket/eket.db")]
    pub db_path: String,
}

pub async fn run_index(args: KnowledgeIndexArgs) -> Result<()> {
    let pool = create_pool(&args.db_path)?;
    let client = Arc::new(SqliteClient::new(pool));
    let kb = KnowledgeBase::new(client);
    kb.init_schema()?;

    // --dir: batch scan directory for .md files
    if let Some(ref dir) = args.dir {
        return run_index_dir(&kb, dir, &args.tags).await;
    }

    // Single-entry mode: require ticket_id
    let ticket_id = args
        .ticket_id
        .ok_or_else(|| anyhow::anyhow!("--ticket-id is required when --dir is not provided"))?;

    let content = if let Some(file) = &args.file {
        std::fs::read_to_string(file)?
    } else if let Some(c) = args.content {
        c
    } else {
        anyhow::bail!("Must provide --file or --content");
    };

    let tags: Vec<String> = if args.tags.is_empty() {
        vec![]
    } else {
        args.tags.split(',').map(|s| s.trim().to_owned()).collect()
    };

    let entry = KnowledgeEntry {
        id: uuid::Uuid::new_v4().to_string(),
        title: if args.title.is_empty() {
            ticket_id.clone()
        } else {
            args.title.clone()
        },
        content,
        tags,
        ticket_id: Some(ticket_id.clone()),
        created_at: chrono::Utc::now().timestamp(),
    };

    kb.index(&entry)?;

    let output = serde_json::json!({
        "ok": true,
        "id": entry.id,
        "ticket_id": ticket_id
    });
    println!("{}", serde_json::to_string_pretty(&output)?);
    Ok(())
}

/// Walk directory, index each .md file as a separate entry.
/// Uses filename (without extension) as title, empty ticket_id.
async fn run_index_dir(kb: &KnowledgeBase, dir: &PathBuf, tags_str: &str) -> Result<()> {
    let tags: Vec<String> = if tags_str.is_empty() {
        vec![]
    } else {
        tags_str.split(',').map(|s| s.trim().to_owned()).collect()
    };

    let mut indexed = 0usize;
    let mut failed = 0usize;

    // Walk directory for .md files (non-recursive for simplicity; use walkdir if deep scan needed)
    //NOTE: Only scans top-level directory. Deep recursion not implemented per spec.
    let entries = std::fs::read_dir(dir)
        .map_err(|e| anyhow::anyhow!("Cannot read directory {}: {}", dir.display(), e))?;

    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("md") {
            continue;
        }
        let title = path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("unknown")
            .to_string();

        match std::fs::read_to_string(&path) {
            Ok(content) => {
                let knowledge_entry = KnowledgeEntry {
                    id: uuid::Uuid::new_v4().to_string(),
                    title: title.clone(),
                    content,
                    tags: tags.clone(),
                    ticket_id: None, // no ticket_id in batch mode
                    created_at: chrono::Utc::now().timestamp(),
                };
                match kb.index(&knowledge_entry) {
                    Ok(_) => indexed += 1,
                    Err(_) => failed += 1,
                }
            }
            Err(_) => failed += 1,
        }
    }

    let output = serde_json::json!({
        "ok": true,
        "indexed": indexed,
        "failed": failed,
    });
    println!("{}", serde_json::to_string_pretty(&output)?);
    Ok(())
}

// ─── knowledge:search ────────────────────────────────────────────────────────

#[derive(Args, Debug)]
pub struct KnowledgeSearchArgs {
    /// FTS5 search query
    pub query: String,

    /// Maximum results to return (also accepted as --top)
    #[arg(long, alias = "top", default_value = "5")]
    pub limit: usize,

    /// SQLite DB path
    #[arg(long, env = "EKET_DB_PATH", default_value = ".eket/eket.db")]
    pub db_path: String,
}

pub async fn run_search(args: KnowledgeSearchArgs) -> Result<()> {
    let pool = create_pool(&args.db_path)?;
    let client = Arc::new(SqliteClient::new(pool));
    let kb = KnowledgeBase::new(client);
    kb.init_schema()?;

    let results = kb.search(&args.query, args.limit)?;

    let output: Vec<serde_json::Value> = results
        .iter()
        .map(|r| {
            serde_json::json!({
                "id": r.entry.id,
                "title": r.entry.title,
                "ticket_id": r.entry.ticket_id,
                "score": r.score,
                "snippet": &r.entry.content[..r.entry.content.len().min(200)]
            })
        })
        .collect();
    println!("{}", serde_json::to_string_pretty(&output)?);
    Ok(())
}

// ─── recommend ───────────────────────────────────────────────────────────────

#[derive(Args, Debug)]
pub struct RecommendArgs {
    /// Ticket ID for which to find recommendations
    pub ticket_id: String,

    /// Number of top recommendations
    #[arg(long, default_value = "5")]
    pub top: usize,

    /// Directory containing ticket .md files
    #[arg(long, default_value = "jira")]
    pub tickets_dir: String,

    /// SQLite DB path
    #[arg(long, env = "EKET_DB_PATH", default_value = ".eket/eket.db")]
    pub db_path: String,
}

pub async fn run_recommend(args: RecommendArgs) -> Result<()> {
    // Load query ticket content from knowledge base or file
    let pool = create_pool(&args.db_path)?;
    let client = Arc::new(SqliteClient::new(pool));
    let kb = KnowledgeBase::new(client);
    kb.init_schema()?;

    // Try to get query content from KB first; fall back to file
    let query_content = {
        let by_ticket = kb.list(Some(&args.ticket_id))?;
        if let Some(first) = by_ticket.into_iter().next() {
            first.content
        } else {
            // Try reading from tickets dir
            let path = format!("{}/{}.md", args.tickets_dir, args.ticket_id);
            std::fs::read_to_string(&path)
                .map_err(|_| anyhow::anyhow!("Cannot find content for {}", args.ticket_id))?
        }
    };

    // Build corpus from KB (all entries except the query ticket)
    let all_entries = kb.list(None)?;
    let corpus: Vec<(String, String, String)> = all_entries
        .into_iter()
        .filter(|e| e.ticket_id.as_deref() != Some(&args.ticket_id))
        .map(|e| {
            let tid = e.ticket_id.unwrap_or_else(|| e.id.clone());
            (tid, e.title, e.content)
        })
        .collect();

    let rec = Recommender::new();
    let results = rec.recommend(&query_content, &corpus, args.top);

    let output: Vec<serde_json::Value> = results
        .iter()
        .map(|r| {
            serde_json::json!({
                "ticket_id": r.ticket_id,
                "title": r.title,
                "score": r.score,
                "matched_terms": r.matched_terms
            })
        })
        .collect();
    println!("{}", serde_json::to_string_pretty(&output)?);
    Ok(())
}
