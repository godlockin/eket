# TASK-405: 清理远程 stale 分支

## 元数据
- **状态**: todo
- **类型**: infra
- **优先级**: P1
- **agent_type**: devops
- **estimate_hours**: 0.5
- **parent_epic**: EPIC-004

## 详细描述

origin 上有 135 个远程分支，大部分是已 merged 的 feature 分支。

1. 列出所有已 merged 到 main 的远程分支：`git branch -r --merged origin/main`
2. 排除 `main`、`miao`、`testing`
3. 用 `git push origin --delete <branch>` 批量删除
4. 运行 `git remote prune origin` 清理本地 remote-tracking refs
5. 报告清理前后分支数

## 验收标准
- [ ] AC-1: 已 merged 的远程 feature 分支全部删除
- [ ] AC-2: 保留 main/miao/testing
- [ ] AC-3: `git branch -r | wc -l` < 10

---
agent_type: devops
estimate_hours: 0.5
