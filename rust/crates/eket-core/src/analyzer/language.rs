//! Language detection and grammar management.
//!
//! Uses `OnceLock` for lazy initialization of tree-sitter grammars.

use std::path::Path;
use std::sync::OnceLock;
use tree_sitter::Language;

/// Supported languages for structural analysis.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SupportedLanguage {
    TypeScript,
    Tsx,
    JavaScript,
    Python,
    Rust,
    Go,
}

impl SupportedLanguage {
    /// Get language name as string.
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::TypeScript => "typescript",
            Self::Tsx => "tsx",
            Self::JavaScript => "javascript",
            Self::Python => "python",
            Self::Rust => "rust",
            Self::Go => "go",
        }
    }

    /// Get tree-sitter Language instance (lazy-loaded).
    pub fn grammar(&self) -> &'static Language {
        match self {
            Self::TypeScript => get_ts_language(),
            Self::Tsx => get_tsx_language(),
            Self::JavaScript => get_ts_language(), // JS uses TS parser for compatibility
            Self::Python => get_python_language(),
            Self::Rust => get_rust_language(),
            Self::Go => get_go_language(),
        }
    }
}

// Static language instances with lazy initialization
static TS_LANGUAGE: OnceLock<Language> = OnceLock::new();
static TSX_LANGUAGE: OnceLock<Language> = OnceLock::new();
static PYTHON_LANGUAGE: OnceLock<Language> = OnceLock::new();
static RUST_LANGUAGE: OnceLock<Language> = OnceLock::new();
static GO_LANGUAGE: OnceLock<Language> = OnceLock::new();

fn get_ts_language() -> &'static Language {
    TS_LANGUAGE.get_or_init(|| tree_sitter_typescript::LANGUAGE_TYPESCRIPT.into())
}

fn get_tsx_language() -> &'static Language {
    TSX_LANGUAGE.get_or_init(|| tree_sitter_typescript::LANGUAGE_TSX.into())
}

fn get_python_language() -> &'static Language {
    PYTHON_LANGUAGE.get_or_init(|| tree_sitter_python::LANGUAGE.into())
}

fn get_rust_language() -> &'static Language {
    RUST_LANGUAGE.get_or_init(|| tree_sitter_rust::LANGUAGE.into())
}

fn get_go_language() -> &'static Language {
    GO_LANGUAGE.get_or_init(|| tree_sitter_go::LANGUAGE.into())
}

/// Detect language from file path extension.
///
/// Returns `None` for unsupported extensions.
pub fn detect_language(path: &Path) -> Option<SupportedLanguage> {
    let ext = path.extension()?.to_str()?;
    match ext {
        "ts" => Some(SupportedLanguage::TypeScript),
        "tsx" => Some(SupportedLanguage::Tsx),
        "js" | "mjs" | "cjs" => Some(SupportedLanguage::JavaScript),
        "jsx" => Some(SupportedLanguage::Tsx), // JSX uses TSX parser
        "py" => Some(SupportedLanguage::Python),
        "rs" => Some(SupportedLanguage::Rust),
        "go" => Some(SupportedLanguage::Go),
        _ => None,
    }
}

/// Check if file content appears to be binary (not text).
///
/// Checks first 8KB for null bytes or high non-ASCII ratio.
pub fn is_binary_content(content: &[u8]) -> bool {
    let sample = &content[..content.len().min(8192)];

    // Null byte detection
    if sample.contains(&0) {
        return true;
    }

    // High non-ASCII ratio (> 30% non-printable)
    let non_text = sample
        .iter()
        .filter(|&&b| b < 0x20 && b != b'\n' && b != b'\r' && b != b'\t')
        .count();

    non_text > sample.len() / 3
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_detect_language() {
        assert_eq!(
            detect_language(Path::new("foo.ts")),
            Some(SupportedLanguage::TypeScript)
        );
        assert_eq!(
            detect_language(Path::new("foo.tsx")),
            Some(SupportedLanguage::Tsx)
        );
        assert_eq!(
            detect_language(Path::new("foo.js")),
            Some(SupportedLanguage::JavaScript)
        );
        assert_eq!(
            detect_language(Path::new("foo.mjs")),
            Some(SupportedLanguage::JavaScript)
        );
        assert_eq!(
            detect_language(Path::new("foo.py")),
            Some(SupportedLanguage::Python)
        );
        assert_eq!(
            detect_language(Path::new("foo.rs")),
            Some(SupportedLanguage::Rust)
        );
        assert_eq!(
            detect_language(Path::new("foo.go")),
            Some(SupportedLanguage::Go)
        );
        assert_eq!(detect_language(Path::new("foo.java")), None);
        assert_eq!(detect_language(Path::new("foo")), None);
    }

    #[test]
    fn test_language_as_str() {
        assert_eq!(SupportedLanguage::TypeScript.as_str(), "typescript");
        assert_eq!(SupportedLanguage::Python.as_str(), "python");
    }

    #[test]
    fn test_is_binary_content() {
        assert!(!is_binary_content(b"hello world\nfoo bar"));
        assert!(is_binary_content(b"hello\x00world"));
        assert!(!is_binary_content(
            b"fn main() {\n    println!(\"test\");\n}"
        ));
    }

    #[test]
    fn test_grammar_loading() {
        // Verify grammars load without panicking
        let _ = SupportedLanguage::TypeScript.grammar();
        let _ = SupportedLanguage::Python.grammar();
        let _ = SupportedLanguage::Rust.grammar();
        let _ = SupportedLanguage::Go.grammar();
    }
}
