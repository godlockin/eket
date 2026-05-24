//! Change classification for incremental analysis.
//!
//! Change types:
//! - None: No change (content_hash identical)
//! - Cosmetic: Only comments/whitespace changed (content_hash differs, structure_hash identical)
//! - Structural: Code structure changed (structure_hash differs) - needs re-analysis
//! - New: New file (no baseline)
//! - Deleted: File removed (in baseline but missing)

use serde::{Deserialize, Serialize};

use super::hash::FileFingerprint;

// ─── Types ───────────────────────────────────────────────────────────────────

/// Classification of file change type.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ChangeType {
    /// No change detected
    None,
    /// Only cosmetic changes (comments, whitespace, formatting)
    Cosmetic,
    /// Structural change (needs re-analysis)
    Structural,
    /// New file (not in baseline)
    New,
    /// Deleted file (in baseline but missing)
    Deleted,
}

impl ChangeType {
    /// Returns true if this change requires re-analysis.
    pub fn needs_reanalysis(&self) -> bool {
        matches!(self, ChangeType::Structural | ChangeType::New)
    }

    /// Returns true if this change can be skipped.
    pub fn can_skip(&self) -> bool {
        matches!(self, ChangeType::None | ChangeType::Cosmetic)
    }
}

impl std::fmt::Display for ChangeType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ChangeType::None => write!(f, "NONE"),
            ChangeType::Cosmetic => write!(f, "COSMETIC"),
            ChangeType::Structural => write!(f, "STRUCTURAL"),
            ChangeType::New => write!(f, "NEW"),
            ChangeType::Deleted => write!(f, "DELETED"),
        }
    }
}

/// Result of classifying a file change.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChangeResult {
    pub path: String,
    pub change_type: ChangeType,
    /// Old fingerprint (if exists)
    pub old_fingerprint: Option<FileFingerprint>,
    /// New fingerprint (if file exists)
    pub new_fingerprint: Option<FileFingerprint>,
}

/// Summary of change classification results.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ChangeSummary {
    pub total: usize,
    pub none: usize,
    pub cosmetic: usize,
    pub structural: usize,
    pub new: usize,
    pub deleted: usize,
}

impl ChangeSummary {
    /// Calculate hit rate: cosmetic / (cosmetic + structural)
    ///
    /// Target: 30-50% for normal development.
    /// < 20%: structure_hash too granular
    /// > 80%: may miss semantic changes
    pub fn hit_rate(&self) -> f64 {
        let denom = self.cosmetic + self.structural;
        if denom == 0 {
            0.0
        } else {
            self.cosmetic as f64 / denom as f64 * 100.0
        }
    }

    /// Count of files needing re-analysis (structural + new).
    pub fn needs_reanalysis(&self) -> usize {
        self.structural + self.new
    }

    /// Count of files that can be skipped (none + cosmetic).
    pub fn can_skip(&self) -> usize {
        self.none + self.cosmetic
    }
}

// ─── Classification ──────────────────────────────────────────────────────────

/// Classify a single file change.
///
/// Two-phase filtering:
/// 1. content_hash identical → None (skip AST parsing)
/// 2. structure_hash identical → Cosmetic (skip re-analysis)
/// 3. Otherwise → Structural (needs re-analysis)
pub fn classify_change(
    old_fp: Option<&FileFingerprint>,
    new_fp: Option<&FileFingerprint>,
) -> ChangeType {
    match (old_fp, new_fp) {
        (None, None) => ChangeType::None,
        (None, Some(_)) => ChangeType::New,
        (Some(_), None) => ChangeType::Deleted,
        (Some(old), Some(new)) => {
            // Phase 1: content_hash check (fast)
            if old.content_hash == new.content_hash {
                ChangeType::None
            }
            // Phase 2: structure_hash check
            else if old.structure_hash == new.structure_hash {
                ChangeType::Cosmetic
            } else {
                ChangeType::Structural
            }
        }
    }
}

/// Classify changes for multiple files.
pub fn classify_changes(
    old_fps: &[FileFingerprint],
    new_fps: &[FileFingerprint],
) -> (Vec<ChangeResult>, ChangeSummary) {
    use std::collections::HashMap;

    let old_map: HashMap<&str, &FileFingerprint> =
        old_fps.iter().map(|fp| (fp.path.as_str(), fp)).collect();
    let new_map: HashMap<&str, &FileFingerprint> =
        new_fps.iter().map(|fp| (fp.path.as_str(), fp)).collect();

    let mut results = Vec::new();
    let mut summary = ChangeSummary::default();

    // Check all paths from both sets
    let mut all_paths: std::collections::BTreeSet<&str> = old_map.keys().copied().collect();
    all_paths.extend(new_map.keys().copied());

    for path in all_paths {
        let old = old_map.get(path).copied();
        let new = new_map.get(path).copied();
        let change_type = classify_change(old, new);

        summary.total += 1;
        match change_type {
            ChangeType::None => summary.none += 1,
            ChangeType::Cosmetic => summary.cosmetic += 1,
            ChangeType::Structural => summary.structural += 1,
            ChangeType::New => summary.new += 1,
            ChangeType::Deleted => summary.deleted += 1,
        }

        results.push(ChangeResult {
            path: path.to_string(),
            change_type,
            old_fingerprint: old.cloned(),
            new_fingerprint: new.cloned(),
        });
    }

    (results, summary)
}

// ─── Tests ───────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn make_fp(path: &str, content: &str, structure: &str) -> FileFingerprint {
        FileFingerprint {
            path: path.to_string(),
            content_hash: content.to_string(),
            structure_hash: structure.to_string(),
            file_size: 100,
            line_count: 10,
            analyzed_at: 0,
        }
    }

    #[test]
    fn test_classify_none() {
        let fp1 = make_fp("a.rs", "hash1", "struct1");
        let fp2 = make_fp("a.rs", "hash1", "struct1");
        assert_eq!(classify_change(Some(&fp1), Some(&fp2)), ChangeType::None);
    }

    #[test]
    fn test_classify_cosmetic() {
        // Same structure hash, different content hash (only comments changed)
        let fp1 = make_fp("a.rs", "hash1", "struct1");
        let fp2 = make_fp("a.rs", "hash2", "struct1");
        assert_eq!(classify_change(Some(&fp1), Some(&fp2)), ChangeType::Cosmetic);
    }

    #[test]
    fn test_classify_structural() {
        // Different structure hash (code changed)
        let fp1 = make_fp("a.rs", "hash1", "struct1");
        let fp2 = make_fp("a.rs", "hash2", "struct2");
        assert_eq!(classify_change(Some(&fp1), Some(&fp2)), ChangeType::Structural);
    }

    #[test]
    fn test_classify_new() {
        let fp = make_fp("a.rs", "hash1", "struct1");
        assert_eq!(classify_change(None, Some(&fp)), ChangeType::New);
    }

    #[test]
    fn test_classify_deleted() {
        let fp = make_fp("a.rs", "hash1", "struct1");
        assert_eq!(classify_change(Some(&fp), None), ChangeType::Deleted);
    }

    #[test]
    fn test_change_type_helpers() {
        assert!(!ChangeType::None.needs_reanalysis());
        assert!(!ChangeType::Cosmetic.needs_reanalysis());
        assert!(ChangeType::Structural.needs_reanalysis());
        assert!(ChangeType::New.needs_reanalysis());
        assert!(!ChangeType::Deleted.needs_reanalysis());

        assert!(ChangeType::None.can_skip());
        assert!(ChangeType::Cosmetic.can_skip());
        assert!(!ChangeType::Structural.can_skip());
    }

    #[test]
    fn test_classify_changes_batch() {
        let old = vec![
            make_fp("a.rs", "h1", "s1"),
            make_fp("b.rs", "h2", "s2"),
            make_fp("c.rs", "h3", "s3"),
        ];
        let new = vec![
            make_fp("a.rs", "h1", "s1"),  // None
            make_fp("b.rs", "h2x", "s2"), // Cosmetic
            make_fp("d.rs", "h4", "s4"),  // New (c.rs deleted)
        ];

        let (results, summary) = classify_changes(&old, &new);

        assert_eq!(summary.total, 4);
        assert_eq!(summary.none, 1);
        assert_eq!(summary.cosmetic, 1);
        assert_eq!(summary.new, 1);
        assert_eq!(summary.deleted, 1);

        let a_result = results.iter().find(|r| r.path == "a.rs").unwrap();
        assert_eq!(a_result.change_type, ChangeType::None);
    }

    #[test]
    fn test_hit_rate() {
        let mut summary = ChangeSummary::default();
        summary.cosmetic = 30;
        summary.structural = 70;
        assert!((summary.hit_rate() - 30.0).abs() < 0.01);

        summary.cosmetic = 0;
        summary.structural = 0;
        assert_eq!(summary.hit_rate(), 0.0);
    }
}
