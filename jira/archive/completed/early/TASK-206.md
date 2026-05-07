# TASK-206: ContextBudgetApplier — 裁剪逻辑核心

**状态**: done

**优先级**: P2
**类型**: Feature
**模块**: rust/crates/eket-engine/src/context_budget.rs (新文件)
**父卡**: TASK-204
**工作量**: 1天
**依赖**: TASK-205

## 需求

实现上下文数据裁剪逻辑，将 `ContextBudget` 规则应用于 `StepContext.data`。

## 验收标准

- [x] 新建 `context_budget.rs`，实现 `apply_budget(data: &mut HashMap<String, Value>, budget: &ContextBudget)`
- [x] `exclude_tool_outputs`: 删除 key 包含 `tool_output` / `tool_result` 的条目
- [x] `include_fields` 白名单: 若 Some，只保留列出的 key
- [x] `keep_recent_n`: data 中若有 `history` 字段（`Value::Array`），只保留最后N条
- [x] `max_tokens`: 估算裁剪后总tokens，若仍超出则按key大小降序继续删除（跳过 `task_id`/`step_id` 等元数据key）
- [x] 裁剪顺序：exclude → include_fields → keep_recent_n → max_tokens
- [x] 单元测试：
  - exclude_tool_outputs 生效
  - include_fields 白名单过滤
  - keep_recent_n 截断history
  - max_tokens 超出时字段被删除
  - 元数据key不被删除
