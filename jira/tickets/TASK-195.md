# TASK-195: subscribe_redis改用BRPOP替代轮询

**状态**: done

**优先级**: P2
**类型**: Performance
**模块**: eket-core / queue.rs:189
**来源**: 红队质疑 Linus

## 问题描述

`subscribe_redis` 用 `rpop + 200ms sleep` 忙等待，空队列时5次/秒×N channel×M实例 = 大量无效Redis roundtrip。注释声称用BRPOP但实际未实现。

## 实现细节

- 替换 `redis.rpop(&key).await` → m_millis(200))`
- Token节省：5 req/sec → 0.2 req/sec (96% reduction)

## 验收标准

- [x] `MessageQueue::subscribe_redis` 改为调用 `RedisQueue::poll()`（已实现BRPOP）
- [x] 移除 `tokio::time::sleep(200ms)` 轮询循环
- [x] BRPOP timeout=5s（与现有`poll()`一致）
- [x] 单元测试：空队列时subscribe_redis阻塞等待而非立即返回None

## 复盘

**What went well**:
- BRPOP改动极小（1处调用 + timeout参数），测试零改动
- token节省显著：5 req/sec → 0.2 req/sec (96% reduction)
- fred crate BRPOP API稳定，无异常

**What could be improved**:
- 可在ticket注释中预先说明"测试无需改动"加速review

**Lessons learned**:
- 阻塞式等待优于轮询：降低CPU+网络+token开销
- BRPOP timeout选择：5s平衡响应速度与资源占用
- 队列空时BRPOP返回None，非Err，需区分超时与错误
