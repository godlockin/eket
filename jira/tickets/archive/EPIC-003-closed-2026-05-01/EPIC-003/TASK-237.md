# TASK-237: EPIC-003 收尾 — 验证 main == miao + 治理脚本上线

## 元数据
- **状态**: todo
- **类型**: investigation
- **优先级**: P0
- **agent_type**: architect
- **estimate_hours**: 2
- **parent_epic**: EPIC-003
- **创建时间**: 2026-04-29
- **依赖**: TASK-230, TASK-231, TASK-232, TASK-233, TASK-234, TASK-235, TASK-236
- **assigned_experts**: tech-architect, devops-engineer

## 背景

EPIC-003 收尾 ticket。验证 main↔miao 欠债清零，并交付治理脚本防止再次出现。

## 详细描述

### 1. 验证 main == miao（除 EPIC-003 元数据 ticket 本身外）

```bash
git fetch origin main miao
git rev-list --count origin/main..origin/miao   # 应 ≤ 1（仅本 ticket commit 或 0）
git rev-list --count origin/miao..origin/main   # 应 ≤ 5（main 上 EPIC-003 ticket 元数据）
git diff --stat origin/main origin/miao         # 应 ≤ 50 行差异
```

### 2. 交付治理脚本

#### `scripts/check-branch-drift.sh`（新）
- 输出 main↔miao / testing↔miao / testing↔main 三组 commit 数差距
- 阈值：main↔miao > 5 → exit 1（CI 阻塞）
- 阈值：testing↔miao > 20 → exit 1
- 阈值：testing↔main > 50 → warn

#### `.github/workflows/branch-drift-alert.yml`（新）
- 每周一 09:00 UTC 自动跑 `check-branch-drift.sh`
- 超阈值时创建 GitHub issue（label: `branch-drift-alert`）

#### `template/docs/MASTER-RULES.md`（编辑，加一节）
- 新增 §X "EPIC 收尾必须验证 main 同步"
- 新增 PR template checklist 项："本 PR base = testing（非 main / 非 miao）"

### 3. 关闭 EPIC-003

- `jira/epics/EPIC-003/closure-review.md` 写完整复盘（参照 `EPIC-002-closure-review.md` 模板）
- 7 个 follow-up ticket 状态全部 done
- TASK-229 调研报告归档说明（不删除，保留作为历史档案）

## 验收标准

- [ ] AC-1: `git rev-list --count origin/main..origin/miao` ≤ 1
- [ ] AC-2: `bash scripts/check-branch-drift.sh` 在 main↔miao = 0 时 exit 0
- [ ] AC-3: `.github/workflows/branch-drift-alert.yml` 已合入并跑过一次（`workflow_dispatch` 手动触发验证）
- [ ] AC-4: `template/docs/MASTER-RULES.md` 含两条新规：EPIC 收尾同步 + PR base = testing
- [ ] AC-5: `jira/tickets/EPIC-003/closure-review.md` 含 8 ticket 表 + PR 时间线 + 治理改动汇总

## observability
- logs: ["epic003.closure.verified", "branch_drift.weekly_check.completed"]
- metrics: ["main_miao_commit_drift", "testing_miao_commit_drift", "branch_drift.alert_count"]

## rollback_plan

EPIC-003 收尾 ticket 不引入业务代码，仅治理脚本 + 文档 + 复盘。revert 风险低。如治理脚本误报，先调高阈值或切 warn 模式，不删脚本。

## test_strategy
- unit: bash scripts/check-branch-drift.sh dry-run（构造测试 ref）
- integration: workflow_dispatch 手动触发 alert workflow
- regression: 现有 CI 不受影响

---

**类型**: Investigation + Tooling (收尾)
**技能要求**: Bash / GitHub Actions / git 治理
**依赖**: TASK-230~236 全部
**assigned_experts**: tech-architect, devops-engineer

<!-- machine-readable fields -->
agent_type: architect
estimate_hours: 2
