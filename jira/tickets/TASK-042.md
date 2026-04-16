# TASK-042: 结构化消息 Schema + Zod Validation

**Ticket ID**: TASK-042
**Epic**: SELF-EVOLVE
**标题**: 引入 Zod schema 驱动的 Slaver→Master 消息格式，替代松散 Markdown 约定
**类型**: feature
**优先级**: P1
**重要性**: high

**状态**: backlog
**创建时间**: 2026-04-16
**创建者**: Master
**负责人**: 待领取

**依赖关系**:
- blocks: [TASK-043]
- blocked_by: []

**标签**: `schema`, `validation`, `message-queue`, `zod`

---

## 1. 需求概述

### 1.1 背景与动机

**借鉴来源**：Hermes 3 (NousResearch) 的 `<tool_call>` 结构化工具调用规范。

Hermes 的核心洞见：给 LLM 提供严格的 XML/JSON schema，模型输出的结构化程度和可靠性显著提升。EKET 目前 Slaver→Master 消息走 `shared/message_queue/inbox/` 目录，格式是自由 Markdown，Master 靠约定（`type: analysis_review_request`）解析，容易因字段缺失/格式偏差导致误判或丢消息。

### 1.2 功能描述

用 **Zod schema** 定义所有跨 Agent 消息类型，在发送侧和接收侧双向 validate，类型错误在消息创建时即暴露，而非等 Master 读文件时才发现。

### 1.3 验收标准

- [ ] `node/src/types/messages.ts` 定义所有消息类型的 Zod schema（6 种）
- [ ] `node/src/core/message-bus.ts` 新增 `sendMessage(msg)` 强制 validate，失败抛 `INVALID_MESSAGE` 错误
- [ ] `node/src/core/message-bus.ts` 新增 `readMessage(path)` 返回 `Result<TypedMessage>`
- [ ] 现有 `analysis_review_request` / `pr_review_request` 消息迁移到新 schema
- [ ] 新增 6 个测试覆盖 schema validate + 读写往返
- [ ] 验收命令：
  ```bash
  cd node && npm test -- --testPathPattern=message-bus 2>&1 | tail -5
  cd node && npm test 2>&1 | tail -3
  ```

---

## 2. 技术设计

### 2.1 影响文件

| 文件 | 变更类型 | 说明 |
|------|----------|------|
| `node/src/types/messages.ts` | 新建 | Zod schema 定义 |
| `node/src/core/message-bus.ts` | 新建 | 类型安全的消息读写 |
| `node/src/types/index.ts` | 修改 | 导出新类型 + `INVALID_MESSAGE` 错误码 |
| `node/tests/core/message-bus.test.ts` | 新建 | 6 个测试 |

### 2.2 消息类型定义（6 种）

```typescript
// node/src/types/messages.ts
import { z } from 'zod';

export const MessageTypeEnum = z.enum([
  'analysis_review_request',
  'pr_review_request',
  'handoff_ready',
  'blocker_report',
  'human_feedback',
  'task_completed',
]);

const BaseMessage = z.object({
  type: MessageTypeEnum,
  from: z.string(),           // Slaver ID 或 "master"
  to: z.string(),             // 收件方
  ticketId: z.string(),
  timestamp: z.string().datetime(),
  payload: z.record(z.unknown()),
});

export const AnalysisReviewRequest = BaseMessage.extend({
  type: z.literal('analysis_review_request'),
  payload: z.object({
    reportPath: z.string(),
    estimatedHours: z.number().positive(),
    riskLevel: z.enum(['low', 'medium', 'high']),
  }),
});

export const PrReviewRequest = BaseMessage.extend({
  type: z.literal('pr_review_request'),
  payload: z.object({
    branch: z.string(),
    prDescPath: z.string(),
    testsPassed: z.number().nonnegative(),
  }),
});

// ... 其余 4 种类似

export type TypedMessage = z.infer<typeof BaseMessage>;
```

### 2.3 消息总线

```typescript
// node/src/core/message-bus.ts
import { writeFile, readFile } from 'fs/promises';
import { join } from 'path';

export async function sendMessage(
  repoRoot: string,
  msg: TypedMessage,
): Promise<Result<void>> {
  const parsed = BaseMessage.safeParse(msg);
  if (!parsed.success) {
    return { success: false, error: new EketError(EketErrorCode.INVALID_MESSAGE, parsed.error.message) };
  }
  const filename = `${msg.type}-${msg.ticketId}-${Date.now()}.json`;
  const path = join(repoRoot, 'shared/message_queue/inbox', filename);
  await writeFile(path, JSON.stringify(parsed.data, null, 2), 'utf-8');
  return { success: true, data: undefined };
}

export async function readMessage(filePath: string): Promise<Result<TypedMessage>> {
  try {
    const raw = await readFile(filePath, 'utf-8');
    const parsed = BaseMessage.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      return { success: false, error: new EketError(EketErrorCode.INVALID_MESSAGE, parsed.error.message) };
    }
    return { success: true, data: parsed.data };
  } catch (e: unknown) {
    const err = e as { message?: string };
    return { success: false, error: new EketError(EketErrorCode.FILE_READ_ERROR, err.message ?? 'read error') };
  }
}
```

### 2.4 设计决策

1. **JSON 而非 Markdown**：新格式用 `.json` 文件；旧 Markdown 消息保持兼容，逐步迁移
2. **Zod 而非手写 interface**：Zod schema 是 runtime + compiletime 双重检查，符合"Fail Fast"原则
3. **不强制迁移现有消息**：老文件读取失败时 fallback 到旧解析逻辑，向后兼容

### 2.5 新增错误码

```typescript
// node/src/types/index.ts 追加
INVALID_MESSAGE = 'INVALID_MESSAGE',
FILE_READ_ERROR = 'FILE_READ_ERROR',
```

---

## 4. 执行记录

### 4.1 领取信息
- **领取者**: 待填写
- **领取时间**: 待填写
- **预计工时**: 2h

### 4.2 状态流转

| 时间 | 状态变更 | 操作者 | 备注 |
|------|----------|--------|------|
| 2026-04-16 | backlog → ready | Master | 初始创建，借鉴 Hermes tool_call schema 规范 |
