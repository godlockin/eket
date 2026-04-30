/// Workflow Engine — 对应 TS: workflow-engine.ts
///
/// tokio async 状态机实现
/// 状态：pending → running → (paused ↔ running) → completed / failed
///
/// 关键设计：
/// - WorkflowInstance 存于 Arc<RwLock<HashMap>>（并发安全）
/// - 步骤超时通过 tokio::time::timeout（无 timer 泄漏）
/// - JudgmentPoint：oneshot 通道，外部 resolve_judgment() 发信号
/// - kill-switch：每个实例持有 AbortHandle，cancel 时立即终止

use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;

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
pub enum JudgmentFallback {
    EscalateToMaster,
    Skip,
    FailWorkflow,
}

impl Default for JudgmentFallback {
    fn default() -> Self { Self::EscalateToMaster }
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
    pub(crate) instances: Arc<RwLock<HashMap<String, WorkflowInstance>>>,
    pub(crate) executors: Arc<RwLock<HashMap<String, StepExecutor>>>,
    pub(crate) pending_judgments: Arc<RwLock<HashMap<String, JudgmentSender>>>,
    kill_handles: Arc<RwLock<HashMap<String, tokio::task::AbortHandle>>>,
    event_bus: Option<EventBus>,
    default_timeout_ms: u64,
}

impl WorkflowEngine {
    pub fn new(instance_id: impl Into<String>, event_bus: Option<EventBus>) -> Self {
        Self {
            instance_id: instance_id.into(),
            definitions: Arc::new(RwLock::new(HashMap::new())),
            instances: Arc::new(RwLock::new(HashMap::new())),
            executors: Arc::new(RwLock::new(HashMap::new())),
            pending_judgments: Arc::new(RwLock::new(HashMap::new())),
            kill_handles: Arc::new(RwLock::new(HashMap::new())),
            event_bus,
            default_timeout_ms: 300_000,
        }
    }

    pub async fn register_definition(&self, def: WorkflowDefinition) {
        self.definitions.write().await.insert(def.id.clone(), def);
    }

    pub async fn register_step(&self, step_id: impl Into<String>, executor: StepExecutor) {
        self.executors.write().await.insert(step_id.into(), executor);
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

        self.instances.write().await.insert(workflow_id.clone(), instance);
        self.emit(crate::event_bus::events::WORKFLOW_STARTED, serde_json::json!({
            "workflow_id": workflow_id, "definition_id": definition_id
        })).await;

        let runner = self.make_runner(workflow_id.clone(), def);
        let join_handle = tokio::spawn(runner);
        let handle = join_handle.abort_handle();
        self.kill_handles.write().await.insert(workflow_id.clone(), handle);

        info!("[Workflow] {} started", workflow_id);
        Ok(workflow_id)
    }

    pub async fn cancel_workflow(&self, workflow_id: &str) {
        if let Some(handle) = self.kill_handles.write().await.remove(workflow_id) {
            handle.abort();
        }
        let mut instances = self.instances.write().await;
        if let Some(inst) = instances.get_mut(workflow_id) {
            inst.status = WorkflowStatus::Cancelled;
            inst.finished_at = Some(chrono::Utc::now());
        }
        warn!("[Workflow] {} cancelled", workflow_id);
    }

    pub async fn resolve_judgment(&self, judgment_id: &str, approved: bool) -> bool {
        let mut pending = self.pending_judgments.write().await;
        if let Some(tx) = pending.remove(judgment_id) {
            let _ = tx.send(approved);
            true
        } else {
            false
        }
    }

    pub async fn get_instance(&self, workflow_id: &str) -> Option<WorkflowInstance> {
        self.instances.read().await.get(workflow_id).cloned()
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

            loop {
                let step = match step_map.get(&current_step_id) {
                    Some(s) => s.clone(),
                    None => {
                        let mut inst = instances.write().await;
                        if let Some(i) = inst.get_mut(&workflow_id) {
                            i.status = WorkflowStatus::Failed;
                            i.error = Some(format!("Unknown step: {current_step_id}"));
                            i.finished_at = Some(chrono::Utc::now());
                        }
                        break;
                    }
                };

                // JudgmentPoint handling
                if step.judgment_required {
                    let judgment_id = Uuid::new_v4().to_string();
                    let (tx, rx) = oneshot::channel::<bool>();
                    pending_judgments.write().await.insert(judgment_id.clone(), tx);

                    if let Some(ref bus) = event_bus {
                        bus.publish(DomainEvent::new("step.judgment_required", serde_json::json!({
                            "workflow_id": workflow_id, "step_id": current_step_id, "judgment_id": judgment_id
                        }), None)).await;
                    }

                    {
                        let mut inst = instances.write().await;
                        if let Some(i) = inst.get_mut(&workflow_id) { i.status = WorkflowStatus::Paused; }
                    }

                    let jt = step.judgment_timeout_ms.or(step.timeout_ms).unwrap_or(default_timeout);
                    let approved = match tokio::time::timeout(Duration::from_millis(jt), rx).await {
                        Ok(Ok(v)) => v,
                        _ => {
                            pending_judgments.write().await.remove(&judgment_id);
                            match step.judgment_fallback {
                                JudgmentFallback::Skip => true,
                                JudgmentFallback::FailWorkflow => {
                                    let mut inst = instances.write().await;
                                    if let Some(i) = inst.get_mut(&workflow_id) {
                                        i.status = WorkflowStatus::Failed;
                                        i.error = Some("Judgment timeout".into());
                                        i.finished_at = Some(chrono::Utc::now());
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

                    {
                        let mut inst = instances.write().await;
                        if let Some(i) = inst.get_mut(&workflow_id) {
                            if i.status == WorkflowStatus::Paused { i.status = WorkflowStatus::Running; }
                        }
                    }

                    if !approved { break; }
                }

                // Check cancelled
                {
                    let inst = instances.read().await;
                    if let Some(i) = inst.get(&workflow_id) {
                        if i.status == WorkflowStatus::Cancelled { break; }
                    }
                }

                let context = {
                    let mut inst = instances.write().await;
                    if let Some(i) = inst.get_mut(&workflow_id) {
                        i.current_step_id = Some(current_step_id.clone());
                        i.context.current_step_id = Some(current_step_id.clone());
                        i.context.clone()
                    } else { break; }
                };

                if let Some(ref bus) = event_bus {
                    bus.publish(DomainEvent::new(crate::event_bus::events::STEP_STARTED, serde_json::json!({
                        "workflow_id": workflow_id, "step_id": current_step_id
                    }), None)).await;
                }

                let timeout_ms = step.timeout_ms.unwrap_or(default_timeout);
                let executor = executors.read().await.get(&current_step_id).cloned();

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
                        Some(next) => current_step_id = next,
                        None => {
                            let mut inst = instances.write().await;
                            if let Some(i) = inst.get_mut(&workflow_id) {
                                i.status = WorkflowStatus::Completed;
                                i.finished_at = Some(chrono::Utc::now());
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
                    let mut inst = instances.write().await;
                    if let Some(i) = inst.get_mut(&workflow_id) {
                        i.status = WorkflowStatus::Failed;
                        i.error = result.error.clone();
                        i.finished_at = Some(chrono::Utc::now());
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

            kill_handles.write().await.remove(&workflow_id);
        }
    }

    async fn emit(&self, event_type: &str, payload: serde_json::Value) {
        if let Some(ref bus) = self.event_bus {
            bus.publish(DomainEvent::new(event_type, payload, Some(self.instance_id.clone()))).await;
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

        let jids: Vec<String> = engine.pending_judgments.read().await.keys().cloned().collect();
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
}
