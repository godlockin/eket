//! Benchmark task definitions

use serde::{Deserialize, Serialize};

/// Type of benchmark task
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TaskType {
    /// Code bug fix (SWE-bench style)
    CodeFix,
    /// Configuration change
    ConfigChange,
    /// Documentation update
    DocsUpdate,
    /// Multi-file refactoring
    Refactor,
    /// New feature implementation
    Feature,
}

/// A benchmark task definition
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BenchmarkTask {
    /// Unique task identifier
    pub id: String,
    /// Task type
    pub task_type: TaskType,
    /// Problem description (like GitHub issue)
    pub description: String,
    /// Repository or project context
    pub context: TaskContext,
    /// Expected outcome for verification
    pub expected_outcome: ExpectedOutcome,
    /// Difficulty level (1-5)
    pub difficulty: u8,
    /// Tags for filtering
    pub tags: Vec<String>,
}

/// Context for a benchmark task
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskContext {
    /// Files relevant to the task
    pub relevant_files: Vec<String>,
    /// Base commit or version
    pub base_ref: Option<String>,
    /// Additional context (e.g., stack trace, logs)
    pub additional_info: Option<String>,
}

/// Expected outcome for verification
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExpectedOutcome {
    /// Files that should be modified
    pub modified_files: Vec<String>,
    /// Test commands to verify
    pub test_commands: Vec<String>,
    /// Expected test result (pass/fail)
    pub expected_test_pass: bool,
    /// Optional: specific content that should appear
    pub expected_content: Option<Vec<ContentCheck>>,
}

/// Content verification check
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContentCheck {
    /// File to check
    pub file: String,
    /// Pattern that should exist (regex)
    pub pattern: String,
    /// Whether the pattern should exist or not exist
    pub should_exist: bool,
}

/// Outcome of a task execution
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskOutcome {
    /// Task identifier
    pub task_id: String,
    /// Whether the task passed verification
    pub passed: bool,
    /// Files that were modified
    pub modified_files: Vec<String>,
    /// Patch/diff generated
    pub patch: Option<String>,
    /// Test results
    pub test_results: Option<TestResults>,
    /// Error message if failed
    pub error: Option<String>,
    /// Tokens consumed
    pub tokens_used: u64,
    /// Time taken in seconds
    pub duration_secs: f64,
}

/// Test execution results
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestResults {
    /// Number of tests passed
    pub passed: u32,
    /// Number of tests failed
    pub failed: u32,
    /// Test output
    pub output: String,
}

impl BenchmarkTask {
    /// Create a code fix task
    pub fn code_fix(id: &str, description: &str, files: Vec<String>) -> Self {
        Self {
            id: id.to_string(),
            task_type: TaskType::CodeFix,
            description: description.to_string(),
            context: TaskContext {
                relevant_files: files.clone(),
                base_ref: None,
                additional_info: None,
            },
            expected_outcome: ExpectedOutcome {
                modified_files: files,
                test_commands: vec!["cargo test".to_string()],
                expected_test_pass: true,
                expected_content: None,
            },
            difficulty: 3,
            tags: vec!["code".to_string(), "fix".to_string()],
        }
    }

    /// Create a config change task
    pub fn config_change(id: &str, description: &str, config_file: &str) -> Self {
        Self {
            id: id.to_string(),
            task_type: TaskType::ConfigChange,
            description: description.to_string(),
            context: TaskContext {
                relevant_files: vec![config_file.to_string()],
                base_ref: None,
                additional_info: None,
            },
            expected_outcome: ExpectedOutcome {
                modified_files: vec![config_file.to_string()],
                test_commands: vec![],
                expected_test_pass: true,
                expected_content: None,
            },
            difficulty: 2,
            tags: vec!["config".to_string()],
        }
    }

    /// Create a docs update task
    pub fn docs_update(id: &str, description: &str, doc_file: &str) -> Self {
        Self {
            id: id.to_string(),
            task_type: TaskType::DocsUpdate,
            description: description.to_string(),
            context: TaskContext {
                relevant_files: vec![doc_file.to_string()],
                base_ref: None,
                additional_info: None,
            },
            expected_outcome: ExpectedOutcome {
                modified_files: vec![doc_file.to_string()],
                test_commands: vec![],
                expected_test_pass: true,
                expected_content: None,
            },
            difficulty: 1,
            tags: vec!["docs".to_string()],
        }
    }
}

impl TaskOutcome {
    /// Create a passed outcome
    pub fn passed(task_id: &str, modified_files: Vec<String>, tokens: u64, duration: f64) -> Self {
        Self {
            task_id: task_id.to_string(),
            passed: true,
            modified_files,
            patch: None,
            test_results: None,
            error: None,
            tokens_used: tokens,
            duration_secs: duration,
        }
    }

    /// Create a failed outcome
    pub fn failed(task_id: &str, error: &str, tokens: u64, duration: f64) -> Self {
        Self {
            task_id: task_id.to_string(),
            passed: false,
            modified_files: vec![],
            patch: None,
            test_results: None,
            error: Some(error.to_string()),
            tokens_used: tokens,
            duration_secs: duration,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_code_fix_task() {
        let task = BenchmarkTask::code_fix(
            "TEST-001",
            "Fix null pointer in parser",
            vec!["src/parser.rs".to_string()],
        );

        assert_eq!(task.task_type, TaskType::CodeFix);
        assert_eq!(task.difficulty, 3);
        assert!(task.tags.contains(&"code".to_string()));
    }

    #[test]
    fn test_outcome_passed() {
        let outcome = TaskOutcome::passed(
            "TEST-001",
            vec!["src/main.rs".to_string()],
            1000,
            5.5,
        );

        assert!(outcome.passed);
        assert_eq!(outcome.tokens_used, 1000);
    }

    #[test]
    fn test_outcome_failed() {
        let outcome = TaskOutcome::failed("TEST-001", "Timeout", 500, 60.0);

        assert!(!outcome.passed);
        assert_eq!(outcome.error, Some("Timeout".to_string()));
    }
}
