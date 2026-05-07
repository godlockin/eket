# TASK-205: ContextBudget struct + token estimator

**状态**: done

**优先级**: P2
**类型**: Feature
**模块**: rust/crates/eket-engine/src/workflow.rs
**父卡**: TASK-204
**工作量**: 0.5天
**依赖**: 无

## 需求

定义 `ContextBudget` 数据结构，并实现字符近似token估算工具函数。

## 验收标准

- [x] `WorkflowStep` 新增 `context_budget: Option<ContextBudget>` 字段（带Default）
- [x] `ContextBudget` struct 完整字段：
  ```rust
  pub struct ContextBudget {
      pub max_tokens: Option<usize>,
      pub keep_recent_n: Option<usize>,
      pub exclude_tool_outputs: bool,
      pub include_fields: Option<Vec<String>>,
  }
  ```
- [x] `estimate_tokens(s: &str) -> usize` = `s.chars().count() / 4`，单独函数
- [x] `estimate_value_tokens(v: &serde_json::Value) -> usize` 递归估算JSON大小
- [x] 单元测试：空/短/长字符串估算，JSON对象估算
- [x] 不破坏现有WorkflowStep构造（所有调用点补 `context_budget: None`）
