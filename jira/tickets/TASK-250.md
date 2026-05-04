# TASK-250: HNSW 向量检索层 — expertise dispatch 语义升级

**状态**: todo
**优先级**: P0
**预估工时**: 480min
**负责人**: —
**创建时间**: 2026-05-04
**所需专家**: rust
**依赖**: —
**阻塞**: TASK-252

---

## 背景

来源：ruflo 借鉴研究。当前 `expertise-aware dispatch` 基于标签精确匹配（role == tag 得 2 分，skills 包含得 1 分），无法处理语义相近但标签不完全一致的情况（如 ticket 要求 `backend`，slaver role 是 `node` 但 skills 含 `backend`）。ruflo 使用 HNSW 向量索引实现 sub-millisecond agent 记忆检索，思路可直接用于 slaver 选择。

## 需求

将 slaver 的 `role + skills` 编码为向量，ticket 的 `required_expertise` 也编码为查询向量，通过 HNSW Top-K 检索替代当前遍历评分，提升语义匹配精度与扩展性。

## 验收标准

- [ ] 新增 `eket-engine/src/memory/vector_store.rs`：
  - 封装 `hnsw-rs` crate，提供 `upsert(id, embedding)` / `query(embedding, k) -> Vec<(id, score)>`
  - embedding 维度可配置（默认 64d，用 TF-IDF bag-of-words 简易编码，不依赖外部 LLM）
- [ ] 新增 `eket-core/src/expertise_embedding.rs`：
  - `encode_tags(tags: &[String]) -> Vec<f32>`：将 skills/role 标签转为 64d 向量（字符哈希 + L2 归一化）
  - `cosine_similarity(a, b) -> f32`
- [ ] 修改 `master_heartbeat.rs` 中 `best_matching_slaver`：
  - 优先走向量相似度查询（如 HNSW 初始化失败则 fallback 到现有标签评分）
  - 相似度阈值 0.7 以上才视为匹配
- [ ] `eket system:doctor` 输出向量存储状态（已索引 slaver 数）
- [ ] 单测：`vector_store_upsert_and_query`、`expertise_embedding_encodes_tags`、`heartbeat_uses_vector_fallback`
- [ ] 性能目标：1000 slaver 实例下 dispatch 决策 < 5ms

## 实现要点

```toml
# eket-engine/Cargo.toml
hnsw-rs = "0.3"
```

```rust
// expertise_embedding.rs
pub fn encode_tags(tags: &[String]) -> Vec<f32> {
    // 64 维：每个 tag 哈希后映射到若干维度叠加，L2 归一化
}
```

- HNSW 索引在 heartbeat 启动时从 DB 全量 slaver 构建，增量 upsert
- 索引存内存（不持久化），重启后重建（< 100ms for 10k slavers）
- fallback：HNSW 不可用 → 现有 `best_matching_slaver` 标签评分

## 知识沉淀

完成后记录到 `confluence/memory/patterns/expertise-tag-design.md`（向量检索升级小节）。
