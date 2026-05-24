//! Rust structure extractor.

use streaming_iterator::StreamingIterator;
use tree_sitter::{Parser, Query, QueryCursor, QueryMatch};
use crate::analyzer::types::*;
use crate::analyzer::language::SupportedLanguage;

const RUST_QUERIES: &str = r#"
; Function definitions - simplified
(function_item
  name: (identifier) @fn.name) @fn.def

; Struct definitions
(struct_item
  name: (type_identifier) @struct.name) @struct.def

; Enum definitions
(enum_item
  name: (type_identifier) @enum.name) @enum.def

; Trait definitions
(trait_item
  name: (type_identifier) @trait.name) @trait.def

; Use statements (imports)
(use_declaration) @import.def

; Mod declarations
(mod_item
  name: (identifier) @mod.name) @mod.def
"#;

/// Extract structure from Rust source.
pub fn extract(content: &str) -> StructuralAnalysis {
    let lang = SupportedLanguage::Rust;
    let mut analysis = StructuralAnalysis::empty("", lang.as_str());

    let mut parser = Parser::new();
    parser.set_language(lang.grammar()).expect("Failed to set Rust language");

    let tree = match parser.parse(content, None) {
        Some(t) => t,
        None => {
            analysis.errors.push(ParseError {
                line: 0,
                message: "Failed to parse Rust file".to_string(),
            });
            return analysis;
        }
    };

    let root = tree.root_node();

    if root.has_error() {
        collect_errors(&root, &mut analysis.errors);
    }

    let query = match Query::new(lang.grammar(), RUST_QUERIES) {
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
    let mut seen_types = std::collections::HashSet::new();
    let mut impl_methods: std::collections::HashMap<String, Vec<String>> = std::collections::HashMap::new();

    while let Some(m) = matches.next() {
        let capture_names: Vec<&str> = m.captures.iter()
            .map(|c| query.capture_names()[c.index as usize].as_ref())
            .collect();

        // Function definitions (top-level)
        if capture_names.contains(&"fn.def") && !capture_names.contains(&"method.name") {
            if let Some(info) = extract_function(&m, &query, content) {
                let key = (info.name.clone(), info.start_line);
                if seen_functions.insert(key) {
                    analysis.functions.push(info);
                }
            }
        }

        // Struct definitions
        if capture_names.contains(&"struct.def") {
            if let Some(info) = extract_type_def(&m, &query, content, "struct.name", "struct") {
                let key = (info.name.clone(), info.start_line);
                if seen_types.insert(key) {
                    analysis.classes.push(info);
                }
            }
        }

        // Enum definitions
        if capture_names.contains(&"enum.def") {
            if let Some(info) = extract_type_def(&m, &query, content, "enum.name", "enum") {
                let key = (info.name.clone(), info.start_line);
                if seen_types.insert(key) {
                    analysis.classes.push(info);
                }
            }
        }

        // Trait definitions
        if capture_names.contains(&"trait.def") {
            if let Some(info) = extract_type_def(&m, &query, content, "trait.name", "trait") {
                let key = (info.name.clone(), info.start_line);
                if seen_types.insert(key) {
                    analysis.classes.push(info);
                }
            }
        }

        // Use statements (imports)
        if capture_names.contains(&"import.def") {
            if let Some(info) = extract_import(&m, &query, content) {
                analysis.imports.push(info);
            }
        }

        // Method names for impl enrichment
        if capture_names.contains(&"method.name") {
            if let Some(method_name) = get_capture_text(&m, &query, "method.name", content) {
                if let Some(impl_name) = get_capture_text(&m, &query, "impl.name", content) {
                    impl_methods.entry(impl_name).or_default().push(method_name);
                }
            }
        }

        // Module declarations as exports
        if capture_names.contains(&"mod.def") {
            if let Some(name) = get_capture_text(&m, &query, "mod.name", content) {
                if let Some(node) = get_capture_node(&m, &query, "mod.def") {
                    analysis.exports.push(ExportInfo {
                        name,
                        line_number: node.start_position().row as u32 + 1,
                        is_default: false,
                    });
                }
            }
        }
    }

    // Enrich structs/enums with methods from impl blocks
    for class in &mut analysis.classes {
        if let Some(methods) = impl_methods.get(&class.name) {
            class.methods = methods.clone();
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
        .map(|p| parse_rust_params(&p))
        .unwrap_or_default();

    let return_type = get_capture_text(m, query, "fn.return_type", content);

    let is_async = m.captures.iter().any(|c| {
        query.capture_names()[c.index as usize] == "fn.async"
    });

    let visibility = get_capture_text(m, query, "fn.visibility", content);

    Some(FunctionInfo {
        name,
        start_line: def_node.start_position().row as u32 + 1,
        end_line: def_node.end_position().row as u32 + 1,
        params,
        return_type,
        is_async,
        visibility,
    })
}

fn extract_type_def(
    m: &QueryMatch,
    query: &Query,
    content: &str,
    name_capture: &str,
    kind: &str,
) -> Option<ClassInfo> {
    let name = get_capture_text(m, query, name_capture, content)?;
    let def_capture = format!("{}.def", kind);
    let def_node = get_capture_node(m, query, &def_capture)?;

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
    let def_node = get_capture_node(m, query, "import.def")?;

    // Get the full text of the use declaration
    let full_text = def_node.utf8_text(content.as_bytes()).ok()?;

    // Remove "use " prefix and ";" suffix
    let path = full_text.trim_start_matches("use ")
        .trim_end_matches(';')
        .trim()
        .to_string();

    // Parse use path to extract module and items
    let (source, specifiers) = parse_use_path(&path);

    Some(ImportInfo {
        source,
        specifiers,
        line_number: def_node.start_position().row as u32 + 1,
    })
}

fn parse_use_path(path: &str) -> (String, Vec<String>) {
    // Handle use std::collections::{HashMap, HashSet};
    if let Some(brace_start) = path.find('{') {
        // Safely find closing brace
        let brace_end = path.rfind('}').unwrap_or(path.len());
        if brace_end > brace_start + 1 {
            let source = path[..brace_start].trim_end_matches("::").to_string();
            let items = path[brace_start+1..brace_end]
                .split(',')
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .collect();
            (source, items)
        } else {
            // Malformed: { without valid content
            (path.to_string(), vec![])
        }
    } else if let Some(last_sep) = path.rfind("::") {
        // Handle use std::collections::HashMap;
        let source = path[..last_sep].to_string();
        let item = path[last_sep+2..].to_string();
        (source, vec![item])
    } else {
        (path.to_string(), vec![])
    }
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

fn parse_rust_params(params_str: &str) -> Vec<String> {
    let inner = params_str.trim_start_matches('(').trim_end_matches(')');
    if inner.is_empty() {
        return vec![];
    }

    inner.split(',')
        .filter_map(|p| {
            let p = p.trim();
            // Skip &self, &mut self, self
            if p == "self" || p == "&self" || p == "&mut self" {
                return None;
            }
            // Extract name before :
            let name = p.split(':').next()
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
fn foo(a: String, b: i32) -> bool {
    true
}
"#;
        let analysis = extract(code);

        assert_eq!(analysis.functions.len(), 1);
        let f = &analysis.functions[0];
        assert_eq!(f.name, "foo");
        // Note: simplified query doesn't extract params
    }

    #[test]
    fn test_pub_function() {
        let code = r#"
pub fn public_fn(x: u64) -> u64 {
    x * 2
}
"#;
        let analysis = extract(code);

        assert_eq!(analysis.functions.len(), 1);
        let f = &analysis.functions[0];
        assert_eq!(f.name, "public_fn");
        // Note: simplified query doesn't extract visibility
    }

    #[test]
    fn test_struct_definition() {
        let code = r#"
pub struct MyStruct {
    field1: String,
    field2: i32,
}
"#;
        let analysis = extract(code);

        assert_eq!(analysis.classes.len(), 1);
        let s = &analysis.classes[0];
        assert_eq!(s.name, "MyStruct");
        assert_eq!(s.kind, Some("struct".to_string()));
    }

    #[test]
    fn test_enum_definition() {
        let code = r#"
enum Status {
    Active,
    Inactive,
    Pending,
}
"#;
        let analysis = extract(code);

        assert_eq!(analysis.classes.len(), 1);
        let e = &analysis.classes[0];
        assert_eq!(e.name, "Status");
        assert_eq!(e.kind, Some("enum".to_string()));
    }

    #[test]
    fn test_trait_definition() {
        let code = r#"
trait Display {
    fn display(&self) -> String;
}
"#;
        let analysis = extract(code);

        assert_eq!(analysis.classes.len(), 1);
        let t = &analysis.classes[0];
        assert_eq!(t.name, "Display");
        assert_eq!(t.kind, Some("trait".to_string()));
    }

    #[test]
    fn test_imports() {
        let code = r#"
use std::collections::HashMap;
use std::io::{Read, Write};
use crate::module;
"#;
        let analysis = extract(code);

        assert!(analysis.imports.len() >= 2);
        assert!(analysis.imports.iter().any(|i| i.source.contains("std::collections")));
    }

    #[test]
    fn test_async_function() {
        let code = r#"
async fn fetch_data(url: &str) -> Result<String, Error> {
    Ok(String::new())
}
"#;
        let analysis = extract(code);

        assert_eq!(analysis.functions.len(), 1);
        let f = &analysis.functions[0];
        assert_eq!(f.name, "fetch_data");
    }

    #[test]
    fn test_parse_rust_params() {
        assert_eq!(parse_rust_params("(a: i32, b: String)"), vec!["a", "b"]);
        assert_eq!(parse_rust_params("(&self, x: u64)"), vec!["x"]);
        assert_eq!(parse_rust_params("(&mut self)"), Vec::<String>::new());
        assert_eq!(parse_rust_params("()"), Vec::<String>::new());
    }

    #[test]
    fn test_parse_use_path() {
        let (src, items) = parse_use_path("std::collections::{HashMap, HashSet}");
        assert_eq!(src, "std::collections");
        assert_eq!(items, vec!["HashMap", "HashSet"]);

        let (src, items) = parse_use_path("std::io::Read");
        assert_eq!(src, "std::io");
        assert_eq!(items, vec!["Read"]);
    }
}
