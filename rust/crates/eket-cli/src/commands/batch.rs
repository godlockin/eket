// batch.rs: 批次计算 CLI 命令
// TASK-E11-002: eket batch:compute 和 eket batch:info

use anyhow::{Context, Result};
use clap::Args;
use std::collections::HashMap;
use std::path::PathBuf;

use eket_core::batch::{compute_batches, BatchConfig, BatchOutput, FileEntry};

// ───────────────────────── batch:compute ─────────────────────────

#[derive(Args, Debug)]
pub struct BatchComputeArgs {
    /// 要分析的目录路径
    pub path: PathBuf,

    /// 输出文件路径（默认 stdout）
    #[arg(long, short = 'o')]
    pub output: Option<PathBuf>,

    /// 每批最大节点数
    #[arg(long, default_value = "60")]
    pub max_nodes: usize,

    /// 每批最大边数
    #[arg(long, default_value = "120")]
    pub max_edges: usize,

    /// 输入文件 JSON（包含 FileEntry 数组），跳过目录扫描
    #[arg(long)]
    pub input: Option<PathBuf>,
}

/// 运行 batch:compute 命令
pub async fn run_compute(args: BatchComputeArgs) -> Result<()> {
    let files = if let Some(input_path) = &args.input {
        // 从 JSON 文件读取
        let content = std::fs::read_to_string(input_path)
            .with_context(|| format!("Failed to read input file: {}", input_path.display()))?;
        serde_json::from_str::<Vec<FileEntry>>(&content)
            .with_context(|| "Failed to parse input JSON as FileEntry array")?
    } else {
        // 扫描目录
        scan_directory(&args.path)?
    };

    let config = BatchConfig {
        max_nodes: args.max_nodes,
        max_edges: args.max_edges,
    };

    let output = compute_batches(files, config);

    let json = serde_json::to_string_pretty(&output).context("Failed to serialize batch output")?;

    if let Some(output_path) = &args.output {
        // 确保父目录存在
        if let Some(parent) = output_path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        std::fs::write(output_path, &json)
            .with_context(|| format!("Failed to write output file: {}", output_path.display()))?;
        println!("Batch output written to: {}", output_path.display());
    } else {
        println!("{json}");
    }

    // 摘要信息
    eprintln!(
        "\n[Summary] total_batches={}, total_files={}, avg_files_per_batch={:.1}",
        output.total_batches,
        output.total_files,
        if output.total_batches > 0 {
            output.total_files as f64 / output.total_batches as f64
        } else {
            0.0
        }
    );

    Ok(())
}

/// 扫描目录获取文件列表（简化版，实际应集成结构分析）
fn scan_directory(path: &PathBuf) -> Result<Vec<FileEntry>> {
    let mut files = Vec::new();

    // 支持的代码文件扩展名
    let code_extensions = [
        "rs", "ts", "tsx", "js", "jsx", "py", "go", "java", "kt", "c", "cpp", "h", "hpp", "cs",
        "rb", "php", "swift",
    ];

    fn walk_dir(
        dir: &std::path::Path,
        base: &std::path::Path,
        files: &mut Vec<FileEntry>,
        extensions: &[&str],
    ) -> Result<()> {
        if !dir.is_dir() {
            return Ok(());
        }

        for entry in std::fs::read_dir(dir)? {
            let entry = entry?;
            let path = entry.path();

            // 跳过隐藏目录和 node_modules/target 等
            let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
            if name.starts_with('.') || name == "node_modules" || name == "target" || name == "dist"
            {
                continue;
            }

            if path.is_dir() {
                walk_dir(&path, base, files, extensions)?;
            } else if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
                if extensions.contains(&ext) {
                    let relative_path = path
                        .strip_prefix(base)
                        .unwrap_or(&path)
                        .to_string_lossy()
                        .to_string();

                    // 简单的行数统计
                    let size_lines = std::fs::read_to_string(&path)
                        .map(|content| content.lines().count() as u32)
                        .unwrap_or(0);

                    // 简单的导入提取（仅示例，实际应使用 tree-sitter）
                    let imports = extract_imports(&path, ext);

                    files.push(FileEntry {
                        path: relative_path,
                        language: Some(ext.to_string()),
                        size_lines,
                        imports,
                        exports: vec![], // 需要结构分析提供
                    });
                }
            }
        }
        Ok(())
    }

    walk_dir(path, path, &mut files, &code_extensions)?;

    // 按路径排序保持确定性
    files.sort_by(|a, b| a.path.cmp(&b.path));

    Ok(files)
}

/// 简单的导入提取（启发式，实际应使用 tree-sitter）
fn extract_imports(path: &PathBuf, ext: &str) -> Vec<String> {
    let content = match std::fs::read_to_string(path) {
        Ok(c) => c,
        Err(_) => return vec![],
    };

    let mut imports = Vec::new();
    let base_dir = path.parent().unwrap_or(std::path::Path::new(""));

    for line in content.lines() {
        let line = line.trim();

        match ext {
            "rs" => {
                // Rust: mod xxx; use crate::xxx;
                if let Some(rest) = line.strip_prefix("mod ") {
                    if let Some(name) = rest.strip_suffix(';') {
                        let name = name.trim();
                        // 构造相对路径
                        let import_path = format!("{}/{}.rs", base_dir.display(), name);
                        imports.push(import_path);
                    }
                }
            }
            "ts" | "tsx" | "js" | "jsx" => {
                // JS/TS: import ... from '...'
                if line.starts_with("import ") {
                    if let Some(from_idx) = line.find("from ") {
                        let rest = &line[from_idx + 5..];
                        let quote_char = if rest.starts_with('\'') { '\'' } else { '"' };
                        if let Some(start) = rest.find(quote_char) {
                            if let Some(end) = rest[start + 1..].find(quote_char) {
                                let import_path = &rest[start + 1..start + 1 + end];
                                // 相对路径
                                if import_path.starts_with("./") || import_path.starts_with("../") {
                                    imports.push(import_path.to_string());
                                }
                            }
                        }
                    }
                }
            }
            "py" => {
                // Python: from xxx import yyy / import xxx
                if line.starts_with("from ") || line.starts_with("import ") {
                    // 简化：只记录模块名
                    let parts: Vec<&str> = line.split_whitespace().collect();
                    if parts.len() >= 2 {
                        let module = parts[1].split('.').next().unwrap_or("");
                        if !module.is_empty() {
                            imports.push(module.to_string());
                        }
                    }
                }
            }
            _ => {}
        }
    }

    imports
}

// ───────────────────────── batch:info ─────────────────────────

#[derive(Args, Debug)]
pub struct BatchInfoArgs {
    /// 批次 JSON 文件路径
    pub file: PathBuf,

    /// 显示详细信息
    #[arg(long, short = 'v')]
    pub verbose: bool,
}

/// 运行 batch:info 命令
pub async fn run_info(args: BatchInfoArgs) -> Result<()> {
    let content = std::fs::read_to_string(&args.file)
        .with_context(|| format!("Failed to read batch file: {}", args.file.display()))?;

    let output: BatchOutput =
        serde_json::from_str(&content).with_context(|| "Failed to parse batch JSON")?;

    println!("Batch Analysis Summary");
    println!("======================");
    println!("Total Batches: {}", output.total_batches);
    println!("Total Files:   {}", output.total_files);
    println!();

    if output.total_batches > 0 {
        let avg = output.total_files as f64 / output.total_batches as f64;
        println!("Average Files per Batch: {:.1}", avg);
        println!();
    }

    // 统计 neighborMap
    let mut total_neighbors = 0;
    let mut batches_with_neighbors = 0;

    for batch in &output.batches {
        if !batch.neighbor_map.is_empty() {
            batches_with_neighbors += 1;
            total_neighbors += batch.neighbor_map.len();
        }
    }

    println!("Cross-batch Dependencies:");
    println!(
        "  Batches with neighbors: {}/{}",
        batches_with_neighbors, output.total_batches
    );
    println!("  Total neighbor entries: {}", total_neighbors);
    println!();

    if args.verbose {
        println!("Batch Details:");
        println!("--------------");
        for batch in &output.batches {
            println!(
                "Batch #{}: {} files, {} imports, {} neighbors",
                batch.batch_index,
                batch.files.len(),
                batch.batch_import_data.len(),
                batch.neighbor_map.len()
            );

            if !batch.neighbor_map.is_empty() {
                println!("  Neighbors:");
                for (path, info) in &batch.neighbor_map {
                    println!(
                        "    - {} (batch #{}, {} symbols)",
                        path,
                        info.batch_index,
                        info.symbols.len()
                    );
                }
            }
        }
    }

    Ok(())
}

// ───────────────────────── Tests ─────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn test_extract_imports_rust() {
        let dir = TempDir::new().unwrap();
        let file_path = dir.path().join("test.rs");
        std::fs::write(&file_path, "mod utils;\nmod config;").unwrap();

        let imports = extract_imports(&file_path, "rs");
        assert_eq!(imports.len(), 2);
    }

    #[test]
    fn test_extract_imports_typescript() {
        let dir = TempDir::new().unwrap();
        let file_path = dir.path().join("test.ts");
        std::fs::write(
            &file_path,
            "import { foo } from './utils';\nimport bar from '../config';",
        )
        .unwrap();

        let imports = extract_imports(&file_path, "ts");
        assert_eq!(imports.len(), 2);
        assert!(imports.contains(&"./utils".to_string()));
        assert!(imports.contains(&"../config".to_string()));
    }
}
