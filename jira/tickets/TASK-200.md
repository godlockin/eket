# TASK-200: MailboxContextFilter — 三段式上下文裁剪

**状态**: done
**状态**: done
**优先级**: P1
**类型**: Feature
**模块**: node/src/core/mailbox/ + rust/crates/eket-engine/src/mailbox.rs
**来源**: openai-agents-python借鉴研究（HandoffInputFilter）
**工作量**: 2-3天

## 背景

AgentMailbox当前全量传递ticket内容，无过滤机制。跨ticket的工具调用记录污染新任务推理，LLM成本高。
openai-agents的HandoffInputData三段结构+可插拔filter函数解决此问题。

## 需求

为AgentMailbox添加 `MailboxContextFilter` 机制，ticket分配时按规则裁剪上下文。

## 验收标准

- [ ] 定义 `MailboxMessageData` 三段结构：
  - `conversationHistory`（历史对话）
  - `preHandoffItems`（本次分配前的ticket事件）
  - `triggerItems`（触发此次分配的消息）
- [ ] `MailboxContextFilter` 类型：`(data: MailboxMessageData) => MailboxMessageData | Promise<MailboxMessageData>`
- [ ] 内置filter：`createSlidingWindowFilter(windowSize: number)` — 保留最近N条历史+剔除tool执行日志
- [ ] `assignTicket()` 支持可选filter参数
- [x] Rust侧 `eket-engine/src/context_filter.rs` 三段式filter实现（`MailboxContextFilter`）
- [x] `AgentMailbox::read_messages_filtered()` 集成filter
- [x] 测试：13 tests passed — 每阶段独立验证 + 保留消息不被丢弃 + 全管道验证

## 完成状态

**已完成** 2026-04-26

### 实现细节
- `rust/crates/eket-engine/src/context_filter.rs` — 三段式filter + 13单元测试
- `rust/crates/eket-engine/src/lib.rs` — 暴露 `context_filter` 模块
- `rust/crates/eket-engine/src/mailbox.rs` — 添加 `read_messages_filtered()` 方法

### 算法
- Phase 1: 按位置age + payload中relevance_score过滤
- Phase 2: 同sender连续消息Levenshtein相似度>85%则折叠
- Phase 3: 滑动窗口保留最后K条，TaskAssigned/system/tool_result永远保留
