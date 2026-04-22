/// Message Queue — 对应 TS: message-queue.ts
///
/// Mode auto: Redis available → redis list queue；否则降级到文件队列
/// 文件队列：.eket/data/queue/<channel>/<id>.json，原子写 + 目录轮询
///
/// ## Semantic Queue Modes (RedisQueue)
///
/// | Mode      | Push          | Poll              | Use case              |
/// |-----------|---------------|-------------------|-----------------------|
/// | TaskQueue | LPUSH         | BRPOP (5s)        | Task dispatch, 1:1    |
/// | EventBus  | PUBLISH       | SUBSCRIBE (async) | Master broadcast, 1:N |

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tokio::sync::{broadcast, Mutex};
use tracing::{debug, info, warn};

use crate::error::{EketError, EketResult};
use crate::redis::EketRedisClient;
use fred::interfaces::{ClientLike, EventInterface, PubsubInterface};

// ─── Message ──────────────────────────────────────────────────────────────────

/// 对应 TS: Message interface (types/index.ts)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Message {
    pub id: String,
    pub timestamp: chrono::DateTime<chrono::Utc>,
    /// Sender instance/slaver ID (TS: from)
    pub from: String,
    /// Recipient instance/channel (TS: to)
    pub to: String,
    pub r#type: String,
    pub priority: MessagePriority,
    pub payload: serde_json::Value,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum MessagePriority {
    Urgent,
    High,
    Normal,
    Low,
}

impl Default for MessagePriority {
    fn default() -> Self { Self::Normal }
}

impl Message {
    pub fn new(
        from: impl Into<String>,
        to: impl Into<String>,
        msg_type: impl Into<String>,
        payload: serde_json::Value,
    ) -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            timestamp: chrono::Utc::now(),
            from: from.into(),
            to: to.into(),
            r#type: msg_type.into(),
            priority: MessagePriority::Normal,
            payload,
        }
    }

    pub fn with_priority(mut self, priority: MessagePriority) -> Self {
        self.priority = priority;
        self
    }
}

// ─── Backend Mode ─────────────────────────────────────────────────────────────

/// Infrastructure backend selection (auto-detected at startup)
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum BackendMode {
    Redis,
    File,
}

// ─── Semantic Queue Mode ──────────────────────────────────────────────────────

/// Semantic queue mode — controls which Redis wire protocol `RedisQueue` uses.
///
/// Default is `TaskQueue` for backward compatibility.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum QueueMode {
    /// LPUSH/BRPOP — task dispatch, guaranteed single-Slaver consumption
    TaskQueue,
    /// PUBLISH/SUBSCRIBE — event notification, Master broadcast fanout
    EventBus,
}

// ─── MessageHandler ───────────────────────────────────────────────────────────

pub type MessageHandler = Arc<dyn Fn(Message) -> futures::future::BoxFuture<'static, ()> + Send + Sync>;

// ─── MessageQueue ─────────────────────────────────────────────────────────────

pub struct MessageQueue {
    mode: BackendMode,
    redis: Option<Arc<EketRedisClient>>,
    queue_dir: PathBuf,
    /// In-process broadcast for file-mode subscriptions
    local_bus: Arc<broadcast::Sender<Message>>,
    /// Active file-mode pollers: channel → abort handle
    pollers: Arc<Mutex<HashMap<String, tokio::task::AbortHandle>>>,
}

impl MessageQueue {
    /// 创建队列，auto 模式：Redis 可用则用 Redis，否则 file
    pub async fn new_auto(
        redis: Option<Arc<EketRedisClient>>,
        queue_dir: impl AsRef<Path>,
    ) -> Self {
        let mode = match &redis {
            Some(r) if r.is_available() => BackendMode::Redis,
            _ => BackendMode::File,
        };
        info!("MessageQueue mode: {:?}", mode);
        let (tx, _) = broadcast::channel(1024);
        Self {
            mode,
            redis,
            queue_dir: queue_dir.as_ref().to_path_buf(),
            local_bus: Arc::new(tx),
            pollers: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub fn mode(&self) -> &BackendMode {
        &self.mode
    }

    /// Publish a message to a channel (channel = msg.to)
    /// 对应 TS: MessageQueue.publish()
    pub async fn publish(&self, msg: Message) -> EketResult<()> {
        match &self.mode {
            BackendMode::Redis => self.publish_redis(msg).await,
            BackendMode::File => self.publish_file(msg).await,
        }
    }

    /// Subscribe to a channel with a handler
    /// 对应 TS: MessageQueue.subscribe()
    pub async fn subscribe(&self, channel: String, handler: MessageHandler) -> EketResult<()> {
        match &self.mode {
            BackendMode::Redis => self.subscribe_redis(channel, handler).await,
            BackendMode::File => self.subscribe_file(channel, handler).await,
        }
    }

    /// Unsubscribe from a channel
    pub async fn unsubscribe(&self, channel: &str) {
        let mut pollers = self.pollers.lock().await;
        if let Some(handle) = pollers.remove(channel) {
            handle.abort();
            debug!("Unsubscribed from channel: {channel}");
        }
    }

    // ── Redis impl ────────────────────────────────────────────────────────────

    async fn publish_redis(&self, msg: Message) -> EketResult<()> {
        let redis = self.redis.as_ref().ok_or_else(|| EketError::Other("no Redis".into()))?;
        let channel = msg.to.clone();
        let json = serde_json::to_string(&msg)?;
        let key = format!("eket:queue:{channel}");
        redis.lpush(&key, &json).await?;
        debug!("Published to Redis channel {channel}: {}", msg.id);
        Ok(())
    }

    async fn subscribe_redis(&self, channel: String, handler: MessageHandler) -> EketResult<()> {
        let redis = self.redis.clone().ok_or_else(|| EketError::Other("no Redis".into()))?;
        let key = format!("eket:queue:{channel}");
        let tx = self.local_bus.clone();
        let channel_name = channel.clone();

        let handle = tokio::spawn(async move {
            loop {
                match redis.rpop(&key).await {
                    Ok(Some(json)) => {
                        if let Ok(msg) = serde_json::from_str::<Message>(&json) {
                            let _ = tx.send(msg.clone());
                            handler(msg).await;
                        }
                    }
                    Ok(None) => {
                        tokio::time::sleep(Duration::from_millis(200)).await;
                    }
                    Err(e) => {
                        warn!("Redis poll error for {channel_name}: {e}");
                        tokio::time::sleep(Duration::from_secs(1)).await;
                    }
                }
            }
        });

        self.pollers.lock().await.insert(channel.clone(), handle.abort_handle());
        Ok(())
    }

    // ── File impl ─────────────────────────────────────────────────────────────

    async fn publish_file(&self, msg: Message) -> EketResult<()> {
        let channel = msg.to.clone();
        let dir = self.queue_dir.join(&channel);
        tokio::fs::create_dir_all(&dir).await?;
        let file = dir.join(format!("{}.json", msg.id));
        let json = serde_json::to_string_pretty(&msg)?;
        // Atomic write: write to tmp then rename
        let tmp = dir.join(format!(".{}.tmp", msg.id));
        tokio::fs::write(&tmp, &json).await?;
        // rename() fails with EXDEV when tmp and dst are on different filesystems.
        // Fall back to copy+delete in that case.
        if let Err(e) = tokio::fs::rename(&tmp, &file).await {
            // EXDEV = 18 on Linux/macOS (cross-device link)
            if e.raw_os_error() == Some(18) {
                tokio::fs::copy(&tmp, &file).await?;
                tokio::fs::remove_file(&tmp).await?;
            } else {
                return Err(EketError::Io(e));
            }
        }
        debug!("Published to file channel {channel}: {}", msg.id);
        // Broadcast locally for in-process subscribers (ignore lagged/no-receiver errors)
        let _ = self.local_bus.send(msg);
        Ok(())
    }

    async fn subscribe_file(&self, channel: String, handler: MessageHandler) -> EketResult<()> {
        let dir = self.queue_dir.join(&channel);
        tokio::fs::create_dir_all(&dir).await?;
        let channel_name = channel.clone();

        let handle = tokio::spawn(async move {
            loop {
                match tokio::fs::read_dir(&dir).await {
                    Ok(mut entries) => {
                        let mut files: Vec<PathBuf> = Vec::new();
                        while let Ok(Some(entry)) = entries.next_entry().await {
                            let p = entry.path();
                            if p.extension().map(|e| e == "json").unwrap_or(false) {
                                files.push(p);
                            }
                        }
                        files.sort();
                        for file in files {
                            if let Ok(content) = tokio::fs::read_to_string(&file).await {
                                if let Ok(msg) = serde_json::from_str::<Message>(&content) {
                                    // Delete BEFORE calling handler: if delete fails, skip (message
                                    // stays in queue for retry). This prevents double-processing on
                                    // panic/crash between read and delete.
                                    if tokio::fs::remove_file(&file).await.is_ok() {
                                        handler(msg).await;
                                    }
                                }
                            }
                        }
                    }
                    Err(e) => warn!("File queue read error for {channel_name}: {e}"),
                }
                tokio::time::sleep(Duration::from_millis(200)).await;
            }
        });

        self.pollers.lock().await.insert(channel.clone(), handle.abort_handle());
        Ok(())
    }
}

// ─── RedisQueue ───────────────────────────────────────────────────────────────

/// Semantic Redis queue that unifies task dispatch and event broadcast under a
/// single `push`/`poll` interface.
///
/// | Mode      | push()  | poll()           |
/// |-----------|---------|------------------|
/// | TaskQueue | LPUSH   | BRPOP (5s)       |
/// | EventBus  | PUBLISH | SUBSCRIBE (async)|
pub struct RedisQueue {
    redis: Arc<EketRedisClient>,
    mode: QueueMode,
}

impl RedisQueue {
    /// Create with explicit mode.
    pub fn new(redis: Arc<EketRedisClient>, mode: QueueMode) -> Self {
        Self { redis, mode }
    }

    /// Create in TaskQueue mode — backward-compatible default.
    pub fn new_task_queue(redis: Arc<EketRedisClient>) -> Self {
        Self::new(redis, QueueMode::TaskQueue)
    }

    /// Create in EventBus mode.
    pub fn new_event_bus(redis: Arc<EketRedisClient>) -> Self {
        Self::new(redis, QueueMode::EventBus)
    }

    pub fn queue_mode(&self) -> &QueueMode {
        &self.mode
    }

    /// Push a message to `key`.
    ///
    /// - `TaskQueue` → `LPUSH key message`
    /// - `EventBus`  → `PUBLISH channel message`
    pub async fn push(&self, key: &str, message: &str) -> EketResult<()> {
        match &self.mode {
            QueueMode::TaskQueue => {
                self.redis.lpush(key, message).await?;
                debug!("RedisQueue(TaskQueue) LPUSH {key}");
                Ok(())
            }
            QueueMode::EventBus => {
                let receivers = self.redis.publish(key, message).await?;
                debug!("RedisQueue(EventBus) PUBLISH {key} → {receivers} subscriber(s)");
                Ok(())
            }
        }
    }

    /// Poll / receive from `key`.
    ///
    /// - `TaskQueue` → `BRPOP key 5` (blocks up to 5 s) → returns message or `None` on timeout.
    /// - `EventBus`  → spawns a background SUBSCRIBE loop, delivers each message to `handler`.
    ///   Returns `Ok(None)` immediately (fire-and-forget subscription).
    pub async fn poll(
        &self,
        key: &str,
        handler: Option<MessageHandler>,
    ) -> EketResult<Option<String>> {
        match &self.mode {
            QueueMode::TaskQueue => {
                let result = self.redis.brpop(key, 5.0).await?;
                debug!("RedisQueue(TaskQueue) BRPOP {key} → {:?}", result.as_deref());
                Ok(result)
            }
            QueueMode::EventBus => {
                let handler = handler.ok_or_else(|| {
                    EketError::Other("EventBus poll requires a handler".into())
                })?;
                let subscriber = self.redis.new_subscriber();
                let _jh = subscriber.connect();
                subscriber.wait_for_connect().await
                    .map_err(|e| EketError::Redis(e.to_string()))?;
                let key = key.to_string();
                tokio::spawn(async move {
                    if let Err(e) = subscriber.subscribe(&key).await {
                        warn!("SUBSCRIBE {key} failed: {e}");
                        return;
                    }
                    let mut rx = subscriber.message_rx();
                    loop {
                        match rx.recv().await {
                            Ok(frame) => {
                                let json = frame.value.as_str().map(|s| s.to_string()).unwrap_or_default();
                                if let Ok(msg) = serde_json::from_str::<Message>(&json) {
                                    handler(msg).await;
                                } else {
                                    warn!("EventBus: invalid JSON on channel {}", frame.channel);
                                }
                            }
                            Err(e) => {
                                warn!("EventBus recv error: {e}");
                                break;
                            }
                        }
                    }
                });
                Ok(None)
            }
        }
    }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU32, Ordering};
    use tempfile::TempDir;

    #[tokio::test]
    async fn file_queue_publish_subscribe() {
        let dir = TempDir::new().unwrap();
        let q = MessageQueue::new_auto(None, dir.path()).await;
        assert_eq!(q.mode(), &BackendMode::File);

        let counter = Arc::new(AtomicU32::new(0));
        let counter2 = counter.clone();

        let handler: MessageHandler = Arc::new(move |_msg| {
            counter2.fetch_add(1, Ordering::Relaxed);
            Box::pin(async {})
        });

        q.subscribe("test-channel".to_string(), handler).await.unwrap();

        let msg = Message::new("slaver_1", "test-channel", "test", serde_json::json!({"hello": "world"}));
        q.publish(msg).await.unwrap();

        // Give poller time to pick up
        tokio::time::sleep(Duration::from_millis(500)).await;
        assert_eq!(counter.load(Ordering::Relaxed), 1);
    }

    #[tokio::test]
    async fn file_queue_multiple_messages() {
        let dir = TempDir::new().unwrap();
        let q = MessageQueue::new_auto(None, dir.path()).await;
        let counter = Arc::new(AtomicU32::new(0));
        let counter2 = counter.clone();

        let handler: MessageHandler = Arc::new(move |_| {
            counter2.fetch_add(1, Ordering::Relaxed);
            Box::pin(async {})
        });

        q.subscribe("bulk".to_string(), handler).await.unwrap();

        for i in 0..5 {
            let msg = Message::new("slaver_1", "bulk", "item", serde_json::json!({"i": i}));
            q.publish(msg).await.unwrap();
        }

        tokio::time::sleep(Duration::from_millis(800)).await;
        assert_eq!(counter.load(Ordering::Relaxed), 5);
    }

    #[tokio::test]
    async fn file_queue_no_duplicate_delivery() {
        // Verifies delete-before-handler: each message delivered exactly once
        let dir = TempDir::new().unwrap();
        let q = MessageQueue::new_auto(None, dir.path()).await;
        let counter = Arc::new(AtomicU32::new(0));
        let counter2 = counter.clone();

        let handler: MessageHandler = Arc::new(move |_| {
            counter2.fetch_add(1, Ordering::Relaxed);
            Box::pin(async {})
        });

        q.subscribe("dedup".to_string(), handler).await.unwrap();
        let msg = Message::new("slaver_1", "dedup", "test", serde_json::json!(null));
        q.publish(msg).await.unwrap();

        tokio::time::sleep(Duration::from_millis(600)).await;
        tokio::time::sleep(Duration::from_millis(400)).await;
        assert_eq!(counter.load(Ordering::Relaxed), 1, "message should be delivered exactly once");
    }

    #[tokio::test]
    async fn unsubscribe_stops_poller() {
        let dir = TempDir::new().unwrap();
        let q = MessageQueue::new_auto(None, dir.path()).await;
        let counter = Arc::new(AtomicU32::new(0));
        let counter2 = counter.clone();

        let handler: MessageHandler = Arc::new(move |_| {
            counter2.fetch_add(1, Ordering::Relaxed);
            Box::pin(async {})
        });

        q.subscribe("unsub-ch".to_string(), handler).await.unwrap();
        q.unsubscribe("unsub-ch").await;

        let msg = Message::new("slaver_1", "unsub-ch", "test", serde_json::json!(null));
        q.publish(msg).await.unwrap();

        tokio::time::sleep(Duration::from_millis(500)).await;
        assert_eq!(counter.load(Ordering::Relaxed), 0, "no delivery after unsubscribe");
    }

    #[tokio::test]
    async fn redis_queue_mode_defaults_to_task_queue() {
        let redis = Arc::new(EketRedisClient::new_unavailable());
        let q = RedisQueue::new_task_queue(redis);
        assert_eq!(q.queue_mode(), &QueueMode::TaskQueue);
    }

    #[tokio::test]
    async fn redis_queue_event_bus_mode() {
        let redis = Arc::new(EketRedisClient::new_unavailable());
        let q = RedisQueue::new_event_bus(redis);
        assert_eq!(q.queue_mode(), &QueueMode::EventBus);
    }
}
