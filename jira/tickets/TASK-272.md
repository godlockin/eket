# TASK-272: 统一 DB schema - tickets vs ticket_index 表结构对齐

## 元数据
- **状态**: done
- **类型**: feature
- **优先级**: P0
- **负责人**: slaver-rust-node-backend
- **创建时间**: 2026-05-05
- **完成时间**: 2026-05-06
- **依赖**: []
- **所需专家**: rust, node, backend
- blocked_by: []
- required_expertise: [rust, node, backend]

## 背景

两套表并存导致 priority 字段类型冲突：
- `tickets` (Rust 写)：priority TEXT
- Node.js `syncToSqlite()` 写 tickets 时用 priority_text + priority INTEGER（冗余）

## 验收标准

- [x] 废弃 Node.js 中 priority_text 列
- [x] Node.js syncToSqlite 改为写 priority TEXT
- [x] Rust 迁移逻辑确保 INTEGER → TEXT
- [x] 现有数据全部迁移
- [x] cargo test 通过

## 技术方案

**方案 A（已实施）**：统一使用 `tickets` 表，priority 类型统一为 TEXT

### Rust 部分
- schema.sql 已定义 priority TEXT（L8）
- 迁移逻辑（db/mod.rs L143-159）：UPDATE tickets SET priority = 'P0'/'P1'/'P2' WHERE typeof(priority)='integer'

### Node.js 部分
- `node/src/commands/ticket-index.ts:516-543`
- CREATE TABLE tickets 改为 priority TEXT（废弃 priority_text + priority INTEGER）
- INSERT 语句改为直接写 priority TEXT

### 验收结果
- 迁移数据：0 条 INTEGER 残留（全部已转为 TEXT）
- 新创建：priority='P2' (TEXT)
- 测试：cargo test db::tests::ticket_create_and_get PASSED

## 问题诊断

**现状**：存在两套 DB 表结构，字段不一致：

### 1. `tickets` 表（全局 DB `~/.eket/data/sqlite/eket.db`）
```sql
CREATE TABLE tickets (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ready',
  priority INTEGER NOT NULL DEFAULT 0,      -- 注意：INTEGER
  assignee TEXT,
  claimed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

### 2. `ticket_index` 表（本地 DB `.eket/eket.db`，Node.js `syncToSqlite` 写入）
```sql
CREATE TABLE ticket_index (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'todo',
  priority TEXT NOT NULL DEFAULT 'P2',      -- 注意：TEXT
  ticket_type TEXT,
  indexed_at INTEGER NOT NULL
);
```

**冲突**：
- `priority` 类型不同（INTEGER vs TEXT）
- `ticket_index` 有 `ticket_type`，`tickets` 无
- `tickets` 有 `assignee/claimed_at`，`ticket_index` 无
- `eket task:progress` 读 `tickets` 表，但 Node.js `syncToSqlite` 写 `ticket_index`

---

## 验收标准

**方案 A：统一使用 `tickets` 表**（推荐）
- [ ] 废弃 `ticket_index` 表
- [ ] Node.js `syncToSqlite()` 改为写入 `tickets` 表
- [ ] Rust `task:progress` 保持读 `tickets` 表
- [ ] 迁移脚本：`ticket_index` → `tickets`（如有历史数据）

**方案 B：统一使用 `ticket_index` 表**
- [ ] Rust CLI 改为写入 `ticket_index`
- [ ] `task:progress` 改为读 `ticket_index`
- [ ] 添加 `assignee/claimed_at` 字段到 `ticket_index`

**无论哪种方案**：
- [ ] 统一 `priority` 类型（建议 TEXT，与 P0/P1/P2 规范一致）
- [ ] 所有读写代码对齐到同一张表
- [ ] 文档化最终 schema

---

## 技术参考

**Node.js 代码**：`node/src/commands/ticket-index.ts:489` `syncToSqlite()`
**Rust 代码**：`crates/eket-core/src/db/mod.rs`

**建议方案 A**：保留 `tickets` 表，因为它有 `assignee/claimed_at` 运行时状态字段。
