# TASK-214: std::sync::Mutex→tokio::sync::Mutex — StepSnapshotStore阻塞tokio线程

**优先级**: P0
**类型**: Bugfix
**模块**: rust/crates/eket-engine/src/workflow.rs, step_snapshot.rs
**来源**: 红队审查 Linus#2 / Jeff P0
**工作量**: 0.5天

## 问题
`WorkflowEngine.snapshot_store: Arc<std::sync::Mutex<StepSnapshotStore>>`
在 `tokio::spawn` async task 内调用 `lock()`，阻塞 OS 线程，starve tokio runtime。
100 并发 workflow 时全部 worker threads 卡在此锁上。

## 修复
- 将 `std::sync::Mutex` 改为 `tokio::sync::Mutex`
- 调用点改为 `.lock().await`
- 或用 `tokio::task::spawn_blocking` 包裹 SQLite 操作

## 验收标准
- [x] `snapshot_store` 类型改为 `Arc<tokio::sync::Mutex<StepSnapshotStore>>`
- [x] 所有 lock 调用改为 `.await`
- [x] cargo build 通过，全部测试通过

## 完成记录
2026-04-26 — workflow.rs: field + `new()` + `make_runner()` sig + lock site 全改 tokio::sync::Mutex + .await。105 tests pass。
