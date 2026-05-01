# TASK-158: Redis Queue 语义统一（LPUSH/RPOP vs PUBLISH/SUBSCRIBE）

## 元数据
- **类型**: bugfix
- **优先级**: P0
- **状态**: ready
- **创建**: 2026-04-21
- **依赖**: 无

## 背景

Node.js 使用 `PUBLISH/SUBSCRIBE`（pub/sub，多消费者 fanout）。
Rust 使用 `LPUSH/RPOP`（list queue，单消费者）。
两者在同一 Redis 上使用不同语义，消息完全无法互通，跨语言协作时 Master（Node）发的消息 Slaver（Rust）永远收不到，反之亦然。

## 验收标准

- [ ] 统一选择：**LPUSH/RPOP**（任务队列语义，保证消费一次）或 **PUBLISH/SUBSCRIBE**（事件通知语义，fanout）
- [ ] 建议方案：双模式
  - 任务分发：`LPUSH/BRPOP`（保证单 Slaver 消费）
  - 事件通知：`PUBLISH/SUBSCRIBE`（Master 广播状态变更）
- [ ] Rust `queue.rs` 加 `QueueMode` 枚举，按消息类型自动选择
- [ ] Node.js `message-queue.ts` 对应对齐
- [ ] 集成测试：Node publish → Rust subscribe 收到；Rust LPUSH → Node BRPOP 消费

## 负责人
待认领（推荐：Rust 工程师 + 后端工程师）
