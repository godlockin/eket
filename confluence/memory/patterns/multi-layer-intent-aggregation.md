# 多层意图聚合模式（Multi-Layer Intent Aggregation）

**来源**：akea search Spec 4 — feedback + intent system

## 模式概述

将用户隐式反馈（点击、收藏、忽略）逐层聚合为搜索意图，注入检索管线的多个阶段。

## 四层模型

| 层级 | 名称 | 粒度 | 计算方式 | 时效 |
|------|------|------|---------|------|
| L1.5 | turn_intent | 单次查询 | 极性统计（like/dislike/save 计数） | 实时 |
| L2 | scene_intent | 会话级 | 规则聚合 turn_intent + 噪声过滤 | 会话内 |
| L3 | user_intent | 用户级 | LLM（gpt-4o）推理跨会话偏好 | 长期 |
| L4 | system_intent | 全局 | LLM + 跨用户阈值统计 | 持久 |

## 噪声过滤

少数极性（占比 < 1/3）视为噪声，从 scene_intent 中丢弃。

## 四个注入点

| 注入点 | 阶段 | 作用 |
|--------|------|------|
| A: QueryRewriter | embed 前 | LLM 改写查询，融入偏好 |
| B: NegativeFilter | retrieve 后 | 过滤用户明确不喜欢的文档 |
| C: RerankHint | rerank 时 | 注入 system prompt 提示 |
| D: ExpertHint | expert panel | 注入专家面板提示词 |

## 冲突检测 + 澄清流程

当 query 与 scene_intent 矛盾时（如用户一直 dislike 某品牌但又搜该品牌）：
1. ConflictDetector 检测冲突
2. 发送 SSE `clarify` 事件
3. 前端展示 ClarifyCard，用户选择
4. 前端携带 `clarify_choice` 重新请求

**频率限制**：连续 3 次选 "keep" → 12h 冷却期（per session + query_norm）。

## 适用场景

任何需要将用户隐式行为转化为搜索/推荐偏好的系统。关键是分层聚合而非单一信号。
