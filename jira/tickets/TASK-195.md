# TASK-195: subscribe_redis改用BRPOP替代轮询

**优先级**: P2
**类型**: Performance
**模块**: eket-core / queue.rs:189
**来源**: 红队质疑 Linus

## 问题描述

`subscribe_redis` 用 `rpop + 200ms sleep` 忙等待，空队列时5次/秒×N channel×M实例 = 大量无效Redis roundtrip。注释声称用BRPOP但实际未实现。

## 验收标准

- [ ] `MessageQueue::subscribe_redis` 改为调用 `RedisQueue::poll()`（已实现BRPOP）
- [ ] 移除 `tokio::time::sleep(200ms)` 轮询循环
- [ ] BRPOP timeout=5s（与现有`poll()`一致）
- [ ] 单元测试：空队列时subscribe_redis阻塞等待而非立即返回None
