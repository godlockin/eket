**Ticket ID**: TASK-229
**标题**: [P0] workflow-engine Phase 2c — recover() 从 checkpoint 恢复
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

实现 `WorkflowEngine::recover(ticket_id)`：
1. 从 SQLite `execution_checkpoints` 读取最后 checkpoint
2. 重建 `WorkflowState`
3. 若 state = in_progress + 无 heartbeat > 5min → escalate（发送 BLOCKED 事件）
4. 返回 `RecoveryResult { recovered: bool, state, reason }`

`task:resume` 命令接入 recover()。

## 2. 验收标准

- [x] recover() 恢复 in_progress 状态；验证：`cargo test -p eket-engine -- workflow_recover_inprogress` ✅
- [x] 无 heartbeat 5min 触发 escalate；验证：`cargo test -p eket-engine -- workflow_recover_escalate` ✅
- [x] task:resume 命令注册并输出 JSON；`cargo build -p eket-cli` ✅

## 3. 依赖关系
### 3.1 前置：TASK-228
### 3.2 阻塞：无

## 4. 时间追踪
| 预估时间 | 480 分钟 |

## 5. 执行日志
**deferred_issues**: 无

### 实现摘要
- `TicketEngine::recover()` 已存在于 `ticket_engine.rs`，逻辑完整：
  - CREATE TABLE IF NOT EXISTS execution_checkpoints（含 PRIMARY KEY(ticket_id, slaver_id)）
  - SELECT latest checkpoint → parse WorkflowState
  - in_progress + age>5min → broadcast ESCALATE WorkflowEvent，reason 含"ESCALATE"
  - 无记录 → recovered=false, reason="no checkpoint found"
- `crates/eket-cli/src/commands/task_resume.rs` 已实现，注册为 `task:resume`
- 3 recover 测试全绿：`workflow_recover_no_checkpoint`, `workflow_recover_inprogress`, `workflow_recover_escalate`
- `cargo build -p eket-cli` 零错误
