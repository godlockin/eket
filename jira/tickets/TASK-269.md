# TASK-269: Bug: task:complete 后 slaver_instances 状态未更新（Rust + Node.js）

## 元数据
- **类型**: bugfix
- **优先级**: P2
- **状态**: todo
- **预估**: 0.5d
- **expertise**: rust,nodejs
- **来源**: Master 代码审查（2026-05-05）

## 背景

Slaver 在 `task:claim` 时会向 `slaver_instances` 表注册/更新状态为 `busy`。但 `task:complete` 完成后，该表中的状态 **不会被更新**，导致：

- Slaver 在 DB 中永久显示为 `busy`（直到 heartbeat TTL 90s 超时）
- `discover()` 接口在此期间无法将该 Slaver 分配给新任务
- 实际上已空闲的 Slaver 无法被 Master dispatch，降低系统并发吞吐
- heartbeat_monitor 的 timeout 检测会误判"连接丢失"触发 `mark_offline()`，而非正常完成流

## 根因分析

### Rust（主要修复目标）

`rust/crates/eket-cli/src/commands/task_complete.rs` 中的 Saga 6步：
1. ValidateTicket
2. CommitWork
3. UpdateTicketStatus
4. NotifyMaster
5. RecordCompletion
6. RemoveWorktree

**均无调用 `registry.mark_offline()` 或任何 `slaver_instances` 状态更新。**

`mark_offline()` 存在于 `rust/crates/eket-core/src/registry.rs:180`，但仅被 `heartbeat_monitor` 的超时检测调用。

### Node.js（逐渐淘汰，修复以保证一致性）

`node/src/commands/complete.ts` 中 grep `updateInstance|setStatus|markIdle|markOffline|status.*idle|idle.*status|busy` 均无匹配——同样不更新 slaver 状态。

### Shell

`lib/` 降级层不走 SQLite，无 `slaver_instances` 写入，不受此影响。

## 需求

### 修复方案

Slaver 完成任务后，状态应设置为 `idle`（而非 `offline`），表示可接受新任务。

**Rust 修复**（`task_complete.rs`，步骤 6 之后）：

```rust
// Step 7: 更新 slaver 状态为 idle（如果有 slaver_id）
if let Some(slaver_id) = context.slaver_id.as_deref() {
    if let Err(e) = registry.set_status(slaver_id, "idle").await {
        warn!("Failed to update slaver status to idle: {e}");
        // 不中断 Saga，status 降级由 heartbeat 兜底
    }
}
```

需在 `registry.rs` 新增 `set_status(id, status)` 方法：

```rust
pub async fn set_status(&self, instance_id: &str, status: &str) -> EketResult<()> {
    let db = Arc::clone(&self.db);
    let id = instance_id.to_string();
    let s = status.to_string();
    tokio::task::spawn_blocking(move || {
        let conn = db.pool().get()?;
        conn.execute(
            "UPDATE slaver_instances SET status = ?1 WHERE id = ?2",
            params![s, id],
        )?;
        Ok::<_, EketError>(())
    })
    .await
    .map_err(|e| EketError::Other(e.to_string()))??;

    // Redis 同步
    if self.redis.is_available() {
        let key = format!("{}{}", REDIS_KEY_PREFIX, instance_id);
        if let Ok(Some(val)) = self.redis.get(&key).await {
            // 更新 status 字段
            if let Ok(mut obj) = serde_json::from_str::<serde_json::Value>(&val) {
                obj["status"] = serde_json::json!(status);
                let _ = self.redis.set(&key, &obj.to_string(), Some(HEARTBEAT_TTL_SECS)).await;
            }
        }
    }
    Ok(())
}
```

**Node.js 修复**（`complete.ts`，`RecordCompletion` 步骤后）：

```typescript
// 更新 slaver 状态为 idle
if (context.slaverId) {
    try {
        await db.run(
            "UPDATE slaver_instances SET status = 'idle' WHERE id = ?",
            [context.slaverId]
        );
    } catch (e) {
        logger.warn(`Failed to update slaver status to idle: ${e}`);
    }
}
```

## 验收标准

- [ ] `task:complete` 完成后，`slaver_instances.status` 从 `busy` 变为 `idle`
- [ ] `discover()` 能立即（不等待 90s TTL）返回该 Slaver
- [ ] Redis 缓存中的 status 同步更新为 `idle`
- [ ] `cargo test -p eket-core -- registry` 新增测试：`test_status_idle_after_task_complete`
- [ ] Node.js `complete.ts` 同步修复（即使逐渐淘汰，避免运行期不一致）

## 依赖

- **blocked_by**: []

## 分析记录

**领取时间**: 2026-05-06T00:06:07+08:00
**执行者**: slaver_1776695133821_534ccf79 (backend)

**分析结论**：

根因确认 — `mark_offline()` 存在于 `registry.rs:180`，但仅被 `heartbeat_monitor` 调用。`task:complete` Saga 6步均无 slaver 状态更新。

实现方案：
1. 新增 `InstanceRegistry::set_status(id, status)` 方法（SQLite + Redis 同步）
2. Rust `task_complete.rs`：Step 8 后调用 `set_status(slaver_id, "idle")`
3. Node.js `complete.ts`：`updateTicketStatus('done')` 后同步修复
4. 失败降级：warn only，heartbeat 兜底

测试：`test_set_status_updates_db` + `test_set_status_idle_after_task_complete`（11/11 pass）

影响：registry.rs (+57), task_complete.rs (+14), complete.ts (+12), tests (+28)

## Summary

| 项 | 内容 |
|---|---|
| Ticket | TASK-269: Bug: task:complete 后 slaver_instances 状态未更新（Rust + Node.js） |
| 测试结果 | ✅ 11/11 passed |
| PR | #180 https://github.com/godlockin/eket/pull/180 |
| 知识沉淀 | `confluence/memory/TASK-269-retro.md` |
