# TASK-224: Verification Checklist 硬性闸门 — 5 个 default 专家

## 元数据
- **状态**: todo
- **类型**: feature
- **优先级**: P0
- **agent_type**: backend_dev
- **estimate_hours**: 8
- **parent_epic**: EPIC-002
- **创建时间**: 2026-04-27
- **依赖**: TASK-223
- **assigned_experts**: qa-lead

## 背景

addyosmani 每个 SKILL 末尾的 `## Verification` 是硬性闸门——不通过 = 任务未完成。EKET 当前自报"完成"无证据闭环，需引入。

## 详细描述

为 5 个 default 专家添加 `## Verification` 章节，含两类条目：
1. **Process verification**：描述性自检（如"已读完关联 ticket 的 AC"）
2. **Command verification**：可执行命令（如 `npm test -- --json | jq '.numFailedTests==0'`）

并交付 `scripts/check-skill-anatomy.sh`：用状态机匹配 7 节顺序 + Verification 节至少 ≥3 条 checkbox。

## 验收标准

- [ ] AC-1 (GWT): Given 5 个 default 专家, When TASK-224 完成, Then 每份 `## Verification` 节包含 ≥3 条 `- [ ]` 复选框
- [ ] AC-2: `scripts/check-skill-anatomy.sh ~/.claude/skills/eket/experts/default/*.md` exit 0
- [ ] AC-3: 至少 1 条命令式 verification（含 `\`\`\`bash` 块）
- [ ] AC-4: 命令式 verification 在 macOS + Linux 两平台都跑（CI matrix 覆盖）

## observability
- logs: ["skill.verification.exec", "skill.verification.failed"]
- metrics: ["skill.verification.pass_rate"]

## rollback_plan

`git revert` 单 commit；脚本失败时 CI 用 `continue-on-error: true` 兜底 1 周观察期。

## test_strategy
- unit: `bash scripts/check-skill-anatomy.sh fixtures/good.md` PASS / `bad.md` FAIL
- integration: GitHub Actions 在 ubuntu-latest + macos-latest 运行
- regression: 把 TASK-223 swap 后的 v2 全部跑一遍 anatomy check

---

**类型**: Feature
**技能要求**: Bash / GitHub Actions
**依赖**: TASK-223
**assigned_experts**: qa-lead

<!-- machine-readable fields -->
agent_type: backend_dev
estimate_hours: 8
