# TASK-223: Unified 7-Section Anatomy — 5 个 default 专家全量重构

## 元数据
- **状态**: todo
- **类型**: refactor
- **优先级**: P0
- **agent_type**: fullstack
- **estimate_hours**: 12
- **parent_epic**: EPIC-002
- **创建时间**: 2026-04-27
- **依赖**: TASK-222
- **assigned_experts**: tech-architect, qa-lead

## 背景

addyosmani SKILL 标准的 7 节 anatomy：Frontmatter / Overview / When to Use / When NOT to Use / Process / Common Rationalizations / Red Flags / Verification。试点 TASK-222 已验证 Rationalization 表，现整合为完整 7 节。

## 详细描述

将 5 个 default 专家文档全部按 7 节模板重写。模板见 `template/docs/SKILL-ANATOMY-TEMPLATE.md`（本 ticket 一并产出）。

执行策略（按回滚专家建议）：影子目录灰度切换。
- Step 1：在 `~/.claude/skills/eket/experts/default-v2/` 写新版
- Step 2：测试通过后 swap：`default → default-v1-backup`，`default-v2 → default`
- Step 3：保留 default-v1-backup 7 天后删除

## 验收标准

- [ ] AC-1 (GWT): Given 5 个 default 专家 MD, When 重构完成, Then 每份按顺序出现 7 个二级标题：`## Overview` → `## When to Use` → `## When NOT to Use` → `## Process` → `## Common Rationalizations` → `## Red Flags` → `## Verification`
- [ ] AC-2: 顺序断言 — `scripts/check-skill-anatomy.sh <file>` 用状态机校验顺序，PASS
- [ ] AC-3: Frontmatter 含 `name / description / rationalizations_count` 字段（架构师建议）
- [ ] AC-4: 单 PR 净变更 ≤ 500 行（依 Rule of 500，default 专家平均 300 行，5 份分 2 ~ 3 个 PR）
- [ ] AC-5: 切换后 24h 内运行 `system:doctor` 无新增告警

## observability
- logs: ["skill.anatomy.swapped", "skill.anatomy.swap_failed"]
- metrics: ["skill.anatomy.section_count", "skill.anatomy.swap_duration_ms"]

## rollback_plan

灰度策略：保留 `default-v1-backup/` 7 天；任何下游 break 立即 `mv default default-v2-rejected && mv default-v1-backup default` (单命令回滚 < 5s)。

## test_strategy
- unit: `bash scripts/check-skill-anatomy.sh <file>` 对每份文件 PASS
- integration: Master 召唤 default 专家时无 404 / 字段缺失
- regression: 与 v1 备份 diff，确认核心知识点未丢失

---

**类型**: Refactor
**技能要求**: Markdown / Shell / 状态机校验
**依赖**: TASK-222
**assigned_experts**: tech-architect, qa-lead

<!-- machine-readable fields -->
agent_type: fullstack
estimate_hours: 12
