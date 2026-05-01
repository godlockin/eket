# TASK-105a: WorktreeManager — 生命周期封装

## 元数据
- **状态**: todo
- **类型**: feature
- **优先级**: P0
- **负责人**: 待领取
- **创建时间**: 2026-04-20
- **依赖**: 无

## 背景

TASK-105 第一阶段：封装 worktree 创建/销毁/合并的核心逻辑，不含 claim 集成。

## 验收标准

1. `node/src/core/worktree-manager.ts`（新建）：
   - `createWorktree(ticketId, slaverId)` → worktree 路径
   - `mergeWorktree(ticketId)` → squash merge 到主分支
   - `removeWorktree(ticketId, force?)` → 清理
   - `listWorktrees()` → 当前所有 worktree 列表
2. 触发 `WorktreeCreate` / `WorktreeRemove` hook 事件
3. `npm test` 全绿（mock git 命令），新增 ≥ 4 单测
