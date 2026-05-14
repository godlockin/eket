use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use tiktoken_rs::cl100k_base;
use walkdir::WalkDir;

#[derive(Debug, Serialize, Deserialize)]
pub struct EstimateResult {
    pub tokens: usize,
    pub method: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub duration: Option<f64>,
}

pub struct ContextEstimator {
    dirs: Vec<(String, String)>, // (base_path, extension)
    files: Vec<String>,
}

impl ContextEstimator {
    pub fn new() -> Self {
        Self {
            dirs: vec![
                ("jira/tickets".to_string(), ".md".to_string()),
                ("confluence/memory".to_string(), ".md".to_string()),
            ],
            files: vec![
                ".eket/ACTIVE_CONTEXT".to_string(),
                "CLAUDE.md".to_string(),
                ".claude/CLAUDE.md".to_string(),
            ],
        }
    }

    /// Rough estimation via byte count heuristic
    /// Fast O(n) file stat, no content reading
    /// Error: ±30% typical
    pub fn rough_estimate(&self) -> Result<usize> {
        let mut total_size: u64 = 0;
        const MAX_FILES_PER_DIR: usize = 20; // Match Node baseline

        // Process directories with walkdir
        for (base, ext) in &self.dirs {
            if !Path::new(base).exists() {
                continue;
            }

            for entry in WalkDir::new(base)
                .max_depth(10)
                .into_iter()
                .filter_map(Result::ok)
                .filter(|e| e.file_type().is_file())
                .filter(|e| e.path().extension().map_or(false, |x| x == &ext[1..]))
                .take(MAX_FILES_PER_DIR)
            {
                if let Ok(metadata) = entry.metadata() {
                    total_size += metadata.len();
                }
            }
        }

        // Process individual files
        for file in &self.files {
            if let Ok(metadata) = fs::metadata(file) {
                if metadata.is_file() {
                    total_size += metadata.len();
                }
            }
        }

        // Heuristic: 1 token ≈ 3.3 bytes for English + code
        Ok((total_size as f64 * 0.3) as usize)
    }

    /// Precise estimation via tiktoken encoding
    /// Reads top-priority files only (cap at 20 per dir to avoid OOM)
    /// Error: ±10% typical
    pub fn precise_estimate(&self) -> Result<usize> {
        let bpe = cl100k_base()?;
        let mut total = 0;
        const MAX_FILES_PER_DIR: usize = 20; // Match Node baseline

        // Process directories
        for (base, ext) in &self.dirs {
            if !Path::new(base).exists() {
                continue;
            }

            for entry in WalkDir::new(base)
                .max_depth(10)
                .into_iter()
                .filter_map(Result::ok)
                .filter(|e| e.file_type().is_file())
                .filter(|e| e.path().extension().map_or(false, |x| x == &ext[1..]))
                .take(MAX_FILES_PER_DIR)
            {
                if let Ok(content) = fs::read_to_string(entry.path()) {
                    total += bpe.encode_with_special_tokens(&content).len();
                }
            }
        }

        // Process individual files
        for file in &self.files {
            if let Ok(content) = fs::read_to_string(file) {
                total += bpe.encode_with_special_tokens(&content).len();
            }
        }

        Ok(total)
    }

    /// Intelligent estimation with automatic method selection
    ///
    /// Logic:
    /// 1. Quick rough estimate
    /// 2. If < 70K → return rough (fast path, most repos)
    /// 3. Else → precise tokenization (accuracy path for large repos)
    ///
    /// Note: Threshold raised from 40K to 70K to prioritize <10ms startup.
    /// For repos 40-70K, rough estimate (±30%) is acceptable tradeoff.
    pub fn estimate(&self) -> Result<EstimateResult> {
        let start = std::time::Instant::now();

        let rough = self.rough_estimate()?;

        // Fast path: low token count doesn't need precision
        if rough < 70000 {
            return Ok(EstimateResult {
                tokens: rough,
                method: "rough".to_string(),
                duration: Some(start.elapsed().as_secs_f64() * 1000.0),
            });
        }

        // Slow path: high token count needs accurate measurement
        let precise = self.precise_estimate()?;
        Ok(EstimateResult {
            tokens: precise,
            method: "precise".to_string(),
            duration: Some(start.elapsed().as_secs_f64() * 1000.0),
        })
    }
}

impl Default for ContextEstimator {
    fn default() -> Self {
        Self::new()
    }
}
