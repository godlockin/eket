// batch module: 批次分割 + neighborMap 计算
// TASK-E11-002: Phase 1 MVP - Union-Find + 路径前缀分割

mod neighbor_map;
mod splitter;

pub use neighbor_map::{compute_neighbor_map, EdgeType, NeighborInfo, SymbolRef};
pub use splitter::{
    compute_batches, split_by_path_prefix, Batch, BatchConfig, BatchOutput, FileEntry,
};
