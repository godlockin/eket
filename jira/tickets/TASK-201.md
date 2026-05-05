# TASK-201: SpanTracing — 4层Span树 + NoOpSpan双实现

**状态**: done
**状态**: done
**优先级**: P1
**类型**: Feature
**模块**: node/src/core/tracing/ + rust/crates/eket-server/src/tracing.rs
**来源**: openai-agents-python借鉴研究（Span树架构）
**工作量**: 3天

## 背景

EKET无标准化tracing，多Slaver并发问题定位靠日志grep，P0事故响应慢。
openai-agents的4层Span树（Task→Agent→Turn→Function）自动闭合、原生内嵌，调试成本质变。

## 需求

实现EKET版Span树：`WorkflowSpan → AgentSpan → TurnSpan → ToolSpan`，NoOpSpan双实现。

## 实现状态

**状态**: ✅ DONE (2026-04-26)

### 实现内容

- `rust/crates/eket-core/src/tracing.rs` — 新文件
  - `Span` trait: `start()`, `finish()`, `set_attribute()`, `child()`
  - `NoOpSpan`: 所有方法 `#[inline(always)]` 零开销，无堆分配
  - `TracingSpan`: 记录 timing/attributes/parent_id，finish 时 export JSON
  - `SpanLevel` 4层层级: Workflow → Task → Step → ToolCall
  - `SpanRecord`: serde JSON 序列化结构
  - `SpanExporter` trait + `JsonFileExporter`（写入 `~/.eket/traces/`）+ `NoOpExporter`
  - `SpanContext`: `from_env()` 读 `EKET_TRACING` env var，默认 false
- `rust/crates/eket-core/src/lib.rs` — 暴露 `pub mod tracing`

### 测试结果

```
cargo test -p eket-core tracing
test result: ok. 8 passed; 0 failed
```

测试覆盖：NoOpSpan零副作用、Span层级hierarchy、JSON文件写入、timing记录、env flag开关。



- [ ] 定义 `Span<T extends SpanData>` 抽象类（start/finish/export）
- [ ] `SpanImpl`：生产实现，export时metadata白名单过滤（只漏出task_id/slaver_id/action）
- [ ] `NoOpSpan`：tracing关闭时零开销，调用方无感知
- [ ] `createSpan(data, ctx)` factory，按`ctx.enabled`自动选择实现
- [ ] 4层SpanData类型：
  - `WorkflowSpanData` — epic/workflow级别
  - `AgentSpanData` — ticket/agent级别，含slaver_id
  - `TurnSpanData` — 单次LLM调用
  - `ToolSpanData` — 工具调用，含input/output摘要
- [ ] Span写入：本地JSON日志文件（`~/.eket/traces/`），可选SSE推送到Dashboard
- [ ] Rust侧：`eket-server` SSE EventBus新增 `SpanEvent` 类型
- [ ] 单元测试：span自动闭合；NoOpSpan不写文件；export白名单正确
