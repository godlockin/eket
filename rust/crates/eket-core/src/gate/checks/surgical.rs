//! Surgical Changes Check - validates diff scope and size
//!
//! Implements the "Touch only what you must" principle from Karpathy Guidelines.

use serde::{Deserialize, Serialize};
use std::collections::HashSet;

/// Severity level for surgical check warnings
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Severity {
    /// Informational only
    Info,
    /// Should review but not blocking
    Warning,
    /// Likely problematic, needs attention
    Error,
}

/// Describes a change that appears unrelated to the task
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UnrelatedChange {
    /// File path
    pub file: String,
    /// Reason why this change is flagged
    pub reason: String,
}

/// Configuration for surgical changes check
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SurgicalConfig {
    /// Maximum number of files in a single change
    pub max_files: usize,
    /// Maximum total lines changed
    pub max_lines: usize,
    /// Warn on style-only changes
    pub warn_style_only: bool,
}

impl Default for SurgicalConfig {
    fn default() -> Self {
        Self {
            max_files: 10,
            max_lines: 500,
            warn_style_only: true,
        }
    }
}

/// Task scope definition for checking relevance
#[derive(Debug, Clone, Default)]
pub struct TaskScope {
    /// Files expected to be modified
    pub expected_files: HashSet<String>,
    /// Directories in scope
    pub directories: HashSet<String>,
    /// Keywords related to the task
    pub keywords: HashSet<String>,
}

/// Report from surgical changes analysis
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SurgicalReport {
    /// Number of files changed
    pub files_changed: usize,
    /// Lines added
    pub lines_added: usize,
    /// Lines removed
    pub lines_removed: usize,
    /// Changes flagged as potentially unrelated
    pub unrelated_changes: Vec<UnrelatedChange>,
    /// Overall severity
    pub severity: Severity,
    /// Detailed messages
    pub messages: Vec<String>,
}

/// Surgical changes checker
pub struct SurgicalChangesCheck;

impl SurgicalChangesCheck {
    /// Analyze a diff string for surgical changes compliance
    pub fn analyze(diff: &str, task_scope: &TaskScope, config: &SurgicalConfig) -> SurgicalReport {
        let mut files_changed = 0;
        let mut lines_added = 0;
        let mut lines_removed = 0;
        let mut unrelated_changes = Vec::new();
        let mut messages = Vec::new();
        let mut current_file: Option<String> = None;
        let mut file_additions = 0;
        let mut file_deletions = 0;
        let mut is_style_only = true;

        for line in diff.lines() {
            // New file in diff
            if line.starts_with("diff --git") || line.starts_with("+++ ") {
                // Finalize previous file
                if let Some(ref file) = current_file {
                    if is_style_only
                        && (file_additions > 0 || file_deletions > 0)
                        && config.warn_style_only
                        && !is_in_scope(file, task_scope)
                    {
                        unrelated_changes.push(UnrelatedChange {
                            file: file.clone(),
                            reason: "style-only change".to_string(),
                        });
                    }
                }

                // Start new file
                if line.starts_with("+++ ") {
                    let path = line.trim_start_matches("+++ ").trim_start_matches("b/");
                    current_file = Some(path.to_string());
                    files_changed += 1;
                    file_additions = 0;
                    file_deletions = 0;
                    is_style_only = true;
                }
            } else if line.starts_with('+') && !line.starts_with("+++") {
                lines_added += 1;
                file_additions += 1;
                // Check if it's a substantive change (not just whitespace)
                let content = line.trim_start_matches('+');
                if !is_whitespace_only_change(content) {
                    is_style_only = false;
                }
            } else if line.starts_with('-') && !line.starts_with("---") {
                lines_removed += 1;
                file_deletions += 1;
                let content = line.trim_start_matches('-');
                if !is_whitespace_only_change(content) {
                    is_style_only = false;
                }
            }
        }

        // Finalize last file
        if let Some(ref file) = current_file {
            if is_style_only
                && (file_additions > 0 || file_deletions > 0)
                && config.warn_style_only
                && !is_in_scope(file, task_scope)
            {
                unrelated_changes.push(UnrelatedChange {
                    file: file.clone(),
                    reason: "style-only change".to_string(),
                });
            }
        }

        // Determine severity
        let mut severity = Severity::Info;

        if files_changed > config.max_files {
            messages.push(format!(
                "Files changed ({}) exceeds limit ({})",
                files_changed, config.max_files
            ));
            severity = Severity::Warning;
        }

        let total_lines = lines_added + lines_removed;
        if total_lines > config.max_lines {
            messages.push(format!(
                "Lines changed ({}) exceeds limit ({})",
                total_lines, config.max_lines
            ));
            severity = Severity::Warning;
        }

        if !unrelated_changes.is_empty() {
            messages.push(format!(
                "{} potentially unrelated changes detected",
                unrelated_changes.len()
            ));
            if severity == Severity::Info {
                severity = Severity::Warning;
            }
        }

        // Escalate to error if multiple issues
        if messages.len() >= 2 {
            severity = Severity::Error;
        }

        SurgicalReport {
            files_changed,
            lines_added,
            lines_removed,
            unrelated_changes,
            severity,
            messages,
        }
    }

    /// Format report for display
    pub fn format_report(report: &SurgicalReport, config: &SurgicalConfig) -> String {
        let mut output = String::new();

        let severity_icon = match report.severity {
            Severity::Info => "✓",
            Severity::Warning => "⚠",
            Severity::Error => "✗",
        };

        output.push_str(&format!("🔬 Surgical Changes Check {}\n", severity_icon));

        let files_status = if report.files_changed <= config.max_files {
            "✓"
        } else {
            "⚠"
        };
        output.push_str(&format!(
            "├── Files: {} (≤{} {})\n",
            report.files_changed, config.max_files, files_status
        ));

        let total_lines = report.lines_added + report.lines_removed;
        let lines_status = if total_lines <= config.max_lines {
            "✓"
        } else {
            "⚠"
        };
        output.push_str(&format!(
            "├── Lines: +{} / -{} (≤{} {})\n",
            report.lines_added, report.lines_removed, config.max_lines, lines_status
        ));

        if !report.unrelated_changes.is_empty() {
            output.push_str("└── Warnings:\n");
            for change in &report.unrelated_changes {
                output.push_str(&format!("    ⚠ {} — {}\n", change.file, change.reason));
            }
        } else {
            output.push_str("└── No unrelated changes detected\n");
        }

        output
    }
}

/// Check if a file is within the task scope
fn is_in_scope(file: &str, scope: &TaskScope) -> bool {
    // If no scope defined, everything is in scope
    if scope.expected_files.is_empty() && scope.directories.is_empty() {
        return true;
    }

    // Check exact file match
    if scope.expected_files.contains(file) {
        return true;
    }

    // Check directory prefix
    for dir in &scope.directories {
        if file.starts_with(dir) {
            return true;
        }
    }

    false
}

/// Check if a line change is whitespace-only
fn is_whitespace_only_change(content: &str) -> bool {
    let trimmed = content.trim();
    // Empty or only whitespace
    if trimmed.is_empty() {
        return true;
    }
    // Comment-only (common patterns)
    if trimmed.starts_with("//")
        || trimmed.starts_with('#')
        || trimmed.starts_with("/*")
        || trimmed.starts_with('*')
    {
        return true;
    }
    false
}

/// Check if a pair of lines represents only whitespace difference
#[allow(dead_code)]
fn is_whitespace_diff(old: &str, new: &str) -> bool {
    // Compare content after normalizing whitespace
    let old_normalized: String = old.split_whitespace().collect();
    let new_normalized: String = new.split_whitespace().collect();
    old_normalized == new_normalized
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_empty_diff() {
        let report =
            SurgicalChangesCheck::analyze("", &TaskScope::default(), &SurgicalConfig::default());
        assert_eq!(report.files_changed, 0);
        assert_eq!(report.severity, Severity::Info);
    }

    #[test]
    fn test_simple_diff() {
        let diff = r#"diff --git a/src/main.rs b/src/main.rs
+++ b/src/main.rs
@@ -1,3 +1,4 @@
+use std::io;
 fn main() {
     println!("Hello");
 }
"#;
        let report =
            SurgicalChangesCheck::analyze(diff, &TaskScope::default(), &SurgicalConfig::default());
        assert_eq!(report.files_changed, 1);
        assert_eq!(report.lines_added, 1);
        assert_eq!(report.severity, Severity::Info);
    }

    #[test]
    fn test_detect_style_only_change() {
        // A file with only comment changes, outside of task scope
        let diff = r#"diff --git a/src/utils.rs b/src/utils.rs
+++ b/src/utils.rs
@@ -1,3 +1,4 @@
+// Added comment
 fn helper() {}
"#;
        let mut scope = TaskScope::default();
        scope.directories.insert("src/main/".to_string());

        let report = SurgicalChangesCheck::analyze(diff, &scope, &SurgicalConfig::default());
        // File is outside scope and only has comment change
        assert_eq!(report.unrelated_changes.len(), 1);
        assert_eq!(report.unrelated_changes[0].reason, "style-only change");
    }

    #[test]
    fn test_exceeds_file_limit() {
        let mut diff = String::new();
        for i in 0..15 {
            diff.push_str(&format!("diff --git a/file{}.rs b/file{}.rs\n", i, i));
            diff.push_str(&format!("+++ b/file{}.rs\n", i));
            diff.push_str("+new line\n");
        }

        let config = SurgicalConfig {
            max_files: 10,
            ..Default::default()
        };

        let report = SurgicalChangesCheck::analyze(&diff, &TaskScope::default(), &config);
        assert_eq!(report.files_changed, 15);
        assert_eq!(report.severity, Severity::Warning);
        assert!(report.messages.iter().any(|m| m.contains("exceeds limit")));
    }

    #[test]
    fn test_format_report() {
        let report = SurgicalReport {
            files_changed: 3,
            lines_added: 45,
            lines_removed: 12,
            unrelated_changes: vec![],
            severity: Severity::Info,
            messages: vec![],
        };

        let output = SurgicalChangesCheck::format_report(&report, &SurgicalConfig::default());
        assert!(output.contains("Files: 3"));
        assert!(output.contains("+45 / -12"));
    }

    #[test]
    fn test_whitespace_only_detection() {
        assert!(is_whitespace_only_change("   "));
        assert!(is_whitespace_only_change("// comment"));
        assert!(is_whitespace_only_change("# python comment"));
        assert!(!is_whitespace_only_change("let x = 1;"));
    }
}
