# TASK-135: [Rust] sqlite-client 完整 CRUD — ticket/agent/session/retro

## 元数据
- **状态**: todo
- **类型**: feature
- **优先级**: P1
- **负责人**: 待认领
- **创建时间**: 2026-04-21
- **依赖**: []
- **blocked_by**: []

## 背景

TS `sqlite-client.ts`(37.6KB) + `sqlite-async-client.ts`(25.8KB) 是完整的数据访问层。
现有 Rust `db/mod.rs` 仅实现 claim_atomic + 极少数查询，约 20% 覆盖。
其余 CRUD 操作（ticket CRUD、agent 状态、session 管理、retro 记录）全部缺失，阻塞上层功能。

## 验收标准

- [ ] 扩展 `rust/crates/eket-core/src/db/mod.rs`（或拆分 tickets.rs/agents.rs/sessions.rs）
- [ ] **Ticket CRUD**: `create_ticket`, `get_ticket`, `list_tickets(filter)`, `update_ticket_status`, `update_ticket_assignee`, `delete_ticket`
- [ ] **Agent/Instance**: `upsert_instance`, `get_instance`, `list_instances(role_filter)`, `update_instance_status`, `delete_instance`
- [ ] **Session**: `create_session`, `get_session`, `list_sessions`, `update_session`
- [ ] **Retro/知识**: `insert_retro`, `list_retros`, `search_retros(keyword)` — LIKE 全文
- [ ] **Schema 初始化**: `SqliteClient::new()` 时自动建表（idempotent CREATE TABLE IF NOT EXISTS）
- [ ] 单元测试 ≥ 10 条，每类 CRUD 至少 1 条

## 技术要点

- 所有写操作用 `spawn_blocking` + 已有 r2d2 pool
- `list_tickets` 支持 filter：`{ status, assignee, priority }` → WHERE 子句动态拼接
- retro 表：`(id TEXT PK, ticket_id, content TEXT, tags TEXT, created_at INTEGER)`
- 与 TS 保持相同字段名（camelCase → snake_case 映射），方便互通
