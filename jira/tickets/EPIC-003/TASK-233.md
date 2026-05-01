# TASK-233: TASK-197~213 (context-mode / MemOS / claude-context) 回灌 main

## 元数据
- **状态**: todo
- **类型**: feature
- **优先级**: P1
- **agent_type**: fullstack
- **estimate_hours**: 4
- **parent_epic**: EPIC-003
- **创建时间**: 2026-04-29
- **依赖**: TASK-232
- **assigned_experts**: tech-architect

## 背景

EPIC-003 第 4 步。miao 上 4 个 commit 实现 openai-agents-python / MemOS / claude-context 三个上游研究的借鉴落地，依赖 TASK-232 的 SQLite trace 基础设施。

## 详细描述

回灌范围（按 hash）：
- `2ae5934d` TASK-197 ticket — 修复 miao 主干 CI 历史失败 (#133)
- `66fba347` TASK-198~203 from openai-agents-python 研究
- `c6fedee0` TASK-204 + 205-210 WorkflowStep 上下文预算 + GenericAgent
- `6c7976f0` TASK-211~213 context-mode/MemOS/claude-context

## 验收标准

- [ ] AC-1: 4 commit cherry-pick 到 testing
- [ ] AC-2: `cd node && npm test -- tests/unit/context-budget.test.ts` 全绿
- [ ] AC-3: `cd node && npm test -- tests/unit/generic-agent.test.ts` 全绿
- [ ] AC-4: WorkflowStep 上下文预算 metrics 在 `node dist/index.js system:doctor` 输出可见
- [ ] AC-5: 无 main 上独立演化的 context 模块冲突（如有，升级 Master）

## observability
- logs: ["epic003.task197_213.backport_completed"]
- metrics: ["context.budget.usage_pct", "generic_agent.invocation_count"]

## rollback_plan

revert PR；context-mode 与 MemOS 是新增能力，rollback 不影响已有 workflow。

## test_strategy
- unit: tests/unit/context-budget.test.ts, generic-agent.test.ts
- integration: 跑一次完整 master:plan → slaver:execute 流程，观察 context 预算占用
- regression: TASK-232 的 SQLite trace 不受影响

---

**类型**: Feature (回灌)
**技能要求**: Node.js / TypeScript / context engineering
**依赖**: TASK-232
**assigned_experts**: tech-architect

<!-- machine-readable fields -->
agent_type: fullstack
estimate_hours: 4
