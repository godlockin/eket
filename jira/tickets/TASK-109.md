# TASK-109: SSE 5态标准事件流 + Slaver 进度上报

## 元数据
- **状态**: todo
- **类型**: feature
- **优先级**: P1
- **负责人**: 待领取
- **创建时间**: 2026-04-20
- **依赖**: TASK-105b（task:claim/complete 已存在）

## 背景

借鉴 deer-flow 的 SSE 5态事件流：统一广播 task_started/running/completed/failed/timed_out，
替代 dashboard 轮询和 Master 定时扫描。同时增加 Slaver 中途进度上报 API，
让 task_running 事件携带实时 todos 进度。

## 验收标准

1. `GET /api/v1/events` — SSE 端点，支持 `?slaver=<id>` 过滤
2. 5 种标准事件自动广播（触发时机见下）
3. `node dist/index.js task:progress --phase <phase> --todos <n>` — Slaver 中途上报
4. Master heartbeat 订阅全局流，替代部分轮询逻辑
5. `npm test` 全绿，新增 ≥ 5 单测

## 事件格式

```
event: task_started
data: {"ticketId":"...","slaverId":"...","level":2,"timestamp":"..."}

event: task_running
data: {"ticketId":"...","slaverId":"...","progress":{"phase":"implement","todos":3,"done":1}}

event: task_completed
data: {"ticketId":"...","slaverId":"...","actualLevel":2,"durationMs":45000}

event: task_failed
data: {"ticketId":"...","slaverId":"...","reason":"..."}

event: task_timed_out
data: {"ticketId":"...","slaverId":"...","timeoutMs":900000}
```

## 触发时机

| 事件 | 触发位置 |
|------|---------|
| task_started | task:claim 成功后 |
| task_running | task:progress 命令调用时 |
| task_completed | task:complete 成功后 |
| task_failed | task:complete 出错 / ticket 写入 blocked |
| task_timed_out | stale-task-cleaner 超时清理时 |

## 实现步骤

1. `node/src/core/sse-bus.ts`（新建）— EventEmitter 单例，管理所有 SSE 连接
   - `publish(event: TaskEvent)` — 广播给所有连接（按 slaverId 过滤）
   - `addClient(res, slaverId?)` / `removeClient(res)`

2. `node/src/api/routes/system-routes.ts` — 新增 `/api/v1/events` 端点，接入 sseBus

3. `node/src/commands/` — 分别在 claim/complete/progress 调用 sseBus.publish()

4. `node/src/commands/task-progress.ts`（新建）— `task:progress` 命令
   - 参数：`--phase <analysis|implement|test|pr>` + `--todos <total>` + `--done <count>`
   - 调用 sseBus.publish task_running 事件

5. `node/src/index.ts` — 注册 task:progress 命令

6. 超时清理（`node/src/core/stale-task-cleaner.ts`）— 清理时 publish task_timed_out

7. 单测：sseBus publish/filter、task:progress 命令、5态触发验证

## TaskEvent 接口（追加到 types/index.ts）

```typescript
export type TaskEventType = 'task_started' | 'task_running' | 'task_completed' | 'task_failed' | 'task_timed_out';

export interface TaskEvent {
  type: TaskEventType;
  ticketId: string;
  slaverId: string;
  timestamp: string;
  payload?: Record<string, unknown>;
}
```
