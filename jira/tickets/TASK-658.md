# TASK-658: 1K 节点基准测试 (Jeff Dean P0)

**EPIC**: EPIC-017  
**状态**: done  
**优先级**: P0  
**预估**: 1d  
**依赖**: TASK-657  
**层级**: L1 Rust  
**来源**: Jeff Dean Review

---

## 问题描述

当前测试只用 2-10 节点 DAG，无 10K+ 节点规模验证。

Jeff Dean 要求：**1K+ 节点调度延迟 <100ms**

## 验收标准

- [x] 添加 1K/5K/10K 节点基准测试
- [x] 测量：scheduler 创建时间、`get_ready_nodes()` 延迟、critical path 计算时间
- [ ] 1K 节点调度延迟 <100ms
- [ ] 10K 节点调度延迟 <1s

## 实现方案

```rust
// benches/scheduler_scale.rs
use criterion::{criterion_group, criterion_main, Criterion, BenchmarkId};

fn bench_scheduler_creation(c: &mut Criterion) {
    let mut group = c.benchmark_group("scheduler_creation");
    
    for size in [100, 1000, 5000, 10000] {
        let dag = generate_dag(size);
        group.bench_with_input(
            BenchmarkId::from_parameter(size),
            &dag,
            |b, dag| b.iter(|| PriorityScheduler::new(dag.clone())),
        );
    }
    group.finish();
}

fn bench_get_ready_nodes(c: &mut Criterion) {
    // ...
}

criterion_group!(benches, bench_scheduler_creation, bench_get_ready_nodes);
criterion_main!(benches);
```

---

## 变更日志

| 日期 | 变更 | 操作人 |
|------|------|--------|
| 2026-06-02 | 创建 ticket (Jeff Dean Review P0) | Master |
| 2026-06-02 | 实现 scheduler_scale.rs 基准测试 | Slaver |
