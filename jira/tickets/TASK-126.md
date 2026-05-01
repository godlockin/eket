# TASK-126: [Rust] cache-layer — LRU + Redis 二级缓存

## 元数据
- **状态**: done
- **类型**: feature
- **优先级**: P0
- **负责人**: 待认领
- **创建时间**: 2026-04-21
- **依赖**: []
- **blocked_by**: []

## 背景

TS `cache-layer.ts`(20.9KB) 实现两级缓存：L1 内存 LRU + L2 Redis。
高频读操作（ticket 列表、agent 状态、配置）全走缓存，减少 SQLite/Redis 压力。
moka 依赖已加入 workspace，但 cache_layer.rs 未创建。

## 验收标准

- [ ] `rust/crates/eket-core/src/cache.rs` 实现 `CacheLayer`
- [ ] `get(key)` → `Option<serde_json::Value>` — L1 命中直返；L1 miss → 查 L2(Redis)；L2 命中 → 回填 L1
- [ ] `set(key, value, ttl_secs)` → 同时写 L1(moka) + L2(Redis，可选)
- [ ] `invalidate(key)` → L1 + L2 同时删除
- [ ] `invalidate_pattern(prefix)` → 删除匹配前缀的所有条目
- [ ] L2 Redis 不可用时静默降级到仅 L1
- [ ] `CacheStats { l1_hits, l2_hits, misses }` — 命中率统计
- [ ] 单元测试 ≥ 6 条：L1命中、L2回填L1、Redis降级、TTL过期、invalidate_pattern、stats计数

## 技术要点

- L1：`moka::future::Cache<String, serde_json::Value>`，max 1000 entries，TTL per entry
- L2：`RedisClient`（已有），GET/SET/DEL
- 并发安全：moka 自带，Redis 用 Arc<RedisClient>
- key 命名约定：`{namespace}:{id}` — e.g. `ticket:TASK-001`, `agent:slaver_1`
