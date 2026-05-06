# Redis 在 Rust EKET 中的架构角色分析

**分析时间**: 2026-05-06  
**结论**: ✅ **Redis 是可选依赖，完全支持降级**

---

## Redis 使用场景

| 模块 | 用途 | 降级策略 | Redis 不可用时行为 |
|------|------|---------|-------------------|
| **election.rs** | Master 选举（分布式锁）| 三级降级 | Redis → SQLite → File ✅ |
| **registry.rs** | Slaver 注册缓存 | Warn + SQLite-only | 仅用 SQLite ✅ |
| **queue.rs** | 任务队列/事件总线 | File queue fallback | Level 2 file queue ✅ |
| **pubsub.rs** | 发布订阅 | 静默失败 | 返回 Ok(())，不报错 ✅ |
| **cache.rs** | 通用缓存 | Unavailable mode | 跳过缓存，直接查源 ✅ |

---

## 关键发现

### 1. task:resume 完全不依赖 Redis ✅

```bash
grep -rn "redis" crates/eket-cli/src/commands/task_resume.rs
# (无输出) → 完全不使用 Redis
```

**Checkpoint 存储**: 仅 SQLite `execution_checkpoints` 表

**Node.js `resumeWithFallback`**: 旧架构遗留，Rust 从一开始就是 SQLite-only

### 2. Redis 降级模式已完整实现 ✅

**`EketRedisClient::new_unavailable()`**: 永久不可用 stub，silent fail-safe

**三级降级（election.rs）**:
- Level 3: Redis SETNX
- Level 2: SQLite INSERT OR IGNORE
- Level 1: File mkdir

**当前运行**: Level 2（Redis unavailable → file queue fallback）

---

## TASK-142 决策

**结论**: ✅ **标记为 wont-fix**（Not applicable）

**理由**:
1. Rust `task:resume` 从未使用 Redis
2. 无需 fallback（SQLite 已是最终层）
3. 降级由 `task:create/claim/complete` 统一处理

**后续**: 创建 TASK-288（task_resume 测试增强，≥5 单测）

---

## Redis 依赖总结

- **必需性**: ❌ 否（可选）
- **默认**: Level 2（file queue）
- **生产建议**:
  - 单机: 无需 Redis
  - 多机: 推荐 Redis（分布式锁 + 更快消息队列）
