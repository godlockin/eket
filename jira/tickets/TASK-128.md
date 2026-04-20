# TASK-128: [Rust] communication-protocol — Master↔Slaver 通信协议

## 元数据
- **状态**: todo
- **类型**: feature
- **优先级**: P0
- **负责人**: 待认领
- **创建时间**: 2026-04-21
- **依赖**: []
- **blocked_by**: [TASK-123]

## 背景

TS `communication-protocol.ts`(14.5KB) 定义 Master↔Slaver 的消息协议和传输层。
是 master-heartbeat / slaver-poll 命令的底层通信基础，没有它这两个命令无法实现。

## 验收标准

- [ ] `rust/crates/eket-engine/src/protocol.rs` 实现消息协议类型和发送器
- [ ] 消息类型枚举：`ProtocolMessage { TaskAssign, TaskResult, StatusUpdate, Heartbeat, Shutdown, Ack, Error }`
- [ ] `TaskAssignPayload { ticket_id, title, priority, instructions, deadline_secs }`
- [ ] `TaskResultPayload { ticket_id, success, output, pr_url, error }`
- [ ] `StatusUpdatePayload { instance_id, status, current_task, load }`
- [ ] `HeartbeatPayload { instance_id, role, timestamp, load }`
- [ ] `ProtocolSender` — 通过 AgentMailbox 发送（mailbox.rs 已实现）
- [ ] `send_task_assign(from, to, payload)` → 包装为 MailboxMessage 发出
- [ ] `send_task_result(from, to, payload)` → 同上
- [ ] `send_heartbeat(from, payload)` → 广播到 master
- [ ] `parse_message(mailbox_msg)` → `ProtocolMessage` — 反序列化
- [ ] 单元测试 ≥ 5 条：各消息类型序列化/反序列化往返、parse 未知类型返回 Error

## 技术要点

- 基于已有 `mailbox.rs` 的 `MailboxMessage` 传输
- `payload` 字段用 `serde_json::Value` 存储，parse 时按 message_type 分支反序列化
- `ProtocolMessage` 实现 `serde::{Serialize, Deserialize}`
