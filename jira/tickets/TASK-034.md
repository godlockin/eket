# TASK-034: /loop 自动化 Master 心跳 — Slash Command 实现

**Ticket ID**: TASK-034
**标题**: 新增 /heartbeat:master 和 /heartbeat:slaver Slash Command，配合 /loop 实现自动化心跳
**类型**: feature
**优先级**: P2

**状态**: pr_review
**创建时间**: 2026-04-15
**最后更新**: 2026-04-15
**started_at**: 2026-04-15T10:00:00+08:00
**completed_at**: 2026-04-15T10:30:00+08:00

**负责人**: slaver_fullstack_dev
**Slaver**: slaver_fullstack_dev

**gate_review_veto_count**: 0
**veto_reason**:
**resubmit_conditions**:

## 领取记录

| 操作 | Slaver / Reviewer | 时间 | 状态变更 |
|------|-------------------|------|----------|
| 创建 | Master | 2026-04-15 | backlog → ready |
| 领取 | slaver_fullstack_dev | 2026-04-15T10:00:00+08:00 | ready → in_progress |
| 提交 PR | slaver_fullstack_dev | 2026-04-15T10:30:00+08:00 | in_progress → pr_review |

---

## 1. 任务描述

### 背景

来自 claude-code-best-practice 的实践（Boris Cherny 内部工作流）：

> **`/loop 30m /heartbeat:master-check` — 让 Master 每 30 分钟自动执行心跳检查，无需人工触发。**

当前 EKET 的 Master 心跳检查是手动的：Master 需要人工提示"进行心跳检查"，容易被遗忘，导致任务积压、超时 Slaver 无人发现。

### 目标效果

```bash
# Master 启动后执行一次，此后每 30 分钟自动心跳
/loop 30m /heartbeat:master

# Slaver 监控（每 10 分钟检查存活状态）
/loop 10m /heartbeat:slaver
```

### 改动范围

**Part A — `template/.claude/commands/heartbeat-master.md`（新建）**

Master 心跳 Slash Command，内容：
```markdown
执行 Master 心跳检查，检查以下 4 项：

1. **任务队列扫描**：列出所有 ready 状态的 ticket，按优先级排序
   !`find jira/tickets -name "*.md" | xargs grep -l "状态\*\*: ready" 2>/dev/null | sort`

2. **Slaver 进度检查**：找出所有 in_progress 超过 30 分钟未更新的任务
   !`find jira/tickets -name "*.md" -newer jira/tickets/.last-heartbeat 2>/dev/null`

3. **卡点识别**：检查 gate_review 状态超时（超过 30 分钟）的任务
   !`find jira/tickets -name "*.md" | xargs grep -l "状态\*\*: gate_review" 2>/dev/null`

4. **Inbox 检查**：检查是否有未处理的人类指令
   !`cat inbox/human_input.md 2>/dev/null | tail -20`

检查完毕后：
- 如发现 P0 指令，立即停止当前工作处理
- 如发现超时 gate_review，按规则自动 APPROVE
- 如发现超时 Slaver，记录到 inbox/human_feedback/ 并@通知
- 更新 .last-heartbeat 时间戳：`touch jira/tickets/.last-heartbeat`
```

**Part B — `template/.claude/commands/heartbeat-slaver.md`（新建）**

Slaver 心跳 Slash Command，内容：
```markdown
执行 Slaver 心跳自检，检查以下 3 项：

1. **当前任务确认**：确认领取的任务 ID 和当前状态
   !`find jira/tickets -name "*.md" | xargs grep -l "$(cat .eket/state/current_task 2>/dev/null)" 2>/dev/null | head -1`

2. **依赖检查**：检查 blocked_by 中的任务是否已 done
   检查当前 ticket 的 blocked_by 字段

3. **分支状态**：确认当前 feature 分支是否有未提交变更
   !`git status --short`
   !`git log --oneline origin/miao..HEAD 2>/dev/null | wc -l`

心跳完成后更新任务的 last_updated 字段。
```

**Part C — `template/docs/LOOP-HEARTBEAT.md`（新建）**

说明 /loop 自动化心跳：
- /loop 语法（`/loop <interval> <command>`）
- 推荐的 Master/Slaver 心跳间隔
- 如何在项目启动时配置
- 与手动心跳检查的对比

**Part D — CLAUDE.master.md 集成**（配合 TASK-032）

在 Master 的 CLAUDE.md 末尾添加启动建议：
```markdown
## 启动建议
项目启动后，运行以下命令开启自动心跳：
`/loop 30m /heartbeat:master`
```

---

## 2. 验收标准

- [x] `template/.claude/commands/heartbeat-master.md` 存在，包含 4 项检查和动态注入；验证：``grep -c '!`' template/.claude/commands/heartbeat-master.md``（应 ≥ 3）→ **实际: 7**
- [x] `template/.claude/commands/heartbeat-slaver.md` 存在，包含 3 项检查；验证：``grep -c '!`' template/.claude/commands/heartbeat-slaver.md``（应 ≥ 2）→ **实际: 6**
- [x] `template/docs/LOOP-HEARTBEAT.md` 存在，包含 /loop 语法说明；验证：`grep -c "/loop" template/docs/LOOP-HEARTBEAT.md`（应 ≥ 2）→ **实际: 21**
- [x] 命令文件名符合 Claude Code slash command 规范（小写、连字符分隔）；验证：`ls template/.claude/commands/ | grep heartbeat` → heartbeat-master.md, heartbeat-slaver.md
- [x] `npm test` 全量通过；验证：`cd node && npm test 2>&1 | tail -3` → **1132/1132 tests passing, 49 suites passed**

---

## 3. 技术方案

纯文档/Markdown 改动，无 TypeScript 变更。

1. 参考现有 `template/.claude/commands/` 下的 command 文件格式
2. 创建 heartbeat-master.md（含动态注入）
3. 创建 heartbeat-slaver.md
4. 新建 LOOP-HEARTBEAT.md 文档

---

## 4. 影响范围

- `template/.claude/commands/heartbeat-master.md` — 新建
- `template/.claude/commands/heartbeat-slaver.md` — 新建
- `template/docs/LOOP-HEARTBEAT.md` — 新建

---

## 5. blocked_by

无依赖，可立即执行。与 TASK-030/031/032/033 完全并行。
