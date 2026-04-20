# TASK-124: [Rust] ticket-dag + task-dependency — DAG 构建/拓扑排序/trigger_rule

## 元数据
- **状态**: todo
- **类型**: feature
- **优先级**: P0
- **负责人**: 待认领
- **创建时间**: 2026-04-21
- **依赖**: []
- **blocked_by**: []

## 背景

TS `ticket-dag-parser.ts`(2.8KB) + `task-dependency.ts`(1.6KB) + `dependency-analyzer.ts`(11KB)
提供 DAG 构建、依赖解锁、关键路径分析。Rust 完全缺失，导致无法做多 ticket 协作调度。

## 验收标准

- [ ] `rust/crates/eket-core/src/dag.rs` 实现以下能力：
- [ ] `parse_tickets_dag(tickets_dir)` → `DagResponse { nodes, edges }` — 扫描 `jira/tickets/*.md`，解析 `blocked_by`
- [ ] `topological_sort(nodes, edges)` → `Vec<String>` — Kahn 算法，返回可执行顺序
- [ ] `detect_cycle(nodes, edges)` → `Option<Vec<String>>` — 环路检测，返回环路节点
- [ ] `can_proceed(ticket_id, trigger_rule, completed, failed)` → `bool` — trigger_rule: all_success/one_success/all_done
- [ ] `critical_path(nodes, edges)` → `Vec<String>` — 最长路径（阻塞链）
- [ ] `ready_tickets(dag, completed, failed)` → `Vec<String>` — 当前可立即执行的 ticket 列表
- [ ] 单元测试 ≥ 8 条：线性链、菱形依赖、环检测报错、trigger_rule 三种模式、空图、关键路径

## 技术要点

- 纯 Rust，无外部依赖（petgraph 可选但优先手写 Kahn）
- `blocked_by` 字段格式：`- blocked_by: [TASK-X, TASK-Y]`
- trigger_rule 字段：`**trigger_rule**: all_success`（默认 all_success）
- `DagNode { id, label, status, assignee }`
- `DagEdge { source, target }` — source 依赖 target（source 需等 target 完成）
