# TASK-651: Scheduler 锁竞争优化 (Sharded Locks)

**EPIC**: EPIC-017  
**状态**: done  
**优先级**: P1  
**预估**: 1.5d  
**依赖**: TASK-650  
**层级**: L1 Rust  
**来源**: Jeff Dean Review

---

## 问题描述

`scheduler.rs:130-144` 顺序获取多个 `Arc<Mutex>`，`progress()` (lines 368-385) 同时锁住所有状态，串行化读取。

**影响**：10K 节点场景下成为性能瓶颈。

## 验收标准

- [x] 用 sharded locks 或 lock-free 数据结构替换全局锁
- [x] `progress()` 不再阻塞写操作
- [x] 基准测试：1K/5K/10K 节点吞吐量对比
- [x] 无死锁风险

## 优化方案

### 方案 A：Sharded Locks

```rust
// 按 node_id hash 分片
struct ShardedState {
    shards: Vec<RwLock<HashMap<String, NodeState>>>,
    shard_count: usize,
}

impl ShardedState {
    fn get_shard(&self, node_id: &str) -> &RwLock<...> {
        let hash = fxhash::hash(node_id);
        &self.shards[hash % self.shard_count]
    }
}
```

### 方案 B：Lock-free (DashMap)

```rust
use dashmap::DashMap;

struct Scheduler {
    node_states: DashMap<String, NodeState>,
    // ...
}
```

### 方案 C：Actor Model

```rust
// 每个 shard 一个 actor，通过 channel 通信
enum SchedulerMsg {
    UpdateState(String, NodeState),
    GetProgress(oneshot::Sender<Progress>),
}
```

**推荐**：方案 B (DashMap)，最简单且性能足够。

---

## 变更日志

| 日期 | 变更 | 操作人 |
|------|------|--------|
| 2026-06-01 | 创建 ticket (Jeff Dean Review P1) | Master |
| 2026-06-02 | 实现完成: DashSet 替换 Mutex<HashSet>, 基准测试覆盖 1K/5K/10K 节点 | Slaver |
