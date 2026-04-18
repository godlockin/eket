---
id: TASK-051
title: post-merge-broadcast 修复 untracked 文件检测 + benchmark path-stub
status: in_progress
priority: P1
type: bugfix
epic: EPIC-V3-MIGRATION
created_at: 2026-04-18
dispatched_by: human:steven
assignee: slaver:godlockin
---

# TASK-051: post-merge-broadcast 修复

## 问题
PR #75 合入后 `post-merge-broadcast.yml` 触发成功但 commit 步骤说
"No retro stub to commit (already exists?)"。根因：脚本先创建 stub 文件
（untracked），再用 `git diff --quiet` 检查——但 `git diff` 默认只看
tracked 文件的修改，untracked 永远 "no diff"，于是 early-exit。

## Fix
先 `git add` 进 index，再 `git diff --cached --quiet` 检查 staged 变更。

## Acceptance Criteria
- [x] AC-1: workflow 修改后下一次 PR merge 真正 commit stub 到 main
- [x] AC-2: 手动补一份 PR #75 的 stub 进入 INBOX 作为种子
- [ ] AC-3 (留 TASK-052): 给 `perf-baseline.yml` 加 path-stub job，让 docs/infra-only PR 不再因 benchmark required check 死锁

## Test evidence
```
$ git diff --quiet HEAD -- .github/workflows/post-merge-broadcast.yml
(exit 1, change present)

$ cd node && npm test
Test Suites: 56 passed, 56 total
Tests:       1153 passed, 1153 total
Time:        11.5 s
```

## Rollback
git revert

## AI-Review
AI-Review: claude opus 4.5 (本 session) — 自审 + git 行为复盘

## Ref
Ref: TASK-051
