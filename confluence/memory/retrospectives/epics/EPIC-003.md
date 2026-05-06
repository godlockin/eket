# EPIC-003 回灌经验教训

**创建时间**: 2026-05-01
**来源**: EPIC-003 main↔miao 50-commit backport（2026-04-29 ~ 2026-05-01）
**适用范围**: 大规模跨分支 cherry-pick / 回灌 / 分支对齐

---

## 1. 并行 Agent 共享 .git 目录 → index.lock 死锁

**问题**：3 个 Slaver Agent 并行在同一 working directory 执行 cherry-pick，频繁出现 `.git/index.lock` 冲突，导致合并失败和状态损坏。

**规则**：多 Agent 并行操作同一 Git 仓库时，**必须使用独立 worktree 或串行执行**。即使用 `isolation: "worktree"` 参数，底层 `.git/objects` 仍然共享，高频写操作仍可能冲突。

**反例**：派出 3 个 Slaver 在同一目录并行 cherry-pick → 所有 Slaver 反复 `rm .git/index.lock` → 互相破坏对方的暂存区。

**解决方案**：
- 最终改为**串行执行**（一个 Slaver 做完再派下一个），彻底消除竞争
- 如需并行，每个 Agent 必须 `git worktree add` 到独立路径，且操作不同的文件集

---

## 2. 旧 Agent 未停止就派新 Agent → 僵尸进程叠加

**问题**：第一批 Agent 失败后，直接派出第二批 Agent，但第一批并未被 `TaskStop` 停止。两批 Agent 同时操作同一仓库，冲突加剧。

**规则**：**重新派 Agent 之前，必须先停止所有旧 Agent**。使用 `TaskStop` 逐一终止，然后 `rm -f .git/index.lock` 清理残留锁文件。

**检查清单**：
1. `TaskList` 查看所有运行中的 Agent
2. `TaskStop` 逐一停止
3. `rm -f .git/index.lock` 清理锁
4. `git status` 确认仓库状态干净
5. 再派新 Agent

---

## 3. Cherry-pick 产生新 SHA → 分支"内容相同但历史分叉"

**问题**：从 miao cherry-pick 到 main，每个 commit 产生新 SHA。之后 merge main 回 miao 时，Git 无法识别这些是"同一变更"，产生大量虚假冲突。

**规则**：Cherry-pick 本质上是"复制内容、重写历史"。如果最终还需要 merge 回源分支，**优先用 merge 而非 cherry-pick**。

**数据**：EPIC-003 最终 main 有 92 个 miao 没有的 commit，miao 有 80 个 main 没有的 commit，但 `git diff` 为 0 行。merge 回 miao 时出现 30 个虚假冲突，全部 `-X ours` 解决。

---

## 4. 冲突解决时缺失依赖模块 → 编译失败

**问题**：Cherry-pick `node/src/types/index.ts` 和 `claim.ts` 后，新增的 import 引用了 miao 上存在但 main 上没有的模块（worktree-manager、ticket-reviewer、saga-executor、sse-bus、skills/index-loader）。

**规则**：Cherry-pick 含有新 import 的文件时，**必须同时拉取被引用的模块**。解决冲突后立即 `npm run build` 验证。

**解决步骤**：
```bash
# 从源分支拉缺失文件
git show origin/miao:node/src/core/worktree-manager.ts > src/core/worktree-manager.ts
# ... 对每个缺失模块重复
npm run build  # 立即验证
```

---

## 5. 可选字段未标记为 optional → 下游代码报错

**问题**：miao 新增 `Instance.currentLevel` 和 `Instance.levelChanges` 字段为 required（`: number`），但 main 上现有代码创建 Instance 时不提供这些字段。

**规则**：跨分支回灌新增字段时，考虑**向后兼容性**。对不影响核心逻辑的新字段，使用 `?:` 标记为可选，下游用 `?? defaultValue` 访问。

---

## 6. 方法重命名冲突（claimTask vs claimTaskById）

**问题**：miao 将 `claimTask` 重命名为 `claimTaskById`，但 main 上所有调用方仍用旧名。

**规则**：跨分支回灌涉及重命名时，**在 adapter 层添加别名方法**保持兼容：
```typescript
async claimTask(...) { return this.claimTaskById(...); }
```

---

## 7. Ticket 阻塞决策不应拖延

**问题**：TASK-231b 因"等待 Master 决策"阻塞多日，实际决策内容很简单（4 个二选一）。

**规则**：Master 的阻塞决策应**当天内响应**。如决策项超过 4 个，说明 ticket 拆分粒度不够。

---

## 8. 分支对齐的正确顺序

**问题**：EPIC-003 结束时，三分支 testing/main/miao 不同步。testing 落后 main 69 commits，main 和 miao 历史分叉。

**规则**：回灌完成后，按流向 **逆序 merge** 对齐：
1. `main merge → testing`（上游追平下游）
2. `main merge → miao`（下游接收上游）
3. 验证：`git diff origin/A origin/B | wc -l` 应为 0

---

## 9. GitHub Actions Workflow 必须在默认分支

**问题**：`branch-drift-alert.yml` 提交到 main，但 GitHub 默认分支是 miao，workflow 不会被识别和触发。

**规则**：所有 `.github/workflows/` 文件**必须存在于默认分支**。非默认分支上的 workflow 文件对 GitHub 不可见。

---

## 10. RTK proxy 过滤输出 → 误判空目录

**问题**：使用 `ls` 命令查看目录时，RTK proxy 过滤了输出，显示空结果。实际文件存在。

**规则**：需要看到完整输出时，使用 `rtk proxy <command>` 绕过过滤。

---

## 关键数据汇总

| 指标 | 值 |
|------|-----|
| 总 ticket 数 | 11（TASK-229 ~ TASK-237） |
| 总耗时 | ~3 天 |
| 冲突文件数（TASK-232） | ~30 |
| 并行失败次数 | 2 轮（共 6 个 Agent 失败） |
| 串行成功率 | 100% |
| 最终分支内容差异 | 0 行 |

---

**参见**：
- [lessons/multi-agent-collab-lessons.md](lessons/multi-agent-collab-lessons.md) — 多智能体协作经验（通用）
- [EPIC-002-closure-review.md](EPIC-002-closure-review.md) — EPIC-002 复盘
