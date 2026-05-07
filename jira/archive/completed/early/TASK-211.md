# TASK-211: ToC快照模式 — WorkflowStep历史步骤压缩为索引

**状态**: done

**优先级**: P0
**类型**: Feature
**模块**: rust/crates/eket-engine/src/workflow.rs, rust/crates/eket-core/src/checkpoint.rs
**来源**: context-mode借鉴研究 — snapshot.ts ToC哲学
**工作量**: 3天

## 背景

当前 WorkflowEngine 步骤间全量传递 context.data，10+步骤长流程历史数据在 context 中线性膨胀。
借鉴 context-mode 的"目录而非内容"快照哲学：历史步骤数据存 SQLite，context 只保留 ToC（索引+指针）。

## 需求

WorkflowEngine 在步骤切换时，将已完成步骤的完整数据归档到 SQLite，
context 中只保留摘要索引（step_id + 摘要 + 可检索标签）。
下游步骤需要历史数据时，通过 `search_step_history(query)` 按需检索。

## 验收标准

- [x] 新建 `StepSnapshot` 结构体：
  ```rust
  pub struct StepSnapshot {
      pub workflow_id: String,
      pub step_id: String,
      pub summary: String,        // LLM生成或取data["summary"]字段，max 200字符
      pub tags: Vec<String>,      // 从data key列表自动提取
      pub full_data_json: String, // 完整数据JSON序列化
      pub created_at: DateTime<Utc>,
  }
  ```
- [x] SQLite 新建 `workflow_step_snapshots` 表，FTS5 索引 `summary + tags`
- [x] `archive_step(workflow_id, step_id, data)` → 写入快照，从 context.data 移除历史字段
- [x] `search_step_history(workflow_id, query) -> Vec<StepSnapshot>` → FTS5 检索
- [x] 步骤切换时自动调用 `archive_step`（前一步骤数据），context.data 只保留当前步骤数据 + ToC索引（`__history_index: Vec<{step_id, summary}>`）
- [x] 现有全部 workflow 测试继续通过
- [x] 新增测试：10步骤 workflow，验证 context.data 大小不随步骤数线性增长
- [x] 单元测试：archive → search 往返，FTS5 关键字命中
