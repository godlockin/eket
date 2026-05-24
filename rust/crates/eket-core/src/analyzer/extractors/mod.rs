//! Language-specific structure extractors.
//!
//! Each extractor uses Query-based extraction with S-expressions
//! for optimal performance.

pub mod typescript;
pub mod python;
pub mod rust_lang;
pub mod go;

pub use typescript::extract as extract_typescript;
pub use python::extract as extract_python;
pub use rust_lang::extract as extract_rust;
pub use go::extract as extract_go;
