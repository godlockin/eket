use axum::{
    extract::{Request, State},
    http::StatusCode,
    middleware::Next,
    response::{Json, Response},
};
use serde_json::json;
use std::sync::Arc;

#[derive(Clone)]
pub struct AuthConfig {
    pub token: Option<String>, // None = auth disabled
}

/// Whitelist paths that never require auth.
const WHITELIST: &[&str] = &["/health", "/ready", "/live", "/sse/events"];

pub async fn auth_middleware(
    State(auth): State<Arc<AuthConfig>>,
    request: Request,
    next: Next,
) -> Result<Response, (StatusCode, Json<serde_json::Value>)> {
    // No token configured → auth disabled, pass through
    let Some(expected) = &auth.token else {
        return Ok(next.run(request).await);
    };

    // Whitelist paths skip auth
    let path = request.uri().path();
    if WHITELIST.contains(&path) {
        return Ok(next.run(request).await);
    }

    // Require Authorization: Bearer <token>
    let provided = request
        .headers()
        .get("Authorization")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "));

    match provided {
        Some(t) if t == expected => Ok(next.run(request).await),
        _ => Err((
            StatusCode::UNAUTHORIZED,
            Json(json!({"error": "invalid_token"})),
        )),
    }
}
