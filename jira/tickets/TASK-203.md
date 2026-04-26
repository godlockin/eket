# TASK-203: ParallelGuardrail — 并行验收门禁

**优先级**: P2
**类型**: Feature
**模块**: node/src/core/guardrail.ts
**来源**: openai-agents-python借鉴研究（3层Guardrail + tripwire）
**工作量**: 1.5天

## 背景

Master review目前串行阻塞（等Slaver提PR→人工review→合并）。
openai-agents的Guardrail并行执行+tripwire fail-fast可将验收流程自动化并行化。

## 需求

实现 `ParallelGuardrail`，Slaver提交结果时自动并行执行验收检查。

## 验收标准

- [x] `GuardrailFn` 类型：`(input) => Promise<GuardrailResult> | GuardrailResult`
- [x] `runGuardrails(guardrails, input)` 用 `Promise.allSettled`（修复openai原版副作用问题，所有guardrail完成记录后再raise）
- [x] 内置guardrail实现：
  - `ciPassGuardrail`：检查CI状态（green/红）
  - `coverageGuardrail`：coverage >= 阈值
  - `knowledgeNotesGuardrail`：knowledgeNotes字段非空
  - `prFormatGuardrail`：PR标题/描述格式检查
- [x] `GuardrailTripwireError` 包含所有触发guardrail的详情
- [x] 集成到 `gate:review` 命令
- [x] 测试：并行执行验证（所有guardrail都跑完）；tripwire聚合多个失败
