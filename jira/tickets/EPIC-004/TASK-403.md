# TASK-403: 分支策略文档化 — 防止回灌灾难重演

## 元数据
- **状态**: todo
- **类型**: docs
- **优先级**: P2
- **agent_type**: docs
- **estimate_hours**: 2
- **parent_epic**: EPIC-004
- **创建时间**: 2026-05-01

## 背景

EPIC-003 回灌过程中暴露出分支管理的多个问题：
- cherry-pick 导致 main↔miao 历史分叉，merge 回来时 30 个虚假冲突
- 三分支 testing/main/miao 同步顺序不清晰
- 没有明确的"何时用 merge、何时用 cherry-pick"的决策规则

## 详细描述

创建 `confluence/memory/branch-strategy-guide.md`，内容包括：

1. **分支拓扑图**：`feature/* → testing → main → miao`，画出数据流向
2. **操作决策矩阵**：
   - 单个 hotfix → cherry-pick
   - 批量回灌（>5 commits）→ merge
   - 定期同步 → merge
3. **三分支对齐 SOP**：
   - 完成一个 EPIC 后的标准对齐流程
   - 验证命令：`git diff origin/A origin/B | wc -l` = 0
4. **危险操作清单**：force-push、reset --hard、rebase 公共分支的使用限制
5. **EPIC-003 教训引用**：链接到 `EPIC-003-backport-lessons.md`

同时更新 `CLAUDE.md` 底部分支策略段落，增加指向此文档的链接。

## 验收标准

- [ ] AC-1: `confluence/memory/branch-strategy-guide.md` 创建完成
- [ ] AC-2: 包含决策矩阵和对齐 SOP
- [ ] AC-3: CLAUDE.md 更新分支策略引用
- [ ] AC-4: memory-index.md 更新索引

## test_strategy
- 文档审核

---
agent_type: docs
estimate_hours: 2
