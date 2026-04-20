# TASK-130: [Rust] CLI master-heartbeat + master-poll

## 元数据
- **状态**: todo
- **类型**: feature
- **优先级**: P0
- **负责人**: 待认领
- **创建时间**: 2026-04-21
- **依赖**: []
- **blocked_by**: [TASK-123, TASK-124, TASK-127, TASK-128, TASK-129]

## 背景

TS `master-heartbeat.ts`(30.8KB) + `master-poll.ts`(16.3KB) 是 Master 的核心守护进程：
- master-heartbeat：持续持有选举 token，扫描 DAG 找就绪 ticket，分发给可用 Slaver
- master-poll：处理 Slaver 上报的 TaskResult，更新 ticket 状态，触发下游解锁

## 验收标准

- [ ] `rust/crates/eket-cli/src/commands/master_heartbeat.rs`
- [ ] `eket master:heartbeat [--interval 10]` — 长驻进程
- [ ] 每 interval 秒：续约选举 token（election.rs）+ 扫描 `ready_tickets(dag)` + assign 给 AgentPool 最优 Slaver
- [ ] 发送 TaskAssign 消息（ProtocolSender）到目标 Slaver 的 mailbox
- [ ] 健康检查：AgentPool::health_check()，下线超时 Slaver
- [ ] `rust/crates/eket-cli/src/commands/master_poll.rs`
- [ ] `eket master:poll [--interval 3]` — 轮询 master inbox
- [ ] 收到 TaskResult → 更新 ticket 状态（done/failed）→ 重新计算 ready_tickets → 触发新分配
- [ ] 收到 StatusUpdate → 更新 AgentPool 中对应 agent 的 load/status
- [ ] 收到 Heartbeat → InstanceRegistry::heartbeat()
- [ ] 单元测试 ≥ 6 条（mock registry + mailbox + dag）

## 技术要点

- 两个命令通常并行运行（不同进程或 tokio::spawn）
- master-heartbeat 使用 `election.rs` 的 `is_master()` 守卫，非 Master 时静默退出
- DAG 扫描调 TASK-124 的 `ready_tickets()`
- 分配调 TASK-129 的 `AgentPool::assign_task()`
