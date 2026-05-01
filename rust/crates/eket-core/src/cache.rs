/// Two-level cache — L1: moka (in-memory), L2: Redis
///
/// Get flow: L1 hit → return; L1 miss → Redis; Redis hit → backfill L1; else miss.
/// Set: write both levels; Redis unavailable → silent degradation (L1 only).
/// Invalidate: remove from both levels.
use std::sync::{Arc, Mutex};
use std::time::Duration;

use moka::future::Cache as MokaCache;
use serde_json::Value;
use tracing::warn;

use crate::redis::EketRedisClient;

// ─── Stats ───────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Default)]
pub struct CacheStats {
    pub l1_hits: u64,
    pub l2_hits: u64,
    pub misses: u64,
}

// ─── CacheLayer ──────────────────────────────────────────────────────────────

pub struct CacheLayer {
    l1: MokaCache<String, Value>,
    redis: Arc<EketRedisClient>,
    stats: Arc<Mutex<CacheStats>>,
}

impl CacheLayer {
    pub fn new(redis: Arc<EketRedisClient>, max_capacity: u64) -> Self {
        let l1 = MokaCache::builder()
            .max_capacity(max_capacity)
            .time_to_live(Duration::from_secs(300))
            .build();
        Self {
            l1,
            redis,
            stats: Arc::new(Mutex::new(CacheStats::default())),
        }
    }

    /// L1 hit → return; L1 miss → Redis; Redis hit → backfill L1; else None.
    pub async fn get(&self, key: &str) -> Option<Value> {
        // L1
        if let Some(v) = self.l1.get(key).await {
            if let Ok(mut s) = self.stats.lock() {
                s.l1_hits += 1;
            }
            return Some(v);
        }

        // L2
        match self.redis.get(key).await {
            Ok(Some(raw)) => {
                match serde_json::from_str::<Value>(&raw) {
                    Ok(v) => {
                        // backfill L1
                        self.l1.insert(key.to_string(), v.clone()).await;
                        if let Ok(mut s) = self.stats.lock() {
                            s.l2_hits += 1;
                        }
                        return Some(v);
                    }
                    Err(e) => {
                        warn!("Cache L2 deserialize error for key={key}: {e}");
                    }
                }
            }
            Ok(None) => {}
            Err(e) => {
                warn!("Cache L2 get error for key={key}: {e}");
            }
        }

        if let Ok(mut s) = self.stats.lock() {
            s.misses += 1;
        }
        None
    }

    /// Write L1 (global 300s TTL) + L2 (Redis SET EX ttl_secs).
    /// Redis unavailable → silent L1-only.
    pub async fn set(&self, key: &str, value: Value, ttl_secs: u64) {
        self.l1.insert(key.to_string(), value.clone()).await;

        let raw = value.to_string();
        if let Err(e) = self.redis.set(key, &raw, Some(ttl_secs)).await {
            warn!("Cache L2 set error for key={key}: {e}. L1 only.");
        }
    }

    /// Delete from both L1 and L2.
    pub async fn invalidate(&self, key: &str) {
        self.l1.invalidate(key).await;

        if let Err(e) = self.redis.del(key).await {
            warn!("Cache L2 del error for key={key}: {e}");
        }
    }

    /// Delete all L1 keys matching prefix.
    /// Redis side: no SCAN on current EketRedisClient — L1-only prefix clear.
    pub async fn invalidate_prefix(&self, prefix: &str) {
        // Collect matching keys from L1 iter
        let keys: Vec<String> = self
            .l1
            .iter()
            .filter_map(|(k, _): (Arc<String>, _)| {
                if k.starts_with(prefix) {
                    Some(k.as_ref().clone())
                } else {
                    None
                }
            })
            .collect();

        for k in &keys {
            self.l1.invalidate(k).await;
            // Best-effort Redis del per key (no SCAN available in EketRedisClient)
            if let Err(e) = self.redis.del(k).await {
                warn!("Cache L2 del error for prefix key={k}: {e}");
            }
        }
    }

    pub fn stats(&self) -> CacheStats {
        self.stats.lock().unwrap().clone()
    }

    pub fn reset_stats(&self) {
        if let Ok(mut s) = self.stats.lock() {
            *s = CacheStats::default();
        }
    }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    /// Build a CacheLayer with a Redis that will be unavailable in CI.
    /// connect() marks itself unavailable on timeout — safe to use.
    async fn make_cache() -> CacheLayer {
        let redis = Arc::new(
            EketRedisClient::connect("127.0.0.1", 6399, None).await, // port 6399: likely not running
        );
        CacheLayer::new(redis, 1000)
    }

    // 1. L1 hit: set then immediately get returns value
    #[tokio::test]
    async fn test_l1_hit() {
        let c = make_cache().await;
        c.set("k1", json!({"x": 1}), 60).await;
        let v = c.get("k1").await;
        assert_eq!(v, Some(json!({"x": 1})));
    }

    // 2. L1 miss + Redis unavailable → None, no crash
    #[tokio::test]
    async fn test_l1_miss_redis_degraded_returns_none() {
        let c = make_cache().await;
        let v = c.get("nonexistent_key_xyz").await;
        assert_eq!(v, None);
    }

    // 3. invalidate → get returns None
    #[tokio::test]
    async fn test_invalidate() {
        let c = make_cache().await;
        c.set("k2", json!(42), 60).await;
        assert!(c.get("k2").await.is_some());
        c.invalidate("k2").await;
        assert_eq!(c.get("k2").await, None);
    }

    // 4. invalidate_prefix clears matching, keeps non-matching
    #[tokio::test]
    async fn test_invalidate_prefix() {
        let c = make_cache().await;
        c.set("user:1", json!("alice"), 60).await;
        c.set("user:2", json!("bob"), 60).await;
        c.set("task:1", json!("todo"), 60).await;

        c.invalidate_prefix("user:").await;

        assert_eq!(c.get("user:1").await, None);
        assert_eq!(c.get("user:2").await, None);
        assert_eq!(c.get("task:1").await, Some(json!("todo")));
    }

    // 5. stats: l1_hits and misses counted correctly
    #[tokio::test]
    async fn test_stats_hits_and_misses() {
        let c = make_cache().await;
        c.set("k3", json!(true), 60).await;

        // 1 l1 hit
        c.get("k3").await;
        // 1 miss (Redis also unavailable → miss)
        c.get("no_such_key").await;

        let s = c.stats();
        assert_eq!(s.l1_hits, 1);
        assert_eq!(s.misses, 1);
    }

    // 6. set does not increment any hit/miss counter
    #[tokio::test]
    async fn test_set_does_not_affect_stats() {
        let c = make_cache().await;
        c.set("k4", json!("v"), 60).await;
        c.set("k5", json!("w"), 60).await;
        let s = c.stats();
        assert_eq!(s.l1_hits, 0);
        assert_eq!(s.l2_hits, 0);
        assert_eq!(s.misses, 0);
    }

    // 7. reset_stats zeroes counters
    #[tokio::test]
    async fn test_reset_stats() {
        let c = make_cache().await;
        c.set("k6", json!(1), 60).await;
        c.get("k6").await; // l1 hit
        c.get("missing").await; // miss
        c.reset_stats();
        let s = c.stats();
        assert_eq!(s.l1_hits, 0);
        assert_eq!(s.misses, 0);
    }
}
