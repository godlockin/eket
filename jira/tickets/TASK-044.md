# TASK-044: SDLC 事件关联图（Harness Knowledge Graph 借鉴）

**Ticket ID**: TASK-044
**Epic**: SELF-EVOLVE
**标题**: 构建 EKET 轻量级事件关联图，支持跨 ticket 根因分析与趋势感知
**类型**: feature
**优先级**: P2
**重要性**: medium

**状态**: backlog
**创建时间**: 2026-04-16
**创建者**: Master
**负责人**: 待领取

**依赖关系**:
- blocks: []
- blocked_by: [TASK-042]

**标签**: `knowledge-graph`, `sdlc`, `root-cause`, `analytics`, `harness`

---

## 1. 需求概述

### 1.1 背景与动机

**借鉴来源**：Harness AIDA 的 Software Delivery Knowledge Graph + Root Cause Analysis 机制。

**Harness 核心洞见**：把 CI/CD 流水线、代码变更、测试失败、部署事件作为图节点，通过边（因果/时序关系）连接，AI 分析路径得出"真正根因"而非表面症状。

**EKET 现状**：Master 靠人工扫描 `jira/tickets/*.md` + `confluence/progress-tracker.md` 判断项目状态，无结构化因果链。重复失败（如同类 CI 报错）无法自动识别为趋势。

**目标**：在 SQLite 中构建轻量级事件图，Slaver 每次状态推进时写入事件节点，Master 可查询"哪类任务最容易在 pr_review 阶段 block"、"最近 5 次 HOOK_BLOCKED 错误的共同原因"。

### 1.2 功能描述

1. 每次 `transitionStatus()` 写入事件节点到 `sdlc_events` 表
2. hook 失败时写入 `sdlc_edges` 关联"ticket → 错误类型"
3. `node dist/index.js graph:query --type blocked` 输出阻塞热点
4. `node dist/index.js graph:query --ticket TASK-XXX` 输出该 ticket 事件时间线

### 1.3 验收标准

- [ ] `node/src/core/event-graph.ts` 新建，提供 `recordEvent()` / `queryBlockedHotspots()` / `queryTicketTimeline()`
- [ ] `transitionStatus()` 每次调用后写入事件（不阻塞主流程，fire-and-forget）
- [ ] `node dist/index.js graph:query --type blocked` 输出 top-3 阻塞节点
- [ ] `node dist/index.js graph:query --ticket TASK-042` 输出该 ticket 时间线
- [ ] 新增 4 个测试（recordEvent、queryBlockedHotspots、queryTicketTimeline、fire-and-forget 不 throw）
- [ ] `npm run build && npm test` 0 error

---

## 2. 技术设计

### 2.1 影响文件

| 文件 | 变更类型 | 说明 |
|------|----------|------|
| `node/src/core/event-graph.ts` | 新建 | 事件图读写逻辑 |
| `node/src/core/sqlite-client.ts` | 修改 | 新增 `sdlc_events` / `sdlc_edges` 表 Schema |
| `node/src/core/workflow-engine.ts` | 修改 | `transitionStatus` 后 fire-and-forget `recordEvent` |
| `node/src/commands/graph-query.ts` | 新建 | CLI 命令 |
| `node/src/index.ts` | 修改 | 注册 `graph:query` 命令 |
| `node/tests/core/event-graph.test.ts` | 新建 | 4 个测试 |

### 2.2 Schema 设计

```sql
-- 事件节点
CREATE TABLE IF NOT EXISTS sdlc_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id TEXT NOT NULL,
  event_type TEXT NOT NULL,   -- 'transition'|'hook_blocked'|'hook_passed'|'completed'
  from_status TEXT,
  to_status TEXT,
  error_code TEXT,            -- EketErrorCode，NULL 表示成功
  slaver_id TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 因果边（error_code → ticket 聚合）
CREATE TABLE IF NOT EXISTS sdlc_edges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_event_id INTEGER REFERENCES sdlc_events(id),
  edge_type TEXT NOT NULL,    -- 'caused_by'|'similar_to'|'blocked_by'
  target_event_id INTEGER REFERENCES sdlc_events(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 2.3 graph:query 输出示例

```
$ node dist/index.js graph:query --type blocked
[Graph] Top blocked transitions (last 30d):
  1. ready → pr_review  (HOOK_BLOCKED × 7)  tickets: TASK-036, TASK-038...
  2. in_progress → test (TIMEOUT × 3)       tickets: TASK-033b, TASK-034...

$ node dist/index.js graph:query --ticket TASK-042
[Graph] TASK-042 timeline:
  2026-04-16T10:00Z  backlog → ready     (by: master)
  2026-04-16T14:00Z  ready → in_progress (by: slaver_1)
  2026-04-16T18:00Z  in_progress → test  (by: slaver_1)
  2026-04-16T18:05Z  HOOK_BLOCKED        (validate-ticket-pr.sh: MISSING_PR_URL)
  2026-04-16T20:00Z  test → pr_review    (by: slaver_1)  [hook passed]
```

### 2.4 设计决策

1. **Fire-and-forget**：`recordEvent` 用 `void promise`，不阻塞 `transitionStatus` 返回，图写入失败不影响主流程
2. **SQLite 而非独立图数据库**：EKET 已有 SQLite，避免新增依赖；数据量小（ticket 级别），关系查询够用
3. **不实时推理根因**：只存数据 + 提供查询 CLI，Root Cause Analysis 留给 Master/人工判断，避免过度 AI 化

---

## 4. 执行记录

### 4.1 领取信息
- **领取者**: 待填写
- **领取时间**: 待填写
- **预计工时**: 2.5h

### 4.2 状态流转

| 时间 | 状态变更 | 操作者 | 备注 |
|------|----------|--------|------|
| 2026-04-16 | backlog → ready | Master | 初始创建，借鉴 Harness AIDA Knowledge Graph + Root Cause Analysis |
