# TASK-216: ContextBudget裁剪结果未写回 inst.context — feature完全无效

**优先级**: P1
**类型**: Bugfix
**模块**: rust/crates/eket-engine/src/workflow.rs
**来源**: 红队审查 Linus#3
**工作量**: 0.5天

## 问题
workflow.rs L388-397：context budget 应用在 executor 的局部 clone 上，
executor 返回后 `inst.context` 未更新为裁剪后的版本。
ContextBudget 功能对持久化上下文完全无效。

## 修复
executor 执行完后，将裁剪后的 context 写回 inst：
```rust
// 裁剪后写回
inst.context.data = trimmed_ctx.data;
```
或在归档前对 inst.context.data 直接 apply budget。

## 验收标准
- [x] budget 裁剪结果正确反映在 inst.context.data
- [x] 新增测试：带 budget 的 workflow 步骤完成后，inst.context.data 大小符合预期 (`task216_budget_written_back_to_inst_context`)
- [x] 全部测试通过 (109 passed)

## 实现记录
- `workflow.rs`：budget 应用前先 clone 为 `trimmed_data: Option<HashMap<...>>`
- executor 执行后，在 `Some(next)` 和 `None`（终止步骤）两个分支均写回 `inst.context.data = trimmed`
- 新增测试 `task216_budget_written_back_to_inst_context`：5 条 history + keep_recent_n=1，完成后 `inst.context.data["history"].len() <= 1`
