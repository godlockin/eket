# TASK-143: DAG 并行执行器（Kahn 分层 + FailBehavior）

## 元数据
- **类型**: feature
- **优先级**: P1
- **状态**: ready
- **创建**: 2026-04-21
- **依赖**: 无

## 背景

当前 Rust `dag.rs` 只做图分析（Kahn 拓扑排序、环检测、关键路径），无执行层。
Node.js `middleware-pipeline.ts` 有完整并行层执行逻辑 + `FailBehavior: block/warn/skip`。

## 验收标准

- [ ] `DagExecutor::run(dag, handlers)` — 按层并行执行
- [ ] 同层节点用 `tokio::spawn` 并行执行
- [ ] `FailBehavior` 枚举：`Block`（中止后续）/ `Warn`（继续但记录）/ `Skip`（跳过该节点）
- [ ] 每个节点返回 `NodeResult { success, output, duration_ms }`
- [ ] 整体返回 `ExecutionReport { layers_completed, failed_nodes, total_duration_ms }`

## 负责人
待认领（推荐：Rust 工程师）
