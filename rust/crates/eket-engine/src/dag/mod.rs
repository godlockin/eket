//! EKET DAG Execution Engine
//!
//! Provides DAG-based workflow execution with:
//! - Conditional branching (gate nodes)
//! - Dynamic node expansion (foreach nodes)
//! - Parallel execution with semaphore-based concurrency control
//! - Checkpoint/resume support

pub mod executor;
pub mod schema;
pub mod scheduler;

// Re-exports for convenience
pub use executor::{DryRunExecutor, ExecutorConfig, NodeExecutionResult, NodeExecutor};
pub use schema::{
    DagNode, DagSchema, DagSettings, GateResult, NodeType, OnFailure, ValidationError,
};
pub use scheduler::{DagScheduler, ReadyNode, SchedulerProgress};
