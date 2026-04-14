# TASK-025: Slaver 偏差处理协议（Deviation Rules 4 分类）

**Ticket ID**: TASK-025
**标题**: 为 Slaver 定义标准化偏差处理协议：4 类规则区分"自动修复"vs"上报 Master"
**类型**: improvement
**优先级**: P2

**状态**: pr_review
**创建时间**: 2026-04-14
**最后更新**: 2026-04-14
**started_at**: 2026-04-14T10:00:00Z
**completed_at**: 2026-04-14T10:30:00Z

**负责人**: slaver_claude_TASK025
**Slaver**: slaver_claude_TASK025

**gate_review_veto_count**: 0
**veto_reason**:
**resubmit_conditions**:

## 领取记录

| 操作 | Slaver / Reviewer | 时间 | 状态变更 |
|------|-------------------|------|----------|
| 领取 | slaver_claude_TASK025 | 2026-04-14T10:00:00Z | ready → in_progress |
| 提交 Review | slaver_claude_TASK025 | 2026-04-14T10:30:00Z | in_progress → pr_review |
| Review 通过 | — | — | pr_review → done |

---

## 1. 任务描述

借鉴 GSD executor 的 **Deviation Rules** 框架，为 EKET Slaver 建立明确的偏差处理协议。

当前 EKET Slaver 在遇到超出 ticket 范围的问题时没有明确规范：自己修还是上报 Master？什么情况需要暂停？导致：
- Slaver 过度修改（把不相关的 bug 顺手修了，带来意外变更）
- Slaver 卡住不知道怎么办（不知道上报的阈值）
- Master 无法预期 Slaver 的行为边界

### GSD Deviation Rules（借鉴原型）

| 规则 | 触发条件 | 行动 |
|------|---------|------|
| Rule 1 | Bug/错误逻辑/错误输出（当前任务范围内） | 自动修复 |
| Rule 2 | 缺失的关键功能（error handling/validation/security） | 自动补充 |
| Rule 3 | 阻塞性问题（missing dep/broken import/config error） | 自动修复 |
| Rule 4 | 架构决策（新表/新服务/接口变更/重大重构） | 暂停，上报 Master |
| 兜底 | 3次自动修复尝试失败 | 暂停，在执行报告里记录，等待指示 |

### EKET 适配版（4规则 + 边界 scope）

**Rule 1 — 自动修复（Bug Fix）**：
- 触发：当前 ticket 实现中发现明确 bug（逻辑错误、类型错误、边界条件）
- 行动：直接修复，在 PR 描述注明"顺带修复 Bug：[描述]"
- 范围限制：仅限当前 ticket 修改过的文件；预存在 bug（其他文件）不修

**Rule 2 — 自动补充（Missing Critical）**：
- 触发：实现中缺少 error handling、输入校验、关键 null guard
- 行动：补充，在 PR 描述注明
- 范围限制：仅限新增代码；不重构已有代码的 error handling

**Rule 3 — 自动修复（Blocking）**：
- 触发：missing dependency、broken import、编译错误（影响当前 ticket 构建）
- 行动：修复，记录在 PR 描述里
- 范围限制：只修复影响当前 ticket 的阻塞点；不做全局 dependency 整理

**Rule 4 — 必须上报（Architectural）**：
- 触发：以下任一情况：
  - 需要修改 DB schema / 数据结构定义
  - 需要新建 service / module（不在 ticket 范围内）
  - 需要修改公共 API 接口（影响其他 Slaver）
  - 需要重大重构（100+ 行受影响）
- 行动：**暂停当前 ticket**，在 `inbox/human_feedback/` 写入说明，标注 `[BLOCKED-ARCH]`
- 禁止：不得在没有 Master 指示的情况下自行决定架构变更

**兜底规则**：
- 同一问题修复尝试 ≥ 3 次失败 → 停止，在执行报告里记录失败细节，等待 Master 指示
- 预存在问题（非当前 ticket 引入）→ 记录到执行报告的 `deferred_issues` 字段，不修复

### 具体改动

**Part A — `template/docs/SLAVER-HEARTBEAT-CHECKLIST.md`**

新增"偏差处理协议"章节，包含完整的 4 规则表格和判断流程图（文字版）。

**Part B — `template/jira/ticket-template.md`**

在执行报告模板里新增 `deferred_issues` 字段：
```markdown
**deferred_issues**: <!-- 执行中发现但不在本 ticket 范围内的预存在问题 -->
```

**Part C — `CLAUDE.md`（项目级）**

在 Slaver 职责部分加入偏差处理协议引用，一句话说明和链接。

---

## 2. 验收标准

- [x] `SLAVER-HEARTBEAT-CHECKLIST.md` 包含偏差处理协议，4 规则清晰列出；验证：`grep -c 'Rule [1-4]' template/docs/SLAVER-HEARTBEAT-CHECKLIST.md` → 8 matches
- [x] `ticket-template.md` 执行报告区域包含 `deferred_issues` 字段；验证：`grep -l 'deferred_issues' template/jira/ticket-template.md` → template/jira/ticket-template.md
- [x] `CLAUDE.md` Slaver 职责段有偏差处理协议引用；验证：`grep -l '偏差处理\|Deviation' CLAUDE.md` → CLAUDE.md
- [x] Rule 4 必须上报触发条件具体可判断（无歧义）；内容：DB schema/新建 service/公共 API 修改/100+ 行重构，含判断清单
- [x] `npm test` 1109/1109 全部通过

---

## 4. 影响范围

- `template/docs/SLAVER-HEARTBEAT-CHECKLIST.md` — 新增偏差处理协议章节
- `template/jira/ticket-template.md` — 执行报告加 `deferred_issues` 字段
- `CLAUDE.md` — Slaver 职责段补充引用

---

## 5. blocked_by

无依赖，可立即开始。与 TASK-023/024/026 完全独立，可并行。

---

## 执行报告

**Slaver**: slaver_claude_TASK025
**started_at**: 2026-04-14T10:00:00Z
**completed_at**: 2026-04-14T10:30:00Z
**deferred_issues**: <!-- 无 -->

### 测试结果

```
Test Suites: 44 passed, 44 total
Tests:       1109 passed, 1109 total
Snapshots:   0 total
Time:        10.459 s
Ran all test suites.
```

### 构建结果

纯文档改动，无需编译构建。

### 实现说明

1. **Part A** — `template/docs/SLAVER-HEARTBEAT-CHECKLIST.md`：在"## 相关文档"章节前插入"## 偏差处理协议（Deviation Rules）"章节，包含 4 规则完整表格、兜底规则、预存在问题处理原则、Rule 4 判断清单（5 条可判断触发条件）。
2. **Part B** — `template/jira/ticket-template.md`：在 `## 6. 执行日志` 的 `{{EXECUTION_LOG}}` 字段后加入 `**deferred_issues**` 字段，含 HTML 注释说明。
3. **Part C** — `CLAUDE.md`：在 Slaver 心跳 3 个问题之后、详细清单链接之前加入偏差处理协议一句话引用，指向 SLAVER-HEARTBEAT-CHECKLIST.md。

所有改动仅新增内容，未修改或删除已有任何内容。
