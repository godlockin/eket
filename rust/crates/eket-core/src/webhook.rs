/// Webhook system for EKET: outbound HTTP notifications on task/epic events.
///
/// Tables:
///   webhook_urls          — registered endpoints (url+secret encrypted at rest)
///   webhook_event_records — delivery log with retry state
///
/// Retry: exponential back-off 2^attempt minutes, max 12 attempts.
/// Secret absent → store plaintext + warn.  Fail → warn only, never abort caller.
use anyhow::{Context, Result};
use chrono::{DateTime, Utc};
use r2d2_sqlite::SqliteConnectionManager;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tracing::{info, warn};
use uuid::Uuid;

/// Re-use the project-wide DbPool type (Arc<Pool<SqliteConnectionManager>>).
pub use crate::db::DbPool;

// ─── Public types ─────────────────────────────────────────────────────────────

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum WebhookEvent {
    TaskCreated,
    TaskClaimed,
    TaskCompleted,
    TaskDeclined,
    EpicCompleted,
    SlaverRegistered,
    SlaverOffline,
}

impl WebhookEvent {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::TaskCreated => "task.created",
            Self::TaskClaimed => "task.claimed",
            Self::TaskCompleted => "task.completed",
            Self::TaskDeclined => "task.declined",
            Self::EpicCompleted => "epic.completed",
            Self::SlaverRegistered => "slaver.registered",
            Self::SlaverOffline => "slaver.offline",
        }
    }

    pub fn parse_event(s: &str) -> Option<Self> {
        match s {
            "task.created" => Some(Self::TaskCreated),
            "task.claimed" => Some(Self::TaskClaimed),
            "task.completed" => Some(Self::TaskCompleted),
            "task.declined" => Some(Self::TaskDeclined),
            "epic.completed" => Some(Self::EpicCompleted),
            "slaver.registered" => Some(Self::SlaverRegistered),
            "slaver.offline" => Some(Self::SlaverOffline),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WebhookUrl {
    pub id: String,
    pub url: String,
    pub secret: Option<String>,
    pub events: Vec<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WebhookEventRecord {
    pub id: String,
    pub webhook_url_id: String,
    pub event_type: String,
    pub payload: serde_json::Value,
    pub attempt: i64,
    pub http_status: Option<i64>,
    pub next_retry_at: Option<String>,
    pub created_at: String,
    pub completed_at: Option<String>,
    pub failed_at: Option<String>,
}

// ─── DB setup ─────────────────────────────────────────────────────────────────

/// Ensure webhook tables exist (idempotent).
pub fn ensure_webhook_tables(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS webhook_urls (
            id         TEXT PRIMARY KEY,
            url        TEXT NOT NULL,
            secret     TEXT,
            events     TEXT NOT NULL DEFAULT '[]',
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS webhook_event_records (
            id              TEXT PRIMARY KEY,
            webhook_url_id  TEXT NOT NULL REFERENCES webhook_urls(id) ON DELETE CASCADE,
            event_type      TEXT NOT NULL,
            payload         TEXT NOT NULL DEFAULT '{}',
            attempt         INTEGER NOT NULL DEFAULT 0,
            http_status     INTEGER,
            next_retry_at   TEXT,
            created_at      TEXT NOT NULL DEFAULT (datetime('now')),
            completed_at    TEXT,
            failed_at       TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_wer_url ON webhook_event_records(webhook_url_id);
        CREATE INDEX IF NOT EXISTS idx_wer_event ON webhook_event_records(event_type);
        CREATE INDEX IF NOT EXISTS idx_wer_retry ON webhook_event_records(next_retry_at)
            WHERE next_retry_at IS NOT NULL AND completed_at IS NULL AND failed_at IS NULL;
        "#,
    )
    .context("ensure_webhook_tables")
}

// ─── Encryption helpers ───────────────────────────────────────────────────────

/// Derive a 32-byte AES key from an env var (try `EKET_WEBHOOK_KEY` first,
/// then `EKET_ENCRYPTION_KEY`).  Returns `None` when no key is configured.
fn load_key() -> Option<[u8; 32]> {
    let raw = std::env::var("EKET_WEBHOOK_KEY")
        .or_else(|_| std::env::var("EKET_ENCRYPTION_KEY"))
        .unwrap_or_default();
    if raw.len() >= 64 {
        // 64 hex chars → 32 bytes
        let bytes = hex::decode(&raw[..64]).ok()?;
        let mut key = [0u8; 32];
        key.copy_from_slice(&bytes);
        Some(key)
    } else if !raw.is_empty() {
        // Short key: SHA-256 hash → 32 bytes (backward-compat convenience)
        use sha2::{Digest, Sha256};
        let hash = Sha256::digest(raw.as_bytes());
        let mut key = [0u8; 32];
        key.copy_from_slice(&hash);
        Some(key)
    } else {
        None
    }
}

/// Encrypt with AES-256-GCM using a random 12-byte nonce.
/// Storage format: `hex(nonce):hex(ciphertext)`.
/// Falls back to plaintext (with a warning) when no key is available.
fn encrypt(plaintext: &str) -> String {
    encrypt_with_key(plaintext, load_key().as_ref())
}

fn encrypt_with_key(plaintext: &str, key: Option<&[u8; 32]>) -> String {
    use aes_gcm::{
        aead::{Aead, KeyInit},
        Aes256Gcm, Nonce,
    };
    use rand::RngCore;

    let Some(key) = key else {
        warn!("No encryption key configured — storing webhook secret as plaintext");
        return plaintext.to_string();
    };

    let cipher = Aes256Gcm::new(key.into());
    let mut nonce_bytes = [0u8; 12];
    rand::thread_rng().fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);

    match cipher.encrypt(nonce, plaintext.as_bytes()) {
        Ok(ciphertext) => format!("{}:{}", hex::encode(nonce_bytes), hex::encode(ciphertext)),
        Err(e) => {
            warn!("AES-GCM encrypt failed: {e} — storing plaintext");
            plaintext.to_string()
        }
    }
}

/// Decrypt AES-256-GCM ciphertext.  Expects `hex(nonce):hex(ciphertext)`.
/// Migration compat: if the value doesn't match that format, tries XOR
/// fallback (legacy), returning the plaintext on success so the caller can
/// transparently re-encrypt on next write.
fn decrypt(ciphertext: &str) -> String {
    decrypt_with_key(ciphertext, load_key().as_ref())
}

fn decrypt_with_key(ciphertext: &str, key: Option<&[u8; 32]>) -> String {
    use aes_gcm::{
        aead::{Aead, KeyInit},
        Aes256Gcm, Nonce,
    };

    let Some(key) = key else {
        return ciphertext.to_string();
    };

    // Try AES-GCM format: "hex_nonce:hex_ciphertext"
    if let Some((nonce_hex, ct_hex)) = ciphertext.split_once(':') {
        if let (Ok(nonce_bytes), Ok(ct_bytes)) =
            (hex::decode(nonce_hex), hex::decode(ct_hex))
        {
            if nonce_bytes.len() == 12 {
                let cipher = Aes256Gcm::new(key.into());
                let nonce = Nonce::from_slice(&nonce_bytes);
                if let Ok(plain) = cipher.decrypt(nonce, ct_bytes.as_ref()) {
                    if let Ok(s) = String::from_utf8(plain) {
                        return s;
                    }
                }
            }
        }
    }

    // Migration fallback: try legacy XOR decryption
    if let Ok(bytes) = hex::decode(ciphertext) {
        // Use raw key bytes for XOR (legacy used the raw env string)
        let key_str = std::env::var("EKET_WEBHOOK_KEY")
            .or_else(|_| std::env::var("EKET_ENCRYPTION_KEY"))
            .unwrap_or_default();
        if !key_str.is_empty() {
            let key_bytes = key_str.as_bytes();
            let dec: Vec<u8> = bytes
                .iter()
                .enumerate()
                .map(|(i, b)| b ^ key_bytes[i % key_bytes.len()])
                .collect();
            if let Ok(s) = String::from_utf8(dec) {
                return s;
            }
        }
    }

    // Last resort: return as-is (may be stored plaintext)
    ciphertext.to_string()
}

// ─── HMAC-SHA256 signature ────────────────────────────────────────────────────

/// Compute `HMAC-SHA256(secret, body)` as lowercase hex.
pub fn sign_payload(secret: &str, body: &[u8]) -> String {
    use hmac::{Hmac, Mac};
    use sha2::Sha256;
    type HmacSha256 = Hmac<Sha256>;

    let mut mac =
        HmacSha256::new_from_slice(secret.as_bytes()).expect("HMAC accepts any key length");
    mac.update(body);
    hex::encode(mac.finalize().into_bytes())
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

pub struct WebhookStore {
    pool: DbPool,
}

impl WebhookStore {
    pub fn new(pool: DbPool) -> Self {
        Self { pool }
    }

    pub fn pool(&self) -> DbPool {
        self.pool.clone()
    }

    fn conn(&self) -> Result<r2d2::PooledConnection<SqliteConnectionManager>> {
        self.pool.get().context("webhook db pool")
    }

    // ── webhook_urls ──────────────────────────────────────────────────────────

    pub fn add_url(
        &self,
        url: &str,
        events: &[String],
        secret: Option<&str>,
    ) -> Result<WebhookUrl> {
        let conn = self.conn()?;
        ensure_webhook_tables(&conn)?;

        let id = Uuid::new_v4().to_string();
        let encrypted_url = encrypt(url);
        let encrypted_secret = secret.map(encrypt);
        let events_json = serde_json::to_string(events)?;
        let now = Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string();

        conn.execute(
            "INSERT INTO webhook_urls (id, url, secret, events, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![id, encrypted_url, encrypted_secret, events_json, now],
        )?;

        info!("webhook:add url={url} events={events_json}");

        Ok(WebhookUrl {
            id,
            url: url.to_string(),
            secret: secret.map(|s| s.to_string()),
            events: events.to_vec(),
            created_at: now,
        })
    }

    pub fn list_urls(&self) -> Result<Vec<WebhookUrl>> {
        let conn = self.conn()?;
        ensure_webhook_tables(&conn)?;

        let mut stmt = conn.prepare(
            "SELECT id, url, secret, events, created_at FROM webhook_urls ORDER BY created_at",
        )?;
        let rows = stmt.query_map([], |row| {
            let id: String = row.get(0)?;
            let url_enc: String = row.get(1)?;
            let secret_enc: Option<String> = row.get(2)?;
            let events_str: String = row.get(3)?;
            let created_at: String = row.get(4)?;
            Ok((id, url_enc, secret_enc, events_str, created_at))
        })?;

        let mut result = Vec::new();
        for row in rows {
            let (id, url_enc, secret_enc, events_str, created_at) = row?;
            let events: Vec<String> =
                serde_json::from_str(&events_str).unwrap_or_default();
            result.push(WebhookUrl {
                id,
                url: decrypt(&url_enc),
                secret: secret_enc.map(|s| decrypt(&s)),
                events,
                created_at,
            });
        }
        Ok(result)
    }

    pub fn remove_url(&self, id: &str) -> Result<u64> {
        let conn = self.conn()?;
        ensure_webhook_tables(&conn)?;
        let n = conn.execute("DELETE FROM webhook_urls WHERE id = ?1", params![id])?;
        info!("webhook:remove id={id} rows={n}");
        Ok(n as u64)
    }

    // ── webhook_event_records ─────────────────────────────────────────────────

    pub fn list_records(
        &self,
        status_filter: Option<&str>,
    ) -> Result<Vec<WebhookEventRecord>> {
        let conn = self.conn()?;
        ensure_webhook_tables(&conn)?;

        let where_clause = match status_filter {
            Some("failed") => "WHERE failed_at IS NOT NULL",
            Some("completed") => "WHERE completed_at IS NOT NULL",
            Some("pending") => "WHERE completed_at IS NULL AND failed_at IS NULL",
            _ => "",
        };
        let sql = format!(
            "SELECT id, webhook_url_id, event_type, payload, attempt, http_status,
                    next_retry_at, created_at, completed_at, failed_at
             FROM webhook_event_records
             {where_clause}
             ORDER BY created_at DESC
             LIMIT 200"
        );

        let mut stmt = conn.prepare(&sql)?;
        let rows = stmt.query_map([], |row| {
            Ok(WebhookEventRecord {
                id: row.get(0)?,
                webhook_url_id: row.get(1)?,
                event_type: row.get(2)?,
                payload: serde_json::from_str(&row.get::<_, String>(3)?).unwrap_or_default(),
                attempt: row.get(4)?,
                http_status: row.get(5)?,
                next_retry_at: row.get(6)?,
                created_at: row.get(7)?,
                completed_at: row.get(8)?,
                failed_at: row.get(9)?,
            })
        })?;

        let mut result = Vec::new();
        for row in rows {
            result.push(row?);
        }
        Ok(result)
    }

    /// Create a new delivery record (attempt=0, scheduled now).
    fn create_record(
        &self,
        conn: &Connection,
        webhook_url_id: &str,
        event_type: &str,
        payload: &serde_json::Value,
    ) -> Result<String> {
        let id = Uuid::new_v4().to_string();
        let payload_str = serde_json::to_string(payload)?;
        let now = Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string();
        conn.execute(
            "INSERT INTO webhook_event_records
                 (id, webhook_url_id, event_type, payload, attempt, created_at)
             VALUES (?1, ?2, ?3, ?4, 0, ?5)",
            params![id, webhook_url_id, event_type, payload_str, now],
        )?;
        Ok(id)
    }

    fn mark_success(&self, conn: &Connection, id: &str, http_status: u16) -> Result<()> {
        let now = Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string();
        conn.execute(
            "UPDATE webhook_event_records
             SET http_status = ?1, completed_at = ?2, next_retry_at = NULL
             WHERE id = ?3",
            params![http_status as i64, now, id],
        )?;
        Ok(())
    }

    fn mark_retry(
        &self,
        conn: &Connection,
        id: &str,
        http_status: Option<u16>,
        attempt: i64,
    ) -> Result<()> {
        // next_retry_at = now + 2^attempt minutes
        let delay_minutes = i64::pow(2, attempt.min(MAX_ATTEMPTS - 1) as u32);
        let next = Utc::now() + chrono::Duration::minutes(delay_minutes);
        let next_str = next.format("%Y-%m-%dT%H:%M:%SZ").to_string();
        let new_attempt = attempt + 1;
        conn.execute(
            "UPDATE webhook_event_records
             SET attempt = ?1, http_status = ?2, next_retry_at = ?3
             WHERE id = ?4",
            params![new_attempt, http_status.map(|s| s as i64), next_str, id],
        )?;
        Ok(())
    }

    fn mark_failed(&self, conn: &Connection, id: &str, http_status: Option<u16>) -> Result<()> {
        let now = Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string();
        conn.execute(
            "UPDATE webhook_event_records
             SET failed_at = ?1, http_status = ?2, next_retry_at = NULL
             WHERE id = ?3",
            params![now, http_status.map(|s| s as i64), id],
        )?;
        Ok(())
    }

    /// Reset a failed record for immediate retry; also reset attempt to 0.
    pub fn reset_for_retry(&self, record_id: &str) -> Result<()> {
        let conn = self.conn()?;
        ensure_webhook_tables(&conn)?;
        conn.execute(
            "UPDATE webhook_event_records
             SET failed_at = NULL, next_retry_at = NULL, completed_at = NULL, attempt = 0
             WHERE id = ?1",
            params![record_id],
        )?;
        Ok(())
    }

    /// Return records whose `next_retry_at` is due and are still pending.
    pub fn get_due_retries(&self, now: DateTime<Utc>) -> Result<Vec<WebhookEventRecord>> {
        let conn = self.conn()?;
        ensure_webhook_tables(&conn)?;
        let now_str = now.format("%Y-%m-%dT%H:%M:%SZ").to_string();
        let mut stmt = conn.prepare(
            "SELECT id, webhook_url_id, event_type, payload, attempt, http_status,
                    next_retry_at, created_at, completed_at, failed_at
             FROM webhook_event_records
             WHERE next_retry_at <= ?1
               AND completed_at IS NULL
               AND failed_at IS NULL
               AND attempt < 12
             LIMIT 100",
        )?;
        let rows = stmt.query_map(params![now_str], |row| {
            Ok(WebhookEventRecord {
                id: row.get(0)?,
                webhook_url_id: row.get(1)?,
                event_type: row.get(2)?,
                payload: serde_json::from_str(&row.get::<_, String>(3)?).unwrap_or_default(),
                attempt: row.get(4)?,
                http_status: row.get(5)?,
                next_retry_at: row.get(6)?,
                created_at: row.get(7)?,
                completed_at: row.get(8)?,
                failed_at: row.get(9)?,
            })
        })?;
        let mut result = Vec::new();
        for row in rows {
            result.push(row?);
        }
        Ok(result)
    }
}

// ─── Dispatcher ───────────────────────────────────────────────────────────────

const MAX_ATTEMPTS: i64 = 12;

/// Dispatch `event` to all matching webhook URLs concurrently.  Never returns Err.
pub async fn dispatch_event(
    pool: DbPool,
    event: WebhookEvent,
    payload: serde_json::Value,
) {
    let store = WebhookStore::new(pool.clone());
    let event_str = event.as_str();

    let urls = match store.list_urls() {
        Ok(u) => u,
        Err(e) => {
            warn!("webhook dispatch: list_urls failed: {e}");
            return;
        }
    };

    // filter by subscribed events
    let matching: Vec<_> = urls
        .into_iter()
        .filter(|u| u.events.iter().any(|ev| ev == event_str || ev == "*"))
        .collect();

    if matching.is_empty() {
        return;
    }

    // Build HTTP client (reused across deliveries)
    let client = match reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
    {
        Ok(c) => c,
        Err(e) => {
            warn!("webhook: build http client failed: {e}");
            return;
        }
    };
    let client = Arc::new(client);

    let mut handles = Vec::new();
    for wh_url in matching {
        let record_id = {
            let conn = match pool.get() {
                Ok(c) => c,
                Err(e) => {
                    warn!("webhook dispatch: pool.get failed: {e}");
                    continue;
                }
            };
            if let Err(e) = ensure_webhook_tables(&conn) {
                warn!("webhook dispatch: ensure tables: {e}");
                continue;
            }
            match store.create_record(&conn, &wh_url.id, event_str, &payload) {
                Ok(id) => id,
                Err(e) => {
                    warn!("webhook dispatch: create_record: {e}");
                    continue;
                }
            }
        };

        let pool2 = pool.clone();
        let client2 = client.clone();
        let payload2 = payload.clone();
        let event_str2 = event_str.to_string();
        handles.push(tokio::spawn(async move {
            let store2 = WebhookStore::new(pool2.clone());
            deliver_one(
                pool2,
                &store2,
                &client2,
                &wh_url,
                &record_id,
                &event_str2,
                &payload2,
                0,
            )
            .await;
        }));
    }
    for h in handles {
        let _ = h.await;
    }
}

/// Background poller: every 60 s check for due retries and re-deliver.
pub fn start_retry_poller(store: Arc<WebhookStore>) {
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(std::time::Duration::from_secs(60));
        loop {
            interval.tick().await;
            poll_due_retries(&store).await;
        }
    });
}

async fn poll_due_retries(store: &WebhookStore) {
    let now = Utc::now();
    let due = match store.get_due_retries(now) {
        Ok(r) => r,
        Err(e) => {
            warn!("webhook poller: get_due_retries failed: {e}");
            return;
        }
    };
    if due.is_empty() {
        return;
    }
    info!("webhook poller: {} records due for retry", due.len());

    let client = match reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
    {
        Ok(c) => Arc::new(c),
        Err(e) => {
            warn!("webhook poller: build client: {e}");
            return;
        }
    };

    let pool = store.pool();
    let urls = match store.list_urls() {
        Ok(u) => u,
        Err(e) => {
            warn!("webhook poller: list_urls: {e}");
            return;
        }
    };

    let mut handles = Vec::new();
    for record in due {
        let wh_url = match urls.iter().find(|u| u.id == record.webhook_url_id) {
            Some(u) => u.clone(),
            None => {
                warn!("webhook poller: url {} not found for record {}", record.webhook_url_id, record.id);
                continue;
            }
        };
        let pool2 = pool.clone();
        let client2 = client.clone();
        let event_str = record.event_type.clone();
        let payload = record.payload.clone();
        let record_id = record.id.clone();
        let attempt = record.attempt;
        handles.push(tokio::spawn(async move {
            let store2 = WebhookStore::new(pool2.clone());
            deliver_one(pool2, &store2, &client2, &wh_url, &record_id, &event_str, &payload, attempt).await;
        }));
    }
    for h in handles {
        let _ = h.await;
    }
}

#[allow(clippy::too_many_arguments)]
async fn deliver_one(
    pool: DbPool,
    store: &WebhookStore,
    client: &reqwest::Client,
    wh_url: &WebhookUrl,
    record_id: &str,
    event_str: &str,
    payload: &serde_json::Value,
    attempt: i64,
) {
    let body = match serde_json::to_vec(payload) {
        Ok(b) => b,
        Err(e) => {
            warn!("webhook: serialize payload: {e}");
            return;
        }
    };

    let signature = wh_url
        .secret
        .as_deref()
        .map(|s| sign_payload(s, &body))
        .unwrap_or_default();

    let mut req = client
        .post(&wh_url.url)
        .header("Content-Type", "application/json")
        .header("X-Eket-Event", event_str)
        .header("X-Eket-Attempt", attempt.to_string())
        .body(body);

    if !signature.is_empty() {
        req = req.header("X-Eket-Signature", format!("sha256={signature}"));
    }

    let conn = match pool.get() {
        Ok(c) => c,
        Err(e) => {
            warn!("webhook deliver: pool.get: {e}");
            return;
        }
    };

    match req.send().await {
        Ok(resp) => {
            let status = resp.status().as_u16();
            if status < 400 {
                info!("webhook delivered: record={record_id} status={status}");
                store.mark_success(&conn, record_id, status).unwrap_or_else(|e| {
                    warn!("webhook: mark_success failed: {e}");
                });
            } else {
                warn!("webhook failed: record={record_id} http={status} attempt={attempt}");
                let next_attempt = attempt + 1;
                if next_attempt >= MAX_ATTEMPTS {
                    store.mark_failed(&conn, record_id, Some(status)).unwrap_or_else(|e| {
                        warn!("webhook: mark_failed: {e}");
                    });
                } else {
                    store
                        .mark_retry(&conn, record_id, Some(status), attempt)
                        .unwrap_or_else(|e| {
                            warn!("webhook: mark_retry: {e}");
                        });
                }
            }
        }
        Err(e) => {
            warn!("webhook request error: record={record_id} err={e} attempt={attempt}");
            let next_attempt = attempt + 1;
            if next_attempt >= MAX_ATTEMPTS {
                store.mark_failed(&conn, record_id, None).unwrap_or_else(|e2| {
                    warn!("webhook: mark_failed: {e2}");
                });
            } else {
                store.mark_retry(&conn, record_id, None, attempt).unwrap_or_else(|e2| {
                    warn!("webhook: mark_retry: {e2}");
                });
            }
        }
    }
}

// ─── Unit tests ───────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use r2d2::Pool;
    use r2d2_sqlite::SqliteConnectionManager;

    fn make_pool() -> DbPool {
        let manager = SqliteConnectionManager::memory();
        std::sync::Arc::new(Pool::builder().max_size(1).build(manager).unwrap())
    }

    #[test]
    fn ensure_tables_is_idempotent() {
        let pool = make_pool();
        let conn = pool.get().unwrap();
        ensure_webhook_tables(&conn).unwrap();
        ensure_webhook_tables(&conn).unwrap(); // second call must not fail
    }

    #[test]
    fn add_and_list_url() {
        let pool = make_pool();
        let store = WebhookStore::new(pool.clone());

        let wh = store
            .add_url("https://example.com/hook", &["task.completed".to_string()], None)
            .unwrap();

        let list = store.list_urls().unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].id, wh.id);
        assert_eq!(list[0].url, "https://example.com/hook");
        assert_eq!(list[0].events, vec!["task.completed"]);
    }

    #[test]
    fn remove_url() {
        let pool = make_pool();
        let store = WebhookStore::new(pool.clone());

        let wh = store
            .add_url("https://example.com/hook", &["*".to_string()], None)
            .unwrap();
        let n = store.remove_url(&wh.id).unwrap();
        assert_eq!(n, 1);
        assert!(store.list_urls().unwrap().is_empty());
    }

    #[test]
    fn list_records_empty() {
        let pool = make_pool();
        let store = WebhookStore::new(pool);
        let records = store.list_records(None).unwrap();
        assert!(records.is_empty());
    }

    #[test]
    fn list_records_with_status_filter() {
        let pool = make_pool();
        let store = WebhookStore::new(pool.clone());

        // add a url + create a record + mark failed
        let wh = store
            .add_url("https://example.com/hook", &["task.completed".to_string()], None)
            .unwrap();
        {
            let conn = pool.get().unwrap();
            let id = store
                .create_record(
                    &conn,
                    &wh.id,
                    "task.completed",
                    &serde_json::json!({"ticket": "TASK-1"}),
                )
                .unwrap();
            store.mark_failed(&conn, &id, Some(500)).unwrap();
        }

        let failed = store.list_records(Some("failed")).unwrap();
        assert_eq!(failed.len(), 1);
        let pending = store.list_records(Some("pending")).unwrap();
        assert!(pending.is_empty());
    }

    #[test]
    fn webhook_event_roundtrip() {
        let ev = WebhookEvent::TaskCompleted;
        assert_eq!(ev.as_str(), "task.completed");
        assert_eq!(
            WebhookEvent::parse_event("task.completed"),
            Some(WebhookEvent::TaskCompleted)
        );
        assert_eq!(WebhookEvent::parse_event("unknown"), None);
    }

    #[test]
    fn sign_payload_stable() {
        let sig1 = sign_payload("mysecret", b"hello");
        let sig2 = sign_payload("mysecret", b"hello");
        assert_eq!(sig1, sig2);
        assert!(!sig1.is_empty());
        // different body → different sig
        let sig3 = sign_payload("mysecret", b"world");
        assert_ne!(sig1, sig3);
    }

    #[test]
    fn encrypt_decrypt_roundtrip() {
        // 64 hex chars = 32 bytes key — no env mutation needed
        let key_hex = "0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20";
        let mut key = [0u8; 32];
        hex::decode_to_slice(key_hex, &mut key).unwrap();

        let plaintext = "https://secret.example.com/hook";
        let enc = encrypt_with_key(plaintext, Some(&key));
        let dec = decrypt_with_key(&enc, Some(&key));
        assert_eq!(dec, plaintext);

        // Verify format: nonce_hex:ct_hex
        assert!(enc.contains(':'), "expected nonce:ciphertext format");
        // Different calls produce different ciphertexts (random nonce)
        let enc2 = encrypt_with_key(plaintext, Some(&key));
        assert_ne!(enc, enc2, "nonce should differ between calls");
        assert_eq!(decrypt_with_key(&enc2, Some(&key)), plaintext);
    }

    #[test]
    fn reset_for_retry_works() {
        let pool = make_pool();
        let store = WebhookStore::new(pool.clone());

        let wh = store
            .add_url("https://example.com/hook", &["*".to_string()], None)
            .unwrap();
        let record_id = {
            let conn = pool.get().unwrap();
            let id = store
                .create_record(
                    &conn,
                    &wh.id,
                    "task.completed",
                    &serde_json::json!({}),
                )
                .unwrap();
            store.mark_failed(&conn, &id, Some(503)).unwrap();
            id
        };

        store.reset_for_retry(&record_id).unwrap();

        let records = store.list_records(Some("pending")).unwrap();
        assert_eq!(records.len(), 1);
        assert_eq!(records[0].attempt, 0, "reset_for_retry should reset attempt to 0");
    }

    #[test]
    fn get_due_retries_returns_due_records() {
        let pool = make_pool();
        let store = WebhookStore::new(pool.clone());
        let wh = store
            .add_url("https://example.com/hook", &["*".to_string()], None)
            .unwrap();

        // Create a record and schedule it in the past
        let record_id = {
            let conn = pool.get().unwrap();
            let id = store
                .create_record(&conn, &wh.id, "task.completed", &serde_json::json!({}))
                .unwrap();
            // Set next_retry_at to 1 hour ago
            let past = Utc::now() - chrono::Duration::hours(1);
            let past_str = past.format("%Y-%m-%dT%H:%M:%SZ").to_string();
            conn.execute(
                "UPDATE webhook_event_records SET next_retry_at = ?1 WHERE id = ?2",
                rusqlite::params![past_str, id],
            ).unwrap();
            id
        };

        let due = store.get_due_retries(Utc::now()).unwrap();
        assert_eq!(due.len(), 1);
        assert_eq!(due[0].id, record_id);
    }

    #[test]
    fn get_due_retries_excludes_future() {
        let pool = make_pool();
        let store = WebhookStore::new(pool.clone());
        let wh = store
            .add_url("https://example.com/hook", &["*".to_string()], None)
            .unwrap();

        {
            let conn = pool.get().unwrap();
            let id = store
                .create_record(&conn, &wh.id, "task.completed", &serde_json::json!({}))
                .unwrap();
            // Set next_retry_at to 1 hour in future
            let future = Utc::now() + chrono::Duration::hours(1);
            let future_str = future.format("%Y-%m-%dT%H:%M:%SZ").to_string();
            conn.execute(
                "UPDATE webhook_event_records SET next_retry_at = ?1 WHERE id = ?2",
                rusqlite::params![future_str, id],
            ).unwrap();
        }

        let due = store.get_due_retries(Utc::now()).unwrap();
        assert!(due.is_empty());
    }
}
