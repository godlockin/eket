// neighbor_map.rs: 跨批次依赖计算
// TASK-E11-002: Phase 1 MVP

use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};

use super::splitter::FileEntry;

// ───────────────────────── Constants ─────────────────────────

/// neighborMap 中每个邻居的最大符号数
pub const MAX_SYMBOLS_PER_NEIGHBOR: usize = 20;

// ───────────────────────── Data Types ─────────────────────────

/// 符号引用
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SymbolRef {
    pub name: String,
    pub kind: SymbolKind,
    pub line: u32,
}

/// 符号类型
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SymbolKind {
    Function,
    Class,
    Struct,
    Trait,
    Interface,
    Const,
    Type,
    Enum,
    Module,
    Unknown,
}

/// 依赖边类型
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
#[derive(Default)]
pub enum EdgeType {
    #[default]
    Import, // A imports B
    Extend,    // A extends B (class inheritance)
    Implement, // A implements B (interface)
    Use,       // A uses B (generic reference)
}

/// 跨批次邻居信息
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct NeighborInfo {
    pub path: String,
    pub batch_index: u32,
    /// 导出的符号（上限 MAX_SYMBOLS_PER_NEIGHBOR）
    pub symbols: Vec<SymbolRef>,
    /// 边类型
    #[serde(default)]
    pub edge_type: EdgeType,
}

// ───────────────────────── Algorithm ─────────────────────────

/// 计算当前批次的 neighborMap
///
/// - `batch_files`: 当前批次的文件
/// - `batch_index`: 当前批次索引
/// - `file_to_batch`: 全局文件路径 -> 批次索引映射
/// - `all_files`: 所有文件
/// - `batch_file_paths`: 当前批次文件路径集合
pub fn compute_neighbor_map(
    batch_files: &[FileEntry],
    batch_index: u32,
    file_to_batch: &HashMap<String, u32>,
    all_files: &[FileEntry],
    batch_file_paths: &HashSet<String>,
) -> HashMap<String, NeighborInfo> {
    let mut neighbors: HashMap<String, NeighborInfo> = HashMap::new();

    // 遍历当前批次所有文件的导入
    for file in batch_files {
        for imported_path in &file.imports {
            // 检查是否在其他批次
            if batch_file_paths.contains(imported_path) {
                continue; // 同批次内，跳过
            }

            if let Some(&other_batch_idx) = file_to_batch.get(imported_path) {
                if other_batch_idx != batch_index {
                    // 跨批次依赖
                    if !neighbors.contains_key(imported_path) {
                        // 查找目标文件获取导出符号
                        let symbols = get_file_exports(imported_path, all_files);

                        neighbors.insert(
                            imported_path.clone(),
                            NeighborInfo {
                                path: imported_path.clone(),
                                batch_index: other_batch_idx,
                                symbols,
                                edge_type: EdgeType::Import,
                            },
                        );
                    }
                }
            }
        }
    }

    neighbors
}

/// 获取文件导出的符号（上限截断）
fn get_file_exports(path: &str, all_files: &[FileEntry]) -> Vec<SymbolRef> {
    let file = all_files.iter().find(|f| f.path == path);

    match file {
        Some(f) => {
            f.exports
                .iter()
                .take(MAX_SYMBOLS_PER_NEIGHBOR)
                .map(|name| SymbolRef {
                    name: name.clone(),
                    kind: guess_symbol_kind(name),
                    line: 0, // 暂无行号信息
                })
                .collect()
        }
        None => vec![],
    }
}

/// 根据符号名猜测类型（简化启发式）
fn guess_symbol_kind(name: &str) -> SymbolKind {
    // 全大写+下划线 → 常量 (优先检查)
    if name.chars().all(|c| c.is_uppercase() || c == '_') && name.contains('_') {
        return SymbolKind::Const;
    }

    if name
        .chars()
        .next()
        .map(|c| c.is_uppercase())
        .unwrap_or(false)
    {
        // 大写开头可能是类型/类/结构体
        if name.ends_with("Error") || name.ends_with("Exception") {
            SymbolKind::Class
        } else if name.starts_with("I")
            && name.len() > 1
            && name
                .chars()
                .nth(1)
                .map(|c| c.is_uppercase())
                .unwrap_or(false)
        {
            SymbolKind::Interface
        } else {
            SymbolKind::Struct
        }
    } else {
        // Both use_* hooks and other functions are Function kind
        SymbolKind::Function
    }
}

// ───────────────────────── Tests ─────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn make_file(path: &str, imports: Vec<&str>, exports: Vec<&str>) -> FileEntry {
        FileEntry {
            path: path.to_string(),
            language: Some("rust".to_string()),
            size_lines: 100,
            imports: imports.into_iter().map(String::from).collect(),
            exports: exports.into_iter().map(String::from).collect(),
        }
    }

    #[test]
    fn test_neighbor_map_basic() {
        let all_files = vec![
            make_file("src/core/a.rs", vec!["src/utils/logger.rs"], vec!["main"]),
            make_file("src/core/b.rs", vec![], vec!["helper"]),
            make_file(
                "src/utils/logger.rs",
                vec![],
                vec!["info", "error", "Logger"],
            ),
        ];

        let batch_files = vec![all_files[0].clone(), all_files[1].clone()];
        let batch_file_paths: HashSet<String> =
            batch_files.iter().map(|f| f.path.clone()).collect();

        let file_to_batch: HashMap<String, u32> = vec![
            ("src/core/a.rs".to_string(), 0),
            ("src/core/b.rs".to_string(), 0),
            ("src/utils/logger.rs".to_string(), 1),
        ]
        .into_iter()
        .collect();

        let neighbor_map = compute_neighbor_map(
            &batch_files,
            0,
            &file_to_batch,
            &all_files,
            &batch_file_paths,
        );

        assert!(neighbor_map.contains_key("src/utils/logger.rs"));
        let neighbor = &neighbor_map["src/utils/logger.rs"];
        assert_eq!(neighbor.batch_index, 1);
        assert_eq!(neighbor.symbols.len(), 3);
        assert!(neighbor.symbols.iter().any(|s| s.name == "Logger"));
    }

    #[test]
    fn test_neighbor_map_no_cross_batch() {
        // 所有依赖都在同一批次内
        let all_files = vec![
            make_file("src/a.rs", vec!["src/b.rs"], vec!["main"]),
            make_file("src/b.rs", vec![], vec!["helper"]),
        ];

        let batch_files = all_files.clone();
        let batch_file_paths: HashSet<String> =
            batch_files.iter().map(|f| f.path.clone()).collect();

        let file_to_batch: HashMap<String, u32> =
            vec![("src/a.rs".to_string(), 0), ("src/b.rs".to_string(), 0)]
                .into_iter()
                .collect();

        let neighbor_map = compute_neighbor_map(
            &batch_files,
            0,
            &file_to_batch,
            &all_files,
            &batch_file_paths,
        );

        assert!(neighbor_map.is_empty(), "No cross-batch dependencies");
    }

    #[test]
    fn test_symbol_truncation() {
        // 测试符号数量上限
        let exports: Vec<&str> = (0..30)
            .map(|i| {
                // 这里需要静态字符串，简化处理
                match i {
                    0 => "sym0",
                    1 => "sym1",
                    2 => "sym2",
                    3 => "sym3",
                    4 => "sym4",
                    5 => "sym5",
                    6 => "sym6",
                    7 => "sym7",
                    8 => "sym8",
                    9 => "sym9",
                    10 => "sym10",
                    11 => "sym11",
                    12 => "sym12",
                    13 => "sym13",
                    14 => "sym14",
                    15 => "sym15",
                    16 => "sym16",
                    17 => "sym17",
                    18 => "sym18",
                    19 => "sym19",
                    20 => "sym20",
                    21 => "sym21",
                    22 => "sym22",
                    23 => "sym23",
                    24 => "sym24",
                    25 => "sym25",
                    26 => "sym26",
                    27 => "sym27",
                    28 => "sym28",
                    _ => "sym29",
                }
            })
            .collect();

        let all_files = vec![
            make_file("src/a.rs", vec!["src/big.rs"], vec![]),
            make_file("src/big.rs", vec![], exports),
        ];

        let batch_files = vec![all_files[0].clone()];
        let batch_file_paths: HashSet<String> =
            batch_files.iter().map(|f| f.path.clone()).collect();

        let file_to_batch: HashMap<String, u32> =
            vec![("src/a.rs".to_string(), 0), ("src/big.rs".to_string(), 1)]
                .into_iter()
                .collect();

        let neighbor_map = compute_neighbor_map(
            &batch_files,
            0,
            &file_to_batch,
            &all_files,
            &batch_file_paths,
        );

        assert!(neighbor_map.contains_key("src/big.rs"));
        assert_eq!(
            neighbor_map["src/big.rs"].symbols.len(),
            MAX_SYMBOLS_PER_NEIGHBOR,
            "Symbols should be truncated to MAX_SYMBOLS_PER_NEIGHBOR"
        );
    }

    #[test]
    fn test_guess_symbol_kind() {
        assert_eq!(guess_symbol_kind("Logger"), SymbolKind::Struct);
        assert_eq!(guess_symbol_kind("MyError"), SymbolKind::Class);
        assert_eq!(guess_symbol_kind("IService"), SymbolKind::Interface);
        assert_eq!(guess_symbol_kind("MAX_SIZE"), SymbolKind::Const);
        assert_eq!(guess_symbol_kind("use_state"), SymbolKind::Function);
        assert_eq!(guess_symbol_kind("process"), SymbolKind::Function);
    }
}
