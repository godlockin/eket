**Ticket ID**: TASK-232
**标题**: [P0] gate-review APPROVE 流程 + force-approve（veto≥2）
**类型**: feature
**优先级**: P0

**状态**: done
**创建时间**: 2026-04-26T23:30:00Z
**最后更新**: 2026-04-26T23:55:00Z
**started_at**: 2026-04-26T23:45:00Z
**completed_at**: 2026-04-26T23:55:00Z

**gate_review_veto_count**: 0
**veto_reason**:
**resubmit_conditions**:

**负责人**: slaver_backend_dev
**执行 Agent**: claude-sonnet-4-5
**所属 Epic**: RUST-GAP
**所属 Sprint**: sprint-rust-gap-1
**适配角色**: backend_dev
**assigned_experts**: backend, architect, tester

---

## 领取记录
| 操作 | Slaver | 时间 | 状态变更 |
|------|--------|------|----------|
| 创建 | Master | 2026-04-26T23:30:00Z | backlog → ready |
| 领取 | slaver_backend_dev | 2026-04-26T23:45:00Z | ready → in_progress |
| 完成 | slaver_backend_dev | 2026-04-26T23:55:00Z | in_progress → done |

---

## 1. 任务描述

在 TASK-225 基础上，实现 gate-review APPROVE 完整路径：
1. APPROVE → 状态 `gate_review → in_progress`，写 `started_at = now()`
2. 写 SQLite `gate_review_log(ticket_id, reviewer, action, timestamp)`（建表 migration）
3. `gate_review_veto_count >= 2` 时第 3 次自动强制 APPROVE，output `force_approved: true`
4. 输出 JSON `{"status":"approved","force_approved":false,"started_at":"..."}`

## 2. 验收标准

- [x] APPROVE 后状态变 in_progress；验证：`cargo test -p eket-cli -- gate_review_approve` ✅
- [x] started_at 写入 ticket；验证：`cargo test -p eket-cli -- gate_review_started_at` ✅
- [x] veto≥2 第3次强制 APPROVE；验证：`cargo test -p eket-cli -- gate_review_force` ✅
- [x] JSON 含 force_approved 字段；验证：`cargo test -p eket-cli -- gate_review_json` ✅

## 3. 依赖关系
### 3.1 前置：TASK-225, TASK-222
### 3.2 阻塞：无

## 4. 时间追踪
| 预估时间 | 480 分钟 |
| 实际时间 | ~30 分钟 |

## 5. 执行日志

### 分析报告
- gate_review.rs 已被 TASK-225 建立（VETO 逻辑完整）
- 在其基础上扩展 APPROVE 路径，保留所有 VETO 代码

### 实现细节
- `run_approve_writeback()`: 核心函数，读 ticket MD → 检测 veto_count → 更新状态/started_at → 写文件（原子 tmp+rename）→ 写 gate_review_log
- `ensure_gate_review_log()`: CREATE TABLE IF NOT EXISTS，lazy migration
- `log_gate_review_action()`: best-effort，任何错误静默忽略（graceful degrade）
- `run()` 中 `--approve` flag 触发完整路径，`--db-path` 可选
- force_approved = veto_count >= 2（第3次 approve 时自动为 true）
- 修复 eket-core/lib.rs 缺少 `pubsub` 模块声明（pre-existing bug，pubsub.rs 存在但未声明）

### 测试结果
```
cargo test -p eket-cli -- gate_review
4 passed, 45 filtered out (1 suite, 0.00s)

cargo test -p eket-cli
49 passed (1 suite, 1.14s)
```

### 知识沉淀
- eket-core 有 pubsub.rs 但未在 lib.rs 声明 → election.rs 编译失败；需同步 lib.rs
- SqliteClient::pool() 返回 r2d2 pool，需 `.get()` 获取 conn，map_err 转换类型
- 原子写：write to `.md.tmp` + rename 保证不留残缺文件

**deferred_issues**:
- eket-server 有 unresolved `ticket_engine` import（TASK-235 相关，pre-existing）
