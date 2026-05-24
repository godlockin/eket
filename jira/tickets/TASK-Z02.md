# TASK-Z02: Rust Native 消息总线与 Pub/Sub 订阅分发

**ID**: TASK-Z02  
**Epic**: EPIC-010  
**优先级**: P0  
**预估**: 8h  
**依赖**: None  
**Agent Type**: backend  
**Category**: 🔧 Rust Engine Core / Message & Channels

---

## Goal

在 Rust Core 中替换原有的 Node.js 混合同步消息总线，利用 Rust 的高并发管道（tokio channels/mpsc）和高性能异步网络通道，提供原生的 Redis Pub/Sub 与物理文件降级队列分发能力，最大程度缩短高吞吐下多 Agent 的消息交互时延（< 1ms），降低系统级内存与 CPU 负载。

---

## Acceptance Criteria

**AC-1**: 原生 Redis 异步订阅  
- Given: Redis 连接处于就绪状态
- When: 多个 Slaver 或 Master 订阅特定频道（如 `eket:mailbox:*`）时
- Then: Rust 后台长驻订阅线程，通过高性能异步 I/O 监听分发，完全免除 Node.js 端频繁的网络套接字轮询损耗

**AC-2**: 磁盘队列高并发降级写入  
- Given: Redis 连接断开触发降级
- When: 实例发布消息时
- Then: 自动、高速地以多线程无锁队列，串行化写入本地 `.eket/data/queue/*.msg` 日志，单条日志文件写入时延控制在 0.5ms 内

**AC-3**: 原生异步重放（StateReconciler 的 Rust 原生迁移）  
- Given: 系统检测到 Redis 升级连接成功
- When: 触发对齐任务时
- Then: Rust 原生 `StateReconciler` 扫描并重放 WAL 日志，快速清理完成并自动删除消息文件

---

## Implementation Sketch

在 `rust/crates/eket-engine/src/event_bus.rs` 或新建 `reconciler.rs` 实现：

```rust
pub struct RustEventBus {
    tx: tokio::sync::mpsc::Sender<EketMessage>,
    redis: Option<RedisClient>,
    fallback_dir: PathBuf,
}

impl RustEventBus {
    pub async fn publish(&self, msg: EketMessage) -> Result<(), EketError> {
        if let Some(ref r) = self.redis {
            if let Ok(_) = r.publish("eket:bus", &serde_json::to_string(&msg)?).await {
                return Ok(());
            }
        }
        // 降级：Rust 高效写入文件队列
        let file_path = self.fallback_dir.join(format!("{}_{}.msg", msg.command, Utc::now().timestamp_millis()));
        tokio::fs::write(&file_path, serde_json::to_string_pretty(&msg)?).await?;
        Ok(())
    }
}
```

---

## Test Strategy

**Performance & Load Test**:
- 编写 Rust Benchmark 测试并发吞吐，在 Level 3 极高频压力下，连续并发写入 10,000 条消息，核验是否存在文件锁冲突与内存泄露。

---

**Blocked By**: None  
**Blocks**: TASK-Z03  
**Created**: 2026-05-24  
---
status: ready
assignee: ""
branch: ""
ac_completed: 0/3
test_coverage: 0%
