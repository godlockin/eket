//! Gate module - pre-commit review checks
//!
//! Provides various checks for validating changes before commit/merge:
//! - Surgical changes check: validates diff scope and size

pub mod checks;

pub use checks::surgical::{Severity, SurgicalChangesCheck, SurgicalReport, UnrelatedChange};
