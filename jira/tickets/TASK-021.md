# TASK-021: Ticket 加入执行时间戳字段 + master:heartbeat 执行时长统计

**Ticket ID**: TASK-021
**标题**: Ticket 模板加 started_at/completed_at；master:heartbeat 输出 avg_execution_time 与慢任务检测
**类型**: improvement
**优先级**: P1

**状态**: ready
**创建时间**: 2026-04-14
**最后更新**: 2026-04-14

**负责人**: 待领取
**Slaver**: 待领取

**gate_review_veto_count**: 0
**veto_reason**:
**resubmit_conditions**:

## 领取记录

| 操作 | Slaver / Reviewer | 时间 | 状态变更 |
|------|-------------------|------|----------|
| 领取 | — | — | ready → gate_review |
| Gate Review APPROVE | gate_reviewer | — | gate_review → in_progress |
| Gate Review VETO | gate_reviewer | — | gate_review → analysis |
| 提交 Review | — | — | in_progress → pr_review |
| Review 通过 | — | — | pr_review → done |

---

## 1. 任务描述

Harness 借鉴点：`io_harness_custom_metric_task_execution_time` 追踪任务耗时，识别慢任务。

EKET 现在靠文件 mtime 判断 Slaver 是否 stale（30 分钟无更新），但 mtime 不精确（文件被读也会更新）。
通过在 Ticket 里记录 `started_at` / `completed_at`，Master 可以：
1. 精确计算任务耗时
2. 识别"跑了超过 2 小时还没完成"的慢任务
3. 在 heartbeat report 里暴露 `avgExecutionTime`（分钟）

### 两部分工作

**Part A — Ticket 模板加字段**（`template/jira/ticket-template.md`）

在领取记录表新增两列，或在元数据区域加两个字段：
```markdown
**started_at**: <!-- Slaver 领取任务进入 in_progress 时填写，格式 ISO8601 -->
**completed_at**: <!-- Slaver 将任务推进到 done 时填写，格式 ISO8601 -->
```
放在 `**最后更新**` 行之后。

同时在模板说明注释里标注：这两个字段由 Slaver 负责填写（不是 Master）。

**Part B — master:heartbeat 新增执行时长统计**（`node/src/commands/master-heartbeat.ts`）

在 `generateReport()` 里增加：
1. 解析所有 `in_progress` / `done` 状态 ticket 的 `started_at` 字段
2. 计算：
   - `slowTasks`：`in_progress` 状态且 `started_at` 距今超过 120 分钟的 ticket 列表
   - `avgExecutionMinutes`：所有有 `started_at` + `completed_at` 的 done ticket 的平均执行分钟数
3. 将这两个字段加入 `HeartbeatReport.progress`：
   ```typescript
   progress: {
     // 现有字段...
     slowTasks: TicketInfo[];          // 新增
     avgExecutionMinutes: number | null;  // 新增，无数据时为 null
   }
   ```
4. 健康评级更新：有 `slowTasks.length > 0` → 至少 YELLOW

**不做**：
- 不修改 CLI 参数
- 不强制校验 ticket 里必须有这两个字段（向后兼容，字段缺失时跳过）

---

## 2. 验收标准

- [ ] `template/jira/ticket-template.md` 在元数据区域有 `started_at` / `completed_at` 字段，有注释说明由 Slaver 填写
- [ ] `HeartbeatReport.progress` 包含 `slowTasks` 和 `avgExecutionMinutes`
- [ ] `generateReport()` 正确解析 `started_at`（ISO8601 字符串 → Date，解析失败时跳过不 crash）
- [ ] 慢任务阈值 120 分钟，作为具名常量 `SLOW_TASK_THRESHOLD_MINUTES = 120`
- [ ] 有 `started_at` + `completed_at` 的 done ticket 参与均值计算
- [ ] `npm run build` 零 TS 错误
- [ ] `npm test` 1105+ 全部通过
- [ ] 新增测试：
  - 一个 `in_progress` ticket，`started_at` 设为 3 小时前 → `slowTasks.length === 1`
  - 两个 done ticket，执行时长分别 60min / 120min → `avgExecutionMinutes === 90`
  - `started_at` 字段缺失时不 crash

---

## 3. 技术方案

### Ticket 字段解析（master-heartbeat.ts）

```typescript
const SLOW_TASK_THRESHOLD_MINUTES = 120;

function parseTimestamp(content: string, field: string): Date | null {
  const match = content.match(new RegExp(`\\*\\*${field}\\*\\*:\\s*(\\S+)`));
  if (!match || !match[1] || match[1].startsWith('<!--')) return null;
  const d = new Date(match[1]);
  return isNaN(d.getTime()) ? null : d;
}

// 在 parseTicket() 里调用
const startedAt = parseTimestamp(content, 'started_at');
const completedAt = parseTimestamp(content, 'completed_at');
```

### 均值计算

只统计同时有 `started_at` 和 `completed_at` 的 `done` 状态 ticket：
```typescript
const completedWithTiming = doneTickets.filter(t => t.startedAt && t.completedAt);
const avgExecutionMinutes = completedWithTiming.length > 0
  ? completedWithTiming.reduce((sum, t) =>
      sum + (t.completedAt!.getTime() - t.startedAt!.getTime()) / 60000, 0
    ) / completedWithTiming.length
  : null;
```

---

## 4. 影响范围

- `template/jira/ticket-template.md` — 新增两个字段
- `node/src/commands/master-heartbeat.ts` — `generateReport()` 增强
- `node/tests/commands/master-heartbeat.test.ts` — 新增测试用例

---

## 5. blocked_by

无依赖，可立即开始。与 TASK-020 完全独立，可并行。
