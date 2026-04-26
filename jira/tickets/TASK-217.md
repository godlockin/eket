# TASK-217: JoinPolicy::Any/Quorum — 剩余任务未 abort，永久泄漏

**优先级**: P1
**类型**: Bugfix
**模块**: rust/crates/eket-engine/src/workflow.rs
**来源**: 红队审查 Linus#4 / Jeff P1
**工作量**: 0.5天

## 问题
`JoinPolicy::Any`：`select_all` 返回后，`rest` (剩余 futures/JoinHandles) 被 drop，
但 tokio 任务不会因 drop 而取消，继续运行到超时或完成，泄漏资源。
`JoinPolicy::Quorum` 同样问题。

## 修复
保存 `AbortHandle`，条件满足后逐一 abort：
```rust
let handles: Vec<AbortHandle> = futures.iter().map(|h| h.abort_handle()).collect();
// ...条件满足后
for h in handles { h.abort(); }
```

## 验收标准
- [x] Any 策略：第一个成功后，其余任务被 abort
- [x] Quorum 策略：达到 quorum 后，其余任务被 abort
- [x] 新增测试：验证 abort 后任务不再运行（通过 AtomicBool 检测）
- [x] 全部测试通过（108 passed，1 pre-existing failure in task216 unrelated）

## 实现
`workflow.rs` ~650-730:
- `JoinPolicy::Any`: 在 `remaining.into_iter()` 消耗 JoinHandle 前，先从 `remaining.iter()` 收集 `AbortHandle`；`select_all` 返回后逐一 `abort()`
- `JoinPolicy::Quorum`: 同上，在 `handles.into_iter()` 前收集 handles；`completed >= need` 或 FailFast 时逐一 `abort()`
- 新增测试 `parallel_any_aborts_remaining_tasks` + `parallel_quorum_aborts_remaining_tasks`，AtomicBool 验证剩余任务不执行
