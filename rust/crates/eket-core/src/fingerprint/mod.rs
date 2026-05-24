//! Fingerprint module - incremental change detection for code analysis.
//!
//! Two-phase filtering:
//! 1. content_hash: fast SHA256 of file content, filters unchanged files
//! 2. structure_hash: Merkle tree of AST structure, detects semantic changes
//!
//! Three-layer storage:
//! - L1: moka LRU cache (hot, 1000 entries, 30min TTL)
//! - L2: SQLite B-Tree index (warm, persistent)
//! - L3: JSON archive (cold, portable)

pub mod classifier;
pub mod hash;
pub mod storage;

pub use classifier::{classify_change, ChangeType};
pub use hash::{compute_fingerprint, FileFingerprint, StructuralInfo};
pub use storage::{FingerprintStore, FingerprintBaseline};
