/// Redis client — 对应 TS: redis-client.ts
///
/// 使用 fred v9（async Redis），连接失败时标记不可用（降级到 file queue）
use fred::prelude::*;
use tracing::{info, warn};

use crate::error::{EketError, EketResult};

pub struct EketRedisClient {
    inner: RedisClient,
    available: std::sync::atomic::AtomicBool,
}

impl EketRedisClient {
    /// Create a permanently-unavailable stub (for tests / offline mode).
    pub fn new_unavailable() -> Self {
        use fred::prelude::*;
        let client = RedisClient::new(RedisConfig::default(), None, None, None);
        Self {
            inner: client,
            available: std::sync::atomic::AtomicBool::new(false),
        }
    }

    /// 创建并连接 Redis（失败时不 panic，标记为不可用）
    pub async fn connect(host: &str, port: u16, password: Option<&str>) -> Self {
        let server = ServerConfig::new_centralized(host, port);
        let mut config = RedisConfig::default();
        config.server = server;
        config.password = password.map(|p| p.to_string());

        let client = RedisClient::new(config, None, None, None);
        // fred v9: connect() returns a JoinHandle, wait_for_connect() does the actual wait
        let _jh = client.connect();
        let connected = tokio::time::timeout(
            std::time::Duration::from_secs(2),
            client.wait_for_connect(),
        )
        .await;

        match connected {
            Ok(Ok(_)) => {
                info!("Redis connected: {host}:{port}");
                Self {
                    inner: client,
                    available: std::sync::atomic::AtomicBool::new(true),
                }
            }
            Ok(Err(e)) => {
                warn!("Redis unavailable ({e}). Falling back to file queue (Level 2).");
                Self {
                    inner: client,
                    available: std::sync::atomic::AtomicBool::new(false),
                }
            }
            Err(_timeout) => {
                warn!("Redis connect timeout. Falling back to file queue (Level 2).");
                Self {
                    inner: client,
                    available: std::sync::atomic::AtomicBool::new(false),
                }
            }
        }
    }

    pub fn is_available(&self) -> bool {
        self.available.load(std::sync::atomic::Ordering::Acquire)
    }

    fn mark_unavailable(&self) {
        self.available.store(false, std::sync::atomic::Ordering::Release);
    }

    /// PING
    pub async fn ping(&self) -> EketResult<bool> {
        if !self.is_available() {
            return Ok(false);
        }
        match self.inner.ping::<String>().await {
            Ok(s) => Ok(s == "PONG"),
            Err(e) => {
                self.mark_unavailable();
                Err(EketError::Redis(e.to_string()))
            }
        }
    }

    /// SET with optional TTL seconds
    pub async fn set(&self, key: &str, value: &str, ttl_secs: Option<u64>) -> EketResult<()> {
        self.require_available()?;
        let expiry = ttl_secs.map(|t| Expiration::EX(t as i64));
        self.inner
            .set::<(), _, _>(key, value, expiry, None, false)
            .await
            .map_err(|e| {
                self.mark_unavailable();
                EketError::Redis(e.to_string())
            })
    }

    /// GET
    pub async fn get(&self, key: &str) -> EketResult<Option<String>> {
        self.require_available()?;
        self.inner
            .get::<Option<String>, _>(key)
            .await
            .map_err(|e| {
                self.mark_unavailable();
                EketError::Redis(e.to_string())
            })
    }

    /// DEL
    pub async fn del(&self, key: &str) -> EketResult<bool> {
        self.require_available()?;
        let n: i64 = self.inner
            .del(key)
            .await
            .map_err(|e| {
                self.mark_unavailable();
                EketError::Redis(e.to_string())
            })?;
        Ok(n > 0)
    }

    /// SET NX (SET if Not eXists) — 用于 master election
    pub async fn setnx(&self, key: &str, value: &str, ttl_secs: u64) -> EketResult<bool> {
        self.require_available()?;
        let result: bool = self.inner
            .set::<bool, _, _>(
                key,
                value,
                Some(Expiration::EX(ttl_secs as i64)),
                Some(SetOptions::NX),
                false,
            )
            .await
            .map_err(|e| {
                self.mark_unavailable();
                EketError::Redis(e.to_string())
            })?;
        Ok(result)
    }

    /// LPUSH — enqueue
    pub async fn lpush(&self, key: &str, value: &str) -> EketResult<i64> {
        self.require_available()?;
        self.inner
            .lpush(key, value)
            .await
            .map_err(|e| {
                self.mark_unavailable();
                EketError::Redis(e.to_string())
            })
    }

    /// RPOP — dequeue
    pub async fn rpop(&self, key: &str) -> EketResult<Option<String>> {
        self.require_available()?;
        self.inner
            .rpop::<Option<String>, _>(key, None)
            .await
            .map_err(|e| {
                self.mark_unavailable();
                EketError::Redis(e.to_string())
            })
    }

    fn require_available(&self) -> EketResult<()> {
        if !self.is_available() {
            Err(EketError::Redis("Redis unavailable".into()))
        } else {
            Ok(())
        }
    }
}

#[cfg(test)]
mod tests {
    #[tokio::test]
    #[ignore = "requires Redis"]
    async fn ping_returns_pong() {
        let client = super::EketRedisClient::connect("localhost", 6379, None).await;
        assert!(client.is_available());
        assert!(client.ping().await.unwrap());
    }
}
