# TASK-234: TASK-214~221 红队修复 + 经验文档回灌 main

## 元数据
- **状态**: todo
- **类型**: bugfix
- **优先级**: P1
- **agent_type**: fullstack
- **estimate_hours**: 2
- **parent_epic**: EPIC-003
- **创建时间**: 2026-04-29
- **依赖**: TASK-233
- **assigned_experts**: tech-architect, security-engineer

## 背景

EPIC-003 第 5 步。miao 上 2 个 commit 是红队 audit 的 P0/P1/P2 修复 + 经验沉淀，必须等 TASK-232/233 合完才有意义（修的就是这些功能里的 bug）。

## 详细描述

回灌范围：
- `cfb7bf44` TASK-214~221 红队修复 — P0 tokio::sync::Mutex + P1×7 + P2×6
- `edfe612e` TASK-214~221 经验教训 — red-team-bug-patterns.md

## 验收标准

- [ ] AC-1: 2 commit cherry-pick 到 testing
- [ ] AC-2: `confluence/memory/red-team-bug-patterns.md` 在 main 上存在
- [ ] AC-3: `cd rust && cargo test --workspace` 仍 296 全绿（验证 P0 tokio Mutex 修复无回归）
- [ ] AC-4: `cd node && npm test` 全绿（验证 P1/P2 修复无回归）
- [ ] AC-5: PR body 列出修复对应的 P0/P1/P2 红队 issue 编号

## observability
- logs: ["epic003.redteam.backport_completed"]
- metrics: ["redteam.fix.applied_count"]

## rollback_plan

revert PR 会重新引入红队发现的 bug，**不建议 rollback**。如有问题应做 forward fix 而非 rollback。

## test_strategy
- unit: rust + node 全量
- integration: 重跑 TASK-232/233 的 integration tests
- regression: 红队 P0~P2 issue 列表逐条验证修复仍生效

---

**类型**: Bugfix (回灌)
**技能要求**: Rust / Node.js / 安全审计
**依赖**: TASK-233
**assigned_experts**: tech-architect, security-engineer

<!-- machine-readable fields -->
agent_type: fullstack
estimate_hours: 2
