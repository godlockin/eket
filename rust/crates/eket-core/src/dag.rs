// DAG module: DAG build / topological sort / trigger_rule
// Ported from: ticket-dag-parser.ts, task-dependency.ts, dependency-analyzer.ts

use std::collections::{HashMap, HashSet, VecDeque};
use std::path::Path;

use serde::{Deserialize, Serialize};

// ───────────────────────── Data Types ─────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct DagNode {
    pub id: String,
    pub label: String,
    pub status: String,
    pub assignee: Option<String>,
    /// TASK-187: Per-ticket trigger rule (default AllSuccess)
    #[serde(default)]
    pub trigger_rule: TriggerRule,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct DagEdge {
    /// source depends on target (source waits for target to complete)
    pub source: String,
    /// target must complete first
    pub target: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct DagResponse {
    pub nodes: Vec<DagNode>,
    pub edges: Vec<DagEdge>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum TriggerRule {
    #[default]
    AllSuccess,
    OneSuccess,
    AllDone,
}

// ───────────────────────── Parsing ─────────────────────────

/// Parse single ticket markdown content → (DagNode, blocked_by list)
pub fn parse_ticket_file(content: &str, ticket_id: &str) -> (DagNode, Vec<String>) {
    // Title: "# TASK-NNN: <title>" or "**标题**: <title>"
    let label = {
        let h1 = content.lines().find_map(|line| {
            let line = line.trim();
            if line.starts_with('#') {
                // "# TASK-NNN: <title>" — grab after first `: `
                if let Some(pos) = line.find(": ") {
                    return Some(line[pos + 2..].trim().to_string());
                }
            }
            None
        });
        h1.or_else(|| {
            content.lines().find_map(|line| {
                let re = "**标题**";
                if let Some(pos) = line.find(re) {
                    let rest = &line[pos + re.len()..];
                    if let Some(p2) = rest.find(':') {
                        return Some(rest[p2 + 1..].trim().to_string());
                    }
                }
                None
            })
        })
        .unwrap_or_else(|| ticket_id.to_string())
    };

    // Status: "**状态**: xxx"
    let status = content
        .lines()
        .find_map(|line| {
            let marker = "**状态**";
            if let Some(pos) = line.find(marker) {
                let rest = &line[pos + marker.len()..];
                if let Some(p2) = rest.find(':') {
                    let val = rest[p2 + 1..].trim();
                    // strip leading/trailing whitespace + possible extra chars
                    let val = val.split_whitespace().next().unwrap_or("").to_string();
                    if !val.is_empty() {
                        return Some(val);
                    }
                }
            }
            None
        })
        .unwrap_or_else(|| "unknown".to_string());

    // Assignee: "**负责人**: xxx"
    let assignee = content.lines().find_map(|line| {
        let marker = "**负责人**";
        if let Some(pos) = line.find(marker) {
            let rest = &line[pos + marker.len()..];
            if let Some(p2) = rest.find(':') {
                let val = rest[p2 + 1..].trim().to_string();
                if !val.is_empty() && val != "待认领" {
                    return Some(val);
                }
            }
        }
        None
    });

    // blocked_by: `- blocked_by: [TASK-X, TASK-Y]`
    let blocked_by = content
        .lines()
        .find_map(|line| {
            let line = line.trim();
            // match "- blocked_by: [...]"
            if let Some(rest) = line.strip_prefix("- blocked_by:") {
                let rest = rest.trim();
                if let (Some(open), Some(close)) = (rest.find('['), rest.find(']')) {
                    let inner = &rest[open + 1..close];
                    let ids: Vec<String> = inner
                        .split(',')
                        .map(|s| s.trim().to_string())
                        .filter(|s| !s.is_empty())
                        .collect();
                    return Some(ids);
                }
            }
            None
        })
        .unwrap_or_default();

    let node = DagNode {
        id: ticket_id.to_string(),
        label,
        status,
        assignee,
        // TASK-187: Parse per-ticket trigger_rule
        trigger_rule: parse_trigger_rule(content),
    };
    (node, blocked_by)
}

/// Parse trigger_rule field from ticket content
pub fn parse_trigger_rule(ticket_content: &str) -> TriggerRule {
    for line in ticket_content.lines() {
        if line.contains("trigger_rule") {
            if let Some(pos) = line.rfind(':') {
                let val = line[pos + 1..].trim().to_lowercase();
                let val = val.split_whitespace().next().unwrap_or("");
                match val {
                    "one_success" => return TriggerRule::OneSuccess,
                    "all_done" => return TriggerRule::AllDone,
                    _ => {}
                }
            }
        }
    }
    TriggerRule::AllSuccess
}

/// Scan `tickets_dir` for `TASK-\d+.md` files and build full DAG.
pub fn parse_tickets_dag(tickets_dir: &Path) -> DagResponse {
    let mut nodes: Vec<DagNode> = Vec::new();
    let mut edges: Vec<DagEdge> = Vec::new();

    let entries = match std::fs::read_dir(tickets_dir) {
        Ok(e) => e,
        Err(_) => return DagResponse::default(),
    };

    let task_re = regex_is_task_file;

    let mut files: Vec<String> = entries
        .filter_map(|e| e.ok())
        .filter_map(|e| {
            let name = e.file_name().to_string_lossy().to_string();
            if task_re(&name) {
                Some(name)
            } else {
                None
            }
        })
        .collect();

    files.sort();

    for file in &files {
        let ticket_id = file.trim_end_matches(".md");
        let path = tickets_dir.join(file);
        let content = match std::fs::read_to_string(&path) {
            Ok(c) => c,
            Err(_) => continue,
        };
        let (node, blocked_by) = parse_ticket_file(&content, ticket_id);
        nodes.push(node);
        for dep in blocked_by {
            edges.push(DagEdge {
                source: ticket_id.to_string(),
                target: dep,
            });
        }
    }

    // Sort nodes by id for deterministic output
    nodes.sort_by(|a, b| a.id.cmp(&b.id));

    DagResponse { nodes, edges }
}

fn regex_is_task_file(name: &str) -> bool {
    if !name.ends_with(".md") {
        return false;
    }
    let stem = name.trim_end_matches(".md");
    // Must be TASK-<digits>
    if let Some(rest) = stem.strip_prefix("TASK-") {
        !rest.is_empty() && rest.chars().all(|c| c.is_ascii_digit())
    } else {
        false
    }
}

// ───────────────────────── Algorithms ─────────────────────────

/// Kahn's algorithm topological sort.
/// Returns ordered node IDs or Err describing cycle nodes.
pub fn topological_sort(dag: &DagResponse) -> Result<Vec<String>, String> {
    // in-degree map: source depends on target → edge source→target means target must come first
    // For topo sort: edge source→target means source comes AFTER target
    // in-degree of a node = number of nodes that must come before it
    // i.e., how many targets does it appear as a source for? No — it's standard DAG.
    // source depends on target means target → source in execution order.
    // Build adjacency: target -> [source] (target unlocks source)
    // in-degree[source] += 1

    let node_ids: HashSet<String> = dag.nodes.iter().map(|n| n.id.clone()).collect();
    let mut in_degree: HashMap<String, usize> = HashMap::new();
    let mut adj: HashMap<String, Vec<String>> = HashMap::new(); // target → [source]

    for node in &dag.nodes {
        in_degree.entry(node.id.clone()).or_insert(0);
        adj.entry(node.id.clone()).or_default();
    }

    for edge in &dag.edges {
        // source depends on target → target must come before source
        if !node_ids.contains(&edge.source) || !node_ids.contains(&edge.target) {
            // skip dangling edges
            continue;
        }
        *in_degree.entry(edge.source.clone()).or_insert(0) += 1;
        adj.entry(edge.target.clone())
            .or_default()
            .push(edge.source.clone());
    }

    let mut queue: VecDeque<String> = in_degree
        .iter()
        .filter(|(_, &d)| d == 0)
        .map(|(id, _)| id.clone())
        .collect();

    // Sort for determinism
    let mut queue_vec: Vec<String> = queue.drain(..).collect();
    queue_vec.sort();
    queue.extend(queue_vec);

    let mut result: Vec<String> = Vec::new();

    while let Some(id) = queue.pop_front() {
        result.push(id.clone());
        if let Some(dependents) = adj.get(&id) {
            let mut next: Vec<String> = Vec::new();
            for dep in dependents {
                let d = match in_degree.get_mut(dep) {
                    Some(v) => v,
                    None => continue, // stale/orphan dependency edge — skip safely
                };
                *d -= 1;
                if *d == 0 {
                    next.push(dep.clone());
                }
            }
            next.sort();
            for n in next {
                queue.push_back(n);
            }
        }
    }

    if result.len() == dag.nodes.len() {
        Ok(result)
    } else {
        // Find nodes still with in_degree > 0 — those are in the cycle
        let cycle_nodes: Vec<String> = in_degree
            .into_iter()
            .filter(|(_, d)| *d > 0)
            .map(|(id, _)| id)
            .collect();
        Err(format!("Cycle detected among: {:?}", cycle_nodes))
    }
}

/// Detect cycle using DFS. Returns Some(cycle_nodes) if cycle found.
pub fn detect_cycle(dag: &DagResponse) -> Option<Vec<String>> {
    // Build adjacency: source → [targets it depends on]
    // source depends on target — for cycle detection we follow dependencies
    let mut adj: HashMap<String, Vec<String>> = HashMap::new();
    for node in &dag.nodes {
        adj.entry(node.id.clone()).or_default();
    }
    for edge in &dag.edges {
        adj.entry(edge.source.clone())
            .or_default()
            .push(edge.target.clone());
    }

    let mut visited: HashSet<String> = HashSet::new();
    let mut rec_stack: HashSet<String> = HashSet::new();
    let mut cycle: Vec<String> = Vec::new();

    fn dfs(
        node: &str,
        adj: &HashMap<String, Vec<String>>,
        visited: &mut HashSet<String>,
        rec_stack: &mut HashSet<String>,
        cycle: &mut Vec<String>,
    ) -> bool {
        visited.insert(node.to_string());
        rec_stack.insert(node.to_string());

        if let Some(neighbors) = adj.get(node) {
            for dep in neighbors {
                if !visited.contains(dep) {
                    if dfs(dep, adj, visited, rec_stack, cycle) {
                        cycle.push(node.to_string());
                        return true;
                    }
                } else if rec_stack.contains(dep) {
                    cycle.push(dep.to_string());
                    cycle.push(node.to_string());
                    return true;
                }
            }
        }

        rec_stack.remove(node);
        false
    }

    let node_ids: Vec<String> = dag.nodes.iter().map(|n| n.id.clone()).collect();
    for id in &node_ids {
        if !visited.contains(id) && dfs(id, &adj, &mut visited, &mut rec_stack, &mut cycle) {
            return Some(cycle);
        }
    }
    None
}

/// Check if a ticket can proceed given its blocked_by, trigger_rule, and status sets.
pub fn can_proceed(
    blocked_by: &[String],
    rule: TriggerRule,
    completed: &HashSet<String>,
    failed: &HashSet<String>,
) -> bool {
    if blocked_by.is_empty() {
        return true;
    }
    match rule {
        TriggerRule::AllSuccess => blocked_by.iter().all(|id| completed.contains(id)),
        TriggerRule::OneSuccess => blocked_by.iter().any(|id| completed.contains(id)),
        TriggerRule::AllDone => blocked_by
            .iter()
            .all(|id| completed.contains(id) || failed.contains(id)),
    }
}

/// Return ticket IDs that are ready to run:
/// status == "todo" AND (no blocked_by OR trigger_rule satisfied).
pub fn ready_tickets(
    dag: &DagResponse,
    completed: &HashSet<String>,
    failed: &HashSet<String>,
) -> Vec<String> {
    // Build blocked_by map from edges
    let mut blocked_by_map: HashMap<String, Vec<String>> = HashMap::new();
    for node in &dag.nodes {
        blocked_by_map.entry(node.id.clone()).or_default();
    }
    for edge in &dag.edges {
        blocked_by_map
            .entry(edge.source.clone())
            .or_default()
            .push(edge.target.clone());
    }

    dag.nodes
        .iter()
        .filter(|n| n.status == "todo")
        .filter(|n| {
            let blocked_by = blocked_by_map
                .get(&n.id)
                .map(|v| v.as_slice())
                .unwrap_or(&[]);
            // TASK-187: Use per-ticket trigger_rule instead of hardcoded AllSuccess
            can_proceed(blocked_by, n.trigger_rule.clone(), completed, failed)
        })
        .map(|n| n.id.clone())
        .collect()
}

/// Critical path: longest dependency chain (reversed topological DP).
pub fn critical_path(dag: &DagResponse) -> Vec<String> {
    // Run topo sort; if cycle, return empty
    let topo = match topological_sort(dag) {
        Ok(t) => t,
        Err(_) => return vec![],
    };

    if topo.is_empty() {
        return vec![];
    }

    // Build adjacency: target → [source] (target unlocks source)
    let mut adj: HashMap<String, Vec<String>> = HashMap::new();
    for node in &dag.nodes {
        adj.entry(node.id.clone()).or_default();
    }
    for edge in &dag.edges {
        // source depends on target → in execution order target comes before source
        adj.entry(edge.target.clone())
            .or_default()
            .push(edge.source.clone());
    }

    // DP in topo order: dp[id] = max chain length ending at id
    let mut dp: HashMap<String, usize> = HashMap::new();
    let mut parent: HashMap<String, Option<String>> = HashMap::new();

    for id in &topo {
        dp.insert(id.clone(), 1);
        parent.insert(id.clone(), None);
    }

    for id in &topo {
        let cur = *dp.get(id).unwrap_or(&1);
        if let Some(successors) = adj.get(id) {
            for succ in successors {
                let succ_dp = dp.entry(succ.clone()).or_insert(1);
                if cur + 1 > *succ_dp {
                    *succ_dp = cur + 1;
                    parent.insert(succ.clone(), Some(id.clone()));
                }
            }
        }
    }

    // Find node with max dp value
    let end_node = topo
        .iter()
        .max_by_key(|id| dp.get(*id).copied().unwrap_or(0))
        .cloned();

    let Some(mut cur) = end_node else {
        return vec![];
    };

    // Reconstruct path
    let mut path: Vec<String> = Vec::new();
    loop {
        path.push(cur.clone());
        match parent.get(&cur).and_then(|p| p.clone()) {
            Some(p) => cur = p,
            None => break,
        }
    }
    path.reverse();
    path
}

// ───────────────────────── Tests ─────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;

    fn hs(items: &[&str]) -> HashSet<String> {
        items.iter().map(|s| s.to_string()).collect()
    }

    fn make_dag(nodes: &[(&str, &str)], edges: &[(&str, &str)]) -> DagResponse {
        DagResponse {
            nodes: nodes
                .iter()
                .map(|(id, status)| DagNode {
                    id: id.to_string(),
                    label: id.to_string(),
                    status: status.to_string(),
                    assignee: None,
                    trigger_rule: TriggerRule::AllSuccess,
                })
                .collect(),
            edges: edges
                .iter()
                .map(|(src, tgt)| DagEdge {
                    source: src.to_string(),
                    target: tgt.to_string(),
                })
                .collect(),
        }
    }

    // 1. parse_ticket_file: basic fields
    #[test]
    fn test_parse_ticket_file_basic() {
        let content = r#"# TASK-1: My Title
- **状态**: todo
- **负责人**: slaver_1
- blocked_by: [TASK-2, TASK-3]
"#;
        let (node, blocked_by) = parse_ticket_file(content, "TASK-1");
        assert_eq!(node.id, "TASK-1");
        assert_eq!(node.label, "My Title");
        assert_eq!(node.status, "todo");
        assert_eq!(node.assignee, Some("slaver_1".to_string()));
        assert_eq!(blocked_by, vec!["TASK-2", "TASK-3"]);
    }

    // 2. parse_ticket_file: unassigned + empty blocked_by
    #[test]
    fn test_parse_ticket_file_no_assignee() {
        let content = r#"# TASK-5: Standalone
- **状态**: done
- **负责人**: 待认领
- blocked_by: []
"#;
        let (node, blocked_by) = parse_ticket_file(content, "TASK-5");
        assert_eq!(node.status, "done");
        assert_eq!(node.assignee, None);
        assert!(blocked_by.is_empty());
    }

    // 3. Linear chain: A → B → C topo sort
    #[test]
    fn test_topological_sort_linear() {
        // TASK-2 depends on TASK-1, TASK-3 depends on TASK-2
        let dag = make_dag(
            &[("TASK-1", "done"), ("TASK-2", "todo"), ("TASK-3", "todo")],
            &[("TASK-2", "TASK-1"), ("TASK-3", "TASK-2")],
        );
        let order = topological_sort(&dag).unwrap();
        // TASK-1 must come before TASK-2, TASK-2 before TASK-3
        let pos = |id: &str| order.iter().position(|x| x == id).unwrap();
        assert!(pos("TASK-1") < pos("TASK-2"));
        assert!(pos("TASK-2") < pos("TASK-3"));
    }

    // 4. Diamond dependency: A → B, A → C, B → D, C → D
    #[test]
    fn test_topological_sort_diamond() {
        let dag = make_dag(
            &[
                ("TASK-1", "done"),
                ("TASK-2", "todo"),
                ("TASK-3", "todo"),
                ("TASK-4", "todo"),
            ],
            &[
                ("TASK-2", "TASK-1"),
                ("TASK-3", "TASK-1"),
                ("TASK-4", "TASK-2"),
                ("TASK-4", "TASK-3"),
            ],
        );
        let order = topological_sort(&dag).unwrap();
        let pos = |id: &str| order.iter().position(|x| x == id).unwrap();
        assert!(pos("TASK-1") < pos("TASK-2"));
        assert!(pos("TASK-1") < pos("TASK-3"));
        assert!(pos("TASK-2") < pos("TASK-4"));
        assert!(pos("TASK-3") < pos("TASK-4"));
    }

    // 5. Cycle detection via topological_sort Err
    #[test]
    fn test_topological_sort_cycle_error() {
        // TASK-1 depends on TASK-2, TASK-2 depends on TASK-1
        let dag = make_dag(
            &[("TASK-1", "todo"), ("TASK-2", "todo")],
            &[("TASK-1", "TASK-2"), ("TASK-2", "TASK-1")],
        );
        assert!(topological_sort(&dag).is_err());
    }

    // 6. detect_cycle returns Some on cycle
    #[test]
    fn test_detect_cycle_found() {
        let dag = make_dag(
            &[("TASK-A", "todo"), ("TASK-B", "todo"), ("TASK-C", "todo")],
            &[
                ("TASK-A", "TASK-B"),
                ("TASK-B", "TASK-C"),
                ("TASK-C", "TASK-A"),
            ],
        );
        assert!(detect_cycle(&dag).is_some());
    }

    // 7. detect_cycle returns None on acyclic DAG
    #[test]
    fn test_detect_cycle_none() {
        let dag = make_dag(
            &[("TASK-1", "done"), ("TASK-2", "todo")],
            &[("TASK-2", "TASK-1")],
        );
        assert!(detect_cycle(&dag).is_none());
    }

    // 8. trigger_rule: all_success (default)
    #[test]
    fn test_can_proceed_all_success() {
        let blocked_by = vec!["TASK-1".to_string(), "TASK-2".to_string()];
        // only one completed → false
        assert!(!can_proceed(
            &blocked_by,
            TriggerRule::AllSuccess,
            &hs(&["TASK-1"]),
            &hs(&[])
        ));
        // both completed → true
        assert!(can_proceed(
            &blocked_by,
            TriggerRule::AllSuccess,
            &hs(&["TASK-1", "TASK-2"]),
            &hs(&[])
        ));
    }

    // 9. trigger_rule: one_success
    #[test]
    fn test_can_proceed_one_success() {
        let blocked_by = vec!["TASK-1".to_string(), "TASK-2".to_string()];
        assert!(can_proceed(
            &blocked_by,
            TriggerRule::OneSuccess,
            &hs(&["TASK-1"]),
            &hs(&[])
        ));
        assert!(!can_proceed(
            &blocked_by,
            TriggerRule::OneSuccess,
            &hs(&[]),
            &hs(&[])
        ));
    }

    // 10. trigger_rule: all_done (success OR failed counts)
    #[test]
    fn test_can_proceed_all_done() {
        let blocked_by = vec!["TASK-1".to_string(), "TASK-2".to_string()];
        // one completed, one failed → true
        assert!(can_proceed(
            &blocked_by,
            TriggerRule::AllDone,
            &hs(&["TASK-1"]),
            &hs(&["TASK-2"])
        ));
        // one still running → false
        assert!(!can_proceed(
            &blocked_by,
            TriggerRule::AllDone,
            &hs(&["TASK-1"]),
            &hs(&[])
        ));
    }

    // 11. Empty blocked_by always proceeds
    #[test]
    fn test_can_proceed_empty_blocked_by() {
        assert!(can_proceed(
            &[],
            TriggerRule::AllSuccess,
            &hs(&[]),
            &hs(&[])
        ));
        assert!(can_proceed(
            &[],
            TriggerRule::OneSuccess,
            &hs(&[]),
            &hs(&[])
        ));
        assert!(can_proceed(&[], TriggerRule::AllDone, &hs(&[]), &hs(&[])));
    }

    // 12. ready_tickets filters correctly
    #[test]
    fn test_ready_tickets() {
        let dag = make_dag(
            &[
                ("TASK-1", "done"),
                ("TASK-2", "todo"), // no deps → ready
                ("TASK-3", "todo"), // depends on TASK-1 (done) → ready
                ("TASK-4", "todo"), // depends on TASK-5 (not done) → blocked
            ],
            &[("TASK-3", "TASK-1"), ("TASK-4", "TASK-5")],
        );
        let completed = hs(&["TASK-1"]);
        let failed = hs(&[]);
        let mut ready = ready_tickets(&dag, &completed, &failed);
        ready.sort();
        assert_eq!(ready, vec!["TASK-2", "TASK-3"]);
    }

    // 13. critical_path: linear chain
    #[test]
    fn test_critical_path_linear() {
        let dag = make_dag(
            &[("TASK-1", "todo"), ("TASK-2", "todo"), ("TASK-3", "todo")],
            &[("TASK-2", "TASK-1"), ("TASK-3", "TASK-2")],
        );
        let path = critical_path(&dag);
        assert_eq!(path, vec!["TASK-1", "TASK-2", "TASK-3"]);
    }

    // 14. critical_path: picks longer branch
    #[test]
    fn test_critical_path_branches() {
        // TASK-1 → TASK-2 → TASK-4 (length 3)
        // TASK-1 → TASK-3            (length 2)
        let dag = make_dag(
            &[
                ("TASK-1", "todo"),
                ("TASK-2", "todo"),
                ("TASK-3", "todo"),
                ("TASK-4", "todo"),
            ],
            &[
                ("TASK-2", "TASK-1"),
                ("TASK-3", "TASK-1"),
                ("TASK-4", "TASK-2"),
            ],
        );
        let path = critical_path(&dag);
        assert_eq!(path.len(), 3);
        assert_eq!(path[0], "TASK-1");
        assert_eq!(path[2], "TASK-4");
    }

    // 15. Empty DAG
    #[test]
    fn test_empty_dag() {
        let dag = DagResponse::default();
        assert!(topological_sort(&dag).unwrap().is_empty());
        assert!(detect_cycle(&dag).is_none());
        assert!(critical_path(&dag).is_empty());
        assert!(ready_tickets(&dag, &hs(&[]), &hs(&[])).is_empty());
    }

    // 16. parse_trigger_rule
    #[test]
    fn test_parse_trigger_rule() {
        assert_eq!(
            parse_trigger_rule("**trigger_rule**: one_success"),
            TriggerRule::OneSuccess
        );
        assert_eq!(
            parse_trigger_rule("**trigger_rule**: all_done"),
            TriggerRule::AllDone
        );
        assert_eq!(
            parse_trigger_rule("no trigger rule here"),
            TriggerRule::AllSuccess
        );
    }

    // 17. regex_is_task_file
    #[test]
    fn test_regex_is_task_file() {
        assert!(regex_is_task_file("TASK-123.md"));
        assert!(regex_is_task_file("TASK-1.md"));
        assert!(!regex_is_task_file("TASK-abc.md"));
        assert!(!regex_is_task_file("task-1.md"));
        assert!(!regex_is_task_file("TASK-1.txt"));
        assert!(!regex_is_task_file("TASK-.md"));
    }
}

// ─── 执行层 ───────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, PartialEq)]
pub enum FailBehavior {
    Block, // 中止后续所有层
    Warn,  // 记录错误，继续执行
    Skip,  // 跳过该节点，继续
}

#[derive(Debug, Clone)]
pub struct NodeResult {
    pub node_id: String,
    pub success: bool,
    pub output: Option<String>,
    pub duration_ms: u64,
    pub error: Option<String>,
}

#[derive(Debug)]
pub struct ExecutionReport {
    pub layers_completed: usize,
    pub total_nodes: usize,
    pub failed_nodes: Vec<String>,
    pub total_duration_ms: u64,
}

pub struct DagExecutor;

impl DagExecutor {
    /// 按 Kahn 分层，同层节点并行执行
    pub async fn run<F, Fut>(
        graph: &DagResponse,
        fail_behavior: FailBehavior,
        handler: F,
    ) -> ExecutionReport
    where
        F: Fn(String) -> Fut + Send + Sync + Clone + 'static,
        Fut: std::future::Future<Output = NodeResult> + Send,
    {
        let node_ids: HashSet<String> = graph.nodes.iter().map(|n| n.id.clone()).collect();
        let mut in_degree: HashMap<String, usize> = HashMap::new();
        let mut adj: HashMap<String, Vec<String>> = HashMap::new(); // target → [sources]

        for node in &graph.nodes {
            in_degree.entry(node.id.clone()).or_insert(0);
            adj.entry(node.id.clone()).or_default();
        }

        for edge in &graph.edges {
            if !node_ids.contains(&edge.source) || !node_ids.contains(&edge.target) {
                continue;
            }
            *in_degree.entry(edge.source.clone()).or_insert(0) += 1;
            adj.entry(edge.target.clone())
                .or_default()
                .push(edge.source.clone());
        }

        let total_nodes = graph.nodes.len();
        let mut failed_nodes: Vec<String> = Vec::new();
        let mut layers_completed: usize = 0;
        let total_start = std::time::Instant::now();

        loop {
            // 当前层：in_degree == 0 的所有节点
            let mut layer: Vec<String> = in_degree
                .iter()
                .filter(|(_, &d)| d == 0)
                .map(|(id, _)| id.clone())
                .collect();

            if layer.is_empty() {
                break;
            }
            layer.sort();

            // 从 in_degree 移除当前层（标记为"已调度"）
            for id in &layer {
                in_degree.remove(id);
            }

            // 并行执行当前层
            let handles: Vec<_> = layer
                .iter()
                .map(|id| {
                    let h = handler.clone();
                    let node_id = id.clone();
                    tokio::spawn(async move { h(node_id).await })
                })
                .collect();

            let results = futures::future::join_all(handles).await;

            let mut layer_failed = false;
            for node_result in results.into_iter().flatten() {
                if !node_result.success {
                    layer_failed = true;
                    failed_nodes.push(node_result.node_id);
                }
            }

            layers_completed += 1;

            if layer_failed && fail_behavior == FailBehavior::Block {
                return ExecutionReport {
                    layers_completed,
                    total_nodes,
                    failed_nodes,
                    total_duration_ms: total_start.elapsed().as_millis() as u64,
                };
            }

            // 更新下一层 in_degree
            for id in &layer {
                if let Some(dependents) = adj.get(id) {
                    for dep in dependents {
                        if let Some(d) = in_degree.get_mut(dep) {
                            if *d > 0 {
                                *d -= 1;
                            }
                        }
                    }
                }
            }
        }

        ExecutionReport {
            layers_completed,
            total_nodes,
            failed_nodes,
            total_duration_ms: total_start.elapsed().as_millis() as u64,
        }
    }
}
