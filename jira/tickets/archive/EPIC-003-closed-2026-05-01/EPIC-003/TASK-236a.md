# TASK-236a: setup 杂项 fix 回灌（2 commit, 真 infra-only）

> **2026-04-29 拆分**: slaver-006 实测发现原 TASK-236 4 commit 里 30fc9fc7 + c4fd2af4 实际包含 node/src/ + rust/crates/ 改动（撞 TASK-230/232 主战场），不是真 infra-only。拆为 236a (2 commit 立即可做) + 236b (2 commit 等 230/232)。
>
> 原 TASK-236 标记 superseded。

## 元数据
- **状态**: todo
- **类型**: bugfix
- **优先级**: P2
- **agent_type**: fullstack
- **estimate_hours**: 1
- **parent_epic**: EPIC-003
- **创建时间**: 2026-04-29
- **依赖**: 无
- **assigned_experts**: tech-architect

## 背景

EPIC-003 第 7 步（拆分前半）。仅含 setup script + URL 替换两个真 infra-only commit。

## 详细描述

回灌范围（按时间顺序）：
- `4497a7d4` fix(setup): 修复空白机安装的 6 个问题
- `1ae1f7ed` fix(setup): update GitHub org/repo URL to godlockin/eket

仅动 `scripts/setup.sh` / `scripts/install-skill.sh` / 文档里的 URL，**不碰** node/src/ / rust/crates/。

## 验收标准

- [ ] AC-1: 2 commit cherry-pick 到 testing
- [ ] AC-2: `bash scripts/setup.sh --dry-run`（如有）跑通；否则手动 grep 检查 setup.sh 无 `eket-org/eket` 残留
- [ ] AC-3: 所有 `eket-org/eket` URL 已替换为 `godlockin/eket`
- [ ] AC-4: PR body 列 2 commit hash + AI-Review

## observability
- logs: ["epic003.setup_fix.backport_completed"]
- metrics: ["setup.fresh_install.success_rate"]

## rollback_plan

revert PR；setup 改动可单独回滚。

## test_strategy
- unit: 无
- integration: bash scripts/setup.sh dry-run（如可能）
- regression: 无 node/rust 改动 → 无影响

---

**类型**: Bugfix (回灌-真 infra)
**技能要求**: Bash
**依赖**: 无
**assigned_experts**: tech-architect

<!-- machine-readable fields -->
agent_type: fullstack
estimate_hours: 1

