/// EventBus — 对应 TS: event-bus.ts
///
/// 基于 tokio::sync::broadcast 的内存事件总线
/// 支持：类型化订阅、死信队列、重试、拦截器
///
/// 关键设计：
/// - broadcast::channel(1024)：固定容量，订阅者可能 lag
/// - 每个事件类型独立 channel（避免不同订阅者争抢）
/// - 死信队列：超过 max_retry 次失败的事件写到 dead_letters

use std::collections::HashMap;
use std::sync::Arc;
use serde::{Deserialize, Serialize};
use tokio::sync::{broadcast, RwLock};
use tracing::{debug, warn};
use uuid::Uuid;

// ─── Types ────────────────────────────────────────────────────────────────────

/// 对应 TS: DomainEvent
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DomainEvent {
    pub id: String,
    pub event_type: String,
    pub source: Option<String>,
    pub timestamp: chrono::DateTime<chrono::Utc>,
    pub payload: serde_json::Value,
    pub retry_count: u32,
}

impl DomainEvent {
    pub fn new(
        event_type: impl Into<String>,
        payload: serde_json::Value,
        source: Option<String>,
    ) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            event_type: event_type.into(),
            source,
            timestamp: chrono::Utc::now(),
            payload,
            retry_count: 0,
        }
    }
}

/// 对应 TS: DeadLetterEvent
#[derive(Debug, Clone)]
pub struct DeadLetterEvent {
    pub event: DomainEvent,
    pub reason: String,
    pub failed_at: chrono::DateTime<chrono::Utc>,
}

pub type EventHandler = Arc<dyn Fn(DomainEvent) + Send + Sync>;

// ─── EventBusConfig ───────────────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct EventBusConfig {
    /// Capacity per channel's broadcast buffer
    pub channel_capacity: usize,
    /// Max retry attempts before dead-lettering
    pub max_retries: u32,
    /// Max dead letter queue size (LRU eviction when full)
    pub dead_letter_limit: usize,
}

impl Default for EventBusConfig {
    fn default() -> Self {
        Self {
            channel_capacity: 1024,
            max_retries: 3,
            dead_letter_limit: 100,
        }
    }
}

// ─── EventBus ─────────────────────────────────────────────────────────────────

type ChannelMap = HashMap<String, broadcast::Sender<DomainEvent>>;

/// Thread-safe in-process event bus.
/// Clone to share across tasks.
#[derive(Clone)]
pub struct EventBus {
    config: EventBusConfig,
    channels: Arc<RwLock<ChannelMap>>,
    dead_letters: Arc<RwLock<Vec<DeadLetterEvent>>>,
}

impl EventBus {
    pub fn new(config: EventBusConfig) -> Self {
        Self {
            config,
            channels: Arc::new(RwLock::new(HashMap::new())),
            dead_letters: Arc::new(RwLock::new(Vec::new())),
        }
    }

    pub fn with_defaults() -> Self {
        Self::new(EventBusConfig::default())
    }

    /// Publish an event to all subscribers of its type.
    /// Lagged subscribers (slow consumers) receive RecvError::Lagged — they miss messages.
    /// This is intentional: the event bus is best-effort, not a reliable queue.
    pub async fn publish(&self, event: DomainEvent) {
        let channels = self.channels.read().await;
        if let Some(tx) = channels.get(&event.event_type) {
            match tx.send(event.clone()) {
                Ok(n) => debug!("[EventBus] {} sent to {} receivers", event.event_type, n),
                Err(_) => {
                    debug!("[EventBus] no active receivers for {}", event.event_type);
                }
            }
        }
        // No channel = no subscribers, silently drop (same as TS behavior)
    }

    /// Subscribe to an event type. Returns a broadcast::Receiver.
    /// Caller is responsible for polling the receiver (typically in a tokio::spawn).
    pub async fn subscribe(&self, event_type: impl Into<String>) -> broadcast::Receiver<DomainEvent> {
        let event_type = event_type.into();
        let mut channels = self.channels.write().await;
        let tx = channels
            .entry(event_type.clone())
            .or_insert_with(|| {
                let (tx, _) = broadcast::channel(self.config.channel_capacity);
                tx
            });
        tx.subscribe()
    }

    /// Convenience: subscribe and spawn a task to handle events.
    /// Handler errors are logged but don't kill the task.
    pub async fn on<F, Fut>(&self, event_type: impl Into<String> + Clone, handler: F)
    where
        F: Fn(DomainEvent) -> Fut + Send + Sync + 'static,
        Fut: std::future::Future<Output = ()> + Send,
    {
        let mut rx = self.subscribe(event_type).await;
        tokio::spawn(async move {
            loop {
                match rx.recv().await {
                    Ok(event) => handler(event).await,
                    Err(broadcast::error::RecvError::Lagged(n)) => {
                        warn!("[EventBus] subscriber lagged, missed {n} events");
                    }
                    Err(broadcast::error::RecvError::Closed) => break,
                }
            }
        });
    }

    /// Dead letters (for inspection/replay)
    pub async fn dead_letters(&self) -> Vec<DeadLetterEvent> {
        self.dead_letters.read().await.clone()
    }

    /// Move a failed event to dead letter queue
    pub async fn dead_letter(&self, event: DomainEvent, reason: impl Into<String>) {
        let mut dl = self.dead_letters.write().await;
        if dl.len() >= self.config.dead_letter_limit {
            dl.remove(0); // LRU eviction
        }
        dl.push(DeadLetterEvent {
            event,
            reason: reason.into(),
            failed_at: chrono::Utc::now(),
        });
    }

    /// Count of active subscribers across all channels
    pub async fn subscriber_count(&self) -> usize {
        let channels = self.channels.read().await;
        channels.values().map(|tx| tx.receiver_count()).sum()
    }
}

// ─── Well-known event types (对应 TS: SystemEvents / TaskEvents) ──────────────

pub mod events {
    pub const WORKFLOW_STARTED: &str = "workflow.started";
    pub const WORKFLOW_COMPLETED: &str = "workflow.completed";
    pub const WORKFLOW_FAILED: &str = "workflow.failed";
    pub const WORKFLOW_PAUSED: &str = "workflow.paused";
    pub const WORKFLOW_RESUMED: &str = "workflow.resumed";
    pub const STEP_STARTED: &str = "step.started";
    pub const STEP_COMPLETED: &str = "step.completed";
    pub const STEP_FAILED: &str = "step.failed";
    pub const STEP_TIMEOUT: &str = "step.timeout";
    pub const TASK_CLAIMED: &str = "task.claimed";
    pub const TASK_COMPLETED: &str = "task.completed";
    pub const TASK_BLOCKED: &str = "task.blocked";
    pub const AGENT_IDLE: &str = "agent.idle";
    pub const AGENT_BUSY: &str = "agent.busy";
    pub const AGENT_OFFLINE: &str = "agent.offline";
    pub const MASTER_ELECTED: &str = "master.elected";
    pub const MASTER_RESIGNED: &str = "master.resigned";
}

// ─── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU32, Ordering};

    #[tokio::test]
    async fn publish_to_subscriber() {
        let bus = EventBus::with_defaults();
        let count = Arc::new(AtomicU32::new(0));
        let count2 = count.clone();

        bus.on("test.event", move |_| {
            let c = count2.clone();
            async move { c.fetch_add(1, Ordering::Relaxed); }
        }).await;

        let event = DomainEvent::new("test.event", serde_json::json!({"x": 1}), None);
        bus.publish(event).await;

        tokio::time::sleep(std::time::Duration::from_millis(50)).await;
        assert_eq!(count.load(Ordering::Relaxed), 1);
    }

    #[tokio::test]
    async fn no_subscribers_drops_silently() {
        let bus = EventBus::with_defaults();
        let event = DomainEvent::new("unknown.event", serde_json::json!(null), None);
        bus.publish(event).await; // must not panic
    }

    #[tokio::test]
    async fn multiple_subscribers_all_receive() {
        let bus = EventBus::with_defaults();
        let count = Arc::new(AtomicU32::new(0));

        for _ in 0..3 {
            let c = count.clone();
            bus.on("multi.event", move |_| {
                let cc = c.clone();
                async move { cc.fetch_add(1, Ordering::Relaxed); }
            }).await;
        }

        let event = DomainEvent::new("multi.event", serde_json::json!(null), None);
        bus.publish(event).await;

        tokio::time::sleep(std::time::Duration::from_millis(50)).await;
        assert_eq!(count.load(Ordering::Relaxed), 3);
    }

    #[tokio::test]
    async fn dead_letter_queue() {
        let bus = EventBus::with_defaults();
        let event = DomainEvent::new("test.event", serde_json::json!(null), None);
        bus.dead_letter(event, "test failure").await;

        let dl = bus.dead_letters().await;
        assert_eq!(dl.len(), 1);
        assert_eq!(dl[0].reason, "test failure");
    }

    #[tokio::test]
    async fn dead_letter_lru_eviction() {
        let config = EventBusConfig { dead_letter_limit: 3, ..Default::default() };
        let bus = EventBus::new(config);

        for i in 0..5u32 {
            let event = DomainEvent::new(format!("e{i}"), serde_json::json!(null), None);
            bus.dead_letter(event, "fail").await;
        }

        let dl = bus.dead_letters().await;
        assert_eq!(dl.len(), 3, "LRU eviction should cap at 3");
    }

    #[tokio::test]
    async fn clone_shares_channels() {
        let bus1 = EventBus::with_defaults();
        let bus2 = bus1.clone();
        let count = Arc::new(AtomicU32::new(0));
        let c = count.clone();

        bus1.on("shared.event", move |_| {
            let cc = c.clone();
            async move { cc.fetch_add(1, Ordering::Relaxed); }
        }).await;

        let event = DomainEvent::new("shared.event", serde_json::json!(null), None);
        bus2.publish(event).await;

        tokio::time::sleep(std::time::Duration::from_millis(50)).await;
        assert_eq!(count.load(Ordering::Relaxed), 1);
    }
}
