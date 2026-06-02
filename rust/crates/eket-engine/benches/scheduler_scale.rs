//! TASK-658: 1K+ Node Scale Benchmark (Jeff Dean P0)
//!
//! Validates scheduling latency at scale:
//! - 1K nodes: <100ms
//! - 10K nodes: <1s
//!
//! Tests:
//! 1. PriorityScheduler::new() creation time (includes critical path)
//! 2. get_ready_nodes() latency
//! 3. Critical path computation time

use criterion::{criterion_group, criterion_main, BenchmarkId, Criterion, Throughput};

use eket_engine::dag::scheduler::PriorityScheduler;
use eket_engine::dag::schema::DagSchema;

/// Generate a parallel DAG (no dependencies between nodes)
/// All nodes are ready simultaneously - worst case for get_ready_nodes()
fn generate_parallel_dag(node_count: usize) -> DagSchema {
    let mut yaml = String::from(
        r#"version: "1.0"
epic: BENCH-SCALE
nodes:
"#,
    );

    for i in 0..node_count {
        yaml.push_str(&format!(
            r#"  - id: TASK-{:05}
    script: "echo {}"
    priority: {}
    deps: []
"#,
            i,
            i,
            (i % 100) as u8 // Varying priorities for realistic sorting
        ));
    }

    yaml.push_str(&format!(
        r#"settings:
  max_parallel: {}
"#,
        node_count.min(1000)
    ));

    DagSchema::from_yaml(&yaml).expect("Invalid YAML")
}

/// Generate a linear DAG (chain of dependencies)
/// Worst case for critical path computation: entire DAG is critical path
fn generate_linear_dag(node_count: usize) -> DagSchema {
    let mut yaml = String::from(
        r#"version: "1.0"
epic: BENCH-SCALE
nodes:
  - id: TASK-00000
    script: "echo 0"
    deps: []
"#,
    );

    for i in 1..node_count {
        yaml.push_str(&format!(
            r#"  - id: TASK-{:05}
    script: "echo {}"
    deps: [TASK-{:05}]
"#,
            i,
            i,
            i - 1
        ));
    }

    yaml.push_str(
        r#"settings:
  max_parallel: 100
"#,
    );

    DagSchema::from_yaml(&yaml).expect("Invalid YAML")
}

/// Generate a diamond DAG (fan-out then fan-in)
/// Realistic pattern: N parallel tasks feeding into a final aggregation
fn generate_diamond_dag(parallel_count: usize) -> DagSchema {
    let mut yaml = String::from(
        r#"version: "1.0"
epic: BENCH-SCALE
nodes:
  - id: TASK-START
    script: "echo start"
    deps: []
"#,
    );

    // Fan-out: parallel_count nodes depending on START
    for i in 0..parallel_count {
        yaml.push_str(&format!(
            r#"  - id: TASK-WORK-{:05}
    script: "echo work {}"
    priority: {}
    deps: [TASK-START]
"#,
            i,
            i,
            50 + (i % 50) as u8
        ));
    }

    // Fan-in: END depends on all work nodes
    yaml.push_str("  - id: TASK-END\n    script: \"echo end\"\n    deps: [");
    for i in 0..parallel_count {
        if i > 0 {
            yaml.push_str(", ");
        }
        yaml.push_str(&format!("TASK-WORK-{:05}", i));
    }
    yaml.push_str("]\n");

    yaml.push_str(&format!(
        r#"settings:
  max_parallel: {}
"#,
        parallel_count.min(1000)
    ));

    DagSchema::from_yaml(&yaml).expect("Invalid YAML")
}

/// Benchmark: PriorityScheduler::new() - includes critical path computation
fn bench_scheduler_creation(c: &mut Criterion) {
    let mut group = c.benchmark_group("scheduler_creation");
    group.sample_size(50); // Reduce samples for large DAGs

    for size in [100, 1000, 5000, 10000] {
        // Parallel DAG - O(1) critical path (all nodes independent)
        let dag = generate_parallel_dag(size);
        group.throughput(Throughput::Elements(size as u64));
        group.bench_with_input(
            BenchmarkId::new("parallel", size),
            &dag,
            |b, dag| b.iter(|| PriorityScheduler::new(dag.clone())),
        );

        // Linear DAG - O(N) critical path
        let dag = generate_linear_dag(size);
        group.bench_with_input(BenchmarkId::new("linear", size), &dag, |b, dag| {
            b.iter(|| PriorityScheduler::new(dag.clone()))
        });
    }

    group.finish();
}

/// Benchmark: get_ready_nodes() latency
fn bench_get_ready_nodes(c: &mut Criterion) {
    let mut group = c.benchmark_group("get_ready_nodes");
    group.sample_size(100);

    for size in [100, 1000, 5000, 10000] {
        // Parallel DAG - all nodes ready (worst case for sorting)
        let dag = generate_parallel_dag(size);
        let scheduler = PriorityScheduler::new(dag);
        group.throughput(Throughput::Elements(size as u64));
        group.bench_with_input(
            BenchmarkId::new("parallel_all_ready", size),
            &scheduler,
            |b, sched| b.iter(|| sched.get_ready_nodes()),
        );

        // Diamond DAG after START completed - parallel_count nodes ready
        let dag = generate_diamond_dag(size);
        let mut scheduler = PriorityScheduler::new(dag);
        scheduler.mark_completed("TASK-START");
        group.bench_with_input(
            BenchmarkId::new("diamond_fanout", size),
            &scheduler,
            |b, sched| b.iter(|| sched.get_ready_nodes()),
        );
    }

    group.finish();
}

/// Benchmark: Incremental scheduling (complete nodes one by one)
fn bench_incremental_scheduling(c: &mut Criterion) {
    let mut group = c.benchmark_group("incremental_scheduling");
    group.sample_size(20); // Lower samples for stateful benchmarks

    for size in [100, 1000, 5000] {
        // Measure time to complete all nodes in a parallel DAG
        let dag = generate_parallel_dag(size);
        group.throughput(Throughput::Elements(size as u64));
        group.bench_with_input(
            BenchmarkId::new("complete_all", size),
            &dag,
            |b, dag| {
                b.iter(|| {
                    let mut scheduler = PriorityScheduler::new(dag.clone());

                    // Get all ready and complete them
                    while !scheduler.is_complete() {
                        let ready = scheduler.get_ready_nodes();
                        if ready.is_empty() {
                            break;
                        }
                        for node in ready {
                            scheduler.mark_running(&node.id);
                            scheduler.mark_completed(&node.id);
                        }
                    }
                })
            },
        );
    }

    group.finish();
}

/// Benchmark: Critical path edge cases
fn bench_critical_path(c: &mut Criterion) {
    let mut group = c.benchmark_group("critical_path");
    group.sample_size(50);

    for size in [100, 1000, 5000, 10000] {
        // Linear DAG - entire path is critical
        let dag = generate_linear_dag(size);
        group.throughput(Throughput::Elements(size as u64));
        group.bench_with_input(
            BenchmarkId::new("linear_chain", size),
            &dag,
            |b, dag| {
                b.iter(|| {
                    // Critical path computed in new()
                    PriorityScheduler::new(dag.clone())
                })
            },
        );
    }

    group.finish();
}

criterion_group!(
    benches,
    bench_scheduler_creation,
    bench_get_ready_nodes,
    bench_incremental_scheduling,
    bench_critical_path
);

criterion_main!(benches);
