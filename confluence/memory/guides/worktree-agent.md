# Worktree Agent 产物丢失问题分析与最佳实践

> TASK-412 调研结论 | 2026-05-01

---

## 问题根因

通过 `git worktree list` 观察到 4 个残留 worktree，全部指向同一个 miao 分支 commit (`35f5c8dc5`)，没有任何 agent 新增的 commit。分析如下：

### 1. Agent CWD 未切换到 worktree 目录

Claude Code 的 `isolation: "worktree"` 创建了 `.claude/worktrees/agent-xxx/` 目录并新建分支 `worktree-agent-xxx`，但 **agent 的实际工作目录 (CWD) 并未可靠切换到该目录**。结果：

- Agent 的文件操作（Read/Write/Edit）作用于主工作区
- `git add && git commit` 在主工作区执行，提交到 main/miao 而非 worktree 分支
- 部分变更"碰巧"出现在 main 工作区——这不是碰巧，就是 agent 直接写在了那里

### 2. Worktree 分支基于 miao 创建但无新 commit

所有 worktree 分支的 tip 均为 miao HEAD (`35f5c8dc5`)，说明 agent 从未在 worktree 分支上产生 commit。分支 ref 只是创建时的起点快照。

### 3. 清理不彻底：branch ref 残留 + locked 状态

Worktree 目录内容已清空，但：
- `git worktree list` 仍显示 locked 状态
- 分支 ref (`worktree-agent-xxx`) 仍存在于 `.git/refs/heads/`
- 需要手动 `git worktree remove --force` + `git branch -D` 清理

### 根本原因总结

> **Claude Code worktree isolation 的 CWD 切换不可靠**。Agent 子进程未必在 worktree 目录中执行文件/git 操作，导致所有产物写入主工作区、commit 落在错误分支。

---

## 推荐方案

### 何时用 worktree

✅ 适用：
- 真正需要并行修改不同文件集的多 agent 场景
- agent 任务完全独立、无共享文件
- 你已验证 agent CWD 确实在 worktree 中（见 Checklist）

❌ 不适用（改用顺序执行）：
- 单文件/少量文件的修改任务
- 需要读取主工作区最新状态的任务
- 对产物丢失零容忍的关键任务

### 用 worktree 时确保产物不丢

1. **Agent 首条指令验证 CWD**：要求 agent 执行 `pwd` 并确认路径包含 `.claude/worktrees/`
2. **Agent commit 前验证分支**：`git branch --show-current` 必须是 `worktree-agent-xxx`
3. **Agent 完成后不要自动清理 worktree**——由 Master 手动 merge back：

```bash
# Master merge back 步骤
git fetch . worktree-agent-xxx:temp-merge
git checkout main
git merge temp-merge --no-ff -m "merge: agent worktree results"
git branch -D temp-merge
git worktree remove .claude/worktrees/agent-xxx
git branch -D worktree-agent-xxx
```

4. **备选：agent 直接 push 分支到 remote**，Master 通过 PR 合入

### 不用 worktree 时避免并行冲突

- 顺序派发 agent（一个完成再派下一个）
- 或将文件集严格隔离（agent A 只改 `src/a/`，agent B 只改 `src/b/`）
- 用 git stash 隔离：每个 agent 开始前 stash，结束后 pop

---

## Master 派遣 Checklist

### 派遣前

- [ ] 确认任务是否真需要 worktree 隔离（大多数不需要）
- [ ] 如果用 worktree：在 agent prompt 中加入 CWD 验证指令
- [ ] 明确告知 agent：commit 到 worktree 分支，**不要** exit worktree

### Agent 执行中

- [ ] Agent 首条输出确认 `pwd` 在 worktree 目录中
- [ ] Agent 确认 `git branch --show-current` 为 worktree 分支

### 派遣后（Master 操作）

- [ ] 检查 worktree 分支是否有新 commit：`git log worktree-agent-xxx --oneline -3`
- [ ] 如有 commit → merge back to main（见上方步骤）
- [ ] 如无 commit → 检查主工作区是否有未提交变更（agent 可能误写到主区）
- [ ] 清理 worktree：`git worktree remove --force .claude/worktrees/agent-xxx`
- [ ] 清理分支：`git branch -D worktree-agent-xxx`

---

## 已知限制

| 限制 | 影响 | 规避 |
|------|------|------|
| Agent CWD 不可靠切换到 worktree | 产物写入主工作区 | Agent prompt 强制 pwd 验证 |
| ExitWorktree action:"remove" 会删除未合并 commit | 产物永久丢失 | 不让 agent 自行 exit worktree |
| Worktree locked 状态残留 | 无法重新创建同名 worktree | 手动 `git worktree remove --force` |
| Worktree 基于当前 HEAD 创建 | 如果 HEAD 不是目标分支会基错 | 派遣前确认当前在正确分支 |
| Claude Code Bash 工具无 cd 持久性 | 每条命令可能回到主工作区 | 用绝对路径或每条命令前 cd |

---

## 清理当前残留 worktree

```bash
# 一次性清理所有残留 worktree
for wt in $(git worktree list --porcelain | grep "^worktree.*\.claude/worktrees" | awk '{print $2}'); do
  git worktree remove --force "$wt" 2>/dev/null
done
for br in $(git branch | grep "worktree-agent-"); do
  git branch -D "$br" 2>/dev/null
done
```
