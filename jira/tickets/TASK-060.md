---
id: TASK-060
title: "fix(broadcast): TASK-053 分配 + post-merge-broadcast 链路修复"
priority: P1
status: done
assignee: devops_dev
dispatched_by: master
created_at: 2026-04-18
closed_at: 2026-04-18
---

## 背景

broadcast 链路目前实际断裂：
1. `post-merge-broadcast.yml` auto-merge 用 `|| true` 静默吞掉 merge 失败
2. GITHUB_TOKEN 安全限制导致 bot PR 的 required checks 永远 "expected"（TASK-053 未指派）
3. broadcast PR 堆积后永不自动合并，retro 收集链路名存实亡

## 验收标准

- [ ] 采用 TASK-053 推荐的**方案3**：broadcast target 改为非保护分支（如 `retro-inbox`），再由人工或定时 job 合并到 main
- [ ] `post-merge-broadcast.yml` auto-merge 失败时打印告警而非静默 `|| true`
- [ ] merge fallback 去掉直接 merge（不带 `--auto`）逻辑，避免跳过 required checks
- [ ] 验证：合并一个 PR 后，retro stub 能成功出现在目标分支
- [ ] 更新 `confluence/memory/retrospectives/INBOX/README.md` 中的 SOP 说明新流程

## 相关文件

- `.github/workflows/post-merge-broadcast.yml`
- `jira/tickets/TASK-053.md`（关闭后标记为 superseded by TASK-060）

## 实现说明

### 变更1：broadcast target 改为 `retro-inbox`
`create-pull-request` action 的 `base` 从 `main` → `retro-inbox`。
`retro-inbox` 无 required checks，GITHUB_TOKEN bot PR 可立即 auto-merge。

### 变更2：auto-merge 失败时打印告警而非静默
原来：`gh pr merge ... --auto || gh pr merge ... || true`（完全静默）
现在：`if ! gh pr merge ... --auto; then ::warning:: ...; exit 1; fi`
workflow 失败可见，不再吞掉错误。

### 变更3：去掉不带 `--auto` 的 fallback merge
直接 merge（不带 `--auto`）会绕过 required checks，已删除。

### 变更4：README.md 更新 SOP
`confluence/memory/retrospectives/INBOX/README.md` 记录新流程：
retro-inbox → main 人工/定时合并节奏。
