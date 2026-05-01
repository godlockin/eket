# TASK-188: 修复SSE broadcast满溢静默丢事件

**优先级**: P1
**类型**: Bug
**模块**: eket-server / lib.rs:426
**来源**: 红队质疑 JeffDean

## 问题描述

`EventBus::new(256)` 容量256。`Lagged`错误直接 `None`（跳过），客户端不知情，Dashboard状态与实际不一致。任务批量完成时<1s填满channel。

## 验收标准

- [ ] `Lagged(n)` 时发送 `{event:"lagged", data:{missed:n}}` 通知客户端
- [ ] 客户端收到lagged事件后触发全量状态重新拉取（前端逻辑or文档说明）
- [ ] channel capacity改为可配置（默认4096）
- [ ] 添加metric：`eket_sse_lagged_total` counter（tracing span 或 prometheus-style log）
- [ ] 单元测试：发送300条事件，慢消费者收到lagged通知
