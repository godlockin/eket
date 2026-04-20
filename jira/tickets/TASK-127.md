# TASK-127: [Rust] conflict-resolver — 分布式锁 + 冲突解决

## 元数据
- **状态**: todo
- **类型**: feature
- **优先级**: P0
- **负责人**: 待认领
- **创建时间**: 2026-04-21
- **依赖**: []
- **blocked_by**: [TASK-123]

## 背景

TS `conflict-resolver.ts`(22.7KB) 实现三类冲突解决 + Redis 分布式锁。
目前 Rust 仅有 SQLite BEGIN IMMEDIATE 解决任务 claim 冲突，但资源锁、优先级冲突、等待队列完全缺失。

## 验收标准

- [ ] `rust/crates/eket-engine/src/lock.rs` 实现 `LockManager`
- [ ] `acquire(resource_id, owner_id, ttl_ms)` → `LockResult` — Redis SETNX + EX；Redis 不可用降级到内存 Mutex HashMap
- [ ] `release(resource_id, owner_id)` — 仅 owner 可释放（原子 Lua 脚本）
- [ ] `add_to_wait_queue(resource_id, requester_id)` — Redis LPUSH 等待队列
- [ ] `pop_next_waiter(resource_id)` → `Option<String>` — RPOP 取下一个
- [ ] `is_locked(resource_id)` → `bool`
- [ ] `rust/crates/eket-engine/src/conflict_resolver.rs` 实现 `ConflictResolver`
- [ ] `handle_task_conflict(ticket_id, claimants)` → `ConflictResolution` — 策略：first_claim_wins
- [ ] `handle_resource_conflict(resource_id, requestors)` → `ConflictResolution` — 策略：lock_queue
- [ ] `handle_priority_conflict(ticket_id, old_priority, new_priority)` — 重新分配
- [ ] 单元测试 ≥ 7 条：获锁/释放、owner 校验、等待队列FIFO、降级内存锁、task冲突、resource冲突

## 技术要点

- Redis Lua 原子释放：`if redis.call('get',KEYS[1])==ARGV[1] then return redis.call('del',KEYS[1]) end`
- 内存降级：`Arc<RwLock<HashMap<String, LockInfo>>>` + `Instant` TTL
- `LockResult { success: bool, lock_id: String, expires_at: i64 }`
