//! Core structure analysis functionality.
//!
//! This module provides the main entry point for analyzing source files.

use std::fs;
use std::path::Path;

use crate::analyzer::extractors;
use crate::analyzer::language::{detect_language, is_binary_content, SupportedLanguage};
use crate::analyzer::types::*;

/// Analyze a single source file and return structural information.
///
/// # Arguments
/// * `path` - Path to the source file
///
/// # Returns
/// * `StructuralAnalysis` with extracted functions, classes, imports, exports, and metrics
pub fn analyze_file(path: &Path) -> StructuralAnalysis {
    // Check if file exists
    if !path.exists() {
        return StructuralAnalysis {
            path: path.to_string_lossy().to_string(),
            language: "unknown".to_string(),
            functions: vec![],
            classes: vec![],
            imports: vec![],
            exports: vec![],
            metrics: FileMetrics::default(),
            errors: vec![ParseError {
                line: 0,
                message: "File not found".to_string(),
            }],
        };
    }

    // Read file content
    let content = match fs::read(path) {
        Ok(bytes) => bytes,
        Err(e) => {
            return StructuralAnalysis {
                path: path.to_string_lossy().to_string(),
                language: "unknown".to_string(),
                functions: vec![],
                classes: vec![],
                imports: vec![],
                exports: vec![],
                metrics: FileMetrics::default(),
                errors: vec![ParseError {
                    line: 0,
                    message: format!("Failed to read file: {}", e),
                }],
            };
        }
    };

    // Check for binary content
    if is_binary_content(&content) {
        return StructuralAnalysis {
            path: path.to_string_lossy().to_string(),
            language: "binary".to_string(),
            functions: vec![],
            classes: vec![],
            imports: vec![],
            exports: vec![],
            metrics: FileMetrics::default(),
            errors: vec![ParseError {
                line: 0,
                message: "Binary file detected".to_string(),
            }],
        };
    }

    // Convert to UTF-8 string
    let content_str = match String::from_utf8(content) {
        Ok(s) => s,
        Err(e) => {
            return StructuralAnalysis {
                path: path.to_string_lossy().to_string(),
                language: "unknown".to_string(),
                functions: vec![],
                classes: vec![],
                imports: vec![],
                exports: vec![],
                metrics: FileMetrics::default(),
                errors: vec![ParseError {
                    line: 0,
                    message: format!("Invalid UTF-8: {}", e),
                }],
            };
        }
    };

    // Handle empty files
    if content_str.trim().is_empty() {
        let lang = detect_language(path)
            .map(|l| l.as_str())
            .unwrap_or("unknown");
        return StructuralAnalysis::empty(&path.to_string_lossy(), lang);
    }

    // Detect language
    let lang = match detect_language(path) {
        Some(l) => l,
        None => return StructuralAnalysis::unsupported(&path.to_string_lossy()),
    };

    // Extract structure based on language
    let mut analysis = match lang {
        SupportedLanguage::TypeScript | SupportedLanguage::Tsx | SupportedLanguage::JavaScript => {
            extractors::extract_typescript(&content_str, lang)
        }
        SupportedLanguage::Python => extractors::extract_python(&content_str),
        SupportedLanguage::Rust => extractors::extract_rust(&content_str),
        SupportedLanguage::Go => extractors::extract_go(&content_str),
    };

    // Set the path
    analysis.path = path.to_string_lossy().to_string();

    // Warn for large files (>1MB)
    if content_str.len() > 1_000_000 {
        tracing::warn!(
            path = %path.display(),
            size_bytes = content_str.len(),
            "Analyzing large file"
        );
    }

    analysis
}

/// Analyze source content directly (for testing or when content is already loaded).
///
/// # Arguments
/// * `content` - Source code as string
/// * `lang` - Language to use for parsing
///
/// # Returns
/// * `StructuralAnalysis` with extracted structure
pub fn analyze_content(content: &str, lang: SupportedLanguage) -> StructuralAnalysis {
    match lang {
        SupportedLanguage::TypeScript | SupportedLanguage::Tsx | SupportedLanguage::JavaScript => {
            extractors::extract_typescript(content, lang)
        }
        SupportedLanguage::Python => extractors::extract_python(content),
        SupportedLanguage::Rust => extractors::extract_rust(content),
        SupportedLanguage::Go => extractors::extract_go(content),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use tempfile::NamedTempFile;

    #[test]
    fn test_analyze_typescript_file() {
        let mut file = NamedTempFile::with_suffix(".ts").unwrap();
        writeln!(file, "export function hello(name: string): string {{").unwrap();
        writeln!(file, "    return `Hello, ${{name}}!`;").unwrap();
        writeln!(file, "}}").unwrap();

        let analysis = analyze_file(file.path());

        assert_eq!(analysis.language, "typescript");
        assert_eq!(analysis.functions.len(), 1);
        assert_eq!(analysis.functions[0].name, "hello");
    }

    #[test]
    fn test_analyze_python_file() {
        let mut file = NamedTempFile::with_suffix(".py").unwrap();
        writeln!(file, "def greet(name: str) -> str:").unwrap();
        writeln!(file, "    return f'Hello, {{name}}!'").unwrap();

        let analysis = analyze_file(file.path());

        assert_eq!(analysis.language, "python");
        assert_eq!(analysis.functions.len(), 1);
        assert_eq!(analysis.functions[0].name, "greet");
    }

    #[test]
    fn test_analyze_rust_file() {
        let mut file = NamedTempFile::with_suffix(".rs").unwrap();
        writeln!(file, "pub fn add(a: i32, b: i32) -> i32 {{").unwrap();
        writeln!(file, "    a + b").unwrap();
        writeln!(file, "}}").unwrap();

        let analysis = analyze_file(file.path());

        assert_eq!(analysis.language, "rust");
        assert_eq!(analysis.functions.len(), 1);
        assert_eq!(analysis.functions[0].name, "add");
    }

    #[test]
    fn test_analyze_go_file() {
        let mut file = NamedTempFile::with_suffix(".go").unwrap();
        writeln!(file, "package main").unwrap();
        writeln!(file, "").unwrap();
        writeln!(file, "func Sum(a, b int) int {{").unwrap();
        writeln!(file, "    return a + b").unwrap();
        writeln!(file, "}}").unwrap();

        let analysis = analyze_file(file.path());

        assert_eq!(analysis.language, "go");
        assert_eq!(analysis.functions.len(), 1);
        assert_eq!(analysis.functions[0].name, "Sum");
    }

    #[test]
    fn test_analyze_nonexistent_file() {
        let analysis = analyze_file(Path::new("/nonexistent/file.ts"));
        assert!(!analysis.errors.is_empty());
        assert!(analysis.errors[0].message.contains("not found"));
    }

    #[test]
    fn test_analyze_unsupported_extension() {
        let mut file = NamedTempFile::with_suffix(".java").unwrap();
        writeln!(file, "public class Test {{}}").unwrap();

        let analysis = analyze_file(file.path());
        assert!(!analysis.errors.is_empty());
        assert!(analysis.errors[0].message.contains("unsupported"));
    }

    #[test]
    fn test_analyze_empty_file() {
        let file = NamedTempFile::with_suffix(".ts").unwrap();
        let analysis = analyze_file(file.path());

        assert_eq!(analysis.language, "typescript");
        assert!(analysis.functions.is_empty());
        assert!(analysis.errors.is_empty());
    }

    #[test]
    fn test_analyze_content() {
        let code = "function test() { return 42; }";
        let analysis = analyze_content(code, SupportedLanguage::JavaScript);

        assert_eq!(analysis.functions.len(), 1);
        assert_eq!(analysis.functions[0].name, "test");
    }
}
