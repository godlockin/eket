/// KnowledgeBase — SQLite FTS5-backed full-text search for EKET knowledge entries.
use std::sync::Arc;

use eket_core::db::SqliteClient;
use eket_core::error::EketResult;
use rusqlite::params;

// ─── Types ───────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct KnowledgeEntry {
    pub id: String,
    pub title: String,
    pub content: String,
    pub tags: Vec<String>,
    pub ticket_id: Option<String>,
    pub created_at: i64,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct SearchResult {
    pub entry: KnowledgeEntry,
    pub score: f64,
}

// ─── KnowledgeBase ───────────────────────────────────────────────────────────

pub struct KnowledgeBase {
    db: Arc<SqliteClient>,
}

impl KnowledgeBase {
    pub fn new(db: Arc<SqliteClient>) -> Self {
        Self { db }
    }

    /// Initialize FTS5 virtual table (idempotent).
    pub fn init_schema(&self) -> EketResult<()> {
        let conn = self.db.pool().get()?;
        conn.execute_batch(
            "CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_fts USING fts5(
                id UNINDEXED,
                title,
                content,
                tags,
                ticket_id UNINDEXED,
                created_at UNINDEXED
            );",
        )?;
        Ok(())
    }

    /// Index (insert or replace) an entry.
    pub fn index(&self, entry: &KnowledgeEntry) -> EketResult<()> {
        let conn = self.db.pool().get()?;
        let tags_str = entry.tags.join(" ");
        // FTS5 doesn't support ON CONFLICT; delete first then insert.
        conn.execute("DELETE FROM knowledge_fts WHERE id = ?1", params![entry.id])?;
        conn.execute(
            "INSERT INTO knowledge_fts (id, title, content, tags, ticket_id, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                entry.id,
                entry.title,
                entry.content,
                tags_str,
                entry.ticket_id,
                entry.created_at,
            ],
        )?;
        Ok(())
    }

    /// Full-text search using FTS5 MATCH + bm25 ranking.
    pub fn search(&self, query: &str, limit: usize) -> EketResult<Vec<SearchResult>> {
        let conn = self.db.pool().get()?;
        let mut stmt = conn.prepare(
            "SELECT id, title, content, tags, ticket_id, created_at,
                    bm25(knowledge_fts) as score
             FROM knowledge_fts
             WHERE knowledge_fts MATCH ?1
             ORDER BY score
             LIMIT ?2",
        )?;

        let results = stmt
            .query_map(params![query, limit as i64], |row| {
                let tags_str: String = row.get::<_, Option<String>>(3)?.unwrap_or_default();
                let tags: Vec<String> = tags_str
                    .split_whitespace()
                    .filter(|s| !s.is_empty())
                    .map(|s| s.to_owned())
                    .collect();
                let score: f64 = row.get(6)?;
                Ok(SearchResult {
                    entry: KnowledgeEntry {
                        id: row.get(0)?,
                        title: row.get(1)?,
                        content: row.get(2)?,
                        tags,
                        ticket_id: row.get(4)?,
                        created_at: row.get(5)?,
                    },
                    score,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(results)
    }

    /// Get entry by exact id (linear scan via MATCH on unindexed id column).
    /// FTS5 UNINDEXED columns can still be filtered; use rowid trick instead.
    pub fn get(&self, id: &str) -> EketResult<Option<KnowledgeEntry>> {
        let conn = self.db.pool().get()?;
        let mut stmt = conn.prepare(
            "SELECT id, title, content, tags, ticket_id, created_at
             FROM knowledge_fts
             WHERE id = ?1",
        )?;
        let result = stmt.query_row(params![id], |row| {
            let tags_str: String = row.get::<_, Option<String>>(3)?.unwrap_or_default();
            let tags: Vec<String> = tags_str
                .split_whitespace()
                .filter(|s| !s.is_empty())
                .map(|s| s.to_owned())
                .collect();
            Ok(KnowledgeEntry {
                id: row.get(0)?,
                title: row.get(1)?,
                content: row.get(2)?,
                tags,
                ticket_id: row.get(4)?,
                created_at: row.get(5)?,
            })
        });

        match result {
            Ok(e) => Ok(Some(e)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e.into()),
        }
    }

    /// Delete entry by id. Returns true if deleted.
    pub fn delete(&self, id: &str) -> EketResult<bool> {
        let conn = self.db.pool().get()?;
        let rows = conn.execute("DELETE FROM knowledge_fts WHERE id = ?1", params![id])?;
        Ok(rows > 0)
    }

    /// List all entries, optionally filtered by ticket_id.
    pub fn list(&self, ticket_id: Option<&str>) -> EketResult<Vec<KnowledgeEntry>> {
        let conn = self.db.pool().get()?;

        let map_row = |row: &rusqlite::Row<'_>| -> rusqlite::Result<KnowledgeEntry> {
            let tags_str: String = row.get::<_, Option<String>>(3)?.unwrap_or_default();
            let tags: Vec<String> = tags_str
                .split_whitespace()
                .filter(|s| !s.is_empty())
                .map(|s| s.to_owned())
                .collect();
            Ok(KnowledgeEntry {
                id: row.get(0)?,
                title: row.get(1)?,
                content: row.get(2)?,
                tags,
                ticket_id: row.get(4)?,
                created_at: row.get(5)?,
            })
        };

        if let Some(tid) = ticket_id {
            let mut stmt = conn.prepare(
                "SELECT id, title, content, tags, ticket_id, created_at
                 FROM knowledge_fts
                 WHERE ticket_id = ?1",
            )?;
            let rows = stmt
                .query_map(params![tid], map_row)?
                .collect::<Result<Vec<_>, _>>()?;
            Ok(rows)
        } else {
            let mut stmt = conn.prepare(
                "SELECT id, title, content, tags, ticket_id, created_at
                 FROM knowledge_fts",
            )?;
            let rows = stmt
                .query_map([], map_row)?
                .collect::<Result<Vec<_>, _>>()?;
            Ok(rows)
        }
    }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use eket_core::db::{create_pool, SqliteClient};

    fn make_kb() -> KnowledgeBase {
        let pool = create_pool(":memory:").expect("in-memory db");
        let client = Arc::new(SqliteClient::new(pool));
        let kb = KnowledgeBase::new(client);
        kb.init_schema().expect("init schema");
        kb
    }

    fn entry(id: &str, title: &str, content: &str) -> KnowledgeEntry {
        KnowledgeEntry {
            id: id.to_owned(),
            title: title.to_owned(),
            content: content.to_owned(),
            tags: vec!["test".to_owned()],
            ticket_id: Some("TASK-001".to_owned()),
            created_at: 1_700_000_000,
        }
    }

    #[test]
    fn index_and_search() {
        let kb = make_kb();
        let e = entry(
            "kb-1",
            "Rust Ownership",
            "Ownership is core to Rust memory safety.",
        );
        kb.index(&e).unwrap();

        let results = kb.search("Ownership", 10).unwrap();
        assert!(!results.is_empty());
        assert_eq!(results[0].entry.id, "kb-1");
    }

    #[test]
    fn search_no_match() {
        let kb = make_kb();
        let e = entry("kb-2", "Hello World", "This is a greeting.");
        kb.index(&e).unwrap();

        let results = kb.search("xyznonexistent", 10).unwrap();
        assert!(results.is_empty());
    }

    #[test]
    fn delete_removes_entry() {
        let kb = make_kb();
        let e = entry("kb-3", "Delete Me", "Content to be removed.");
        kb.index(&e).unwrap();

        // Confirm it's there
        let found = kb.get("kb-3").unwrap();
        assert!(found.is_some());

        // Delete and confirm gone
        assert!(kb.delete("kb-3").unwrap());
        let results = kb.search("removed", 10).unwrap();
        assert!(results.is_empty());
        let found = kb.get("kb-3").unwrap();
        assert!(found.is_none());
    }

    #[test]
    fn list_with_ticket_filter() {
        let kb = make_kb();
        let mut e1 = entry("kb-4", "Alpha", "alpha content");
        e1.ticket_id = Some("TASK-100".to_owned());
        let mut e2 = entry("kb-5", "Beta", "beta content");
        e2.ticket_id = Some("TASK-200".to_owned());
        kb.index(&e1).unwrap();
        kb.index(&e2).unwrap();

        let task100 = kb.list(Some("TASK-100")).unwrap();
        assert_eq!(task100.len(), 1);
        assert_eq!(task100[0].id, "kb-4");

        let all = kb.list(None).unwrap();
        assert_eq!(all.len(), 2);
    }
}
