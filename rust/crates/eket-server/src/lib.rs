// eket-server: axum 内部 HTTP API（/api/v1/*）
// Phase 3 实现，供 Node.js Dashboard 代理

pub mod auth;
pub mod hooks;
pub mod ws;

use std::convert::Infallible;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use anyhow::Result;
use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::sse::{Event, KeepAlive, Sse};
use axum::response::Json;
use axum::routing::{delete, get, patch, post};
use axum::Router;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tokio::sync::broadcast;
use tokio_stream::wrappers::BroadcastStream;
use tokio_stream::StreamExt;
use tower_http::cors::CorsLayer;
use tracing::info;

use eket_core::dag::parse_tickets_dag;
use eket_core::db::{create_pool, SqliteClient};
use eket_engine::ticket_engine::WorkflowEvent;

// ─── SSE EventType ────────────────────────────────────────────────────────────

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EventType {
    TaskStarted,
    TaskCompleted,
    TaskFailed,
    TaskBlocked,
    AgentRegistered,
    AgentHeartbeat,
    AgentOffline,
    MasterElected,
    MasterFailover,
    QueueOverflow,
    QueueDrained,
    ReviewRequested,
    ReviewApproved,
    ReviewRejected,
}

impl EventType {
    pub fn as_str(&self) -> &'static str {
        match self {
            EventType::TaskStarted => "task_started",
            EventType::TaskCompleted => "task_completed",
            EventType::TaskFailed => "task_failed",
            EventType::TaskBlocked => "task_blocked",
            EventType::AgentRegistered => "agent_registered",
            EventType::AgentHeartbeat => "agent_heartbeat",
            EventType::AgentOffline => "agent_offline",
            EventType::MasterElected => "master_elected",
            EventType::MasterFailover => "master_failover",
            EventType::QueueOverflow => "queue_overflow",
            EventType::QueueDrained => "queue_drained",
            EventType::ReviewRequested => "review_requested",
            EventType::ReviewApproved => "review_approved",
            EventType::ReviewRejected => "review_rejected",
        }
    }
}

// ─── SseMessage ───────────────────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct SseMessage {
    pub event_type: EventType,
    pub data: String,
}

// ─── EventBus ────────────────────────────────────────────────────────────────

pub struct EventBus {
    tx: broadcast::Sender<SseMessage>,
}

impl EventBus {
    pub fn new(capacity: usize) -> Arc<Self> {
        let (tx, _) = broadcast::channel(capacity);
        Arc::new(Self { tx })
    }

    pub fn publish(&self, msg: SseMessage) {
        let _ = self.tx.send(msg);
    }

    pub fn subscribe(&self) -> broadcast::Receiver<SseMessage> {
        self.tx.subscribe()
    }
}

// ─── AppState ─────────────────────────────────────────────────────────────────

#[derive(Clone)]
pub struct AppState {
    pub db: Arc<SqliteClient>,
    pub tickets_dir: PathBuf,
    pub start_time: std::time::Instant,
    pub event_bus: Arc<EventBus>,
    pub hook_registry: Arc<hooks::HookRegistry>,
    /// Broadcast sender for WorkflowEvent — WS subscribers call .subscribe()
    pub event_tx: broadcast::Sender<WorkflowEvent>,
}

// ─── SSE query params ─────────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct SseQuery {
    pub filter: Option<String>,
}

// ─── Error helpers ────────────────────────────────────────────────────────────

type ApiResult<T> = Result<Json<T>, (StatusCode, Json<Value>)>;

fn not_found(msg: &str) -> (StatusCode, Json<Value>) {
    (StatusCode::NOT_FOUND, Json(json!({ "error": msg })))
}

fn internal_error(e: impl std::fmt::Display) -> (StatusCode, Json<Value>) {
    (
        StatusCode::INTERNAL_SERVER_ERROR,
        Json(json!({ "error": e.to_string() })),
    )
}

// ─── Query params ────────────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct TasksQuery {
    pub status: Option<String>,
    pub assignee: Option<String>,
    pub priority: Option<String>,
}

#[derive(Deserialize)]
pub struct AgentsQuery {
    pub role: Option<String>,
}

#[derive(Deserialize)]
pub struct UpdateStatusBody {
    pub status: String,
}

// ─── Serializable wrappers ───────────────────────────────────────────────────

#[derive(Serialize)]
pub struct TaskItem {
    pub id: String,
    pub title: String,
    pub status: String,
    pub priority: String,
    pub assignee: Option<String>,
    pub ticket_type: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Serialize)]
pub struct AgentItem {
    pub id: String,
    pub role: String,
    pub skills: Vec<String>,
    pub status: String,
    pub last_seen: Option<String>,
}

// ─── Handlers ────────────────────────────────────────────────────────────────

async fn health(State(state): State<AppState>) -> Json<Value> {
    let uptime = state.start_time.elapsed().as_secs();
    Json(json!({ "status": "ok", "uptime_secs": uptime }))
}

async fn list_tasks(
    State(state): State<AppState>,
    Query(q): Query<TasksQuery>,
) -> ApiResult<Value> {
    let rows = state
        .db
        .list_tickets(q.status.as_deref(), q.assignee.as_deref(), q.priority.as_deref())
        .map_err(internal_error)?;

    let tasks: Vec<TaskItem> = if rows.is_empty() {
        let dag = parse_tickets_dag(&state.tickets_dir);
        dag.nodes
            .into_iter()
            .map(|n| TaskItem {
                id: n.id,
                title: n.label,
                status: n.status,
                priority: String::new(),
                assignee: n.assignee,
                ticket_type: None,
                created_at: 0,
                updated_at: 0,
            })
            .collect()
    } else {
        rows.into_iter()
            .map(|r| TaskItem {
                id: r.id,
                title: r.title,
                status: r.status,
                priority: r.priority,
                assignee: r.assignee,
                ticket_type: r.ticket_type,
                created_at: r.created_at,
                updated_at: r.updated_at,
            })
            .collect()
    };

    let total = tasks.len();
    Ok(Json(json!({ "tasks": tasks, "total": total })))
}

async fn get_task(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<Value> {
    let row = state.db.get_ticket_row(&id).map_err(internal_error)?;
    match row {
        Some(r) => {
            let item = TaskItem {
                id: r.id,
                title: r.title,
                status: r.status,
                priority: r.priority,
                assignee: r.assignee,
                ticket_type: r.ticket_type,
                created_at: r.created_at,
                updated_at: r.updated_at,
            };
            Ok(Json(serde_json::to_value(item).map_err(internal_error)?))
        }
        None => Err(not_found("not found")),
    }
}

async fn update_task_status(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<UpdateStatusBody>,
) -> ApiResult<Value> {
    let updated = state
        .db
        .update_ticket_status_str(&id, &body.status)
        .map_err(internal_error)?;
    if updated {
        Ok(Json(json!({ "ok": true })))
    } else {
        Err(not_found("not found"))
    }
}

async fn list_agents(
    State(state): State<AppState>,
    Query(q): Query<AgentsQuery>,
) -> ApiResult<Value> {
    let rows = state
        .db
        .list_instances(q.role.as_deref())
        .map_err(internal_error)?;
    let agents: Vec<AgentItem> = rows
        .into_iter()
        .map(|r| AgentItem {
            id: r.id,
            role: r.role,
            skills: r.skills,
            status: r.status,
            last_seen: r.last_seen,
        })
        .collect();
    let total = agents.len();
    Ok(Json(json!({ "agents": agents, "total": total })))
}

async fn get_agent(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<Value> {
    let row = state.db.get_instance(&id).map_err(internal_error)?;
    match row {
        Some(r) => {
            let item = AgentItem {
                id: r.id,
                role: r.role,
                skills: r.skills,
                status: r.status,
                last_seen: r.last_seen,
            };
            Ok(Json(serde_json::to_value(item).map_err(internal_error)?))
        }
        None => Err(not_found("not found")),
    }
}

async fn get_dag(State(state): State<AppState>) -> Json<Value> {
    let dag = parse_tickets_dag(&state.tickets_dir);
    Json(json!({ "nodes": dag.nodes, "edges": dag.edges }))
}

// ─── Write handlers ──────────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct RegisterAgentBody {
    pub agent_id: String,
    pub role: String,
    #[serde(rename = "type")]
    pub agent_type: Option<String>,
    pub skills: Option<Vec<String>>,
}

async fn register_agent_handler(
    State(state): State<AppState>,
    Json(body): Json<RegisterAgentBody>,
) -> ApiResult<Value> {
    let skills = body.skills.unwrap_or_default();
    state
        .db
        .upsert_instance(&body.agent_id, &body.role, &skills, "idle")
        .map_err(internal_error)?;
    Ok(Json(json!({ "ok": true, "agent_id": body.agent_id })))
}

async fn delete_agent_handler(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<Value> {
    let updated = state
        .db
        .update_instance_status(&id, "offline")
        .map_err(internal_error)?;
    if updated {
        Ok(Json(json!({ "ok": true })))
    } else {
        Err(not_found("agent not found"))
    }
}

async fn agent_heartbeat_handler(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<Value> {
    let updated = state
        .db
        .update_instance_last_seen(&id)
        .map_err(internal_error)?;
    if !updated {
        return Err(not_found("agent not found"));
    }
    let row = state.db.get_instance(&id).map_err(internal_error)?;
    let last_seen = row.and_then(|r| r.last_seen).unwrap_or_default();
    Ok(Json(json!({ "ok": true, "last_seen": last_seen })))
}

#[derive(Deserialize)]
pub struct ClaimTaskBody {
    pub agent_id: String,
}

async fn claim_task_handler(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<ClaimTaskBody>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let conn_result = (|| -> Result<(bool, String), anyhow::Error> {
        let conn = state.db.pool().get()?;
        let now = chrono::Utc::now().to_rfc3339();
        let rows = conn.execute(
            "UPDATE tickets SET status='in_progress', assignee=?1, updated_at=?2
             WHERE id=?3 AND status='ready'",
            rusqlite::params![body.agent_id, now, id],
        )?;
        Ok((rows > 0, now))
    })();

    match conn_result {
        Err(e) => Err(internal_error(e)),
        Ok((false, _)) => Err((
            StatusCode::CONFLICT,
            Json(json!({ "error": "already_claimed" })),
        )),
        Ok((true, claimed_at)) => Ok(Json(json!({
            "ok": true,
            "ticket_id": id,
            "assignee": body.agent_id,
            "claimed_at": claimed_at,
        }))),
    }
}

// ─── SSE handler ─────────────────────────────────────────────────────────────

async fn sse_handler(
    State(state): State<AppState>,
    Query(q): Query<SseQuery>,
) -> Sse<impl tokio_stream::Stream<Item = Result<Event, Infallible>>> {
    let rx = state.event_bus.subscribe();
    let filter_prefix = q.filter;

    let stream = BroadcastStream::new(rx).filter_map(move |msg| {
        match msg {
            Ok(m) => {
                let event_name = m.event_type.as_str();
                if let Some(ref prefix) = filter_prefix {
                    let pat = prefix.trim_end_matches('*');
                    if !event_name.starts_with(pat) {
                        return None;
                    }
                }
                Some(Ok(Event::default().event(event_name).data(m.data)))
            }
            // TASK-188: Send lagged notification instead of silently dropping
            Err(tokio_stream::wrappers::errors::BroadcastStreamRecvError::Lagged(n)) => {
                tracing::warn!("[SSE] subscriber lagged, missed {n} events");
                let data = format!(r#"{{"missed":{n}}}"#);
                Some(Ok(Event::default().event("lagged").data(data)))
            }
        }
    });

    Sse::new(stream).keep_alive(
        KeepAlive::new()
            .interval(Duration::from_secs(30))
            .text("ping"),
    )
}

// ─── Router builder ──────────────────────────────────────────────────────────

async fn live_handler() -> StatusCode {
    StatusCode::OK
}

async fn ready_handler(State(state): State<AppState>) -> impl axum::response::IntoResponse {
    let db_ok = state.db.ping().is_ok();
    let status = if db_ok { StatusCode::OK } else { StatusCode::SERVICE_UNAVAILABLE };
    (status, Json(json!({ "ready": db_ok, "checks": { "sqlite": db_ok } })))
}

pub fn build_router(state: AppState, auth_config: Arc<auth::AuthConfig>) -> Router {
    Router::new()
        .route("/live", get(live_handler))
        .route("/ready", get(ready_handler))
        .route("/health", get(health))
        .route("/sse/events", get(sse_handler))
        .route("/ws", get(ws::ws_handler))
        .route("/api/v1/tasks", get(list_tasks))
        .route("/api/v1/tasks/:id", get(get_task))
        .route("/api/v1/tasks/:id/status", patch(update_task_status))
        .route("/api/v1/agents", get(list_agents))
        .route("/api/v1/agents/register", post(register_agent_handler))
        .route("/api/v1/agents/:id", get(get_agent))
        .route("/api/v1/agents/:id", delete(delete_agent_handler))
        .route("/api/v1/agents/:id/heartbeat", post(agent_heartbeat_handler))
        .route("/api/v1/tasks/:id/claim", post(claim_task_handler))
        .route("/api/v1/dag", get(get_dag))
        .route("/hooks/pre-tool-use", post(hooks::pre_tool_use))
        .route("/hooks/post-tool-use", post(hooks::post_tool_use))
        .route("/hooks/teammate-idle", post(hooks::teammate_idle))
        .route("/hooks/task-completed", post(hooks::task_completed))
        .route("/hooks/permission-request", post(hooks::permission_request))
        .layer(axum::middleware::from_fn_with_state(
            auth_config,
            auth::auth_middleware,
        ))
        .layer(CorsLayer::permissive())
        .with_state(state)
}

// ─── Public start fn ─────────────────────────────────────────────────────────

pub async fn start(port: u16, db_path: PathBuf, tickets_dir: PathBuf) -> Result<()> {
    let db_path_str = db_path.to_string_lossy();
    let pool = create_pool(&db_path_str)?;
    let db = Arc::new(SqliteClient::new(pool));
    let event_bus = EventBus::new(4096); // TASK-188: capacity 4096 to reduce lag
    let (event_tx, _) = broadcast::channel::<WorkflowEvent>(4096);
    let state = AppState {
        db,
        tickets_dir,
        start_time: std::time::Instant::now(),
        event_bus,
        hook_registry: hooks::HookRegistry::new(),
        event_tx,
    };
    let auth_token = std::env::var("EKET_AUTH_TOKEN").ok();
    if auth_token.is_some() {
        info!("auth enabled via EKET_AUTH_TOKEN");
    }
    let auth_config = Arc::new(auth::AuthConfig {
        token: auth_token,
        jwt_secret: std::env::var("EKET_JWT_SECRET").ok(),
    });
    let app = build_router(state, auth_config);
    let addr = format!("0.0.0.0:{port}");
    info!("eket-server listening on {addr}");
    let listener = tokio::net::TcpListener::bind(&addr).await?;
    axum::serve(listener, app).await?;
    Ok(())
}

// ─── Tests ───────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use axum::body::Body;
    use axum::http::{Method, Request};
    use http_body_util::BodyExt;
    use tempfile::TempDir;
    use axum::response::Response;
    use tower::util::ServiceExt;

    fn make_state(tmp: &TempDir) -> AppState {
        let db_path = tmp.path().join("test.db");
        let pool = create_pool(db_path.to_str().unwrap()).expect("db");
        let db = Arc::new(SqliteClient::new(pool));
        let (event_tx, _) = broadcast::channel(16);
        AppState {
            db,
            tickets_dir: tmp.path().to_path_buf(),
            start_time: std::time::Instant::now(),
            event_bus: EventBus::new(256),
            hook_registry: hooks::HookRegistry::new(),
            event_tx,
        }
    }

    fn no_auth() -> Arc<auth::AuthConfig> {
        Arc::new(auth::AuthConfig { token: None, jwt_secret: None })
    }

    async fn body_json(body: Body) -> Value {
        let bytes = body.collect().await.unwrap().to_bytes();
        serde_json::from_slice(&bytes).unwrap()
    }

    #[tokio::test]
    async fn health_returns_ok() {
        let tmp = TempDir::new().unwrap();
        let app = build_router(make_state(&tmp), no_auth());
        let req = Request::builder().uri("/health").body(Body::empty()).unwrap();
        let resp: Response = app.oneshot(req).await.unwrap();
        assert_eq!(resp.status(), StatusCode::OK);
        let v = body_json(resp.into_body()).await;
        assert_eq!(v["status"], "ok");
    }

    #[tokio::test]
    async fn list_tasks_empty() {
        let tmp = TempDir::new().unwrap();
        let app = build_router(make_state(&tmp), no_auth());
        let req = Request::builder()
            .uri("/api/v1/tasks")
            .body(Body::empty())
            .unwrap();
        let resp: Response = app.oneshot(req).await.unwrap();
        assert_eq!(resp.status(), StatusCode::OK);
        let v = body_json(resp.into_body()).await;
        assert_eq!(v["total"], 0);
        assert!(v["tasks"].as_array().unwrap().is_empty());
    }

    #[tokio::test]
    async fn get_task_not_found() {
        let tmp = TempDir::new().unwrap();
        let app = build_router(make_state(&tmp), no_auth());
        let req = Request::builder()
            .uri("/api/v1/tasks/TASK-999")
            .body(Body::empty())
            .unwrap();
        let resp: Response = app.oneshot(req).await.unwrap();
        assert_eq!(resp.status(), StatusCode::NOT_FOUND);
    }

    #[tokio::test]
    async fn update_task_status_ok() {
        let tmp = TempDir::new().unwrap();
        let state = make_state(&tmp);
        state
            .db
            .create_ticket("TASK-1", "Test task", "P1", "task")
            .unwrap();
        let app = build_router(state, no_auth());
        let req = Request::builder()
            .method(Method::PATCH)
            .uri("/api/v1/tasks/TASK-1/status")
            .header("content-type", "application/json")
            .body(Body::from(r#"{"status":"done"}"#))
            .unwrap();
        let resp: Response = app.oneshot(req).await.unwrap();
        assert_eq!(resp.status(), StatusCode::OK);
        let v = body_json(resp.into_body()).await;
        assert_eq!(v["ok"], true);
    }

    #[tokio::test]
    async fn list_agents_empty() {
        let tmp = TempDir::new().unwrap();
        let app = build_router(make_state(&tmp), no_auth());
        let req = Request::builder()
            .uri("/api/v1/agents")
            .body(Body::empty())
            .unwrap();
        let resp: Response = app.oneshot(req).await.unwrap();
        assert_eq!(resp.status(), StatusCode::OK);
        let v = body_json(resp.into_body()).await;
        assert_eq!(v["total"], 0);
        assert!(v["agents"].as_array().unwrap().is_empty());
    }

    #[tokio::test]
    async fn get_agent_not_found() {
        let tmp = TempDir::new().unwrap();
        let app = build_router(make_state(&tmp), no_auth());
        let req = Request::builder()
            .uri("/api/v1/agents/nobody")
            .body(Body::empty())
            .unwrap();
        let resp: Response = app.oneshot(req).await.unwrap();
        assert_eq!(resp.status(), StatusCode::NOT_FOUND);
    }

    // ─── WebSocket tests ─────────────────────────────────────────────────────

    #[tokio::test]
    async fn ws_handshake() {
        use std::time::Duration;
        use tokio::net::TcpListener;

        let tmp = TempDir::new().unwrap();
        let app = build_router(make_state(&tmp), no_auth());

        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();

        tokio::spawn(async move {
            axum::serve(listener, app).await.unwrap();
        });

        tokio::time::sleep(Duration::from_millis(50)).await;

        let url = format!("ws://127.0.0.1:{}/ws", addr.port());
        // connect_async performs the full WS handshake (101 Switching Protocols)
        let result = tokio_tungstenite::connect_async(&url).await;
        assert!(result.is_ok(), "WS handshake failed: {result:?}");
    }

    #[tokio::test]
    async fn ws_event_on_transition() {
        use std::time::Duration;
        use tokio::net::TcpListener;
        use tokio_tungstenite::tungstenite::Message as TungMessage;

        let tmp = TempDir::new().unwrap();
        let state = make_state(&tmp);
        let tx = state.event_tx.clone();
        let app = build_router(state, no_auth());

        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();

        tokio::spawn(async move {
            axum::serve(listener, app).await.unwrap();
        });

        tokio::time::sleep(Duration::from_millis(50)).await;

        let url = format!("ws://127.0.0.1:{}/ws", addr.port());
        let (mut ws_stream, _) =
            tokio_tungstenite::connect_async(&url).await.expect("ws connect");

        let event = WorkflowEvent {
            ticket_id: "TASK-234".to_string(),
            from: eket_engine::workflow::WorkflowState::Backlog,
            to: eket_engine::workflow::WorkflowState::Analysis,
            timestamp: "2026-04-26T00:00:00Z".to_string(),
        };
        tx.send(event).unwrap();

        let msg = tokio::time::timeout(
            Duration::from_secs(1),
            futures_util::StreamExt::next(&mut ws_stream),
        )
        .await
        .expect("timeout waiting for ws message")
        .unwrap()
        .unwrap();

        let text = match msg {
            TungMessage::Text(t) => t.to_string(),
            other => panic!("expected text message, got: {other:?}"),
        };
        let v: serde_json::Value = serde_json::from_str(&text).unwrap();
        assert_eq!(v["ticket_id"], "TASK-234");
    }
}
