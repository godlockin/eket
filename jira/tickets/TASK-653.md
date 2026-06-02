# TASK-653: 线性链融合优化 (Flume-style Fusion)

**EPIC**: EPIC-017  
**状态**: done  
**优先级**: P2  
**预估**: 1.5d  
**依赖**: TASK-652  
**层级**: L1 Rust  
**来源**: Jeff Dean Review (Flume 借鉴)

---

## 问题描述

线性依赖链 (A→B→C→D) 每个节点单独调度、单独执行，产生不必要的调度开销。

**示例**：
```yaml
nodes:
  - id: lint
  - id: build
    deps: [lint]
  - id: test
    deps: [build]
  - id: deploy
    deps: [test]
```

4 次调度 + 4 次 shell 启动 = 高开销

## 验收标准

- [x] 检测纯线性链（单入单出节点序列）
- [x] 融合为单个复合脚本执行
- [x] 保留中间节点的日志和状态
- [x] `--no-fusion` 选项禁用优化
- [x] 基准测试：10 节点线性链 fusion vs non-fusion

## 优化方案

### 检测算法

```rust
fn detect_linear_chains(dag: &DagSchema) -> Vec<Vec<String>> {
    let mut chains = vec![];
    let mut visited = HashSet::new();
    
    for node in &dag.nodes {
        if visited.contains(&node.id) { continue; }
        
        // 找链头（入度=0 或 入度>1）
        if is_chain_head(node, dag) {
            let chain = trace_chain(node, dag, &mut visited);
            if chain.len() >= 2 {
                chains.push(chain);
            }
        }
    }
    chains
}

fn is_chain_head(node: &DagNode, dag: &DagSchema) -> bool {
    let in_degree = count_dependents(node.id, dag);
    in_degree == 0 || in_degree > 1
}
```

### 融合执行

```rust
fn fuse_chain(chain: &[String], dag: &DagSchema) -> FusedNode {
    // 生成复合脚本
    let scripts: Vec<_> = chain.iter()
        .map(|id| dag.get_node(id).script.clone())
        .collect();
    
    let fused_script = scripts.join(" && ");
    
    FusedNode {
        id: format!("fused_{}", chain[0]),
        script: fused_script,
        original_nodes: chain.to_vec(),
    }
}
```

### 融合后状态映射

```
原始 DAG:      lint → build → test → deploy
融合后:        fused_lint (执行 "lint && build && test && deploy")

状态记录:
  - fused_lint: done
  - lint: done (从 fused 推断)
  - build: done
  - test: done  
  - deploy: done
```

---

## 变更日志

| 日期 | 变更 | 操作人 |
|------|------|--------|
| 2026-06-01 | 创建 ticket (Jeff Dean Review P2) | Master |
| 2026-06-02 | 完成: 新建 fusion.rs 模块, 重构 scheduler.rs, 13 个测试通过 | Slaver |
