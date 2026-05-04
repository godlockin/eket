---
source: https://github.com/ruvnet/ruflo
date: 2026-05-04
researcher: Master
---

# ruflo 借鉴研究

## 项目概要

**ruflo**（原名 Claude Flow）：多智能体 AI 编排平台，支持 100+ 专业化 agent 跨机器协作。
- **核心栈**：Rust WASM kernels（policy engine + embeddings）+ TypeScript/Node.js + Svelte Web UI
- **存储**：HNSW 向量索引（agent memory）+ MongoDB（Web UI）
- **协调**：Queen-led 层级 swarms，Raft/Byzantine/Gossip 三种共识可选
- **集成**：27 hooks、12 background workers 自动触发、32 native plugins、多 LLM 智能路由

## 值得借鉴（已落地 / 规划中）

### ✅ HNSW 向量检索 — expertise dispatch 语义升级（TASK-250）

**ruflo 做法**：agent memory 用 HNSW 向量索引，sub-millisecond 检索 100k+ embeddings。

**EKET 借鉴**：将 slaver 的 role + skills 编码为 64d 向量，ticket required_expertise 作查询向量，HNSW Top-K 替代当前逐条遍历评分。

**收益**：
- 语义相似度匹配（`node` slaver 能匹配 `backend` ticket）
- 1000 slaver 下 dispatch < 5ms（现有 O(n) 遍历无法扩展）
- fallback 到现有标签评分，无破坏性

---

### ✅ 动态信誉评分 TrustScore（TASK-251）

**ruflo 做法**：`0.4×success + 0.2×uptime + 0.2×threat + 0.2×integrity`，量化 agent 信誉。

**EKET 借鉴**：同 expertise 匹配后对候选 slaver 按 TrustScore 排序，优先派送高质量 slaver。
- 4 维：success_rate_7d / uptime_30d / avg_latency / error_rate
- 权重通过 `scoring_weights.toml` 配置，支持调整
- 每次 dispatch 写 `scoring_trace.jsonl` 可审计

**收益**：同等标签下高质量 slaver 优先，避免频繁失败的 slaver 持续接单。

## 值得借鉴（待落地，优先级较低）

### 🔮 可插拔策略层（P2）

**ruflo 做法**：WASM kernels 隔离 policy 计算，支持热更新无需重启。

**EKET 方案**：短期用 `mlua` crate 把 claim/dispatch 策略抽成 Lua 脚本，长期可迁移 WASM。
- 用户无需重编译即可调整调度策略
- 支持 A/B 测试：按 agent ID hash 分流两个策略版本

**待评估**：需要确认 Lua 运行时增加的复杂度是否值得。

### 🔮 后台任务显式 DAG 化（P1）

**ruflo 做法**：12 background workers 自动触发（安全审计、test-gap 检测等）。

**EKET 方案**：不照搬 auto-trigger，而是将现有隐式后台操作（等待队列清理、expert 召唤提示）注册为显式 DAG node，有依赖顺序、有熔断。

## 明确拒绝（含原因）

| 功能 | 原因 |
|------|------|
| **Raft/Byzantine/Gossip 共识** | EKET 单机构内部框架，Redis heartbeat 已够轻；引入后 dispatch 从 O(1) → O(n log n) |
| **zero-trust mTLS + ed25519 everywhere** | 内网部署，TLS handshake 增加 3-50ms 延迟，威胁模型假设过强；EKET 用 HMAC-SHA256 内网校验即可 |
| **32 native plugins 全量移植** | 整合成本吞没收益；EKET 精选 3-5 个高价值场景（Jira webhook、Slack notify、GitHub commit 归档）即可 |
| **Svelte Web UI + 目标规划界面** | EKET 是 CLI 优先的开发者工具，Web Dashboard 已有；目标规划 UI 对当前用户场景无增量价值 |
| **跨组织联邦协作** | 企业级场景，EKET 当前是单团队框架，过早引入增加维护负担 |
| **多 LLM 智能路由** | EKET agent 当前绑定单一模型，路由层需要 LLM 评估基础设施；可在 agent pool 成熟后再考虑 |

## 研究方法记录

1. WebFetch 抓取 GitHub repo 主页 + README
2. 架构师 / 后端工程师 / 产品经理三位专家并行分析（独立输出，Master 汇总）
3. 决策框架：技术可行性 × EKET 阶段适配度 × 实现成本 三维过滤
4. 输出：P0 两张 ticket（TASK-250/251）立即推进，P1/P2 记录待评估，拒绝点明确存档

## 核心结论

ruflo 最值得学的是 **"向量语义检索 + 信誉量化评分"** 两个思想：
- 前者让 expertise dispatch 从标签精确匹配升级为语义相似度查询
- 后者让 slaver 选择从静态标签变成动态历史行为驱动

共识层、零信任 mTLS、插件全家桶均属 EKET 当前阶段的过度设计，明确跳过。
