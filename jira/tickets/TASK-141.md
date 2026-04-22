# TASK-141: SSE 端点实现（axum Sse<S>）

## 元数据
- **类型**: feature
- **优先级**: P0
- **状态**: ready
- **创建**: 2026-04-21
- **依赖**: 无

## 背景

Node.js `sse-bus.ts` / `sse-event-bus.ts` 暴露 14 种事件类型的 Server-Sent Events 流，供 Web Dashboard 实时订阅。Rust `eket-server` 完全没有 SSE 路由，导致 Dashboard 无法获得实时状态更新。

## 验收标准

- [ ] `GET /sse/events` 端点，返回 `text/event-stream`
- [ ] 支持以下事件类型：
  - `task_started` / `task_completed` / `task_failed` / `task_blocked`
  - `agent_registered` / `agent_heartbeat` / `agent_offline`
  - `master_elected` / `master_failover`
  - `queue_overflow` / `queue_drained`
  - `review_requested` / `review_approved` / `review_rejected`
- [ ] 基于 `tokio::sync::broadcast` channel 实现内部 fanout
- [ ] 客户端断开时自动清理 sender
- [ ] `GET /sse/events?filter=task_*` 支持事件类型过滤

## 技术要点

```rust
// axum SSE
use axum::response::sse::{Event, Sse};
use futures::stream::{self, Stream};
use tokio::sync::broadcast;

async fn sse_handler(
    State(bus): State<Arc<EventBus>>,
) -> Sse<impl Stream<Item = Result<Event, Infallible>>> {
    let rx = bus.subscribe();
    let stream = BroadcastStream::new(rx)
        .map(|msg| Ok(Event::default().data(msg.unwrap().to_json())));
    Sse::new(stream).keep_alive(KeepAlive::default())
}
```

## 负责人
待认领（推荐：后端工程师 + Rust 工程师）
