//! DAG Scheduler - tokio async concurrent execution with conditional branching
//!
//! Manages node execution ordering based on dependencies, parallel limits,
//! conditional gates, and foreach expansion.

use std::collections::{HashMap, HashSet, VecDeque};
use std::sync::Arc;

use tokio::sync::{Mutex, Semaphore};
use tracing::{debug, info, warn};

use crate::dag::schema::{DagNode, DagSchema, GateResult, NodeType};

/// Ready node with its metadata
#[derive(Debug, Clone)]
pub struct ReadyNode {
    pub id: String,
    pub script: String,
    pub retry: u32,
    pub timeout: u64,
    /// Node type for special handling
    pub node_type: NodeType,
    /// Condition command for gate nodes
    pub condition: Option<String>,
}

impl ReadyNode {
    /// Create from DagNode with resolved settings
    pub fn from_dag_node(node: &DagNode, retry: u32, timeout: u64) -> Self {
        Self {
            id: node.id.clone(),
            script: node.script.clone(),
            retry,
            timeout,
            node_type: node.node_type,
            condition: node.condition.clone(),
        }
    }
}

/// Scheduler state for a DAG run
pub struct DagScheduler {
    /// Schema definition (with foreach expanded)
    schema: DagSchema,
    /// Original schema before foreach expansion
    original_schema: DagSchema,
    /// Max concurrent executions
    semaphore: Arc<Semaphore>,
    /// Nodes that are ready to execute (deps satisfied)
    ready_queue: Arc<Mutex<VecDeque<ReadyNode>>>,
    /// Currently running node IDs
    running: Arc<Mutex<HashSet<String>>>,
    /// Completed node IDs
    completed: Arc<Mutex<HashSet<String>>>,
    /// Failed node IDs
    failed: Arc<Mutex<HashSet<String>>>,
    /// Skipped node IDs (due to failed deps or conditional skip)
    skipped: Arc<Mutex<HashSet<String>>>,
    /// Node -> dependents mapping (reverse deps)
    dependents: HashMap<String, Vec<String>>,
    /// Node -> dependencies mapping
    deps: HashMap<String, Vec<String>>,
    /// Node configs
    nodes: HashMap<String, DagNode>,
    /// Gate execution results
    gate_results: Arc<Mutex<HashMap<String, GateResult>>>,
}

impl DagScheduler {
    /// Create new scheduler from DAG schema
    pub fn new(schema: DagSchema) -> Self {
        // Expand foreach nodes first
        let original_schema = schema.clone();
        let expanded_schema = schema.expand_foreach_nodes();
        let max_parallel = expanded_schema.settings.max_parallel as usize;

        // Build dependency graph from expanded schema
        let mut dependents: HashMap<String, Vec<String>> = HashMap::new();
        let mut deps: HashMap<String, Vec<String>> = HashMap::new();
        let mut nodes: HashMap<String, DagNode> = HashMap::new();

        for node in &expanded_schema.nodes {
            nodes.insert(node.id.clone(), node.clone());
            deps.insert(node.id.clone(), node.deps.clone());

            for dep in &node.deps {
                dependents
                    .entry(dep.clone())
                    .or_default()
                    .push(node.id.clone());
            }
        }

        Self {
            schema: expanded_schema,
            original_schema,
            semaphore: Arc::new(Semaphore::new(max_parallel)),
            ready_queue: Arc::new(Mutex::new(VecDeque::new())),
            running: Arc::new(Mutex::new(HashSet::new())),
            completed: Arc::new(Mutex::new(HashSet::new())),
            failed: Arc::new(Mutex::new(HashSet::new())),
            skipped: Arc::new(Mutex::new(HashSet::new())),
            dependents,
            deps,
            nodes,
            gate_results: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// Initialize scheduler state - find initially ready nodes
    pub async fn init(&self) {
        let mut ready = self.ready_queue.lock().await;
        let gate_results = self.gate_results.lock().await;

        for node in &self.schema.nodes {
            if node.deps.is_empty() && node.should_execute(&gate_results) {
                let (retry, timeout) = self.schema.resolve_node_settings(node);
                ready.push_back(ReadyNode::from_dag_node(node, retry, timeout));
            }
        }

        info!(
            "[DagScheduler] Initialized with {} ready nodes, max_parallel={}",
            ready.len(),
            self.schema.settings.max_parallel
        );
    }

    /// Get next ready node, waiting for semaphore permit
    pub async fn next_ready(&self) -> Option<(ReadyNode, tokio::sync::OwnedSemaphorePermit)> {
        // Try to get a permit
        let permit = self.semaphore.clone().acquire_owned().await.ok()?;

        // Get next ready node
        let mut ready = self.ready_queue.lock().await;
        let node = ready.pop_front()?;

        // Mark as running
        let mut running = self.running.lock().await;
        running.insert(node.id.clone());

        debug!("[DagScheduler] Dispatching node {}", node.id);
        Some((node, permit))
    }

    /// Check if there's any ready node
    pub async fn has_ready(&self) -> bool {
        !self.ready_queue.lock().await.is_empty()
    }

    /// Check if scheduler is done (no running, no ready, no pending)
    pub async fn is_done(&self) -> bool {
        let ready = self.ready_queue.lock().await;
        let running = self.running.lock().await;
        let completed = self.completed.lock().await;
        let failed = self.failed.lock().await;
        let skipped = self.skipped.lock().await;

        let processed = completed.len() + failed.len() + skipped.len();
        let total = self.schema.nodes.len();

        ready.is_empty() && running.is_empty() && processed == total
    }

    /// Check if any nodes are still running
    pub async fn has_running(&self) -> bool {
        !self.running.lock().await.is_empty()
    }

    /// Record gate result and update ready queue
    pub async fn record_gate_result(&self, gate_id: &str, success: bool) {
        let result = if success {
            GateResult::Success
        } else {
            GateResult::Failure
        };

        {
            let mut gate_results = self.gate_results.lock().await;
            gate_results.insert(gate_id.to_string(), result);
        }

        // Re-evaluate conditional nodes that depend on this gate
        self.update_conditional_nodes(gate_id).await;

        info!(
            "[DagScheduler] Gate {} result: {:?}",
            gate_id,
            if success { "success" } else { "failure" }
        );
    }

    /// Update nodes that have conditional execution based on gate result
    async fn update_conditional_nodes(&self, gate_id: &str) {
        let completed = self.completed.lock().await;
        let failed = self.failed.lock().await;
        let skipped = self.skipped.lock().await;
        let running = self.running.lock().await;
        let gate_results = self.gate_results.lock().await;
        let mut ready = self.ready_queue.lock().await;

        for node in &self.schema.nodes {
            // Skip already processed nodes
            if completed.contains(&node.id)
                || failed.contains(&node.id)
                || skipped.contains(&node.id)
                || running.contains(&node.id)
            {
                continue;
            }

            // Skip nodes already in ready queue
            if ready.iter().any(|n| n.id == node.id) {
                continue;
            }

            // Check if this node has a when condition referencing this gate
            if let Some(when_cond) = &node.when {
                if when_cond.starts_with(gate_id) {
                    // Check if all deps are satisfied
                    let deps_satisfied = node
                        .deps
                        .iter()
                        .all(|dep| completed.contains(dep));

                    // Check if condition matches
                    let should_execute = node.should_execute(&gate_results);

                    if deps_satisfied && should_execute {
                        let (retry, timeout) = self.schema.resolve_node_settings(node);
                        ready.push_back(ReadyNode::from_dag_node(node, retry, timeout));
                        debug!(
                            "[DagScheduler] Conditional node {} now ready after gate {}",
                            node.id, gate_id
                        );
                    } else if deps_satisfied && !should_execute {
                        // Skip this node - condition not met
                        drop(ready);
                        drop(gate_results);
                        drop(running);
                        drop(skipped);
                        drop(failed);
                        drop(completed);
                        self.skip_node_condition_not_met(&node.id).await;
                        return;
                    }
                }
            }
        }
    }

    /// Skip a node because its condition was not met
    async fn skip_node_condition_not_met(&self, node_id: &str) {
        {
            let mut skipped = self.skipped.lock().await;
            skipped.insert(node_id.to_string());
        }

        debug!(
            "[DagScheduler] Skipping node {} - condition not met",
            node_id
        );

        // Also skip dependents
        self.skip_dependents(node_id).await;
    }

    /// Mark node as completed and update ready queue
    pub async fn complete_node(&self, node_id: &str) {
        {
            let mut running = self.running.lock().await;
            running.remove(node_id);
            let mut completed = self.completed.lock().await;
            completed.insert(node_id.to_string());
        }

        // Check dependents
        if let Some(deps) = self.dependents.get(node_id) {
            let completed = self.completed.lock().await;
            let failed = self.failed.lock().await;
            let skipped = self.skipped.lock().await;
            let running = self.running.lock().await;
            let gate_results = self.gate_results.lock().await;
            let mut ready = self.ready_queue.lock().await;

            for dependent_id in deps {
                // Skip if already processed
                if completed.contains(dependent_id)
                    || failed.contains(dependent_id)
                    || skipped.contains(dependent_id)
                    || running.contains(dependent_id)
                {
                    continue;
                }

                // Already in ready queue
                if ready.iter().any(|n| n.id == *dependent_id) {
                    continue;
                }

                // Check if all deps satisfied
                if let Some(dep_list) = self.deps.get(dependent_id) {
                    let all_satisfied = dep_list.iter().all(|d| completed.contains(d));
                    let has_failed = dep_list
                        .iter()
                        .any(|d| failed.contains(d) || skipped.contains(d));

                    if all_satisfied && !has_failed {
                        if let Some(node) = self.nodes.get(dependent_id) {
                            // Check conditional execution
                            if node.should_execute(&gate_results) {
                                let (retry, timeout) = self.schema.resolve_node_settings(node);
                                ready.push_back(ReadyNode::from_dag_node(node, retry, timeout));
                                debug!(
                                    "[DagScheduler] Node {} now ready after {} completed",
                                    dependent_id, node_id
                                );
                            }
                        }
                    }
                }
            }
        }

        info!("[DagScheduler] Node {node_id} completed");
    }

    /// Mark node as failed and skip dependents
    pub async fn fail_node(&self, node_id: &str) {
        {
            let mut running = self.running.lock().await;
            running.remove(node_id);
            let mut failed = self.failed.lock().await;
            failed.insert(node_id.to_string());
        }

        // Skip all dependents
        self.skip_dependents(node_id).await;

        warn!("[DagScheduler] Node {node_id} failed");
    }

    /// Recursively skip all dependents of a node
    async fn skip_dependents(&self, node_id: &str) {
        let mut to_skip = vec![node_id.to_string()];
        let mut visited = HashSet::new();

        while let Some(current) = to_skip.pop() {
            if visited.contains(&current) {
                continue;
            }
            visited.insert(current.clone());

            if let Some(deps) = self.dependents.get(&current) {
                for dep in deps {
                    let mut skipped = self.skipped.lock().await;
                    if !skipped.contains(dep) {
                        skipped.insert(dep.clone());
                        to_skip.push(dep.clone());
                        debug!("[DagScheduler] Skipping dependent node {dep}");
                    }
                }
            }
        }
    }

    /// Get current progress stats
    pub async fn progress(&self) -> SchedulerProgress {
        let completed = self.completed.lock().await.len();
        let failed = self.failed.lock().await.len();
        let skipped = self.skipped.lock().await.len();
        let running = self.running.lock().await.len();
        let ready = self.ready_queue.lock().await.len();
        let total = self.schema.nodes.len();
        let pending = total.saturating_sub(completed + failed + skipped + running + ready);

        SchedulerProgress {
            total,
            completed,
            failed,
            skipped,
            running,
            ready,
            pending,
        }
    }

    /// Get list of completed node IDs
    pub async fn completed_nodes(&self) -> Vec<String> {
        self.completed.lock().await.iter().cloned().collect()
    }

    /// Get list of failed node IDs
    pub async fn failed_nodes(&self) -> Vec<String> {
        self.failed.lock().await.iter().cloned().collect()
    }

    /// Get gate results
    pub async fn gate_results(&self) -> HashMap<String, GateResult> {
        self.gate_results.lock().await.clone()
    }
}

/// Progress statistics
#[derive(Debug, Clone)]
pub struct SchedulerProgress {
    pub total: usize,
    pub completed: usize,
    pub failed: usize,
    pub skipped: usize,
    pub running: usize,
    pub ready: usize,
    pub pending: usize,
}

impl SchedulerProgress {
    /// Check if execution is complete (success or failure)
    pub fn is_complete(&self) -> bool {
        self.running == 0 && self.ready == 0 && self.pending == 0
    }

    /// Check if execution succeeded (all done, none failed)
    pub fn is_success(&self) -> bool {
        self.is_complete() && self.failed == 0
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::dag::schema::DagSchema;

    const LINEAR_DAG: &str = r#"
version: "1.0"
epic: EPIC-001
nodes:
  - id: TASK-001
    script: "echo 1"
    deps: []
  - id: TASK-002
    script: "echo 2"
    deps: [TASK-001]
  - id: TASK-003
    script: "echo 3"
    deps: [TASK-002]
settings:
  max_parallel: 2
"#;

    const PARALLEL_DAG: &str = r#"
version: "1.0"
epic: EPIC-002
nodes:
  - id: TASK-001
    script: "echo 1"
    deps: []
  - id: TASK-002
    script: "echo 2"
    deps: []
  - id: TASK-003
    script: "echo 3"
    deps: [TASK-001, TASK-002]
settings:
  max_parallel: 2
"#;

    const CONDITIONAL_DAG: &str = r#"
version: "1.0"
epic: EPIC-003
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
  max_parallel: 2
"#;

    const FOREACH_DAG: &str = r#"
version: "1.0"
epic: EPIC-004
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

    #[tokio::test]
    async fn test_linear_dag_ordering() {
        let dag = DagSchema::from_yaml(LINEAR_DAG).unwrap();
        let scheduler = DagScheduler::new(dag);
        scheduler.init().await;

        // Only TASK-001 should be ready initially
        let progress = scheduler.progress().await;
        assert_eq!(progress.ready, 1);

        // Get first node
        let (node, _permit) = scheduler.next_ready().await.unwrap();
        assert_eq!(node.id, "TASK-001");

        // Complete it
        scheduler.complete_node("TASK-001").await;

        // Now TASK-002 should be ready
        let progress = scheduler.progress().await;
        assert_eq!(progress.completed, 1);
        assert_eq!(progress.ready, 1);
    }

    #[tokio::test]
    async fn test_parallel_dag_ordering() {
        let dag = DagSchema::from_yaml(PARALLEL_DAG).unwrap();
        let scheduler = DagScheduler::new(dag);
        scheduler.init().await;

        // TASK-001 and TASK-002 should both be ready
        let progress = scheduler.progress().await;
        assert_eq!(progress.ready, 2);

        // Get first two nodes
        let (node1, _permit1) = scheduler.next_ready().await.unwrap();
        let (node2, _permit2) = scheduler.next_ready().await.unwrap();

        let ids: HashSet<_> = [node1.id.clone(), node2.id.clone()].into_iter().collect();
        assert!(ids.contains("TASK-001"));
        assert!(ids.contains("TASK-002"));

        // TASK-003 should not be ready yet
        assert!(!scheduler.has_ready().await);

        // Complete both
        scheduler.complete_node("TASK-001").await;
        scheduler.complete_node("TASK-002").await;

        // Now TASK-003 should be ready
        let progress = scheduler.progress().await;
        assert_eq!(progress.ready, 1);
    }

    #[tokio::test]
    async fn test_fail_node_skips_dependents() {
        let dag = DagSchema::from_yaml(LINEAR_DAG).unwrap();
        let scheduler = DagScheduler::new(dag);
        scheduler.init().await;

        // Get TASK-001
        let (_node, _permit) = scheduler.next_ready().await.unwrap();

        // Fail it
        scheduler.fail_node("TASK-001").await;

        // TASK-002 and TASK-003 should be skipped
        let progress = scheduler.progress().await;
        assert_eq!(progress.failed, 1);
        assert_eq!(progress.skipped, 2);
        assert!(progress.is_complete());
    }

    #[tokio::test]
    async fn test_conditional_dag_gate_success() {
        let dag = DagSchema::from_yaml(CONDITIONAL_DAG).unwrap();
        let scheduler = DagScheduler::new(dag);
        scheduler.init().await;

        // TASK-001 should be ready
        let (node, _permit) = scheduler.next_ready().await.unwrap();
        assert_eq!(node.id, "TASK-001");
        scheduler.complete_node("TASK-001").await;

        // gate-check should be ready
        let (node, _permit) = scheduler.next_ready().await.unwrap();
        assert_eq!(node.id, "gate-check");
        assert_eq!(node.node_type, NodeType::Gate);

        // Complete gate with success
        scheduler.complete_node("gate-check").await;
        scheduler.record_gate_result("gate-check", true).await;

        // success-path should be ready, failure-path should be skipped
        let progress = scheduler.progress().await;
        assert_eq!(progress.ready, 1);

        let (node, _permit) = scheduler.next_ready().await.unwrap();
        assert_eq!(node.id, "success-path");
    }

    #[tokio::test]
    async fn test_conditional_dag_gate_failure() {
        let dag = DagSchema::from_yaml(CONDITIONAL_DAG).unwrap();
        let scheduler = DagScheduler::new(dag);
        scheduler.init().await;

        // Complete TASK-001
        let (_, _permit) = scheduler.next_ready().await.unwrap();
        scheduler.complete_node("TASK-001").await;

        // Complete gate with failure
        let (_, _permit) = scheduler.next_ready().await.unwrap();
        scheduler.complete_node("gate-check").await;
        scheduler.record_gate_result("gate-check", false).await;

        // failure-path should be ready, success-path should be skipped
        let progress = scheduler.progress().await;
        assert_eq!(progress.ready, 1);

        let (node, _permit) = scheduler.next_ready().await.unwrap();
        assert_eq!(node.id, "failure-path");
    }

    #[tokio::test]
    async fn test_foreach_dag_expansion() {
        let dag = DagSchema::from_yaml(FOREACH_DAG).unwrap();
        let scheduler = DagScheduler::new(dag);
        scheduler.init().await;

        // TASK-001 should be ready
        let (node, _permit) = scheduler.next_ready().await.unwrap();
        assert_eq!(node.id, "TASK-001");
        scheduler.complete_node("TASK-001").await;

        // All 3 batch-process nodes should be ready
        let progress = scheduler.progress().await;
        assert_eq!(progress.ready, 3);

        // Complete all expanded nodes
        let (node1, _) = scheduler.next_ready().await.unwrap();
        let (node2, _) = scheduler.next_ready().await.unwrap();
        let (node3, _) = scheduler.next_ready().await.unwrap();

        assert!(node1.id.starts_with("batch-process_"));
        assert!(node2.id.starts_with("batch-process_"));
        assert!(node3.id.starts_with("batch-process_"));

        scheduler.complete_node(&node1.id).await;
        scheduler.complete_node(&node2.id).await;
        scheduler.complete_node(&node3.id).await;

        // TASK-002 should be ready
        let progress = scheduler.progress().await;
        assert_eq!(progress.ready, 1);

        let (node, _permit) = scheduler.next_ready().await.unwrap();
        assert_eq!(node.id, "TASK-002");
    }

    #[tokio::test]
    async fn test_progress_tracking() {
        let dag = DagSchema::from_yaml(PARALLEL_DAG).unwrap();
        let scheduler = DagScheduler::new(dag);
        scheduler.init().await;

        let progress = scheduler.progress().await;
        assert_eq!(progress.total, 3);
        assert_eq!(progress.ready, 2);
        assert_eq!(progress.pending, 1);
        assert!(!progress.is_complete());

        // Complete all
        let (_, _) = scheduler.next_ready().await.unwrap();
        scheduler.complete_node("TASK-001").await;
        let (_, _) = scheduler.next_ready().await.unwrap();
        scheduler.complete_node("TASK-002").await;
        let (_, _) = scheduler.next_ready().await.unwrap();
        scheduler.complete_node("TASK-003").await;

        let progress = scheduler.progress().await;
        assert!(progress.is_complete());
        assert!(progress.is_success());
    }
}
