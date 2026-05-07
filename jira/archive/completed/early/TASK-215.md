# TASK-215: Archive-before-insert — 步骤快照缺少自身输出

**状态**: done

**优先级**: P1
**类型**: Bugfix
**模块**: rust/crates/eket-engine/src/workflow.rs
**来源**: 红队审查 Linus#1 / Jeff P1
**工作量**: 0.5天

## 问题
workflow.rs 步骤切换时，`archive_and_compress_context()` 在
`inst.context.data.insert("{step_id}.output", result.output)` **之前**调用。
每个步骤的快照都不包含该步骤自身的输出，数据丢失。

## 修复
先插入输出，再归档：
```rust
// 1. 先插入输出
inst.context.data.insert(format!("{current_step_id}.output"), result.output.clone());
// 2. 再归档（此时快照包含完整输出）
archive_and_compress_context(store, &workflow_id, &completed_step, &mut inst.context.data);
```

## 验收标准
- [x] 调换操作顺序
- [x] 新增测试：step 完成后 search_step_history 能检索到该 step 的 output 字段 (`task215_snapshot_includes_step_output`)
- [x] 全部测试通过 (109 passed)

## 实现记录
- `workflow.rs` `Some(next)` 分支：先 `inst.context.data.insert("{step}.output", ...)` 再调用 `archive_and_compress_context`
- 新增测试 `task215_snapshot_includes_step_output`：s1 输出 `{"answer":42}`，验证快照 `full_data_json` 包含该字段
