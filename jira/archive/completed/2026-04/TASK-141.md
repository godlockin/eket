# TASK-141: SSE 5态事件流补完（原 TASK-109）

## 元数据
- **状态**: done
- **类型**: feature
- **优先级**: P1
- **创建时间**: 2026-04-21
- **依赖**: 无（EventBus 基础设施已存在）

## 背景

原 TASK-109 在 Rust 重构 round 中被删除，但实际只完成 30%：
- ✅ 基础设施：`rust/crates/eket-engine/src/event_bus.rs`（299 行，tokio broadcast + 死信队列 + 重试）
- ❌ SSE HTTP 端点：axum 路由里 grep `text/event-stream` 零匹配
- ❌ 5 种标准事件类型：只有 `mailbox.rs::Message::TaskCompleted` 一个
- ⚠️ `task:progress` CLI：Rust 版语义错位——只展示 ticket 完成统计 + 关键路径，**不是 Slaver 中途上报**
- ✅ Master heartbeat：`master_heartbeat.rs` 已有，但未订阅事件流

**目的**：用 SSE push 替代 dashboard 轮询和 Master 定时扫描，降低延迟 + 减负。

## 验收标准

1. **5 种标准事件类型**（在 `eket-engine/src/events.rs` 新增 enum）：
   - `task_started` / `task_running` / `task_completed` / `task_failed` / `task_timed_out`
2. **SSE 端点**：`GET /api/v1/events?slaver=<id>&ticket=<id>`
   - 用 `axum::response::sse::Sse` + `tokio_stream`
   - 支持过滤、断线重连（Last-Event-ID）
3. **Slaver 中途上报 CLI**：`eket task:progress-report --phase <phase> --done <n> --total <m>`
   - 与现有 `task_progress.rs`（统计型）做区分，可改名为 `task_progress_stats`
4. **Master heartbeat 订阅**：`master_heartbeat.rs` 订阅 task_completed/failed 事件，替代部分轮询
5. **测试**：≥ 5 单测（事件序列化、SSE stream、Last-Event-ID 重连、Slaver 上报、Master 订阅）
6. **文档**：`rust/docs/SSE-EVENTS.md` 含事件 schema + 端点契约

## 技术提示

- 原 TS 票完整内容：`git show e5ac393b:jira/tickets/TASK-109.md`
- axum SSE 示例：`https://docs.rs/axum/latest/axum/response/sse/`
- 与 `event_bus.rs` 的关系：5 态事件作为 DomainEvent 的特化类型
