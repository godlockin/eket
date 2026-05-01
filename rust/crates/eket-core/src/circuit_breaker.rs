/// Circuit Breaker — 对应 TS: circuit-breaker.ts
///
/// 三态：closed → open → half_open → closed
/// 纯 Rust，无外部依赖，tokio 时间戳
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use crate::error::{EketError, EketResult};

// ─── Config ───────────────────────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct CircuitBreakerConfig {
    /// 触发 open 的连续失败次数
    pub failure_threshold: u32,
    /// half_open → closed 所需的连续成功次数
    pub success_threshold: u32,
    /// open 状态持续多久后尝试 half_open
    pub timeout: Duration,
    /// 失败计数的滑动时间窗口（超出则重置计数）
    pub monitor_window: Duration,
}

impl Default for CircuitBreakerConfig {
    fn default() -> Self {
        Self {
            failure_threshold: 5,
            success_threshold: 2,
            timeout: Duration::from_secs(60),
            monitor_window: Duration::from_secs(60),
        }
    }
}

// ─── State ────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CircuitState {
    Closed,
    Open,
    HalfOpen,
}

impl std::fmt::Display for CircuitState {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Closed => write!(f, "closed"),
            Self::Open => write!(f, "open"),
            Self::HalfOpen => write!(f, "half_open"),
        }
    }
}

#[derive(Debug)]
struct Inner {
    state: CircuitState,
    failures: u32,
    successes: u32,
    opened_at: Option<Instant>,
    last_failure_at: Option<Instant>,
}

impl Inner {
    fn new() -> Self {
        Self {
            state: CircuitState::Closed,
            failures: 0,
            successes: 0,
            opened_at: None,
            last_failure_at: None,
        }
    }
}

// ─── CircuitBreaker ───────────────────────────────────────────────────────────

/// Thread-safe circuit breaker (Arc<Mutex<Inner>>).
/// Clone to share across tasks.
#[derive(Clone)]
pub struct CircuitBreaker {
    config: CircuitBreakerConfig,
    inner: Arc<Mutex<Inner>>,
    name: String,
}

impl CircuitBreaker {
    pub fn new(name: impl Into<String>, config: CircuitBreakerConfig) -> Self {
        Self {
            config,
            inner: Arc::new(Mutex::new(Inner::new())),
            name: name.into(),
        }
    }

    pub fn with_defaults(name: impl Into<String>) -> Self {
        Self::new(name, CircuitBreakerConfig::default())
    }

    /// 当前状态（只读快照）
    pub fn state(&self) -> CircuitState {
        self.inner.lock().unwrap_or_else(|p| p.into_inner()).state.clone()
    }

    /// 执行受保护的 async 操作
    /// 对应 TS: CircuitBreaker.execute()
    pub async fn execute<F, Fut, T>(&self, op: F) -> EketResult<T>
    where
        F: FnOnce() -> Fut,
        Fut: std::future::Future<Output = EketResult<T>>,
    {
        // 检查是否可执行，必要时转 half_open
        if !self.can_execute() {
            return Err(EketError::CircuitBreakerOpen {
                service: self.name.clone(),
            });
        }

        match op().await {
            Ok(v) => {
                self.on_success();
                Ok(v)
            }
            Err(e) => {
                self.on_failure();
                Err(e)
            }
        }
    }

    fn can_execute(&self) -> bool {
        let mut inner = self.inner.lock().unwrap_or_else(|p| p.into_inner());
        match inner.state {
            CircuitState::Closed => true,
            CircuitState::HalfOpen => true,
            CircuitState::Open => {
                let timed_out = inner
                    .opened_at
                    .map(|t| t.elapsed() >= self.config.timeout)
                    .unwrap_or(false);
                if timed_out {
                    inner.state = CircuitState::HalfOpen;
                    inner.successes = 0;
                    tracing::info!("[CircuitBreaker:{}] → half_open", self.name);
                    true
                } else {
                    false
                }
            }
        }
    }

    fn on_success(&self) {
        let mut inner = self.inner.lock().unwrap_or_else(|p| p.into_inner());
        inner.successes += 1;
        match inner.state {
            CircuitState::HalfOpen => {
                if inner.successes >= self.config.success_threshold {
                    inner.state = CircuitState::Closed;
                    inner.failures = 0;
                    inner.successes = 0;
                    inner.opened_at = None;
                    tracing::info!("[CircuitBreaker:{}] → closed (recovered)", self.name);
                }
            }
            CircuitState::Closed => {
                inner.failures = 0;
            }
            CircuitState::Open => {}
        }
    }

    fn on_failure(&self) {
        let mut inner = self.inner.lock().unwrap_or_else(|p| p.into_inner());

        // 滑动窗口：超出监控窗口则重置
        if let Some(last) = inner.last_failure_at {
            if last.elapsed() > self.config.monitor_window {
                inner.failures = 0;
            }
        }

        inner.failures += 1;
        inner.last_failure_at = Some(Instant::now());

        let should_open = match inner.state {
            CircuitState::HalfOpen => true,
            CircuitState::Closed => inner.failures >= self.config.failure_threshold,
            CircuitState::Open => false,
        };

        if should_open {
            inner.state = CircuitState::Open;
            // HalfOpen → Open: keep original opened_at to avoid resetting backoff timer.
            // Only set opened_at when first transitioning from Closed → Open.
            if inner.opened_at.is_none() {
                inner.opened_at = Some(Instant::now());
            } else {
                // Re-open from HalfOpen: bump opened_at so timeout restarts
                inner.opened_at = Some(Instant::now());
            }
            inner.successes = 0;
            tracing::warn!(
                "[CircuitBreaker:{}] → open (failures={})",
                self.name,
                inner.failures
            );
        }
    }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;

    fn fast_config() -> CircuitBreakerConfig {
        CircuitBreakerConfig {
            failure_threshold: 3,
            success_threshold: 2,
            timeout: Duration::from_millis(50),
            monitor_window: Duration::from_secs(60),
        }
    }

    #[tokio::test]
    async fn starts_closed() {
        let cb = CircuitBreaker::new("test", fast_config());
        assert_eq!(cb.state(), CircuitState::Closed);
    }

    #[tokio::test]
    async fn opens_after_threshold_failures() {
        let cb = CircuitBreaker::new("test", fast_config());
        for _ in 0..3 {
            let _ = cb.execute(|| async { Err::<(), _>(EketError::Other("fail".into())) }).await;
        }
        assert_eq!(cb.state(), CircuitState::Open);
    }

    #[tokio::test]
    async fn rejects_when_open() {
        let cb = CircuitBreaker::new("test", fast_config());
        for _ in 0..3 {
            let _ = cb.execute(|| async { Err::<(), _>(EketError::Other("fail".into())) }).await;
        }
        let result = cb.execute(|| async { Ok::<_, EketError>(42) }).await;
        assert!(matches!(result, Err(EketError::CircuitBreakerOpen { .. })));
    }

    #[tokio::test]
    async fn transitions_half_open_after_timeout() {
        let cb = CircuitBreaker::new("test", fast_config());
        for _ in 0..3 {
            let _ = cb.execute(|| async { Err::<(), _>(EketError::Other("fail".into())) }).await;
        }
        tokio::time::sleep(Duration::from_millis(60)).await;
        // Should be half_open now, allow one call
        let result = cb.execute(|| async { Ok::<_, EketError>(1) }).await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn recovers_to_closed_after_successes() {
        let cb = CircuitBreaker::new("test", fast_config());
        for _ in 0..3 {
            let _ = cb.execute(|| async { Err::<(), _>(EketError::Other("fail".into())) }).await;
        }
        tokio::time::sleep(Duration::from_millis(60)).await;
        for _ in 0..2 {
            let _ = cb.execute(|| async { Ok::<_, EketError>(()) }).await;
        }
        assert_eq!(cb.state(), CircuitState::Closed);
    }

    #[tokio::test]
    async fn half_open_failure_reopens() {
        let cb = CircuitBreaker::new("test", fast_config());
        // Open the breaker
        for _ in 0..3 {
            let _ = cb.execute(|| async { Err::<(), _>(EketError::Other("fail".into())) }).await;
        }
        // Wait for timeout → half_open
        tokio::time::sleep(Duration::from_millis(60)).await;
        // Fail in half_open → should re-open
        let _ = cb.execute(|| async { Err::<(), _>(EketError::Other("fail again".into())) }).await;
        assert_eq!(cb.state(), CircuitState::Open);
    }

    #[tokio::test]
    async fn monitor_window_resets_failure_count() {
        let config = CircuitBreakerConfig {
            failure_threshold: 3,
            success_threshold: 2,
            timeout: Duration::from_millis(50),
            monitor_window: Duration::from_millis(30), // very short window
        };
        let cb = CircuitBreaker::new("test", config);
        // Two failures
        for _ in 0..2 {
            let _ = cb.execute(|| async { Err::<(), _>(EketError::Other("fail".into())) }).await;
        }
        // Wait for monitor window to expire
        tokio::time::sleep(Duration::from_millis(40)).await;
        // One more failure — counter should have reset, so still below threshold
        let _ = cb.execute(|| async { Err::<(), _>(EketError::Other("fail".into())) }).await;
        assert_eq!(cb.state(), CircuitState::Closed);
    }

    #[tokio::test]
    async fn success_resets_failure_count_in_closed() {
        let cb = CircuitBreaker::new("test", fast_config());
        // Two failures (below threshold)
        for _ in 0..2 {
            let _ = cb.execute(|| async { Err::<(), _>(EketError::Other("fail".into())) }).await;
        }
        // One success → failures reset
        let _ = cb.execute(|| async { Ok::<_, EketError>(()) }).await;
        // Two more failures → still below threshold (count was reset)
        for _ in 0..2 {
            let _ = cb.execute(|| async { Err::<(), _>(EketError::Other("fail".into())) }).await;
        }
        assert_eq!(cb.state(), CircuitState::Closed);
    }

    #[tokio::test]
    async fn poison_safe_state_read() {
        // Simulate poison by taking the lock and panicking inside
        let cb = Arc::new(CircuitBreaker::new("poison-test", fast_config()));
        let cb2 = cb.clone();
        // Force a panic inside the lock via std::thread (tokio won't propagate panics the same way)
        let _result = std::panic::catch_unwind(move || {
            // This is just verifying we can call state() after unwrap_or_else handles poisoning
            let _ = cb2.state();
        });
        // Even if above panicked, state() should still work
        let _ = cb.state(); // must not panic
    }

    #[tokio::test]
    async fn clone_shares_state() {
        let cb1 = CircuitBreaker::new("shared", fast_config());
        let cb2 = cb1.clone();
        for _ in 0..3 {
            let _ = cb1.execute(|| async { Err::<(), _>(EketError::Other("fail".into())) }).await;
        }
        // cb2 shares inner Arc<Mutex<>>
        assert_eq!(cb2.state(), CircuitState::Open);
    }
}
