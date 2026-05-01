/// StepSnapshot — ToC快照模式
///
/// 历史步骤数据归档到 SQLite（FTS5 索引），context 只保留 ToC 索引。
/// 对应 TASK-211。
use std::collections::HashMap;

use chrono::{DateTime, Utc};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use tracing::debug;

use eket_core::error::EketResult;

// ─── Struct ──────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StepSnapshot {
    pub workflow_id: String,
    pub step_id: String,
    /// LLM生成或取 data["summary"] 字段，max 200 字符
    pub summary: String,
    /// 从 data key 列表自动提取
    pub tags: Vec<String>,
    /// 完整数据 JSON 序列化
    pub full_data_json: String,
    pub created_at: DateTime<Utc>,
}

/// ToC 索引条目（写入 context.data["__history_index"]）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HistoryIndexEntry {
    pub step_id: String,
    pub summary: String,
}

// ─── Store ────────────────────────────────────────────────────────────────────

pub struct StepSnapshotStore {
    conn: Connection,
}

impl StepSnapshotStore {
    /// 新建内存或文件 SQLite 连接并初始化表
    pub fn new_in_memory() -> EketResult<Self> {
        let conn = Connection::open_in_memory()?;
        let store = Self { conn };
        store.init_table()?;
        Ok(store)
    }

    pub fn new(path: &str) -> EketResult<Self> {
        let conn = Connection::open(path)?;
        let store = Self { conn };
        store.init_table()?;
        Ok(store)
    }

    /// CREATE TABLE + FTS5 虚拟表
    pub fn init_table(&self) -> EketResult<()> {
        self.conn.execute_batch(
            "
            CREATE TABLE IF NOT EXISTS workflow_step_snapshots (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                workflow_id TEXT NOT NULL,
                step_id     TEXT NOT NULL,
                summary     TEXT NOT NULL,
                tags        TEXT NOT NULL,   -- JSON array
                full_data   TEXT NOT NULL,
                created_at  INTEGER NOT NULL  -- unix ms
            );

            CREATE INDEX IF NOT EXISTS idx_wss_workflow ON workflow_step_snapshots(workflow_id);

            -- FTS5 虚拟表：对 summary + tags 全文索引
            CREATE VIRTUAL TABLE IF NOT EXISTS workflow_step_snapshots_fts
            USING fts5(
                summary,
                tags,
                content='workflow_step_snapshots',
                content_rowid='id'
            );

            -- 触发器：插入时同步 FTS
            CREATE TRIGGER IF NOT EXISTS wss_fts_insert
            AFTER INSERT ON workflow_step_snapshots BEGIN
                INSERT INTO workflow_step_snapshots_fts(rowid, summary, tags)
                VALUES (new.id, new.summary, new.tags);
            END;
            ",
        )?;
        Ok(())
    }

    /// 归档步骤快照。
    /// 自动从 data["summary"] 提取摘要（max 200字符），从 data keys 提取 tags。
    pub fn archive_step(
        &self,
        workflow_id: &str,
        step_id: &str,
        data: &HashMap<String, serde_json::Value>,
    ) -> EketResult<()> {
        // 摘要：data["summary"] → 取 string，否则空字符串，截断到 200 字符
        let summary: String = data
            .get("summary")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .chars()
            .take(200)
            .collect();

        // tags：data 的所有 key（排除内部字段）
        let tags: Vec<String> = data
            .keys()
            .filter(|k| !k.starts_with("__"))
            .cloned()
            .collect();
        let tags_json = serde_json::to_string(&tags)?;

        let full_data_json = serde_json::to_string(data)?;
        let created_at_ms = Utc::now().timestamp_millis();

        self.conn.execute(
            "INSERT INTO workflow_step_snapshots
                (workflow_id, step_id, summary, tags, full_data, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![workflow_id, step_id, summary, tags_json, full_data_json, created_at_ms],
        )?;

        debug!("archived step snapshot: workflow={} step={}", workflow_id, step_id);
        Ok(())
    }

    /// FTS5 全文检索。返回匹配的快照列表（按相关性排序）。
    pub fn search_step_history(
        &self,
        workflow_id: &str,
        query: &str,
    ) -> EketResult<Vec<StepSnapshot>> {
        let mut stmt = self.conn.prepare(
            "SELECT s.workflow_id, s.step_id, s.summary, s.tags, s.full_data, s.created_at
             FROM workflow_step_snapshots s
             JOIN workflow_step_snapshots_fts fts ON fts.rowid = s.id
             WHERE s.workflow_id = ?1
               AND workflow_step_snapshots_fts MATCH ?2
             ORDER BY rank",
        )?;

        let rows = stmt.query_map(params![workflow_id, query], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, i64>(5)?,
            ))
        })?;

        let mut result = Vec::new();
        for row in rows {
            let (wid, sid, summary, tags_json, full_data_json, created_at_ms) = row?;
            let tags: Vec<String> = serde_json::from_str(&tags_json).unwrap_or_default();
            let created_at = DateTime::from_timestamp_millis(created_at_ms)
                .unwrap_or_else(Utc::now);
            result.push(StepSnapshot {
                workflow_id: wid,
                step_id: sid,
                summary,
                tags,
                full_data_json,
                created_at,
            });
        }
        Ok(result)
    }

    /// 获取某 workflow 的所有快照（按 id 升序，即步骤顺序）
    pub fn list_snapshots(&self, workflow_id: &str) -> EketResult<Vec<StepSnapshot>> {
        let mut stmt = self.conn.prepare(
            "SELECT workflow_id, step_id, summary, tags, full_data, created_at
             FROM workflow_step_snapshots
             WHERE workflow_id = ?1
             ORDER BY id ASC",
        )?;

        let rows = stmt.query_map(params![workflow_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, i64>(5)?,
            ))
        })?;

        let mut result = Vec::new();
        for row in rows {
            let (wid, sid, summary, tags_json, full_data_json, created_at_ms) = row?;
            let tags: Vec<String> = serde_json::from_str(&tags_json).unwrap_or_default();
            let created_at = DateTime::from_timestamp_millis(created_at_ms)
                .unwrap_or_else(Utc::now);
            result.push(StepSnapshot {
                workflow_id: wid,
                step_id: sid,
                summary,
                tags,
                full_data_json,
                created_at,
            });
        }
        Ok(result)
    }
}

// ─── Context helpers ──────────────────────────────────────────────────────────

/// 将步骤数据归档，并从 context.data 中移除该步骤的输出键（`{step_id}.output`），
/// 注入 ToC 索引。
///
/// 设计约定：只清理 `{completed_step_id}.output` 等步骤输出累积键，
/// 保留通用共享上下文字段（如 `history`），避免破坏跨步骤共享状态。
pub fn archive_and_compress_context(
    store: &StepSnapshotStore,
    workflow_id: &str,
    completed_step_id: &str,
    context_data: &mut HashMap<String, serde_json::Value>,
) -> EketResult<()> {
    // 1. 归档当前数据快照
    store.archive_step(workflow_id, completed_step_id, context_data)?;

    // 2. 摘要来自 context_data["summary"] 或步骤 id
    let summary: String = context_data
        .get("summary")
        .and_then(|v| v.as_str())
        .unwrap_or(completed_step_id)
        .chars()
        .take(200)
        .collect();

    // 3. 读取已有 ToC 索引，追加新条目
    let mut toc: Vec<HistoryIndexEntry> = context_data
        .get("__history_index")
        .and_then(|v| serde_json::from_value(v.clone()).ok())
        .unwrap_or_default();
    toc.push(HistoryIndexEntry { step_id: completed_step_id.to_string(), summary });

    // 4. 只移除该步骤的输出累积键（`{step_id}.output`），保留通用共享状态
    //    例：保留 "history"、"user_query" 等跨步骤共享字段
    let output_key = format!("{completed_step_id}.output");
    context_data.remove(&output_key);

    // 5. 更新 ToC 索引
    context_data.insert(
        "__history_index".to_string(),
        serde_json::to_value(&toc)?,
    );

    Ok(())
}

// ─── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn make_data(summary: &str, keys: &[(&str, &str)]) -> HashMap<String, serde_json::Value> {
        let mut m = HashMap::new();
        m.insert("summary".into(), serde_json::json!(summary));
        for (k, v) in keys {
            m.insert(k.to_string(), serde_json::json!(v));
        }
        m
    }

    #[test]
    fn archive_and_search_roundtrip() {
        let store = StepSnapshotStore::new_in_memory().unwrap();
        let data = make_data("analyzed user input for intent", &[("user_query", "hello world")]);
        store.archive_step("wf-1", "step-analyze", &data).unwrap();

        let results = store.search_step_history("wf-1", "intent").unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].step_id, "step-analyze");
        assert!(results[0].summary.contains("intent"));
    }

    #[test]
    fn fts5_keyword_hit() {
        let store = StepSnapshotStore::new_in_memory().unwrap();
        let d1 = make_data("fetched database records", &[("db_result", "rows")]);
        let d2 = make_data("generated report for client", &[("report", "pdf")]);
        store.archive_step("wf-2", "step-db", &d1).unwrap();
        store.archive_step("wf-2", "step-report", &d2).unwrap();

        // "database" should only hit step-db
        let results = store.search_step_history("wf-2", "database").unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].step_id, "step-db");

        // "report" should only hit step-report
        let results = store.search_step_history("wf-2", "report").unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].step_id, "step-report");
    }

    #[test]
    fn context_size_non_linear_growth() {
        // 10-step workflow: accumulated .output keys get removed after each step,
        // context.data does NOT grow linearly.
        let store = StepSnapshotStore::new_in_memory().unwrap();
        let mut ctx_data: HashMap<String, serde_json::Value> = HashMap::new();

        // Simulate 10 steps with large output payloads
        for i in 0..10usize {
            let large_value = "x".repeat(500);
            let step_id = format!("step-{i}");
            // inject the step's own output key (as workflow.rs does)
            ctx_data.insert(format!("{step_id}.output"), serde_json::json!(large_value));
            ctx_data.insert("summary".into(), serde_json::json!(format!("step {i} done")));

            archive_and_compress_context(&store, "wf-size", &step_id, &mut ctx_data).unwrap();
        }

        // Final context.data should have __history_index (10 entries) + summary
        let toc: Vec<HistoryIndexEntry> = ctx_data
            .get("__history_index")
            .and_then(|v| serde_json::from_value(v.clone()).ok())
            .unwrap_or_default();
        assert_eq!(toc.len(), 10, "ToC should have 10 entries");

        // Context size should be much smaller than 10 × 500 chars of raw outputs
        let ctx_json = serde_json::to_string(&ctx_data).unwrap();
        let full_size_estimate = 10 * 500;
        assert!(
            ctx_json.len() < full_size_estimate,
            "context size {} should be < linear estimate {}",
            ctx_json.len(),
            full_size_estimate
        );

        // All 10 steps archived in SQLite
        let snapshots = store.list_snapshots("wf-size").unwrap();
        assert_eq!(snapshots.len(), 10);
    }

    #[test]
    fn archive_compress_removes_output_key() {
        let store = StepSnapshotStore::new_in_memory().unwrap();
        let mut data: HashMap<String, serde_json::Value> = HashMap::new();
        data.insert("step-1.output".into(), serde_json::json!("big output"));
        data.insert("shared_field".into(), serde_json::json!("stays"));
        archive_and_compress_context(&store, "wf-3", "step-1", &mut data).unwrap();

        // step output key removed
        assert!(!data.contains_key("step-1.output"));
        // shared field preserved
        assert!(data.contains_key("shared_field"));
        // __history_index present
        assert!(data.contains_key("__history_index"));
    }
}
