# TASK-Z01: Rust Native Master 选举与 Slaver 注册表设计

**ID**: TASK-Z01  
**Epic**: EPIC-010  
**优先级**: P0  
**预估**: 8h  
**依赖**: None  
**Agent Type**: backend  
**Category**: 🔧 Rust Engine Core / State & Leases

---

## Goal

在 Rust Core (`eket-core` / `eket-engine`) 中实现原生的三级 Master 选举（Redis SETNX / SQLite 数据库租约 / 物理文件锁降级）以及 Slaver Registry 活跃状态注册表。此迁移能够彻底摆脱 Node.js 单线程 Event Loop 潜在假死导致的脑裂与死锁风险，提供微秒级的租约原子锁刷新。

---

## Acceptance Criteria

**AC-1**: 原生原子选举锁  
- Given: 启动多个 `eket` 实例或 Master 守护心跳
- When: 实例争抢 Master 身份时
- Then: 依赖 Rust 底层事务和强类型互斥量，秒级内通过 Redis SETNX、SQLite 或文件系统排它锁选出唯一 Master，杜绝双主脑裂

**AC-2**: 租约自动原子续期  
- Given: Master 处于健康状态运行中
- When: 设定的 TTL 到期（如 5s）
- Then: 自动且原子性地更新租约 TTL，若 Rust 心跳死锁或异常崩溃，租约自动释放，其他备用 Master 在 1s 内感知并迅速抢占身份

**AC-3**: Slaver 统一注册与健康心跳  
- Given: 任意 Slaves 通过 Rust 注册自身
- When: 接收到 Slaver 心跳请求时
- Then: 原子更新 SQLite `slaver_registry` 的 `last_heartbeat` 戳记，保证状态零丢失，响应时间 < 2ms

---

## Implementation Sketch

在 `rust/crates/eket-core/src/` 中新增选举模块与注册模块：

```rust
pub struct MasterElection {
    db: SqliteClient,
    redis: Option<RedisClient>,
    instance_id: String,
}

impl MasterElection {
    pub async fn try_elect(&self) -> Result<bool, EketError> {
        // 1. 尝试在 Redis 获取锁
        if let Some(ref r) = self.redis {
            if r.set_nx("eket:master", &self.instance_id, 5).await? {
                return Ok(true);
            }
        }
        // 2. 降级：SQLite 数据库租约锁
        self.db.execute_transaction(|tx| {
            let now = Utc::now().timestamp();
            let current_lease = tx.query_row("SELECT instance_id, expires_at FROM master_lease");
            if current_lease.expires_at < now {
                tx.execute("INSERT OR REPLACE INTO master_lease (instance_id, expires_at) VALUES (?, ?)", &[&self.instance_id, &(now + 5)])?;
                Ok(true)
            } else {
                Ok(false)
            }
        })
    }
}
```

---

## Test Strategy

**Unit & Integration Tests**:
- 运行 `cargo test` 启动 mock 事务和 mock 数据库。
- 启动 3 个线程模拟抢占租约锁，保证单主选出、备用接管以及锁超时自毁。

---

**Blocked By**: None  
**Blocks**: TASK-Z03  
**Created**: 2026-05-24  
---
status: done
assignee: "backend_dev"
branch: "feature/TASK-Z01-rust-master-election"
ac_completed: 3/3
test_coverage: 100%

## Status Change Log
- 2026-05-24: `ready` -> `in_progress` (claimed by backend_dev)
- 2026-05-24: `in_progress` -> `review` (completed by backend_dev)
- 2026-05-24: `review` -> `done` (approved and merged by master)
