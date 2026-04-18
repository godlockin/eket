# Task Ticket: TASK-049 - Node 共享状态写入层骨架

**创建时间**: 2026-04-17
**创建者**: Master Agent
**重要性**: high
**优先级**: P1
**状态**: in_progress
**标签**: `task`, `v3-phase0`, `architecture`
**Epic**: v3-phase0（见 [docs/roadmap/v3-phase0.md](../../docs/roadmap/v3-phase0.md)）
**分配给**: godlockin

<!-- dispatched_by: Master 的 GitHub handle；pr-reviewer-check 用此判定自我闭环 -->
dispatched_by: godlockin

---

## 0. 元数据

- `agent_type`: backend_dev
- `estimate_hours`: 8
- `acceptance_criteria`: AC-1
- `observability`: logs: ["state/audit.ts"]
- `rollback_plan`: 保留 flag `EKET_STATE_LEGACY=1`，revert skeleton 不影响现有命令

## 1. 需求概述

落地 `node/src/core/state/` 骨架，作为 Node 端对 `jira/ | inbox/ | outbox/ |
shared/ | .eket/state/` 的统一写入入口，与 `lib/state/` Shell 层等价。

## 2. 验收标准

- AC-1: Given 已有 node/src → When 引入 core/state/ 骨架 + lib/state/ Shell
  层 + protocol/ + audit script → Then `npm run build` 与 `npm test` 全绿，无
  tracked 文件变更回归。

## 3. 变更清单

- `node/src/core/state/` — writer/reader/schema/lock/atomic/audit/env（7 模块）
- `node/src/OWNERSHIP.md` — 模块所有权约定
- `node/eslint-rules/no-direct-shared-fs-write.js` — 后续用于强制
- `lib/state/*.sh` — Shell 等价实现（跨引擎对齐基础）
- `protocol/` — 数据契约（schemas + state-machines + conventions）
- `docs/roadmap/v3-phase0.md` + `docs/plans/node-state-migration-plan.md` +
  `docs/audit/fs-write-points.md` — 路线图、迁移方案、审计清单
- `scripts/audit-writes.sh` / `scripts/install-deps.sh` — 辅助脚本

## 4. 测试证据

```
Test Suites: 56 passed, 56 total
Tests:       1153 passed, 1153 total
Snapshots:   0 total
Time:        11.459 s
Ran all test suites.
```

（`npm run build` 零错误，骨架无 tracked 导入，零回归。）

## 5. 后续

本 ticket 只合入骨架。实际 42 处 `fs.writeFile` 迁移将按
[docs/plans/node-state-migration-plan.md](../../docs/plans/node-state-migration-plan.md)
分 5 个子 ticket 滚动迭代（TASK-050 ~ TASK-054）。
