# TASK-236b: 红队修复 + TASK-003 收尾回灌（2 commit, 撞主战场）

## 元数据
- **状态**: blocked
- **类型**: bugfix
- **优先级**: P1
- **agent_type**: fullstack
- **estimate_hours**: 2
- **parent_epic**: EPIC-003
- **创建时间**: 2026-04-29
- **依赖**: TASK-230, TASK-232（必须先完成）
- **assigned_experts**: tech-architect, security-engineer

## 背景

原 TASK-236 拆出。slaver-006 实测发现：
- `30fc9fc7` 红队 17 项修复实际改动 `node/src/api/eket-server.ts` + `rust/crates/eket-core/{election,redis}.rs` + `rust/crates/eket-engine/src/workflow.rs`
- `c4fd2af4` TASK-003 complete 实际改动 `node/src/commands/set-role.ts` + `node/src/core/agent-pool.ts` + `rust/crates/eket-cli/**`

两者都撞 TASK-230 (rust/) + TASK-232 (node/src/) 主战场，必须等他们完成才能干净 cherry-pick。

## 详细描述

回灌范围（按时间顺序）：
- `4497a7d4` 已被 TASK-236a 处理 ❌（不重复）
- `1ae1f7ed` 已被 TASK-236a 处理 ❌（不重复）
- `30fc9fc7` 红队 17 项修复
- `c4fd2af4` TASK-003 complete

## 验收标准

- [ ] AC-1: TASK-230 + TASK-232 都已合 testing 后启动
- [ ] AC-2: 2 commit cherry-pick 到 testing，主战场冲突全部解决
- [ ] AC-3: `cd node && npm test` 全绿（验证 P1/P2 修复）
- [ ] AC-4: `cd rust && cargo test --workspace` 全绿（验证 P0 选举修复）
- [ ] AC-5: TASK-003 状态在 jira/state/active-tickets.json 标记 done
- [ ] AC-6: PR body 列 2 commit hash + 红队 17 项 issue 编号 + 测试结果

## observability
- logs: ["epic003.redteam17.backport_completed", "epic003.task003.completed"]
- metrics: ["redteam.fix.applied_count"]

## rollback_plan

revert PR 会重新引入红队 P0 选举正确性 + P1 并发安全问题，**不建议 rollback**。如有问题应做 forward fix。

## test_strategy
- unit: rust + node 全量
- integration: 选举正确性 + claim 流程
- regression: TASK-230/232 的 testing 不受影响

---

**状态**：⛔ BLOCKED ON TASK-230 + TASK-232
**触发条件**：TASK-230 + TASK-232 PR 都合入 testing 后状态改 todo

**类型**: Bugfix (回灌-含主战场)
**技能要求**: Rust / Node.js / 安全审计
**依赖**: TASK-230, TASK-232
**assigned_experts**: tech-architect, security-engineer

<!-- machine-readable fields -->
agent_type: fullstack
estimate_hours: 2
