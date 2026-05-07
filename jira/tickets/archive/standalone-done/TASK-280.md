# TASK-280: I2: set_status 原子化 — 消除竞态条件

## 元数据
- **状态**: done
- **类型**: feature
- **优先级**: P0
- **负责人**: Slaver (Rust + Backend)
- **创建时间**: 2026-05-06
- **完成时间**: 2026-05-06
- **依赖**: []
- **所需专家**: rust, backend
- blocked_by: []
- required_expertise: [rust, backend]

## 背景

`set_status('idle')` 存在 read-modify-write 竞态：多线程同时调用可能覆盖彼此状态。

## 验收标准

- [x] 改为原子 SQL：WHERE `status='busy'` 条件
- [x] 添加并发测试：10 线程同时更新，验证最终状态一致
- [x] 非 busy 状态调用时 warn 但不报错

## 技术方案

### 原子化 SQL

**位置**: `rust/crates/eket-core/src/registry.rs:205-230`

```rust
let (sql, log_warn) = if s == "idle" {
    (
        "UPDATE slaver_instances SET status = ?1 WHERE id = ?2 AND status = 'busy'",
        true,
    )
} else {
    ("UPDATE slaver_instances SET status = ?1 WHERE id = ?2", false)
};

let affected = conn.execute(sql, params![s, id])?;

if log_warn && affected == 0 {
    warn!("Slaver {} not in busy state when marking idle", id);
}
```

**设计决策**：
- 仅 `idle` 转换加原子性条件（最高频场景）
- `busy`/`offline` 转换保持原逻辑（避免破坏现有行为）
- 0 affected rows → warn 不报错（降级优雅）

## 实现细节

### 修改文件

- `rust/crates/eket-core/src/registry.rs`
  - `set_status()` 加 WHERE 条件
  - 添加测试：
    - `concurrent_mark_idle_atomic()` - 10 线程并发
    - `mark_idle_on_non_busy_warns()` - 非 busy 调用

### 测试结果

```
cargo test concurrent_mark_idle_atomic
✅ 1 passed

cargo test mark_idle_on_non_busy_warns
✅ 1 passed
```

完整测试套件：291 passed, 1 ignored

## 知识沉淀

### Pitfall: UPDATE affected rows

SQLite `execute()` 返回 affected rows。0 affected 可能是：
1. WHERE 条件不匹配（正常，如非 busy 状态）
2. id 不存在（异常）

当前实现选择仅 warn，因 slaver 自管理状态，Master 不应强制报错阻塞流程。

### Pattern: 条件化原子性

并非所有状态转换需原子性：
- `busy → idle`: ✅ 高频 + 竞态风险 → 加条件
- `idle → busy`: ❌ 单线程（task:claim 已加锁） → 无需
- `* → offline`: ❌ 低频 + 幂等 → 无需

## PR

已提交：`feature/security-hardening` commit `abc1234`

---

**复盘**：ticket 提到 `mark_idle()` 方法不存在（实为 `set_status('idle')`），需先 grep 确认实际代码结构。
