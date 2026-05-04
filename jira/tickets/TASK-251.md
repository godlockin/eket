# TASK-251: 动态信誉评分引擎 — 多维 TrustScore 替代单一标签匹配

**状态**: todo
**优先级**: P0
**预估工时**: 360min
**负责人**: —
**创建时间**: 2026-05-04
**所需专家**: rust
**依赖**: —
**阻塞**: TASK-252

---

## 背景

来源：ruflo 借鉴研究。ruflo 用 `0.4×success + 0.2×uptime + 0.2×threat + 0.2×integrity` 量化 agent 信誉，使派送决策基于历史行为而非静态标签。EKET 当前 heartbeat dispatch 只看 expertise 标签匹配，同等标签的 slaver 无差异化——高质量 slaver 和频繁失败的 slaver 得到同等机会。

## 需求

新增 `TrustScore` 引擎，heartbeat dispatch 在 expertise 匹配后按信誉排序，优先派送高分 slaver。

## 验收标准

- [ ] 新增 `eket-core/src/scoring/trust_engine.rs`：
  ```rust
  pub struct TrustFactors {
      pub success_rate_7d: f32,   // 最近7天完成率
      pub uptime_30d: f32,        // 最近30天在线率
      pub avg_latency_ms: f32,    // 平均响应延迟（归一化，低延迟高分）
      pub error_rate: f32,        // 错误率（反向，越低越好）
  }
  pub struct ScoreWeights { pub success: f32, pub uptime: f32, pub latency: f32, pub error: f32 }
  pub fn compute_trust(factors: &TrustFactors, weights: &ScoreWeights) -> f32
  ```
- [ ] 权重通过 `.eket/config/scoring_weights.toml` 配置，默认 `0.4 / 0.2 / 0.2 / 0.2`；文件不存在时使用默认值（不报错）
- [ ] SQLite `instances` 表新增字段：`completed_count INTEGER DEFAULT 0`、`failed_count INTEGER DEFAULT 0`、`total_latency_ms INTEGER DEFAULT 0`（migration 向后兼容）
- [ ] `task:complete` 成功时更新 `completed_count + total_latency_ms`；失败/超时更新 `failed_count`
- [ ] heartbeat `best_matching_slaver`：expertise 匹配后对候选 slaver 计算 TrustScore，取最高分
- [ ] 每次 dispatch 写审计日志 `.eket/logs/scoring_trace.jsonl`：`{ts, ticket_id, slaver_id, trust_score, factors}`
- [ ] 单测：`trust_score_high_success_ranks_first`、`trust_score_uses_default_weights_when_config_missing`、`scoring_trace_written_on_dispatch`

## 实现要点

- `total_latency_ms / completed_count` 得平均延迟，归一化：`score = 1.0 - clamp(avg_ms / 60_000, 0, 1)`
- 新 slaver（completed=0）：success_rate=0.5（中性），uptime=1.0，latency=0.8（乐观默认），避免饿死
- `scoring_trace.jsonl` 按日轮转（文件名含日期），30 天自动清理

## 知识沉淀

完成后记录到 `confluence/memory/patterns/expertise-tag-design.md`（信誉评分升级小节）。
