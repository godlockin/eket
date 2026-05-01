# TASK-157: 5 个 P1 Bug 修复

## 元数据
- **类型**: bugfix
- **优先级**: P1
- **状态**: ready
- **创建**: 2026-04-21
- **依赖**: 无

## Bug 清单

### Bug-1: workflow_engine data flow（Rust）
`WorkflowEngine::execute_step()` 中 step 的 output 未传递给下一个 step 的 input。
每个 step 独立执行，上下文不联通。
**修复**：`StepContext` 携带前序输出 map，注入下一 step。

### Bug-2: workflow_engine missing branch（Rust）
`WorkflowType::Parallel` variant 未实现，match 有 `_ => unimplemented!()` 分支。
**修复**：实现 TASK-145（fan-out/join）。

### Bug-3: skill 名称大小写不敏感（Node + Rust）
`skill:execute rust_backend` 与 `skill:execute Rust_Backend` 结果不同，取决于文件系统大小写。
**修复**：skill 名称统一小写规范化，查找时 `.to_lowercase()`。

### Bug-4: heartbeat 序列化（Rust）
`HeartbeatRecord` 序列化时 `last_seen` 字段用 `u64` timestamp，Node 期望 ISO 8601 字符串。跨语言读取时反序列化失败。
**修复**：改用 `chrono::DateTime<Utc>` + serde `with = "chrono::serde::ts_seconds"`，输出 ISO 8601。

### Bug-5: mailbox 跨进程读取竞争（Rust）
多个 Slaver 同时 poll mailbox 目录时，可能重复读取同一消息文件。
**修复**：读取后立即 rename 到 `.processing` 后缀，处理完再删除（类似 at-most-once 语义）。

## 负责人
待认领（推荐：Rust 工程师）
