# TASK-204: WorkflowStep上下文预算 — 长流程token控制

**状态**: dropped

**优先级**: P3
**类型**: Feature
**模块**: rust/crates/eket-engine/src/workflow.rs
**来源**: openai-agents-python借鉴研究（HandoffInputData上下文预算思路）
**工作量**: 1周

## 背景

WorkflowEngine步骤间全量传递数据，10+步骤长流程token爆炸，后期步骤因上下文超长而退化。
借鉴HandoffInputFilter的声明式裁剪思路，每个WorkflowStep声明上下文预算。

## 需求

WorkflowStep支持 `context_budget` 字段，引擎在步骤切换时自动裁剪传递数据。

## 验收标准

- [ ] `WorkflowStep` 新增 `context_budget: Option<ContextBudget>` 字段：
  ```rust
  pub struct ContextBudget {
    pub max_tokens: Option<usize>,
    pub keep_recent_n: Option<usize>,        // 保留最近N条历史
    pub exclude_tool_outputs: bool,           // 剔除工具输出（通常最大）
    pub include_fields: Option<Vec<String>>,  // 白名单字段
  }
  ```
- [ ] `StepContext.data` 传递前应用budget裁剪
- [ ] token估算：按字符数/4近似，不引入tokenizer依赖
- [ ] 裁剪后记录 `tracing::debug!` 日志：原始大小→裁剪后大小
- [ ] 单元测试：超出max_tokens时历史被截断；exclude_tool_outputs生效
