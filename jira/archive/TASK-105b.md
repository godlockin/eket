# TASK-105b: task:claim/complete 集成 worktree 隔离

## 元数据
- **状态**: superseded
- **类型**: feature
- **优先级**: P0
- **负责人**: 待领取
- **创建时间**: 2026-04-20
- **依赖**: TASK-105a

## 背景

TASK-105 第二阶段：将 WorktreeManager 接入 task:claim 和 task:complete 命令，
实现并发 Slaver 完全隔离执行。

## 验收标准

1. `task:claim` 时自动调用 `createWorktree()`，Slaver cwd 切换到 worktree 路径
2. `task:complete` 时调用 `mergeWorktree()` + `removeWorktree()`
3. 合并冲突时：写入 BLOCKED 状态，保留 worktree，向 inbox 发通知
4. `isolation` 配置项：`"none" | "worktree"`（默认 `"worktree"`）
5. `npm test` 全绿，新增 ≥ 3 单测
