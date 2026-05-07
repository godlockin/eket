# TASK-222: Anti-Rationalization 表 — 5 个 default 专家试点

## 元数据
- **状态**: todo
- **类型**: feature
- **优先级**: P0
- **agent_type**: fullstack
- **estimate_hours**: 6
- **parent_epic**: EPIC-002
- **创建时间**: 2026-04-27
- **依赖**: 无（pilot 任务）
- **assigned_experts**: tech-architect, qa-lead

## 背景

借鉴 addyosmani/agent-skills 的 Anti-Rationalization Tables 方法。先在 5 个 default 专家上试点，验证阈值与表格规范。

## 详细描述

为 `~/.claude/skills/eket/experts/default/` 下 5 个 default 专家的每份 MD 末尾添加 `## Common Rationalizations` 表，至少 5 行借口→反驳 配对。

试点目录：`~/.claude/skills/eket/experts/default/`（具体 5 个文件以 `ls` 实际为准）。

格式参考 addyosmani code-simplification SKILL：

```markdown
## Common Rationalizations

| 借口 | 反驳 |
|------|------|
| "测试可以下次补" | TASK 验收标准明确要求 unit + integration test 同 PR 提交 |
| "这次只是临时方案" | 没有"临时"标签自动到期；临时 = 永久债 |
| ... | ... |
```

## 验收标准

- [ ] AC-1 (Given/When/Then): Given `~/.claude/skills/eket/experts/default/`, When 全部 5 个专家 MD 改造完成, Then 每份末尾出现 `## Common Rationalizations` 二列表 ≥5 行
- [ ] AC-2: Given `grep -c "^| " <file>` ≥ 6（含表头分隔行）, Then 通过
- [ ] AC-3: 借口需为本专家职责高频出错点，不得复用同一通用模板
- [ ] AC-4: PR diff ≤ 300 行（pilot 特批，超出 ~100 上限，依 EPIC-002 §6 风险缓解）

## observability
- logs: ["task-222.completed"]
- metrics: ["rationalizations.count"]

## rollback_plan

`git revert` 单 commit 即可；专家 MD 是无引用纯文档。保留 v1 备份 7 天。

## test_strategy
- unit: 手工对每份专家 MD 用 `grep` 验证表格存在 + 行数
- integration: 在一次真实 Master review 中故意抛出借口，观察是否被表中匹配
- regression: 无（首发）

---

**类型**: Feature
**技能要求**: Markdown / Shell
**依赖**: 无
**assigned_experts**: tech-architect, qa-lead

<!-- machine-readable fields -->
agent_type: fullstack
estimate_hours: 6
