# TASK-115: 轻量 Trace Store — Slaver 执行可观测性

## 元数据
- **状态**: done
- **类型**: feature
- **优先级**: P2
- **负责人**: 待领取
- **创建时间**: 2026-04-20
- **依赖**: TASK-109（SSE event bus 已完成）
- **PR**: https://github.com/godlockin/eket/pull/124

## 背景

Master 当前对 Slaver 执行过程是黑盒：只能看到 PR 结果，无法知道读了哪些文件、调用了哪些工具、在哪里花了最多时间。
参考 Opik 的 distributed tracing 思路，在 EKET 内部构建轻量 trace store（SQLite + SSE），
不引入外部基础设施，未来可导出到 Opik/Jaeger 等标准格式。

## 验收标准

- [ ] `sqlite-client.ts` 新增 `trace_spans` 表：`span_id TEXT PK, trace_id TEXT, parent_span_id TEXT, tool TEXT, args_json TEXT, output_summary TEXT, duration_ms INTEGER, ticket_id TEXT, slaver_id TEXT, created_at INTEGER`；验证：`grep -n "trace_spans" node/src/core/sqlite-client.ts`
- [ ] 新增 `node/src/core/tracer.ts`，导出 `Tracer` class + `startSpan(tool, args, ticketId, slaverId)` → `span` / `span.finish(output)`；验证：`ls node/src/core/tracer.ts`
- [ ] HTTP hook server 的 `pre-tool-use` pipeline 自动记录每次工具调用 span；验证：`grep -n "Tracer" node/src/hooks/pipelines/pre-tool-use.ts`
- [ ] 新增 API endpoint `GET /api/v1/traces?ticket=TASK-xxx` 返回该 ticket 的所有 span，按时间排序；验证：`curl -s http://localhost:3000/api/v1/traces?ticket=TASK-001 | jq '.spans | length'`
- [ ] SSE bus 新增 `span_emitted` 事件类型，Tracer 每次 finish span 时 publish；验证：`grep -n "span_emitted" node/src/core/sse-bus.ts`
- [ ] ≥5 单元测试：startSpan/finish、parent-child 嵌套、按 ticket 查询、duration 计算正确；验证：`npm test -- --testPathPattern=tracer 2>&1 | grep -E "PASS|FAIL"`
- [ ] `npm test` 无新增失败；验证：`cd node && npm test 2>&1 | tail -3`

## 实现要点

```typescript
// node/src/core/tracer.ts
export class Tracer {
  startSpan(tool: string, args: unknown, ticketId: string, slaverId: string): Span
}

class Span {
  readonly spanId: string;
  readonly traceId: string;  // = ticketId + slaverId + timestamp
  finish(output: unknown): void  // 计算 duration，写 SQLite，publish SSE
}
```

SQLite schema：
```sql
CREATE TABLE IF NOT EXISTS trace_spans (
  span_id TEXT PRIMARY KEY,
  trace_id TEXT NOT NULL,
  parent_span_id TEXT,
  tool TEXT NOT NULL,
  args_json TEXT,
  output_summary TEXT,
  duration_ms INTEGER,
  ticket_id TEXT,
  slaver_id TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_trace_spans_ticket ON trace_spans(ticket_id);
```

API response format:
```json
{
  "ticket": "TASK-xxx",
  "spans": [
    { "spanId": "...", "tool": "Read", "args": "...", "durationMs": 45, "createdAt": "..." }
  ]
}
```
