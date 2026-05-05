# TASK-208: ContextBudget序列化 + CLI展示

**状态**: done

**优先级**: P3
**类型**: Feature
**模块**: rust/crates/eket-engine, rust/crates/eket-cli
**父卡**: TASK-204
**工作量**: 0.5天
**依赖**: TASK-207

## 需求

ContextBudget支持serde序列化（从YAML/JSON workflow定义加载），并在CLI中展示预算使用情况。

## 验收标准

- [x] `ContextBudget` 实现 `Serialize, Deserialize`（serde snake_case）
- [x] `WorkflowStep` 对应实现 Serialize/Deserialize（budget字段 `#[serde(default)]`）
- [x] `WorkflowDefinition` 可从JSON/YAML文件加载（含budget字段）
- [x] `eket workflow status <id>` 输出中，若step有budget配置，显示：
  ```
  Step: analyze [budget: max_tokens=2000, keep_recent=10]
  ```
- [x] 单元测试：带budget的WorkflowDefinition JSON往返序列化
