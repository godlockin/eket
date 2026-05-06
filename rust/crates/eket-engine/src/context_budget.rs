/// ContextBudgetApplier — 4-phase context data trimming pipeline.
///
/// Phase order: exclude_tool_outputs → include_fields → keep_recent_n → max_tokens
use std::collections::HashMap;

use serde_json::Value;

use crate::workflow::{ContextBudget, estimate_value_tokens};

/// Metadata keys that must never be removed by max_tokens trimming.
const METADATA_KEYS: &[&str] = &["task_id", "step_id", "instance_id", "workflow_id"];

/// Apply all budget rules to `data` in the canonical 4-phase order.
pub fn apply_budget(data: &mut HashMap<String, Value>, budget: &ContextBudget) {
    // Phase 1: exclude tool outputs
    if budget.exclude_tool_outputs {
        exclude_tool_outputs(data);
    }

    // Phase 2: include_fields whitelist
    if let Some(fields) = &budget.include_fields {
        include_fields(data, fields);
    }

    // Phase 3: keep_recent_n on history array
    if let Some(n) = budget.keep_recent_n {
        keep_recent_n(data, n);
    }

    // Phase 4: max_tokens budget enforcement
    if let Some(max) = budget.max_tokens {
        trim_to_max_tokens(data, max);
    }
}

/// Phase 1: remove keys containing "tool_output" or "tool_result".
fn exclude_tool_outputs(data: &mut HashMap<String, Value>) {
    data.retain(|k, _| !k.contains("tool_output") && !k.contains("tool_result"));
}

/// Phase 2: keep only whitelisted keys (METADATA_KEYS always preserved).
fn include_fields(data: &mut HashMap<String, Value>, fields: &[String]) {
    data.retain(|k, _| fields.contains(k) || METADATA_KEYS.contains(&k.as_str()));
}

/// Phase 3: if data["history"] is an Array, keep only the last N items.
fn keep_recent_n(data: &mut HashMap<String, Value>, n: usize) {
    if let Some(Value::Array(arr)) = data.get_mut("history") {
        let len = arr.len();
        if len > n {
            *arr = arr.split_off(len - n);
        }
    }
}

/// Phase 4: estimate total tokens; if exceeded, remove largest non-metadata fields first.
fn trim_to_max_tokens(data: &mut HashMap<String, Value>, max_tokens: usize) {
    loop {
        let total: usize = data.values().map(estimate_value_tokens).sum();
        if total <= max_tokens {
            break;
        }

        // Find largest removable key
        let candidate = data
            .iter()
            .filter(|(k, _)| !METADATA_KEYS.contains(&k.as_str()))
            .max_by_key(|(_, v)| estimate_value_tokens(v))
            .map(|(k, _)| k.clone());

        match candidate {
            Some(key) => {
                data.remove(&key);
            }
            None => break, // only metadata keys remain — cannot trim further
        }
    }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn make_data(pairs: &[(&str, Value)]) -> HashMap<String, Value> {
        pairs.iter().map(|(k, v)| (k.to_string(), v.clone())).collect()
    }

    #[test]
    fn test_exclude_tool_outputs() {
        let mut data = make_data(&[
            ("tool_output_1", json!("big result")),
            ("tool_result_search", json!([1, 2, 3])),
            ("user_message", json!("hello")),
        ]);
        let budget = ContextBudget { exclude_tool_outputs: true, ..Default::default() };
        apply_budget(&mut data, &budget);
        assert!(!data.contains_key("tool_output_1"));
        assert!(!data.contains_key("tool_result_search"));
        assert!(data.contains_key("user_message"));
    }

    #[test]
    fn test_include_fields_whitelist() {
        let mut data = make_data(&[
            ("keep_me", json!("yes")),
            ("drop_me", json!("no")),
            ("also_drop", json!(42)),
        ]);
        let budget = ContextBudget {
            include_fields: Some(vec!["keep_me".to_string()]),
            ..Default::default()
        };
        apply_budget(&mut data, &budget);
        assert!(data.contains_key("keep_me"));
        assert!(!data.contains_key("drop_me"));
        assert!(!data.contains_key("also_drop"));
    }

    #[test]
    fn test_keep_recent_n_truncates_history() {
        let history = json!([1, 2, 3, 4, 5]);
        let mut data = make_data(&[("history", history)]);
        let budget = ContextBudget { keep_recent_n: Some(3), ..Default::default() };
        apply_budget(&mut data, &budget);
        let arr = data["history"].as_array().unwrap();
        assert_eq!(arr.len(), 3);
        assert_eq!(arr[0], json!(3));
        assert_eq!(arr[2], json!(5));
    }

    #[test]
    fn test_max_tokens_trims_large_fields() {
        // A large string field (~50 tokens) + small field
        let large_str = "x".repeat(200); // 200 chars ≈ 50 tokens
        let mut data = make_data(&[
            ("large_field", json!(large_str)),
            ("small_field", json!("tiny")),
        ]);
        // Set max_tokens very small so large_field must be removed
        let budget = ContextBudget { max_tokens: Some(5), ..Default::default() };
        apply_budget(&mut data, &budget);
        assert!(!data.contains_key("large_field"), "large_field should be trimmed");
    }

    #[test]
    fn test_metadata_keys_not_removed_by_max_tokens() {
        let large_str = "y".repeat(400); // ≈ 100 tokens
        let mut data = make_data(&[
            ("task_id", json!("t-001")),
            ("step_id", json!("s-001")),
            ("instance_id", json!("i-001")),
            ("workflow_id", json!("w-001")),
            ("big_removable", json!(large_str)),
        ]);
        let budget = ContextBudget { max_tokens: Some(20), ..Default::default() };
        apply_budget(&mut data, &budget);
        // All metadata keys must survive
        assert!(data.contains_key("task_id"));
        assert!(data.contains_key("step_id"));
        assert!(data.contains_key("instance_id"));
        assert!(data.contains_key("workflow_id"));
        // big_removable should be gone
        assert!(!data.contains_key("big_removable"));
    }

    #[test]
    fn test_include_fields_preserves_metadata_keys() {
        let mut data = make_data(&[
            ("task_id", json!("t-001")),
            ("step_id", json!("s-001")),
            ("instance_id", json!("i-001")),
            ("workflow_id", json!("w-001")),
            ("history", json!(["msg1", "msg2"])),
            ("drop_me", json!("gone")),
        ]);
        let budget = ContextBudget {
            include_fields: Some(vec!["history".to_string()]),
            ..Default::default()
        };
        apply_budget(&mut data, &budget);
        // history is in whitelist → kept
        assert!(data.contains_key("history"));
        // METADATA_KEYS always preserved even if not in whitelist
        assert!(data.contains_key("task_id"));
        assert!(data.contains_key("step_id"));
        assert!(data.contains_key("instance_id"));
        assert!(data.contains_key("workflow_id"));
        // non-whitelisted non-metadata → dropped
        assert!(!data.contains_key("drop_me"));
    }
}
