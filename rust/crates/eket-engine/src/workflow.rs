/// Workflow Engine — 对应 TS: workflow-engine.ts
///
/// tokio async 状态机实现
/// 状态：pending → running → (paused ↔ running) → completed / failed
///
/// 关键设计：
/// - WorkflowInstance 存于 DashMap（并发安全，无全局锁）
/// - 步骤超时通过 tokio::time::timeout（无 timer 泄漏）
/// - JudgmentPoint：oneshot 通道，外部 resolve_judgment() 发信号
/// - kill-switch：每个实例持有 AbortHandle，cancel 时立即终止
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;

use dashmap::DashMap;
use serde::{Deserialize, Serialize};
use tokio::sync::{oneshot, RwLock};
use tracing::{info, warn};
use uuid::Uuid;

use crate::event_bus::{DomainEvent, EventBus};

// ─── Types ────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum WorkflowStatus {
    Pending,
    Running,
    Paused,
    Completed,
    Failed,
    Cancelled,
}

impl std::fmt::Display for WorkflowStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let s = match self {
            Self::Pending => "pending",
            Self::Running => "running",
            Self::Paused => "paused",
            Self::Completed => "completed",
            Self::Failed => "failed",
            Self::Cancelled => "cancelled",
        };
        write!(f, "{s}")
    }
}

#[derive(Debug, Clone)]
pub struct StepResult {
    pub success: bool,
    pub next_step_id: Option<String>,
    pub output: serde_json::Value,
    pub error: Option<String>,
}

impl StepResult {
    pub fn success(next: impl Into<Option<String>>) -> Self {
        Self { success: true, next_step_id: next.into(), output: serde_json::Value::Null, error: None }
    }

    pub fn failure(reason: impl Into<String>) -> Self {
        Self { success: false, next_step_id: None, output: serde_json::Value::Null, error: Some(reason.into()) }
    }
}

pub type StepExecutor =
    Arc<dyn Fn(WorkflowContext) -> std::pin::Pin<Box<dyn std::future::Future<Output = StepResult> + Send>> + Send + Sync>;

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct WorkflowContext {
    pub workflow_id: String,
    pub current_step_id: Option<String>,
    pub previous_step_id: Option<String>,
    pub data: HashMap<String, serde_json::Value>,
    pub retry_count: u32,
}

#[derive(Debug, Clone)]
pub struct WorkflowStep {
    pub id: String,
    pub name: String,
    pub timeout_ms: Option<u64>,
    pub judgment_required: bool,
    pub judgment_fallback: JudgmentFallback,
    pub judgment_timeout_ms: Option<u64>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
#[derive(Default)]
pub enum JudgmentFallback {
    #[default]
    EscalateToMaster,
    Skip,
    FailWorkflow,
}


#[derive(Debug, Clone)]
pub struct WorkflowDefinition {
    pub id: String,
    pub name: String,
    pub steps: Vec<WorkflowStep>,
    pub entry_step_id: String,
    pub default_timeout_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkflowInstance {
    pub id: String,
    pub definition_id: String,
    pub status: WorkflowStatus,
    pub current_step_id: Option<String>,
    pub context: WorkflowContext,
    pub started_at: chrono::DateTime<chrono::Utc>,
    pub finished_at: Option<chrono::DateTime<chrono::Utc>>,
    pub error: Option<String>,
}

// ─── Engine ───────────────────────────────────────────────────────────────────

type JudgmentSender = oneshot::Sender<bool>;

pub struct WorkflowEngine {
    pub(crate) instance_id: String,
    pub(crate) definitions: Arc<RwLock<HashMap<String, WorkflowDefinition>>>,
    /// DashMap: concurrent insert/get/remove without global lock.
    /// Each instance wrapped in Arc<RwLock<>> to protect per-instance mutation.
    pub(crate) instances: Arc<DashMap<String, Arc<RwLock<WorkflowInstance>>>>,
    pub(crate) executors: Arc<DashMap<String, StepExecutor>>,
    pub(crate) pending_judgments: Arc<DashMap<String, JudgmentSender>>,
    kill_handles: Arc<DashMap<String, tokio::task::AbortHandle>>,
    event_bus: Option<EventBus>,
    default_timeout_ms: u64,
}

impl WorkflowEngine {
    pub fn new(instance_id: impl Into<String>, event_bus: Option<EventBus>) -> Self {
        Self {
            instance_id: instance_id.into(),
            definitions: Arc::new(RwLock::new(HashMap::new())),
            instances: Arc::new(DashMap::new()),
            executors: Arc::new(DashMap::new()),
            pending_judgments: Arc::new(DashMap::new()),
            kill_handles: Arc::new(DashMap::new()),
            event_bus,
            default_timeout_ms: 300_000,
        }
    }

    pub async fn register_definition(&self, def: WorkflowDefinition) {
        self.definitions.write().await.insert(def.id.clone(), def);
    }

    pub async fn register_step(&self, step_id: impl Into<String>, executor: StepExecutor) {
        self.executors.insert(step_id.into(), executor);
    }

    pub async fn start_workflow(
        &self,
        definition_id: &str,
        initial_data: HashMap<String, serde_json::Value>,
    ) -> Result<String, String> {
        let def = {
            let defs = self.definitions.read().await;
            defs.get(definition_id)
                .cloned()
                .ok_or_else(|| format!("Unknown workflow: {definition_id}"))?
        };

        let workflow_id = Uuid::new_v4().to_string();
        let context = WorkflowContext {
            workflow_id: workflow_id.clone(),
            current_step_id: Some(def.entry_step_id.clone()),
            data: initial_data,
            ..Default::default()
        };

        let instance = WorkflowInstance {
            id: workflow_id.clone(),
            definition_id: definition_id.to_string(),
            status: WorkflowStatus::Running,
            current_step_id: Some(def.entry_step_id.clone()),
            context,
            started_at: chrono::Utc::now(),
            finished_at: None,
            error: None,
        };

        self.instances.insert(workflow_id.clone(), Arc::new(RwLock::new(instance)));
        self.emit(crate::event_bus::events::WORKFLOW_STARTED, serde_json::json!({
            "workflow_id": workflow_id, "definition_id": definition_id
        })).await;

        let runner = self.make_runner(workflow_id.clone(), def);
        let join_handle = tokio::spawn(runner);
        let handle = join_handle.abort_handle();
        self.kill_handles.insert(workflow_id.clone(), handle);

        info!("[Workflow] {} started", workflow_id);
        Ok(workflow_id)
    }

    pub async fn cancel_workflow(&self, workflow_id: &str) {
        if let Some((_, handle)) = self.kill_handles.remove(workflow_id) {
            handle.abort();
        }
        // Get Arc, drop DashMap ref, then lock instance
        let inst_arc = self.instances.get(workflow_id).map(|r| r.value().clone());
        if let Some(arc) = inst_arc {
            let mut inst = arc.write().await;
            inst.status = WorkflowStatus::Cancelled;
            inst.finished_at = Some(chrono::Utc::now());
        }
        warn!("[Workflow] {} cancelled", workflow_id);
    }

    pub async fn resolve_judgment(&self, judgment_id: &str, approved: bool) -> bool {
        if let Some((_, tx)) = self.pending_judgments.remove(judgment_id) {
            let _ = tx.send(approved);
            true
        } else {
            false
        }
    }

    pub async fn get_instance(&self, workflow_id: &str) -> Option<WorkflowInstance> {
        // Get Arc, drop DashMap ref, then read
        let arc = { self.instances.get(workflow_id)?.value().clone() };
        let inst = arc.read().await.clone();
        Some(inst)
    }

    fn make_runner(&self, workflow_id: String, def: WorkflowDefinition) -> impl std::future::Future<Output = ()> {
        let instances = self.instances.clone();
        let executors = self.executors.clone();
        let pending_judgments = self.pending_judgments.clone();
        let kill_handles = self.kill_handles.clone();
        let event_bus = self.event_bus.clone();
        let default_timeout = self.default_timeout_ms;

        async move {
            let step_map: HashMap<String, WorkflowStep> =
                def.steps.iter().map(|s| (s.id.clone(), s.clone())).collect();
            let mut current_step_id = def.entry_step_id.clone();

            // Helper: get instance Arc without holding DashMap ref across await
            macro_rules! get_inst_arc {
                () => {{
                    instances.get(&workflow_id).map(|r| r.value().clone())
                }};
            }

            loop {
                let step = match step_map.get(&current_step_id) {
                    Some(s) => s.clone(),
                    None => {
                        if let Some(arc) = get_inst_arc!() {
                            let mut inst = arc.write().await;
                            inst.status = WorkflowStatus::Failed;
                            inst.error = Some(format!("Unknown step: {current_step_id}"));
                            inst.finished_at = Some(chrono::Utc::now());
                        }
                        break;
                    }
                };

                // JudgmentPoint handling
                if step.judgment_required {
                    let judgment_id = Uuid::new_v4().to_string();
                    let (tx, rx) = oneshot::channel::<bool>();
                    pending_judgments.insert(judgment_id.clone(), tx);

                    if let Some(ref bus) = event_bus {
                        bus.publish(DomainEvent::new("step.judgment_required", serde_json::json!({
                            "workflow_id": workflow_id, "step_id": current_step_id, "judgment_id": judgment_id
                        }), None)).await;
                    }

                    if let Some(arc) = get_inst_arc!() {
                        arc.write().await.status = WorkflowStatus::Paused;
                    }

                    let jt = step.judgment_timeout_ms.or(step.timeout_ms).unwrap_or(default_timeout);
                    let approved = match tokio::time::timeout(Duration::from_millis(jt), rx).await {
                        Ok(Ok(v)) => v,
                        _ => {
                            pending_judgments.remove(&judgment_id);
                            match step.judgment_fallback {
                                JudgmentFallback::Skip => true,
                                JudgmentFallback::FailWorkflow => {
                                    if let Some(arc) = get_inst_arc!() {
                                        let mut inst = arc.write().await;
                                        inst.status = WorkflowStatus::Failed;
                                        inst.error = Some("Judgment timeout".into());
                                        inst.finished_at = Some(chrono::Utc::now());
                                    }
                                    break;
                                }
                                JudgmentFallback::EscalateToMaster => {
                                    warn!("[Workflow] {} judgment escalated", workflow_id);
                                    false
                                }
                            }
                        }
                    };

                    if let Some(arc) = get_inst_arc!() {
                        let mut inst = arc.write().await;
                        if inst.status == WorkflowStatus::Paused {
                            inst.status = WorkflowStatus::Running;
                        }
                    }

                    if !approved { break; }
                }

                // Check cancelled
                {
                    let cancelled = if let Some(arc) = get_inst_arc!() {
                        arc.read().await.status == WorkflowStatus::Cancelled
                    } else {
                        false
                    };
                    if cancelled { break; }
                }

                let context = {
                    if let Some(arc) = get_inst_arc!() {
                        let mut inst = arc.write().await;
                        inst.current_step_id = Some(current_step_id.clone());
                        inst.context.current_step_id = Some(current_step_id.clone());
                        inst.context.clone()
                    } else {
                        break;
                    }
                };

                if let Some(ref bus) = event_bus {
                    bus.publish(DomainEvent::new(crate::event_bus::events::STEP_STARTED, serde_json::json!({
                        "workflow_id": workflow_id, "step_id": current_step_id
                    }), None)).await;
                }

                let timeout_ms = step.timeout_ms.unwrap_or(default_timeout);
                // Get executor Arc, immediately drop DashMap ref before await
                let executor = executors.get(&current_step_id).map(|r| r.value().clone());

                let result = match executor {
                    Some(exec) => {
                        match tokio::time::timeout(Duration::from_millis(timeout_ms), exec(context)).await {
                            Ok(r) => r,
                            Err(_) => {
                                if let Some(ref bus) = event_bus {
                                    bus.publish(DomainEvent::new(crate::event_bus::events::STEP_TIMEOUT, serde_json::json!({
                                        "workflow_id": workflow_id, "step_id": current_step_id
                                    }), None)).await;
                                }
                                StepResult::failure(format!("Step {current_step_id} timed out"))
                            }
                        }
                    }
                    None => StepResult::failure(format!("No executor for {current_step_id}")),
                };

                if result.success {
                    if let Some(ref bus) = event_bus {
                        bus.publish(DomainEvent::new(crate::event_bus::events::STEP_COMPLETED, serde_json::json!({
                            "workflow_id": workflow_id, "step_id": current_step_id
                        }), None)).await;
                    }
                    match result.next_step_id {
                        Some(next) => {
                            if let Some(arc) = get_inst_arc!() {
                                let mut inst = arc.write().await;
                                inst.context.data.insert(
                                    format!("{current_step_id}.output"),
                                    result.output.clone(),
                                );
                                inst.context.previous_step_id = Some(current_step_id.clone());
                            }
                            current_step_id = next;
                        }
                        None => {
                            if let Some(arc) = get_inst_arc!() {
                                let mut inst = arc.write().await;
                                inst.status = WorkflowStatus::Completed;
                                inst.finished_at = Some(chrono::Utc::now());
                            }
                            if let Some(ref bus) = event_bus {
                                bus.publish(DomainEvent::new(crate::event_bus::events::WORKFLOW_COMPLETED, serde_json::json!({
                                    "workflow_id": workflow_id
                                }), None)).await;
                            }
                            info!("[Workflow] {} completed", workflow_id);
                            break;
                        }
                    }
                } else {
                    if let Some(arc) = get_inst_arc!() {
                        let mut inst = arc.write().await;
                        inst.status = WorkflowStatus::Failed;
                        inst.error = result.error.clone();
                        inst.finished_at = Some(chrono::Utc::now());
                    }
                    if let Some(ref bus) = event_bus {
                        bus.publish(DomainEvent::new(crate::event_bus::events::WORKFLOW_FAILED, serde_json::json!({
                            "workflow_id": workflow_id, "error": result.error
                        }), None)).await;
                    }
                    warn!("[Workflow] {} failed at {}", workflow_id, current_step_id);
                    break;
                }
            }

            kill_handles.remove(&workflow_id);
        }
    }

    async fn emit(&self, event_type: &str, payload: serde_json::Value) {
        if let Some(ref bus) = self.event_bus {
            bus.publish(DomainEvent::new(event_type, payload, Some(self.instance_id.clone()))).await;
        }
    }
}

// ─── Parallel Execution ───────────────────────────────────────────────────────

/// How many branches must finish before the join gate opens.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum JoinPolicy {
    /// All branches must complete.
    All,
    /// Any single branch completing is sufficient.
    Any,
    /// At least `n` branches must complete.
    Quorum(usize),
}

/// What to do when one or more parallel branches fail.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum FailBehavior {
    /// Abort remaining branches immediately on first failure.
    FailFast,
    /// Let all branches run; report failures in the final report.
    ContinueOnError,
}

/// Per-step outcome collected by `execute_parallel`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BranchOutcome {
    pub step_id: String,
    pub success: bool,
    pub output: serde_json::Value,
    pub error: Option<String>,
}

/// Aggregated result returned by `execute_parallel`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecutionReport {
    pub success: bool,
    pub outcomes: HashMap<String, BranchOutcome>,
    pub error: Option<String>,
}

/// Fan-out executor: spawns all `steps` concurrently, waits according to
/// `join_policy`, respects `fail_behavior`, and honours a wall-clock
/// `timeout_secs`.
///
/// Each `WorkflowStep` must have a corresponding entry in `executors`; missing
/// executors produce a failed `BranchOutcome` without panicking.
pub async fn execute_parallel(
    steps: Vec<WorkflowStep>,
    executors: Arc<RwLock<HashMap<String, StepExecutor>>>,
    context: WorkflowContext,
    join_policy: JoinPolicy,
    fail_behavior: FailBehavior,
    timeout_secs: u64,
) -> ExecutionReport {
    use futures::future::FutureExt;

    // Snapshot executors once to avoid holding the lock across awaits.
    let exec_map: HashMap<String, StepExecutor> = {
        let guard = executors.read().await;
        steps.iter().filter_map(|s| {
            guard.get(&s.id).map(|e| (s.id.clone(), e.clone()))
        }).collect()
    };

    let total = steps.len();

    // Spawn one task per branch.
    let handles: Vec<(String, tokio::task::JoinHandle<BranchOutcome>)> = steps
        .into_iter()
        .map(|step| {
            let step_id = step.id.clone();
            let mut ctx = context.clone();
            ctx.current_step_id = Some(step_id.clone());
            let timeout_ms = step.timeout_ms.unwrap_or(timeout_secs * 1_000);

            let exec = exec_map.get(&step_id).cloned();
            let sid = step_id.clone();

            let handle = tokio::spawn(async move {
                match exec {
                    None => BranchOutcome {
                        step_id: sid,
                        success: false,
                        output: serde_json::Value::Null,
                        error: Some("no executor registered".into()),
                    },
                    Some(f) => {
                        match tokio::time::timeout(
                            Duration::from_millis(timeout_ms),
                            f(ctx),
                        ).await {
                            Ok(r) => BranchOutcome {
                                step_id: sid,
                                success: r.success,
                                output: r.output,
                                error: r.error,
                            },
                            Err(_) => BranchOutcome {
                                step_id: sid,
                                success: false,
                                output: serde_json::Value::Null,
                                error: Some("step timed out".into()),
                            },
                        }
                    }
                }
            });
            (step_id, handle)
        })
        .collect();

    // Wrap the fan-in logic in a global timeout.
    let wall_timeout = Duration::from_secs(timeout_secs);

    let inner = async move {
        let mut outcomes: HashMap<String, BranchOutcome> = HashMap::new();
        let mut handles = handles;

        match join_policy {
            // ── All: collect every branch ───────────────────────────────────
            JoinPolicy::All => {
                // Collect abort handles first so we can cancel on FailFast.
                let abort_handles: Vec<(String, tokio::task::AbortHandle)> = handles
                    .iter()
                    .map(|(id, jh)| (id.clone(), jh.abort_handle()))
                    .collect();

                for (id, jh) in handles {
                    let o = jh.await.unwrap_or_else(|e| BranchOutcome {
                        step_id: id.clone(),
                        success: false,
                        output: serde_json::Value::Null,
                        error: Some(format!("join error: {e}")),
                    });
                    let failed = !o.success;
                    outcomes.insert(id, o);
                    if failed {
                        if let FailBehavior::FailFast = fail_behavior {
                            // Cancel remaining tasks.
                            for (rid, ah) in &abort_handles {
                                if !outcomes.contains_key(rid) {
                                    ah.abort();
                                }
                            }
                            break;
                        }
                    }
                }
            }

            // ── Any: first success (or all fail) ───────────────────────────
            JoinPolicy::Any => {
                // Drive all handles; stop as soon as one succeeds.
                let remaining: Vec<(String, tokio::task::JoinHandle<BranchOutcome>)> = std::mem::take(&mut handles);
                if !remaining.is_empty() {
                    // Poll every handle once via select_all-style approach.
                    let (outcome, _idx, rest) = futures::future::select_all(
                        remaining.into_iter().map(|(id, jh)| {
                            let id2 = id.clone();
                            jh.map(move |r| {
                                r.unwrap_or_else(|e| BranchOutcome {
                                    step_id: id2.clone(),
                                    success: false,
                                    output: serde_json::Value::Null,
                                    error: Some(format!("join error: {e}")),
                                })
                            }).boxed()
                        })
                    ).await;
                    // Reconstruct remaining — futures::select_all returns the futures,
                    // not the (id, jh) pairs.  We lost the id mapping, so we carry it
                    // inside the future itself (step_id field).
                    let _ = rest; // remaining futures run to completion via abort below
                    let sid = outcome.step_id.clone();
                    outcomes.insert(sid, outcome);
                    // (rest is Vec<BoxFuture> — we can no longer abort them individually;
                    //  they're already detached tasks, so just let them run out naturally)
                    // exit after first resolution regardless
                }
            }

            // ── Quorum: need n completions ─────────────────────────────────
            JoinPolicy::Quorum(n) => {
                let need = n.min(total);
                let mut completed = 0usize;

                // Convert to FuturesUnordered for ordered completion.
                use futures::stream::FuturesUnordered;
                use futures::StreamExt;

                let mut fu: FuturesUnordered<_> = handles
                    .into_iter()
                    .map(|(id, jh)| {
                        jh.map(move |r| {
                            r.unwrap_or_else(|e| BranchOutcome {
                                step_id: id.clone(),
                                success: false,
                                output: serde_json::Value::Null,
                                error: Some(format!("join error: {e}")),
                            })
                        })
                    })
                    .collect();

                while let Some(o) = fu.next().await {
                    let sid = o.step_id.clone();
                    let success = o.success;
                    outcomes.insert(sid, o);
                    if success { completed += 1; }
                    if completed >= need { break; }
                    // FailFast on failure
                    if !success {
                        if let FailBehavior::FailFast = fail_behavior { break; }
                    }
                }
                // Drop `fu`; remaining spawned tasks are detached and will run
                // out naturally (tokio tasks are not cancelled on drop).
            }
        }

        outcomes
    };

    let result = tokio::time::timeout(wall_timeout, inner).await;

    match result {
        Err(_) => ExecutionReport {
            success: false,
            outcomes: HashMap::new(),
            error: Some(format!("parallel execution timed out after {timeout_secs}s")),
        },
        Ok(outcomes) => {
            let failed: Vec<&BranchOutcome> = outcomes.values().filter(|o| !o.success).collect();
            let success = failed.is_empty();
            let error = if success {
                None
            } else {
                Some(failed.iter()
                    .map(|o| format!("{}: {}", o.step_id, o.error.as_deref().unwrap_or("failed")))
                    .collect::<Vec<_>>()
                    .join("; "))
            };
            ExecutionReport { success, outcomes, error }
        }
    }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU32, Ordering};

    fn make_engine() -> WorkflowEngine {
        WorkflowEngine::new("test", None)
    }

    fn simple_def(steps: Vec<(&str, Option<&str>)>) -> WorkflowDefinition {
        let entry = steps[0].0.to_string();
        WorkflowDefinition {
            id: Uuid::new_v4().to_string(),
            name: "test".into(),
            steps: steps.iter().map(|(id, _)| WorkflowStep {
                id: id.to_string(), name: id.to_string(),
                timeout_ms: Some(500), judgment_required: false,
                judgment_fallback: JudgmentFallback::default(), judgment_timeout_ms: None,
            }).collect(),
            entry_step_id: entry,
            default_timeout_ms: 500,
        }
    }

    #[tokio::test]
    async fn single_step_completes() {
        let engine = make_engine();
        let def = simple_def(vec![("s1", None)]);
        let def_id = def.id.clone();
        engine.register_definition(def).await;
        engine.register_step("s1", Arc::new(|_| Box::pin(async { StepResult::success(None) }))).await;

        let wf = engine.start_workflow(&def_id, HashMap::new()).await.unwrap();
        tokio::time::sleep(Duration::from_millis(100)).await;
        assert_eq!(engine.get_instance(&wf).await.unwrap().status, WorkflowStatus::Completed);
    }

    #[tokio::test]
    async fn chained_steps_complete() {
        let engine = make_engine();
        let def = simple_def(vec![("s1", Some("s2")), ("s2", None)]);
        let def_id = def.id.clone();
        engine.register_definition(def).await;
        engine.register_step("s1", Arc::new(|_| Box::pin(async { StepResult::success(Some("s2".into())) }))).await;
        engine.register_step("s2", Arc::new(|_| Box::pin(async { StepResult::success(None) }))).await;

        let wf = engine.start_workflow(&def_id, HashMap::new()).await.unwrap();
        tokio::time::sleep(Duration::from_millis(100)).await;
        assert_eq!(engine.get_instance(&wf).await.unwrap().status, WorkflowStatus::Completed);
    }

    #[tokio::test]
    async fn failed_step_fails_workflow() {
        let engine = make_engine();
        let def = simple_def(vec![("fail", None)]);
        let def_id = def.id.clone();
        engine.register_definition(def).await;
        engine.register_step("fail", Arc::new(|_| Box::pin(async { StepResult::failure("oops") }))).await;

        let wf = engine.start_workflow(&def_id, HashMap::new()).await.unwrap();
        tokio::time::sleep(Duration::from_millis(100)).await;
        let inst = engine.get_instance(&wf).await.unwrap();
        assert_eq!(inst.status, WorkflowStatus::Failed);
        assert!(inst.error.as_deref().unwrap_or("").contains("oops"));
    }

    #[tokio::test]
    async fn cancel_stops_execution() {
        let engine = make_engine();
        let counter = Arc::new(AtomicU32::new(0));
        let def = WorkflowDefinition {
            id: "slow".into(), name: "slow".into(),
            steps: vec![WorkflowStep {
                id: "slow".into(), name: "slow".into(),
                timeout_ms: Some(10_000), judgment_required: false,
                judgment_fallback: JudgmentFallback::default(), judgment_timeout_ms: None,
            }],
            entry_step_id: "slow".into(), default_timeout_ms: 10_000,
        };
        engine.register_definition(def).await;
        let c = counter.clone();
        engine.register_step("slow", Arc::new(move |_| {
            let cc = c.clone();
            Box::pin(async move {
                tokio::time::sleep(Duration::from_secs(10)).await;
                cc.fetch_add(1, Ordering::Relaxed);
                StepResult::success(None)
            })
        })).await;

        let wf = engine.start_workflow("slow", HashMap::new()).await.unwrap();
        tokio::time::sleep(Duration::from_millis(50)).await;
        engine.cancel_workflow(&wf).await;
        tokio::time::sleep(Duration::from_millis(100)).await;

        assert_eq!(engine.get_instance(&wf).await.unwrap().status, WorkflowStatus::Cancelled);
        assert_eq!(counter.load(Ordering::Relaxed), 0);
    }

    #[tokio::test]
    async fn step_timeout_fails_workflow() {
        let engine = make_engine();
        let def = WorkflowDefinition {
            id: "t".into(), name: "t".into(),
            steps: vec![WorkflowStep {
                id: "slow".into(), name: "slow".into(),
                timeout_ms: Some(50), judgment_required: false,
                judgment_fallback: JudgmentFallback::default(), judgment_timeout_ms: None,
            }],
            entry_step_id: "slow".into(), default_timeout_ms: 50,
        };
        engine.register_definition(def).await;
        engine.register_step("slow", Arc::new(|_| Box::pin(async {
            tokio::time::sleep(Duration::from_secs(10)).await;
            StepResult::success(None)
        }))).await;

        let wf = engine.start_workflow("t", HashMap::new()).await.unwrap();
        tokio::time::sleep(Duration::from_millis(200)).await;
        assert_eq!(engine.get_instance(&wf).await.unwrap().status, WorkflowStatus::Failed);
    }

    #[tokio::test]
    async fn judgment_approved_continues() {
        let engine = make_engine();
        let def = WorkflowDefinition {
            id: "j".into(), name: "j".into(),
            steps: vec![
                WorkflowStep { id: "gate".into(), name: "gate".into(), timeout_ms: Some(5_000),
                    judgment_required: true, judgment_fallback: JudgmentFallback::Skip, judgment_timeout_ms: Some(2_000) },
                WorkflowStep { id: "after".into(), name: "after".into(), timeout_ms: Some(500),
                    judgment_required: false, judgment_fallback: JudgmentFallback::default(), judgment_timeout_ms: None },
            ],
            entry_step_id: "gate".into(), default_timeout_ms: 5_000,
        };
        engine.register_definition(def).await;
        engine.register_step("gate", Arc::new(|_| Box::pin(async { StepResult::success(Some("after".into())) }))).await;
        engine.register_step("after", Arc::new(|_| Box::pin(async { StepResult::success(None) }))).await;

        let wf = engine.start_workflow("j", HashMap::new()).await.unwrap();
        tokio::time::sleep(Duration::from_millis(50)).await;

        let jids: Vec<String> = engine.pending_judgments.iter().map(|r| r.key().clone()).collect();
        if let Some(jid) = jids.first() {
            engine.resolve_judgment(jid, true).await;
        }

        tokio::time::sleep(Duration::from_millis(200)).await;
        assert_eq!(engine.get_instance(&wf).await.unwrap().status, WorkflowStatus::Completed);
    }

    #[tokio::test]
    async fn judgment_timeout_skip_continues() {
        let engine = make_engine();
        let def = WorkflowDefinition {
            id: "jt".into(), name: "jt".into(),
            steps: vec![
                WorkflowStep { id: "gate".into(), name: "gate".into(), timeout_ms: Some(5_000),
                    judgment_required: true, judgment_fallback: JudgmentFallback::Skip, judgment_timeout_ms: Some(50) },
                WorkflowStep { id: "after".into(), name: "after".into(), timeout_ms: Some(500),
                    judgment_required: false, judgment_fallback: JudgmentFallback::default(), judgment_timeout_ms: None },
            ],
            entry_step_id: "gate".into(), default_timeout_ms: 5_000,
        };
        engine.register_definition(def).await;
        engine.register_step("gate", Arc::new(|_| Box::pin(async { StepResult::success(Some("after".into())) }))).await;
        engine.register_step("after", Arc::new(|_| Box::pin(async { StepResult::success(None) }))).await;

        let wf = engine.start_workflow("jt", HashMap::new()).await.unwrap();
        // Don't resolve — let it time out and skip
        tokio::time::sleep(Duration::from_millis(400)).await;
        assert_eq!(engine.get_instance(&wf).await.unwrap().status, WorkflowStatus::Completed);
    }

    // ── Parallel tests ─────────────────────────────────────────────────────────

    fn make_executors(ids: &[&str]) -> Arc<RwLock<HashMap<String, StepExecutor>>> {
        let mut m: HashMap<String, StepExecutor> = HashMap::new();
        for &id in ids {
            let sid = id.to_string();
            m.insert(sid, Arc::new(|_| Box::pin(async { StepResult::success(None) })));
        }
        Arc::new(RwLock::new(m))
    }

    fn par_steps(ids: &[&str]) -> Vec<WorkflowStep> {
        ids.iter().map(|&id| WorkflowStep {
            id: id.to_string(), name: id.to_string(),
            timeout_ms: Some(500), judgment_required: false,
            judgment_fallback: JudgmentFallback::default(), judgment_timeout_ms: None,
        }).collect()
    }

    fn base_ctx() -> WorkflowContext {
        WorkflowContext { workflow_id: "par-test".into(), ..Default::default() }
    }

    #[tokio::test]
    async fn parallel_all_succeed() {
        let steps = par_steps(&["a", "b", "c"]);
        let execs = make_executors(&["a", "b", "c"]);
        let report = execute_parallel(steps, execs, base_ctx(), JoinPolicy::All, FailBehavior::FailFast, 5).await;
        assert!(report.success);
        assert_eq!(report.outcomes.len(), 3);
    }

    #[tokio::test]
    async fn parallel_all_failfast_on_first_failure() {
        let steps = par_steps(&["ok", "fail"]);
        let mut m: HashMap<String, StepExecutor> = HashMap::new();
        m.insert("ok".into(), Arc::new(|_| Box::pin(async { StepResult::success(None) })));
        m.insert("fail".into(), Arc::new(|_| Box::pin(async { StepResult::failure("boom") })));
        let execs = Arc::new(RwLock::new(m));

        let report = execute_parallel(steps, execs, base_ctx(), JoinPolicy::All, FailBehavior::FailFast, 5).await;
        assert!(!report.success);
    }

    #[tokio::test]
    async fn parallel_any_succeeds_on_first() {
        let steps = par_steps(&["fast", "slow"]);
        let mut m: HashMap<String, StepExecutor> = HashMap::new();
        m.insert("fast".into(), Arc::new(|_| Box::pin(async { StepResult::success(None) })));
        m.insert("slow".into(), Arc::new(|_| Box::pin(async {
            tokio::time::sleep(Duration::from_secs(10)).await;
            StepResult::success(None)
        })));
        let execs = Arc::new(RwLock::new(m));

        let report = execute_parallel(steps, execs, base_ctx(), JoinPolicy::Any, FailBehavior::ContinueOnError, 5).await;
        // At least one outcome recorded, and no timeout
        assert!(report.error.as_deref().map(|e| !e.contains("timed out")).unwrap_or(true));
    }

    #[tokio::test]
    async fn parallel_quorum_two_of_three() {
        let steps = par_steps(&["a", "b", "c"]);
        let execs = make_executors(&["a", "b", "c"]);
        let report = execute_parallel(steps, execs, base_ctx(), JoinPolicy::Quorum(2), FailBehavior::ContinueOnError, 5).await;
        // At least 2 outcomes collected
        assert!(report.outcomes.len() >= 2);
    }

    #[tokio::test]
    async fn parallel_global_timeout() {
        let steps = par_steps(&["slow"]);
        let mut m: HashMap<String, StepExecutor> = HashMap::new();
        m.insert("slow".into(), Arc::new(|_| Box::pin(async {
            tokio::time::sleep(Duration::from_secs(60)).await;
            StepResult::success(None)
        })));
        let execs = Arc::new(RwLock::new(m));

        let report = execute_parallel(steps, execs, base_ctx(), JoinPolicy::All, FailBehavior::FailFast, 1).await;
        assert!(!report.success);
        assert!(report.error.as_deref().unwrap_or("").contains("timed out"));
    }
}
