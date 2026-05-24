// splitter.rs: Union-Find + 路径前缀分割算法
// TASK-E11-002: Phase 1 MVP

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// ───────────────────────── Data Types ─────────────────────────

/// 文件条目（从结构分析输出获取）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileEntry {
    pub path: String,
    pub language: Option<String>,
    pub size_lines: u32,
    /// 该文件导入的其他文件路径
    #[serde(default)]
    pub imports: Vec<String>,
    /// 该文件导出的符号（用于 neighborMap）
    #[serde(default)]
    pub exports: Vec<String>,
}

/// 批次配置
#[derive(Debug, Clone)]
pub struct BatchConfig {
    /// 每批最大节点数（默认 60）
    pub max_nodes: usize,
    /// 每批最大边数（默认 120）
    pub max_edges: usize,
}

impl Default for BatchConfig {
    fn default() -> Self {
        Self {
            max_nodes: 60,
            max_edges: 120,
        }
    }
}

/// 单个批次
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Batch {
    pub batch_index: u32,
    pub files: Vec<FileEntry>,
    /// file -> imports (批次内导入数据)
    pub batch_import_data: HashMap<String, Vec<String>>,
    /// 跨批次邻居映射
    pub neighbor_map: HashMap<String, super::neighbor_map::NeighborInfo>,
}

/// 批次计算输出
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchOutput {
    pub total_batches: usize,
    pub total_files: usize,
    pub batches: Vec<Batch>,
}

// ───────────────────────── Union-Find ─────────────────────────

/// 并查集实现
struct UnionFind {
    parent: Vec<usize>,
    rank: Vec<usize>,
}

impl UnionFind {
    fn new(n: usize) -> Self {
        Self {
            parent: (0..n).collect(),
            rank: vec![0; n],
        }
    }

    fn find(&mut self, x: usize) -> usize {
        if self.parent[x] != x {
            self.parent[x] = self.find(self.parent[x]); // 路径压缩
        }
        self.parent[x]
    }

    fn union(&mut self, x: usize, y: usize) {
        let px = self.find(x);
        let py = self.find(y);
        if px == py {
            return;
        }
        // 按秩合并
        match self.rank[px].cmp(&self.rank[py]) {
            std::cmp::Ordering::Less => self.parent[px] = py,
            std::cmp::Ordering::Greater => self.parent[py] = px,
            std::cmp::Ordering::Equal => {
                self.parent[py] = px;
                self.rank[px] += 1;
            }
        }
    }

    /// 返回所有连通分量（每个分量是原始索引列表）
    fn into_components(mut self) -> Vec<Vec<usize>> {
        let n = self.parent.len();
        let mut components: HashMap<usize, Vec<usize>> = HashMap::new();
        for i in 0..n {
            let root = self.find(i);
            components.entry(root).or_default().push(i);
        }
        let mut result: Vec<Vec<usize>> = components.into_values().collect();
        // 按首元素排序保持确定性
        result.sort_by(|a, b| a.first().cmp(&b.first()));
        result
    }
}

// ───────────────────────── Path Prefix Splitting ─────────────────────────

/// 从路径中提取前缀（用于二次分割）
fn extract_path_prefix(path: &str, depth: usize) -> String {
    let parts: Vec<&str> = path.split('/').collect();
    if parts.len() <= depth {
        path.to_string()
    } else {
        parts[..depth].join("/")
    }
}

const MAX_SPLIT_RECURSION: usize = 10;

/// 按路径前缀分割超大分量
pub fn split_by_path_prefix(
    files: &[FileEntry],
    indices: Vec<usize>,
    max_nodes: usize,
) -> Vec<Vec<usize>> {
    split_by_path_prefix_recursive(files, indices, max_nodes, 0)
}

fn split_by_path_prefix_recursive(
    files: &[FileEntry],
    indices: Vec<usize>,
    max_nodes: usize,
    recursion_depth: usize,
) -> Vec<Vec<usize>> {
    if indices.len() <= max_nodes {
        return vec![indices];
    }

    // 防止无限递归
    if recursion_depth >= MAX_SPLIT_RECURSION {
        let mut result = Vec::new();
        for chunk in indices.chunks(max_nodes) {
            result.push(chunk.to_vec());
        }
        return result;
    }

    // 尝试不同深度的前缀分割
    for depth in 1..=5 {
        let mut prefix_groups: HashMap<String, Vec<usize>> = HashMap::new();
        for &idx in &indices {
            let prefix = extract_path_prefix(&files[idx].path, depth);
            prefix_groups.entry(prefix).or_default().push(idx);
        }

        // 如果分出了多个组，递归处理
        if prefix_groups.len() > 1 {
            let mut result = Vec::new();
            for (_, group) in prefix_groups {
                if group.len() <= max_nodes {
                    result.push(group);
                } else {
                    // 递归分割
                    result.extend(split_by_path_prefix_recursive(files, group, max_nodes, recursion_depth + 1));
                }
            }
            return result;
        }
    }

    // 前缀分割无效，使用简单均分（后备策略）
    let mut result = Vec::new();
    for chunk in indices.chunks(max_nodes) {
        result.push(chunk.to_vec());
    }
    result
}

// ───────────────────────── Main Algorithm ─────────────────────────

/// 查找文件索引
fn find_file_index(path: &str, files: &[FileEntry]) -> Option<usize> {
    files.iter().position(|f| f.path == path)
}

/// 计算批次（Phase 1: Union-Find + 路径前缀）
pub fn compute_batches(files: Vec<FileEntry>, config: BatchConfig) -> BatchOutput {
    let n = files.len();

    // 空或小项目直接返回单批次
    if n == 0 {
        return BatchOutput {
            total_batches: 0,
            total_files: 0,
            batches: vec![],
        };
    }

    if n <= config.max_nodes {
        let mut batch_import_data = HashMap::new();
        for f in &files {
            if !f.imports.is_empty() {
                batch_import_data.insert(f.path.clone(), f.imports.clone());
            }
        }

        let batch = Batch {
            batch_index: 0,
            files: files.clone(),
            batch_import_data,
            neighbor_map: HashMap::new(), // 单批次无跨批次邻居
        };

        return BatchOutput {
            total_batches: 1,
            total_files: n,
            batches: vec![batch],
        };
    }

    // 1. Union-Find 按导入关系合并
    let mut uf = UnionFind::new(n);
    for (i, f) in files.iter().enumerate() {
        for imp in &f.imports {
            if let Some(j) = find_file_index(imp, &files) {
                uf.union(i, j);
            }
        }
    }

    // 2. 获取连通分量
    let components = uf.into_components();

    // 3. 处理分量：超大分量分割，小分量合并
    let mut batch_indices: Vec<Vec<usize>> = Vec::new();
    let mut pending_small: Vec<usize> = Vec::new(); // 待合并的小分量

    for component in components {
        if component.len() > config.max_nodes {
            // 超大分量：按路径前缀分割
            batch_indices.extend(split_by_path_prefix(&files, component, config.max_nodes));
        } else {
            // 小分量：尝试合并到 pending
            if pending_small.len() + component.len() <= config.max_nodes {
                pending_small.extend(component);
            } else {
                // 当前 pending 已满，先 flush
                if !pending_small.is_empty() {
                    batch_indices.push(std::mem::take(&mut pending_small));
                }
                // 如果当前分量本身就超过 max_nodes 的一半，单独成批
                if component.len() > config.max_nodes / 2 {
                    batch_indices.push(component);
                } else {
                    pending_small = component;
                }
            }
        }
    }
    // flush 剩余
    if !pending_small.is_empty() {
        batch_indices.push(pending_small);
    }

    // 4. 构建批次对象
    let mut batches = Vec::new();

    // 先构建文件路径到批次索引的映射
    let mut file_to_batch: HashMap<String, u32> = HashMap::new();
    for (batch_idx, indices) in batch_indices.iter().enumerate() {
        for &i in indices {
            file_to_batch.insert(files[i].path.clone(), batch_idx as u32);
        }
    }

    for (batch_idx, indices) in batch_indices.iter().enumerate() {
        let batch_files: Vec<FileEntry> = indices.iter().map(|&i| files[i].clone()).collect();
        let batch_file_paths: std::collections::HashSet<String> =
            batch_files.iter().map(|f| f.path.clone()).collect();

        let mut batch_import_data = HashMap::new();
        for f in &batch_files {
            if !f.imports.is_empty() {
                batch_import_data.insert(f.path.clone(), f.imports.clone());
            }
        }

        // 计算 neighborMap
        let neighbor_map = super::neighbor_map::compute_neighbor_map(
            &batch_files,
            batch_idx as u32,
            &file_to_batch,
            &files,
            &batch_file_paths,
        );

        batches.push(Batch {
            batch_index: batch_idx as u32,
            files: batch_files,
            batch_import_data,
            neighbor_map,
        });
    }

    BatchOutput {
        total_batches: batches.len(),
        total_files: n,
        batches,
    }
}

// ───────────────────────── Tests ─────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn make_file(path: &str, imports: Vec<&str>) -> FileEntry {
        FileEntry {
            path: path.to_string(),
            language: Some("rust".to_string()),
            size_lines: 100,
            imports: imports.into_iter().map(String::from).collect(),
            exports: vec![],
        }
    }

    #[test]
    fn test_small_project_single_batch() {
        // 小项目 (<60 文件) 只有 1 个批次
        let files: Vec<FileEntry> = (0..30)
            .map(|i| make_file(&format!("src/file{i}.rs"), vec![]))
            .collect();

        let output = compute_batches(files.clone(), BatchConfig::default());

        assert_eq!(output.total_batches, 1);
        assert_eq!(output.total_files, 30);
        assert_eq!(output.batches[0].files.len(), 30);
    }

    #[test]
    fn test_large_project_auto_split() {
        // 大项目应该自动分批
        let files: Vec<FileEntry> = (0..150)
            .map(|i| {
                let dir = if i < 50 {
                    "src/core"
                } else if i < 100 {
                    "src/api"
                } else {
                    "src/utils"
                };
                make_file(&format!("{dir}/file{i}.rs"), vec![])
            })
            .collect();

        let output = compute_batches(
            files.clone(),
            BatchConfig {
                max_nodes: 60,
                max_edges: 120,
            },
        );

        assert!(output.total_batches > 1, "Should have multiple batches");
        assert_eq!(output.total_files, 150);

        // 验证每批不超过 max_nodes
        for batch in &output.batches {
            assert!(
                batch.files.len() <= 60,
                "Batch {} has {} files",
                batch.batch_index,
                batch.files.len()
            );
        }
    }

    #[test]
    fn test_connected_files_same_batch() {
        // 紧耦合文件应在同一批
        let files = vec![
            make_file("src/core/a.rs", vec!["src/core/b.rs"]),
            make_file("src/core/b.rs", vec!["src/core/c.rs"]),
            make_file("src/core/c.rs", vec![]),
            make_file("src/api/d.rs", vec![]), // 独立文件
        ];

        let output = compute_batches(
            files.clone(),
            BatchConfig {
                max_nodes: 3,
                max_edges: 6,
            },
        );

        // a, b, c 应该在同一批（或被分割但仍相邻）
        let batch_of = |path: &str| -> Option<u32> {
            output
                .batches
                .iter()
                .find(|b| b.files.iter().any(|f| f.path == path))
                .map(|b| b.batch_index)
        };

        let batch_a = batch_of("src/core/a.rs");
        let batch_b = batch_of("src/core/b.rs");
        let batch_c = batch_of("src/core/c.rs");

        // 由于它们是连通的，应该在同一批（如果批次大小允许）
        assert_eq!(batch_a, batch_b);
        assert_eq!(batch_b, batch_c);
    }

    #[test]
    fn test_neighbor_map_cross_batch() {
        // 测试跨批次依赖的 neighborMap
        let files = vec![
            make_file("src/core/a.rs", vec!["src/utils/logger.rs"]),
            make_file("src/core/b.rs", vec![]),
            make_file("src/core/c.rs", vec![]),
            // 独立分量
            make_file("src/utils/logger.rs", vec![]),
            make_file("src/utils/helper.rs", vec![]),
        ];

        let output = compute_batches(
            files.clone(),
            BatchConfig {
                max_nodes: 3,
                max_edges: 6,
            },
        );

        // 如果 a 和 logger 在不同批次，a 的批次应有 neighborMap 条目
        if output.total_batches > 1 {
            let batch_with_a = output
                .batches
                .iter()
                .find(|b| b.files.iter().any(|f| f.path == "src/core/a.rs"));

            if let Some(batch) = batch_with_a {
                let batch_with_logger = output
                    .batches
                    .iter()
                    .find(|b| b.files.iter().any(|f| f.path == "src/utils/logger.rs"));

                if let Some(logger_batch) = batch_with_logger {
                    if batch.batch_index != logger_batch.batch_index {
                        assert!(
                            batch.neighbor_map.contains_key("src/utils/logger.rs"),
                            "neighborMap should contain cross-batch dependency"
                        );
                    }
                }
            }
        }
    }

    #[test]
    fn test_empty_project() {
        let files: Vec<FileEntry> = vec![];
        let output = compute_batches(files, BatchConfig::default());

        assert_eq!(output.total_batches, 0);
        assert_eq!(output.total_files, 0);
    }

    #[test]
    fn test_union_find_basic() {
        let mut uf = UnionFind::new(5);
        uf.union(0, 1);
        uf.union(2, 3);
        uf.union(1, 2);

        assert_eq!(uf.find(0), uf.find(3));
        assert_ne!(uf.find(0), uf.find(4));
    }

    #[test]
    fn test_path_prefix_extraction() {
        assert_eq!(extract_path_prefix("src/core/mod.rs", 1), "src");
        assert_eq!(extract_path_prefix("src/core/mod.rs", 2), "src/core");
        assert_eq!(extract_path_prefix("mod.rs", 1), "mod.rs");
    }
}
