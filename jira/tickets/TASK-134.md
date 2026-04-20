# TASK-134: [Rust] heartbeat-monitor + stale-task-cleaner 守护进程

## 元数据
- **状态**: todo
- **类型**: feature
- **优先级**: P1
- **负责人**: 待认领
- **创建时间**: 2026-04-21
- **依赖**: []
- **blocked_by**: [TASK-123, TASK-130]

## 背景

TS `heartbeat-monitor.ts`(5.6KB) + `stale-task-cleaner.ts`(5.9KB) 是两个独立守护进程：
- heartbeat-monitor：监控 Slaver 心跳，超时标 offline，通知 Master 重新分配
- stale-task-cleaner：扫描 `in_progress` 超过 TTL 的 ticket，重置为 todo，释放给其他 Slaver

## 验收标准

- [ ] `rust/crates/eket-engine/src/monitors.rs` 实现两个守护器
- [ ] `HeartbeatMonitor::start(registry, event_bus, check_interval=30s, ttl=90s)` → tokio background task
- [ ] 每 check_interval：扫描 InstanceRegistry，last_seen > ttl → mark_offline + 发布 `agent.offline` 事件
- [ ] `StaleCleaner::start(tickets_dir, check_interval=60s, stale_ttl=30min)` → tokio background task
- [ ] 每 check_interval：扫描 `in_progress` ticket，更新时间 > stale_ttl → 重置为 todo，发布 `task.stale` 事件
- [ ] 两者均通过 `AbortHandle` 支持优雅停止
- [ ] 单元测试 ≥ 4 条：心跳超时触发 offline、stale ticket 重置、优雅停止、并发安全

## 技术要点

- stale 判断：读 ticket .md 文件中 `**更新时间**:` 或文件 mtime
- `task.stale` 事件通过 event_bus 广播，master_poll 监听后重新分配
- 守护进程均用 `tokio::time::interval` + select! + abort_handle
