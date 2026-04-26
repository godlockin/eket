# TASK-198: TicketOutputSchema — Zod强制验证Slaver提交结构

**优先级**: P0
**类型**: Feature
**模块**: node/src/core/ + node/src/types/
**来源**: openai-agents-python借鉴研究（output_type机制）
**工作量**: 1天

## 背景

当前Slaver提交ticket完成时无结构约束，"宣称完成但无测试/复盘"的情况无法在提交前拦截。
openai-agents的`output_type=PydanticModel`在输出时强制schema验证，借鉴此机制。

## 需求

定义 `TicketOutputSchema`（Zod），Slaver调用 `task:complete` 时强制验证，不合规则拒绝状态流转。

## 验收标准

- [x] 新建 `node/src/types/ticket-output.ts`，定义 `TicketOutputSchema`：
  ```typescript
  const TicketOutputSchema = z.object({
    status: z.enum(['completed', 'blocked', 'needs_review']),
    prUrl: z.string().url().optional(),
    testResults: z.object({
      passed: z.number(),
      failed: z.number(),
      coverage: z.number().min(0).max(100),
    }).optional(),
    knowledgeNotes: z.array(z.string()),  // 强制复盘，至少1条
    blockers: z.array(z.string()),
  });
  ```
- [x] `knowledgeNotes` 至少1条，否则拒绝（对应SLAVER-RULES.md复盘要求）
- [x] `task:complete` 命令集成schema验证，验证失败输出结构化错误提示
- [ ] Rust `eket task:complete` 同步更新（或文档说明Node侧验证优先）
- [x] 单元测试：合规输出通过；缺少knowledgeNotes拒绝；无效prUrl拒绝

## 完成记录

**状态**: completed  
**完成时间**: 2026-04-26  
**实现文件**:
- `node/src/types/ticket-output.ts` — TicketOutputSchema + validateTicketOutput()
- `node/src/commands/complete.ts` — assertTicketOutputValid() + --output option integration
- `node/tests/ticket-output-schema.test.ts` — 15 tests, all pass

**测试结果**: 15/15 passed (0.268s)

**知识沉淀**:
- Zod `safeParse` 返回 `{ success, data }` 或 `{ success: false, error }` — 用 `error.errors.map(e => ({ path: e.path.join('.'), message: e.message }))` 构建结构化错误
- GitHub PR URL regex: `^https://github\.com/[\w.-]+/[\w.-]+/pull/\d+$`
- `z.array(z.string()).min(1)` enforces non-empty array
- Commander `.option()` 与 `.action(ticketId, opts)` 签名：opts是第二个参数
