//! TASK-184: Unified auth — supports both JWT (HS256) and static Bearer token.
//! - JWT: verified via EKET_JWT_SECRET (HS256, exp checked)
//! - Static token: compared constant-time via EKET_AUTH_TOKEN (backward compat)
use axum::{
    extract::{Request, State},
    http::StatusCode,
    middleware::Next,
    response::{Json, Response},
};
use constant_time_eq::constant_time_eq;
use jsonwebtoken::{decode, Algorithm, DecodingKey, Validation};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::sync::Arc;

#[derive(Debug, Serialize, Deserialize)]
struct Claims {
    sub: String,
    exp: usize,
}

#[derive(Clone)]
pub struct AuthConfig {
    /// Static Bearer token (EKET_AUTH_TOKEN). None = static auth disabled.
    pub token: Option<String>,
    /// JWT secret (EKET_JWT_SECRET). None = JWT auth disabled.
    pub jwt_secret: Option<String>,
}

impl AuthConfig {
    pub fn from_env() -> Self {
        Self {
            token: std::env::var("EKET_AUTH_TOKEN").ok(),
            jwt_secret: std::env::var("EKET_JWT_SECRET").ok(),
        }
    }
}

/// Whitelist paths that never require auth.
const WHITELIST: &[&str] = &["/health", "/ready", "/live", "/sse/events"];

pub async fn auth_middleware(
    State(auth): State<Arc<AuthConfig>>,
    request: Request,
    next: Next,
) -> Result<Response, (StatusCode, Json<serde_json::Value>)> {
    // Both auth methods disabled → pass through
    if auth.token.is_none() && auth.jwt_secret.is_none() {
        return Ok(next.run(request).await);
    }

    // Whitelist paths skip auth
    let path = request.uri().path();
    if WHITELIST.contains(&path) {
        return Ok(next.run(request).await);
    }

    // Extract Bearer token from Authorization header
    let provided = request
        .headers()
        .get("Authorization")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "));

    let Some(token) = provided else {
        return Err((
            StatusCode::UNAUTHORIZED,
            Json(json!({"error": "missing_token"})),
        ));
    };

    // Try JWT first (if configured)
    if let Some(secret) = &auth.jwt_secret {
        let key = DecodingKey::from_secret(secret.as_bytes());
        let mut validation = Validation::new(Algorithm::HS256);
        validation.validate_exp = true;
        if decode::<Claims>(token, &key, &validation).is_ok() {
            return Ok(next.run(request).await);
        }
    }

    // Fallback: static token comparison (TASK-190: constant-time)
    if let Some(expected) = &auth.token {
        if constant_time_eq(token.as_bytes(), expected.as_bytes()) {
            return Ok(next.run(request).await);
        }
    }

    Err((
        StatusCode::UNAUTHORIZED,
        Json(json!({"error": "invalid_token"})),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use jsonwebtoken::{encode, EncodingKey, Header};

    fn make_jwt(secret: &str, exp_offset_secs: i64) -> String {
        let exp = (chrono::Utc::now().timestamp() + exp_offset_secs) as usize;
        let claims = Claims {
            sub: "test".into(),
            exp,
        };
        encode(
            &Header::default(),
            &claims,
            &EncodingKey::from_secret(secret.as_bytes()),
        )
        .unwrap()
    }

    #[test]
    fn valid_jwt_accepted() {
        let secret = "test-secret-key-123";
        let token = make_jwt(secret, 300);
        let key = DecodingKey::from_secret(secret.as_bytes());
        let mut v = Validation::new(Algorithm::HS256);
        v.validate_exp = true;
        assert!(decode::<Claims>(&token, &key, &v).is_ok());
    }

    #[test]
    fn expired_jwt_rejected() {
        let secret = "test-secret-key-123";
        let token = make_jwt(secret, -70); // expired 70s ago (> 60s default leeway) // expired 10s ago
        let key = DecodingKey::from_secret(secret.as_bytes());
        let mut v = Validation::new(Algorithm::HS256);
        v.validate_exp = true;
        assert!(decode::<Claims>(&token, &key, &v).is_err());
    }

    #[test]
    fn wrong_secret_rejected() {
        let token = make_jwt("correct-secret", 300);
        let key = DecodingKey::from_secret(b"wrong-secret");
        let mut v = Validation::new(Algorithm::HS256);
        v.validate_exp = true;
        assert!(decode::<Claims>(&token, &key, &v).is_err());
    }
}
