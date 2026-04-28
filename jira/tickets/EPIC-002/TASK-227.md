# TASK-227: 根 SKILL 模板 + INDEX.md 聚合更新

## 元数据
- **状态**: todo
- **类型**: chore
- **优先级**: P1
- **agent_type**: backend_dev
- **estimate_hours**: 4
- **parent_epic**: EPIC-002
- **创建时间**: 2026-04-27
- **依赖**: TASK-223, TASK-225
- **assigned_experts**: tech-architect

## 背景

EPIC-002 大部分 ticket 完成后，需要：
1. 创建根级 SKILL anatomy 模板，未来新技能直接 copy
2. 统一刷新 default + optional 的 INDEX.md（专家组并发专家建议：放最后做）
3. 更新 `template/CLAUDE.md` 引用新 anatomy 章节

## 详细描述

1. 创建 `template/docs/SKILL-ANATOMY-TEMPLATE.md`：包含 7 节骨架 + 范例 + 何时用 7 节 vs 3 节
2. 重新生成 `~/.claude/skills/eket/experts/default/INDEX.md` 与 `~/.claude/skills/eket/experts/optional/INDEX.md`
3. `template/CLAUDE.md` 增加 "技能/专家文档统一 7 节式" 章节，引用新模板与 check-skill-anatomy.sh

## 验收标准

- [ ] AC-1 (GWT): Given `template/docs/SKILL-ANATOMY-TEMPLATE.md` 创建完成, When 新人复制该文件, Then 仅替换 frontmatter + 各节内容即可通过 `scripts/check-skill-anatomy.sh`
- [ ] AC-2: INDEX.md 列出全部专家 ID + 一句话概述 + Rationalizations 计数
- [ ] AC-3: `template/CLAUDE.md` diff ≤ 50 行
- [ ] AC-4: 全 EPIC 跑一遍 `bash scripts/check-skill-anatomy.sh --all`，default 100% pass，optional ≥90% pass

## observability
- logs: ["skill.template.published"]
- metrics: ["skill.index.entries"]

## rollback_plan

INDEX.md 是聚合产物，可重新生成；template 是新文件，revert 即删。

## test_strategy
- unit: 用 SKILL-ANATOMY-TEMPLATE.md 生成 fixture，跑 check-skill-anatomy.sh PASS
- integration: 真实运行 INDEX 生成器，diff 与人工预期一致
- regression: TASK-223 default + TASK-225 optional 全量过 anatomy check

---

**类型**: Chore
**技能要求**: Markdown / Shell
**依赖**: TASK-223, TASK-225
**assigned_experts**: tech-architect

<!-- machine-readable fields -->
agent_type: backend_dev
estimate_hours: 4
