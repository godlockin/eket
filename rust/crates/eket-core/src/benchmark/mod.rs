//! Benchmark module - EKET evaluation harness
//!
//! Provides:
//! - Task-based evaluation framework
//! - Multiple task types (code fix, config, docs)
//! - Metrics collection and reporting
//! - SWE-bench compatible output format

pub mod harness;
pub mod metrics;
pub mod tasks;

pub use harness::{BenchmarkHarness, BenchmarkConfig, BenchmarkResult};
pub use metrics::{EvalMetrics, MetricsCollector};
pub use tasks::{BenchmarkTask, TaskType, TaskOutcome};
