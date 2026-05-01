# TASK-413: 清理 96 个未 merged 远程分支

## 元数据
- **状态**: todo
- **类型**: chore
- **优先级**: P2
- **agent_type**: devops
- **estimate_hours**: 1
- **parent_epic**: EPIC-004
- **创建时间**: 2026-05-01

## 背景

TASK-405 删除了 37 个已 merged 分支，但 origin 上还有约 96 个未 merged 的 feature 分支。大部分是历史遗留（TASK-001 ~ TASK-036、旧 fix/docs 分支），对应的 PR 早已关闭或废弃。

## 详细描述

1. `git branch -r --no-merged origin/main` 列出所有未 merged 分支
2. 对每个分支检查：
   - `gh pr list --head <branch> --state all` 看是否有关联 PR
   - 关联 PR 已 closed/merged → 安全删除
   - 无关联 PR 且最后 commit > 30 天 → 安全删除
   - 有 open PR → 保留
3. 批量删除确认安全的分支
4. 保留 main/miao/testing + 任何有 open PR 的分支

## 验收标准
- [ ] AC-1: 远程分支数 < 20
- [ ] AC-2: 无 open PR 的分支被误删
- [ ] AC-3: 报告删除清单

---
agent_type: devops
estimate_hours: 1
