use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use walkdir::WalkDir;

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum EstimateMethod {
    Rough,
    Precise,
}

#[derive(Debug, Serialize)]
pub struct EstimateResult {
    pub tokens: usize,
    pub method: EstimateMethod,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub duration: Option<u128>,
}

const PATTERNS: &[&str] = &[
    "jira/tickets",
    "confluence/memory",
    ".eket/ACTIVE_CONTEXT",
    "CLAUDE.md",
    ".claude/CLAUDE.md",
];

const ROUGH_THRESHOLD: usize = 40_000;

pub struct ContextEstimator;

impl Default for ContextEstimator {
    fn default() -> Self {
        Self::new()
    }
}

impl ContextEstimator {
    pub fn new() -> Self {
        Self
    }

    /// Rough estimate via byte count heuristic (1 token ≈ 3.3 bytes)
    /// Fast O(n) file stat, no content reading
    pub fn rough_estimate(&self) -> usize {
        let mut total_size = 0;

        for pattern in PATTERNS {
            let path = Path::new(pattern);

            if path.is_file() {
                if let Ok(metadata) = fs::metadata(path) {
                    total_size += metadata.len() as usize;
                }
            } else if path.is_dir() {
                // Collect and sort for deterministic results
                let mut entries: Vec<_> = WalkDir::new(path)
                    .follow_links(false)
                    .into_iter()
                    .filter_map(|e| e.ok())
                    .filter(|e| {
                        e.path()
                            .extension()
                            .and_then(|s| s.to_str())
                            .map(|ext| ext == "md")
                            .unwrap_or(false)
                    })
                    .collect();

                entries.sort_by(|a, b| a.path().cmp(b.path()));

                for entry in entries.into_iter().take(20) {
                    if let Ok(metadata) = entry.metadata() {
                        total_size += metadata.len() as usize;
                    }
                }
            }
        }

        (total_size * 3) / 10
    }

    /// Precise estimate via tiktoken tokenization
    /// Reads top-priority files (cap at 20 per pattern)
    pub fn precise_estimate(&self) -> usize {
        use tiktoken_rs::cl100k_base;

        let bpe = cl100k_base().expect("Failed to load tiktoken model");
        let mut total = 0;

        for pattern in PATTERNS {
            let path = Path::new(pattern);

            if path.is_file() {
                if let Ok(content) = fs::read_to_string(path) {
                    total += bpe.encode_with_special_tokens(&content).len();
                }
            } else if path.is_dir() {
                // Collect and sort for deterministic results
                let mut entries: Vec<_> = WalkDir::new(path)
                    .follow_links(false)
                    .into_iter()
                    .filter_map(|e| e.ok())
                    .filter(|e| {
                        e.path()
                            .extension()
                            .and_then(|s| s.to_str())
                            .map(|ext| ext == "md")
                            .unwrap_or(false)
                    })
                    .collect();

                entries.sort_by(|a, b| a.path().cmp(b.path()));

                for entry in entries.into_iter().take(20) {
                    if let Ok(content) = fs::read_to_string(entry.path()) {
                        total += bpe.encode_with_special_tokens(&content).len();
                    }
                }
            }
        }

        total
    }

    /// Smart estimation with automatic method selection
    /// Logic: rough < 40K → return rough (fast path)
    ///        rough >= 40K → precise tokenization (accuracy path)
    pub fn estimate(&self) -> EstimateResult {
        let start = std::time::Instant::now();

        let rough = self.rough_estimate();

        if rough < ROUGH_THRESHOLD {
            return EstimateResult {
                tokens: rough,
                method: EstimateMethod::Rough,
                duration: Some(start.elapsed().as_millis()),
            };
        }

        let precise = self.precise_estimate();
        EstimateResult {
            tokens: precise,
            method: EstimateMethod::Precise,
            duration: Some(start.elapsed().as_millis()),
        }
    }
}
