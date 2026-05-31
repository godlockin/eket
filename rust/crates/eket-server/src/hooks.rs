// hooks.rs – Hook HTTP Server for EKET
// Provides 5 POST endpoints for Claude Code hook integration.

use std::sync::Arc;
use std::time::Duration;

use axum::extract::State;
use axum::http::StatusCode;
use axum::response::Json;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tokio::time::timeout;

use crate::AppState;

// ─── Request / Response types ────────────────────────────────────────────────

#[derive(Debug, Clone, Deserialize)]
pub struct HookRequest {
    pub hook_type: String,
    pub agent_id: Option<String>,
    pub ticket_id: Option<String>,
    pub tool_name: Option<String>,
    pub tool_input: Option<Value>,
    pub timestamp: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct HookResponse {
    pub allow: bool,
    pub reason: Option<String>,
}

impl HookResponse {
    pub fn allow() -> Self {
        Self {
            allow: true,
            reason: None,
        }
    }

    pub fn deny(reason: impl Into<String>) -> Self {
        Self {
            allow: false,
            reason: Some(reason.into()),
        }
    }
}

// ─── HookHandler trait ───────────────────────────────────────────────────────

#[async_trait::async_trait]
pub trait HookHandler: Send + Sync {
    async fn on_pre_tool_use(&self, req: &HookRequest) -> HookResponse;
    async fn on_post_tool_use(&self, req: &HookRequest) -> HookResponse;
    async fn on_teammate_idle(&self, req: &HookRequest) -> HookResponse;
    async fn on_task_completed(&self, req: &HookRequest) -> HookResponse;
    async fn on_permission_request(&self, req: &HookRequest) -> HookResponse;
}

// ─── Default allow-all handler ───────────────────────────────────────────────

pub struct DefaultHookHandler;

#[async_trait::async_trait]
impl HookHandler for DefaultHookHandler {
    async fn on_pre_tool_use(&self, _req: &HookRequest) -> HookResponse {
        HookResponse::allow()
    }
    async fn on_post_tool_use(&self, _req: &HookRequest) -> HookResponse {
        HookResponse::allow()
    }
    async fn on_teammate_idle(&self, _req: &HookRequest) -> HookResponse {
        HookResponse::allow()
    }
    async fn on_task_completed(&self, _req: &HookRequest) -> HookResponse {
        HookResponse::allow()
    }
    async fn on_permission_request(&self, _req: &HookRequest) -> HookResponse {
        HookResponse::allow()
    }
}

// ─── HookRegistry ────────────────────────────────────────────────────────────

pub struct HookRegistry {
    handler: std::sync::RwLock<Option<Arc<dyn HookHandler + Send + Sync>>>,
}

impl HookRegistry {
    pub fn new() -> Arc<Self> {
        Arc::new(Self {
            handler: std::sync::RwLock::new(None),
        })
    }

    pub fn register(&self, handler: Arc<dyn HookHandler + Send + Sync>) {
        let mut w = self.handler.write().unwrap();
        *w = Some(handler);
    }

    /// Dispatch a hook call; defaults to `allow: true` if no handler registered
    /// or if the handler takes longer than 5 seconds.
    pub async fn dispatch<F, Fut>(&self, f: F) -> HookResponse
    where
        F: FnOnce(Arc<dyn HookHandler + Send + Sync>) -> Fut,
        Fut: std::future::Future<Output = HookResponse>,
    {
        let handler = {
            let r = self.handler.read().unwrap();
            r.clone()
        };

        match handler {
            None => HookResponse::allow(),
            Some(h) => {
                match timeout(Duration::from_secs(5), f(h)).await {
                    Ok(resp) => resp,
                    Err(_) => HookResponse::allow(), // timeout → default allow
                }
            }
        }
    }
}

impl Default for HookRegistry {
    fn default() -> Self {
        Self {
            handler: std::sync::RwLock::new(None),
        }
    }
}

// ─── Helper: parse body or 400 ───────────────────────────────────────────────

#[allow(dead_code)]
fn bad_request(msg: &str) -> (StatusCode, Json<Value>) {
    (StatusCode::BAD_REQUEST, Json(json!({ "error": msg })))
}

// ─── Endpoint handlers ───────────────────────────────────────────────────────

pub async fn pre_tool_use(
    State(state): State<AppState>,
    Json(req): Json<HookRequest>,
) -> Result<Json<HookResponse>, (StatusCode, Json<Value>)> {
    let req2 = req.clone();
    let resp = state
        .hook_registry
        .dispatch(|h| async move { h.on_pre_tool_use(&req2).await })
        .await;
    Ok(Json(resp))
}

pub async fn post_tool_use(
    State(state): State<AppState>,
    Json(req): Json<HookRequest>,
) -> Result<Json<HookResponse>, (StatusCode, Json<Value>)> {
    let req2 = req.clone();
    let resp = state
        .hook_registry
        .dispatch(|h| async move { h.on_post_tool_use(&req2).await })
        .await;
    Ok(Json(resp))
}

pub async fn teammate_idle(
    State(state): State<AppState>,
    Json(req): Json<HookRequest>,
) -> Result<Json<HookResponse>, (StatusCode, Json<Value>)> {
    let req2 = req.clone();
    let resp = state
        .hook_registry
        .dispatch(|h| async move { h.on_teammate_idle(&req2).await })
        .await;
    Ok(Json(resp))
}

pub async fn task_completed(
    State(state): State<AppState>,
    Json(req): Json<HookRequest>,
) -> Result<Json<HookResponse>, (StatusCode, Json<Value>)> {
    let req2 = req.clone();
    let resp = state
        .hook_registry
        .dispatch(|h| async move { h.on_task_completed(&req2).await })
        .await;
    Ok(Json(resp))
}

pub async fn permission_request(
    State(state): State<AppState>,
    Json(req): Json<HookRequest>,
) -> Result<Json<HookResponse>, (StatusCode, Json<Value>)> {
    let req2 = req.clone();
    let resp = state
        .hook_registry
        .dispatch(|h| async move { h.on_permission_request(&req2).await })
        .await;
    Ok(Json(resp))
}

// ─── Tests ───────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{AppState, EventBus};
    use axum::body::Body;
    use axum::http::{Method, Request};
    use axum::routing::post;
    use axum::Router;
    use eket_core::db::{create_pool, SqliteClient};
    use http_body_util::BodyExt;
    use std::path::PathBuf;
    use tempfile::TempDir;
    use tower::util::ServiceExt;

    fn make_state(tmp: &TempDir) -> AppState {
        let db_path = tmp.path().join("test.db");
        let pool = create_pool(db_path.to_str().unwrap()).expect("db");
        let db = Arc::new(SqliteClient::new(pool));
        let (event_tx, _) = tokio::sync::broadcast::channel(16);
        AppState {
            db,
            tickets_dir: PathBuf::new(),
            start_time: std::time::Instant::now(),
            event_bus: EventBus::new(16),
            hook_registry: HookRegistry::new(),
            event_tx,
        }
    }

    async fn body_json(body: Body) -> Value {
        let bytes = body.collect().await.unwrap().to_bytes();
        serde_json::from_slice(&bytes).unwrap()
    }

    fn hook_router(state: AppState) -> Router {
        Router::new()
            .route("/hooks/pre-tool-use", post(pre_tool_use))
            .route("/hooks/post-tool-use", post(post_tool_use))
            .route("/hooks/teammate-idle", post(teammate_idle))
            .route("/hooks/task-completed", post(task_completed))
            .route("/hooks/permission-request", post(permission_request))
            .with_state(state)
    }

    fn sample_body() -> &'static str {
        r#"{"hook_type":"pre-tool-use","agent_id":"slaver_01","ticket_id":"TASK-200","tool_name":"bash","tool_input":{},"timestamp":"2026-04-21T10:00:00Z"}"#
    }

    #[tokio::test]
    async fn pre_tool_use_default_allow() {
        let tmp = TempDir::new().unwrap();
        let app = hook_router(make_state(&tmp));
        let req = Request::builder()
            .method(Method::POST)
            .uri("/hooks/pre-tool-use")
            .header("content-type", "application/json")
            .body(Body::from(sample_body()))
            .unwrap();
        let resp = app.oneshot(req).await.unwrap();
        assert_eq!(resp.status(), StatusCode::OK);
        let v = body_json(resp.into_body()).await;
        assert_eq!(v["allow"], true);
        assert!(v["reason"].is_null());
    }

    #[tokio::test]
    async fn all_five_endpoints_respond() {
        let paths = [
            "/hooks/pre-tool-use",
            "/hooks/post-tool-use",
            "/hooks/teammate-idle",
            "/hooks/task-completed",
            "/hooks/permission-request",
        ];
        for path in paths {
            let tmp = TempDir::new().unwrap();
            let app = hook_router(make_state(&tmp));
            let req = Request::builder()
                .method(Method::POST)
                .uri(path)
                .header("content-type", "application/json")
                .body(Body::from(sample_body()))
                .unwrap();
            let resp = app.oneshot(req).await.unwrap();
            assert_eq!(resp.status(), StatusCode::OK, "path={path}");
        }
    }

    #[tokio::test]
    async fn custom_handler_deny() {
        struct DenyAll;
        #[async_trait::async_trait]
        impl HookHandler for DenyAll {
            async fn on_pre_tool_use(&self, _r: &HookRequest) -> HookResponse {
                HookResponse::deny("blocked")
            }
            async fn on_post_tool_use(&self, _r: &HookRequest) -> HookResponse {
                HookResponse::allow()
            }
            async fn on_teammate_idle(&self, _r: &HookRequest) -> HookResponse {
                HookResponse::allow()
            }
            async fn on_task_completed(&self, _r: &HookRequest) -> HookResponse {
                HookResponse::allow()
            }
            async fn on_permission_request(&self, _r: &HookRequest) -> HookResponse {
                HookResponse::allow()
            }
        }

        let tmp = TempDir::new().unwrap();
        let state = make_state(&tmp);
        state.hook_registry.register(Arc::new(DenyAll));

        let app = hook_router(state);
        let req = Request::builder()
            .method(Method::POST)
            .uri("/hooks/pre-tool-use")
            .header("content-type", "application/json")
            .body(Body::from(sample_body()))
            .unwrap();
        let resp = app.oneshot(req).await.unwrap();
        assert_eq!(resp.status(), StatusCode::OK);
        let v = body_json(resp.into_body()).await;
        assert_eq!(v["allow"], false);
        assert_eq!(v["reason"], "blocked");
    }
}
