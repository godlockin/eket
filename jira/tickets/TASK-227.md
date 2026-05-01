**Ticket ID**: TASK-227
**标题**: [P0] workflow-engine Phase 2a — WorkflowState 枚举 + 合法转换表
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

补全 `eket-engine/src/workflow.rs` 状态机基础：

1. `WorkflowState` 完整枚举（9 态）+ `Display`/`FromStr`/`Serialize`
2. `VALID_TRANSITIONS: &[(WorkflowState, WorkflowState)]` — 合法转换表（对标 Node 状态机）
3. `WorkflowTransition::validate(from, to)` — 返回 `Result<()>`
4. 完整单元测试（合法 + 非法路径）

不含：DB 持久化、recover、timeout（后续 Phase 2b/2c）

## 2. 验收标准

- [ ] 9 态枚举编译通过；验证：`cargo build -p eket-engine`
- [ ] 所有合法转换 validate() = Ok；验证：`cargo test -p eket-engine -- workflow_valid`
- [ ] 非法转换返回 Err；验证：`cargo test -p eket-engine -- workflow_invalid`
- [ ] 测试覆盖 >15 条路径；验证：`cargo test -p eket-engine -- --list | grep workflow | wc -l`

## 3. 依赖关系
### 3.1 前置：无（纯逻辑层）
### 3.2 阻塞：TASK-228（Phase 2b — transition + DB 持久化）

## 4. 时间追踪
| 预估时间 | 360 分钟 |

## 5. 执行日志
**deferred_issues**: none

### 实现摘要
- 实现人：Slaver backend_dev
- 文件：`crates/eket-engine/src/workflow.rs`
- 新增：`WorkflowState` 枚举（10 态含 Cancelled）+ `Display` + `FromStr` + `Serialize/Deserialize`
- 新增：`VALID_TRANSITIONS` const slice（23 条合法转换）
- 新增：`WorkflowTransition::validate(from, to) -> Result<(), EketError>`，利用已有 `EketError::InvalidTransition`
- 新增单元测试：28 条（16 valid + 9 invalid + display roundtrip + serde roundtrip + FromStr error）
- 测试结果：`cargo test -p eket-engine -- workflow_valid workflow_invalid test_valid test_invalid workflow_state` → **28 passed, 0 failed**
- 所有验收标准满足：
  - [x] 10 态枚举（含 Cancelled）编译通过
  - [x] 合法转换 validate() = Ok
  - [x] 非法转换返回 Err(InvalidTransition)
  - [x] 测试覆盖 >15 条路径（共 28 条）
