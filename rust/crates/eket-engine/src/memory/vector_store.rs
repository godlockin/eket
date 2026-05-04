//! vector_store.rs
//! 内存向量存储，支持 upsert / cosine Top-K 查询。
//!
//! TODO: 升级到 hnsw-rs 以获得 O(log N) 检索性能。
//! 当前为线性遍历，适合 slaver 数量 < 10k 的场景。
//!
//! 来源：ruflo 借鉴研究（TASK-250）。

use eket_core::expertise_embedding::cosine_similarity;

/// 内存向量存储。线程不安全，需外部通过 Arc<Mutex<VectorStore>> 保护。
pub struct VectorStore {
    // (instance_id, embedding)
    // TODO: 升级到 hnsw-rs crate 以支持 O(log N) 检索
    entries: Vec<(String, Vec<f32>)>,
}

impl VectorStore {
    pub fn new() -> Self {
        Self { entries: Vec::new() }
    }

    /// 插入或更新向量（按 id 去重）。
    pub fn upsert(&mut self, id: &str, embedding: Vec<f32>) {
        if let Some(pos) = self.entries.iter().position(|(k, _)| k == id) {
            self.entries[pos].1 = embedding;
        } else {
            self.entries.push((id.to_string(), embedding));
        }
    }

    /// 返回 cosine 相似度最高的 k 个结果，降序排列。
    pub fn query(&self, embedding: &[f32], k: usize) -> Vec<(String, f32)> {
        let mut scored: Vec<(String, f32)> = self
            .entries
            .iter()
            .map(|(id, emb)| (id.clone(), cosine_similarity(emb, embedding)))
            .collect();
        scored.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
        scored.truncate(k);
        scored
    }

    /// 已索引条目数量。
    pub fn len(&self) -> usize {
        self.entries.len()
    }

    pub fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }
}

impl Default for VectorStore {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use eket_core::expertise_embedding::encode_tags;

    #[test]
    fn test_vector_store_upsert_and_query() {
        let mut store = VectorStore::new();
        let rust_emb = encode_tags(&["rust".to_string()]);
        let fe_emb = encode_tags(&["frontend".to_string(), "js".to_string()]);
        store.upsert("slaver-rust", rust_emb.clone());
        store.upsert("slaver-fe", fe_emb);
        assert_eq!(store.len(), 2);

        let results = store.query(&rust_emb, 2);
        assert!(!results.is_empty());
        assert_eq!(results[0].0, "slaver-rust");
        assert!((results[0].1 - 1.0).abs() < 1e-5, "exact match should score ~1.0");
    }

    #[test]
    fn test_vector_store_upsert_deduplicates() {
        let mut store = VectorStore::new();
        store.upsert("s1", encode_tags(&["rust".to_string()]));
        store.upsert("s1", encode_tags(&["go".to_string()]));
        assert_eq!(store.len(), 1);
    }

    #[test]
    fn test_vector_store_empty_query() {
        let store = VectorStore::new();
        let results = store.query(&encode_tags(&["rust".to_string()]), 5);
        assert!(results.is_empty());
    }
}
