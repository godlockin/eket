//! Language-specific structure extractors.
//!
//! Each extractor uses Query-based extraction with S-expressions
//! for optimal performance.

pub mod go;
pub mod python;
pub mod rust_lang;
pub mod typescript;

pub use go::extract as extract_go;
pub use python::extract as extract_python;
pub use rust_lang::extract as extract_rust;
pub use typescript::extract as extract_typescript;
