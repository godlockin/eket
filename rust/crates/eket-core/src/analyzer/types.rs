//! Structural analysis types for code parsing results.

use serde::{Deserialize, Serialize};

/// Complete structural analysis of a source file.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StructuralAnalysis {
    /// File path analyzed.
    pub path: String,
    /// Detected programming language.
    pub language: String,
    /// Functions/methods found.
    pub functions: Vec<FunctionInfo>,
    /// Classes/structs/interfaces found.
    pub classes: Vec<ClassInfo>,
    /// Import statements.
    pub imports: Vec<ImportInfo>,
    /// Export statements.
    pub exports: Vec<ExportInfo>,
    /// File-level metrics.
    pub metrics: FileMetrics,
    /// Parse errors (partial results if any).
    #[serde(skip_serializing_if = "Vec::is_empty", default)]
    pub errors: Vec<ParseError>,
}

/// Function or method information.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FunctionInfo {
    /// Function name.
    pub name: String,
    /// Starting line number (1-based).
    pub start_line: u32,
    /// Ending line number (1-based).
    pub end_line: u32,
    /// Parameter names.
    pub params: Vec<String>,
    /// Return type if available.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub return_type: Option<String>,
    /// Whether this is an async function.
    #[serde(default)]
    pub is_async: bool,
    /// Visibility (public, private, etc.) if detectable.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub visibility: Option<String>,
}

/// Class, struct, or interface information.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClassInfo {
    /// Class/struct name.
    pub name: String,
    /// Starting line number (1-based).
    pub start_line: u32,
    /// Ending line number (1-based).
    pub end_line: u32,
    /// Method names defined in this class.
    pub methods: Vec<String>,
    /// Property/field names.
    pub properties: Vec<String>,
    /// Kind of type (class, struct, interface, trait, etc.).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub kind: Option<String>,
}

/// Import statement information.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportInfo {
    /// Module/package source.
    pub source: String,
    /// Imported names (empty for default/namespace imports).
    pub specifiers: Vec<String>,
    /// Line number (1-based).
    pub line_number: u32,
}

/// Export statement information.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportInfo {
    /// Exported name.
    pub name: String,
    /// Line number (1-based).
    pub line_number: u32,
    /// Whether this is a default export.
    pub is_default: bool,
}

/// Aggregate file metrics.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct FileMetrics {
    /// Total line count.
    pub total_lines: u32,
    /// Non-empty line count.
    pub non_empty_lines: u32,
    /// Number of imports.
    pub import_count: u32,
    /// Number of exports.
    pub export_count: u32,
    /// Number of functions/methods.
    pub function_count: u32,
    /// Number of classes/structs.
    pub class_count: u32,
}

/// Parse error details.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParseError {
    /// Line number where error occurred.
    pub line: u32,
    /// Error message.
    pub message: String,
}

impl StructuralAnalysis {
    /// Create empty analysis for unsupported files.
    pub fn unsupported(path: &str) -> Self {
        Self {
            path: path.to_string(),
            language: "unknown".to_string(),
            functions: vec![],
            classes: vec![],
            imports: vec![],
            exports: vec![],
            metrics: FileMetrics::default(),
            errors: vec![ParseError {
                line: 0,
                message: "unsupported_language".to_string(),
            }],
        }
    }

    /// Create empty analysis for empty files.
    pub fn empty(path: &str, language: &str) -> Self {
        Self {
            path: path.to_string(),
            language: language.to_string(),
            functions: vec![],
            classes: vec![],
            imports: vec![],
            exports: vec![],
            metrics: FileMetrics::default(),
            errors: vec![],
        }
    }

    /// Compute metrics from collected data.
    pub fn compute_metrics(&mut self, content: &str) {
        let lines: Vec<&str> = content.lines().collect();
        self.metrics.total_lines = lines.len() as u32;
        self.metrics.non_empty_lines = lines.iter().filter(|l| !l.trim().is_empty()).count() as u32;
        self.metrics.import_count = self.imports.len() as u32;
        self.metrics.export_count = self.exports.len() as u32;
        self.metrics.function_count = self.functions.len() as u32;
        self.metrics.class_count = self.classes.len() as u32;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_compute_metrics() {
        let mut analysis = StructuralAnalysis::empty("test.ts", "typescript");
        analysis.functions.push(FunctionInfo {
            name: "foo".to_string(),
            start_line: 1,
            end_line: 3,
            params: vec!["a".to_string()],
            return_type: Some("number".to_string()),
            is_async: false,
            visibility: None,
        });
        analysis.imports.push(ImportInfo {
            source: "lodash".to_string(),
            specifiers: vec!["map".to_string()],
            line_number: 1,
        });

        analysis.compute_metrics("line1\n\nline3\nline4");
        assert_eq!(analysis.metrics.total_lines, 4);
        assert_eq!(analysis.metrics.non_empty_lines, 3);
        assert_eq!(analysis.metrics.function_count, 1);
        assert_eq!(analysis.metrics.import_count, 1);
    }

    #[test]
    fn test_serialization() {
        let analysis = StructuralAnalysis::empty("test.py", "python");
        let json = serde_json::to_string(&analysis).unwrap();
        assert!(json.contains("\"python\""));
        // errors should be omitted when empty
        assert!(!json.contains("\"errors\""));
    }
}
