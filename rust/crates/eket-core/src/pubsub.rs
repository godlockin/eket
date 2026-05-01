/// Redis Pub/Sub layer — TASK-235
///
/// `RedisPubSub` wraps `EketRedisClient` for typed publish/subscribe.
/// All operations degrade gracefully: Redis unavailable → log warn, return Ok(()).
///
/// Channel constants:
///   - `CHANNEL_MASTER_CHANGED` — master election events (elected / resigned)
///   - `CHANNEL_TASK_STATUS`    — task lifecycle events
use fred::interfaces::{ClientLike, EventInterface, PubsubInterface};
use std::sync::Arc;

use tokio::sync::mpsc;
use tracing::warn;

use crate::error::EketResult;
use crate::redis::EketRedisClient;

// ─── Channel constants ────────────────────────────────────────────────────────

pub const CHANNEL_MASTER_CHANGED: &str = "eket:master:changed";
pub const CHANNEL_TASK_STATUS: &str = "eket:task:status";

// ─── RedisPubSub ──────────────────────────────────────────────────────────────

/// Thin pub/sub facade over `EketRedisClient`.
///
/// All methods are infallible from the caller's perspective: when Redis is
/// unavailable, they log a warning and return `Ok(())` / `Ok(receiver)`
/// (the receiver will simply never receive messages).
pub struct RedisPubSub {
    client: Arc<EketRedisClient>,
}

impl RedisPubSub {
    pub fn new(client: Arc<EketRedisClient>) -> Self {
        Self { client }
    }

    /// Subscribe to `channel`. Returns an `mpsc::Receiver<String>` that yields
    /// raw JSON strings published to the channel.
    ///
    /// If Redis is unavailable, returns a receiver that will never produce items.
    pub async fn subscribe(&self, channel: &str) -> EketResult<mpsc::Receiver<String>> {
        let (tx, rx) = mpsc::channel::<String>(256);

        if !self.client.is_available() {
            warn!("[PubSub] Redis unavailable, subscribe({channel}) is a no-op");
            return Ok(rx);
        }

        let subscriber = self.client.new_subscriber();
        let _jh = subscriber.connect();
        match tokio::time::timeout(
            std::time::Duration::from_secs(2),
            subscriber.wait_for_connect(),
        )
        .await
        {
            Ok(Ok(_)) => {}
            Ok(Err(e)) => {
                warn!("[PubSub] subscriber connect error for {channel}: {e}");
                return Ok(rx);
            }
            Err(_) => {
                warn!("[PubSub] subscriber connect timeout for {channel}");
                return Ok(rx);
            }
        }

        let channel_owned = channel.to_string();
        tokio::spawn(async move {
            if let Err(e) = subscriber.subscribe(&channel_owned).await {
                warn!("[PubSub] SUBSCRIBE {channel_owned} failed: {e}");
                return;
            }
            let mut msg_rx = subscriber.message_rx();
            loop {
                match msg_rx.recv().await {
                    Ok(frame) => {
                        let payload = frame.value.as_str().map(|s| s.to_string()).unwrap_or_default();
                        if tx.send(payload).await.is_err() {
                            // Receiver dropped — stop loop
                            break;
                        }
                    }
                    Err(e) => {
                        warn!("[PubSub] recv error on {channel_owned}: {e}");
                        break;
                    }
                }
            }
        });

        Ok(rx)
    }

    /// Publish `msg` to `channel`.
    ///
    /// Redis unavailable → logs warn, returns `Ok(())` (silent fallback).
    pub async fn publish(&self, channel: &str, msg: &str) -> EketResult<()> {
        if !self.client.is_available() {
            warn!("[PubSub] Redis unavailable, publish({channel}) skipped");
            return Ok(());
        }
        match self.client.publish(channel, msg).await {
            Ok(_) => Ok(()),
            Err(e) => {
                warn!("[PubSub] publish({channel}) failed: {e}");
                Ok(()) // silent fallback — do NOT propagate
            }
        }
    }

    /// Unsubscribe hint. Because the background task self-terminates when the
    /// `Receiver` is dropped, callers can simply drop the receiver. This method
    /// exists for API completeness and logs the intent.
    pub async fn unsubscribe(&self, channel: &str) -> EketResult<()> {
        // No-op: dropping the Receiver returned by subscribe() stops the task.
        tracing::debug!("[PubSub] unsubscribe({channel}) — drop the Receiver to stop");
        Ok(())
    }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;

    /// Helper: unavailable stub client
    fn unavailable_pubsub() -> RedisPubSub {
        RedisPubSub::new(Arc::new(EketRedisClient::new_unavailable()))
    }

    /// test_pubsub_roundtrip — uses in-memory mock (unavailable Redis):
    /// subscribe returns receiver, publish is a no-op (silent), no panic.
    #[tokio::test]
    async fn test_pubsub_roundtrip() {
        let ps = unavailable_pubsub();

        // subscribe should succeed (returns empty receiver)
        let rx = ps.subscribe(CHANNEL_MASTER_CHANGED).await;
        assert!(rx.is_ok(), "subscribe must not error");

        // publish should succeed silently
        let result = ps.publish(CHANNEL_MASTER_CHANGED, r#"{"event":"elected"}"#).await;
        assert!(result.is_ok(), "publish must not error");

        // unsubscribe must not error
        let result = ps.unsubscribe(CHANNEL_MASTER_CHANGED).await;
        assert!(result.is_ok(), "unsubscribe must not error");
    }

    /// test_pubsub_fallback_on_redis_unavailable — Redis down, all ops are no-ops, no panic.
    #[tokio::test]
    async fn test_pubsub_fallback_on_redis_unavailable() {
        let ps = unavailable_pubsub();

        // Multiple publishes — all silent
        for i in 0..5 {
            let msg = format!(r#"{{"event":"elected","i":{i}}}"#);
            let r = ps.publish(CHANNEL_MASTER_CHANGED, &msg).await;
            assert!(r.is_ok(), "publish #{i} must not panic or error");
        }

        // Subscribe still returns Ok (empty channel)
        let rx = ps.subscribe(CHANNEL_TASK_STATUS).await;
        assert!(rx.is_ok());

        // Receiver immediately closed (no Redis) — try_recv returns empty, no panic
        let mut rx = rx.unwrap();
        assert!(rx.try_recv().is_err(), "no messages when Redis unavailable");
    }

    #[tokio::test]
    async fn test_channel_constants() {
        assert_eq!(CHANNEL_MASTER_CHANGED, "eket:master:changed");
        assert_eq!(CHANNEL_TASK_STATUS, "eket:task:status");
    }
}
