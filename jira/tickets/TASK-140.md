# TASK-140: DAG 中间件能力重建（Rust 或 Node）

## 元数据
- **状态**: done
- **类型**: feature / refactor
- **优先级**: P2
- **创建时间**: 2026-04-21
- **依赖**: TASK-139 (Hook 边界确定后才能定 DAG 落点)

## 背景

base 版本的 `node/src/core/middleware-pipeline.ts`（242 行）实现 Kahn 拓扑排序 DAG 中间件，
支持：
- 节点依赖图 + 同层并行 (`Promise.all`)
- 三种失败策略：`block / warn / skip`
- 跳过传播：skip 节点的下游自动跳过

stash 删了它，Rust 端只有 axum 的线性 tower 中间件 + recommender.rs（不是中间件 DAG）。
**guardrail ∥ security ∥ env-config → audit-log** 这种并行 + 失败隔离的能力**整体丢失**。

## 验收标准

1. 决定 DAG 中间件归属：Rust eket-engine 新增模块 / Node 端保留并增强 / 不重建（明确放弃）
2. 若重建：实现拓扑排序 + 同层并行 + block/warn/skip 三策略
3. 至少一个真实使用场景接入（候选：PreToolUse pipeline、PR review pipeline）
4. 单测覆盖：环检测、unknown-dep 错误、skip 传播、并行执行顺序
5. 性能：100 节点 DAG 排序 + 调度 < 10ms

## 技术提示

- 原 TS 实现：`git show e5ac393b:node/src/core/middleware-pipeline.ts`
- Rust 实现思路：`petgraph::algo::toposort` + `tokio::join!` / `FuturesUnordered`
- 与 `eket-engine/src/workflow.rs`（已有 WorkflowEngine）的关系需明确：是合并还是并存？
