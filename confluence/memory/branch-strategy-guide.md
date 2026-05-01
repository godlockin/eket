---
title: 分支策略指南
proof:
  task_id: TASK-403
  exit_code: 0
  timestamp: 2026-05-01T12:00:00Z
  tool_name: manual review
---

# 分支策略指南

## 1. 分支拓扑图

```
feature/*  ──→  testing  ──→  main  ──→  miao
                  │              │          │
                  │              │          └─ GitHub 默认分支，生产部署
                  │              └──────────── 稳定版本
                  └─────────────────────────── 集成测试环境

流向：
  feature/*  ─── PR merge ───→  testing
  testing    ─── 验证通过 ──→  main
  main       ─── 同步部署 ──→  miao
```

- **feature/\***：功能开发分支，命名 `feature/<TICKET-ID>-<description>`
- **testing**：集成测试环境，所有 feature PR 先合入此分支验证
- **main**：稳定版本，只接受经 testing 验证的代码
- **miao**：GitHub 默认分支，生产部署，与 main 保持同步

## 2. 操作决策矩阵

| 场景 | 操作 | 理由 |
|------|------|------|
| 单个 hotfix（1-2 commits） | cherry-pick | 精确控制，历史干净 |
| 批量回灌（>5 commits） | merge | 避免 SHA 分叉导致虚假冲突 |
| EPIC 完成后同步 | merge | 保持分支历史一致性 |
| 定期同步（weekly） | merge | branch-drift-alert 自动检查 |

### 决策流程

```
commits 数量？
├── 1-2 个 → cherry-pick
├── 3-5 个 → 视情况，优先 merge
└── >5 个  → 必须 merge
```

## 3. 三分支对齐 SOP（EPIC 完成后）

EPIC 完成并合入 main 后，执行以下步骤确保三分支对齐：

```bash
# Step 1: main → testing
git checkout testing
git merge main
git push origin testing

# Step 2: main → miao（用 -X ours 处理虚假冲突）
git checkout miao
git merge main -X ours
git push origin miao

# Step 3: 验证三分支一致
git diff origin/main origin/testing | wc -l   # 应为 0
git diff origin/main origin/miao | wc -l      # 应为 0
```

> **`-X ours` 的含义**：当 miao 与 main 出现虚假冲突（通常是之前 cherry-pick 导致的 SHA 差异），自动采用 main 的版本。这是安全的，因为 main 是权威源。

### 对齐失败时

如果 `wc -l` 不为 0：

1. 检查 diff 内容，确认是否为预期差异
2. 如果是残留冲突，手动解决后重新 merge
3. 记录到 EPIC 复盘中

## 4. 危险操作清单

### ⛔ 绝对禁止

| 操作 | 禁止场景 | 原因 |
|------|----------|------|
| `git push --force` | main / miao / testing | 会覆盖其他人的提交，破坏共享历史 |
| `git reset --hard` | 已 push 的 commit | 丢失已共享的工作，其他分支无法追踪 |
| `git rebase` | 公共分支（main/testing/miao） | 重写已共享的历史，导致所有协作者冲突 |

### ⚠️ 有条件允许

| 操作 | 允许场景 | 前提条件 |
|------|----------|----------|
| `git push --force` | 个人 feature/* 分支 | 确认无其他人在此分支工作 |
| `git reset --hard` | 本地未 push 的 commit | 仅影响本地，不影响远端 |
| `git rebase` | 个人 feature/* 分支（rebase onto main） | PR 前整理 commit 历史，未 push 过 |

### 安全替代方案

| 危险操作 | 安全替代 |
|----------|----------|
| `git push --force` | `git push --force-with-lease`（检查远端未变更） |
| `git reset --hard` | `git revert`（创建反向 commit，保留历史） |
| `git rebase` 公共分支 | `git merge`（保留完整历史） |

## 5. 非代码内容更新 SOP（docs / memory / skill）

> **场景**：修改 `confluence/memory/`、`.claude/skills/eket/SKILL.md`、`README`、`template/` 等非代码文件时。

### 正确流程

```bash
# 1. 创建 feature 分支（即使是纯文档改动）
git checkout miao && git pull origin miao
git checkout -b feature/docs-<brief-desc>

# 2. 在 feature 分支上做修改并提交
# ...修改文件...
git add <files> && git commit -m "docs: ..."

# 3. PR 合入 miao（或直接 merge，文档类可简化）
git checkout miao && git merge feature/docs-<brief-desc> && git push origin miao

# 4. 同步三分支（MUST，不能遗漏）
git checkout testing && git merge origin/miao --no-edit && git push origin testing
git checkout main    && git merge origin/testing --no-edit && git push origin main
git checkout miao    # 回到工作分支
```

### SKILL.md 专项规则

```
修改顺序（严格）：
  1. 改源文件：eket/.claude/skills/eket/SKILL.md  ← 唯一正确入口
  2. commit + push
  3. 部署到本地：bash scripts/install-skill.sh --update
  ❌ 禁止直接改 ~/.claude/skills/eket/SKILL.md（部署目标，改了也会被覆盖）
```

### 常见违规（本次复盘）

| 违规 | 后果 | 修正 |
|------|------|------|
| 直接在 `miao` 上提交，不走 feature 分支 | 分支污染，三分支不对齐 | 所有改动必须走 feature/* |
| 先改 `~/.claude/...` 再补同步 | 源文件滞后，安装脚本覆盖掉改动 | 永远改源文件 |
| 改完不同步三分支 | `testing`/`main` 落后，需人工提醒 | 每次 push miao 后立即执行三分支 SOP |

---

## 6. 历史教训

### EPIC-003 回灌教训

详见 [`EPIC-003-backport-lessons.md`](EPIC-003-backport-lessons.md)

核心教训：
- cherry-pick 大量 commit 会导致 SHA 分叉，后续 merge 出现虚假冲突
- 批量回灌应使用 merge 而非逐个 cherry-pick
- 三分支对齐 SOP 即源于此次教训

---

**来源**: TASK-403
**最后更新**: 2026-05-01
