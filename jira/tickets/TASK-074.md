# TASK-074: 3层 RAG 检索策略 — pgvector + 全文检索 + CrossEncoder

**Ticket ID**: TASK-074
**Epic**: SELF-EVOLVE
**标题**: 借鉴 Archon：confluence/memory 知识库支持向量检索，Strategy Pattern 实现3层检索
**类型**: feature
**优先级**: P2
**重要性**: medium

**状态**: ready
**创建时间**: 2026-04-19
**创建者**: Master
**负责人**: 待认领

**依赖关系**:
- blocks: []
- blocked_by: []

---

## 背景 & 动机

Archon 实现了3层渐进式 RAG 检索：纯向量 → 向量+全文混合 → CrossEncoder 重排序。EKET 目前知识库（`confluence/memory/`）只有文件系统搜索（`grep`），无语义检索能力，Slaver 复盘时的经验沉淀难以被后续 Slaver 自动发现和利用。

---

## 需求

### 验收标准

- **AC-1**: `node/src/core/sqlite-client.ts` 新增 `knowledge_embeddings` 表（SQLite，用 JSON 存向量）
- **AC-2**: 新建 `node/src/core/rag-search.ts`，实现 `SearchStrategy` 接口 + 2种策略：
  - `KeywordSearchStrategy`：基于 SQLite FTS5 全文检索
  - `VectorSearchStrategy`：余弦相似度（纯 JS 实现，不依赖 pgvector）
- **AC-3**: 新增 `node/src/commands/knowledge:index` 命令，扫描 `confluence/memory/**/*.md` → 分块 → 写入 SQLite
- **AC-4**: 新增 `node/dist/index.js knowledge:search "<query>"` 命令，返回 Top-5 相关片段
- **AC-5**: 单元测试：写入3条知识、搜索关键词命中正确片段

### Schema

```sql
-- SQLite FTS5 全文检索表
CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_fts USING fts5(
  doc_id,
  content,
  source_path
);

-- 向量存储（JSON 数组）
CREATE TABLE IF NOT EXISTS knowledge_embeddings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  doc_id TEXT NOT NULL,
  content TEXT NOT NULL,
  source_path TEXT NOT NULL,
  embedding TEXT NOT NULL,  -- JSON number array
  created_at TEXT DEFAULT (datetime('now'))
);
```

### 技术方案

```typescript
interface SearchStrategy {
  search(query: string, topK: number): Promise<SearchResult[]>;
}

class KeywordSearchStrategy implements SearchStrategy {
  // SQLite FTS5: SELECT * FROM knowledge_fts WHERE knowledge_fts MATCH ?
}

class VectorSearchStrategy implements SearchStrategy {
  // 余弦相似度: dot(a,b) / (|a| * |b|)
  // 向量生成：调用 Claude /embed API 或本地 hash（降级）
}
```

---

## 测试命令

```bash
cd node && npm test -- --testPathPattern=rag-search
node dist/index.js knowledge:index
node dist/index.js knowledge:search "session resume 降级"
```

## 回滚

新增表和命令，不影响现有功能。
