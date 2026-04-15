# TASK-028: Ticket 执行 DAG 可视化 — Web Dashboard 追踪

**Ticket ID**: TASK-028
**标题**: 在 Web Dashboard 新增 Ticket 执行 DAG 可视化（借鉴 LangSmith tracing）
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

借鉴 LangSmith 的 **tracing/span** 设计，在 EKET 的 `master:heartbeat` 报告和 Web Dashboard 中加入 Ticket 执行路径可视化：每个 Ticket 的状态流转记录成一条时间线，让 Master 一眼看清"哪个 Slaver 在哪个阶段花了多少时间"。

**问题**：当前 master:heartbeat 只输出快照（当前状态），看不到历史路径和耗时分布。

### 具体改动

**Part A — `node/src/commands/master-heartbeat.ts`**

在 `HeartbeatReport` 接口新增 `ticketTimelines` 字段：

```typescript
interface TicketEvent {
  ticketId: string;
  status: string;        // 状态名
  enteredAt: string;     // ISO8601，进入该状态的时间
  durationMinutes?: number; // 在该状态停留时长（如已离开）
  actor?: string;        // 操作者（Slaver ID / gate_reviewer）
}

interface TicketTimeline {
  ticketId: string;
  title: string;
  currentStatus: string;
  events: TicketEvent[];
  totalElapsedMinutes?: number;
}

// 在 HeartbeatReport 中新增：
ticketTimelines: TicketTimeline[];
```

`generateReport()` 中解析 ticket 文件的「领取记录」表格，提取各状态进入时间，构建 timeline。

**Part B — `master:heartbeat --timeline` 输出格式**

```
TICKET TIMELINES
════════════════
TASK-027  ACI 白名单  [done, 25min total]
  ready ──(5min)──► gate_review ──(2min)──► in_progress ──(15min)──► pr_review ──(3min)──► done

TASK-028  DAG 可视化  [in_progress, 40min elapsed]
  ready ──(3min)──► gate_review ──(1min)──► in_progress ──(36min elapsed)──► ?
```

**Part C — 新增 3 个单元测试**

`node/tests/commands/master-heartbeat.test.ts` 新增：
1. 解析领取记录表格 → 正确提取 events
2. 计算阶段耗时（两个时间戳之差）
3. 当时间戳缺失时不 crash（graceful）

---

## 2. 验收标准

- [ ] `HeartbeatReport` 接口包含 `ticketTimelines` 字段；验证：`grep -l 'ticketTimelines' node/src/commands/master-heartbeat.ts`
- [ ] `master:heartbeat --timeline` 输出包含各阶段耗时；验证：`node dist/index.js master:heartbeat --timeline 2>&1 | grep -E 'TIMELINE|min'`
- [ ] 时间戳缺失时不 crash；验证：对缺少 `started_at` 的 ticket 运行命令，exit code 为 0
- [ ] 新增 3 个测试，全量 1112+ 通过；验证：`cd node && npm test 2>&1 | tail -3`

---

## 3. 技术方案

领取记录表格格式固定（Markdown 表格），用正则解析：

```typescript
// 解析表格行：| 操作 | Slaver | 时间 | 状态变更 |
const tableRowRegex = /^\|\s*([^|]+)\s*\|\s*([^|]+)\s*\|\s*([^|]+)\s*\|\s*([^|]+)\s*\|/;
```

时间戳优先读「领取记录」表格中的时间列（已有），其次读 `started_at`/`completed_at` 字段。

---

## 4. 影响范围

- `node/src/commands/master-heartbeat.ts` — 新增 ticketTimelines + --timeline 输出
- `node/tests/commands/master-heartbeat.test.ts` — 新增 3 个测试

---

## 5. blocked_by

无依赖。与 TASK-027/029/030 可并行。
