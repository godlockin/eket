//! EKET DAG Schema - Rust Type Definitions
//!
//! Unified DAG YAML schema for Rust/Node/Shell engines.
//! Generated from: jira/schemas/dag.schema.json
//!
//! Security limits (DoS protection):
//! - nodes.maxItems: 1000
//! - script.maxLength: 10000 (10KB)

use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use thiserror::Error;

/// Security constants for DoS protection
pub mod limits {
    /// Maximum number of nodes in a DAG
    pub const MAX_NODES: usize = 1000;
    /// Maximum length of a script field (bytes)
    pub const MAX_SCRIPT_LENGTH: usize = 10000;
}

/// Node-level failure handling strategy
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum OnFailure {
    /// Stop execution on failure (default)
    #[default]
    Stop,
    /// Continue with other nodes
    Continue,
    /// Rollback completed nodes
    Rollback,
}

/// Node type for DAG scheduling
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum NodeType {
    /// Standard task node (default)
    #[default]
    Task,
    /// Gate node for conditional branching
    Gate,
    /// Foreach node for parallel expansion
    Foreach,
}

/// DAG execution settings
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct DagSettings {
    /// Max concurrent tasks (Rust/Node only, Shell ignores)
    #[serde(default = "default_max_parallel")]
    pub max_parallel: u32,

    /// Default retry count for all nodes
    #[serde(default = "default_retry_count")]
    pub retry_count: u32,

    /// Default timeout for all nodes in seconds
    #[serde(default = "default_timeout_seconds")]
    pub timeout_seconds: u64,

    /// Behavior when a node fails
    #[serde(default)]
    pub on_failure: OnFailure,
}

fn default_max_parallel() -> u32 {
    3
}
fn default_retry_count() -> u32 {
    2
}
fn default_timeout_seconds() -> u64 {
    3600
}

/// Default priority for nodes (middle of 0-100 range)
fn default_priority() -> u8 {
    50
}

/// Single task node in the DAG
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DagNode {
    /// Unique task identifier (pattern: TASK-NNN)
    pub id: String,

    /// Command or script to execute
    pub script: String,

    /// List of dependency task IDs
    #[serde(default)]
    pub deps: Vec<String>,

    /// Node-level retry count (overrides settings)
    pub retry: Option<u32>,

    /// Node-level timeout in seconds (overrides settings)
    pub timeout: Option<u64>,

    /// Human-readable description
    pub description: Option<String>,

    /// Priority level (0-100, higher = more important)
    /// Borg-style priority scheduling: higher priority nodes execute first
    #[serde(default = "default_priority")]
    pub priority: u8,

    /// Deadline in ISO 8601 format (e.g., "2026-06-02T15:00:00Z")
    /// Nodes with approaching deadlines get priority boost (+30)
    #[serde(default)]
    pub deadline: Option<String>,

    /// Node type: task, gate, or foreach
    #[serde(rename = "type", default)]
    pub node_type: NodeType,

    /// Conditional execution expression (e.g., "gate.success")
    #[serde(default)]
    pub when: Option<String>,

    /// Gate condition (for Gate nodes only)
    #[serde(default)]
    pub condition: Option<String>,
}

/// Complete DAG definition
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DagSchema {
    /// Schema version (e.g., "1.0")
    pub version: String,

    /// Parent EPIC identifier (pattern: EPIC-NNN)
    pub epic: String,

    /// List of task nodes in the DAG
    pub nodes: Vec<DagNode>,

    /// Execution settings
    #[serde(default)]
    pub settings: DagSettings,
}

/// Validation error types
#[derive(Debug, Error)]
pub enum ValidationError {
    #[error("Missing required field: {field}")]
    MissingField { field: String },

    #[error("Invalid format for {field}: {message}")]
    InvalidFormat { field: String, message: String },

    #[error("Unknown dependency: {dep} in node {node}")]
    UnknownDep { node: String, dep: String },

    #[error("Circular dependency detected: {cycle}")]
    CycleDetected { cycle: String },

    #[error("Nodes array must not be empty")]
    EmptyNodes,

    #[error("Limit exceeded: {field} - {message}")]
    LimitExceeded { field: String, message: String },
}

impl DagSchema {
    /// Parse DAG from YAML string
    pub fn from_yaml(yaml: &str) -> Result<Self, serde_yaml::Error> {
        serde_yaml::from_str(yaml)
    }

    /// Validate DAG structure
    pub fn validate(&self) -> Result<(), Vec<ValidationError>> {
        let mut errors = Vec::new();

        // Check version format
        if !self.version.chars().all(|c| c.is_ascii_digit() || c == '.') {
            errors.push(ValidationError::InvalidFormat {
                field: "version".to_string(),
                message: "must match pattern X.Y".to_string(),
            });
        }

        // Check epic format
        if !self.epic.starts_with("EPIC-")
            || !self.epic[5..].chars().all(|c| c.is_ascii_digit())
        {
            errors.push(ValidationError::InvalidFormat {
                field: "epic".to_string(),
                message: "must match pattern EPIC-NNN".to_string(),
            });
        }

        // Check nodes not empty
        if self.nodes.is_empty() {
            errors.push(ValidationError::EmptyNodes);
            return Err(errors);
        }

        // Security: Check max nodes limit (DoS protection)
        if self.nodes.len() > limits::MAX_NODES {
            errors.push(ValidationError::LimitExceeded {
                field: "nodes".to_string(),
                message: format!("exceeds maximum limit of {}", limits::MAX_NODES),
            });
            return Err(errors);
        }

        // Collect node IDs
        let node_ids: HashSet<&str> = self.nodes.iter().map(|n| n.id.as_str()).collect();

        // Validate each node
        for (i, node) in self.nodes.iter().enumerate() {
            // Check id format
            if !node.id.starts_with("TASK-")
                || !node.id[5..].chars().all(|c| c.is_ascii_digit())
            {
                errors.push(ValidationError::InvalidFormat {
                    field: format!("nodes[{}].id", i),
                    message: "must match pattern TASK-NNN".to_string(),
                });
            }

            // Check script not empty and within length limit
            if node.script.is_empty() {
                errors.push(ValidationError::MissingField {
                    field: format!("nodes[{}].script", i),
                });
            } else if node.script.len() > limits::MAX_SCRIPT_LENGTH {
                errors.push(ValidationError::LimitExceeded {
                    field: format!("nodes[{}].script", i),
                    message: format!(
                        "exceeds maximum length of {} characters",
                        limits::MAX_SCRIPT_LENGTH
                    ),
                });
            }

            // Check deps exist
            for dep in &node.deps {
                if !node_ids.contains(dep.as_str()) {
                    errors.push(ValidationError::UnknownDep {
                        node: node.id.clone(),
                        dep: dep.clone(),
                    });
                }
            }
        }

        // Detect cycles
        if let Some(cycle) = self.detect_cycle() {
            errors.push(ValidationError::CycleDetected { cycle });
        }

        if errors.is_empty() {
            Ok(())
        } else {
            Err(errors)
        }
    }

    /// Detect cycles using DFS
    fn detect_cycle(&self) -> Option<String> {
        let mut visited = HashSet::new();
        let mut rec_stack = HashSet::new();

        // Build adjacency map
        let adj: HashMap<&str, Vec<&str>> = self
            .nodes
            .iter()
            .map(|n| (n.id.as_str(), n.deps.iter().map(|s| s.as_str()).collect()))
            .collect();

        fn dfs<'a>(
            node: &'a str,
            adj: &HashMap<&'a str, Vec<&'a str>>,
            visited: &mut HashSet<&'a str>,
            rec_stack: &mut HashSet<&'a str>,
            path: &mut Vec<&'a str>,
        ) -> Option<Vec<&'a str>> {
            if rec_stack.contains(node) {
                path.push(node);
                return Some(path.clone());
            }
            if visited.contains(node) {
                return None;
            }

            visited.insert(node);
            rec_stack.insert(node);
            path.push(node);

            if let Some(deps) = adj.get(node) {
                for dep in deps {
                    if let Some(cycle) = dfs(dep, adj, visited, rec_stack, path) {
                        return Some(cycle);
                    }
                }
            }

            rec_stack.remove(node);
            path.pop();
            None
        }

        for node in self.nodes.iter() {
            let mut path = Vec::new();
            if let Some(cycle) = dfs(&node.id, &adj, &mut visited, &mut rec_stack, &mut path) {
                return Some(cycle.join(" -> "));
            }
        }

        None
    }

    /// Resolve node settings with defaults
    pub fn resolve_node_settings(&self, node: &DagNode) -> (u32, u64) {
        let retry = node.retry.unwrap_or(self.settings.retry_count);
        let timeout = node.timeout.unwrap_or(self.settings.timeout_seconds);
        (retry, timeout)
    }

    /// Get topologically sorted node IDs
    pub fn topological_order(&self) -> Result<Vec<&str>, ValidationError> {
        let mut in_degree: HashMap<&str, usize> = HashMap::new();
        let mut adj: HashMap<&str, Vec<&str>> = HashMap::new();

        for node in &self.nodes {
            in_degree.entry(node.id.as_str()).or_insert(0);
            adj.entry(node.id.as_str()).or_default();

            for dep in &node.deps {
                *in_degree.entry(node.id.as_str()).or_insert(0) += 1;
                adj.entry(dep.as_str()).or_default().push(node.id.as_str());
            }
        }

        let mut queue: Vec<&str> = in_degree
            .iter()
            .filter(|(_, &d)| d == 0)
            .map(|(&id, _)| id)
            .collect();

        let mut result = Vec::new();

        while let Some(node) = queue.pop() {
            result.push(node);

            if let Some(neighbors) = adj.get(node) {
                for &neighbor in neighbors {
                    if let Some(deg) = in_degree.get_mut(neighbor) {
                        *deg -= 1;
                        if *deg == 0 {
                            queue.push(neighbor);
                        }
                    }
                }
            }
        }

        if result.len() != self.nodes.len() {
            Err(ValidationError::CycleDetected {
                cycle: "cycle detected during topological sort".to_string(),
            })
        } else {
            Ok(result)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const VALID_YAML: &str = r#"
version: "1.0"
epic: EPIC-017
nodes:
  - id: TASK-001
    script: "echo hello"
    deps: []
  - id: TASK-002
    script: "echo world"
    deps: [TASK-001]
settings:
  max_parallel: 3
  on_failure: stop
"#;

    const INVALID_CYCLE_YAML: &str = r#"
version: "1.0"
epic: EPIC-017
nodes:
  - id: TASK-001
    script: "echo a"
    deps: [TASK-002]
  - id: TASK-002
    script: "echo b"
    deps: [TASK-001]
"#;

    const INVALID_MISSING_ID: &str = r#"
version: "1.0"
epic: EPIC-017
nodes:
  - script: "echo no id"
"#;

    #[test]
    fn test_parse_valid_yaml() {
        let dag = DagSchema::from_yaml(VALID_YAML).expect("should parse");
        assert_eq!(dag.version, "1.0");
        assert_eq!(dag.epic, "EPIC-017");
        assert_eq!(dag.nodes.len(), 2);
    }

    #[test]
    fn test_validate_valid() {
        let dag = DagSchema::from_yaml(VALID_YAML).unwrap();
        assert!(dag.validate().is_ok());
    }

    #[test]
    fn test_validate_cycle() {
        let dag = DagSchema::from_yaml(INVALID_CYCLE_YAML).unwrap();
        let result = dag.validate();
        assert!(result.is_err());
        let errors = result.unwrap_err();
        assert!(errors.iter().any(|e| matches!(e, ValidationError::CycleDetected { .. })));
    }

    #[test]
    fn test_topological_order() {
        let dag = DagSchema::from_yaml(VALID_YAML).unwrap();
        let order = dag.topological_order().unwrap();
        // TASK-001 must come before TASK-002
        let pos_001 = order.iter().position(|&x| x == "TASK-001").unwrap();
        let pos_002 = order.iter().position(|&x| x == "TASK-002").unwrap();
        assert!(pos_001 < pos_002);
    }

    #[test]
    fn test_resolve_settings() {
        let dag = DagSchema::from_yaml(VALID_YAML).unwrap();
        let node = &dag.nodes[0];
        let (retry, timeout) = dag.resolve_node_settings(node);
        assert_eq!(retry, 2); // default
        assert_eq!(timeout, 3600); // default
    }
}
