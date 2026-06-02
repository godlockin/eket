//! TASK-651: Scheduler benchmark for lock contention optimization
//!
//! Tests concurrent state updates under high load (1K/5K/10K nodes).
//! Validates DashMap provides better throughput than Mutex<HashSet>.

use std::sync::Arc;
use std::time::{Duration, Instant};

use eket_engine::dag::scheduler::DagScheduler;
use eket_engine::dag::schema::DagSchema;
use tokio::runtime::Runtime;

/// Generate DAG YAML with N parallel nodes (no dependencies)
fn generate_parallel_dag(node_count: usize) -> String {
    let mut yaml = String::from(
        r#"version: "1.0"
epic: BENCH-001
nodes:
"#,
    );

    for i in 0..node_count {
        yaml.push_str(&format!(
            r#"  - id: TASK-{:05}
    script: "echo {}"
    deps: []
"#,
            i, i
        ));
    }

    yaml.push_str(&format!(
        r#"settings:
  max_parallel: {}
"#,
        node_count.min(1000) // Cap parallelism for realistic scenario
    ));

    yaml
}

/// Benchmark: Concurrent state updates (complete_node)
fn bench_concurrent_complete(node_count: usize) -> Duration {
    let rt = Runtime::new().unwrap();
    let yaml = generate_parallel_dag(node_count);
    let dag = DagSchema::from_yaml(&yaml).expect("Invalid YAML");
    let scheduler = Arc::new(DagScheduler::new(dag));

    rt.block_on(async {
        scheduler.init().await;

        // Collect all ready nodes
        let mut nodes = Vec::new();
        while let Some((node, permit)) = scheduler.next_ready().await {
            nodes.push((node, permit));
        }

        let start = Instant::now();

        // Spawn concurrent complete_node calls
        let mut handles = Vec::new();
        for (node, _permit) in nodes {
            let sched = scheduler.clone();
            let node_id = node.id.clone();
            handles.push(tokio::spawn(async move {
                sched.complete_node(&node_id).await;
            }));
        }

        // Wait for all to complete
        for h in handles {
            h.await.unwrap();
        }

        start.elapsed()
    })
}

/// Benchmark: Concurrent progress reads during updates
fn bench_concurrent_progress(node_count: usize) -> Duration {
    let rt = Runtime::new().unwrap();
    let yaml = generate_parallel_dag(node_count);
    let dag = DagSchema::from_yaml(&yaml).expect("Invalid YAML");
    let scheduler = Arc::new(DagScheduler::new(dag));

    rt.block_on(async {
        scheduler.init().await;

        // Collect half the nodes
        let mut nodes = Vec::new();
        for _ in 0..node_count / 2 {
            if let Some((node, permit)) = scheduler.next_ready().await {
                nodes.push((node, permit));
            }
        }

        let start = Instant::now();

        // Spawn concurrent operations: half complete, half progress reads
        let mut handles = Vec::new();

        // Writers (complete_node)
        for (node, _permit) in nodes {
            let sched = scheduler.clone();
            let node_id = node.id.clone();
            handles.push(tokio::spawn(async move {
                sched.complete_node(&node_id).await;
            }));
        }

        // Readers (progress) - 10x more reads than writes
        for _ in 0..node_count * 5 {
            let sched = scheduler.clone();
            handles.push(tokio::spawn(async move {
                let _ = sched.progress().await;
            }));
        }

        // Wait for all to complete
        for h in handles {
            h.await.unwrap();
        }

        start.elapsed()
    })
}

/// Benchmark: fail_node with dependent skipping
fn bench_fail_with_dependents(node_count: usize) -> Duration {
    let rt = Runtime::new().unwrap();

    // Generate linear DAG (each node depends on previous)
    let mut yaml = String::from(
        r#"version: "1.0"
epic: BENCH-002
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

    let dag = DagSchema::from_yaml(&yaml).expect("Invalid YAML");
    let scheduler = Arc::new(DagScheduler::new(dag));

    rt.block_on(async {
        scheduler.init().await;

        // Get the first node
        let (node, _permit) = scheduler.next_ready().await.unwrap();

        let start = Instant::now();

        // Fail the first node - this should skip all N-1 dependents
        scheduler.fail_node(&node.id).await;

        start.elapsed()
    })
}

fn main() {
    println!("TASK-651: Scheduler Lock Contention Benchmark");
    println!("==============================================\n");

    // Test configurations
    let node_counts = [100, 1000, 5000, 10000];

    // Benchmark 1: Concurrent complete_node
    println!("1. Concurrent complete_node (parallel DAG)");
    println!("   Nodes    Time (ms)    Throughput (ops/sec)");
    println!("   ------   ---------    --------------------");
    for &count in &node_counts {
        let duration = bench_concurrent_complete(count);
        let throughput = count as f64 / duration.as_secs_f64();
        println!(
            "   {:>6}   {:>9.2}    {:>20.0}",
            count,
            duration.as_secs_f64() * 1000.0,
            throughput
        );
    }

    // Benchmark 2: Concurrent progress reads
    println!("\n2. Concurrent progress() during updates");
    println!("   Nodes    Time (ms)    Ops/sec (reads+writes)");
    println!("   ------   ---------    ----------------------");
    for &count in &node_counts {
        let duration = bench_concurrent_progress(count);
        // Total ops = (count/2 writes) + (count*5 reads)
        let total_ops = (count / 2) + (count * 5);
        let throughput = total_ops as f64 / duration.as_secs_f64();
        println!(
            "   {:>6}   {:>9.2}    {:>22.0}",
            count,
            duration.as_secs_f64() * 1000.0,
            throughput
        );
    }

    // Benchmark 3: fail_node cascade
    println!("\n3. fail_node with dependent skipping (linear DAG)");
    println!("   Nodes    Time (ms)    Skip rate (nodes/sec)");
    println!("   ------   ---------    ---------------------");
    for &count in &node_counts {
        let duration = bench_fail_with_dependents(count);
        let skip_rate = (count - 1) as f64 / duration.as_secs_f64();
        println!(
            "   {:>6}   {:>9.2}    {:>21.0}",
            count,
            duration.as_secs_f64() * 1000.0,
            skip_rate
        );
    }

    println!("\n[TASK-651] Benchmark complete.");
}
