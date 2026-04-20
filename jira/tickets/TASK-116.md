# TASK-116: Ticket 完成验证 + RAG 引用（DeepTutor 借鉴）

## 元数据
- **状态**: done
- **类型**: feature
- **优先级**: P1
- **负责人**: Slaver
- **创建时间**: 2026-04-20
- **依赖**: TASK-095、TASK-110b
- **PR**: https://github.com/godlockin/eket/pull/130

## 验收标准

- [x] 新增 `node/src/core/completion-validator.ts`，导出 `CompletionValidator` class
- [x] `validateCompletion(ticketId, changedFiles)` 返回 `ValidationReport`
- [x] `ValidationReport` 包含 `passed: boolean`、`checks: ValidationCheck[]`（含 `source`）
- [x] 检查维度：架构（confluence/memory/）、代码风格（skill 定义）、验收标准全覆盖
- [x] `complete.ts` 在 PR 创建前调用 validator，失败时写 inbox（warn，不硬阻断）
- [x] ≥5 单元测试（实际 8 个，全通过）
- [x] `npm test` 无新增失败
