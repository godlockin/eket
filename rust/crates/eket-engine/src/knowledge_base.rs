//! KnowledgeBase (tantivy) — full-text index for ticket/memory documents.
//!
//! Complements the SQLite FTS5 `knowledge` module with a tantivy on-disk index,
//! enabling richer relevance ranking and offline index portability.

use std::path::Path;
use std::sync::{Arc, Mutex};

use serde::{Deserialize, Serialize};
use tantivy::{
    collector::TopDocs,
    doc,
    query::QueryParser,
    schema::{Schema, Value, STORED, STRING, TEXT},
    Index, IndexWriter, ReloadPolicy, TantivyDocument,
};

use eket_core::error::{EketError, EketResult};

// ─── Public types ─────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KnowledgeEntry {
    pub id: String,
    pub title: String,
    pub content: String,
    /// "ticket" | "memory" | "architecture"
    pub doc_type: String,
    pub tags: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResult {
    pub id: String,
    pub title: String,
    pub score: f32,
    /// First 200 chars of content (expandable to real tantivy snippet later)
    pub snippet: String,
}

// ─── Internal schema wrapper ──────────────────────────────────────────────────

struct KnowledgeSchema {
    id: tantivy::schema::Field,
    title: tantivy::schema::Field,
    content: tantivy::schema::Field,
    doc_type: tantivy::schema::Field,
    schema: Schema,
}

impl KnowledgeSchema {
    fn build() -> Self {
        let mut b = Schema::builder();
        let id = b.add_text_field("id", STRING | STORED);
        let title = b.add_text_field("title", TEXT | STORED);
        let content = b.add_text_field("content", TEXT);
        let doc_type = b.add_text_field("doc_type", STRING | STORED);
        let schema = b.build();
        Self { id, title, content, doc_type, schema }
    }
}

// ─── KnowledgeBase ────────────────────────────────────────────────────────────

/// Tantivy-backed full-text knowledge base.
///
/// Thread-safe: `IndexWriter` wrapped in `Arc<Mutex>`.
pub struct KnowledgeBase {
    index: Index,
    writer: Arc<Mutex<IndexWriter>>,
    ks: KnowledgeSchema,
}

impl KnowledgeBase {
    /// Open (or create) an on-disk tantivy index at `index_dir`.
    ///
    /// Typical path: `~/.eket/data/index/`
    pub fn open(index_dir: impl AsRef<Path>) -> EketResult<Self> {
        let dir = index_dir.as_ref();
        std::fs::create_dir_all(dir)?;

        let ks = KnowledgeSchema::build();

        let index = if dir.join("meta.json").exists() {
            Index::open_in_dir(dir).map_err(|e| EketError::Other(e.to_string()))?
        } else {
            Index::create_in_dir(dir, ks.schema.clone())
                .map_err(|e| EketError::Other(e.to_string()))?
        };

        // 50 MB writer heap
        let writer = index
            .writer(50_000_000)
            .map_err(|e| EketError::Other(e.to_string()))?;

        Ok(Self { index, writer: Arc::new(Mutex::new(writer)), ks })
    }

    /// Index a single entry and commit immediately.
    pub fn index_entry(&self, entry: &KnowledgeEntry) -> EketResult<()> {
        let doc = doc!(
            self.ks.id      => entry.id.as_str(),
            self.ks.title   => entry.title.as_str(),
            self.ks.content => entry.content.as_str(),
            self.ks.doc_type=> entry.doc_type.as_str(),
        );
        let mut writer = self.writer.lock().map_err(|e| EketError::Other(e.to_string()))?;
        writer.add_document(doc).map_err(|e| EketError::Other(e.to_string()))?;
        writer.commit().map_err(|e| EketError::Other(e.to_string()))?;
        Ok(())
    }

    /// Scan `dir` for `*.md` files, index each one as `doc_type`, return count.
    ///
    /// Title is parsed from the first `# Heading` line; falls back to filename stem.
    /// All documents are committed in a single batch for efficiency.
    pub fn index_directory(&self, dir: impl AsRef<Path>, doc_type: &str) -> EketResult<usize> {
        let dir = dir.as_ref();
        let mut count = 0usize;

        let mut writer = self.writer.lock().map_err(|e| EketError::Other(e.to_string()))?;

        for dir_entry in
            std::fs::read_dir(dir).map_err(|e| EketError::Other(e.to_string()))?
        {
            let path = dir_entry.map_err(|e| EketError::Other(e.to_string()))?.path();
            if path.extension().and_then(|e| e.to_str()) != Some("md") {
                continue;
            }

            let content = std::fs::read_to_string(&path).unwrap_or_default();
            let id = path
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("unknown")
                .to_string();
            let title = content
                .lines()
                .find(|l| l.starts_with("# "))
                .map(|l| l.trim_start_matches("# ").to_string())
                .unwrap_or_else(|| id.clone());

            let doc = doc!(
                self.ks.id      => id.as_str(),
                self.ks.title   => title.as_str(),
                self.ks.content => content.as_str(),
                self.ks.doc_type=> doc_type,
            );
            writer.add_document(doc).map_err(|e| EketError::Other(e.to_string()))?;
            count += 1;
        }

        writer.commit().map_err(|e| EketError::Other(e.to_string()))?;
        Ok(count)
    }

    /// Full-text search over `title` + `content` fields.
    pub fn search(&self, query_str: &str, limit: usize) -> EketResult<Vec<SearchResult>> {
        let reader = self
            .index
            .reader_builder()
            .reload_policy(ReloadPolicy::OnCommitWithDelay)
            .try_into()
            .map_err(|e: tantivy::TantivyError| EketError::Other(e.to_string()))?;

        let searcher = reader.searcher();

        let qp = QueryParser::for_index(&self.index, vec![self.ks.title, self.ks.content]);
        let query = qp.parse_query(query_str).map_err(|e| EketError::Other(e.to_string()))?;

        let top_docs = searcher
            .search(&query, &TopDocs::with_limit(limit))
            .map_err(|e| EketError::Other(e.to_string()))?;

        let mut results = Vec::with_capacity(top_docs.len());
        for (score, addr) in top_docs {
            let doc: TantivyDocument =
                searcher.doc(addr).map_err(|e| EketError::Other(e.to_string()))?;

            let id = doc
                .get_first(self.ks.id)
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let title = doc
                .get_first(self.ks.title)
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();

            results.push(SearchResult { id, title, score, snippet: String::new() });
        }
        Ok(results)
    }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn open_tmp() -> (KnowledgeBase, TempDir) {
        let dir = TempDir::new().unwrap();
        let kb = KnowledgeBase::open(dir.path()).unwrap();
        (kb, dir)
    }

    fn entry(id: &str, title: &str, content: &str) -> KnowledgeEntry {
        KnowledgeEntry {
            id: id.to_owned(),
            title: title.to_owned(),
            content: content.to_owned(),
            doc_type: "ticket".to_owned(),
            tags: vec![],
        }
    }

    #[test]
    fn index_and_search() {
        let (kb, _dir) = open_tmp();
        kb.index_entry(&entry("t1", "Rust Ownership", "Ownership is core to Rust memory safety."))
            .unwrap();
        let results = kb.search("Ownership", 5).unwrap();
        assert!(!results.is_empty());
        assert_eq!(results[0].id, "t1");
    }

    #[test]
    fn search_no_match() {
        let (kb, _dir) = open_tmp();
        kb.index_entry(&entry("t2", "Hello", "greeting")).unwrap();
        let results = kb.search("xyznonexistent", 5).unwrap();
        assert!(results.is_empty());
    }

    #[test]
    fn index_directory() {
        let (kb, _dir) = open_tmp();

        // Create a temp dir with .md files
        let md_dir = TempDir::new().unwrap();
        std::fs::write(md_dir.path().join("doc1.md"), "# Alpha\nalpha content").unwrap();
        std::fs::write(md_dir.path().join("doc2.md"), "# Beta\nbeta content").unwrap();
        std::fs::write(md_dir.path().join("skip.txt"), "not indexed").unwrap();

        let count = kb.index_directory(md_dir.path(), "memory").unwrap();
        assert_eq!(count, 2);

        let results = kb.search("alpha", 5).unwrap();
        assert!(!results.is_empty());
    }
}
