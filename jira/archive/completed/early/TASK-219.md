# TASK-219: context_budget include_fields 误删 metadata keys

**状态**: done

**优先级**: P1
**类型**: Bugfix
**模块**: rust/crates/eket-engine/src/context_budget.rs
**来源**: 红队审查 Linus#6
**工作量**: 0.25天

## 问题
`include_fields` Phase2 的 `data.retain(|k, _| fields.contains(k))` 
未豁免 METADATA_KEYS（task_id/step_id/instance_id/workflow_id），
配置白名单后这四个关键字段被删除，workflow 丢失自身标识。

## 修复
```rust
fn include_fields(data: &mut HashMap<String, Value>, fields: &[String]) {
    data.retain(|k, _| fields.contains(k) || METADATA_KEYS.contains(&k.as_str()));
}
```

## 验收标准
- [x] include_fields 不删除 METADATA_KEYS
- [x] 新增测试：配置 include_fields=["history"]，metadata keys 保留
- [x] 全部测试通过

## 完成时间
2026-04-26
