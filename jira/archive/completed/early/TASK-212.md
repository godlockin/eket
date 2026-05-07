# TASK-212: Recency Decay — MailboxContextFilter加时间衰减权重

**状态**: done

**优先级**: P0
**类型**: Feature
**模块**: rust/crates/eket-engine/src/context_filter.rs
**来源**: MemOS借鉴研究 — Recency Decay机制
**工作量**: 1天

## 背景

EKET 的 MailboxContextFilter Phase1 按固定 age 阈值过滤，缺乏渐进式衰减。
借鉴 MemOS 的指数衰减权重：recent message 权重=1.0，随时间指数衰减到 floor=0.1。
与现有 relevance_score 相乘，实现"新鲜度 × 相关度"综合排序。

## 需求

在 MailboxContextFilter 的 Phase1 中引入时间衰减权重，
`effective_score = relevance_score × decay(age)`，按综合分数过滤而非硬截断 age。

## 验收标准

- [x] 新增 `DecayConfig` 结构体：
  ```rust
  pub struct DecayConfig {
      pub half_life_secs: u64,   // 半衰期（消息默认 3×24×3600=259200s，知识库 14天）
      pub floor: f32,            // 最低权重，默认 0.1
  }
  ```
- [x] `decay(age_secs: u64, config: &DecayConfig) -> f32` 实现：`floor + (1.0 - floor) × 0.5^(age/half_life)`
- [x] `MailboxContextFilter` 新增 `decay_config: Option<DecayConfig>` 字段（None = 保持原行为）
- [x] Phase1 过滤：`effective_score = relevance_score × decay(age)`，按 effective_score 过滤
- [x] `MailboxContextFilter::with_decay(half_life_secs, floor)` builder 方法
- [x] 单元测试：
  - 半衰期内消息权重 > 0.5
  - 3倍半衰期消息权重接近 floor
  - decay_config=None 时行为与原来完全一致（回归）
  - P0消息（preserved）不受衰减影响
