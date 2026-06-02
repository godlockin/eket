//! DAG Module - Task orchestration with priority scheduling
//!
//! This module provides:
//! - `schema`: DAG YAML schema definitions with priority and deadline support
//! - `scheduler`: Priority-based ready node scheduling (Borg-style)
//! - `executor`: Command execution with timeout and retry
//! - `checkpoint`: DAG execution state persistence
//! - `fusion`: Multi-DAG fusion and optimization

pub mod checkpoint;
pub mod executor;
pub mod fusion;
pub mod schema;
pub mod scheduler;

pub use checkpoint::DagCheckpoint;
pub use executor::{
    validate_script, DryRunExecutor, ExecutorConfig, NodeExecutionResult, NodeExecutor,
    ScriptValidationError,
};
pub use schema::{DagNode, DagSchema, DagSettings, NodeType, OnFailure, ValidationError};
pub use scheduler::{PriorityScheduler, ReadyNode};
