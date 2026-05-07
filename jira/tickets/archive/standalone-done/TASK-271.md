# TASK-271: 修复 task:claim 条件失败 - status='ready' 改为 IN ('todo','ready')

## 元数据
- **状态**: done
- **类型**: feature
- **优先级**: P0
- **负责人**: slaver_rust_backend
- **创建时间**: 2026-05-05
- **完成时间**: 2026-05-05
- **依赖**: []
- **所需专家**: rust, backend
- blocked_by: []
- required_expertise: [rust, backend]

## 背景

`eket task:claim` 使用的 HTTP API 在 `eket-server` 中执行 SQL `WHERE status='ready'`，无法匹配 `task:create` 创建的 `status='todo'` ticket（MD 文件默认状态），导致 DB 更新失败（返回 0 rows），Master 无法追踪 ticket 状态。

## 技术方案

**修改位置**：`rust/crates/eket-server/src/lib.rs:385`（`claim_task_handler` 函数）

**改动**：
```rust
// 改前
"UPDATE tickets SET status='in_progress', assignee=?1, updated_at=?2
 WHERE id=?3 AND status='ready'"

// 改后（移除 updated_at + 多状态支持）
"UPDATE tickets SET status='in_progress', assignee=?1
 WHERE id=?2 AND status IN ('todo', 'ready', 'backlog')"
```

**额外修改**：移除 `updated_at` 列引用（当前 DB schema 缺失此列，避免运行时错误）。

## 测试结果

手动 SQL 验证通过：
- todo 状态 → in_progress ✅（1 row updated）
- ready 状态 → in_progress ✅（1 row updated）
- backlog 状态 → in_progress ✅（1 row updated）
- done 状态不更新 ✅（0 rows updated）

## 问题诊断

**现状**：`eket task:claim TASK-NNN` 执行 SQL：
```sql
UPDATE tickets SET status='in_progress', assignee=?1, updated_at=?2
WHERE id=?3 AND status='ready'
```

**问题**：`task:create` 创建的 ticket 初始 status 是 `'todo'`（从 MD 文件解析），不是 `'ready'`，导致 WHERE 条件不匹配，UPDATE 0 rows。

**影响**：
- claim 成功更新 MD 文件状态为 `in_progress` ✅
- 但 DB 状态仍为空或 `todo`，Master 无法追踪 ❌

---

## 验收标准

- [x] 找到 `task:claim` SQL 执行代码（位于 `rust/crates/eket-server/src/lib.rs:385`）
- [x] 修改 WHERE 条件为 `WHERE id=?2 AND status IN ('todo', 'ready', 'backlog')`
- [x] 移除 `updated_at` 列（DB schema 缺失此字段）
- [x] 测试流程通过：
  - todo 状态 → in_progress ✅
  - ready 状态 → in_progress ✅
  - backlog 状态 → in_progress ✅
  - done 状态不更新 ✅

---

## 技术参考

**已知 SQL**（从 `eket` binary strings 提取）：
```sql
UPDATE tickets SET status='in_progress', assignee=?1, updated_at=?2
WHERE id=?3 AND status='ready'  -- 这里需要改
```

**Rust 代码路径推测**：
- `crates/eket-cli/src/commands/task_claim.rs`
- `crates/eket-core/src/db/mod.rs`（可能有 `claim_ticket()` 函数）
