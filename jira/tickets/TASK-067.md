# TASK-067: task_message 结构化存储 — 替换文件日志为 SQLite 流水表

**Ticket ID**: TASK-067
**Epic**: SELF-EVOLVE
**标题**: 新增 task_message 表，按 seq 存储 Slaver 执行过程中的 tool call 流水
**类型**: feature
**优先级**: P1
**重要性**: medium

**状态**: ready
**创建时间**: 2026-04-19
**创建者**: Master
**负责人**: 待认领

**依赖关系**:
- blocks: []
- blocked_by: [TASK-065]

---

## 背景 & 动机

Multica 的 `task_message` 表：

```sql
CREATE TABLE task_message (
  id UUID PRIMARY KEY,
  task_id UUID REFERENCES agent_task_queue(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL,
  type TEXT NOT NULL,  -- 'text'|'tool_use'|'tool_result'|'error'
  tool TEXT,
  content TEXT,
  input JSONB,
  output TEXT,
  created_at TIMESTAMPTZ
);
CREATE INDEX idx_task_message_task_id_seq ON task_message(task_id, seq);
```

EKET 目前 Slaver 执行日志全写文件，无法支持：断连重连后重放、Dashboard 实时展示、断点恢复的精确续点。

---

## 需求

### 验收标准

- **AC-1**: `node/src/core/sqlite-client.ts` 新增 `task_messages` 表（schema 见下方）
- **AC-2**: 新增 `appendTaskMessage(taskId, msg)` 和 `getTaskMessages(taskId)` 方法
- **AC-3**: seq 自动递增，同 taskId 内唯一有序
- **AC-4**: 新增单元测试：写入 5 条 message，按 seq 读取顺序正确
- **AC-5**: 旧文件日志路径保留（不删除），新表并行写入（渐进迁移）

### Schema（SQLite 版）

```sql
CREATE TABLE IF NOT EXISTS task_messages (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id   TEXT    NOT NULL,
  seq       INTEGER NOT NULL,
  type      TEXT    NOT NULL CHECK(type IN ('text','tool_use','tool_result','thinking','error')),
  tool      TEXT,
  content   TEXT,
  input_json TEXT,
  output    TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(task_id, seq)
);
CREATE INDEX IF NOT EXISTS idx_task_messages_task_id ON task_messages(task_id, seq);
```

---

## 测试命令

```bash
cd node && npm test -- --testPathPattern=sqlite-client
```

## 回滚

仅新增表和方法，不修改现有代码路径，安全回滚。

---

## 执行日志

**领取时间**: 2026-04-18
**负责人**: backend_dev (Slaver)
**状态**: completed

### 实现细节

1. `node/src/types/index.ts` — 新增 `TaskMessage` interface（字段：id, task_id, seq, type, tool, content, input_json, output, created_at）
2. `node/src/core/sqlite-client.ts`：
   - `initializeTables()` 追加建表 SQL + 索引 `idx_task_messages_task_id`
   - 新增 `appendTaskMessage(taskId, msg)` — seq 可显式传入；内部兼容 MAX(seq)+1 自增
   - 新增 `getTaskMessages(taskId): Result<TaskMessage[]>` — ORDER BY seq ASC
3. `node/tests/core/task-messages.test.ts` — 4 个测试：
   - 写入 5 条消息验证顺序
   - UNIQUE(task_id,seq) 约束触发验证
   - seq 显式赋值顺序验证
   - 空 taskId 返回空数组

### 测试结果

```
PASS tests/core/task-messages.test.ts
Tests: 4 passed, 4 total
```

### Build 结果

`npm run build` 通过（pre-existing skills.ts 错误与本 ticket 无关）
