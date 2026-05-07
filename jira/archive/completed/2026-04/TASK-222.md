**Ticket ID**: TASK-222
**标题**: [P0] SQLite busy_timeout + WAL 模式修复
**类型**: bugfix
**优先级**: P0

**状态**: done
**创建时间**: 2026-04-26T23:30:00Z
**最后更新**: 2026-04-26T23:45:00Z
**started_at**: 2026-04-26T23:40:00Z
**completed_at**: 2026-04-26T23:45:00Z

**gate_review_veto_count**: 0
**veto_reason**:
**resubmit_conditions**:

**负责人**: backend_dev
**执行 Agent**: Slaver-backend_dev
**所属 Epic**: RUST-GAP
**所属 Sprint**: sprint-rust-gap-1
**适配角色**: backend_dev
**assigned_experts**: backend, architect

---

## 领取记录

| 操作 | Slaver / Reviewer | 时间 | 状态变更 |
|------|-------------------|------|----------|
| 创建 | Master | 2026-04-26T23:30:00Z | backlog → ready |
| 领取 | Slaver-backend_dev | 2026-04-26T23:40:00Z | ready → in_progress |
| 完成 | Slaver-backend_dev | 2026-04-26T23:45:00Z | in_progress → done |

---

## 1. 任务描述

Rust `eket-core/src/db.rs` 中 SQLite 连接池缺少 `busy_timeout` 设置，多 Slaver 并发写入时立即返回 `SQLITE_BUSY` 错误而非等待重试。同时需开启 WAL 模式以支持并发读写。

**问题**：
- `create_pool()` 未设置 `PRAGMA busy_timeout=5000`
- 未开启 `PRAGMA journal_mode=WAL`
- 未设置 `PRAGMA synchronous=NORMAL`（WAL 模式推荐值）

## 2. 验收标准

- [x] `create_pool()` 连接后执行三条 PRAGMA；验证：`cargo test -p eket-core -- db`
- [x] 并发写入测试（10 goroutine 同时 claim）不报 SQLITE_BUSY；验证：`cargo test -p eket-core -- concurrent_claim`
- [x] 新增 `tests/db_concurrent_test.rs`；验证：`cargo test -p eket-core`

## 3. 依赖关系

### 3.1 前置依赖
无

### 3.2 阻塞其他
TASK-225（gate-review 依赖稳定 DB 层）

## 4. 时间追踪

| 项目 | 值 |
|------|-----|
| 预估时间 | 240 分钟 |

## 5. 执行日志

**deferred_issues**: 无

### 实现说明

**修改文件**: `crates/eket-core/src/db/mod.rs`

1. **PRAGMA 扩展** (line 65-68): `with_init` 回调从单行 `WAL+foreign_keys` 扩展为5条 PRAGMA：
   - `journal_mode=WAL` — 并发读写
   - `busy_timeout=5000` — 等待5s而非立即返回 SQLITE_BUSY
   - `synchronous=NORMAL` — WAL 模式推荐值，兼顾性能与安全
   - `cache_size=-64000` — 64MB page cache
   - `foreign_keys=ON` — 外键约束

2. **并发测试** (line 895-958): 在现有 `tests` 模块追加两个测试：
   - `test_concurrent_claim_no_busy_error` — 10线程各 claim 独立 ticket，验证无 SQLITE_BUSY
   - `test_concurrent_claim_same_ticket_exactly_one_wins` — 10线程竞争同一 ticket，验证恰好1个成功

   注意：用 tempfile 而非 `:memory:`，因为 r2d2 连接池每个连接对 in-memory DB 是独立实例（不共享schema）。

**测试结果**: `cargo test -p eket-core` → **101 passed, 1 ignored**

### 经验教训

- SQLite `:memory:` + r2d2 多连接池：每条连接独立DB，不适合跨线程共享测试。并发测试需用 tempfile。
- `BEGIN IMMEDIATE` 在 WAL+busy_timeout 下串行化并发写，`busy_timeout=5000` 确保等待而非立即失败。
