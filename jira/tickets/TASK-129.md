# TASK-129: [Rust] CLI slaver-register + slaver-poll

## 元数据
- **状态**: todo
- **类型**: feature
- **优先级**: P0
- **负责人**: 待认领
- **创建时间**: 2026-04-21
- **依赖**: []
- **blocked_by**: [TASK-123, TASK-128]

## 背景

TS `slaver-register.ts`(18.8KB) + `slaver-poll.ts`(21.9KB) 是 Slaver 的两个核心命令：
- register：注册实例、声明角色/技能、初始化心跳
- poll：轮询 inbox（mailbox），处理 TaskAssign 消息，触发 claim→execute→complete 流程

## 验收标准

- [ ] `rust/crates/eket-cli/src/commands/slaver_register.rs`
- [ ] `eket slaver:register --role <role> --skills <s1,s2> [--id <id>]`
- [ ] 注册到 InstanceRegistry，写入 SQLite + Redis（降级安全）
- [ ] 输出 JSON：`{ "status": "registered", "instance_id", "role", "skills", "timestamp" }`
- [ ] `rust/crates/eket-cli/src/commands/slaver_poll.rs`
- [ ] `eket slaver:poll --id <instance_id> [--interval 5]` — 每 N 秒轮询一次 inbox
- [ ] 读取 mailbox unread → 按 message_type 分发：TaskAssign → 触发 task_claim 流程
- [ ] 发送 Heartbeat 给 Master（每 30s）
- [ ] 接收 Shutdown 消息时优雅退出
- [ ] 单元测试 ≥ 5 条（mock mailbox）

## 技术要点

- slaver_poll 是长驻进程：`tokio::time::interval` 轮询
- TaskAssign 收到后：调 `claim_ticket_atomic()` 确认，然后输出 JSON 供 shell 层处理
- Ctrl+C 信号处理：`tokio::signal::ctrl_c()`
- 心跳发送：`InstanceRegistry::heartbeat(id)` + `ProtocolSender::send_heartbeat()`
