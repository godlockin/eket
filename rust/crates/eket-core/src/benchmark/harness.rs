//! Benchmark harness - orchestrates evaluation runs

use crate::benchmark::{
    metrics::{EvalMetrics, MetricsCollector},
    tasks::{BenchmarkTask, TaskOutcome, TaskType},
};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

/// Configuration for benchmark runs
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BenchmarkConfig {
    /// Name of the benchmark run
    pub name: String,
    /// Dataset path
    pub dataset_path: PathBuf,
    /// Output directory for results
    pub output_dir: PathBuf,
    /// Maximum tasks to run (0 = all)
    pub max_tasks: usize,
    /// Task types to include (empty = all)
    pub task_types: Vec<TaskType>,
    /// Difficulty range (min, max)
    pub difficulty_range: (u8, u8),
    /// Timeout per task in seconds
    pub timeout_secs: u64,
    /// Cost per 1K tokens for reporting
    pub cost_per_1k_tokens: f64,
    /// Tags to filter by (empty = no filter)
    pub tags: Vec<String>,
}

impl Default for BenchmarkConfig {
    fn default() -> Self {
        Self {
            name: "eket-benchmark".to_string(),
            dataset_path: PathBuf::from("tests/benchmark/datasets"),
            output_dir: PathBuf::from("tests/benchmark/results"),
            max_tasks: 0,
            task_types: vec![],
            difficulty_range: (1, 5),
            timeout_secs: 300,
            cost_per_1k_tokens: 0.015,
            tags: vec![],
        }
    }
}

/// Result of a benchmark run
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BenchmarkResult {
    /// Config used
    pub config: BenchmarkConfig,
    /// Overall metrics
    pub metrics: EvalMetrics,
    /// Individual task outcomes
    pub outcomes: Vec<TaskOutcome>,
    /// Timestamp
    pub timestamp: u64,
    /// Duration of entire run
    pub run_duration_secs: f64,
}

/// The benchmark harness
pub struct BenchmarkHarness {
    config: BenchmarkConfig,
    tasks: Vec<BenchmarkTask>,
    outcomes: Vec<TaskOutcome>,
    collector: MetricsCollector,
}

impl BenchmarkHarness {
    /// Create a new harness with config
    pub fn new(config: BenchmarkConfig) -> Self {
        let collector = MetricsCollector::new().with_cost(config.cost_per_1k_tokens);
        Self {
            config,
            tasks: Vec::new(),
            outcomes: Vec::new(),
            collector,
        }
    }

    /// Load tasks from dataset
    pub fn load_tasks(&mut self, tasks: Vec<BenchmarkTask>) {
        let filtered: Vec<_> = tasks
            .into_iter()
            .filter(|t| self.filter_task(t))
            .collect();

        self.tasks = if self.config.max_tasks > 0 {
            filtered.into_iter().take(self.config.max_tasks).collect()
        } else {
            filtered
        };
    }

    /// Check if a task passes the config filters
    fn filter_task(&self, task: &BenchmarkTask) -> bool {
        // Filter by type
        if !self.config.task_types.is_empty() && !self.config.task_types.contains(&task.task_type) {
            return false;
        }

        // Filter by difficulty
        let (min, max) = self.config.difficulty_range;
        if task.difficulty < min || task.difficulty > max {
            return false;
        }

        // Filter by tags
        if !self.config.tags.is_empty() {
            let has_tag = self.config.tags.iter().any(|t| task.tags.contains(t));
            if !has_tag {
                return false;
            }
        }

        true
    }

    /// Get the number of tasks loaded
    pub fn task_count(&self) -> usize {
        self.tasks.len()
    }

    /// Record an outcome (called by executor)
    pub fn record_outcome(&mut self, outcome: TaskOutcome) {
        let task = self.tasks.iter().find(|t| t.id == outcome.task_id);
        if let Some(task) = task {
            let task_type = format!("{:?}", task.task_type).to_lowercase();
            self.collector.record(
                &outcome.task_id,
                &task_type,
                task.difficulty,
                outcome.passed,
                outcome.tokens_used,
                outcome.duration_secs,
            );
        }
        self.outcomes.push(outcome);
    }

    /// Finalize and generate result
    pub fn finalize(self) -> BenchmarkResult {
        // Capture elapsed BEFORE consuming collector
        let run_duration = self.collector.elapsed().as_secs_f64();
        let metrics = self.collector.finalize();

        BenchmarkResult {
            config: self.config,
            metrics,
            outcomes: self.outcomes,
            timestamp: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs(),
            run_duration_secs: run_duration,
        }
    }

    /// Get tasks for iteration
    pub fn tasks(&self) -> &[BenchmarkTask] {
        &self.tasks
    }
}

impl BenchmarkResult {
    /// Generate markdown report
    pub fn to_markdown(&self) -> String {
        let mut output = String::new();

        output.push_str(&format!("# Benchmark Report: {}\n\n", self.config.name));
        output.push_str(&format!("**Run Time**: {} seconds\n", self.run_duration_secs as u64));
        output.push_str(&format!("**Tasks**: {}\n\n", self.outcomes.len()));

        output.push_str(&self.metrics.to_markdown());

        output.push_str("\n## Task Results\n\n");
        output.push_str("| Task | Status | Tokens | Duration |\n");
        output.push_str("|------|--------|--------|----------|\n");

        for outcome in &self.outcomes {
            let status = if outcome.passed { "✅ Pass" } else { "❌ Fail" };
            output.push_str(&format!(
                "| {} | {} | {} | {:.1}s |\n",
                outcome.task_id, status, outcome.tokens_used, outcome.duration_secs
            ));
        }

        output
    }

    /// Save to JSON file
    pub fn save_json(&self, path: &std::path::Path) -> std::io::Result<()> {
        let json = serde_json::to_string_pretty(self)?;
        std::fs::write(path, json)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_harness_creation() {
        let config = BenchmarkConfig::default();
        let harness = BenchmarkHarness::new(config);
        assert_eq!(harness.task_count(), 0);
    }

    #[test]
    fn test_load_tasks() {
        let config = BenchmarkConfig::default();
        let mut harness = BenchmarkHarness::new(config);

        let tasks = vec![
            BenchmarkTask::code_fix("T1", "Fix bug", vec!["src/main.rs".to_string()]),
            BenchmarkTask::config_change("T2", "Update config", "config.yaml"),
        ];

        harness.load_tasks(tasks);
        assert_eq!(harness.task_count(), 2);
    }

    #[test]
    fn test_filter_by_type() {
        let mut config = BenchmarkConfig::default();
        config.task_types = vec![TaskType::CodeFix];

        let mut harness = BenchmarkHarness::new(config);

        let tasks = vec![
            BenchmarkTask::code_fix("T1", "Fix bug", vec!["src/main.rs".to_string()]),
            BenchmarkTask::config_change("T2", "Update config", "config.yaml"),
        ];

        harness.load_tasks(tasks);
        assert_eq!(harness.task_count(), 1);
        assert_eq!(harness.tasks()[0].id, "T1");
    }

    #[test]
    fn test_filter_by_difficulty() {
        let mut config = BenchmarkConfig::default();
        config.difficulty_range = (3, 5);

        let mut harness = BenchmarkHarness::new(config);

        let tasks = vec![
            BenchmarkTask::code_fix("T1", "Fix bug", vec!["src/main.rs".to_string()]), // difficulty 3
            BenchmarkTask::config_change("T2", "Update config", "config.yaml"),        // difficulty 2
        ];

        harness.load_tasks(tasks);
        assert_eq!(harness.task_count(), 1);
        assert_eq!(harness.tasks()[0].id, "T1");
    }

    #[test]
    fn test_max_tasks() {
        let mut config = BenchmarkConfig::default();
        config.max_tasks = 1;

        let mut harness = BenchmarkHarness::new(config);

        let tasks = vec![
            BenchmarkTask::code_fix("T1", "Fix bug", vec![]),
            BenchmarkTask::code_fix("T2", "Fix another", vec![]),
        ];

        harness.load_tasks(tasks);
        assert_eq!(harness.task_count(), 1);
    }

    #[test]
    fn test_record_and_finalize() {
        let config = BenchmarkConfig::default();
        let mut harness = BenchmarkHarness::new(config);

        let tasks = vec![
            BenchmarkTask::code_fix("T1", "Fix bug", vec!["src/main.rs".to_string()]),
        ];
        harness.load_tasks(tasks);

        harness.record_outcome(TaskOutcome::passed("T1", vec!["src/main.rs".to_string()], 1000, 5.0));

        let result = harness.finalize();
        assert_eq!(result.metrics.total_tasks, 1);
        assert_eq!(result.metrics.passed, 1);
        assert!((result.metrics.pass_rate - 1.0).abs() < 0.01);
    }

    #[test]
    fn test_markdown_report() {
        let config = BenchmarkConfig::default();
        let mut harness = BenchmarkHarness::new(config);

        let tasks = vec![
            BenchmarkTask::code_fix("T1", "Fix bug", vec![]),
        ];
        harness.load_tasks(tasks);
        harness.record_outcome(TaskOutcome::passed("T1", vec![], 1000, 5.0));

        let result = harness.finalize();
        let md = result.to_markdown();

        assert!(md.contains("Benchmark Report"));
        assert!(md.contains("T1"));
        assert!(md.contains("Pass"));
    }
}
