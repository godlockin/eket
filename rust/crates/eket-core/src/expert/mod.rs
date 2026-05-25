//! Expert module - expert panel management and scoring
//!
//! Provides:
//! - Agent Importance Score (inspired by DyLAN paper)
//! - Expert contribution tracking
//! - Dynamic team optimization

pub mod importance;

pub use importance::{
    AgentImportanceScore, ExpertContribution, ImportanceCalculator, TeamScoreReport,
};
