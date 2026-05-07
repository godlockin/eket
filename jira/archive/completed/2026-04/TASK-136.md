# TASK-136: [Rust] knowledge-base + recommender — FTS + TF-IDF

## 元数据
- **状态**: done
- **类型**: feature
- **优先级**: P1
- **负责人**: 待认领
- **创建时间**: 2026-04-21
- **依赖**: []
- **blocked_by**: [TASK-135]

## 背景

TS `knowledge-base.ts`(22.5KB) 基于 SQLite FTS5 存储复盘/知识，`recommender.ts`(14.7KB) 用 TF-IDF 推荐相关 ticket/经验。
是 `eket recommend` 和 `eket knowledge:search` 命令的底层。

## 验收标准

- [ ] `rust/crates/eket-engine/src/knowledge.rs` 实现 `KnowledgeBase`
- [ ] SQLite FTS5 虚拟表：`knowledge_fts(id, title, content, tags, ticket_id, created_at)`
- [ ] `index(entry)` → INSERT into FTS5 表
- [ ] `search(query, limit)` → FTS5 MATCH 查询，返回相关度排序结果
- [ ] `get(id)` / `delete(id)` / `list(filter)`
- [ ] `rust/crates/eket-engine/src/recommender.rs` 实现 `Recommender`
- [ ] `recommend(ticket_content, existing_tickets, k=5)` → `Vec<RecommendResult>` — TF-IDF 余弦相似度
- [ ] `TF-IDF` 纯 Rust 实现（不依赖 ML 库）：分词（空格+标点），计算词频，余弦相似
- [ ] CLI `eket recommend <ticket-id>` 命令（在 eket-cli 新增）
- [ ] CLI `eket knowledge:search "<query>"` 命令
- [ ] 单元测试 ≥ 6 条：FTS 精确匹配、中文分词（按字符）、TF-IDF 相似度排序、空库返回空

## 技术要点

- SQLite FTS5：`rusqlite` 支持，`CREATE VIRTUAL TABLE knowledge_fts USING fts5(...)`
- TF-IDF：`tf(t,d) = count(t in d) / len(d)`，`idf(t) = log(N / df(t) + 1)`
- 中文：按字符 unigram（不做分词），bigram 提高精度
- **不引入 tantivy**（避免大依赖），用 SQLite FTS5 足够
