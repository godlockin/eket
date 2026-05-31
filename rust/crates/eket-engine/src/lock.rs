/// 分布式锁管理器 — Redis锁 + 内存降级
///
/// Redis不可用时自动降级到内存锁（单实例语义）
use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tokio::sync::RwLock;

use eket_core::redis::EketRedisClient;

#[derive(Debug, Clone)]
pub struct LockInfo {
    pub resource_id: String,
    pub owner_id: String,
    pub acquired_at: Instant,
    pub ttl: Duration,
}

impl LockInfo {
    pub fn is_expired(&self) -> bool {
        self.acquired_at.elapsed() > self.ttl
    }
}

#[derive(Debug)]
pub struct LockResult {
    pub success: bool,
    pub owner_id: String,
    pub expires_at_ms: u64,
}

pub struct LockManager {
    redis: Arc<EketRedisClient>,
    memory_locks: Arc<RwLock<HashMap<String, LockInfo>>>,
    wait_queues: Arc<RwLock<HashMap<String, Vec<String>>>>,
    pub default_ttl: Duration,
}

impl LockManager {
    pub fn new(redis: Arc<EketRedisClient>) -> Self {
        Self {
            redis,
            memory_locks: Arc::new(RwLock::new(HashMap::new())),
            wait_queues: Arc::new(RwLock::new(HashMap::new())),
            default_ttl: Duration::from_secs(30),
        }
    }

    pub async fn acquire(&self, resource_id: &str, owner_id: &str, ttl_ms: u64) -> LockResult {
        let ttl = Duration::from_millis(ttl_ms);
        let ttl_secs = (ttl_ms / 1000).max(1);
        let redis_key = format!("eket:lock:{resource_id}");
        let expires_at_ms = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64
            + ttl_ms;

        // 尝试 Redis
        if self.redis.is_available() {
            match self.redis.setnx(&redis_key, owner_id, ttl_secs).await {
                Ok(true) => {
                    return LockResult {
                        success: true,
                        owner_id: owner_id.to_string(),
                        expires_at_ms,
                    };
                }
                Ok(false) => {
                    // 锁被他人持有
                    let current_owner = self
                        .redis
                        .get(&redis_key)
                        .await
                        .unwrap_or(None)
                        .unwrap_or_default();
                    return LockResult {
                        success: false,
                        owner_id: current_owner,
                        expires_at_ms,
                    };
                }
                Err(_) => {
                    // Redis 失败 → 降级到内存
                }
            }
        }

        // 内存降级
        let mut locks = self.memory_locks.write().await;
        // 清理过期
        if let Some(existing) = locks.get(resource_id) {
            if existing.is_expired() {
                locks.remove(resource_id);
            }
        }
        if locks.contains_key(resource_id) {
            let current = locks[resource_id].clone();
            LockResult {
                success: false,
                owner_id: current.owner_id,
                expires_at_ms,
            }
        } else {
            locks.insert(
                resource_id.to_string(),
                LockInfo {
                    resource_id: resource_id.to_string(),
                    owner_id: owner_id.to_string(),
                    acquired_at: Instant::now(),
                    ttl,
                },
            );
            LockResult {
                success: true,
                owner_id: owner_id.to_string(),
                expires_at_ms,
            }
        }
    }

    pub async fn release(&self, resource_id: &str, owner_id: &str) -> bool {
        let redis_key = format!("eket:lock:{resource_id}");

        if self.redis.is_available() {
            // GET 验证 owner
            match self.redis.get(&redis_key).await {
                Ok(Some(current)) if current == owner_id => {
                    return self.redis.del(&redis_key).await.unwrap_or(false);
                }
                Ok(Some(_)) => return false, // 不是 owner
                Ok(None) => return false,    // 锁不存在
                Err(_) => {}                 // 降级到内存
            }
        }

        // 内存降级
        let mut locks = self.memory_locks.write().await;
        if let Some(info) = locks.get(resource_id) {
            if info.owner_id == owner_id {
                locks.remove(resource_id);
                return true;
            }
        }
        false
    }

    pub async fn add_to_wait_queue(&self, resource_id: &str, waiter_id: &str) {
        let mut queues = self.wait_queues.write().await;
        queues
            .entry(resource_id.to_string())
            .or_default()
            .push(waiter_id.to_string());
    }

    pub async fn pop_next_waiter(&self, resource_id: &str) -> Option<String> {
        let mut queues = self.wait_queues.write().await;
        let queue = queues.get_mut(resource_id)?;
        if queue.is_empty() {
            return None;
        }
        Some(queue.remove(0))
    }

    pub async fn is_locked(&self, resource_id: &str) -> bool {
        let redis_key = format!("eket:lock:{resource_id}");

        if self.redis.is_available() {
            return self.redis.get(&redis_key).await.unwrap_or(None).is_some();
        }

        let locks = self.memory_locks.read().await;
        if let Some(info) = locks.get(resource_id) {
            !info.is_expired()
        } else {
            false
        }
    }

    pub async fn cleanup_expired(&self) {
        let mut locks = self.memory_locks.write().await;
        locks.retain(|_, v| !v.is_expired());
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    async fn make_manager() -> LockManager {
        // 连接一个不存在的 Redis 地址，立即降级到内存锁
        let redis = Arc::new(EketRedisClient::connect("127.0.0.1", 19999, None).await);
        LockManager::new(redis)
    }

    #[tokio::test]
    async fn acquire_and_release() {
        let m = make_manager().await;
        let r = m.acquire("res1", "owner1", 5000).await;
        assert!(r.success);
        assert!(m.is_locked("res1").await);
        let released = m.release("res1", "owner1").await;
        assert!(released);
        // 释放后可再次获取
        let r2 = m.acquire("res1", "owner2", 5000).await;
        assert!(r2.success);
    }

    #[tokio::test]
    async fn only_owner_can_release() {
        let m = make_manager().await;
        m.acquire("res2", "owner1", 5000).await;
        let fail = m.release("res2", "other").await;
        assert!(!fail);
        // owner 可释放
        let ok = m.release("res2", "owner1").await;
        assert!(ok);
    }

    #[tokio::test]
    async fn second_acquire_fails_while_locked() {
        let m = make_manager().await;
        let r1 = m.acquire("res3", "owner1", 5000).await;
        assert!(r1.success);
        let r2 = m.acquire("res3", "owner2", 5000).await;
        assert!(!r2.success);
    }

    #[tokio::test]
    async fn wait_queue_fifo() {
        let m = make_manager().await;
        m.add_to_wait_queue("res4", "waiter1").await;
        m.add_to_wait_queue("res4", "waiter2").await;
        assert_eq!(m.pop_next_waiter("res4").await, Some("waiter1".to_string()));
        assert_eq!(m.pop_next_waiter("res4").await, Some("waiter2".to_string()));
        assert_eq!(m.pop_next_waiter("res4").await, None);
    }

    #[tokio::test]
    async fn memory_fallback() {
        // Redis不可用时内存锁正常工作
        let m = make_manager().await;
        assert!(!m.redis.is_available());
        let r = m.acquire("res5", "owner1", 5000).await;
        assert!(r.success);
        assert!(m.is_locked("res5").await);
        assert!(!m.acquire("res5", "owner2", 5000).await.success);
        m.release("res5", "owner1").await;
        assert!(!m.is_locked("res5").await);
    }
}
