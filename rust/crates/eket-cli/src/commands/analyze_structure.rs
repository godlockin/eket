//! analyze:structure command - Extract code structure using tree-sitter.
//!
//! TASK-E11-001: Deterministic code structure extraction for Understand-Anything.

use anyhow::Result;
use clap::Args;
use std::path::PathBuf;

use eket_core::analyzer::{analyze_file, SupportedLanguage, StructuralAnalysis};

#[derive(Args)]
pub struct AnalyzeStructureArgs {
    /// Path to file or directory to analyze
    path: PathBuf,

    /// Output file (JSON format). If not specified, outputs to stdout.
    #[arg(short, long)]
    output: Option<PathBuf>,

    /// Force specific language (auto-detected by default)
    #[arg(short, long)]
    language: Option<String>,

    /// Pretty-print JSON output
    #[arg(long, default_value = "true")]
    pretty: bool,
}

pub async fn run(args: AnalyzeStructureArgs) -> Result<()> {
    let path = args.path.canonicalize().unwrap_or(args.path.clone());

    let results = if path.is_dir() {
        analyze_directory(&path, args.language.as_deref())?
    } else {
        vec![analyze_single_file(&path, args.language.as_deref())?]
    };

    // Format output
    let json = if args.pretty {
        serde_json::to_string_pretty(&results)?
    } else {
        serde_json::to_string(&results)?
    };

    // Write output
    if let Some(output_path) = args.output {
        std::fs::write(&output_path, &json)?;
        tracing::info!(output = %output_path.display(), "Wrote analysis results");
    } else {
        println!("{}", json);
    }

    Ok(())
}

fn analyze_single_file(path: &PathBuf, lang_override: Option<&str>) -> Result<StructuralAnalysis> {
    // If language override provided, validate and use
    if let Some(lang_str) = lang_override {
        let lang = parse_language(lang_str)?;
        let content = std::fs::read_to_string(path)?;
        let mut analysis = eket_core::analyzer::analyze_content(&content, lang);
        analysis.path = path.to_string_lossy().to_string();
        return Ok(analysis);
    }

    Ok(analyze_file(path))
}

fn analyze_directory(dir: &PathBuf, lang_override: Option<&str>) -> Result<Vec<StructuralAnalysis>> {
    let mut results = vec![];

    let supported_extensions = ["ts", "tsx", "js", "jsx", "mjs", "cjs", "py", "rs", "go"];

    for entry in walkdir::WalkDir::new(dir)
        .follow_links(true)
        .into_iter()
        .filter_entry(|e| {
            // Skip hidden dirs and common ignore patterns
            let name = e.file_name().to_string_lossy();
            !name.starts_with('.') && name != "node_modules" && name != "target" && name != "__pycache__"
        })
    {
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue,
        };

        if !entry.file_type().is_file() {
            continue;
        }

        // Check extension
        let ext = entry.path().extension()
            .and_then(|e| e.to_str())
            .unwrap_or("");

        if !supported_extensions.contains(&ext) {
            continue;
        }

        let analysis = analyze_single_file(&entry.path().to_path_buf(), lang_override)?;
        results.push(analysis);
    }

    Ok(results)
}

fn parse_language(s: &str) -> Result<SupportedLanguage> {
    match s.to_lowercase().as_str() {
        "typescript" | "ts" => Ok(SupportedLanguage::TypeScript),
        "tsx" => Ok(SupportedLanguage::Tsx),
        "javascript" | "js" => Ok(SupportedLanguage::JavaScript),
        "python" | "py" => Ok(SupportedLanguage::Python),
        "rust" | "rs" => Ok(SupportedLanguage::Rust),
        "go" => Ok(SupportedLanguage::Go),
        _ => anyhow::bail!("Unsupported language: {}. Supported: typescript, javascript, python, rust, go", s),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use tempfile::NamedTempFile;

    #[tokio::test]
    async fn test_analyze_single_file() {
        let mut file = NamedTempFile::with_suffix(".ts").unwrap();
        writeln!(file, "export function greet(name: string): string {{").unwrap();
        writeln!(file, "    return `Hello, ${{name}}!`;").unwrap();
        writeln!(file, "}}").unwrap();

        let analysis = analyze_single_file(&file.path().to_path_buf(), None).unwrap();
        assert_eq!(analysis.functions.len(), 1);
        assert_eq!(analysis.functions[0].name, "greet");
    }

    #[test]
    fn test_parse_language() {
        assert!(matches!(parse_language("typescript"), Ok(SupportedLanguage::TypeScript)));
        assert!(matches!(parse_language("ts"), Ok(SupportedLanguage::TypeScript)));
        assert!(matches!(parse_language("Python"), Ok(SupportedLanguage::Python)));
        assert!(parse_language("java").is_err());
    }
}
