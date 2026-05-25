//! Evaluation metrics collection

use serde::{Deserialize, Serialize};
use std::time::{Duration, Instant};

/// Collected evaluation metrics
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EvalMetrics {
    /// Total tasks evaluated
    pub total_tasks: u32,
    /// Tasks passed
    pub passed: u32,
    /// Tasks failed
    pub failed: u32,
    /// Pass rate (0.0 - 1.0)
    pub pass_rate: f64,
    /// Total tokens consumed
    pub total_tokens: u64,
    /// Average tokens per task
    pub avg_tokens_per_task: f64,
    /// Total cost (USD)
    pub total_cost: f64,
    /// Average cost per task
    pub avg_cost_per_task: f64,
    /// Total duration in seconds
    pub total_duration_secs: f64,
    /// Average duration per task
    pub avg_duration_per_task: f64,
    /// Metrics by task type
    pub by_type: std::collections::HashMap<String, TypeMetrics>,
    /// Metrics by difficulty
    pub by_difficulty: std::collections::HashMap<u8, TypeMetrics>,
}

/// Metrics for a specific category
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct TypeMetrics {
    pub total: u32,
    pub passed: u32,
    pub pass_rate: f64,
    pub avg_tokens: f64,
    pub avg_duration: f64,
}

/// Collector for evaluation metrics
pub struct MetricsCollector {
    start_time: Instant,
    tasks: Vec<TaskMetric>,
    cost_per_1k_tokens: f64,
}

/// Single task metric
#[derive(Debug, Clone)]
struct TaskMetric {
    task_id: String,
    task_type: String,
    difficulty: u8,
    passed: bool,
    tokens: u64,
    duration_secs: f64,
}

impl MetricsCollector {
    /// Create a new collector
    pub fn new() -> Self {
        Self {
            start_time: Instant::now(),
            tasks: Vec::new(),
            cost_per_1k_tokens: 0.015, // Default Claude pricing
        }
    }

    /// Set cost per 1K tokens
    pub fn with_cost(mut self, cost_per_1k: f64) -> Self {
        self.cost_per_1k_tokens = cost_per_1k;
        self
    }

    /// Record a task result
    pub fn record(
        &mut self,
        task_id: &str,
        task_type: &str,
        difficulty: u8,
        passed: bool,
        tokens: u64,
        duration_secs: f64,
    ) {
        self.tasks.push(TaskMetric {
            task_id: task_id.to_string(),
            task_type: task_type.to_string(),
            difficulty,
            passed,
            tokens,
            duration_secs,
        });
    }

    /// Calculate final metrics
    pub fn finalize(&self) -> EvalMetrics {
        let total = self.tasks.len() as u32;
        let passed = self.tasks.iter().filter(|t| t.passed).count() as u32;
        let failed = total - passed;

        let total_tokens: u64 = self.tasks.iter().map(|t| t.tokens).sum();
        let total_duration: f64 = self.tasks.iter().map(|t| t.duration_secs).sum();

        let pass_rate = if total > 0 { passed as f64 / total as f64 } else { 0.0 };
        let avg_tokens = if total > 0 { total_tokens as f64 / total as f64 } else { 0.0 };
        let avg_duration = if total > 0 { total_duration / total as f64 } else { 0.0 };

        let total_cost = total_tokens as f64 / 1000.0 * self.cost_per_1k_tokens;
        let avg_cost = if total > 0 { total_cost / total as f64 } else { 0.0 };

        // Aggregate by type
        let mut by_type: std::collections::HashMap<String, TypeMetrics> = std::collections::HashMap::new();
        for task in &self.tasks {
            let entry = by_type.entry(task.task_type.clone()).or_default();
            entry.total += 1;
            if task.passed {
                entry.passed += 1;
            }
        }
        for (_, metrics) in by_type.iter_mut() {
            metrics.pass_rate = if metrics.total > 0 {
                metrics.passed as f64 / metrics.total as f64
            } else {
                0.0
            };
        }

        // Aggregate by difficulty
        let mut by_difficulty: std::collections::HashMap<u8, TypeMetrics> = std::collections::HashMap::new();
        for task in &self.tasks {
            let entry = by_difficulty.entry(task.difficulty).or_default();
            entry.total += 1;
            if task.passed {
                entry.passed += 1;
            }
        }
        for (_, metrics) in by_difficulty.iter_mut() {
            metrics.pass_rate = if metrics.total > 0 {
                metrics.passed as f64 / metrics.total as f64
            } else {
                0.0
            };
        }

        EvalMetrics {
            total_tasks: total,
            passed,
            failed,
            pass_rate,
            total_tokens,
            avg_tokens_per_task: avg_tokens,
            total_cost,
            avg_cost_per_task: avg_cost,
            total_duration_secs: total_duration,
            avg_duration_per_task: avg_duration,
            by_type,
            by_difficulty,
        }
    }

    /// Get elapsed time
    pub fn elapsed(&self) -> Duration {
        self.start_time.elapsed()
    }
}

impl Default for MetricsCollector {
    fn default() -> Self {
        Self::new()
    }
}

impl EvalMetrics {
    /// Format as markdown report
    pub fn to_markdown(&self) -> String {
        let mut output = String::new();

        output.push_str("# Evaluation Metrics Report\n\n");

        output.push_str("## Summary\n\n");
        output.push_str("| Metric | Value |\n");
        output.push_str("|--------|-------|\n");
        output.push_str(&format!("| Total Tasks | {} |\n", self.total_tasks));
        output.push_str(&format!("| Passed | {} |\n", self.passed));
        output.push_str(&format!("| Failed | {} |\n", self.failed));
        output.push_str(&format!("| **Pass Rate** | **{:.1}%** |\n", self.pass_rate * 100.0));
        output.push_str(&format!("| Total Tokens | {} |\n", self.total_tokens));
        output.push_str(&format!("| Avg Tokens/Task | {:.0} |\n", self.avg_tokens_per_task));
        output.push_str(&format!("| Total Cost | ${:.2} |\n", self.total_cost));
        output.push_str(&format!("| Avg Cost/Task | ${:.3} |\n", self.avg_cost_per_task));
        output.push_str(&format!("| Total Duration | {:.1}s |\n", self.total_duration_secs));
        output.push_str(&format!("| Avg Duration/Task | {:.1}s |\n", self.avg_duration_per_task));

        if !self.by_type.is_empty() {
            output.push_str("\n## By Task Type\n\n");
            output.push_str("| Type | Total | Passed | Pass Rate |\n");
            output.push_str("|------|-------|--------|----------|\n");
            for (task_type, metrics) in &self.by_type {
                output.push_str(&format!(
                    "| {} | {} | {} | {:.1}% |\n",
                    task_type,
                    metrics.total,
                    metrics.passed,
                    metrics.pass_rate * 100.0
                ));
            }
        }

        if !self.by_difficulty.is_empty() {
            output.push_str("\n## By Difficulty\n\n");
            output.push_str("| Difficulty | Total | Passed | Pass Rate |\n");
            output.push_str("|------------|-------|--------|----------|\n");
            let mut difficulties: Vec<_> = self.by_difficulty.iter().collect();
            difficulties.sort_by_key(|(d, _)| *d);
            for (difficulty, metrics) in difficulties {
                output.push_str(&format!(
                    "| {} | {} | {} | {:.1}% |\n",
                    difficulty,
                    metrics.total,
                    metrics.passed,
                    metrics.pass_rate * 100.0
                ));
            }
        }

        output
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_collector_basic() {
        let mut collector = MetricsCollector::new();

        collector.record("TASK-001", "code_fix", 3, true, 1000, 5.0);
        collector.record("TASK-002", "code_fix", 3, false, 1500, 8.0);
        collector.record("TASK-003", "config", 2, true, 500, 2.0);

        let metrics = collector.finalize();

        assert_eq!(metrics.total_tasks, 3);
        assert_eq!(metrics.passed, 2);
        assert_eq!(metrics.failed, 1);
        assert!((metrics.pass_rate - 0.666).abs() < 0.01);
        assert_eq!(metrics.total_tokens, 3000);
    }

    #[test]
    fn test_metrics_by_type() {
        let mut collector = MetricsCollector::new();

        collector.record("T1", "code_fix", 3, true, 1000, 5.0);
        collector.record("T2", "code_fix", 3, true, 1000, 5.0);
        collector.record("T3", "config", 2, false, 500, 2.0);

        let metrics = collector.finalize();

        assert_eq!(metrics.by_type.get("code_fix").unwrap().total, 2);
        assert_eq!(metrics.by_type.get("code_fix").unwrap().passed, 2);
        assert_eq!(metrics.by_type.get("config").unwrap().total, 1);
        assert_eq!(metrics.by_type.get("config").unwrap().passed, 0);
    }

    #[test]
    fn test_markdown_output() {
        let mut collector = MetricsCollector::new();
        collector.record("T1", "code_fix", 3, true, 1000, 5.0);

        let metrics = collector.finalize();
        let md = metrics.to_markdown();

        assert!(md.contains("Evaluation Metrics"));
        assert!(md.contains("Pass Rate"));
        assert!(md.contains("100.0%"));
    }
}
