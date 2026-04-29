# TASK-236: 杂项 fix（setup / org URL / 红队 17 项 / TASK-003）回灌 main

## 元数据
- **状态**: todo
- **类型**: bugfix
- **优先级**: P2
- **agent_type**: fullstack
- **estimate_hours**: 2
- **parent_epic**: EPIC-003
- **创建时间**: 2026-04-29
- **依赖**: TASK-235
- **assigned_experts**: tech-architect

## 背景

EPIC-003 第 7 步。miao 上 4 个长尾 commit，可与 TASK-235 并行。

## 详细描述

回灌范围（按 hash）：
- `30fc9fc7` 红队质疑 17 项修复 — P0 选举正确性 + P1 并发/安全 + P2 质量
- `1ae1f7ed` setup — 更新 GitHub org/repo URL 到 godlockin/eket
- `4497a7d4` setup — 修复空白机安装的 6 个问题
- `c4fd2af4` TASK-003 complete

## 验收标准

- [ ] AC-1: 4 commit cherry-pick 到 testing
- [ ] AC-2: `bash scripts/setup.sh` 在空白机能跑通（手动验证或 CI dry-run）
- [ ] AC-3: 所有 hardcoded `eket-org/eket` URL 已替换为 `godlockin/eket`
- [ ] AC-4: 红队 17 项 P0/P1/P2 issue 列表逐条验证修复仍生效
- [ ] AC-5: TASK-003 状态在 jira/state/active-tickets.json 标记 done

## observability
- logs: ["epic003.misc_fix.backport_completed"]
- metrics: ["setup.fresh_install.success_rate"]

## rollback_plan

revert PR；setup 改动可单独回滚。红队修复 rollback 会引入 P0 选举正确性问题，**不建议 rollback**。

## test_strategy
- unit: 无
- integration: bash scripts/setup.sh dry-run
- regression: 选举正确性测试（rust + node）

---

**类型**: Bugfix (回灌)
**技能要求**: Bash / Node.js / Rust
**依赖**: TASK-235
**assigned_experts**: tech-architect

<!-- machine-readable fields -->
agent_type: fullstack
estimate_hours: 2
