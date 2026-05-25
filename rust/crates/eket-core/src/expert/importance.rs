//! Agent Importance Score - measures expert contribution to task completion
//!
//! Based on DyLAN paper: "Dynamic LLM-Agent Network"
//! https://github.com/SALT-NLP/DyLAN
//!
//! Key metrics:
//! - Task contribution: did the expert's output directly solve the problem?
//! - Quality impact: did the expert improve solution quality?
//! - Efficiency: tokens used vs value delivered
//! - Adoption rate: how often were the expert's suggestions adopted?

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Score for a single expert's contribution to a task
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentImportanceScore {
    /// Expert identifier
    pub agent_id: String,
    /// Expert display name
    pub agent_name: String,
    /// Direct contribution to task completion (0.0 - 1.0)
    pub task_contribution: f64,
    /// Impact on output quality (0.0 - 1.0)
    pub quality_impact: f64,
    /// Efficiency score: value / cost (0.0 - 1.0)
    pub efficiency_score: f64,
    /// Rate of suggestions being adopted (0.0 - 1.0)
    pub adoption_rate: f64,
    /// Overall importance score (weighted average)
    pub overall_score: f64,
    /// Tokens consumed by this expert
    pub tokens_used: u64,
    /// Number of contributions made
    pub contribution_count: u32,
}

impl AgentImportanceScore {
    /// Create a new score with all zeros
    pub fn new(agent_id: &str, agent_name: &str) -> Self {
        Self {
            agent_id: agent_id.to_string(),
            agent_name: agent_name.to_string(),
            task_contribution: 0.0,
            quality_impact: 0.0,
            efficiency_score: 0.0,
            adoption_rate: 0.0,
            overall_score: 0.0,
            tokens_used: 0,
            contribution_count: 0,
        }
    }

    /// Calculate overall score with default weights
    pub fn calculate_overall(&mut self) {
        self.overall_score = self.calculate_overall_with_weights(0.4, 0.3, 0.2, 0.1);
    }

    /// Calculate overall score with custom weights
    pub fn calculate_overall_with_weights(
        &self,
        task_weight: f64,
        quality_weight: f64,
        efficiency_weight: f64,
        adoption_weight: f64,
    ) -> f64 {
        self.task_contribution * task_weight
            + self.quality_impact * quality_weight
            + self.efficiency_score * efficiency_weight
            + self.adoption_rate * adoption_weight
    }
}

/// Record of a single expert contribution
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExpertContribution {
    /// Expert identifier
    pub agent_id: String,
    /// Task identifier
    pub task_id: String,
    /// Type of contribution
    pub contribution_type: ContributionType,
    /// Tokens used for this contribution
    pub tokens_used: u64,
    /// Whether the contribution was adopted
    pub adopted: bool,
    /// Quality rating (1-5)
    pub quality_rating: Option<u8>,
    /// Timestamp
    pub timestamp: u64,
    /// Raw output content (for analysis)
    pub content: Option<String>,
}

/// Types of expert contributions
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ContributionType {
    /// Analysis or assessment
    Analysis,
    /// Specific recommendation
    Recommendation,
    /// Code or implementation
    Implementation,
    /// Review feedback
    Review,
    /// Risk identification
    RiskIdentification,
    /// Solution proposal
    Solution,
}

/// Calculator for agent importance scores
pub struct ImportanceCalculator {
    /// Contributions by agent
    contributions: HashMap<String, Vec<ExpertContribution>>,
    /// Agent metadata (id -> name)
    agent_names: HashMap<String, String>,
    /// Weight configuration
    weights: ImportanceWeights,
}

/// Configurable weights for importance calculation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportanceWeights {
    pub task_contribution: f64,
    pub quality_impact: f64,
    pub efficiency: f64,
    pub adoption_rate: f64,
}

impl Default for ImportanceWeights {
    fn default() -> Self {
        Self {
            task_contribution: 0.4,
            quality_impact: 0.3,
            efficiency: 0.2,
            adoption_rate: 0.1,
        }
    }
}

impl ImportanceCalculator {
    /// Create a new calculator
    pub fn new() -> Self {
        Self {
            contributions: HashMap::new(),
            agent_names: HashMap::new(),
            weights: ImportanceWeights::default(),
        }
    }

    /// Create with custom weights
    pub fn with_weights(weights: ImportanceWeights) -> Self {
        Self {
            contributions: HashMap::new(),
            agent_names: HashMap::new(),
            weights,
        }
    }

    /// Register an agent
    pub fn register_agent(&mut self, agent_id: &str, agent_name: &str) {
        self.agent_names.insert(agent_id.to_string(), agent_name.to_string());
        self.contributions.entry(agent_id.to_string()).or_default();
    }

    /// Record a contribution
    pub fn record_contribution(&mut self, contribution: ExpertContribution) {
        self.contributions
            .entry(contribution.agent_id.clone())
            .or_default()
            .push(contribution);
    }

    /// Calculate scores for all agents
    pub fn calculate_scores(&self) -> Vec<AgentImportanceScore> {
        let total_tokens: u64 = self.contributions.values()
            .flat_map(|v| v.iter())
            .map(|c| c.tokens_used)
            .sum();

        let max_tokens = total_tokens.max(1) as f64;

        self.contributions.keys().map(|agent_id| {
            let contributions = self.contributions.get(agent_id).unwrap();
            let agent_name = self.agent_names.get(agent_id)
                .cloned()
                .unwrap_or_else(|| agent_id.clone());

            let mut score = AgentImportanceScore::new(agent_id, &agent_name);

            if contributions.is_empty() {
                return score;
            }

            // Count metrics
            let total = contributions.len() as f64;
            let adopted = contributions.iter().filter(|c| c.adopted).count() as f64;
            let solutions = contributions.iter()
                .filter(|c| matches!(c.contribution_type, ContributionType::Solution | ContributionType::Implementation))
                .count() as f64;
            let tokens: u64 = contributions.iter().map(|c| c.tokens_used).sum();
            let quality_sum: f64 = contributions.iter()
                .filter_map(|c| c.quality_rating)
                .map(|r| r as f64 / 5.0)
                .sum();
            let quality_count = contributions.iter()
                .filter(|c| c.quality_rating.is_some())
                .count() as f64;

            // Calculate component scores
            score.contribution_count = contributions.len() as u32;
            score.tokens_used = tokens;

            // Task contribution: solutions / total contributions
            score.task_contribution = if total > 0.0 { solutions / total } else { 0.0 };

            // Quality impact: average quality rating
            score.quality_impact = if quality_count > 0.0 { quality_sum / quality_count } else { 0.5 };

            // Efficiency: inverse of token proportion (less tokens = more efficient)
            let token_proportion = tokens as f64 / max_tokens;
            score.efficiency_score = 1.0 - (token_proportion * 0.8); // Scale down impact

            // Adoption rate: adopted / total
            score.adoption_rate = if total > 0.0 { adopted / total } else { 0.0 };

            // Calculate overall
            score.overall_score = score.calculate_overall_with_weights(
                self.weights.task_contribution,
                self.weights.quality_impact,
                self.weights.efficiency,
                self.weights.adoption_rate,
            );

            score
        }).collect()
    }

    /// Generate a team score report
    pub fn generate_report(&self, task_id: &str) -> TeamScoreReport {
        let scores = self.calculate_scores();
        let mut sorted_scores = scores.clone();
        sorted_scores.sort_by(|a, b| b.overall_score.partial_cmp(&a.overall_score).unwrap());

        let total_tokens: u64 = scores.iter().map(|s| s.tokens_used).sum();
        let total_contributions: u32 = scores.iter().map(|s| s.contribution_count).sum();
        let avg_score: f64 = if !scores.is_empty() {
            scores.iter().map(|s| s.overall_score).sum::<f64>() / scores.len() as f64
        } else {
            0.0
        };

        TeamScoreReport {
            task_id: task_id.to_string(),
            scores: sorted_scores,
            total_tokens,
            total_contributions,
            average_score: avg_score,
            timestamp: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_secs(),
        }
    }
}

impl Default for ImportanceCalculator {
    fn default() -> Self {
        Self::new()
    }
}

/// Team score report for a task
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TeamScoreReport {
    /// Task identifier
    pub task_id: String,
    /// Scores sorted by overall importance (highest first)
    pub scores: Vec<AgentImportanceScore>,
    /// Total tokens used by the team
    pub total_tokens: u64,
    /// Total contributions
    pub total_contributions: u32,
    /// Average team score
    pub average_score: f64,
    /// Report timestamp
    pub timestamp: u64,
}

impl TeamScoreReport {
    /// Get the top N performers
    pub fn top_performers(&self, n: usize) -> &[AgentImportanceScore] {
        &self.scores[..n.min(self.scores.len())]
    }

    /// Get agents below a score threshold (candidates for removal)
    pub fn underperformers(&self, threshold: f64) -> Vec<&AgentImportanceScore> {
        self.scores.iter().filter(|s| s.overall_score < threshold).collect()
    }

    /// Format as markdown table
    pub fn to_markdown(&self) -> String {
        let mut output = String::new();
        output.push_str(&format!("## Team Score Report: {}\n\n", self.task_id));
        output.push_str("| Rank | Expert | Score | Task | Quality | Efficiency | Adoption | Tokens |\n");
        output.push_str("|------|--------|-------|------|---------|------------|----------|--------|\n");

        for (i, score) in self.scores.iter().enumerate() {
            output.push_str(&format!(
                "| {} | {} | {:.2} | {:.2} | {:.2} | {:.2} | {:.2} | {} |\n",
                i + 1,
                score.agent_name,
                score.overall_score,
                score.task_contribution,
                score.quality_impact,
                score.efficiency_score,
                score.adoption_rate,
                score.tokens_used,
            ));
        }

        output.push_str(&format!(
            "\n**Summary**: {} experts, {} contributions, {} tokens, avg score {:.2}\n",
            self.scores.len(),
            self.total_contributions,
            self.total_tokens,
            self.average_score,
        ));

        output
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_new_score() {
        let score = AgentImportanceScore::new("expert.001", "Test Expert");
        assert_eq!(score.agent_id, "expert.001");
        assert_eq!(score.overall_score, 0.0);
    }

    #[test]
    fn test_calculate_overall() {
        let mut score = AgentImportanceScore::new("expert.001", "Test");
        score.task_contribution = 0.8;
        score.quality_impact = 0.7;
        score.efficiency_score = 0.6;
        score.adoption_rate = 0.5;
        score.calculate_overall();

        // 0.8 * 0.4 + 0.7 * 0.3 + 0.6 * 0.2 + 0.5 * 0.1 = 0.32 + 0.21 + 0.12 + 0.05 = 0.70
        assert!((score.overall_score - 0.70).abs() < 0.01);
    }

    #[test]
    fn test_calculator_basic() {
        let mut calc = ImportanceCalculator::new();
        calc.register_agent("architect", "陈架构");
        calc.register_agent("backend", "张后端");

        calc.record_contribution(ExpertContribution {
            agent_id: "architect".to_string(),
            task_id: "TASK-001".to_string(),
            contribution_type: ContributionType::Solution,
            tokens_used: 1000,
            adopted: true,
            quality_rating: Some(4),
            timestamp: 0,
            content: None,
        });

        calc.record_contribution(ExpertContribution {
            agent_id: "backend".to_string(),
            task_id: "TASK-001".to_string(),
            contribution_type: ContributionType::Analysis,
            tokens_used: 500,
            adopted: true,
            quality_rating: Some(3),
            timestamp: 0,
            content: None,
        });

        let scores = calc.calculate_scores();
        assert_eq!(scores.len(), 2);

        // Architect should have higher task_contribution (solution)
        let architect = scores.iter().find(|s| s.agent_id == "architect").unwrap();
        let backend = scores.iter().find(|s| s.agent_id == "backend").unwrap();

        assert!(architect.task_contribution > backend.task_contribution);
    }

    #[test]
    fn test_report_generation() {
        let mut calc = ImportanceCalculator::new();
        calc.register_agent("expert1", "Expert One");
        calc.register_agent("expert2", "Expert Two");

        calc.record_contribution(ExpertContribution {
            agent_id: "expert1".to_string(),
            task_id: "TASK-001".to_string(),
            contribution_type: ContributionType::Solution,
            tokens_used: 1000,
            adopted: true,
            quality_rating: Some(5),
            timestamp: 0,
            content: None,
        });

        let report = calc.generate_report("TASK-001");
        assert_eq!(report.task_id, "TASK-001");
        assert_eq!(report.total_contributions, 1);

        let md = report.to_markdown();
        assert!(md.contains("Expert One"));
        assert!(md.contains("Team Score Report"));
    }

    #[test]
    fn test_underperformers() {
        let mut calc = ImportanceCalculator::new();
        calc.register_agent("good", "Good Expert");
        calc.register_agent("bad", "Bad Expert");

        // Good expert: solution adopted
        calc.record_contribution(ExpertContribution {
            agent_id: "good".to_string(),
            task_id: "TASK-001".to_string(),
            contribution_type: ContributionType::Solution,
            tokens_used: 100,
            adopted: true,
            quality_rating: Some(5),
            timestamp: 0,
            content: None,
        });

        // Bad expert: analysis not adopted
        calc.record_contribution(ExpertContribution {
            agent_id: "bad".to_string(),
            task_id: "TASK-001".to_string(),
            contribution_type: ContributionType::Analysis,
            tokens_used: 1000,
            adopted: false,
            quality_rating: Some(2),
            timestamp: 0,
            content: None,
        });

        let report = calc.generate_report("TASK-001");
        let underperformers = report.underperformers(0.5);

        // Bad expert should be underperformer
        assert!(underperformers.iter().any(|s| s.agent_id == "bad"));
    }
}
