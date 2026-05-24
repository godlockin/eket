//! Code and file analyzer module.
//!
//! Provides deterministic code structure extraction using tree-sitter.
//! Supports TypeScript, JavaScript, Python, Rust, and Go.
//!
//! Also includes non-code file analysis for knowledge graph integration.
//!
//! # Example
//!
//! ```no_run
//! use std::path::Path;
//! use eket_core::analyzer::{analyze_file, SupportedLanguage};
//!
//! // Analyze a source file
//! let analysis = analyze_file(Path::new("src/main.rs"));
//! println!("Functions: {:?}", analysis.functions);
//!
//! // Or analyze content directly
//! use eket_core::analyzer::analyze_content;
//! let code = "fn main() { println!(\"hello\"); }";
//! let analysis = analyze_content(code, SupportedLanguage::Rust);
//! ```

// Code structure analysis (tree-sitter based)
pub mod types;
pub mod language;
pub mod extractors;
pub mod structure;

// Non-code file analysis (TASK-E11-004)
pub mod non_code;

// Re-exports for code analysis
pub use types::*;
pub use language::{detect_language, is_binary_content, SupportedLanguage};
pub use structure::{analyze_file, analyze_content};

// Re-exports for non-code analysis
pub use non_code::{analyze_non_code_file, NonCodeAnalysis, NonCodeNode};
