//! EKET DAG Schema - Rust Type Definitions
//!
//! Unified DAG YAML schema for Rust/Node/Shell engines.
//! Generated from: jira/schemas/dag.schema.json
//!
//! Security limits (DoS protection):
//! - nodes.maxItems: 1000
//! - script.maxLength: 10000 (10KB)
//! - items.maxItems: 100 (foreach expansion)

use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use thiserror::Error;

/// Security constants for DoS protection
pub mod limits {
    /// Maximum number of nodes in a DAG
    pub const MAX_NODES: usize = 1000;
    /// Maximum length of a script field (bytes)
    pub const MAX_SCRIPT_LENGTH: usize = 10000;
    /// Maximum items in foreach expansion
    pub const MAX_FOREACH_ITEMS: usize = 100;
}

/// Node types
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum NodeType {
    /// Default task node - executes script
    #[default]
    Task,
    /// Gate node - conditional check
    Gate,
    /// Foreach node - dynamic expansion
    Foreach,
}

/// Gate result for conditional branching
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum GateResult {
    Success,
    Failure,
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

/// Single task node in the DAG
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DagNode {
    /// Unique node identifier (TASK-NNN or custom id like gate-check)
    pub id: String,

    /// Node type: task (default), gate (conditional), foreach (dynamic expansion)
    #[serde(default, rename = "type")]
    pub node_type: NodeType,

    /// Command or script to execute (required for task/foreach types)
    #[serde(default)]
    pub script: String,

    /// Shell command for gate nodes. Exit 0 = success, non-zero = failure
    pub condition: Option<String>,

    /// Conditional execution: '<gate-id>.success' or '<gate-id>.failure'
    pub when: Option<String>,

    /// Items for foreach expansion. Each item becomes a parallel node with ${item} substituted
    #[serde(default)]
    pub items: Vec<String>,

    /// List of dependency node IDs
    #[serde(default)]
    pub deps: Vec<String>,

    /// Node-level retry count (overrides settings)
    pub retry: Option<u32>,

    /// Node-level timeout in seconds (overrides settings)
    pub timeout: Option<u64>,

    /// Human-readable description
    pub description: Option<String>,
}

impl DagNode {
    /// Check if this node should execute based on gate result
    pub fn should_execute(&self, gate_results: &HashMap<String, GateResult>) -> bool {
        match &self.when {
            None => true,
            Some(when_cond) => {
                // Parse "gate-id.success" or "gate-id.failure"
                if let Some((gate_id, expected)) = when_cond.rsplit_once('.') {
                    match gate_results.get(gate_id) {
                        Some(GateResult::Success) => expected == "success",
                        Some(GateResult::Failure) => expected == "failure",
                        None => false, // Gate not yet executed
                    }
                } else {
                    false // Invalid format
                }
            }
        }
    }

    /// Expand foreach node into multiple task nodes
    pub fn expand_foreach(&self) -> Vec<DagNode> {
        if self.node_type != NodeType::Foreach || self.items.is_empty() {
            return vec![];
        }

        self.items
            .iter()
            .enumerate()
            .map(|(idx, item)| {
                let expanded_id = format!("{}_{}", self.id, idx);
                let expanded_script = self.script.replace("${item}", item);
                DagNode {
                    id: expanded_id,
                    node_type: NodeType::Task,
                    script: expanded_script,
                    condition: None,
                    when: self.when.clone(),
                    items: vec![],
                    deps: self.deps.clone(),
                    retry: self.retry,
                    timeout: self.timeout,
                    description: self.description.clone().map(|d| format!("{} (item={})", d, item)),
                }
            })
            .collect()
    }
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

    #[error("Invalid when condition: {message}")]
    InvalidWhen { message: String },
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

        // Collect node IDs and gate IDs
        let node_ids: HashSet<&str> = self.nodes.iter().map(|n| n.id.as_str()).collect();
        let gate_ids: HashSet<&str> = self
            .nodes
            .iter()
            .filter(|n| n.node_type == NodeType::Gate)
            .map(|n| n.id.as_str())
            .collect();

        // Validate each node
        for (i, node) in self.nodes.iter().enumerate() {
            // Relaxed ID pattern for custom nodes (gate-check, parallel-batch, etc.)
            let valid_id = node.id.chars().next().map_or(false, |c| c.is_ascii_alphabetic())
                && node.id.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-');
            if !valid_id {
                errors.push(ValidationError::InvalidFormat {
                    field: format!("nodes[{}].id", i),
                    message: "must start with letter and contain only alphanumeric, underscore, or dash".to_string(),
                });
            }

            // Validate based on node type
            match node.node_type {
                NodeType::Task => {
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
                }
                NodeType::Gate => {
                    if node.condition.is_none() || node.condition.as_ref().map_or(true, |c| c.is_empty()) {
                        errors.push(ValidationError::MissingField {
                            field: format!("nodes[{}].condition", i),
                        });
                    }
                }
                NodeType::Foreach => {
                    if node.script.is_empty() {
                        errors.push(ValidationError::MissingField {
                            field: format!("nodes[{}].script", i),
                        });
                    }
                    if node.items.is_empty() {
                        errors.push(ValidationError::MissingField {
                            field: format!("nodes[{}].items", i),
                        });
                    } else if node.items.len() > limits::MAX_FOREACH_ITEMS {
                        errors.push(ValidationError::LimitExceeded {
                            field: format!("nodes[{}].items", i),
                            message: format!(
                                "exceeds maximum limit of {} items",
                                limits::MAX_FOREACH_ITEMS
                            ),
                        });
                    }
                }
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

            // Validate when condition references
            if let Some(when_cond) = &node.when {
                if let Some((gate_id, expected)) = when_cond.rsplit_once('.') {
                    if expected != "success" && expected != "failure" {
                        errors.push(ValidationError::InvalidWhen {
                            message: format!(
                                "nodes[{}].when must end with .success or .failure",
                                i
                            ),
                        });
                    } else if !gate_ids.contains(gate_id) {
                        errors.push(ValidationError::InvalidWhen {
                            message: format!(
                                "nodes[{}].when references non-existent gate '{}'",
                                i, gate_id
                            ),
                        });
                    }
                } else {
                    errors.push(ValidationError::InvalidWhen {
                        message: format!(
                            "nodes[{}].when must match pattern '<gate-id>.success' or '<gate-id>.failure'",
                            i
                        ),
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

    /// Expand all foreach nodes and return expanded DAG
    /// Foreach nodes are replaced with their expanded task nodes
    pub fn expand_foreach_nodes(&self) -> Self {
        let mut expanded_nodes = Vec::new();
        let mut foreach_expansions: HashMap<String, Vec<String>> = HashMap::new();

        // First pass: expand foreach nodes
        for node in &self.nodes {
            if node.node_type == NodeType::Foreach && !node.items.is_empty() {
                let expanded = node.expand_foreach();
                let expanded_ids: Vec<String> = expanded.iter().map(|n| n.id.clone()).collect();
                foreach_expansions.insert(node.id.clone(), expanded_ids);
                expanded_nodes.extend(expanded);
            } else {
                expanded_nodes.push(node.clone());
            }
        }

        // Second pass: update deps that reference foreach nodes
        for node in &mut expanded_nodes {
            let mut new_deps = Vec::new();
            for dep in &node.deps {
                if let Some(expanded_ids) = foreach_expansions.get(dep) {
                    // Replace foreach dep with all expanded node ids
                    new_deps.extend(expanded_ids.clone());
                } else {
                    new_deps.push(dep.clone());
                }
            }
            node.deps = new_deps;
        }

        DagSchema {
            version: self.version.clone(),
            epic: self.epic.clone(),
            nodes: expanded_nodes,
            settings: self.settings.clone(),
        }
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

    const CONDITIONAL_YAML: &str = r#"
version: "1.0"
epic: EPIC-017
nodes:
  - id: TASK-001
    script: "echo start"
    deps: []
  - id: gate-check
    type: gate
    condition: "exit 0"
    deps: [TASK-001]
  - id: success-path
    script: "echo success"
    deps: [gate-check]
    when: "gate-check.success"
  - id: failure-path
    script: "echo failure"
    deps: [gate-check]
    when: "gate-check.failure"
settings:
  max_parallel: 3
"#;

    const FOREACH_YAML: &str = r#"
version: "1.0"
epic: EPIC-017
nodes:
  - id: TASK-001
    script: "echo start"
    deps: []
  - id: batch-process
    type: foreach
    items: ["a", "b", "c"]
    script: "echo processing ${item}"
    deps: [TASK-001]
  - id: TASK-002
    script: "echo done"
    deps: [batch-process]
settings:
  max_parallel: 3
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

    #[test]
    fn test_conditional_dag_parsing() {
        let dag = DagSchema::from_yaml(CONDITIONAL_YAML).expect("should parse");
        assert_eq!(dag.nodes.len(), 4);

        // Check gate node
        let gate = dag.nodes.iter().find(|n| n.id == "gate-check").unwrap();
        assert_eq!(gate.node_type, NodeType::Gate);
        assert_eq!(gate.condition, Some("exit 0".to_string()));

        // Check conditional nodes
        let success = dag.nodes.iter().find(|n| n.id == "success-path").unwrap();
        assert_eq!(success.when, Some("gate-check.success".to_string()));

        let failure = dag.nodes.iter().find(|n| n.id == "failure-path").unwrap();
        assert_eq!(failure.when, Some("gate-check.failure".to_string()));
    }

    #[test]
    fn test_conditional_dag_validation() {
        let dag = DagSchema::from_yaml(CONDITIONAL_YAML).unwrap();
        assert!(dag.validate().is_ok());
    }

    #[test]
    fn test_foreach_dag_parsing() {
        let dag = DagSchema::from_yaml(FOREACH_YAML).expect("should parse");
        assert_eq!(dag.nodes.len(), 3);

        // Check foreach node
        let batch = dag.nodes.iter().find(|n| n.id == "batch-process").unwrap();
        assert_eq!(batch.node_type, NodeType::Foreach);
        assert_eq!(batch.items, vec!["a", "b", "c"]);
        assert_eq!(batch.script, "echo processing ${item}");
    }

    #[test]
    fn test_foreach_expansion() {
        let dag = DagSchema::from_yaml(FOREACH_YAML).unwrap();
        let expanded = dag.expand_foreach_nodes();

        // Original had 3 nodes, foreach expands to 3, so we have:
        // TASK-001, batch-process_0, batch-process_1, batch-process_2, TASK-002
        assert_eq!(expanded.nodes.len(), 5);

        // Check expanded nodes
        let expanded_0 = expanded.nodes.iter().find(|n| n.id == "batch-process_0").unwrap();
        assert_eq!(expanded_0.script, "echo processing a");
        assert_eq!(expanded_0.node_type, NodeType::Task);

        let expanded_1 = expanded.nodes.iter().find(|n| n.id == "batch-process_1").unwrap();
        assert_eq!(expanded_1.script, "echo processing b");

        let expanded_2 = expanded.nodes.iter().find(|n| n.id == "batch-process_2").unwrap();
        assert_eq!(expanded_2.script, "echo processing c");

        // Check TASK-002 now depends on all expanded nodes
        let task_002 = expanded.nodes.iter().find(|n| n.id == "TASK-002").unwrap();
        assert!(task_002.deps.contains(&"batch-process_0".to_string()));
        assert!(task_002.deps.contains(&"batch-process_1".to_string()));
        assert!(task_002.deps.contains(&"batch-process_2".to_string()));
    }

    #[test]
    fn test_should_execute_with_gate_result() {
        let dag = DagSchema::from_yaml(CONDITIONAL_YAML).unwrap();

        let success_node = dag.nodes.iter().find(|n| n.id == "success-path").unwrap();
        let failure_node = dag.nodes.iter().find(|n| n.id == "failure-path").unwrap();

        // Gate success
        let mut gate_results = HashMap::new();
        gate_results.insert("gate-check".to_string(), GateResult::Success);

        assert!(success_node.should_execute(&gate_results));
        assert!(!failure_node.should_execute(&gate_results));

        // Gate failure
        gate_results.insert("gate-check".to_string(), GateResult::Failure);
        assert!(!success_node.should_execute(&gate_results));
        assert!(failure_node.should_execute(&gate_results));
    }

    #[test]
    fn test_invalid_when_reference() {
        let yaml = r#"
version: "1.0"
epic: EPIC-017
nodes:
  - id: TASK-001
    script: "echo test"
    when: "nonexistent-gate.success"
"#;
        let dag = DagSchema::from_yaml(yaml).unwrap();
        let result = dag.validate();
        assert!(result.is_err());
        let errors = result.unwrap_err();
        assert!(errors.iter().any(|e| matches!(e, ValidationError::InvalidWhen { .. })));
    }
}
