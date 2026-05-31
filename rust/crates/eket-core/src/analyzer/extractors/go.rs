//! Go structure extractor.

use crate::analyzer::language::SupportedLanguage;
use crate::analyzer::types::*;
use streaming_iterator::StreamingIterator;
use tree_sitter::{Parser, Query, QueryCursor, QueryMatch};

const GO_QUERIES: &str = r#"
; Function declarations
(function_declaration
  name: (identifier) @fn.name
  parameters: (parameter_list) @fn.params
  result: (_)? @fn.return_type) @fn.def

; Method declarations
(method_declaration
  receiver: (parameter_list) @method.receiver
  name: (field_identifier) @method.name
  parameters: (parameter_list) @method.params) @method.def

; Type declarations (struct)
(type_declaration
  (type_spec
    name: (type_identifier) @struct.name
    type: (struct_type))) @struct.def

; Type declarations (interface)
(type_declaration
  (type_spec
    name: (type_identifier) @interface.name
    type: (interface_type))) @interface.def

; Import declarations
(import_declaration
  (import_spec
    path: (interpreted_string_literal) @import.path)) @import.def

; Import group
(import_declaration
  (import_spec_list
    (import_spec
      path: (interpreted_string_literal) @import.path))) @import.def

; Package declaration (for context)
(package_clause
  (package_identifier) @package.name)
"#;

/// Extract structure from Go source.
pub fn extract(content: &str) -> StructuralAnalysis {
    let lang = SupportedLanguage::Go;
    let mut analysis = StructuralAnalysis::empty("", lang.as_str());

    let mut parser = Parser::new();
    parser
        .set_language(lang.grammar())
        .expect("Failed to set Go language");

    let tree = match parser.parse(content, None) {
        Some(t) => t,
        None => {
            analysis.errors.push(ParseError {
                line: 0,
                message: "Failed to parse Go file".to_string(),
            });
            return analysis;
        }
    };

    let root = tree.root_node();

    if root.has_error() {
        collect_errors(&root, &mut analysis.errors);
    }

    let query = match Query::new(lang.grammar(), GO_QUERIES) {
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
    let mut type_methods: std::collections::HashMap<String, Vec<String>> =
        std::collections::HashMap::new();

    while let Some(m) = matches.next() {
        let capture_names: Vec<&str> = m
            .captures
            .iter()
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

        // Method declarations
        if capture_names.contains(&"method.def") {
            if let Some((receiver_type, method_name)) = extract_method_info(m, &query, content) {
                type_methods
                    .entry(receiver_type)
                    .or_default()
                    .push(method_name);
            }
        }

        // Struct definitions
        if capture_names.contains(&"struct.def") {
            if let Some(info) = extract_type_def(m, &query, content, "struct.name", "struct") {
                let key = (info.name.clone(), info.start_line);
                if seen_types.insert(key) {
                    analysis.classes.push(info);
                }
            }
        }

        // Interface definitions
        if capture_names.contains(&"interface.def") {
            if let Some(info) = extract_type_def(m, &query, content, "interface.name", "interface")
            {
                let key = (info.name.clone(), info.start_line);
                if seen_types.insert(key) {
                    analysis.classes.push(info);
                }
            }
        }

        // Import declarations
        if capture_names.contains(&"import.def") {
            if let Some(info) = extract_import(m, &query, content) {
                analysis.imports.push(info);
            }
        }
    }

    // Enrich types with methods
    for class in &mut analysis.classes {
        if let Some(methods) = type_methods.get(&class.name) {
            class.methods = methods.clone();
        }
        // Also check pointer receiver (*Type)
        let ptr_name = format!("*{}", class.name);
        if let Some(methods) = type_methods.get(&ptr_name) {
            class.methods.extend(methods.clone());
        }
    }

    // Exported functions/types (starts with uppercase)
    for func in &analysis.functions {
        if func
            .name
            .chars()
            .next()
            .map(|c| c.is_uppercase())
            .unwrap_or(false)
        {
            analysis.exports.push(ExportInfo {
                name: func.name.clone(),
                line_number: func.start_line,
                is_default: false,
            });
        }
    }

    for class in &analysis.classes {
        if class
            .name
            .chars()
            .next()
            .map(|c| c.is_uppercase())
            .unwrap_or(false)
        {
            analysis.exports.push(ExportInfo {
                name: class.name.clone(),
                line_number: class.start_line,
                is_default: false,
            });
        }
    }

    analysis.compute_metrics(content);
    analysis
}

fn extract_function(m: &QueryMatch, query: &Query, content: &str) -> Option<FunctionInfo> {
    let name = get_capture_text(m, query, "fn.name", content)?;
    let def_node = get_capture_node(m, query, "fn.def")?;

    let params = get_capture_text(m, query, "fn.params", content)
        .map(|p| parse_go_params(&p))
        .unwrap_or_default();

    let return_type = get_capture_text(m, query, "fn.return_type", content);

    // Go functions starting with uppercase are exported (public)
    let visibility = if name
        .chars()
        .next()
        .map(|c| c.is_uppercase())
        .unwrap_or(false)
    {
        Some("public".to_string())
    } else {
        Some("private".to_string())
    };

    Some(FunctionInfo {
        name,
        start_line: def_node.start_position().row as u32 + 1,
        end_line: def_node.end_position().row as u32 + 1,
        params,
        return_type,
        is_async: false, // Go uses goroutines, not async/await
        visibility,
    })
}

fn extract_method_info(m: &QueryMatch, query: &Query, content: &str) -> Option<(String, String)> {
    let method_name = get_capture_text(m, query, "method.name", content)?;
    let receiver = get_capture_text(m, query, "method.receiver", content)?;

    // Parse receiver to get type name: (r *Repo) -> *Repo or (r Repo) -> Repo
    let receiver_type = parse_receiver_type(&receiver);

    Some((receiver_type, method_name))
}

fn parse_receiver_type(receiver: &str) -> String {
    // (r *Type) or (r Type)
    let inner = receiver.trim_start_matches('(').trim_end_matches(')');
    let parts: Vec<&str> = inner.split_whitespace().collect();
    if parts.len() >= 2 {
        parts[1].to_string()
    } else if parts.len() == 1 {
        parts[0].to_string()
    } else {
        String::new()
    }
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

fn extract_import(m: &QueryMatch, query: &Query, content: &str) -> Option<ImportInfo> {
    let path = get_capture_text(m, query, "import.path", content)?;
    let def_node = get_capture_node(m, query, "import.def")?;

    // Clean path (remove quotes)
    let source = path.trim_matches('"').to_string();

    // Extract package name from path (last component)
    let specifiers = source
        .split('/')
        .next_back()
        .map(|s| vec![s.to_string()])
        .unwrap_or_default();

    Some(ImportInfo {
        source,
        specifiers,
        line_number: def_node.start_position().row as u32 + 1,
    })
}

fn get_capture_text(m: &QueryMatch, query: &Query, name: &str, content: &str) -> Option<String> {
    m.captures
        .iter()
        .find(|c| query.capture_names()[c.index as usize] == name)
        .and_then(|c| c.node.utf8_text(content.as_bytes()).ok())
        .map(|s| s.to_string())
}

fn get_capture_node<'a>(
    m: &'a QueryMatch<'a, 'a>,
    query: &Query,
    name: &str,
) -> Option<tree_sitter::Node<'a>> {
    m.captures
        .iter()
        .find(|c| query.capture_names()[c.index as usize] == name)
        .map(|c| c.node)
}

fn parse_go_params(params_str: &str) -> Vec<String> {
    let inner = params_str.trim_start_matches('(').trim_end_matches(')');
    if inner.is_empty() {
        return vec![];
    }

    // Go parameter syntax: name type, name type, ...
    // or name, name type (multiple params same type)
    inner
        .split(',')
        .filter_map(|p| {
            let p = p.trim();
            // First token is the name
            let name = p.split_whitespace().next().filter(|s| !s.is_empty())?;
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
    fn test_function_declaration() {
        let code = r#"
package main

func Add(a int, b int) int {
    return a + b
}
"#;
        let analysis = extract(code);

        assert_eq!(analysis.functions.len(), 1);
        let f = &analysis.functions[0];
        assert_eq!(f.name, "Add");
        assert_eq!(f.params, vec!["a", "b"]);
        assert_eq!(f.visibility, Some("public".to_string()));
    }

    #[test]
    fn test_private_function() {
        let code = r#"
package main

func helper(x int) int {
    return x * 2
}
"#;
        let analysis = extract(code);

        assert_eq!(analysis.functions.len(), 1);
        let f = &analysis.functions[0];
        assert_eq!(f.name, "helper");
        assert_eq!(f.visibility, Some("private".to_string()));
    }

    #[test]
    fn test_struct_definition() {
        let code = r#"
package main

type User struct {
    Name string
    Age  int
}
"#;
        let analysis = extract(code);

        assert_eq!(analysis.classes.len(), 1);
        let s = &analysis.classes[0];
        assert_eq!(s.name, "User");
        assert_eq!(s.kind, Some("struct".to_string()));
    }

    #[test]
    fn test_interface_definition() {
        let code = r#"
package main

type Reader interface {
    Read(p []byte) (n int, err error)
}
"#;
        let analysis = extract(code);

        assert_eq!(analysis.classes.len(), 1);
        let i = &analysis.classes[0];
        assert_eq!(i.name, "Reader");
        assert_eq!(i.kind, Some("interface".to_string()));
    }

    #[test]
    fn test_imports() {
        let code = r#"
package main

import (
    "fmt"
    "net/http"
)
"#;
        let analysis = extract(code);

        assert!(analysis.imports.len() >= 1);
        assert!(analysis
            .imports
            .iter()
            .any(|i| i.source == "fmt" || i.source == "net/http"));
    }

    #[test]
    fn test_exports() {
        let code = r#"
package main

func PublicFunc() {}
func privateFunc() {}

type PublicType struct {}
type privateType struct {}
"#;
        let analysis = extract(code);

        // Should have 2 exports (PublicFunc and PublicType)
        assert_eq!(analysis.exports.len(), 2);
        assert!(analysis.exports.iter().any(|e| e.name == "PublicFunc"));
        assert!(analysis.exports.iter().any(|e| e.name == "PublicType"));
    }

    #[test]
    fn test_parse_go_params() {
        assert_eq!(parse_go_params("(a int, b string)"), vec!["a", "b"]);
        assert_eq!(parse_go_params("(x, y int)"), vec!["x", "y"]);
        assert_eq!(parse_go_params("()"), Vec::<String>::new());
    }

    #[test]
    fn test_parse_receiver_type() {
        assert_eq!(parse_receiver_type("(r *Repo)"), "*Repo");
        assert_eq!(parse_receiver_type("(s Server)"), "Server");
    }
}
