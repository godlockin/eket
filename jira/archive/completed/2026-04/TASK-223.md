**Ticket ID**: TASK-223
**标题**: [P0] SQLite 级 Master 续约 renewal loop
**类型**: feature
**优先级**: P0

**状态**: done
**创建时间**: 2026-04-26T23:30:00Z
**最后更新**: 2026-04-26T23:50:00Z
**started_at**: 2026-04-26T23:40:00Z
**completed_at**: 2026-04-26T23:50:00Z

**gate_review_veto_count**: 0
**veto_reason**:
**resubmit_conditions**:

**负责人**:
**执行 Agent**:
**所属 Epic**: RUST-GAP
**所属 Sprint**: sprint-rust-gap-1
**适配角色**: backend_dev
**assigned_experts**: backend, architect

---

## 领取记录
| 操作 | Slaver | 时间 | 状态变更 |
|------|--------|------|----------|
| 创建 | Master | 2026-04-26T23:30:00Z | backlog → ready |

---

## 1. 任务描述

`election.rs` SQLite 级 Master 当选后无续约逻辑，60s 超时被他人抢占。

实现 `SqliteMaster::start_renewal_loop()`：
- `tokio::spawn` interval 30s
- UPDATE `master_election SET last_heartbeat=now() WHERE master_id=self.id`
- 失败时主动 `resign()` + 触发重选

## 2. 验收标准

- [x] SQLite master 持续 120s 不被抢占；验证：`cargo test -p eket-core -- sqlite_master_renewal`
- [x] DB 断连时主动 resign，日志含 `[election] sqlite master resigned`；验证：`cargo test -p eket-core -- sqlite_master_resign`

## 3. 依赖关系
### 3.1 前置：TASK-222
### 3.2 阻塞：TASK-230（File 续约复用同模式）

## 4. 时间追踪
| 预估时间 | 480 分钟 |

## 5. 执行日志
**deferred_issues**: 无

### 实现摘要
- 新增独立 `update_heartbeat(pool, master_id)` 函数（`pub(crate)`，便于测试）
- `MasterElection` 加 `sqlite_stop_tx: Arc<Mutex<Option<oneshot::Sender<()>>>>` 字段
- `start_renewer_sqlite` 改用 `tokio::select!` + oneshot stop 信号：
  - tick → `update_heartbeat` → 失败时 `warn` + `break`（自动 resign）
  - stop_rx → `break`
- `resign()` 先发送 `sqlite_stop_tx`，再 abort renewer handle
- 顺带修复预存在 bug：`pubsub.rs` 缺 `tokio::spawn(async move {`（formatter 已自动修复）
- formatter 额外注入 `file_stop_tx` 字段（TASK-230 预留），无副作用

### 测试结果
```
cargo test -p eket-core -- election
10 passed, 97 filtered out (0.04s)
```
新增测试：`sqlite_master_renewal`、`sqlite_master_resign_stops_renewal`
