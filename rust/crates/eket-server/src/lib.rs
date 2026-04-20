// eket-server: axum 内部 HTTP API（/api/v1/*）
// Phase 3 实现，供 Node.js Dashboard 代理

use std::path::PathBuf;
use std::sync::Arc;

use anyhow::Result;
use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::Json;
use axum::routing::{get, patch};
use axum::Router;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tower_http::cors::CorsLayer;
use tracing::info;

use eket_core::dag::parse_tickets_dag;
use eket_core::db::{create_pool, SqliteClient};

// ─── AppState ─────────────────────────────────────────────────────────────────

#[derive(Clone)]
pub struct AppState {
    pub db: Arc<SqliteClient>,
    pub tickets_dir: PathBuf,
    pub start_time: std::time::Instant,
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
    pub last_seen: Option<i64>,
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
            Ok(Json(serde_json::to_value(item).unwrap()))
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
            Ok(Json(serde_json::to_value(item).unwrap()))
        }
        None => Err(not_found("not found")),
    }
}

async fn get_dag(State(state): State<AppState>) -> Json<Value> {
    let dag = parse_tickets_dag(&state.tickets_dir);
    Json(json!({ "nodes": dag.nodes, "edges": dag.edges }))
}

// ─── Router builder ──────────────────────────────────────────────────────────

pub fn build_router(state: AppState) -> Router {
    Router::new()
        .route("/health", get(health))
        .route("/api/v1/tasks", get(list_tasks))
        .route("/api/v1/tasks/:id", get(get_task))
        .route("/api/v1/tasks/:id/status", patch(update_task_status))
        .route("/api/v1/agents", get(list_agents))
        .route("/api/v1/agents/:id", get(get_agent))
        .route("/api/v1/dag", get(get_dag))
        .layer(CorsLayer::permissive())
        .with_state(state)
}

// ─── Public start fn ─────────────────────────────────────────────────────────

pub async fn start(port: u16, db_path: PathBuf, tickets_dir: PathBuf) -> Result<()> {
    let db_path_str = db_path.to_string_lossy();
    let pool = create_pool(&db_path_str)?;
    let db = Arc::new(SqliteClient::new(pool));
    let state = AppState {
        db,
        tickets_dir,
        start_time: std::time::Instant::now(),
    };
    let app = build_router(state);
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
        AppState {
            db,
            tickets_dir: tmp.path().to_path_buf(),
            start_time: std::time::Instant::now(),
        }
    }

    async fn body_json(body: Body) -> Value {
        let bytes = body.collect().await.unwrap().to_bytes();
        serde_json::from_slice(&bytes).unwrap()
    }

    #[tokio::test]
    async fn health_returns_ok() {
        let tmp = TempDir::new().unwrap();
        let app = build_router(make_state(&tmp));
        let req = Request::builder().uri("/health").body(Body::empty()).unwrap();
        let resp: Response = app.oneshot(req).await.unwrap();
        assert_eq!(resp.status(), StatusCode::OK);
        let v = body_json(resp.into_body()).await;
        assert_eq!(v["status"], "ok");
    }

    #[tokio::test]
    async fn list_tasks_empty() {
        let tmp = TempDir::new().unwrap();
        let app = build_router(make_state(&tmp));
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
        let app = build_router(make_state(&tmp));
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
        let app = build_router(state);
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
        let app = build_router(make_state(&tmp));
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
        let app = build_router(make_state(&tmp));
        let req = Request::builder()
            .uri("/api/v1/agents/nobody")
            .body(Body::empty())
            .unwrap();
        let resp: Response = app.oneshot(req).await.unwrap();
        assert_eq!(resp.status(), StatusCode::NOT_FOUND);
    }
}
