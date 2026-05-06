# TASK-199: TaskCheckpoint — 断点续传+tool幂等（RunState借鉴）

**状态**: done

**优先级**: P0
**类型**: Feature
**模块**: node/src/core/task-checkpoint.ts + SQLite schema
**来源**: openai-agents-python借鉴研究（RunState三层结构）
**工作量**: 4天

## 背景

Slaver中途中断（重启/网络断）后只能从头执行，无断点恢复。
openai-agents的RunState分离agentFacingItems/fullHistoryItems/executedToolCalls，支持resume时幂等skip。

## 需求

实现 `TaskCheckpoint`，每turn后持久化到SQLite，Slaver重启后从断点续跑。

## 验收标准

- [x] SQLite新表：
  ```sql
  CREATE TABLE task_checkpoints (
    task_id TEXT PRIMARY KEY,
    data TEXT NOT NULL,       -- JSON序列化TaskCheckpoint
    version INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL
  );
  ```
  → `node/src/core/sqlite-client.ts` migration added
- [x] `TaskCheckpoint` 接口三层结构：
  - `agentFacingItems`：模型视图（不含系统事件）
  - `fullHistoryItems`：完整历史含工具调用/guardrail结果
  - `executedToolCalls`：已执行的tool_call_id列表（幂等去重key）
  → `node/src/types/index.ts`
- [x] `saveCheckpoint()` 用CAS版本控制（version字段），防多Slaver并发覆盖
  → `TaskCheckpointStore` + `CheckpointCASError`
- [x] `isToolCallAlreadyExecuted()` resume时幂等skip
  → `recordToolCallExecuted()` + `isToolCallAlreadyExecuted()`
- [x] `eket task:resume-checkpoint TASK-NNN` 命令接入checkpoint恢复
  → `node/src/commands/task-resume.ts` `registerTaskResumeCheckpoint()`
- [~] Rust侧 `eket-core/src/db/` 添加对应SQL操作（Rust crate不存在，Node.js实现代替）
- [x] 单元测试14个全PASS：save/load roundtrip, CAS conflict, idempotent tool skip
  → `node/tests/core/task-checkpoint.test.ts`

## 实现摘要 (DONE ✅)

- `node/src/core/task-checkpoint.ts` — `TaskCheckpointStore`, `CheckpointCASError`, `createEmptyCheckpoint`
- `node/src/types/index.ts` — `TaskCheckpoint`, `CheckpointItem`, `TaskCheckpointRow`
- `node/src/core/sqlite-client.ts` — `task_checkpoints` table migration
- `node/src/commands/task-resume.ts` — `task:resume-checkpoint <taskId>` command
- `node/tests/core/task-checkpoint.test.ts` — 14 tests PASS
