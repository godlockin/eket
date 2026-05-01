# TASK-412: 修复 Worktree Agent 产物丢失问题

## 元数据
- **状态**: todo
- **类型**: bugfix
- **优先级**: P0
- **agent_type**: code
- **estimate_hours**: 2
- **parent_epic**: EPIC-004
- **创建时间**: 2026-05-01

## 背景

EPIC-004 中 4 个 worktree agent（TASK-407/408/409/410）的 commit 全部丢失。Agent 报告"已完成并 commit"，但 worktree 被清理后分支指向 miao base（无新 commit）。

变更存活的唯一原因：
- 部分 agent 直接写到了 main 工作区（绕过 worktree 隔离）
- 部分文件残留在 untracked 状态

这是结构性问题，不是偶发。

## 根因分析方向

1. Worktree 基于 miao 创建（不是 main），agent commit 到 miao 历史上
2. Worktree 清理时没有先 merge 回 main
3. 可能是 `isolation: "worktree"` 的 branch 在清理时被 force-delete

## 详细描述

1. 阅读 Claude Code 的 worktree 隔离机制文档/源码，理解 worktree 创建→commit→清理的完整生命周期
2. 复现问题：创建 worktree agent，让它做一个简单修改并 commit，观察 worktree 清理后 commit 是否保留
3. 设计修复方案（至少一种）：
   - 方案 A：Agent 完成后，Master 在清理 worktree 前先 cherry-pick/merge 到 main
   - 方案 B：不用 `isolation: "worktree"`，改用 `git worktree add` 手动管理 + feature branch
   - 方案 C：Agent 不 commit 到 worktree branch，而是直接 push 到 remote feature branch
4. 写入 `confluence/memory/worktree-agent-guide.md` 作为最佳实践

## 验收标准
- [ ] AC-1: 根因确认并记录
- [ ] AC-2: 修复方案验证（派一个 test agent 用新方案，确认产物不丢）
- [ ] AC-3: 最佳实践文档创建

---
agent_type: code
estimate_hours: 2
