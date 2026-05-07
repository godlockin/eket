# TASK-026: Analysis Paralysis Guard — Slaver 行动阈值规则

**Ticket ID**: TASK-026
**标题**: 为 Slaver 加入 Analysis Paralysis Guard：连续探索无行动时强制决策
**类型**: improvement
**优先级**: P2

**状态**: done
**创建时间**: 2026-04-14
**最后更新**: 2026-04-14
**started_at**: 2026-04-14T00:00:00+08:00
**completed_at**: 2026-04-14T00:10:00+08:00

**负责人**: slaver-TASK-026
**Slaver**: slaver-TASK-026

**gate_review_veto_count**: 0
**veto_reason**:
**resubmit_conditions**:

## 领取记录

| 操作 | Slaver / Reviewer | 时间 | 状态变更 |
|------|-------------------|------|----------|
| 领取 | slaver-TASK-026 | 2026-04-14T00:00:00+08:00 | ready → in_progress |
| 提交 Review | slaver-TASK-026 | 2026-04-14T00:10:00+08:00 | in_progress → pr_review |

---

## 1. 任务描述

借鉴 GSD 的 **Analysis Paralysis Guard**：当 agent 连续多次只读取文件而不执行任何写操作时，强制停止并说明原因。

GSD 原文规则：
> "If 5+ consecutive Read/Grep/Glob calls without Edit/Write/Bash → stop, state why in one sentence, either write code or report blocked."

在 EKET 中，Slaver 可能陷入"分析瘫痪"——不断读文件、搜索代码，但始终不开始实际修改。这会：
- 消耗大量 context window（读操作积累上下文）
- 拖延任务进度（Master heartbeat 检测到 stale）
- 产生大量无效思考链

### EKET 适配版规则

**Analysis Paralysis Guard（行动阈值规则）**：

```
规则：连续 5 次只读/搜索操作（Read/Grep/Glob/WebSearch）而没有任何写操作
      （Edit/Write/Bash/Task）→ 强制触发决策点

决策点行动（二选一）：
  A. 立即开始写代码（即使不完整也要先建立文件框架）
  B. 在执行报告里写明 BLOCKED 原因（一句话），等待 Master 指示

禁止：继续读更多文件、继续搜索、继续"分析"
```

**触发例外（不计入连续次数）**：
- Gate Review 阶段的初始分析（领取任务后首次理解需求，允许最多 10 次读操作）
- 明确在 ticket 里标注"需要先调研"的任务

### 具体改动

**Part A — `template/docs/SLAVER-HEARTBEAT-CHECKLIST.md`**

新增"行动阈值规则"章节（可与 TASK-025 的偏差处理协议放在同一"执行纪律"大节下）：

```markdown
### 行动阈值规则（Analysis Paralysis Guard）

执行阶段（in_progress）中，如果你已经连续做了 5 次或以上的纯读取操作
（Read/Grep/Glob/搜索）而没有任何写操作（Edit/Write/Bash），必须立即：

1. 停止继续读取
2. **选择以下之一**：
   - **开始写代码**：即使是框架/骨架代码也算，先建立文件结构
   - **报告 BLOCKED**：在执行报告里写一句话说明卡在哪里，等待 Master

不允许：再读 1 个文件、再搜索 1 次、再"想一想"。

**例外**：Gate Review 阶段首次分析允许最多 10 次读操作（理解需求期）。
```

**Part B — `CLAUDE.md`（项目级）**

在 Slaver 持续自我反思（心跳检查）的 3 个问题之后，加入第 4 个问题：

```markdown
4. **我是否陷入分析瘫痪？** → 如果已连续读取 5+ 个文件而没有写任何代码，立刻开始写或报告 BLOCKED
```

**Part C — `template/docs/SLAVER-HEARTBEAT-CHECKLIST.md`**

在现有的"心跳检查 3 问"节添加第 4 问（与 Part B 同步）。

---

## 2. 验收标准

- [ ] `SLAVER-HEARTBEAT-CHECKLIST.md` 包含行动阈值规则，阈值（5次）和行动选项明确；验证：`grep -l 'Analysis Paralysis\|行动阈值\|连续.*5' template/docs/SLAVER-HEARTBEAT-CHECKLIST.md`
- [ ] `CLAUDE.md` Slaver 心跳检查有第 4 问；验证：`grep -c '分析瘫痪\|Analysis Paralysis' CLAUDE.md`
- [ ] 规则逻辑自洽（例外条件不与主规则矛盾）；验证：人工阅读确认（附相关段落文本）
- [ ] `npm test` 1109+ 全部通过；验证：`cd node && npm test 2>&1 | tail -5`

---

## 4. 影响范围

- `template/docs/SLAVER-HEARTBEAT-CHECKLIST.md` — 新增行动阈值规则章节
- `CLAUDE.md` — Slaver 心跳检查加第 4 问

---

## 5. blocked_by

无依赖，可立即开始。与 TASK-023/024/025 完全独立，可并行。

---

## 6. 执行报告

**Slaver**: slaver-TASK-026
**started_at**: 2026-04-14T00:00:00+08:00
**completed_at**: 2026-04-14T00:10:00+08:00

### 测试结果

```
Test Suites: 44 passed, 44 total
Tests:       1109 passed, 1109 total
Snapshots:   0 total
Time:        10.808 s
```

### 构建结果

仅文档变更，无代码构建。`npm test` 全量通过（1109/1109）。

### 实现说明

**Part A — `template/docs/SLAVER-HEARTBEAT-CHECKLIST.md`**：
- "3 个问题"改为"4 个问题"
- 新增 `□ 问题 4：我是否陷入分析瘫痪？` 节，含判断标准、决策点行动（A/B）、禁止事项
- 新增独立章节 `## 行动阈值规则（Analysis Paralysis Guard）`，含完整规则、例外情况、原因说明
- 自检频率表新增 `问题 4（分析瘫痪）` 行（触发：连续 5 次读操作后立即）
- 最后更新时间改为 2026-04-14

**Part B — `CLAUDE.md`（项目根目录）**：
- "必须不时问自己 3 个问题"改为 4 个问题
- 加入第 4 问：分析瘫痪检测，阈值 5+，行动：写框架代码或报告 BLOCKED

**一致性验证**：
- 两文件均使用"连续 5+ 次读操作"作为阈值
- 两文件决策点行动一致（写代码 / 报告 BLOCKED）
- 例外条件（Gate Review 首次分析豁免 10 次）在 SLAVER-HEARTBEAT-CHECKLIST.md 中有详细说明

### 验证命令输出

```
CLAUDE.md：分析瘫痪/5+ 命中 1 处（第 40 行，第 4 问）
template/docs/SLAVER-HEARTBEAT-CHECKLIST.md：Analysis Paralysis Guard 命中，阈值"5次"命中多处
```
