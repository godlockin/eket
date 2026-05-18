# EPIC-004 持续改进经验教训

**创建时间**: 2026-05-01
**来源**: EPIC-004 持续改进（15 tickets, TASK-401~415）
**适用范围**: 大规模多 Agent 并行改进、Worktree 隔离、防卡死机制、Post-Process 流程

---

## 1. Worktree Agent 产物丢失 — 结构性 Bug

**问题**：4 个 worktree agent（TASK-407/408/409/410）报告"已完成并 commit"，但 worktree 清理后所有 commit 丢失。分支仍指向 base commit，无新增内容。

**根因**：Claude Code 的 `isolation: "worktree"` 创建了 worktree 目录和新分支，但 agent 的 CWD **没有切换到 worktree 目录**，仍然在主工作区操作。Agent 以为自己在 worktree 里 commit，实际 commit 到了主分支的 working directory。Worktree 清理时删除了空的 worktree 分支，commit 留在了主分支。

**规则**：
- **不要依赖 `isolation: "worktree"`** 做生产级隔离，它有 CWD 切换 bug
- 如需隔离，用 `git worktree add` 手动管理，agent prompt 中明确指定绝对路径
- Agent 完成后，Master **先验证产物存在**再清理 worktree

**参见**：`confluence/memory/guides/worktree-agent.md`

---

## 2. 并行 Agent 修改同一文件 → 必须序列化

**问题**：TASK-414（修改 MASTER-RULES.md §9）和 TASK-415（添加 MASTER-RULES.md §10）都修改同一文件。如果并行执行，后提交的 agent 会遇到 merge conflict 或覆盖前者的变更。

**规则**：**修改同一文件的 ticket 必须串行执行**。Master 在派 agent 前要检查 ticket 涉及的文件范围，有重叠就设 `blocked_by` 依赖。

**反例**：EPIC-004 中 TASK-415 最初想和 TASK-414 并行派出，发现都改 MASTER-RULES.md 后推迟到 414 完成后再派。

---

## 3. sync-branches.sh 首次运行遇冲突 — 脚本无法自动解决

**问题**：`scripts/sync-branches.sh` 在 merge main→testing 时遇到冲突（check-branch-drift.sh 和 MASTER-RULES.md），脚本报错退出。

**规则**：
- 三分支同步脚本是**维护工具**，不是万能工具。首次对齐或大量分歧时，需要人工/Master 先手动解决冲突
- 脚本适用于**日常增量同步**（main 只领先几个 commit），不适用于历史分叉修复
- 冲突解决后，后续 sync 就能顺畅运行

---

## 4. testing 分支内容被 `--theirs` 覆盖

**问题**：merge main→testing 解冲突时用了 `--theirs`（取 main 版本），导致 testing 原有的 §11 内容被覆盖丢失。

**规则**：
- 解冲突时**不要无脑用 `--theirs` 或 `--ours`**，必须检查双方独有内容
- 如果两边都有独有贡献（§9 来自 main，§11 来自 testing），应手动合并而非二选一
- 覆盖发生后，可从 `git log` 恢复历史版本（TASK-414 就是这么修复的）

---

## 5. 远程分支积压 — 96 个未 merged 分支

**问题**：多轮 EPIC 执行后，远程 origin 积累了 96 个未 merged 的 feature 分支。大部分对应的 PR 早已关闭或废弃。

**规则**：
- **每个 EPIC 完成后清理已 merged 分支**（写入 Post-Process §9.2）
- 未 merged 分支按以下标准判断：关联 PR 已关闭 → 安全删除；无 PR 且 30 天无 commit → 安全删除；有 open PR → 保留
- 保留核心分支（main/miao/testing）+ 有 open PR 的分支

---

## 6. check-branch-drift.sh 误报 — commit 数 ≠ 内容差异

**问题**：`check-branch-drift.sh` 按 commit 数量报 FAIL，但 cherry-pick 导致 main/miao 有大量"内容相同但 SHA 不同"的 commit。`git diff` 为 0 行但脚本报 drift > 100。

**规则**：分支 drift 检测应**以内容为准**（`git diff`），不以 commit 数为准。如果 `git diff A B` 为空，即使 commit 历史不同也算 PASS。

**修复**：更新 check-branch-drift.sh 加入 content-aware 检查——commit 有 drift 但 diff 为空时报 WARN 而非 FAIL。

---

## 7. proper-lockfile `update: 2000` 导致测试泄漏

**问题**：`proper-lockfile` 的 `update: 2000` 选项每 2 秒刷新锁文件，Jest 测试结束后 setInterval 仍在运行，导致 "open handle" 警告和偶发 hang。

**规则**：测试环境中禁用 lockfile 的自动更新（`update: undefined`），或在 afterAll 中显式 release。生产环境保持 `update` 以防死锁。

---

## 8. Slaver 卡死/静默退出 — 需要防卡死机制

**问题**：多次 EPIC 执行中 slaver agent 出现卡死（API 429、上下文溢出、npm test 超时、HTTPS git push 挂起），Master 无法感知 agent 已死。

→ 详见 [agent-prompt-template.md](agent-prompt-template.md)（含完整规则 + Master 心跳监控 SOP）

---

## 9. Post-Process 必须强制执行

**问题**：EPIC-003 完成后没有执行 post-process（回归验证、分支同步、经验沉淀），导致三分支不同步、经验未记录、技术债未登记。在 EPIC-004 中补做了大量清理工作。

**规则**：
- Post-Process 已写入 MASTER-RULES.md §9，触发条件：EPIC 所有 ticket done / Sprint 目标达成
- 包含：回归验证（build+test+drift check）→ 分支同步 → 经验沉淀 → 技术债登记
- **红线**：禁止宣布阶段完成但跳过 post-process

---

## 10. "Slaver 能处理就派，不能处理就 Master 自己处理"

**问题**：Master 纠结哪些任务该派 slaver、哪些该自己做，导致决策延迟。

**规则**：简单判断标准——
- 文档编写、代码修改、测试修复、分支清理 → **派 slaver**
- 需要全局视角的决策（任务依赖、冲突解决策略、架构选择）→ **Master 自己做**
- 涉及多个 slaver 产物的合并/整合 → **Master 自己做**

---

## 关键数据汇总

| 指标 | 值 |
|------|-----|
| 总 ticket 数 | 15（TASK-401 ~ TASK-415） |
| Worktree agent 产物丢失数 | 4/4（100% 丢失率） |
| 远程分支清理数 | 37 merged + 96 unmerged = 133 删除 |
| 清理后剩余远程分支 | 9 |
| 最终三分支内容差异 | 0 行（main ↔ testing） |
| 新增/更新文档 | 8 个 |

---

**参见**：
- [EPIC-003-backport-lessons.md](EPIC-003-backport-lessons.md) — 回灌经验
- [lessons/multi-agent-collab-lessons.md](lessons/multi-agent-collab-lessons.md) — 多智能体协作经验（通用）
- [worktree-agent-guide.md](worktree-agent-guide.md) — Worktree 最佳实践
- [agent-prompt-template.md](agent-prompt-template.md) — 防卡死模板
