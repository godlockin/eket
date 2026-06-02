//! TASK-653: Linear Chain Fusion (Flume-style)
//!
//! Detects pure linear chains (single-in, single-out sequences) in DAG nodes
//! and fuses them into single compound scripts to reduce scheduling overhead.
//!
//! ## Problem
//!
//! Linear dependency chains like `lint -> build -> test -> deploy` require
//! 4 separate scheduling rounds and 4 shell invocations. This creates
//! unnecessary overhead when nodes execute sequentially anyway.
//!
//! ## Solution
//!
//! Detect linear chains and fuse them into single compound scripts:
//! `lint && build && test && deploy` executed as one unit.
//!
//! ## Algorithm
//!
//! 1. **detect_linear_chains()**: Find chain heads (in_degree=0 or predecessor has out_degree>1)
//! 2. **trace_chain()**: Follow single-in/single-out nodes from head
//! 3. **fuse_chain()**: Combine scripts with `&&` operator
//!
//! ## Constraints
//!
//! Nodes are NOT fused if:
//! - Node type is Gate or Foreach (only Task nodes)
//! - Node has `when` condition (conditional execution)
//! - Node has multiple predecessors or successors
//!
//! ## Usage
//!
//! ```ignore
//! let chains = detect_linear_chains(&schema);
//! for chain in chains {
//!     let fused = fuse_chain(&chain, &schema);
//!     // fused.script = "script1 && script2 && ..."
//! }
//! ```

use std::collections::{HashMap, HashSet};

use chrono::{DateTime, Utc};

use crate::dag::schema::{DagNode, DagSchema, NodeType};

/// A fused node representing multiple linear chain nodes executed as one
#[derive(Debug, Clone)]
pub struct FusedNode {
    /// Synthetic ID for the fused node (e.g., "fused_lint")
    pub id: String,
    /// Combined script: "script1 && script2 && script3"
    pub fused_script: String,
    /// Original node IDs in execution order
    pub original_nodes: Vec<String>,
    /// Retry count (max of all nodes in chain)
    pub retry: u32,
    /// Timeout (sum of all nodes in chain)
    pub timeout: u64,
    /// Max priority of all nodes in chain
    pub priority: u8,
    /// Earliest deadline among all nodes in chain
    pub deadline: Option<DateTime<Utc>>,
}

impl FusedNode {
    /// Create a FusedNode from a chain of DagNodes
    ///
    /// # Arguments
    /// * `chain` - Slice of DagNode references in execution order
    /// * `schema` - DagSchema for resolving node settings
    ///
    /// # Returns
    /// A FusedNode with combined script and aggregated settings
    pub fn from_chain(chain: &[&DagNode], schema: &DagSchema) -> Self {
        let scripts: Vec<String> = chain.iter().map(|n| n.script.clone()).collect();
        let fused_script = scripts.join(" && ");

        let mut max_retry = 0u32;
        let mut total_timeout = 0u64;
        let mut max_priority = 0u8;
        let mut earliest_deadline: Option<DateTime<Utc>> = None;

        for node in chain {
            let (retry, timeout) = schema.resolve_node_settings(node);
            max_retry = max_retry.max(retry);
            total_timeout = total_timeout.saturating_add(timeout);
            max_priority = max_priority.max(node.priority);

            // Track earliest deadline (parse from ISO 8601 string)
            if let Some(ref dl_str) = node.deadline {
                if let Ok(dl) = DateTime::parse_from_rfc3339(dl_str) {
                    let dl_utc = dl.with_timezone(&Utc);
                    earliest_deadline = Some(match earliest_deadline {
                        None => dl_utc,
                        Some(current) => current.min(dl_utc),
                    });
                }
            }
        }

        FusedNode {
            id: format!("fused_{}", chain[0].id),
            fused_script,
            original_nodes: chain.iter().map(|n| n.id.clone()).collect(),
            retry: max_retry,
            timeout: total_timeout,
            priority: max_priority,
            deadline: earliest_deadline,
        }
    }
}

/// Detect all pure linear chains in a DAG
///
/// A linear chain is a sequence of task nodes where each node has exactly
/// one predecessor and one successor (except chain ends).
///
/// # Arguments
/// * `schema` - The DAG schema (should be post-foreach-expansion)
///
/// # Returns
/// Vector of chains, where each chain is a vector of node IDs in execution order.
/// Only chains with 2+ nodes are returned.
pub fn detect_linear_chains(schema: &DagSchema) -> Vec<Vec<String>> {
    // Build dependency maps
    let mut deps: HashMap<String, Vec<String>> = HashMap::new();
    let mut dependents: HashMap<String, Vec<String>> = HashMap::new();

    for node in &schema.nodes {
        deps.insert(node.id.clone(), node.deps.clone());
        for dep in &node.deps {
            dependents
                .entry(dep.clone())
                .or_default()
                .push(node.id.clone());
        }
    }

    detect_linear_chains_with_maps(schema, &deps, &dependents)
}

/// Detect linear chains using pre-computed dependency maps
///
/// This is the internal implementation that allows scheduler to reuse its maps.
pub fn detect_linear_chains_with_maps(
    schema: &DagSchema,
    deps: &HashMap<String, Vec<String>>,
    dependents: &HashMap<String, Vec<String>>,
) -> Vec<Vec<String>> {
    let mut chains = Vec::new();
    let mut visited = HashSet::new();

    for node in &schema.nodes {
        if visited.contains(&node.id) {
            continue;
        }

        // Skip non-task nodes (Gate, Foreach cannot be fused)
        if node.node_type != NodeType::Task {
            visited.insert(node.id.clone());
            continue;
        }

        // Skip conditional nodes
        if node.when.is_some() {
            visited.insert(node.id.clone());
            continue;
        }

        // Check if this node can be a chain head
        if is_chain_head(&node.id, deps, dependents) {
            let chain = trace_chain(&node.id, schema, deps, dependents, &mut visited);
            if chain.len() >= 2 {
                chains.push(chain);
            }
        }
    }

    chains
}

/// Check if a node is a valid chain head
///
/// A node is a chain head if:
/// - It has in_degree=0 (root node) AND out_degree=1
/// - OR it has in_degree=1 AND its predecessor has out_degree>1 (fan-out point)
fn is_chain_head(
    node_id: &str,
    deps: &HashMap<String, Vec<String>>,
    dependents: &HashMap<String, Vec<String>>,
) -> bool {
    let in_degree = deps.get(node_id).map_or(0, |d| d.len());
    let out_degree = dependents.get(node_id).map_or(0, |d| d.len());

    // Root with single child
    if in_degree == 0 {
        return out_degree == 1;
    }

    // After a fan-out point: parent has multiple children, this one continues linearly
    if in_degree == 1 {
        let parent = &deps.get(node_id).unwrap()[0];
        let parent_out_degree = dependents.get(parent).map_or(0, |d| d.len());
        return parent_out_degree > 1 && out_degree == 1;
    }

    false
}

/// Trace a chain from the head node
///
/// Follows single-in/single-out nodes until:
/// - A node has multiple children (fan-out)
/// - A node's child has multiple parents (fan-in)
/// - A non-task or conditional node is encountered
fn trace_chain(
    head_id: &str,
    schema: &DagSchema,
    deps: &HashMap<String, Vec<String>>,
    dependents: &HashMap<String, Vec<String>>,
    visited: &mut HashSet<String>,
) -> Vec<String> {
    let mut chain = Vec::new();
    let mut current = head_id.to_string();

    loop {
        if visited.contains(&current) {
            break;
        }

        // Find the node
        let node = match schema.nodes.iter().find(|n| n.id == current) {
            Some(n) => n,
            None => break,
        };

        // Only fuse Task nodes without conditional execution
        if node.node_type != NodeType::Task || node.when.is_some() {
            break;
        }

        visited.insert(current.clone());
        chain.push(current.clone());

        // Check if node has exactly one child
        let children = dependents.get(&current);
        if children.is_none() || children.unwrap().len() != 1 {
            break; // Leaf or fan-out
        }

        let next_id = &children.unwrap()[0];

        // Check if child has exactly one parent (this node)
        let next_deps = deps.get(next_id);
        if next_deps.is_none() || next_deps.unwrap().len() != 1 {
            break; // Fan-in
        }

        // Check if child is a valid continuation (Task without condition)
        let next_node = match schema.nodes.iter().find(|n| n.id == *next_id) {
            Some(n) => n,
            None => break,
        };

        if next_node.node_type != NodeType::Task || next_node.when.is_some() {
            break;
        }

        current = next_id.clone();
    }

    chain
}

/// Fuse a chain of node IDs into a FusedNode
///
/// # Arguments
/// * `chain` - Slice of node IDs in execution order
/// * `schema` - DagSchema to look up node definitions
///
/// # Returns
/// A FusedNode with combined script: "script1 && script2 && ..."
pub fn fuse_chain(chain: &[String], schema: &DagSchema) -> Option<FusedNode> {
    if chain.len() < 2 {
        return None;
    }

    let chain_nodes: Vec<&DagNode> = chain
        .iter()
        .filter_map(|id| schema.nodes.iter().find(|n| n.id == *id))
        .collect();

    if chain_nodes.len() != chain.len() {
        return None; // Some nodes not found
    }

    Some(FusedNode::from_chain(&chain_nodes, schema))
}

/// Detect and create all fused chains from a DAG
///
/// Convenience function that combines detection and fusion.
///
/// # Arguments
/// * `schema` - The DAG schema (should be post-foreach-expansion)
/// * `deps` - Pre-computed node -> dependencies map
/// * `dependents` - Pre-computed node -> dependents (reverse deps) map
///
/// # Returns
/// Tuple of:
/// - Vec<FusedNode>: All fused chains
/// - HashMap<String, Vec<String>>: fused_id -> original node IDs
/// - HashMap<String, String>: original_id -> fused_id
pub fn detect_and_fuse_all(
    schema: &DagSchema,
    deps: &HashMap<String, Vec<String>>,
    dependents: &HashMap<String, Vec<String>>,
) -> (
    Vec<FusedNode>,
    HashMap<String, Vec<String>>,
    HashMap<String, String>,
) {
    let chains = detect_linear_chains_with_maps(schema, deps, dependents);

    let mut fused_nodes = Vec::new();
    let mut fused_node_map = HashMap::new();
    let mut original_to_fused = HashMap::new();

    for chain in chains {
        if let Some(fused) = fuse_chain(&chain, schema) {
            for original_id in &fused.original_nodes {
                original_to_fused.insert(original_id.clone(), fused.id.clone());
            }
            fused_node_map.insert(fused.id.clone(), fused.original_nodes.clone());
            fused_nodes.push(fused);
        }
    }

    (fused_nodes, fused_node_map, original_to_fused)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::dag::schema::DagSchema;

    const LINEAR_DAG: &str = r#"
version: "1.0"
epic: EPIC-653
nodes:
  - id: lint
    script: "npm run lint"
    deps: []
  - id: build
    script: "npm run build"
    deps: [lint]
  - id: test
    script: "npm run test"
    deps: [build]
  - id: deploy
    script: "npm run deploy"
    deps: [test]
settings:
  max_parallel: 2
"#;

    const PARALLEL_DAG: &str = r#"
version: "1.0"
epic: EPIC-653
nodes:
  - id: root
    script: "echo root"
    deps: []
  - id: branch-a
    script: "echo a"
    deps: [root]
  - id: branch-b
    script: "echo b"
    deps: [root]
  - id: merge
    script: "echo merge"
    deps: [branch-a, branch-b]
settings:
  max_parallel: 2
"#;

    const CONDITIONAL_DAG: &str = r#"
version: "1.0"
epic: EPIC-653
nodes:
  - id: start
    script: "echo start"
    deps: []
  - id: gate
    type: gate
    script: "test -f flag.txt"
    deps: [start]
  - id: success-path
    script: "echo success"
    deps: [gate]
    when: "gate.success"
settings:
  max_parallel: 2
"#;

    #[test]
    fn test_detect_linear_chains_simple() {
        let dag = DagSchema::from_yaml(LINEAR_DAG).unwrap();
        let chains = detect_linear_chains(&dag);

        assert_eq!(chains.len(), 1);
        assert_eq!(chains[0].len(), 4);
        assert_eq!(chains[0], vec!["lint", "build", "test", "deploy"]);
    }

    #[test]
    fn test_detect_no_chains_in_parallel_dag() {
        let dag = DagSchema::from_yaml(PARALLEL_DAG).unwrap();
        let chains = detect_linear_chains(&dag);

        // Fan-out at root, fan-in at merge - no linear chains
        assert!(chains.is_empty());
    }

    #[test]
    fn test_detect_no_chains_with_gates() {
        let dag = DagSchema::from_yaml(CONDITIONAL_DAG).unwrap();
        let chains = detect_linear_chains(&dag);

        // Gate nodes break chains
        assert!(chains.is_empty());
    }

    #[test]
    fn test_fuse_chain_combines_scripts() {
        let dag = DagSchema::from_yaml(LINEAR_DAG).unwrap();
        let chain = vec![
            "lint".to_string(),
            "build".to_string(),
            "test".to_string(),
            "deploy".to_string(),
        ];

        let fused = fuse_chain(&chain, &dag).unwrap();

        assert_eq!(fused.id, "fused_lint");
        assert_eq!(
            fused.fused_script,
            "npm run lint && npm run build && npm run test && npm run deploy"
        );
        assert_eq!(fused.original_nodes.len(), 4);
    }

    #[test]
    fn test_fuse_chain_aggregates_timeout() {
        let yaml = r#"
version: "1.0"
epic: EPIC-653
nodes:
  - id: step-1
    script: "sleep 1"
    timeout: 100
    deps: []
  - id: step-2
    script: "sleep 2"
    timeout: 200
    deps: [step-1]
  - id: step-3
    script: "sleep 3"
    timeout: 300
    deps: [step-2]
settings:
  max_parallel: 1
"#;
        let dag = DagSchema::from_yaml(yaml).unwrap();
        let chain = vec![
            "step-1".to_string(),
            "step-2".to_string(),
            "step-3".to_string(),
        ];

        let fused = fuse_chain(&chain, &dag).unwrap();

        // Timeout should be sum: 100 + 200 + 300 = 600
        assert_eq!(fused.timeout, 600);
    }

    #[test]
    fn test_fuse_chain_takes_max_retry() {
        let yaml = r#"
version: "1.0"
epic: EPIC-653
nodes:
  - id: step-1
    script: "echo 1"
    retry: 1
    deps: []
  - id: step-2
    script: "echo 2"
    retry: 5
    deps: [step-1]
  - id: step-3
    script: "echo 3"
    retry: 2
    deps: [step-2]
settings:
  max_parallel: 1
"#;
        let dag = DagSchema::from_yaml(yaml).unwrap();
        let chain = vec![
            "step-1".to_string(),
            "step-2".to_string(),
            "step-3".to_string(),
        ];

        let fused = fuse_chain(&chain, &dag).unwrap();

        // Retry should be max: max(1, 5, 2) = 5
        assert_eq!(fused.retry, 5);
    }

    #[test]
    fn test_fuse_chain_takes_max_priority() {
        let yaml = r#"
version: "1.0"
epic: EPIC-653
nodes:
  - id: low-1
    script: "echo 1"
    priority: 10
    deps: []
  - id: high-2
    script: "echo 2"
    priority: 90
    deps: [low-1]
  - id: low-3
    script: "echo 3"
    priority: 20
    deps: [high-2]
settings:
  max_parallel: 1
"#;
        let dag = DagSchema::from_yaml(yaml).unwrap();
        let chain = vec![
            "low-1".to_string(),
            "high-2".to_string(),
            "low-3".to_string(),
        ];

        let fused = fuse_chain(&chain, &dag).unwrap();

        // Priority should be max: max(10, 90, 20) = 90
        assert_eq!(fused.priority, 90);
    }

    #[test]
    fn test_fuse_chain_takes_earliest_deadline() {
        use chrono::{Duration, Utc};

        let now = Utc::now();
        let deadline1 = now + Duration::hours(3);
        let deadline2 = now + Duration::hours(1); // earliest
        let deadline3 = now + Duration::hours(2);

        let yaml = format!(
            r#"
version: "1.0"
epic: EPIC-653
nodes:
  - id: step-1
    script: "echo 1"
    deadline: "{}"
    deps: []
  - id: step-2
    script: "echo 2"
    deadline: "{}"
    deps: [step-1]
  - id: step-3
    script: "echo 3"
    deadline: "{}"
    deps: [step-2]
settings:
  max_parallel: 1
"#,
            deadline1.to_rfc3339(),
            deadline2.to_rfc3339(),
            deadline3.to_rfc3339()
        );

        let dag = DagSchema::from_yaml(&yaml).unwrap();
        let chain = vec![
            "step-1".to_string(),
            "step-2".to_string(),
            "step-3".to_string(),
        ];

        let fused = fuse_chain(&chain, &dag).unwrap();

        // Deadline should be earliest (deadline2)
        assert!(fused.deadline.is_some());
        let fused_deadline = fused.deadline.unwrap();
        // Allow 1 second tolerance for test timing
        assert!(
            (fused_deadline - deadline2).num_seconds().abs() < 2,
            "Expected deadline close to {}, got {}",
            deadline2,
            fused_deadline
        );
    }

    #[test]
    fn test_detect_and_fuse_all() {
        let dag = DagSchema::from_yaml(LINEAR_DAG).unwrap();

        let mut deps: HashMap<String, Vec<String>> = HashMap::new();
        let mut dependents: HashMap<String, Vec<String>> = HashMap::new();
        for node in &dag.nodes {
            deps.insert(node.id.clone(), node.deps.clone());
            for dep in &node.deps {
                dependents
                    .entry(dep.clone())
                    .or_default()
                    .push(node.id.clone());
            }
        }

        let (fused_nodes, fused_node_map, original_to_fused) =
            detect_and_fuse_all(&dag, &deps, &dependents);

        assert_eq!(fused_nodes.len(), 1);
        assert_eq!(fused_node_map.len(), 1);
        assert_eq!(original_to_fused.len(), 4);

        // All original nodes map to the same fused node
        assert_eq!(original_to_fused.get("lint"), Some(&"fused_lint".to_string()));
        assert_eq!(
            original_to_fused.get("build"),
            Some(&"fused_lint".to_string())
        );
        assert_eq!(
            original_to_fused.get("test"),
            Some(&"fused_lint".to_string())
        );
        assert_eq!(
            original_to_fused.get("deploy"),
            Some(&"fused_lint".to_string())
        );
    }

    #[test]
    fn test_fuse_chain_too_short() {
        let dag = DagSchema::from_yaml(LINEAR_DAG).unwrap();

        // Single node chain should return None
        let short_chain = vec!["lint".to_string()];
        assert!(fuse_chain(&short_chain, &dag).is_none());

        // Empty chain should return None
        let empty_chain: Vec<String> = vec![];
        assert!(fuse_chain(&empty_chain, &dag).is_none());
    }

    #[test]
    fn test_partial_linear_with_branch() {
        // DAG: A -> B -> C (linear), C -> D, C -> E (fan-out)
        let yaml = r#"
version: "1.0"
epic: EPIC-653
nodes:
  - id: A
    script: "echo A"
    deps: []
  - id: B
    script: "echo B"
    deps: [A]
  - id: C
    script: "echo C"
    deps: [B]
  - id: D
    script: "echo D"
    deps: [C]
  - id: E
    script: "echo E"
    deps: [C]
settings:
  max_parallel: 2
"#;
        let dag = DagSchema::from_yaml(yaml).unwrap();
        let chains = detect_linear_chains(&dag);

        // A -> B -> C is a linear chain (C has fan-out, but chain ends at C)
        assert_eq!(chains.len(), 1);
        assert_eq!(chains[0], vec!["A", "B", "C"]);
    }

    #[test]
    fn test_multiple_independent_chains() {
        // Two independent linear chains: A -> B -> C and X -> Y -> Z
        let yaml = r#"
version: "1.0"
epic: EPIC-653
nodes:
  - id: A
    script: "echo A"
    deps: []
  - id: B
    script: "echo B"
    deps: [A]
  - id: C
    script: "echo C"
    deps: [B]
  - id: X
    script: "echo X"
    deps: []
  - id: Y
    script: "echo Y"
    deps: [X]
  - id: Z
    script: "echo Z"
    deps: [Y]
settings:
  max_parallel: 2
"#;
        let dag = DagSchema::from_yaml(yaml).unwrap();
        let chains = detect_linear_chains(&dag);

        assert_eq!(chains.len(), 2);
        // Order may vary, check both are present
        let chain_sets: Vec<Vec<&str>> = chains
            .iter()
            .map(|c| c.iter().map(|s| s.as_str()).collect())
            .collect();
        assert!(chain_sets.contains(&vec!["A", "B", "C"]));
        assert!(chain_sets.contains(&vec!["X", "Y", "Z"]));
    }

    #[test]
    fn test_10_node_benchmark_chain() {
        let yaml = r#"
version: "1.0"
epic: EPIC-653
nodes:
  - id: n01
    script: "echo 01"
    deps: []
  - id: n02
    script: "echo 02"
    deps: [n01]
  - id: n03
    script: "echo 03"
    deps: [n02]
  - id: n04
    script: "echo 04"
    deps: [n03]
  - id: n05
    script: "echo 05"
    deps: [n04]
  - id: n06
    script: "echo 06"
    deps: [n05]
  - id: n07
    script: "echo 07"
    deps: [n06]
  - id: n08
    script: "echo 08"
    deps: [n07]
  - id: n09
    script: "echo 09"
    deps: [n08]
  - id: n10
    script: "echo 10"
    deps: [n09]
settings:
  max_parallel: 1
"#;
        let dag = DagSchema::from_yaml(yaml).unwrap();
        let chains = detect_linear_chains(&dag);

        assert_eq!(chains.len(), 1);
        assert_eq!(chains[0].len(), 10);

        let fused = fuse_chain(&chains[0], &dag).unwrap();
        assert_eq!(fused.original_nodes.len(), 10);
        assert!(fused.fused_script.contains("echo 01 && echo 02"));
        assert!(fused.fused_script.contains("&& echo 10"));
    }
}
