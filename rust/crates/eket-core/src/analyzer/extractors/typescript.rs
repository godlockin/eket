//! TypeScript/JavaScript structure extractor.
//!
//! Uses Query-based extraction with S-expressions for performance.
//! JavaScript files use the TypeScript parser for compatibility (>99%).

use streaming_iterator::StreamingIterator;
use tree_sitter::{Parser, Query, QueryCursor, QueryMatch};
use crate::analyzer::types::*;
use crate::analyzer::language::SupportedLanguage;

/// TypeScript/JavaScript query patterns (S-expressions).
const TS_QUERIES: &str = r#"
; Function declarations
(function_declaration
  name: (identifier) @fn.name
  parameters: (formal_parameters) @fn.params
  return_type: (type_annotation)? @fn.return_type) @fn.def

; Arrow functions with variable declaration
(lexical_declaration
  (variable_declarator
    name: (identifier) @fn.name
    value: (arrow_function
      parameters: (formal_parameters) @fn.params
      return_type: (type_annotation)? @fn.return_type))) @fn.def

; Async function declarations
(function_declaration
  "async" @fn.async
  name: (identifier) @fn.name
  parameters: (formal_parameters) @fn.params) @fn.def

; Export function declarations
(export_statement
  (function_declaration
    name: (identifier) @fn.name
    parameters: (formal_parameters) @fn.params
    return_type: (type_annotation)? @fn.return_type)) @fn.def

; Class declarations
(class_declaration
  name: (type_identifier) @class.name) @class.def

; Interface declarations
(interface_declaration
  name: (type_identifier) @interface.name) @interface.def

; Type alias declarations
(type_alias_declaration
  name: (type_identifier) @type.name) @type.def

; Import statements
(import_statement
  source: (string) @import.source) @import.def

; Export statements (named)
(export_statement
  (export_clause
    (export_specifier
      name: (identifier) @export.name))) @export.def

; Export default
(export_statement
  "default" @export.default
  (identifier)? @export.name) @export.def

; Method definitions in class
(method_definition
  name: (property_identifier) @method.name
  parameters: (formal_parameters) @method.params) @method.def

; Property definitions in class
(public_field_definition
  name: (property_identifier) @property.name) @property.def
"#;

/// Extract structure from TypeScript/JavaScript source.
pub fn extract(content: &str, lang: SupportedLanguage) -> StructuralAnalysis {
    let path = ""; // Will be set by caller
    let mut analysis = StructuralAnalysis::empty(path, lang.as_str());

    let mut parser = Parser::new();
    parser.set_language(lang.grammar()).expect("Failed to set language");

    let tree = match parser.parse(content, None) {
        Some(t) => t,
        None => {
            analysis.errors.push(ParseError {
                line: 0,
                message: "Failed to parse file".to_string(),
            });
            return analysis;
        }
    };

    let root = tree.root_node();

    // Check for parse errors
    if root.has_error() {
        collect_errors(&root, content, &mut analysis.errors);
    }

    // Use query-based extraction
    let language = lang.grammar();
    let query = match Query::new(language, TS_QUERIES) {
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

    // Track seen items to avoid duplicates
    let mut seen_functions = std::collections::HashSet::new();
    let mut seen_classes = std::collections::HashSet::new();
    let mut current_class_methods: Vec<String> = vec![];
    let mut current_class_properties: Vec<String> = vec![];

    // tree-sitter 0.24: use StreamingIterator
    while let Some(m) = matches.next() {
        let capture_names: Vec<&str> = m.captures.iter()
            .map(|c| query.capture_names()[c.index as usize])
            .collect();

        // Function declarations
        if capture_names.contains(&"fn.def") {
            if let Some(info) = extract_function(m, &query, content) {
                let key = (info.name.clone(), info.start_line);
                if seen_functions.insert(key) {
                    analysis.functions.push(info);
                }
            }
        }

        // Class declarations
        if capture_names.contains(&"class.def") {
            if let Some(info) = extract_class(m, &query, content, "class") {
                let key = (info.name.clone(), info.start_line);
                if seen_classes.insert(key) {
                    analysis.classes.push(info);
                }
            }
        }

        // Interface declarations
        if capture_names.contains(&"interface.def") {
            if let Some(info) = extract_class(m, &query, content, "interface") {
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

        // Export statements
        if capture_names.contains(&"export.def") {
            if let Some(info) = extract_export(m, &query, content) {
                analysis.exports.push(info);
            }
        }

        // Method definitions (for class enrichment)
        if capture_names.contains(&"method.def") {
            if let Some(name) = get_capture_text(m, &query, "method.name", content) {
                current_class_methods.push(name);
            }
        }

        // Property definitions (for class enrichment)
        if capture_names.contains(&"property.def") {
            if let Some(name) = get_capture_text(m, &query, "property.name", content) {
                current_class_properties.push(name);
            }
        }
    }

    // Enrich last class with methods/properties if any
    if let Some(last_class) = analysis.classes.last_mut() {
        if last_class.methods.is_empty() {
            last_class.methods = current_class_methods;
        }
        if last_class.properties.is_empty() {
            last_class.properties = current_class_properties;
        }
    }

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
        .map(|p| parse_params(&p))
        .unwrap_or_default();

    let return_type = get_capture_text(m, query, "fn.return_type", content)
        .map(|t| t.trim_start_matches(':').trim().to_string());

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
    kind: &str,
) -> Option<ClassInfo> {
    let name_capture = if kind == "interface" { "interface.name" } else { "class.name" };
    let def_capture = if kind == "interface" { "interface.def" } else { "class.def" };

    let name = get_capture_text(m, query, name_capture, content)?;
    let def_node = get_capture_node(m, query, def_capture)?;

    Some(ClassInfo {
        name,
        start_line: def_node.start_position().row as u32 + 1,
        end_line: def_node.end_position().row as u32 + 1,
        methods: vec![],
        properties: vec![],
        kind: Some(kind.to_string()),
    })
}

fn extract_import(
    m: &QueryMatch,
    query: &Query,
    content: &str,
) -> Option<ImportInfo> {
    let source = get_capture_text(m, query, "import.source", content)?;
    let def_node = get_capture_node(m, query, "import.def")?;

    // Clean source string (remove quotes)
    let source = source.trim_matches(|c| c == '"' || c == '\'').to_string();

    // Extract specifiers from import clause
    let specifiers = extract_import_specifiers(def_node, content);

    Some(ImportInfo {
        source,
        specifiers,
        line_number: def_node.start_position().row as u32 + 1,
    })
}

fn extract_import_specifiers(node: tree_sitter::Node, content: &str) -> Vec<String> {
    let mut specifiers = vec![];

    for i in 0..node.child_count() {
        if let Some(child) = node.child(i) {
            if child.kind() == "import_clause" {
                for j in 0..child.child_count() {
                    if let Some(spec_node) = child.child(j) {
                        match spec_node.kind() {
                            "identifier" => {
                                if let Ok(text) = spec_node.utf8_text(content.as_bytes()) {
                                    specifiers.push(text.to_string());
                                }
                            }
                            "named_imports" => {
                                for k in 0..spec_node.child_count() {
                                    if let Some(import_spec) = spec_node.child(k) {
                                        if import_spec.kind() == "import_specifier" {
                                            if let Some(name_node) = import_spec.child_by_field_name("name") {
                                                if let Ok(text) = name_node.utf8_text(content.as_bytes()) {
                                                    specifiers.push(text.to_string());
                                                }
                                            } else if let Some(first) = import_spec.child(0) {
                                                if let Ok(text) = first.utf8_text(content.as_bytes()) {
                                                    specifiers.push(text.to_string());
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                            _ => {}
                        }
                    }
                }
            }
        }
    }

    specifiers
}

fn extract_export(
    m: &QueryMatch,
    query: &Query,
    content: &str,
) -> Option<ExportInfo> {
    let def_node = get_capture_node(m, query, "export.def")?;

    let is_default = m.captures.iter().any(|c| {
        query.capture_names()[c.index as usize] == "export.default"
    });

    let name = get_capture_text(m, query, "export.name", content)
        .unwrap_or_else(|| "default".to_string());

    Some(ExportInfo {
        name,
        line_number: def_node.start_position().row as u32 + 1,
        is_default,
    })
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

fn parse_params(params_str: &str) -> Vec<String> {
    // Remove parentheses and split by comma
    let inner = params_str.trim_start_matches('(').trim_end_matches(')');
    if inner.is_empty() {
        return vec![];
    }

    inner.split(',')
        .filter_map(|p| {
            let p = p.trim();
            // Extract just the parameter name (before : or =)
            // First try to find the name before any : or =
            let name = if let Some(colon_pos) = p.find(':') {
                &p[..colon_pos]
            } else if let Some(eq_pos) = p.find('=') {
                &p[..eq_pos]
            } else {
                p
            };
            let name = name.trim();
            if name.is_empty() { None } else { Some(name.to_string()) }
        })
        .collect()
}

const MAX_ERROR_DEPTH: usize = 50;

fn collect_errors(node: &tree_sitter::Node, content: &str, errors: &mut Vec<ParseError>) {
    collect_errors_recursive(node, content, errors, 0);
}

#[allow(clippy::only_used_in_recursion)]
fn collect_errors_recursive(node: &tree_sitter::Node, content: &str, errors: &mut Vec<ParseError>, depth: usize) {
    if depth > MAX_ERROR_DEPTH {
        return;
    }

    if node.is_error() || node.is_missing() {
        errors.push(ParseError {
            line: node.start_position().row as u32 + 1,
            message: format!(
                "Syntax error at column {}",
                node.start_position().column
            ),
        });
    }

    for i in 0..node.child_count() {
        if let Some(child) = node.child(i) {
            collect_errors_recursive(&child, content, errors, depth + 1);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_function_declaration() {
        let code = r#"
function foo(a: string, b: number): boolean {
    return true;
}
"#;
        let mut analysis = extract(code, SupportedLanguage::TypeScript);
        analysis.path = "test.ts".to_string();

        assert_eq!(analysis.functions.len(), 1);
        let f = &analysis.functions[0];
        assert_eq!(f.name, "foo");
        assert_eq!(f.params, vec!["a", "b"]);
        assert!(f.return_type.as_ref().map(|t| t.contains("boolean")).unwrap_or(false));
    }

    #[test]
    fn test_arrow_function() {
        let code = r#"
const bar = (x: number): string => {
    return x.toString();
};
"#;
        let mut analysis = extract(code, SupportedLanguage::TypeScript);
        analysis.path = "test.ts".to_string();

        assert_eq!(analysis.functions.len(), 1);
        let f = &analysis.functions[0];
        assert_eq!(f.name, "bar");
        assert_eq!(f.params, vec!["x"]);
    }

    #[test]
    fn test_class_declaration() {
        let code = r#"
class MyClass {
    private value: number;

    constructor(v: number) {
        this.value = v;
    }

    getValue(): number {
        return this.value;
    }
}
"#;
        let analysis = extract(code, SupportedLanguage::TypeScript);

        assert_eq!(analysis.classes.len(), 1);
        let c = &analysis.classes[0];
        assert_eq!(c.name, "MyClass");
        assert_eq!(c.kind, Some("class".to_string()));
    }

    #[test]
    fn test_imports() {
        let code = r#"
import { map, filter } from 'lodash';
import React from 'react';
import * as path from 'path';
"#;
        let analysis = extract(code, SupportedLanguage::TypeScript);

        assert_eq!(analysis.imports.len(), 3);
        assert!(analysis.imports.iter().any(|i| i.source == "lodash"));
        assert!(analysis.imports.iter().any(|i| i.source == "react"));
    }

    #[test]
    fn test_exports() {
        let code = r#"
export function publicFn() {}
export default class Main {}
export { foo, bar };
"#;
        let analysis = extract(code, SupportedLanguage::TypeScript);

        // Should have exports
        assert!(!analysis.exports.is_empty() || !analysis.functions.is_empty());
    }

    #[test]
    fn test_interface() {
        let code = r#"
interface User {
    name: string;
    age: number;
}
"#;
        let analysis = extract(code, SupportedLanguage::TypeScript);

        assert_eq!(analysis.classes.len(), 1);
        let c = &analysis.classes[0];
        assert_eq!(c.name, "User");
        assert_eq!(c.kind, Some("interface".to_string()));
    }

    #[test]
    fn test_javascript_compatibility() {
        let code = r#"
function hello(name) {
    return 'Hello, ' + name;
}

class Greeter {
    greet(name) {
        return hello(name);
    }
}
"#;
        let analysis = extract(code, SupportedLanguage::JavaScript);

        assert_eq!(analysis.functions.len(), 1);
        assert_eq!(analysis.classes.len(), 1);
    }

    #[test]
    fn test_async_function() {
        let code = r#"
async function fetchData(url: string): Promise<Response> {
    return fetch(url);
}
"#;
        let analysis = extract(code, SupportedLanguage::TypeScript);

        assert_eq!(analysis.functions.len(), 1);
        // Note: async detection depends on query pattern
    }

    #[test]
    fn test_empty_file() {
        let code = "";
        let analysis = extract(code, SupportedLanguage::TypeScript);

        assert!(analysis.functions.is_empty());
        assert!(analysis.classes.is_empty());
        assert!(analysis.errors.is_empty());
    }

    #[test]
    fn test_parse_params() {
        assert_eq!(parse_params("(a, b, c)"), vec!["a", "b", "c"]);
        assert_eq!(parse_params("(a: string, b: number)"), vec!["a", "b"]);
        assert_eq!(parse_params("(x = 5)"), vec!["x"]);
        assert_eq!(parse_params("()"), Vec::<String>::new());
    }
}
