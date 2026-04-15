# TASK-032: 动态 Shell 注入 — Master CLAUDE.md 实时状态读取

**Ticket ID**: TASK-032
**标题**: 在 Master CLAUDE.md 中引入 !`command` 动态注入，实时读取任务队列和项目状态
**类型**: feature
**优先级**: P2

**状态**: pr_review
**创建时间**: 2026-04-15
**最后更新**: 2026-04-15
**started_at**: 2026-04-15T10:00:00+08:00
**completed_at**:

**负责人**: fullstack_dev
**Slaver**: slaver_fullstack_dev

**gate_review_veto_count**: 0
**veto_reason**:
**resubmit_conditions**:

## 领取记录

| 操作 | Slaver / Reviewer | 时间 | 状态变更 |
|------|-------------------|------|----------|
| 创建 | Master | 2026-04-15 | backlog → ready |
| 领取 | slaver_fullstack_dev | 2026-04-15T10:00:00+08:00 | ready → in_progress |
| 完成开发 | slaver_fullstack_dev | 2026-04-15T11:00:00+08:00 | in_progress → pr_review |

---

## 1. 任务描述

### 背景

来自 claude-code-best-practice 的发现：

> **Claude Code 支持在 CLAUDE.md 中使用 `` !`command` `` 语法进行动态 Shell 注入。技能被加载时，Shell 命令自动执行，输出注入上下文。**

当前 EKET 的 CLAUDE.md 完全是静态文档，Master 每次启动时看到的是"写死"的项目状态。引入动态注入后，Master 启动即获得实时数据。

### 目标效果

Master 的 CLAUDE.md 加载时，自动执行以下注入：

```markdown
## 实时项目状态（启动时自动刷新）

**待执行任务（ready）**:
!`find jira/tickets -name "*.md" | xargs grep -l "^\\*\\*状态\\*\\*: ready" 2>/dev/null | sed 's|jira/tickets/||;s|.md||' | sort | tr '\n' ' '`

**进行中任务（in_progress）**:
!`find jira/tickets -name "*.md" | xargs grep -l "^\\*\\*状态\\*\\*: in_progress" 2>/dev/null | sed 's|jira/tickets/||;s|.md||' | sort | tr '\n' ' '`

**待 Review 的 PR**:
!`gh pr list --base miao --state open --json number,title,headRefName 2>/dev/null | jq -r '.[] | "#\(.number) \(.title)"' | head -5`

**最新 CI 状态**:
!`gh pr list --base miao --state open --json number,statusCheckRollup 2>/dev/null | jq -r '.[] | "\(.number): \(.statusCheckRollup[0].state // "unknown")"' | head -3`
```

### 改动范围

**Part A — `template/CLAUDE.master.md`（新建）**

专为 Master 角色设计的 CLAUDE.md 模板，包含：
- 动态注入区块（实时任务队列、PR 状态、CI 状态）
- 静态规则区块（Master 职责、禁止操作）
- 心跳检查清单（引用实时数据）

**Part B — `template/CLAUDE.slaver.md`（新建）**

专为 Slaver 角色设计的 CLAUDE.md 模板，包含：
- 动态注入区块（当前领取的任务、分支状态）
- 静态规则区块（Slaver 职责、ACI 命令白名单）

**Part C — `scripts/init-project.sh` 更新**

根据角色安装对应 CLAUDE.md：
```bash
# 初始化 Master 时
cp template/CLAUDE.master.md CLAUDE.md
# 初始化 Slaver 时
cp template/CLAUDE.slaver.md CLAUDE.md
```

**Part D — `template/docs/DYNAMIC-INJECTION.md`（新建）**

说明动态 Shell 注入语法：
- `!`command`` 基本语法
- 安全注意事项（只读命令）
- Master/Slaver 推荐注入模式
- 与静态内容的组合方式

---

## 2. 验收标准

- [x] `template/CLAUDE.master.md` 存在，包含至少 3 处 `` !`...` `` 动态注入；验证：`grep -c '!`' template/CLAUDE.master.md` → **5**（≥3 ✅）
- [x] `template/CLAUDE.slaver.md` 存在，包含至少 2 处动态注入；验证：`grep -c '!`' template/CLAUDE.slaver.md` → **3**（≥2 ✅）
- [x] `template/docs/DYNAMIC-INJECTION.md` 存在，包含语法说明和示例 ✅
- [x] `scripts/init-project.sh` 包含 CLAUDE.master.md/CLAUDE.slaver.md 安装逻辑 → **20 处引用**（≥1 ✅）
- [x] `npm test` 全量通过：1132/1132 tests passing ✅

---

## 3. 技术方案

纯文档/Shell 改动，无 TypeScript 变更。

1. 参考现有 `template/CLAUDE.md`，拆分为 master/slaver 两个版本
2. 在 Master 版本添加动态注入区块（任务队列、PR、CI）
3. 在 Slaver 版本添加当前任务和分支状态注入
4. 新建 DYNAMIC-INJECTION.md 文档
5. 更新 init-project.sh

**注意**：动态注入命令应只用只读操作（find/grep/gh pr list/git log），禁止有副作用的命令。

---

## 4. 影响范围

- `template/CLAUDE.master.md` — 新建
- `template/CLAUDE.slaver.md` — 新建
- `template/docs/DYNAMIC-INJECTION.md` — 新建
- `scripts/init-project.sh` — 新增角色化 CLAUDE.md 安装逻辑

---

## 5. blocked_by

无强依赖。建议在 TASK-031（settings.json 权限配置）完成后，将权限配置路径写入 CLAUDE.master.md 的静态说明区块，但不阻塞并行执行。

---

## 6. 执行记录（Slaver 填写）

**执行者**: slaver_fullstack_dev（fullstack_dev 角色）  
**执行分支**: feature/TASK-032-dynamic-injection  
**执行时间**: 2026-04-15T10:00:00+08:00 ~ 2026-04-15T11:00:00+08:00

### 实现摘要

**Part A — `template/CLAUDE.master.md`（已创建，172 行）**
- 动态注入区块（5 处）：ready 任务队列、in_progress 任务、pr_review 任务、待合并 PR（gh pr list）、inbox 最新消息
- 静态规则区块：Master 职责、禁止操作红线、心跳检查 4 问、PR Review 强制清单
- 引用 TASK-031 产出：`.claude/settings.json` 权限配置说明
- 引用 TASK-034 产出：`/eket-master-poll` 心跳命令

**Part B — `template/CLAUDE.slaver.md`（已创建，140 行）**
- 动态注入区块（3 处）：当前领取任务、git status 分支状态、可领取任务（ready）
- 静态规则区块：Slaver 职责、心跳检查 3 问、ACI 白名单、工作流程、Ticket 规范

**Part C — `scripts/init-project.sh`（已更新）**
- `copy_templates` 函数：新增复制 CLAUDE.master.md、CLAUDE.slaver.md 到项目根目录
- `configure_slaver_mode` 函数末尾：根据 `INSTANCE_ROLE` 将对应模板覆盖安装为 CLAUDE.md

**Part D — `template/docs/DYNAMIC-INJECTION.md`（已创建，200 行）**
- 基本语法说明（`` !`command` `` 语法）
- 安全原则（允许/禁止命令列表）
- Master 推荐注入模式（4 种）
- Slaver 推荐注入模式（3 种）
- 与静态内容的组合方式
- 调试与故障排除

### 测试结果

```
Test Suites: 49 passed, 49 total
Tests:       1132 passed, 1132 total
Snapshots:   0 total
Time:        12.475 s
Ran all test suites.
```

### 设计决策

1. **fallback 兜底**：所有动态注入命令末尾加 `|| echo "(fallback)"` 防止命令失败导致上下文报错
2. **行数控制**：CLAUDE.master.md 172 行，CLAUDE.slaver.md 140 行，均在 200 行限制内
3. **Slaver 任务注入**：通过读取 `.eket/state/instance_config.yml` 的 instance_id 过滤自己的任务（若文件不存在则降级显示所有 in_progress）
