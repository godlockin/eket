//! Three-layer fingerprint storage.
//!
//! Layer 1 (Hot): DashMap cache - fast concurrent access
//! Layer 2 (Warm): SQLite B-Tree index - persistent, indexed by path/content_hash/commit
//! Layer 3 (Cold): JSON archive - portable, gzip-compressed for sharing

use std::collections::HashMap;
use std::fs;
use std::path::Path;

use dashmap::DashMap;
use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};

use super::hash::FileFingerprint;
use crate::db::DbPool;
use crate::error::EketResult;

// ─── JSON Baseline Format ────────────────────────────────────────────────────

/// Portable JSON baseline format (Layer 3).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FingerprintBaseline {
    pub version: String,
    pub git_commit_hash: Option<String>,
    pub created_at: String,
    pub files: HashMap<String, FileFingerprintJson>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileFingerprintJson {
    pub content_hash: String,
    pub structure_hash: String,
    pub file_size: u64,
    pub line_count: usize,
    pub last_analyzed: String,
}

impl FingerprintBaseline {
    pub fn new(commit_sha: Option<String>) -> Self {
        Self {
            version: "1.0.0".to_string(),
            git_commit_hash: commit_sha,
            created_at: chrono::Utc::now().to_rfc3339(),
            files: HashMap::new(),
        }
    }

    pub fn add(&mut self, fp: &FileFingerprint) {
        self.files.insert(
            fp.path.clone(),
            FileFingerprintJson {
                content_hash: fp.content_hash.clone(),
                structure_hash: fp.structure_hash.clone(),
                file_size: fp.file_size,
                line_count: fp.line_count,
                last_analyzed: chrono::DateTime::from_timestamp(fp.analyzed_at, 0)
                    .map(|dt| dt.to_rfc3339())
                    .unwrap_or_default(),
            },
        );
    }

    pub fn to_fingerprints(&self) -> Vec<FileFingerprint> {
        self.files
            .iter()
            .map(|(path, json)| FileFingerprint {
                path: path.clone(),
                content_hash: json.content_hash.clone(),
                structure_hash: json.structure_hash.clone(),
                file_size: json.file_size,
                line_count: json.line_count,
                analyzed_at: chrono::DateTime::parse_from_rfc3339(&json.last_analyzed)
                    .map(|dt| dt.timestamp())
                    .unwrap_or(0),
            })
            .collect()
    }

    /// Save to JSON file.
    pub fn save_to_file(&self, path: &Path) -> EketResult<()> {
        let json = serde_json::to_string_pretty(self)?;
        fs::write(path, json)?;
        Ok(())
    }

    /// Load from JSON file.
    pub fn load_from_file(path: &Path) -> EketResult<Self> {
        let content = fs::read_to_string(path)?;
        let baseline: Self = serde_json::from_str(&content)?;
        Ok(baseline)
    }
}

// ─── SQLite Schema ───────────────────────────────────────────────────────────

const CREATE_TABLE_SQL: &str = r#"
CREATE TABLE IF NOT EXISTS file_fingerprints (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    path TEXT NOT NULL,
    content_hash CHAR(64) NOT NULL,
    structure_hash CHAR(64) NOT NULL,
    commit_sha CHAR(40),
    analyzed_at INTEGER NOT NULL,
    file_size INTEGER,
    line_count INTEGER,
    UNIQUE(path, commit_sha)
);

CREATE INDEX IF NOT EXISTS idx_fp_path ON file_fingerprints(path);
CREATE INDEX IF NOT EXISTS idx_fp_content ON file_fingerprints(content_hash);
CREATE INDEX IF NOT EXISTS idx_fp_commit ON file_fingerprints(commit_sha, path);
"#;

// ─── FingerprintStore ────────────────────────────────────────────────────────

/// Three-layer fingerprint storage.
///
/// - L1: DashMap cache (hot, in-memory, concurrent)
/// - L2: SQLite (warm, persistent)
/// - L3: JSON export (cold, portable)
pub struct FingerprintStore {
    /// L1: In-memory concurrent cache
    cache: DashMap<String, FileFingerprint>,
    /// L2: SQLite connection pool
    db: DbPool,
}

impl FingerprintStore {
    /// Create new store with SQLite pool.
    ///
    /// Runs schema migration automatically.
    pub fn new(db: DbPool) -> EketResult<Self> {
        // Run migration
        let conn = db.get()?;
        conn.execute_batch(CREATE_TABLE_SQL)?;
        drop(conn);

        // L1: DashMap cache
        let cache = DashMap::new();

        Ok(Self { cache, db })
    }

    /// Cache key format: "path:commit_sha" or "path:HEAD" for latest.
    fn cache_key(path: &str, commit_sha: Option<&str>) -> String {
        format!("{}:{}", path, commit_sha.unwrap_or("HEAD"))
    }

    // ─── Get (L1 → L2) ───────────────────────────────────────────────────────

    /// Get fingerprint for a path, optionally at specific commit.
    ///
    /// Tries L1 cache first, then L2 SQLite, backfills L1 on hit.
    pub fn get(&self, path: &str, commit_sha: Option<&str>) -> EketResult<Option<FileFingerprint>> {
        let key = Self::cache_key(path, commit_sha);

        // L1: cache hit
        if let Some(fp) = self.cache.get(&key) {
            return Ok(Some(fp.clone()));
        }

        // L2: SQLite lookup
        let conn = self.db.get()?;
        let fp = self.get_from_sqlite(&conn, path, commit_sha)?;

        // Backfill L1 on hit
        if let Some(ref fp) = fp {
            self.cache.insert(key, fp.clone());
        }

        Ok(fp)
    }

    fn get_from_sqlite(
        &self,
        conn: &rusqlite::Connection,
        path: &str,
        commit_sha: Option<&str>,
    ) -> EketResult<Option<FileFingerprint>> {
        let result: Option<FileFingerprint> = if let Some(sha) = commit_sha {
            conn.query_row(
                "SELECT path, content_hash, structure_hash, file_size, line_count, analyzed_at
                 FROM file_fingerprints WHERE path = ?1 AND commit_sha = ?2",
                params![path, sha],
                |row| {
                    Ok(FileFingerprint {
                        path: row.get(0)?,
                        content_hash: row.get(1)?,
                        structure_hash: row.get(2)?,
                        file_size: row.get::<_, i64>(3)? as u64,
                        line_count: row.get::<_, i64>(4)? as usize,
                        analyzed_at: row.get(5)?,
                    })
                },
            )
            .optional()?
        } else {
            conn.query_row(
                "SELECT path, content_hash, structure_hash, file_size, line_count, analyzed_at
                 FROM file_fingerprints WHERE path = ?1 AND commit_sha IS NULL
                 ORDER BY analyzed_at DESC LIMIT 1",
                params![path],
                |row| {
                    Ok(FileFingerprint {
                        path: row.get(0)?,
                        content_hash: row.get(1)?,
                        structure_hash: row.get(2)?,
                        file_size: row.get::<_, i64>(3)? as u64,
                        line_count: row.get::<_, i64>(4)? as usize,
                        analyzed_at: row.get(5)?,
                    })
                },
            )
            .optional()?
        };

        Ok(result)
    }

    // ─── Put (L1 + L2) ───────────────────────────────────────────────────────

    /// Store fingerprint in L1 cache and L2 SQLite.
    pub fn put(&self, fp: &FileFingerprint, commit_sha: Option<&str>) -> EketResult<()> {
        let key = Self::cache_key(&fp.path, commit_sha);

        // L1: cache insert
        self.cache.insert(key, fp.clone());

        // L2: SQLite upsert
        let conn = self.db.get()?;
        conn.execute(
            "INSERT OR REPLACE INTO file_fingerprints
             (path, content_hash, structure_hash, commit_sha, analyzed_at, file_size, line_count)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                fp.path,
                fp.content_hash,
                fp.structure_hash,
                commit_sha,
                fp.analyzed_at,
                fp.file_size as i64,
                fp.line_count as i64,
            ],
        )?;

        Ok(())
    }

    /// Store multiple fingerprints in a single transaction.
    pub fn put_batch(&self, fps: &[FileFingerprint], commit_sha: Option<&str>) -> EketResult<usize> {
        let conn = self.db.get()?;

        let tx = conn.unchecked_transaction()?;
        let mut stmt = tx.prepare(
            "INSERT OR REPLACE INTO file_fingerprints
             (path, content_hash, structure_hash, commit_sha, analyzed_at, file_size, line_count)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        )?;

        let mut count = 0;
        for fp in fps {
            stmt.execute(params![
                fp.path,
                fp.content_hash,
                fp.structure_hash,
                commit_sha,
                fp.analyzed_at,
                fp.file_size as i64,
                fp.line_count as i64,
            ])?;

            // L1 cache insert
            let key = Self::cache_key(&fp.path, commit_sha);
            self.cache.insert(key, fp.clone());
            count += 1;
        }

        drop(stmt);
        tx.commit()?;

        Ok(count)
    }

    // ─── List / Query ────────────────────────────────────────────────────────

    /// List all fingerprints for a commit.
    pub fn list_by_commit(&self, commit_sha: Option<&str>) -> EketResult<Vec<FileFingerprint>> {
        let conn = self.db.get()?;
        let mut fps = Vec::new();

        if let Some(sha) = commit_sha {
            let mut stmt = conn.prepare(
                "SELECT path, content_hash, structure_hash, file_size, line_count, analyzed_at
                 FROM file_fingerprints WHERE commit_sha = ?1",
            )?;
            let rows = stmt.query_map(params![sha], |row| {
                Ok(FileFingerprint {
                    path: row.get(0)?,
                    content_hash: row.get(1)?,
                    structure_hash: row.get(2)?,
                    file_size: row.get::<_, i64>(3)? as u64,
                    line_count: row.get::<_, i64>(4)? as usize,
                    analyzed_at: row.get(5)?,
                })
            })?;
            for row in rows {
                fps.push(row?);
            }
        } else {
            let mut stmt = conn.prepare(
                "SELECT path, content_hash, structure_hash, file_size, line_count, analyzed_at
                 FROM file_fingerprints WHERE commit_sha IS NULL",
            )?;
            let rows = stmt.query_map([], |row| {
                Ok(FileFingerprint {
                    path: row.get(0)?,
                    content_hash: row.get(1)?,
                    structure_hash: row.get(2)?,
                    file_size: row.get::<_, i64>(3)? as u64,
                    line_count: row.get::<_, i64>(4)? as usize,
                    analyzed_at: row.get(5)?,
                })
            })?;
            for row in rows {
                fps.push(row?);
            }
        }

        Ok(fps)
    }

    /// Get statistics for fingerprints since a timestamp.
    pub fn get_stats(&self, since_timestamp: i64) -> EketResult<FingerprintStats> {
        let conn = self.db.get()?;

        let mut stmt = conn.prepare(
            "SELECT COUNT(*), SUM(file_size), SUM(line_count)
             FROM file_fingerprints WHERE analyzed_at >= ?1",
        )?;

        let stats = stmt.query_row(params![since_timestamp], |row| {
            Ok(FingerprintStats {
                total_files: row.get::<_, i64>(0)? as usize,
                total_bytes: row.get::<_, Option<i64>>(1)?.unwrap_or(0) as u64,
                total_lines: row.get::<_, Option<i64>>(2)?.unwrap_or(0) as usize,
            })
        })?;

        Ok(stats)
    }

    // ─── Export to JSON (L3) ─────────────────────────────────────────────────

    /// Export fingerprints for a commit to JSON baseline.
    pub fn export_to_baseline(&self, commit_sha: Option<&str>) -> EketResult<FingerprintBaseline> {
        let fps = self.list_by_commit(commit_sha)?;
        let mut baseline = FingerprintBaseline::new(commit_sha.map(String::from));

        for fp in fps {
            baseline.add(&fp);
        }

        Ok(baseline)
    }

    /// Import from JSON baseline to SQLite.
    pub fn import_from_baseline(&self, baseline: &FingerprintBaseline) -> EketResult<usize> {
        let fps = baseline.to_fingerprints();
        self.put_batch(&fps, baseline.git_commit_hash.as_deref())
    }

    // ─── Cache Stats ─────────────────────────────────────────────────────────

    /// Get L1 cache statistics.
    pub fn cache_stats(&self) -> CacheStats {
        CacheStats {
            entry_count: self.cache.len() as u64,
        }
    }

    /// Invalidate L1 cache for a path.
    pub fn invalidate_cache(&self, path: &str) {
        let prefix = format!("{}:", path);
        self.cache.retain(|k, _| !k.starts_with(&prefix));
    }

    /// Clear entire L1 cache.
    pub fn clear_cache(&self) {
        self.cache.clear();
    }
}

// ─── Stats Types ─────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct FingerprintStats {
    pub total_files: usize,
    pub total_bytes: u64,
    pub total_lines: usize,
}

#[derive(Debug, Clone, Default)]
pub struct CacheStats {
    pub entry_count: u64,
}

// ─── Tests ───────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::create_pool;
    use tempfile::TempDir;

    fn make_fp(path: &str) -> FileFingerprint {
        FileFingerprint {
            path: path.to_string(),
            content_hash: format!("content_{}", path),
            structure_hash: format!("struct_{}", path),
            file_size: 100,
            line_count: 10,
            analyzed_at: chrono::Utc::now().timestamp(),
        }
    }

    fn test_store() -> (FingerprintStore, TempDir) {
        let dir = TempDir::new().unwrap();
        let db_path = dir.path().join("test.db");
        let pool = create_pool(db_path.to_str().unwrap()).unwrap();
        let store = FingerprintStore::new(pool).unwrap();
        (store, dir)
    }

    #[test]
    fn test_put_and_get() {
        let (store, _dir) = test_store();
        let fp = make_fp("src/main.rs");

        store.put(&fp, None).unwrap();
        let retrieved = store.get("src/main.rs", None).unwrap();

        assert!(retrieved.is_some());
        let r = retrieved.unwrap();
        assert_eq!(r.path, fp.path);
        assert_eq!(r.content_hash, fp.content_hash);
    }

    #[test]
    fn test_put_with_commit() {
        let (store, _dir) = test_store();
        let fp = make_fp("src/lib.rs");

        store.put(&fp, Some("abc123")).unwrap();
        let retrieved = store.get("src/lib.rs", Some("abc123")).unwrap();

        assert!(retrieved.is_some());

        // Should not find without commit
        let not_found = store.get("src/lib.rs", None).unwrap();
        assert!(not_found.is_none());
    }

    #[test]
    fn test_batch_put() {
        let (store, _dir) = test_store();
        let fps = vec![
            make_fp("a.rs"),
            make_fp("b.rs"),
            make_fp("c.rs"),
        ];

        let count = store.put_batch(&fps, Some("commit1")).unwrap();
        assert_eq!(count, 3);

        let list = store.list_by_commit(Some("commit1")).unwrap();
        assert_eq!(list.len(), 3);
    }

    #[test]
    fn test_cache_hit() {
        let (store, _dir) = test_store();
        let fp = make_fp("cached.rs");

        store.put(&fp, None).unwrap();

        // First get fills cache
        store.get("cached.rs", None).unwrap();

        // Check cache stats
        let stats = store.cache_stats();
        assert!(stats.entry_count > 0);
    }

    #[test]
    fn test_baseline_export_import() {
        let (store, _dir) = test_store();
        let fps = vec![make_fp("x.rs"), make_fp("y.rs")];
        store.put_batch(&fps, Some("v1")).unwrap();

        // Export
        let baseline = store.export_to_baseline(Some("v1")).unwrap();
        assert_eq!(baseline.files.len(), 2);
        assert_eq!(baseline.git_commit_hash, Some("v1".to_string()));

        // Create new store and import
        let dir2 = TempDir::new().unwrap();
        let db_path2 = dir2.path().join("test2.db");
        let pool2 = create_pool(db_path2.to_str().unwrap()).unwrap();
        let store2 = FingerprintStore::new(pool2).unwrap();

        let imported = store2.import_from_baseline(&baseline).unwrap();
        assert_eq!(imported, 2);

        let list = store2.list_by_commit(Some("v1")).unwrap();
        assert_eq!(list.len(), 2);
    }

    #[test]
    fn test_baseline_file_io() {
        let dir = TempDir::new().unwrap();
        let fp = make_fp("test.rs");

        let mut baseline = FingerprintBaseline::new(Some("abc".to_string()));
        baseline.add(&fp);

        let path = dir.path().join("baseline.json");
        baseline.save_to_file(&path).unwrap();

        let loaded = FingerprintBaseline::load_from_file(&path).unwrap();
        assert_eq!(loaded.files.len(), 1);
        assert!(loaded.files.contains_key("test.rs"));
    }

    #[test]
    fn test_stats() {
        let (store, _dir) = test_store();
        let fps = vec![make_fp("a.rs"), make_fp("b.rs")];
        store.put_batch(&fps, None).unwrap();

        let stats = store.get_stats(0).unwrap();
        assert_eq!(stats.total_files, 2);
        assert_eq!(stats.total_bytes, 200);
        assert_eq!(stats.total_lines, 20);
    }
}
