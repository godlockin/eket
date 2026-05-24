//! Hash computation for fingerprints.
//!
//! Two hashes:
//! - content_hash: SHA256 of raw file content (fast, catches any change)
//! - structure_hash: SHA256 of sorted AST signatures (semantic change detection)

use std::collections::BTreeSet;
use std::fs;
use std::io::{BufReader, Read};
use std::path::Path;

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::error::{EketError, EketResult};

// ─── Types ───────────────────────────────────────────────────────────────────

/// Structural information extracted from source code.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct StructuralInfo {
    /// Function signatures: "name(param1, param2)"
    pub functions: Vec<String>,
    /// Class/struct signatures: "ClassName[method1, method2]"
    pub classes: Vec<String>,
    /// Import/use statements
    pub imports: Vec<String>,
    /// Top-level constants/variables
    pub constants: Vec<String>,
}

/// File fingerprint with content and structure hashes.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileFingerprint {
    pub path: String,
    pub content_hash: String,
    pub structure_hash: String,
    pub file_size: u64,
    pub line_count: usize,
    pub analyzed_at: i64, // Unix timestamp
}

// ─── Content Hash ────────────────────────────────────────────────────────────

/// Compute SHA256 hash of file content (streaming for large files).
pub fn compute_content_hash(path: &Path) -> EketResult<String> {
    let file = fs::File::open(path)?;
    let mut reader = BufReader::new(file);
    let mut hasher = Sha256::new();
    let mut buffer = [0u8; 8192];

    loop {
        let bytes_read = reader.read(&mut buffer)?;
        if bytes_read == 0 {
            break;
        }
        hasher.update(&buffer[..bytes_read]);
    }

    Ok(hex::encode(hasher.finalize()))
}

/// Compute SHA256 hash of string content.
pub fn hash_string(content: &str) -> String {
    hex::encode(Sha256::digest(content.as_bytes()))
}

// ─── Structure Hash ──────────────────────────────────────────────────────────

/// Compute structure hash from StructuralInfo using Merkle tree approach.
///
/// Sorts all signatures to ensure order-independence (refactoring doesn't change hash).
pub fn compute_structure_hash(info: &StructuralInfo) -> String {
    // Use BTreeSet for automatic sorting and deduplication
    let mut all_sigs = BTreeSet::new();

    for f in &info.functions {
        all_sigs.insert(format!("fn:{}", f));
    }
    for c in &info.classes {
        all_sigs.insert(format!("class:{}", c));
    }
    for i in &info.imports {
        all_sigs.insert(format!("import:{}", i));
    }
    for c in &info.constants {
        all_sigs.insert(format!("const:{}", c));
    }

    // Merkle-style: hash each signature, then hash the concatenation
    let leaf_hashes: Vec<String> = all_sigs
        .iter()
        .map(|sig| hash_string(sig))
        .collect();

    // If empty, return hash of empty string
    if leaf_hashes.is_empty() {
        return hash_string("");
    }

    // Combine all leaf hashes
    let combined = leaf_hashes.join("|");
    hash_string(&combined)
}

// ─── Fingerprint Computation ─────────────────────────────────────────────────

/// Maximum file size for fingerprinting (10 MB)
const MAX_FILE_SIZE: u64 = 10 * 1024 * 1024;

/// Compute full fingerprint for a file.
///
/// If structural analysis fails, uses content_hash as structure_hash (degraded mode).
/// Returns error for files larger than 10MB.
pub fn compute_fingerprint(path: &Path, info: Option<&StructuralInfo>) -> EketResult<FileFingerprint> {
    // Check file size first to avoid loading large files
    let metadata = fs::metadata(path)?;
    if metadata.len() > MAX_FILE_SIZE {
        return Err(EketError::InvalidInput(format!(
            "File too large: {} bytes (max {} bytes)",
            metadata.len(),
            MAX_FILE_SIZE
        )));
    }

    let content_hash = compute_content_hash(path)?;

    let structure_hash = match info {
        Some(i) => compute_structure_hash(i),
        None => content_hash.clone(), // Degraded: use content hash
    };

    let content = fs::read_to_string(path).unwrap_or_default();
    let line_count = content.lines().count();

    Ok(FileFingerprint {
        path: path.to_string_lossy().to_string(),
        content_hash,
        structure_hash,
        file_size: metadata.len(),
        line_count,
        analyzed_at: chrono::Utc::now().timestamp(),
    })
}

/// Compute fingerprint with automatic structural extraction.
///
/// Uses tree-sitter for supported languages, falls back to content-only.
pub fn compute_fingerprint_auto(path: &Path) -> EketResult<FileFingerprint> {
    let info = extract_structural_info(path).ok();
    compute_fingerprint(path, info.as_ref())
}

// ─── Structural Extraction ───────────────────────────────────────────────────

/// Extract structural info from source file using tree-sitter.
pub fn extract_structural_info(path: &Path) -> EketResult<StructuralInfo> {
    let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");
    let content = fs::read_to_string(path)?;

    match ext {
        "rs" => extract_rust_structure(&content),
        "ts" | "tsx" | "js" | "jsx" => extract_typescript_structure(&content),
        "py" => extract_python_structure(&content),
        "go" => extract_go_structure(&content),
        _ => Err(EketError::InvalidInput(format!(
            "Unsupported file type: {}",
            ext
        ))),
    }
}

/// Extract Rust structure using tree-sitter.
fn extract_rust_structure(content: &str) -> EketResult<StructuralInfo> {
    let mut parser = tree_sitter::Parser::new();
    let language = tree_sitter_rust::LANGUAGE;
    parser
        .set_language(&language.into())
        .map_err(|e| EketError::Other(e.to_string()))?;

    let tree = parser
        .parse(content, None)
        .ok_or_else(|| EketError::Other("Failed to parse Rust".to_string()))?;

    let mut info = StructuralInfo::default();
    let root = tree.root_node();

    extract_rust_node(&root, content, &mut info);

    Ok(info)
}

fn extract_rust_node(node: &tree_sitter::Node, content: &str, info: &mut StructuralInfo) {
    match node.kind() {
        "function_item" | "function_signature_item" => {
            if let Some(name_node) = node.child_by_field_name("name") {
                let name = &content[name_node.byte_range()];
                let params = extract_rust_params(node, content);
                info.functions.push(format!("{}({})", name, params));
            }
        }
        "struct_item" | "enum_item" | "trait_item" | "impl_item" => {
            if let Some(name_node) = node.child_by_field_name("name") {
                let name = &content[name_node.byte_range()];
                let methods = extract_rust_methods(node, content);
                info.classes.push(format!("{}[{}]", name, methods.join(",")));
            }
        }
        "use_declaration" => {
            let use_text = &content[node.byte_range()];
            info.imports.push(use_text.to_string());
        }
        "const_item" | "static_item" => {
            if let Some(name_node) = node.child_by_field_name("name") {
                let name = &content[name_node.byte_range()];
                info.constants.push(name.to_string());
            }
        }
        _ => {}
    }

    // Recurse into children
    let mut cursor = node.walk();
    for child in node.children(&mut cursor) {
        extract_rust_node(&child, content, info);
    }
}

fn extract_rust_params(node: &tree_sitter::Node, content: &str) -> String {
    let mut params = Vec::new();
    if let Some(params_node) = node.child_by_field_name("parameters") {
        let mut cursor = params_node.walk();
        for child in params_node.children(&mut cursor) {
            if child.kind() == "parameter" {
                // Extract type annotation if present
                if let Some(type_node) = child.child_by_field_name("type") {
                    let type_text = &content[type_node.byte_range()];
                    params.push(type_text.to_string());
                }
            }
        }
    }
    params.join(", ")
}

fn extract_rust_methods(node: &tree_sitter::Node, content: &str) -> Vec<String> {
    let mut methods = Vec::new();
    let mut cursor = node.walk();

    for child in node.children(&mut cursor) {
        if child.kind() == "declaration_list" {
            let mut inner_cursor = child.walk();
            for item in child.children(&mut inner_cursor) {
                if item.kind() == "function_item" {
                    if let Some(name_node) = item.child_by_field_name("name") {
                        let name = &content[name_node.byte_range()];
                        methods.push(name.to_string());
                    }
                }
            }
        }
    }

    methods
}

/// Extract TypeScript/JavaScript structure.
fn extract_typescript_structure(content: &str) -> EketResult<StructuralInfo> {
    let mut parser = tree_sitter::Parser::new();
    let language = tree_sitter_typescript::LANGUAGE_TYPESCRIPT;
    parser
        .set_language(&language.into())
        .map_err(|e| EketError::Other(e.to_string()))?;

    let tree = parser
        .parse(content, None)
        .ok_or_else(|| EketError::Other("Failed to parse TypeScript".to_string()))?;

    let mut info = StructuralInfo::default();
    let root = tree.root_node();

    extract_ts_node(&root, content, &mut info);

    Ok(info)
}

fn extract_ts_node(node: &tree_sitter::Node, content: &str, info: &mut StructuralInfo) {
    match node.kind() {
        "function_declaration" | "method_definition" | "arrow_function" => {
            if let Some(name_node) = node.child_by_field_name("name") {
                let name = &content[name_node.byte_range()];
                info.functions.push(name.to_string());
            }
        }
        "class_declaration" | "interface_declaration" => {
            if let Some(name_node) = node.child_by_field_name("name") {
                let name = &content[name_node.byte_range()];
                info.classes.push(name.to_string());
            }
        }
        "import_statement" => {
            let import_text = &content[node.byte_range()];
            info.imports.push(import_text.to_string());
        }
        "lexical_declaration" => {
            // const/let declarations
            let mut cursor = node.walk();
            for child in node.children(&mut cursor) {
                if child.kind() == "variable_declarator" {
                    if let Some(name_node) = child.child_by_field_name("name") {
                        let name = &content[name_node.byte_range()];
                        info.constants.push(name.to_string());
                    }
                }
            }
        }
        _ => {}
    }

    let mut cursor = node.walk();
    for child in node.children(&mut cursor) {
        extract_ts_node(&child, content, info);
    }
}

/// Extract Python structure.
fn extract_python_structure(content: &str) -> EketResult<StructuralInfo> {
    let mut parser = tree_sitter::Parser::new();
    let language = tree_sitter_python::LANGUAGE;
    parser
        .set_language(&language.into())
        .map_err(|e| EketError::Other(e.to_string()))?;

    let tree = parser
        .parse(content, None)
        .ok_or_else(|| EketError::Other("Failed to parse Python".to_string()))?;

    let mut info = StructuralInfo::default();
    let root = tree.root_node();

    extract_py_node(&root, content, &mut info);

    Ok(info)
}

fn extract_py_node(node: &tree_sitter::Node, content: &str, info: &mut StructuralInfo) {
    match node.kind() {
        "function_definition" => {
            if let Some(name_node) = node.child_by_field_name("name") {
                let name = &content[name_node.byte_range()];
                info.functions.push(name.to_string());
            }
        }
        "class_definition" => {
            if let Some(name_node) = node.child_by_field_name("name") {
                let name = &content[name_node.byte_range()];
                info.classes.push(name.to_string());
            }
        }
        "import_statement" | "import_from_statement" => {
            let import_text = &content[node.byte_range()];
            info.imports.push(import_text.to_string());
        }
        "assignment" => {
            // Top-level assignments as constants
            if node.parent().map_or(false, |p| p.kind() == "module") {
                if let Some(left) = node.child_by_field_name("left") {
                    if left.kind() == "identifier" {
                        let name = &content[left.byte_range()];
                        info.constants.push(name.to_string());
                    }
                }
            }
        }
        _ => {}
    }

    let mut cursor = node.walk();
    for child in node.children(&mut cursor) {
        extract_py_node(&child, content, info);
    }
}

/// Extract Go structure.
fn extract_go_structure(content: &str) -> EketResult<StructuralInfo> {
    let mut parser = tree_sitter::Parser::new();
    let language = tree_sitter_go::LANGUAGE;
    parser
        .set_language(&language.into())
        .map_err(|e| EketError::Other(e.to_string()))?;

    let tree = parser
        .parse(content, None)
        .ok_or_else(|| EketError::Other("Failed to parse Go".to_string()))?;

    let mut info = StructuralInfo::default();
    let root = tree.root_node();

    extract_go_node(&root, content, &mut info);

    Ok(info)
}

fn extract_go_node(node: &tree_sitter::Node, content: &str, info: &mut StructuralInfo) {
    match node.kind() {
        "function_declaration" | "method_declaration" => {
            if let Some(name_node) = node.child_by_field_name("name") {
                let name = &content[name_node.byte_range()];
                info.functions.push(name.to_string());
            }
        }
        "type_declaration" => {
            let mut cursor = node.walk();
            for child in node.children(&mut cursor) {
                if child.kind() == "type_spec" {
                    if let Some(name_node) = child.child_by_field_name("name") {
                        let name = &content[name_node.byte_range()];
                        info.classes.push(name.to_string());
                    }
                }
            }
        }
        "import_declaration" => {
            let import_text = &content[node.byte_range()];
            info.imports.push(import_text.to_string());
        }
        "const_declaration" | "var_declaration" => {
            let mut cursor = node.walk();
            for child in node.children(&mut cursor) {
                if child.kind() == "const_spec" || child.kind() == "var_spec" {
                    if let Some(name_node) = child.child_by_field_name("name") {
                        let name = &content[name_node.byte_range()];
                        info.constants.push(name.to_string());
                    }
                }
            }
        }
        _ => {}
    }

    let mut cursor = node.walk();
    for child in node.children(&mut cursor) {
        extract_go_node(&child, content, info);
    }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn test_content_hash_deterministic() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("test.txt");
        fs::write(&path, "hello world").unwrap();

        let hash1 = compute_content_hash(&path).unwrap();
        let hash2 = compute_content_hash(&path).unwrap();
        assert_eq!(hash1, hash2);
        assert_eq!(hash1.len(), 64); // SHA256 hex
    }

    #[test]
    fn test_structure_hash_order_independent() {
        let info1 = StructuralInfo {
            functions: vec!["foo()".to_string(), "bar()".to_string()],
            ..Default::default()
        };
        let info2 = StructuralInfo {
            functions: vec!["bar()".to_string(), "foo()".to_string()],
            ..Default::default()
        };

        let hash1 = compute_structure_hash(&info1);
        let hash2 = compute_structure_hash(&info2);
        assert_eq!(hash1, hash2, "Order should not affect structure hash");
    }

    #[test]
    fn test_structure_hash_different_content() {
        let info1 = StructuralInfo {
            functions: vec!["foo()".to_string()],
            ..Default::default()
        };
        let info2 = StructuralInfo {
            functions: vec!["foo(x: i32)".to_string()],
            ..Default::default()
        };

        let hash1 = compute_structure_hash(&info1);
        let hash2 = compute_structure_hash(&info2);
        assert_ne!(hash1, hash2, "Different params should change hash");
    }

    #[test]
    fn test_extract_rust_structure() {
        let code = r#"
use std::path::Path;

const MAX_SIZE: usize = 100;

fn foo(x: i32) -> i32 {
    x + 1
}

struct MyStruct {
    field: String,
}

impl MyStruct {
    fn new() -> Self {
        Self { field: String::new() }
    }
}
"#;
        let info = extract_rust_structure(code).unwrap();
        assert!(info.functions.iter().any(|f| f.contains("foo")));
        assert!(info.classes.iter().any(|c| c.contains("MyStruct")));
        assert!(!info.imports.is_empty());
        assert!(info.constants.iter().any(|c| c == "MAX_SIZE"));
    }

    #[test]
    fn test_extract_typescript_structure() {
        let code = r#"
import { foo } from './foo';

const MAX_SIZE = 100;

function bar(x: number): number {
    return x + 1;
}

class MyClass {
    method() {}
}
"#;
        let info = extract_typescript_structure(code).unwrap();
        assert!(info.functions.iter().any(|f| f.contains("bar")));
        assert!(info.classes.iter().any(|c| c.contains("MyClass")));
        assert!(!info.imports.is_empty());
    }

    #[test]
    fn test_extract_python_structure() {
        let code = r#"
import os
from pathlib import Path

MAX_SIZE = 100

def foo(x):
    return x + 1

class MyClass:
    def method(self):
        pass
"#;
        let info = extract_python_structure(code).unwrap();
        assert!(info.functions.iter().any(|f| f == "foo"));
        assert!(info.classes.iter().any(|c| c == "MyClass"));
        assert!(info.imports.len() >= 2);
    }

    #[test]
    fn test_compute_fingerprint() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("test.rs");
        fs::write(&path, "fn main() {}").unwrap();

        let fp = compute_fingerprint_auto(&path).unwrap();
        assert!(!fp.content_hash.is_empty());
        assert!(!fp.structure_hash.is_empty());
        assert!(fp.file_size > 0);
        assert!(fp.line_count > 0);
    }
}
