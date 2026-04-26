/// MailboxContextFilter — 三段式上下文裁剪
///
/// Phase 1 (Relevance): Drop messages older than N turns OR relevance_score < threshold
/// Phase 2 (Dedup): Collapse consecutive same-sender messages with >85% similar content
/// Phase 3 (SlidingWindow): Keep last K messages, always preserve system/task/tool_result
use crate::mailbox::{MailboxMessage, MailboxMessageType};

// ─── Config ──────────────────────────────────────────────────────────────────

/// Exponential decay configuration for recency weighting.
#[derive(Debug, Clone)]
pub struct DecayConfig {
    /// Half-life in seconds (messages: 3d=259200s, knowledge: 14d=1209600s)
    pub half_life_secs: u64,
    /// Minimum weight floor (default 0.1)
    pub floor: f32,
}

impl Default for DecayConfig {
    fn default() -> Self {
        Self {
            half_life_secs: 259_200, // 3 days
            floor: 0.1,
        }
    }
}

/// Compute decay weight: floor + (1 - floor) * 0.5^(age / half_life)
pub fn decay(age_secs: u64, config: &DecayConfig) -> f32 {
    let exponent = age_secs as f64 / config.half_life_secs as f64;
    let weight = config.floor as f64 + (1.0 - config.floor as f64) * 0.5_f64.powf(exponent);
    weight as f32
}

#[derive(Debug, Clone)]
pub struct MailboxContextFilter {
    /// Phase 1: drop messages older than this many positions from end
    pub max_age_turns: usize,
    /// Phase 1: drop messages with relevance_score below this (0.0–1.0)
    /// relevance_score is read from payload["relevance_score"] if present, else 1.0
    pub relevance_threshold: f32,
    /// Phase 3: sliding window size (number of messages to keep)
    pub window_size: usize,
    /// Optional decay config; None = original hard-threshold behavior
    pub decay_config: Option<DecayConfig>,
}

impl Default for MailboxContextFilter {
    fn default() -> Self {
        Self {
            max_age_turns: 50,
            relevance_threshold: 0.3,
            window_size: 20,
            decay_config: None,
        }
    }
}

// ─── Preserved message check ─────────────────────────────────────────────────

fn is_preserved(msg: &MailboxMessage) -> bool {
    matches!(
        msg.message_type,
        MailboxMessageType::TaskAssigned | MailboxMessageType::Shutdown
    ) || is_system_message(msg)
        || has_tool_result(msg)
}

fn is_system_message(msg: &MailboxMessage) -> bool {
    // Custom("system") or from == "system"
    msg.from == "system"
        || matches!(&msg.message_type, MailboxMessageType::Custom(s) if s == "system")
}

fn has_tool_result(msg: &MailboxMessage) -> bool {
    msg.payload.get("tool_result").is_some()
        || matches!(&msg.message_type, MailboxMessageType::Custom(s) if s == "tool_result")
}

// ─── Similarity (edit distance ratio) ────────────────────────────────────────

/// Simple Levenshtein-based similarity: 1.0 = identical
fn similarity(a: &str, b: &str) -> f32 {
    if a == b {
        return 1.0;
    }
    let max_len = a.len().max(b.len());
    if max_len == 0 {
        return 1.0;
    }
    let dist = levenshtein(a, b);
    1.0 - (dist as f32 / max_len as f32)
}

fn levenshtein(a: &str, b: &str) -> usize {
    let a: Vec<char> = a.chars().collect();
    let b: Vec<char> = b.chars().collect();
    let (m, n) = (a.len(), b.len());
    let mut dp = vec![vec![0usize; n + 1]; m + 1];
    for i in 0..=m {
        dp[i][0] = i;
    }
    for j in 0..=n {
        dp[0][j] = j;
    }
    for i in 1..=m {
        for j in 1..=n {
            dp[i][j] = if a[i - 1] == b[j - 1] {
                dp[i - 1][j - 1]
            } else {
                1 + dp[i - 1][j].min(dp[i][j - 1]).min(dp[i - 1][j - 1])
            };
        }
    }
    dp[m][n]
}

fn payload_text(msg: &MailboxMessage) -> String {
    msg.payload.to_string()
}

// ─── Filter pipeline ─────────────────────────────────────────────────────────

impl MailboxContextFilter {
    pub fn new(max_age_turns: usize, relevance_threshold: f32, window_size: usize) -> Self {
        Self {
            max_age_turns,
            relevance_threshold,
            window_size,
            decay_config: None,
        }
    }

    /// Builder: enable recency decay with given half-life and floor.
    pub fn with_decay(mut self, half_life_secs: u64, floor: f32) -> Self {
        self.decay_config = Some(DecayConfig { half_life_secs, floor });
        self
    }

    pub fn filter(&self, messages: &[MailboxMessage]) -> Vec<MailboxMessage> {
        let after_phase1 = self.phase1_relevance(messages);
        let after_phase2 = self.phase2_dedup(&after_phase1);
        self.phase3_sliding_window(&after_phase2)
    }

    // Phase 1: relevance filter
    fn phase1_relevance(&self, messages: &[MailboxMessage]) -> Vec<MailboxMessage> {
        let total = messages.len();
        messages
            .iter()
            .enumerate()
            .filter(|(idx, msg)| {
                // Always preserve important messages
                if is_preserved(msg) {
                    return true;
                }
                // Age check: position from end (0 = newest)
                let age = total.saturating_sub(idx + 1);
                if age >= self.max_age_turns {
                    return false;
                }
                // Relevance score from payload
                let score = msg
                    .payload
                    .get("relevance_score")
                    .and_then(|v| v.as_f64())
                    .map(|v| v as f32)
                    .unwrap_or(1.0);
                // Apply decay if configured
                let effective_score = if let Some(ref dc) = self.decay_config {
                    let age_secs = msg
                        .payload
                        .get("age_secs")
                        .and_then(|v| v.as_u64())
                        .unwrap_or(0);
                    score * decay(age_secs, dc)
                } else {
                    score
                };
                effective_score >= self.relevance_threshold
            })
            .map(|(_, m)| m.clone())
            .collect()
    }

    // Phase 2: dedup consecutive same-sender similar-content
    fn phase2_dedup(&self, messages: &[MailboxMessage]) -> Vec<MailboxMessage> {
        let mut result: Vec<MailboxMessage> = Vec::new();
        for msg in messages {
            if is_preserved(msg) {
                result.push(msg.clone());
                continue;
            }
            // Check last message from same sender
            if let Some(prev) = result.iter().rev().find(|m| m.from == msg.from) {
                let sim = similarity(&payload_text(prev), &payload_text(msg));
                if sim > 0.85 {
                    // Skip duplicate
                    continue;
                }
            }
            result.push(msg.clone());
        }
        result
    }

    // Phase 3: sliding window — keep last window_size, but always preserve important
    fn phase3_sliding_window(&self, messages: &[MailboxMessage]) -> Vec<MailboxMessage> {
        if messages.len() <= self.window_size {
            return messages.to_vec();
        }
        // Collect preserved indices
        let preserved: Vec<usize> = messages
            .iter()
            .enumerate()
            .filter(|(_, m)| is_preserved(m))
            .map(|(i, _)| i)
            .collect();

        // Take last window_size
        let window_start = messages.len().saturating_sub(self.window_size);
        let mut indices: std::collections::BTreeSet<usize> = (window_start..messages.len()).collect();

        // Add preserved indices
        for i in preserved {
            indices.insert(i);
        }

        indices.iter().map(|&i| messages[i].clone()).collect()
    }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn msg(from: &str, mtype: MailboxMessageType, payload: serde_json::Value) -> MailboxMessage {
        MailboxMessage::new(from, "agent", mtype, payload)
    }

    fn regular(from: &str) -> MailboxMessage {
        msg(from, MailboxMessageType::Custom("chat".into()), json!({"text": "hello world"}))
    }

    fn with_relevance(from: &str, score: f64) -> MailboxMessage {
        msg(
            from,
            MailboxMessageType::Custom("chat".into()),
            json!({"relevance_score": score, "text": "some content"}),
        )
    }

    fn task_assigned(from: &str) -> MailboxMessage {
        msg(from, MailboxMessageType::TaskAssigned, json!({"task": "do something"}))
    }

    fn system_msg() -> MailboxMessage {
        msg("system", MailboxMessageType::Custom("system".into()), json!({"text": "init"}))
    }

    fn tool_result_msg(from: &str) -> MailboxMessage {
        msg(
            from,
            MailboxMessageType::Custom("chat".into()),
            json!({"tool_result": {"output": "ok"}}),
        )
    }

    // ── Phase 1 tests ──────────────────────────────────────────────────────

    #[test]
    fn phase1_drops_old_messages() {
        let filter = MailboxContextFilter::new(3, 0.0, 100);
        // 6 messages, max_age_turns=3 → keep last 3
        let messages: Vec<_> = (0..6).map(|i| {
            msg("a", MailboxMessageType::Custom("chat".into()), json!({"i": i}))
        }).collect();

        let result = filter.phase1_relevance(&messages);
        // Last 3 should remain (indices 3,4,5)
        assert_eq!(result.len(), 3);
    }

    #[test]
    fn phase1_preserves_task_assigned_regardless_of_age() {
        let filter = MailboxContextFilter::new(2, 0.0, 100);
        let mut messages: Vec<_> = (0..5).map(|_| regular("a")).collect();
        messages.insert(0, task_assigned("master")); // index 0, age=5 > max_age_turns=2

        let result = filter.phase1_relevance(&messages);
        // task_assigned is preserved
        assert!(result.iter().any(|m| m.message_type == MailboxMessageType::TaskAssigned));
    }

    #[test]
    fn phase1_drops_low_relevance() {
        let filter = MailboxContextFilter::new(100, 0.5, 100);
        let messages = vec![
            with_relevance("a", 0.8),
            with_relevance("b", 0.2), // below threshold
            with_relevance("c", 0.6),
        ];
        let result = filter.phase1_relevance(&messages);
        assert_eq!(result.len(), 2);
        assert!(result.iter().all(|m| {
            m.payload["relevance_score"].as_f64().unwrap_or(1.0) >= 0.5
        }));
    }

    #[test]
    fn phase1_preserves_system_messages_low_relevance() {
        let filter = MailboxContextFilter::new(100, 0.9, 100);
        let mut s = system_msg();
        // Set low relevance score — should still be preserved
        s.payload = json!({"relevance_score": 0.1, "text": "system"});
        let messages = vec![s];
        let result = filter.phase1_relevance(&messages);
        assert_eq!(result.len(), 1);
    }

    // ── Phase 2 tests ──────────────────────────────────────────────────────

    #[test]
    fn phase2_collapses_identical_consecutive_same_sender() {
        let filter = MailboxContextFilter::default();
        let messages = vec![
            msg("a", MailboxMessageType::Custom("chat".into()), json!({"text": "ping"})),
            msg("a", MailboxMessageType::Custom("chat".into()), json!({"text": "ping"})),
            msg("a", MailboxMessageType::Custom("chat".into()), json!({"text": "ping"})),
        ];
        let result = filter.phase2_dedup(&messages);
        assert_eq!(result.len(), 1);
    }

    #[test]
    fn phase2_keeps_different_senders() {
        let filter = MailboxContextFilter::default();
        let messages = vec![
            msg("a", MailboxMessageType::Custom("chat".into()), json!({"text": "ping"})),
            msg("b", MailboxMessageType::Custom("chat".into()), json!({"text": "ping"})),
        ];
        let result = filter.phase2_dedup(&messages);
        assert_eq!(result.len(), 2);
    }

    #[test]
    fn phase2_keeps_dissimilar_messages_same_sender() {
        let filter = MailboxContextFilter::default();
        let messages = vec![
            msg("a", MailboxMessageType::Custom("chat".into()), json!({"text": "hello world this is message one"})),
            msg("a", MailboxMessageType::Custom("chat".into()), json!({"text": "completely different task assignment with totally new content"})),
        ];
        let result = filter.phase2_dedup(&messages);
        assert_eq!(result.len(), 2);
    }

    #[test]
    fn phase2_never_deduplicates_preserved_messages() {
        let filter = MailboxContextFilter::default();
        let messages = vec![
            task_assigned("master"),
            task_assigned("master"),
        ];
        let result = filter.phase2_dedup(&messages);
        // Both preserved messages kept
        assert_eq!(result.len(), 2);
    }

    // ── Phase 3 tests ──────────────────────────────────────────────────────

    #[test]
    fn phase3_keeps_last_k_messages() {
        let filter = MailboxContextFilter::new(100, 0.0, 5);
        let messages: Vec<_> = (0..10).map(|i| {
            msg("a", MailboxMessageType::Custom("chat".into()), json!({"i": i}))
        }).collect();
        let result = filter.phase3_sliding_window(&messages);
        assert_eq!(result.len(), 5);
        // Last 5 payloads
        let indices: Vec<u64> = result.iter()
            .map(|m| m.payload["i"].as_u64().unwrap())
            .collect();
        assert_eq!(indices, vec![5, 6, 7, 8, 9]);
    }

    #[test]
    fn phase3_preserves_task_assigned_outside_window() {
        let filter = MailboxContextFilter::new(100, 0.0, 3);
        let mut messages: Vec<_> = (0..6).map(|i| {
            msg("a", MailboxMessageType::Custom("chat".into()), json!({"i": i}))
        }).collect();
        // Insert task_assigned at position 0 (outside window)
        messages.insert(0, task_assigned("master"));

        let result = filter.phase3_sliding_window(&messages);
        assert!(result.iter().any(|m| m.message_type == MailboxMessageType::TaskAssigned));
    }

    #[test]
    fn phase3_preserves_system_messages_outside_window() {
        let filter = MailboxContextFilter::new(100, 0.0, 3);
        let mut messages: Vec<_> = (0..6).map(|i| {
            msg("a", MailboxMessageType::Custom("chat".into()), json!({"i": i}))
        }).collect();
        messages.insert(0, system_msg());

        let result = filter.phase3_sliding_window(&messages);
        assert!(result.iter().any(|m| m.from == "system"));
    }

    #[test]
    fn phase3_preserves_tool_result_outside_window() {
        let filter = MailboxContextFilter::new(100, 0.0, 3);
        let mut messages: Vec<_> = (0..6).map(|i| {
            msg("a", MailboxMessageType::Custom("chat".into()), json!({"i": i}))
        }).collect();
        messages.insert(0, tool_result_msg("agent"));

        let result = filter.phase3_sliding_window(&messages);
        assert!(result.iter().any(|m| m.payload.get("tool_result").is_some()));
    }

    // ── Decay tests ────────────────────────────────────────────────────────

    fn with_age_secs(from: &str, score: f64, age_secs: u64) -> MailboxMessage {
        msg(
            from,
            MailboxMessageType::Custom("chat".into()),
            json!({"relevance_score": score, "age_secs": age_secs, "text": "content"}),
        )
    }

    #[test]
    fn decay_within_half_life_gt_half() {
        let config = DecayConfig { half_life_secs: 3600, floor: 0.1 };
        let w = decay(1800, &config); // half of half-life → ~0.577
        assert!(w > 0.5, "weight within half-life should be > 0.5, got {w}");
    }

    #[test]
    fn decay_three_half_lives_near_floor() {
        let config = DecayConfig { half_life_secs: 3600, floor: 0.1 };
        let w = decay(10800, &config); // 3× half-life → 0.1 + 0.9×0.125 ≈ 0.2125
        assert!(w < 0.25, "weight at 3× half-life should be near floor, got {w}");
    }

    #[test]
    fn decay_config_none_behavior_unchanged() {
        // Without decay, filter uses raw relevance_score
        let filter = MailboxContextFilter::new(100, 0.5, 100);
        let messages = vec![
            with_age_secs("a", 0.8, 999999), // high age_secs but no decay applied
            with_age_secs("b", 0.2, 0),      // low score, dropped
        ];
        let result = filter.phase1_relevance(&messages);
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].payload["relevance_score"].as_f64().unwrap(), 0.8);
    }

    #[test]
    fn decay_drops_old_message_with_low_effective_score() {
        // half_life=3600, floor=0.1, age=7200 (2 half-lives) → decay≈0.325
        // score=0.8 → effective=0.8×0.325≈0.26 < threshold=0.3 → dropped
        let filter = MailboxContextFilter::new(100, 0.3, 100)
            .with_decay(3600, 0.1);
        let messages = vec![
            with_age_secs("a", 0.8, 7200),
        ];
        let result = filter.phase1_relevance(&messages);
        assert_eq!(result.len(), 0, "old message with low effective_score should be dropped");
    }

    #[test]
    fn decay_preserves_p0_messages_unaffected() {
        let filter = MailboxContextFilter::new(100, 0.9, 100)
            .with_decay(1, 0.0); // extreme decay
        let mut ta = task_assigned("master");
        ta.payload = json!({"task": "do something", "age_secs": 999999999});
        let messages = vec![ta];
        let result = filter.phase1_relevance(&messages);
        assert_eq!(result.len(), 1, "TaskAssigned must never be filtered by decay");
    }

    // ── Full pipeline test ─────────────────────────────────────────────────

    #[test]
    fn full_pipeline_reduces_messages() {
        let filter = MailboxContextFilter::new(10, 0.5, 5);

        let mut messages: Vec<MailboxMessage> = Vec::new();

        // Add task_assigned (preserved)
        messages.push(task_assigned("master"));

        // Add 20 low-relevance messages (should be filtered by phase 1)
        for _ in 0..20 {
            messages.push(with_relevance("a", 0.1));
        }

        // Add 5 normal messages
        for i in 0..5 {
            messages.push(msg(
                "b",
                MailboxMessageType::Custom("chat".into()),
                json!({"text": format!("message {i}")}),
            ));
        }

        let result = filter.filter(&messages);

        // task_assigned always preserved
        assert!(result.iter().any(|m| m.message_type == MailboxMessageType::TaskAssigned));
        // Total should be <= window_size + preserved_outside_window
        assert!(result.len() <= 10); // at most window(5) + task_assigned
    }
}
