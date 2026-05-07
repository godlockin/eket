# TASK-207: WorkflowEngine集成 — 步骤切换时自动裁剪

**状态**: done

**优先级**: P2
**类型**: Feature
**模块**: rust/crates/eket-engine/src/workflow.rs
**父卡**: TASK-204
**工作量**: 0.5天
**依赖**: TASK-205, TASK-206

## 需求

在WorkflowEngine步骤切换时，自动对传递给下一步的 `StepContext.data` 应用 `ContextBudget`。

## 验收标准

- [x] 找到步骤切换点（`advance_step` 或等效逻辑），在传递 `StepContext` 前调用 `apply_budget`
- [x] 只有下一步的 `WorkflowStep.context_budget` 为 `Some` 时才裁剪
- [x] 裁剪后用 `tracing::debug!` 记录：`"context budget applied: {} tokens → {} tokens (step={})"` 
- [x] 现有所有workflow测试继续通过（budget=None时行为不变）
- [x] 新增集成测试：带budget的workflow，验证长历史被截断
