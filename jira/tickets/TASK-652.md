# TASK-652: O(N) 依赖扫描优化 (反向索引)

**EPIC**: EPIC-017  
**状态**: done  
**优先级**: P1  
**预估**: 1d  
**依赖**: TASK-651  
**层级**: L1 Rust  
**来源**: Jeff Dean Review

---

## 问题描述

`update_conditional_nodes()` (scheduler.rs:194-249) 在每次 gate 完成时**遍历所有节点**检查依赖。

**时间复杂度**：O(N) per gate completion → O(N*G) 总计（G = gate 数量）

**影响**：深 DAG (depth ≥ 10) 性能下降明显。

## 验收标准

- [x] 构建反向索引：`gate_id → Vec<dependent_node_id>`
- [x] `update_conditional_nodes()` 从 O(N) 优化到 O(D)（D = 依赖该 gate 的节点数）
- [x] 基准测试：深 DAG (100 gates, 1000 nodes) 性能对比
- [x] 索引在 DAG 加载时构建，不影响运行时

## 优化方案

```rust
struct Scheduler {
    // 现有
    nodes: HashMap<String, DagNode>,
    
    // 新增：反向索引
    gate_dependents: HashMap<String, Vec<String>>,  // gate_id -> [node_ids that depend on it]
    node_dependencies: HashMap<String, Vec<String>>, // node_id -> [gate_ids it depends on]
}

impl Scheduler {
    fn build_reverse_index(&mut self) {
        for (node_id, node) in &self.nodes {
            if let Some(when) = &node.when {
                // 解析 "gate-check.success" -> "gate-check"
                let gate_id = parse_gate_id(when);
                self.gate_dependents
                    .entry(gate_id)
                    .or_default()
                    .push(node_id.clone());
            }
        }
    }
    
    fn update_conditional_nodes(&self, gate_id: &str, result: GateResult) {
        // O(D) instead of O(N)
        if let Some(dependents) = self.gate_dependents.get(gate_id) {
            for node_id in dependents {
                self.update_node_readiness(node_id, gate_id, result);
            }
        }
    }
}
```

## 索引结构

```
gate_dependents:
  "gate-check" -> ["TASK-002-success", "TASK-002-failure"]
  "gate-deploy" -> ["TASK-003-prod", "TASK-003-rollback"]

node_dependencies:
  "TASK-002-success" -> ["gate-check"]
  "TASK-003-prod" -> ["gate-check", "gate-deploy"]
```

---

## 变更日志

| 日期 | 变更 | 操作人 |
|------|------|--------|
| 2026-06-01 | 创建 ticket (Jeff Dean Review P1) | Master |
| 2026-06-01 | 实现 gate_dependents 反向索引，优化 update_conditional_nodes() | Slaver |
