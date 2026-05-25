# EPIC-013: Agent 协作测试与 Benchmark 体系

## 元信息

| 字段 | 值 |
|------|-----|
| 状态 | `in_progress` |
| 优先级 | P0 |
| 预估 | 12h |
| Owner | Master |

## 背景

研究了业界主流 Agent 评测和协作项目：
- **SWE-bench** (5K⭐) — 真实 GitHub issue 驱动的代码修复评测
- **mini-swe-agent** (4.5K⭐) — 100 行实现 74% SWE-bench
- **AgentBench** (3.5K⭐) — 8 维度 LLM-as-Agent 评测
- **DyLAN** (208⭐) — 动态 Agent 团队优化
- **AgentOps** (5.6K⭐) — 生产级 Agent 监控

## 目标

1. 用业界标准评测 EKET 框架能力
2. 借鉴 mini-swe-agent 极简架构
3. 引入 Agent Importance Score 优化专家组
4. 建立 EKET 自有评测体系

## 任务拆分

| Ticket | 标题 | 优先级 | 估时 |
|--------|------|--------|------|
| TASK-E13-001 | 用 SWE-bench Lite 评测 EKET Slaver | P0 | 4h |
| TASK-E13-002 | 分析 mini-swe-agent 架构并提炼借鉴点 | P0 | 2h |
| TASK-E13-003 | 实现 Agent Importance Score | P1 | 3h |
| TASK-E13-004 | 建立 EKET 自有评测 harness | P1 | 3h |

## 验收标准

- [ ] SWE-bench Lite 评测报告生成
- [ ] mini-swe-agent 架构分析文档
- [ ] 专家组支持贡献度评分
- [ ] EKET 评测 harness 可运行

## 参考

- [SWE-bench](https://github.com/SWE-bench/SWE-bench)
- [mini-swe-agent](https://github.com/SWE-agent/mini-swe-agent)
- [AgentBench](https://github.com/THUDM/AgentBench)
- [DyLAN](https://github.com/SALT-NLP/DyLAN)
