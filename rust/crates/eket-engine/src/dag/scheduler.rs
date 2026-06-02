//! DAG Scheduler - Borg-style Priority Scheduling
//!
//! Implements priority-based scheduling for ready nodes:
//! - Base priority: 0-100 (default 50)
//! - Critical path bonus: +20
//! - Deadline proximity bonus: +30 (within 1 hour)
//! - Ready nodes sorted by effective priority (highest first)

use chrono::{DateTime, Utc};
use std::collections::{HashMap, HashSet};
use tracing::{debug, info};

use crate::dag::schema::{DagNode, DagSchema};

/// Ready node with resolved settings and priority info
#[derive(Debug, Clone)]
pub struct ReadyNode {
    /// Node ID (TASK-NNN)
    pub id: String,
    /// Script to execute
    pub script: String,
    /// Retry count
    pub retry: u32,
    /// Timeout in seconds
    pub timeout: u64,
    /// Base priority (0-100)
    pub priority: u8,
    /// Whether this node is on the critical path
    pub is_critical_path: bool,
    /// Deadline timestamp (if set)
    pub deadline: Option<DateTime<Utc>>,
}

impl ReadyNode {
    /// Calculate effective priority with bonuses
    ///
    /// Formula:
    /// - Start with base priority
    /// - +20 if on critical path
    /// - +30 if deadline is within 1 hour
    /// - Cap at 100
    pub fn effective_priority(&self) -> u8 {
        let mut p = self.priority;

        // Critical path bonus
        if self.is_critical_path {
            p = p.saturating_add(20);
        }

        // Deadline proximity bonus
        if self.deadline_within_hour() {
            p = p.saturating_add(30);
        }

        p.min(100)
    }

    /// Check if deadline is within 1 hour
    pub fn deadline_within_hour(&self) -> bool {
        if let Some(deadline) = &self.deadline {
            let now = Utc::now();
            let duration = deadline.signed_duration_since(now);
            duration.num_hours() == 0 && duration.num_seconds() > 0
        } else {
            false
        }
    }

    /// Create ReadyNode from DagNode with resolved settings
    pub fn from_dag_node(node: &DagNode, dag: &DagSchema, is_critical_path: bool) -> Self {
        let (retry, timeout) = dag.resolve_node_settings(node);

        let deadline = node.deadline.as_ref().and_then(|d| {
            DateTime::parse_from_rfc3339(d)
                .map(|dt| dt.with_timezone(&Utc))
                .ok()
        });

        Self {
            id: node.id.clone(),
            script: node.script.clone(),
            retry,
            timeout,
            priority: node.priority,
            is_critical_path,
            deadline,
        }
    }
}

/// Priority-based scheduler for DAG execution
pub struct PriorityScheduler {
    /// DAG definition
    dag: DagSchema,
    /// Completed node IDs
    completed: HashSet<String>,
    /// Running node IDs
    running: HashSet<String>,
    /// Node ID to DagNode mapping
    node_map: HashMap<String, DagNode>,
    /// Critical path node IDs (lazily computed)
    critical_path: HashSet<String>,
}

impl PriorityScheduler {
    /// Create new scheduler from DAG
    pub fn new(dag: DagSchema) -> Self {
        let node_map: HashMap<String, DagNode> = dag
            .nodes
            .iter()
            .map(|n| (n.id.clone(), n.clone()))
            .collect();

        let mut scheduler = Self {
            dag,
            completed: HashSet::new(),
            running: HashSet::new(),
            node_map,
            critical_path: HashSet::new(),
        };

        scheduler.compute_critical_path();
        scheduler
    }

    /// Compute critical path (longest path through DAG)
    fn compute_critical_path(&mut self) {
        // Build reverse adjacency (node -> nodes that depend on it)
        let mut dependents: HashMap<&str, Vec<&str>> = HashMap::new();
        for node in &self.dag.nodes {
            for dep in &node.deps {
                dependents
                    .entry(dep.as_str())
                    .or_default()
                    .push(node.id.as_str());
            }
        }

        // Find sink nodes (no dependents)
        let sinks: Vec<&str> = self
            .dag
            .nodes
            .iter()
            .filter(|n| !dependents.contains_key(n.id.as_str()))
            .map(|n| n.id.as_str())
            .collect();

        // DFS from sinks to find longest path
        fn dfs_longest_path<'a>(
            node_id: &'a str,
            node_map: &'a HashMap<String, DagNode>,
            memo: &mut HashMap<&'a str, (u32, Vec<&'a str>)>,
        ) -> (u32, Vec<&'a str>) {
            if let Some(cached) = memo.get(node_id) {
                return cached.clone();
            }

            let node = match node_map.get(node_id) {
                Some(n) => n,
                None => return (1, vec![node_id]),
            };

            if node.deps.is_empty() {
                let result = (1, vec![node_id]);
                memo.insert(node_id, result.clone());
                return result;
            }

            let mut max_len = 0;
            let mut max_path = vec![];

            for dep in &node.deps {
                let (len, path) = dfs_longest_path(dep.as_str(), node_map, memo);
                if len > max_len {
                    max_len = len;
                    max_path = path;
                }
            }

            max_path.push(node_id);
            let result = (max_len + 1, max_path);
            memo.insert(node_id, result.clone());
            result
        }

        let mut memo: HashMap<&str, (u32, Vec<&str>)> = HashMap::new();
        let mut longest_path = vec![];
        let mut longest_len = 0;

        for sink in sinks {
            let (len, path) = dfs_longest_path(sink, &self.node_map, &mut memo);
            if len > longest_len {
                longest_len = len;
                longest_path = path;
            }
        }

        self.critical_path = longest_path.into_iter().map(|s| s.to_string()).collect();
        debug!(
            "[PriorityScheduler] Critical path ({} nodes): {:?}",
            self.critical_path.len(),
            self.critical_path
        );
    }

    /// Get ready nodes sorted by priority (highest first)
    pub fn get_ready_nodes(&self) -> Vec<ReadyNode> {
        let mut ready: Vec<ReadyNode> = self
            .dag
            .nodes
            .iter()
            .filter(|node| {
                // Not completed and not running
                !self.completed.contains(&node.id) && !self.running.contains(&node.id)
            })
            .filter(|node| {
                // All dependencies completed
                node.deps.iter().all(|dep| self.completed.contains(dep))
            })
            .map(|node| {
                let is_critical = self.critical_path.contains(&node.id);
                ReadyNode::from_dag_node(node, &self.dag, is_critical)
            })
            .collect();

        // Sort by effective priority (descending)
        ready.sort_by(|a, b| b.effective_priority().cmp(&a.effective_priority()));

        info!(
            "[PriorityScheduler] {} ready nodes (highest priority: {})",
            ready.len(),
            ready.first().map(|n| n.effective_priority()).unwrap_or(0)
        );

        ready
    }

    /// Mark node as running
    pub fn mark_running(&mut self, node_id: &str) {
        self.running.insert(node_id.to_string());
        debug!("[PriorityScheduler] Node {} marked as running", node_id);
    }

    /// Mark node as completed
    pub fn mark_completed(&mut self, node_id: &str) {
        self.running.remove(node_id);
        self.completed.insert(node_id.to_string());
        info!("[PriorityScheduler] Node {} completed", node_id);
    }

    /// Mark node as failed (remove from running)
    pub fn mark_failed(&mut self, node_id: &str) {
        self.running.remove(node_id);
        debug!("[PriorityScheduler] Node {} failed", node_id);
    }

    /// Check if all nodes are completed
    pub fn is_complete(&self) -> bool {
        self.completed.len() == self.dag.nodes.len()
    }

    /// Get completion percentage
    pub fn progress(&self) -> f64 {
        if self.dag.nodes.is_empty() {
            return 100.0;
        }
        (self.completed.len() as f64 / self.dag.nodes.len() as f64) * 100.0
    }

    /// Get max parallel setting
    pub fn max_parallel(&self) -> u32 {
        self.dag.settings.max_parallel
    }

    /// Check if can run more nodes
    pub fn can_run_more(&self) -> bool {
        (self.running.len() as u32) < self.max_parallel()
    }

    /// Restore state from checkpoint
    pub fn restore_state(&mut self, completed: HashSet<String>) {
        self.completed = completed;
        self.running.clear();
        info!(
            "[PriorityScheduler] Restored state: {} completed nodes",
            self.completed.len()
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::dag::schema::DagSchema;

    const PRIORITY_DAG_YAML: &str = r#"
version: "1.0"
epic: EPIC-017
nodes:
  - id: TASK-001
    script: "echo low"
    priority: 20
    deps: []
  - id: TASK-002
    script: "echo high"
    priority: 80
    deps: []
  - id: TASK-003
    script: "echo medium"
    priority: 50
    deps: []
settings:
  max_parallel: 2
"#;

    const DEADLINE_DAG_YAML: &str = r#"
version: "1.0"
epic: EPIC-017
nodes:
  - id: TASK-001
    script: "echo urgent"
    priority: 40
    deadline: "2020-01-01T00:00:00Z"
  - id: TASK-002
    script: "echo normal"
    priority: 60
settings:
  max_parallel: 3
"#;

    #[test]
    fn test_ready_node_effective_priority() {
        let node = ReadyNode {
            id: "TASK-001".to_string(),
            script: "echo test".to_string(),
            retry: 0,
            timeout: 60,
            priority: 50,
            is_critical_path: false,
            deadline: None,
        };

        assert_eq!(node.effective_priority(), 50);
    }

    #[test]
    fn test_ready_node_critical_path_bonus() {
        let node = ReadyNode {
            id: "TASK-001".to_string(),
            script: "echo test".to_string(),
            retry: 0,
            timeout: 60,
            priority: 50,
            is_critical_path: true,
            deadline: None,
        };

        assert_eq!(node.effective_priority(), 70); // 50 + 20
    }

    #[test]
    fn test_ready_node_priority_cap() {
        let node = ReadyNode {
            id: "TASK-001".to_string(),
            script: "echo test".to_string(),
            retry: 0,
            timeout: 60,
            priority: 90,
            is_critical_path: true,
            deadline: None,
        };

        // 90 + 20 = 110, capped to 100
        assert_eq!(node.effective_priority(), 100);
    }

    #[test]
    fn test_scheduler_priority_ordering() {
        let dag = DagSchema::from_yaml(PRIORITY_DAG_YAML).unwrap();
        let scheduler = PriorityScheduler::new(dag);

        let ready = scheduler.get_ready_nodes();

        // All nodes have no deps, all are ready: TASK-001 (20), TASK-002 (80), TASK-003 (50)
        assert_eq!(ready.len(), 3);

        // Sorted by priority: TASK-002 (80) > TASK-003 (50) > TASK-001 (20)
        assert_eq!(ready[0].id, "TASK-002");
        assert_eq!(ready[1].id, "TASK-003");
        assert_eq!(ready[2].id, "TASK-001");
    }

    #[test]
    fn test_scheduler_dependency_resolution() {
        // DAG with dependencies: TASK-004 depends on TASK-001 and TASK-002
        let yaml = r#"
version: "1.0"
epic: EPIC-017
nodes:
  - id: TASK-001
    script: "echo a"
    priority: 30
    deps: []
  - id: TASK-002
    script: "echo b"
    priority: 80
    deps: []
  - id: TASK-003
    script: "echo c"
    priority: 50
    deps: []
  - id: TASK-004
    script: "echo d"
    priority: 90
    deps: [TASK-001, TASK-002]
settings:
  max_parallel: 2
"#;
        let dag = DagSchema::from_yaml(yaml).unwrap();
        let mut scheduler = PriorityScheduler::new(dag);

        // Initially TASK-004 is not ready (depends on TASK-001 and TASK-002)
        let ready = scheduler.get_ready_nodes();
        assert!(!ready.iter().any(|n| n.id == "TASK-004"));

        // Complete TASK-001
        scheduler.mark_completed("TASK-001");
        let ready = scheduler.get_ready_nodes();
        assert!(!ready.iter().any(|n| n.id == "TASK-004")); // Still not ready

        // Complete TASK-002
        scheduler.mark_completed("TASK-002");
        let ready = scheduler.get_ready_nodes();
        assert!(ready.iter().any(|n| n.id == "TASK-004")); // Now ready
    }

    #[test]
    fn test_scheduler_max_parallel() {
        let dag = DagSchema::from_yaml(PRIORITY_DAG_YAML).unwrap();
        let mut scheduler = PriorityScheduler::new(dag);

        assert!(scheduler.can_run_more());
        assert_eq!(scheduler.max_parallel(), 2);

        scheduler.mark_running("TASK-001");
        assert!(scheduler.can_run_more());

        scheduler.mark_running("TASK-002");
        assert!(!scheduler.can_run_more()); // At max parallel
    }

    #[test]
    fn test_scheduler_progress() {
        let dag = DagSchema::from_yaml(PRIORITY_DAG_YAML).unwrap();
        let mut scheduler = PriorityScheduler::new(dag);

        assert_eq!(scheduler.progress(), 0.0);

        scheduler.mark_completed("TASK-001");
        // 1/3 = 33.33...%
        assert!((scheduler.progress() - 33.33).abs() < 1.0);

        scheduler.mark_completed("TASK-002");
        // 2/3 = 66.66...%
        assert!((scheduler.progress() - 66.66).abs() < 1.0);
    }

    #[test]
    fn test_schema_priority_default() {
        // Create YAML without explicit priority
        let yaml = r#"
version: "1.0"
epic: EPIC-017
nodes:
  - id: TASK-001
    script: "echo test"
"#;
        let dag = DagSchema::from_yaml(yaml).unwrap();
        let node = &dag.nodes[0];
        assert_eq!(node.priority, 50); // default
    }

    #[test]
    fn test_schema_deadline_parsing() {
        let dag = DagSchema::from_yaml(DEADLINE_DAG_YAML).unwrap();
        let node = &dag.nodes[0];

        assert!(node.deadline.is_some());
        assert_eq!(node.deadline.as_ref().unwrap(), "2020-01-01T00:00:00Z");
    }

    #[test]
    fn test_critical_path_detection() {
        // Linear DAG: TASK-001 -> TASK-002 -> TASK-003
        let yaml = r#"
version: "1.0"
epic: EPIC-017
nodes:
  - id: TASK-001
    script: "echo 1"
  - id: TASK-002
    script: "echo 2"
    deps: [TASK-001]
  - id: TASK-003
    script: "echo 3"
    deps: [TASK-002]
"#;
        let dag = DagSchema::from_yaml(yaml).unwrap();
        let scheduler = PriorityScheduler::new(dag);

        // All nodes should be on critical path
        assert!(scheduler.critical_path.contains("TASK-001"));
        assert!(scheduler.critical_path.contains("TASK-002"));
        assert!(scheduler.critical_path.contains("TASK-003"));
    }

    #[test]
    fn test_restore_state() {
        // DAG with dependencies for restore test
        let yaml = r#"
version: "1.0"
epic: EPIC-017
nodes:
  - id: TASK-001
    script: "echo a"
    deps: []
  - id: TASK-002
    script: "echo b"
    deps: []
  - id: TASK-003
    script: "echo c"
    deps: [TASK-001, TASK-002]
settings:
  max_parallel: 2
"#;
        let dag = DagSchema::from_yaml(yaml).unwrap();
        let mut scheduler = PriorityScheduler::new(dag);

        let mut completed = HashSet::new();
        completed.insert("TASK-001".to_string());
        completed.insert("TASK-002".to_string());

        scheduler.restore_state(completed);

        // 2/3 = 66.66%
        assert!((scheduler.progress() - 66.66).abs() < 1.0);
        assert!(scheduler.running.is_empty());

        // TASK-003 should now be ready (both deps completed)
        let ready = scheduler.get_ready_nodes();
        assert!(ready.iter().any(|n| n.id == "TASK-003"));
    }
}
