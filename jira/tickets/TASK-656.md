# TASK-656: SQLite Sync Pragma 崩溃安全 (Jeff Dean P0)

**EPIC**: EPIC-017  
**状态**: done  
**优先级**: P0  
**预估**: 0.5d  
**依赖**: 无  
**层级**: L1 Rust  
**来源**: Jeff Dean Review

---

## 问题描述

`checkpoint.rs` 没有显式设置 `PRAGMA synchronous = FULL`，崩溃时可能丢失状态。

当前实现是 **at-least-once** 而非 **exactly-once**：
- 如果进程在 `before_dispatch()` 后崩溃，恢复后节点会重新执行
- 对非幂等操作（支付、API 调用）有风险

## 验收标准

- [x] 添加 `PRAGMA synchronous = FULL` 或 `EXTRA`
- [x] 文档化幂等性要求：DAG 节点必须幂等或自行实现去重
- [x] 添加 `(run_id, node_id, attempt)` 作为幂等键
- [x] 测试：模拟崩溃恢复验证数据完整性

## 实现方案

```rust
// checkpoint.rs
impl DagCheckpoint {
    pub fn new(pool: Pool<SqliteConnectionManager>) -> Result<Self, rusqlite::Error> {
        let conn = pool.get().map_err(pool_to_sqlite_error)?;
        conn.pragma_update(None, "synchronous", "FULL")?;
        conn.pragma_update(None, "journal_mode", "WAL")?;
        // ...
    }
}
```

---

## 变更日志

| 日期 | 变更 | 操作人 |
|------|------|--------|
| 2026-06-02 | 创建 ticket (Jeff Dean Review P0) | Master |
| 2026-06-02 | 实现完成: 添加 PRAGMA synchronous=FULL, WAL mode, 文档化幂等性要求, 测试 | Slaver |

## 实现细节

### 1. 崩溃安全 Pragma (checkpoint.rs)
- `PRAGMA synchronous = FULL`: 确保所有写入同步到磁盘
- `PRAGMA journal_mode = WAL`: 启用 Write-Ahead Logging
- `PRAGMA busy_timeout = 5000`: 锁等待超时

### 2. 幂等性文档 (模块级文档)
- 明确标注 at-least-once 语义
- 提供 `(run_id, node_id, attempt)` 幂等键使用示例
- 警告非幂等操作的风险

### 3. Schema 更新 (schema.sql)
- 添加 `dag_runs` 表定义
- 添加 `dag_node_states` 表定义
- `attempt` 字段作为幂等键组成部分

### 4. 测试
- `test_crash_safety_pragmas_applied`: 验证 pragma 设置
- `test_idempotency_key_available`: 验证幂等键可用
- `test_crash_recovery_preserves_attempt_count`: 验证崩溃恢复保留尝试计数
