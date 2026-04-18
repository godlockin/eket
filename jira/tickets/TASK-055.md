---
id: TASK-055
title: "fix(message-queue): 修复 Redis subscriber 连接泄漏"
priority: P0
status: in-review
assignee: backend_dev
dispatched_by: master
created_at: 2026-04-18
---

## 背景

`node/src/core/message-queue.ts` 中 `RedisMessageQueue.subscribe()` 每次调用都创建新的 `RedisClient` 连接，但：
- 不存储引用
- `unsubscribe()` 只做 `Map.delete(channel)`，不断开底层连接
- `disconnect()` 只 `clear()` Map，不关闭任何 subscriber

长期运行会耗尽 Redis 连接池，导致服务崩溃。

## 验收标准

- [x] `subscribe()` 将 subscriber client 存入独立 Map（`subscriberClients: Map<string, RedisClient>`）
- [x] `unsubscribe(channel)` 调用对应 subscriber 的 `disconnect()` 后再删 Map 条目
- [x] `disconnect()` 遍历 subscriberClients 全部 `disconnect()`，再 `clear()`
- [x] subscribe 失败时清理已入 Map 的 channel（防 ALREADY_SUBSCRIBED 残留）
- [x] `HybridMessageQueue.publish()` Redis 失败时降级到 fileMQ（当前直接返回错误）
- [x] 新增 `message-queue.subscriber-cleanup.test.ts` 验证无泄漏
- [ ] `npm test` 全绿，`npm run build` 无错误

## 相关文件

- `node/src/core/message-queue.ts`
- `node/src/core/redis-client.ts`

## 实现说明

### 变更摘要

**`RedisMessageQueue`**:
1. 新增 `subscriberClients: Map<string, RedisClient>` 字段，与 `subscribedChannels` 并行维护
2. `subscribe()` 重构：先 connect subscriber，成功后再存入两个 Map，subscribeMessage 失败时回滚清理并 disconnect
3. `unsubscribe(channel)`: 取出对应 client → `disconnect()` → 从两个 Map 删除
4. `disconnect()`: 先遍历 `subscriberClients` 逐个 disconnect → clear → close pool

**`HybridMessageQueue.publish()`**:
- Redis 重试失败后，warn 日志 + fallback 到 `fileMQ.publish()`，而不是直接返回错误

### 测试覆盖

`node/tests/message-queue.subscriber-cleanup.test.ts` — 5 个测试用例：
- unsubscribe 触发 client disconnect
- disconnect 触发所有 subscriber client disconnect
- subscribe 失败无残留（可重订阅）
- 非存在 channel unsubscribe 是 no-op
- unsubscribe 后 disconnect 不双重调用

### 领取信息

- 领取时间: 2026-04-18
- 执行者: backend_dev Slaver
- 分支: feature/TASK-055-mq-connection-leak
