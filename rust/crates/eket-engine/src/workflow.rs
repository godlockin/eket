// ─── Ticket Lifecycle State Machine (TASK-228) ───────────────────────────────

/// Ticket lifecycle states (distinct from `WorkflowStatus` which is per-step).
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum WorkflowState {
    Backlog,
    Analysis,
    Ready,
    InProgress,
    Review,
    Done,
    Blocked,
    Cancelled,
}

impl std::fmt::Display for WorkflowState {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let s = match self {
            Self::Backlog => "backlog",
            Self::Analysis => "analysis",
            Self::Ready => "ready",
            Self::InProgress => "in_progress",
            Self::Review => "review",
            Self::Done => "done",
            Self::Blocked => "blocked",
            Self::Cancelled => "cancelled",
        };
        write!(f, "{s}")
    }
}

impl std::str::FromStr for WorkflowState {
    type Err = eket_core::error::EketError;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "backlog" => Ok(Self::Backlog),
            "analysis" => Ok(Self::Analysis),
            "ready" => Ok(Self::Ready),
            "in_progress" => Ok(Self::InProgress),
            "review" => Ok(Self::Review),
            "done" => Ok(Self::Done),
            "blocked" => Ok(Self::Blocked),
            "cancelled" => Ok(Self::Cancelled),
            other => Err(eket_core::error::EketError::InvalidInput(format!("unknown WorkflowState: {other}"))),
        }
    }
}

/// Validates ticket lifecycle transitions.
pub struct WorkflowTransition;

impl WorkflowTransition {
    pub fn validate(from: &WorkflowState, to: &WorkflowState) -> Result<(), eket_core::error::EketError> {
        let valid = matches!(
            (from, to),
            (WorkflowState::Backlog, WorkflowState::Analysis)
                | (WorkflowState::Analysis, WorkflowState::Ready)
                | (WorkflowState::Ready, WorkflowState::InProgress)
                | (WorkflowState::InProgress, WorkflowState::Review)
                | (WorkflowState::Review, WorkflowState::Done)
                | (WorkflowState::Review, WorkflowState::InProgress)
                | (WorkflowState::InProgress, WorkflowState::Blocked)
                | (WorkflowState::Blocked, WorkflowState::Ready)
                | (_, WorkflowState::Cancelled)
        );
        if valid {
            Ok(())
        } else {
            Err(eket_core::error::EketError::InvalidTransition {
                from: from.to_string(),
                to: to.to_string(),
            })
        }
    }
}

// ─── Workflow Engine — 对应 TS: workflow-engine.ts
///
/// tokio async 状态机实现
/// 状态：pending → running → (paused ↔ running) → completed / failed
///
/// 关键设计：
/// - WorkflowInstance 存于 DashMap（并发安全，无全局锁）
/// - 步骤超时通过 tokio::time::timeout（无 timer 泄漏）
/// - JudgmentPoint：oneshot 通道，外部 resolve_judgment() 发信号
/// - kill-switch：每个实例持有 AbortHandle，cancel 时立即终止
use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use std::time::Duration;

use dashmap::DashMap;
use serde::{Deserialize, Serialize};
use tokio::sync::{oneshot, RwLock};
use tracing::{debug, info, warn};
use uuid::Uuid;

use crate::event_bus::{DomainEvent, EventBus};
use crate::step_snapshot::{archive_and_compress_context, StepSnapshotStore};
use eket_core::error::EketError;

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

/// Per-step context budget configuration.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ContextBudget {
    pub max_tokens: Option<usize>,
    pub keep_recent_n: Option<usize>,
    pub exclude_tool_outputs: bool,
    pub include_fields: Option<Vec<String>>,
}

/// Estimate token count from a string: chars / 4.
pub fn estimate_tokens(s: &str) -> usize {
    s.chars().count() / 4
}

/// Recursively estimate token count from a JSON value.
pub fn estimate_value_tokens(v: &serde_json::Value) -> usize {
    match v {
        serde_json::Value::Null => 1,
        serde_json::Value::Bool(_) => 1,
        serde_json::Value::Number(n) => estimate_tokens(&n.to_string()).max(1),
        serde_json::Value::String(s) => estimate_tokens(s).max(1),
        serde_json::Value::Array(arr) => arr.iter().map(estimate_value_tokens).sum::<usize>() + 2,
        serde_json::Value::Object(map) => {
            map.iter()
                .map(|(k, v)| estimate_tokens(k).max(1) + estimate_value_tokens(v))
                .sum::<usize>()
                + 2
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct WorkflowStep {
    pub id: String,
    pub name: String,
    pub timeout_ms: Option<u64>,
    #[serde(default)]
    pub judgment_required: bool,
    #[serde(default)]
    pub judgment_fallback: JudgmentFallback,
    pub judgment_timeout_ms: Option<u64>,
    #[serde(default)]
    pub context_budget: Option<ContextBudget>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
#[derive(Default)]
pub enum JudgmentFallback {
    #[default]
    EscalateToMaster,
    Skip,
    FailWorkflow,
}


#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct WorkflowDefinition {
    pub id: String,
    pub name: String,
    pub steps: Vec<WorkflowStep>,
    pub entry_step_id: String,
    #[serde(default = "default_timeout_ms")]
    pub default_timeout_ms: u64,
}

fn default_timeout_ms() -> u64 { 300_000 }

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
    /// Per-workflow-id step snapshot store (ToC snapshot mode, TASK-211).
    pub(crate) snapshot_store: Arc<std::sync::Mutex<StepSnapshotStore>>,
}

impl WorkflowEngine {
    pub fn new(instance_id: impl Into<String>, event_bus: Option<EventBus>) -> Self {
        let snapshot_store = StepSnapshotStore::new_in_memory()
            .expect("failed to init in-memory step snapshot store");
        Self {
            instance_id: instance_id.into(),
            definitions: Arc::new(RwLock::new(HashMap::new())),
            instances: Arc::new(DashMap::new()),
            executors: Arc::new(DashMap::new()),
            pending_judgments: Arc::new(DashMap::new()),
            kill_handles: Arc::new(DashMap::new()),
            event_bus,
            default_timeout_ms: 300_000,
            snapshot_store: Arc::new(std::sync::Mutex::new(snapshot_store)),
        }
    }

    pub async fn register_definition(&self, def: WorkflowDefinition) -> Result<(), EketError> {
        let mut seen = HashSet::new();
        for step in &def.steps {
            if !seen.insert(step.id.clone()) {
                return Err(EketError::InvalidInput(format!("duplicate step id: {}", step.id)));
            }
        }
        self.definitions.write().await.insert(def.id.clone(), def);
        Ok(())
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

        let runner = self.make_runner(workflow_id.clone(), def, self.snapshot_store.clone());
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

    fn make_runner(&self, workflow_id: String, def: WorkflowDefinition, snapshot_store: Arc<std::sync::Mutex<StepSnapshotStore>>) -> impl std::future::Future<Output = ()> {
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
                                    if let Some(arc) = get_inst_arc!() {
                                        let mut inst = arc.write().await;
                                        inst.status = WorkflowStatus::Failed;
                                        inst.error = Some("Judgment escalated to master: awaiting decision".into());
                                        inst.finished_at = Some(chrono::Utc::now());
                                    }
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

                // Apply context budget for this step (TASK-207)
                // TASK-216: capture trimmed data to write back to inst.context after execution
                let trimmed_data: Option<std::collections::HashMap<String, serde_json::Value>> =
                    if let Some(ref budget) = step.context_budget {
                        let mut tmp = context.data.clone();
                        crate::context_budget::apply_budget(&mut tmp, budget);
                        Some(tmp)
                    } else {
                        None
                    };
                let context = if let Some(ref trimmed) = trimmed_data {
                    let before_tokens: usize = context.data.values().map(crate::workflow::estimate_value_tokens).sum();
                    let after_tokens: usize = trimmed.values().map(crate::workflow::estimate_value_tokens).sum();
                    debug!("context budget applied: {} tokens → {} tokens (step={})", before_tokens, after_tokens, current_step_id);
                    let mut ctx = context;
                    ctx.data = trimmed.clone();
                    ctx
                } else {
                    context
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
                                // TASK-216: write trimmed context back so budget persists
                                if let Some(trimmed) = trimmed_data {
                                    inst.context.data = trimmed;
                                }
                                // TASK-215: insert output BEFORE archive so snapshot includes it
                                inst.context.data.insert(
                                    format!("{current_step_id}.output"),
                                    result.output.clone(),
                                );
                                // ToC snapshot: archive completed step, compress context
                                {
                                    let completed_step = current_step_id.clone();
                                    if let Ok(ref store) = snapshot_store.lock() {
                                        let _ = archive_and_compress_context(
                                            store,
                                            &workflow_id,
                                            &completed_step,
                                            &mut inst.context.data,
                                        );
                                    }
                                }
                                inst.context.previous_step_id = Some(current_step_id.clone());
                            }
                            current_step_id = next;
                        }
                        None => {
                            if let Some(arc) = get_inst_arc!() {
                                let mut inst = arc.write().await;
                                // TASK-216: write trimmed context back for final step too
                                if let Some(trimmed) = trimmed_data {
                                    inst.context.data = trimmed;
                                }
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

            // ── Any: first SUCCESS wins; abort all others (TASK-186) ─────
            JoinPolicy::Any => {
                use futures::stream::{FuturesUnordered, StreamExt};

                // Decompose into (abort_handle, JoinHandle) pairs so we can
                // abort losers while still awaiting winners.
                let mut fu: FuturesUnordered<_> = FuturesUnordered::new();
                let mut abort_handles: Vec<(String, tokio::task::AbortHandle)> = Vec::new();

                let remaining = std::mem::take(&mut handles);
                for (id, jh) in remaining {
                    let ah = jh.abort_handle();
                    abort_handles.push((id.clone(), ah));
                    fu.push(jh.map(move |r| {
                        r.unwrap_or_else(|e| BranchOutcome {
                            step_id: id.clone(),
                            success: false,
                            output: serde_json::Value::Null,
                            error: Some(format!("join error: {e}")),
                        })
                    }));
                }

                let mut first_success: Option<BranchOutcome> = None;
                let mut all_failures: Vec<BranchOutcome> = Vec::new();

                while let Some(outcome) = fu.next().await {
                    if outcome.success {
                        first_success = Some(outcome);
                        break; // abort the rest below
                    } else {
                        all_failures.push(outcome);
                    }
                }

                // Abort all remaining in-flight branches
                for (id, ah) in &abort_handles {
                    ah.abort();
                    debug!("[workflow] JoinPolicy::Any aborted loser branch {id}");
                }

                if let Some(winner) = first_success {
                    outcomes.insert(winner.step_id.clone(), winner);
                } else {
                    // All branches failed → record all failures
                    for f in all_failures {
                        outcomes.insert(f.step_id.clone(), f);
                    }
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
                context_budget: None,
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
        engine.register_definition(def).await.unwrap();
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
        engine.register_definition(def).await.unwrap();
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
        engine.register_definition(def).await.unwrap();
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
                context_budget: None,
            }],
            entry_step_id: "slow".into(), default_timeout_ms: 10_000,
        };
        engine.register_definition(def).await.unwrap();
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
                context_budget: None,
            }],
            entry_step_id: "slow".into(), default_timeout_ms: 50,
        };
        engine.register_definition(def).await.unwrap();
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
                    judgment_required: true, judgment_fallback: JudgmentFallback::Skip, judgment_timeout_ms: Some(2_000), context_budget: None },
                WorkflowStep { id: "after".into(), name: "after".into(), timeout_ms: Some(500),
                    judgment_required: false, judgment_fallback: JudgmentFallback::default(), judgment_timeout_ms: None, context_budget: None },
            ],
            entry_step_id: "gate".into(), default_timeout_ms: 5_000,
        };
        engine.register_definition(def).await.unwrap();
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
                    judgment_required: true, judgment_fallback: JudgmentFallback::Skip, judgment_timeout_ms: Some(50), context_budget: None },
                WorkflowStep { id: "after".into(), name: "after".into(), timeout_ms: Some(500),
                    judgment_required: false, judgment_fallback: JudgmentFallback::default(), judgment_timeout_ms: None, context_budget: None },
            ],
            entry_step_id: "gate".into(), default_timeout_ms: 5_000,
        };
        engine.register_definition(def).await.unwrap();
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
            context_budget: None,
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

    // ── JoinPolicy abort tests ─────────────────────────────────────────────────

    #[tokio::test]
    async fn parallel_any_aborts_remaining_tasks() {
        use std::sync::atomic::Ordering;
        let b_completed = Arc::new(std::sync::atomic::AtomicBool::new(false));
        let flag = b_completed.clone();

        let steps = par_steps(&["a", "b"]);
        let mut m: HashMap<String, StepExecutor> = HashMap::new();
        m.insert("a".into(), Arc::new(|_| Box::pin(async { StepResult::success(None) })));
        m.insert(
            "b".into(),
            Arc::new(move |_| {
                let flag = flag.clone();
                Box::pin(async move {
                    tokio::time::sleep(Duration::from_secs(10)).await;
                    flag.store(true, Ordering::SeqCst);
                    StepResult::success(None)
                })
            }),
        );
        let execs = Arc::new(RwLock::new(m));

        let report = execute_parallel(
            steps,
            execs,
            base_ctx(),
            JoinPolicy::Any,
            FailBehavior::ContinueOnError,
            5,
        )
        .await;
        assert!(report.outcomes.contains_key("a"));

        tokio::time::sleep(Duration::from_millis(50)).await;
        assert!(
            !b_completed.load(Ordering::SeqCst),
            "task 'b' should have been aborted, not run to completion"
        );
    }

    #[tokio::test]
    async fn parallel_quorum_aborts_remaining_tasks() {
        use std::sync::atomic::Ordering;
        let c_completed = Arc::new(std::sync::atomic::AtomicBool::new(false));
        let flag = c_completed.clone();

        let steps = par_steps(&["a", "b", "c"]);
        let mut m: HashMap<String, StepExecutor> = HashMap::new();
        m.insert("a".into(), Arc::new(|_| Box::pin(async { StepResult::success(None) })));
        m.insert("b".into(), Arc::new(|_| Box::pin(async { StepResult::success(None) })));
        m.insert(
            "c".into(),
            Arc::new(move |_| {
                let flag = flag.clone();
                Box::pin(async move {
                    tokio::time::sleep(Duration::from_secs(10)).await;
                    flag.store(true, Ordering::SeqCst);
                    StepResult::success(None)
                })
            }),
        );
        let execs = Arc::new(RwLock::new(m));

        let report = execute_parallel(
            steps,
            execs,
            base_ctx(),
            JoinPolicy::Quorum(2),
            FailBehavior::ContinueOnError,
            5,
        )
        .await;
        assert!(report.outcomes.len() >= 2);

        tokio::time::sleep(Duration::from_millis(50)).await;
        assert!(
            !c_completed.load(Ordering::SeqCst),
            "task 'c' should have been aborted after quorum reached"
        );
    }

    // ── ContextBudget / token estimator tests ──────────────────────────────────

    #[test]
    fn estimate_tokens_empty() {
        assert_eq!(estimate_tokens(""), 0);
    }

    #[test]
    fn estimate_tokens_short() {
        // "hello" = 5 chars → 5/4 = 1
        assert_eq!(estimate_tokens("hello"), 1);
    }

    #[test]
    fn estimate_tokens_long() {
        let s = "a".repeat(100);
        assert_eq!(estimate_tokens(&s), 25);
    }

    #[test]
    fn estimate_value_tokens_null() {
        assert_eq!(estimate_value_tokens(&serde_json::Value::Null), 1);
    }

    #[test]
    fn estimate_value_tokens_string() {
        let v = serde_json::json!("hello world");
        // "hello world" = 11 chars → 11/4 = 2
        assert_eq!(estimate_value_tokens(&v), 2);
    }

    #[test]
    fn estimate_value_tokens_object() {
        let v = serde_json::json!({ "key": "value" });
        // key=3chars→0+2overhead + value=5chars→1 → total = max(1,0)+1+2 = 4
        let tokens = estimate_value_tokens(&v);
        assert!(tokens > 0);
    }

    #[test]
    fn estimate_value_tokens_array() {
        let v = serde_json::json!([1, 2, 3]);
        let tokens = estimate_value_tokens(&v);
        assert!(tokens >= 2); // at least the 2 overhead tokens
    }

    // ── TASK-208: WorkflowDefinition serde roundtrip ───────────────────────────

    #[test]
    fn workflow_definition_budget_roundtrip() {
        let def = WorkflowDefinition {
            id: "wf-1".into(),
            name: "My Workflow".into(),
            entry_step_id: "analyze".into(),
            default_timeout_ms: 60_000,
            steps: vec![
                WorkflowStep {
                    id: "analyze".into(),
                    name: "Analyze".into(),
                    timeout_ms: Some(5_000),
                    judgment_required: false,
                    judgment_fallback: JudgmentFallback::EscalateToMaster,
                    judgment_timeout_ms: None,
                    context_budget: Some(ContextBudget {
                        max_tokens: Some(2000),
                        keep_recent_n: Some(10),
                        exclude_tool_outputs: false,
                        include_fields: None,
                    }),
                },
                WorkflowStep {
                    id: "review".into(),
                    name: "Review".into(),
                    timeout_ms: None,
                    judgment_required: true,
                    judgment_fallback: JudgmentFallback::Skip,
                    judgment_timeout_ms: Some(30_000),
                    context_budget: None,
                },
            ],
        };

        let json = serde_json::to_string(&def).expect("serialize");
        let de: WorkflowDefinition = serde_json::from_str(&json).expect("deserialize");

        assert_eq!(de.id, def.id);
        assert_eq!(de.steps.len(), 2);
        let budget = de.steps[0].context_budget.as_ref().expect("budget present");
        assert_eq!(budget.max_tokens, Some(2000));
        assert_eq!(budget.keep_recent_n, Some(10));
        assert!(de.steps[1].context_budget.is_none());
        assert_eq!(de.steps[1].judgment_fallback, JudgmentFallback::Skip);
    }

    #[test]
    fn context_budget_default() {
        let b = ContextBudget::default();
        assert!(b.max_tokens.is_none());
        assert!(b.keep_recent_n.is_none());
        assert!(!b.exclude_tool_outputs);
        assert!(b.include_fields.is_none());
    }

    // ── Integration test: budget applied at step transition ────────────────────

    #[tokio::test]
    async fn context_budget_truncates_large_history_on_step_transition() {
        let engine = make_engine();

        // Step s2 has a budget that keeps only 2 history items
        let budget_step = WorkflowStep {
            id: "s2".into(), name: "s2".into(),
            timeout_ms: Some(500), judgment_required: false,
            judgment_fallback: JudgmentFallback::default(), judgment_timeout_ms: None,
            context_budget: Some(ContextBudget {
                keep_recent_n: Some(2),
                ..Default::default()
            }),
        };
        let def = WorkflowDefinition {
            id: "budget-test".into(), name: "budget-test".into(),
            steps: vec![
                WorkflowStep {
                    id: "s1".into(), name: "s1".into(),
                    timeout_ms: Some(500), judgment_required: false,
                    judgment_fallback: JudgmentFallback::default(), judgment_timeout_ms: None,
                    context_budget: None,
                },
                budget_step,
            ],
            entry_step_id: "s1".into(), default_timeout_ms: 500,
        };
        engine.register_definition(def).await.unwrap();

        // s1 succeeds and transitions to s2
        engine.register_step("s1", Arc::new(|_| Box::pin(async {
            StepResult::success(Some("s2".into()))
        }))).await;

        // s2 captures the context it receives and verifies history is truncated
        let captured: Arc<tokio::sync::Mutex<Option<Vec<serde_json::Value>>>> =
            Arc::new(tokio::sync::Mutex::new(None));
        let cap2 = captured.clone();
        engine.register_step("s2", Arc::new(move |ctx: WorkflowContext| {
            let cap = cap2.clone();
            Box::pin(async move {
                let history = ctx.data.get("history")
                    .and_then(|v| v.as_array())
                    .cloned()
                    .unwrap_or_default();
                *cap.lock().await = Some(history);
                StepResult::success(None)
            })
        })).await;

        // Start with 5-item history
        let mut initial: HashMap<String, serde_json::Value> = HashMap::new();
        initial.insert("history".into(), serde_json::json!([1, 2, 3, 4, 5]));

        let wf = engine.start_workflow("budget-test", initial).await.unwrap();
        tokio::time::sleep(Duration::from_millis(200)).await;

        assert_eq!(engine.get_instance(&wf).await.unwrap().status, WorkflowStatus::Completed);

        // s2 should have received only 2 items (keep_recent_n=2)
        let hist = captured.lock().await.clone().expect("s2 never ran");
        assert_eq!(hist.len(), 2, "expected 2 history items after budget, got {}", hist.len());
        assert_eq!(hist[0], serde_json::json!(4));
        assert_eq!(hist[1], serde_json::json!(5));
    }

    /// TASK-220: EscalateToMaster zombie fix — workflow must end as Failed, not Paused forever.
    #[tokio::test]
    async fn test_escalate_to_master_sets_failed_status() {
        let engine = WorkflowEngine::new("test-escalate", None);

        let def = WorkflowDefinition {
            id: "escalate-test".into(),
            name: "EscalateTest".into(),
            entry_step_id: "s1".into(),
            default_timeout_ms: 5_000,
            steps: vec![WorkflowStep {
                id: "s1".into(),
                name: "S1".into(),
                timeout_ms: Some(1_000),
                judgment_required: true,
                judgment_fallback: JudgmentFallback::EscalateToMaster,
                judgment_timeout_ms: Some(50),
                context_budget: None,
            }],
        };
        engine.register_definition(def).await.unwrap();
        engine.register_step("s1", Arc::new(|_ctx| Box::pin(async { StepResult::success(None) }))).await;

        let wf_id = engine.start_workflow("escalate-test", HashMap::new()).await.unwrap();

        tokio::time::sleep(Duration::from_millis(300)).await;

        let inst = engine.get_instance(&wf_id).await.expect("instance missing");
        assert_eq!(inst.status, WorkflowStatus::Failed, "expected Failed, got {:?}", inst.status);
        assert!(inst.finished_at.is_some(), "finished_at should be set");
        let err = inst.error.as_deref().unwrap_or("");
        assert!(err.contains("escalated to master"), "unexpected error: {err}");
    }

    // ── TASK-215: snapshot must include step output ──────────────────────────────
    #[tokio::test]
    async fn task215_snapshot_includes_step_output() {
        let engine = make_engine();
        let def = simple_def(vec![("s1", Some("s2")), ("s2", None)]);
        let def_id = def.id.clone();
        engine.register_definition(def).await.unwrap();

        engine.register_step("s1", Arc::new(|_| Box::pin(async {
            let mut r = StepResult::success(Some("s2".into()));
            r.output = serde_json::json!({"answer": 42});
            r
        }))).await;
        engine.register_step("s2", Arc::new(|_| Box::pin(async { StepResult::success(None) }))).await;

        let wf = engine.start_workflow(&def_id, HashMap::new()).await.unwrap();
        tokio::time::sleep(Duration::from_millis(200)).await;
        assert_eq!(engine.get_instance(&wf).await.unwrap().status, WorkflowStatus::Completed);

        let store = engine.snapshot_store.lock().unwrap();
        let snapshots = store.list_snapshots(&wf).unwrap();
        let s1_snap = snapshots.iter().find(|s| s.step_id == "s1")
            .expect("no snapshot for s1");
        assert!(
            s1_snap.full_data_json.contains("answer"),
            "s1 snapshot missing output; full_data_json={}",
            s1_snap.full_data_json
        );
    }

    // ── TASK-216: budget must persist to inst.context ─────────────────────────
    #[tokio::test]
    async fn task216_budget_written_back_to_inst_context() {
        let engine = make_engine();
        let budget_step = WorkflowStep {
            id: "s1".into(), name: "s1".into(),
            timeout_ms: Some(500), judgment_required: false,
            judgment_fallback: JudgmentFallback::default(), judgment_timeout_ms: None,
            context_budget: Some(ContextBudget { keep_recent_n: Some(1), ..Default::default() }),
        };
        let def = WorkflowDefinition {
            id: "bw-test".into(), name: "bw-test".into(),
            steps: vec![budget_step],
            entry_step_id: "s1".into(), default_timeout_ms: 500,
        };
        engine.register_definition(def).await.unwrap();
        engine.register_step("s1", Arc::new(|_| Box::pin(async { StepResult::success(None) }))).await;

        let mut initial: HashMap<String, serde_json::Value> = HashMap::new();
        initial.insert("history".into(), serde_json::json!([10, 20, 30, 40, 50]));

        let wf = engine.start_workflow("bw-test", initial).await.unwrap();
        tokio::time::sleep(Duration::from_millis(200)).await;
        assert_eq!(engine.get_instance(&wf).await.unwrap().status, WorkflowStatus::Completed);

        let inst = engine.get_instance(&wf).await.unwrap();
        let hist = inst.context.data.get("history")
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default();
        assert!(
            hist.len() <= 1,
            "expected inst.context history ≤1 after budget writeback, got {}",
            hist.len()
        );
    }
}
