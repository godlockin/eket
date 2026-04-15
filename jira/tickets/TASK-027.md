# TASK-027: ACI 接口白名单 — Slaver 可用命令集规范

**Ticket ID**: TASK-027
**标题**: 借鉴 SWE-agent ACI 设计：为 Slaver 定义可用命令集白名单
**类型**: improvement
**优先级**: P2

**状态**: ready
**创建时间**: 2026-04-14
**最后更新**: 2026-04-14
**started_at**:
**completed_at**:

**负责人**:
**Slaver**:

**gate_review_veto_count**: 0
**veto_reason**:
**resubmit_conditions**:

## 领取记录

| 操作 | Slaver / Reviewer | 时间 | 状态变更 |
|------|-------------------|------|----------|
| 创建 | Master | 2026-04-14 | backlog → ready |

---

## 1. 任务描述

借鉴 SWE-agent 的 **ACI（Agent-Computer Interface）** 设计理念：不让 agent 直接使用原始 shell，而是定义一套专用命令集白名单，减少噪音、防止越权操作。

**问题**：当前 EKET Slaver 没有明确规定"哪些命令可以用"，导致：
- Slaver 可能运行危险命令（`git push --force`、`rm -rf`）
- 上下文浪费在无关命令输出上
- Master 无法预期 Slaver 的操作范围

### 具体改动

**Part A — `template/docs/SLAVER-HEARTBEAT-CHECKLIST.md`**

新增"可用命令集（ACI）"章节：

```markdown
## 可用命令集（Agent-Computer Interface）

### ✅ 允许的命令类别

| 类别 | 允许命令 | 说明 |
|------|---------|------|
| 读取代码 | `cat`, `grep`, `find`, `ls`, `wc` | 只读，无副作用 |
| 编辑代码 | `Edit`/`Write`/`Read` 工具 | 通过 Claude Code 工具，有权限控制 |
| 测试 | `npm test`, `npm run lint`, `npm run build` | 项目标准命令 |
| Git 只读 | `git status`, `git log`, `git diff`, `git branch` | 查看状态，不修改 |
| Git 提交 | `git add`, `git commit`, `git push origin <feature-branch>` | 仅限 feature/* 分支 |
| 脚本 | `bash scripts/validate-ticket-template.sh` | 项目内白名单脚本 |

### ❌ 禁止的命令

| 命令 | 原因 |
|------|------|
| `git push --force` / `git push -f` | 可能破坏他人工作 |
| `git reset --hard` | 不可逆破坏 |
| `rm -rf` | 不可逆删除 |
| `git push origin main` / `origin miao` | 受保护分支，必须走 PR |
| `npm publish` / `pip publish` | 发布操作，需 Master 授权 |
| `sudo` / `chmod 777` | 权限提升 |
| 任何直接操作数据库的命令 | 绕过应用层 |

### 🟡 需要确认再用的命令

- `git rebase` — 可能产生冲突，执行前说明原因
- `npm install <new-package>` — 新增依赖需在 PR 描述说明
- `curl` / `wget` — 网络请求需说明目的
```

**Part B — `CLAUDE.md`**

在 Slaver 偏差处理协议引用之后，加一行 ACI 引用：

```markdown
**可用命令集（ACI）**：Slaver 操作范围受命令白名单约束，详见 `template/docs/SLAVER-HEARTBEAT-CHECKLIST.md` — "可用命令集"章节。禁止运行 `git push --force`、`rm -rf`、直接推送受保护分支等破坏性命令。
```

---

## 2. 验收标准

- [ ] `SLAVER-HEARTBEAT-CHECKLIST.md` 包含 ACI 章节，✅/❌/🟡 三类命令均有列举；验证：`grep -c 'git push --force\|rm -rf\|npm test' template/docs/SLAVER-HEARTBEAT-CHECKLIST.md`
- [ ] `CLAUDE.md` 有 ACI 一行引用；验证：`grep -l 'ACI\|可用命令集' CLAUDE.md`
- [ ] 白名单覆盖 Slaver 日常操作的 90%+（read/edit/test/git-feature-branch）；验证：内容审查（在 PR 描述里列出覆盖的操作类型）
- [ ] `npm test` 1109+ 全部通过；验证：`cd node && npm test 2>&1 | tail -3`

---

## 4. 影响范围

- `template/docs/SLAVER-HEARTBEAT-CHECKLIST.md` — 新增 ACI 章节
- `CLAUDE.md` — 新增 ACI 一行引用

---

## 5. blocked_by

无依赖，可立即开始。与 TASK-028/029/030 完全独立，可并行。
