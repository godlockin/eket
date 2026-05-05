# TASK-181: 修复Redis续租无条件SET——改为Lua CAS脚本

**状态**: done

**优先级**: P0
**类型**: Bug
**模块**: eket-core / election.rs:175
**来源**: 红队质疑 Linus+JeffDean

## 问题描述

Redis续租用无条件 `SET key value EX ttl`。网络分区后锁TTL到期，实例B赢得选举，分区恢复后实例A的renewer唤醒执行无条件SET，覆盖实例B的锁 → 两个实例都认为自己是Master → split-brain。

```rust
// 当前错误实现
match redis.set(REDIS_LOCK_KEY, &id, Some(REDIS_LEASE_TTL_SECS)).await {
    Ok(_) => { /* 不检查是否真的是自己持有锁 */ }
```

## 验收标准

- [ ] 续租改用 Redis EVAL Lua 脚本（原子CAS）：
  ```lua
  if redis.call("GET", KEYS[1]) == ARGV[1] then
      return redis.call("SET", KEYS[1], ARGV[1], "EX", ARGV[2])
  else
      return 0
  end
  ```
- [ ] 续租返回0时触发 `resign()` + 重新选举
- [ ] 单元测试：模拟锁被他人夺走后续租失败并触发重选
- [ ] `fred` crate 调用方式确认（ScriptInterface / EVAL）
