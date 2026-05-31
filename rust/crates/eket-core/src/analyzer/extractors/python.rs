//! Python structure extractor.

use streaming_iterator::StreamingIterator;
use tree_sitter::{Parser, Query, QueryCursor, QueryMatch};
use crate::analyzer::types::*;
use crate::analyzer::language::SupportedLanguage;

const PYTHON_QUERIES: &str = r#"
; Function definitions (also matches functions inside decorated_definition)
(function_definition
  name: (identifier) @fn.name
  parameters: (parameters) @fn.params
  return_type: (type)? @fn.return_type) @fn.def

; Class definitions
(class_definition
  name: (identifier) @class.name) @class.def

; Import statements
(import_statement
  name: (dotted_name) @import.source) @import.def

; Import from statements
(import_from_statement
  module_name: (dotted_name) @import.source) @import.def

; Method definitions (for class enrichment)
(class_definition
  body: (block
    (function_definition
      name: (identifier) @method.name)))
"#;

/// Extract structure from Python source.
pub fn extract(content: &str) -> StructuralAnalysis {
    let lang = SupportedLanguage::Python;
    let mut analysis = StructuralAnalysis::empty("", lang.as_str());

    let mut parser = Parser::new();
    parser.set_language(lang.grammar()).expect("Failed to set Python language");

    let tree = match parser.parse(content, None) {
        Some(t) => t,
        None => {
            analysis.errors.push(ParseError {
                line: 0,
                message: "Failed to parse Python file".to_string(),
            });
            return analysis;
        }
    };

    let root = tree.root_node();

    if root.has_error() {
        collect_errors(&root, &mut analysis.errors);
    }

    let query = match Query::new(lang.grammar(), PYTHON_QUERIES) {
        Ok(q) => q,
        Err(e) => {
            analysis.errors.push(ParseError {
                line: 0,
                message: format!("Query compilation failed: {}", e),
            });
            return analysis;
        }
    };

    let mut cursor = QueryCursor::new();
    let mut matches = cursor.matches(&query, root, content.as_bytes());

    let mut seen_functions = std::collections::HashSet::new();
    let mut seen_classes = std::collections::HashSet::new();
    let mut class_methods: std::collections::HashMap<String, Vec<String>> = std::collections::HashMap::new();

    while let Some(m) = matches.next() {
        let capture_names: Vec<&str> = m.captures.iter()
            .map(|c| query.capture_names()[c.index as usize])
            .collect();

        // Function definitions (top-level only, not methods)
        if capture_names.contains(&"fn.def") && !capture_names.contains(&"method.name") {
            if let Some(info) = extract_function(m, &query, content) {
                let key = (info.name.clone(), info.start_line);
                if seen_functions.insert(key) {
                    analysis.functions.push(info);
                }
            }
        }

        // Class definitions
        if capture_names.contains(&"class.def") {
            if let Some(info) = extract_class(m, &query, content) {
                let key = (info.name.clone(), info.start_line);
                if seen_classes.insert(key) {
                    analysis.classes.push(info);
                }
            }
        }

        // Import statements
        if capture_names.contains(&"import.def") {
            if let Some(info) = extract_import(m, &query, content) {
                analysis.imports.push(info);
            }
        }

        // Method names for class enrichment
        if capture_names.contains(&"method.name") {
            if let Some(method_name) = get_capture_text(m, &query, "method.name", content) {
                // Find parent class
                if let Some(class_name) = get_capture_text(m, &query, "class.name", content) {
                    class_methods.entry(class_name).or_default().push(method_name);
                }
            }
        }
    }

    // Enrich classes with methods
    for class in &mut analysis.classes {
        if let Some(methods) = class_methods.get(&class.name) {
            class.methods = methods.clone();
        }
    }

    // Filter out methods from top-level functions (Python-specific)
    let method_names: std::collections::HashSet<_> = class_methods.values()
        .flat_map(|v| v.iter())
        .collect();
    analysis.functions.retain(|f| !method_names.contains(&f.name));

    analysis.compute_metrics(content);
    analysis
}

fn extract_function(
    m: &QueryMatch,
    query: &Query,
    content: &str,
) -> Option<FunctionInfo> {
    let name = get_capture_text(m, query, "fn.name", content)?;
    let def_node = get_capture_node(m, query, "fn.def")?;

    let params = get_capture_text(m, query, "fn.params", content)
        .map(|p| parse_python_params(&p))
        .unwrap_or_default();

    let return_type = get_capture_text(m, query, "fn.return_type", content);

    let is_async = m.captures.iter().any(|c| {
        query.capture_names()[c.index as usize] == "fn.async"
    });

    Some(FunctionInfo {
        name,
        start_line: def_node.start_position().row as u32 + 1,
        end_line: def_node.end_position().row as u32 + 1,
        params,
        return_type,
        is_async,
        visibility: None,
    })
}

fn extract_class(
    m: &QueryMatch,
    query: &Query,
    content: &str,
) -> Option<ClassInfo> {
    let name = get_capture_text(m, query, "class.name", content)?;
    let def_node = get_capture_node(m, query, "class.def")?;

    Some(ClassInfo {
        name,
        start_line: def_node.start_position().row as u32 + 1,
        end_line: def_node.end_position().row as u32 + 1,
        methods: vec![],
        properties: vec![],
        kind: Some("class".to_string()),
    })
}

fn extract_import(
    m: &QueryMatch,
    query: &Query,
    content: &str,
) -> Option<ImportInfo> {
    let source = get_capture_text(m, query, "import.source", content)?;
    let def_node = get_capture_node(m, query, "import.def")?;

    // Extract imported names from import_from_statement
    let specifiers = extract_import_names(def_node, content);

    Some(ImportInfo {
        source,
        specifiers,
        line_number: def_node.start_position().row as u32 + 1,
    })
}

fn extract_import_names(node: tree_sitter::Node, content: &str) -> Vec<String> {
    let mut names = vec![];

    for i in 0..node.child_count() {
        if let Some(child) = node.child(i) {
            match child.kind() {
                "dotted_name" | "aliased_import" => {
                    if let Ok(text) = child.utf8_text(content.as_bytes()) {
                        // For aliased imports, extract the original name
                        let name = text.split(" as ").next().unwrap_or(text);
                        if !name.is_empty() && child.kind() != "dotted_name" {
                            names.push(name.to_string());
                        }
                    }
                }
                _ => {}
            }
        }
    }

    names
}

fn get_capture_text(
    m: &QueryMatch,
    query: &Query,
    name: &str,
    content: &str,
) -> Option<String> {
    m.captures.iter()
        .find(|c| query.capture_names()[c.index as usize] == name)
        .and_then(|c| c.node.utf8_text(content.as_bytes()).ok())
        .map(|s| s.to_string())
}

fn get_capture_node<'a>(
    m: &'a QueryMatch<'a, 'a>,
    query: &Query,
    name: &str,
) -> Option<tree_sitter::Node<'a>> {
    m.captures.iter()
        .find(|c| query.capture_names()[c.index as usize] == name)
        .map(|c| c.node)
}

fn parse_python_params(params_str: &str) -> Vec<String> {
    let inner = params_str.trim_start_matches('(').trim_end_matches(')');
    if inner.is_empty() {
        return vec![];
    }

    inner.split(',')
        .filter_map(|p| {
            let p = p.trim();
            // Skip *args, **kwargs, and self
            if p.starts_with('*') || p == "self" || p == "cls" {
                return None;
            }
            // Extract name before : or =
            let name = p.split(':').next()
                .or_else(|| p.split('=').next())
                .map(|s| s.trim())
                .filter(|s| !s.is_empty())?;
            Some(name.to_string())
        })
        .collect()
}

const MAX_ERROR_DEPTH: usize = 50;

fn collect_errors(node: &tree_sitter::Node, errors: &mut Vec<ParseError>) {
    collect_errors_recursive(node, errors, 0);
}

fn collect_errors_recursive(node: &tree_sitter::Node, errors: &mut Vec<ParseError>, depth: usize) {
    if depth > MAX_ERROR_DEPTH {
        return;
    }

    if node.is_error() || node.is_missing() {
        errors.push(ParseError {
            line: node.start_position().row as u32 + 1,
            message: format!("Syntax error at column {}", node.start_position().column),
        });
    }

    for i in 0..node.child_count() {
        if let Some(child) = node.child(i) {
            collect_errors_recursive(&child, errors, depth + 1);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_function_definition() {
        let code = r#"
def foo(a: str, b: int) -> bool:
    return True
"#;
        let analysis = extract(code);

        assert_eq!(analysis.functions.len(), 1);
        let f = &analysis.functions[0];
        assert_eq!(f.name, "foo");
        assert_eq!(f.params, vec!["a", "b"]);
    }

    #[test]
    fn test_class_definition() {
        let code = r#"
class MyClass:
    def __init__(self, value):
        self.value = value

    def get_value(self):
        return self.value
"#;
        let analysis = extract(code);

        assert_eq!(analysis.classes.len(), 1);
        let c = &analysis.classes[0];
        assert_eq!(c.name, "MyClass");
    }

    #[test]
    fn test_imports() {
        let code = r#"
import os
from typing import List, Dict
from collections.abc import Callable
"#;
        let analysis = extract(code);

        assert!(analysis.imports.len() >= 2);
        assert!(analysis.imports.iter().any(|i| i.source == "os"));
        assert!(analysis.imports.iter().any(|i| i.source == "typing"));
    }

    #[test]
    fn test_async_function() {
        let code = r#"
async def fetch_data(url: str) -> dict:
    return await aiohttp.get(url)
"#;
        let analysis = extract(code);

        assert_eq!(analysis.functions.len(), 1);
        let f = &analysis.functions[0];
        assert_eq!(f.name, "fetch_data");
    }

    #[test]
    fn test_decorated_function() {
        let code = r#"
@decorator
def decorated_fn(x):
    return x
"#;
        let analysis = extract(code);

        assert_eq!(analysis.functions.len(), 1);
        assert_eq!(analysis.functions[0].name, "decorated_fn");
    }

    #[test]
    fn test_parse_python_params() {
        assert_eq!(parse_python_params("(a, b, c)"), vec!["a", "b", "c"]);
        assert_eq!(parse_python_params("(self, x, y)"), vec!["x", "y"]);
        assert_eq!(parse_python_params("(a: int, b: str)"), vec!["a", "b"]);
        assert_eq!(parse_python_params("(*args, **kwargs)"), Vec::<String>::new());
        assert_eq!(parse_python_params("()"), Vec::<String>::new());
    }
}
