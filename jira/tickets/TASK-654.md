# TASK-654: 节点优先级调度 (Borg-style Priority)

**EPIC**: EPIC-017  
**状态**: done  
**优先级**: P2  
**预估**: 1d  
**依赖**: TASK-651  
**层级**: L1 Rust  
**来源**: Jeff Dean Review (Borg 借鉴)

---

## 问题描述

当前调度器按拓扑顺序执行 ready 节点，无优先级概念。

**场景**：
- 关键路径节点应优先执行
- 有 deadline 的任务应抢占
- 长任务应尽早开始

## 验收标准

- [x] Schema 支持 `priority` 字段 (0-100, 默认 50)
- [x] Ready 队列按优先级排序（高优先级先执行）
- [x] 支持 deadline 推断优先级（deadline 近 = 高优先级）
- [x] 关键路径节点自动提升优先级
- [ ] 优先级变更事件广播 (deferred to TASK-655)

## Schema 扩展

```yaml
nodes:
  - id: critical-task
    script: "..."
    priority: 90        # 高优先级
    deadline: "2026-06-01T18:00:00Z"  # 可选
    
  - id: background-task
    script: "..."
    priority: 10        # 低优先级
```

## 调度算法

```rust
struct ReadyNode {
    id: String,
    priority: u8,
    deadline: Option<DateTime>,
    is_critical_path: bool,
}

impl Ord for ReadyNode {
    fn cmp(&self, other: &Self) -> Ordering {
        // 1. deadline 近的优先
        // 2. 关键路径优先
        // 3. priority 高的优先
        self.effective_priority().cmp(&other.effective_priority()).reverse()
    }
}

impl ReadyNode {
    fn effective_priority(&self) -> u8 {
        let mut p = self.priority;
        
        // 关键路径 +20
        if self.is_critical_path { p = p.saturating_add(20); }
        
        // deadline 近 +30
        if let Some(dl) = self.deadline {
            if dl - Utc::now() < Duration::hours(1) {
                p = p.saturating_add(30);
            }
        }
        
        p.min(100)
    }
}
```

## 优先级继承

子节点继承父节点最高优先级（防止高优先级任务被低优先级前置阻塞）：

```rust
fn inherit_priority(node: &mut DagNode, dag: &DagSchema) {
    let max_dep_priority = node.deps.iter()
        .filter_map(|dep_id| dag.get_node(dep_id))
        .map(|dep| dep.priority)
        .max()
        .unwrap_or(50);
    
    node.priority = node.priority.max(max_dep_priority);
}
```

---

## 变更日志

| 日期 | 变更 | 操作人 |
|------|------|--------|
| 2026-06-01 | 创建 ticket (Jeff Dean Review P2) | Master |
| 2026-06-02 | 实现完成: schema priority/deadline, scheduler 优先级排序, critical path | Slaver |
