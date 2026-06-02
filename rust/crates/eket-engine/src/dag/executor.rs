//! DAG Node Executor - Command execution with timeout and retry
//!
//! Executes individual DAG nodes as shell commands with proper error handling.

use std::collections::HashMap;
use std::process::Stdio;
use std::time::Duration;

use serde_json::Value;
use tokio::io::AsyncReadExt;
use tokio::process::Command;
use tokio::time::timeout;
use tracing::{debug, error, info, warn};

use crate::context_budget::apply_budget;
use crate::dag::scheduler::ReadyNode;
use crate::workflow::ContextBudget;

// ============================================================================
// Script Sanitization (TASK-638: Log Masking)
// ============================================================================

/// Mask sensitive patterns in script content
fn mask_sensitive(s: &str) -> String {
    use regex::Regex;

    let patterns = [
        // Environment variable assignments
        r"(?i)(?:API_KEY|TOKEN|PASSWORD|SECRET|PRIVATE_KEY|ACCESS_KEY|AUTH)=\S+",
        // Bearer tokens
        r"Bearer\s+\S+",
        // Basic auth
        r"Basic\s+[A-Za-z0-9+/=]+",
        // GitHub PAT
        r"ghp_[A-Za-z0-9]+",
        // Slack tokens
        r"xoxb-[A-Za-z0-9-]+",
    ];

    let mut result = s.to_string();
    for pattern in &patterns {
        if let Ok(re) = Regex::new(pattern) {
            result = re
                .replace_all(&result, |caps: &regex::Captures| {
                    let m = caps.get(0).map_or("", |m| m.as_str());
                    if let Some(eq_pos) = m.find('=') {
                        format!("{}***", &m[..=eq_pos])
                    } else if let Some(space_pos) = m.find(' ') {
                        format!("{} ***", &m[..space_pos])
                    } else {
                        "***".to_string()
                    }
                })
                .to_string();
        }
    }
    result
}

/// Sanitize script for logging: mask sensitive data and truncate
pub fn sanitize_script(script: &str, max_len: usize) -> String {
    let masked = mask_sensitive(script);
    if masked.len() > max_len {
        format!("{}...", &masked[..max_len])
    } else {
        masked
    }
}

/// Execution result for a node
#[derive(Debug, Clone)]
pub struct NodeExecutionResult {
    pub node_id: String,
    pub success: bool,
    pub exit_code: Option<i32>,
    pub stdout: String,
    pub stderr: String,
    pub error_msg: Option<String>,
    pub duration_ms: u64,
    /// Whether this was a gate node
    pub is_gate: bool,
    /// Whether gate condition passed (only meaningful if is_gate)
    pub gate_passed: bool,
}

/// Node executor configuration
#[derive(Debug, Clone)]
pub struct ExecutorConfig {
    /// Working directory for command execution
    pub working_dir: Option<String>,
    /// Environment variables to set
    pub env: HashMap<String, String>,
    /// Shell to use (default: /bin/sh)
    pub shell: String,
}

impl Default for ExecutorConfig {
    fn default() -> Self {
        Self {
            working_dir: None,
            env: HashMap::new(),
            shell: "/bin/sh".to_string(),
        }
    }
}

/// DAG Node Executor
pub struct NodeExecutor {
    config: ExecutorConfig,
}

impl NodeExecutor {
    /// Create new executor with config
    pub fn new(config: ExecutorConfig) -> Self {
        Self { config }
    }

    /// Create executor with default config
    pub fn with_defaults() -> Self {
        Self::new(ExecutorConfig::default())
    }

    /// Execute a node with retry logic
    pub async fn execute(&self, node: &ReadyNode) -> NodeExecutionResult {
        let mut last_result = None;
        let mut attempt = 0;

        while attempt <= node.retry {
            if attempt > 0 {
                info!(
                    "[NodeExecutor] Retrying node {} (attempt {}/{})",
                    node.id,
                    attempt + 1,
                    node.retry + 1
                );
                // Exponential backoff: 1s, 2s, 4s...
                tokio::time::sleep(Duration::from_secs(1 << (attempt - 1))).await;
            }

            let result = self.execute_once(node).await;

            if result.success {
                return result;
            }

            last_result = Some(result);
            attempt += 1;
        }

        last_result.unwrap_or_else(|| NodeExecutionResult {
            node_id: node.id.clone(),
            success: false,
            exit_code: None,
            stdout: String::new(),
            stderr: String::new(),
            error_msg: Some("No execution attempted".to_string()),
            duration_ms: 0,
            is_gate: false,
            gate_passed: false,
        })
    }

    /// Execute a node once without retry
    async fn execute_once(&self, node: &ReadyNode) -> NodeExecutionResult {
        let start = std::time::Instant::now();

        debug!(
            "[NodeExecutor] Executing node {} with timeout {}s",
            node.id, node.timeout
        );

        let execute_future = self.run_command(&node.script);
        let timeout_duration = Duration::from_secs(node.timeout);

        match timeout(timeout_duration, execute_future).await {
            Ok(result) => {
                let duration_ms = start.elapsed().as_millis() as u64;
                match result {
                    Ok((exit_code, stdout, stderr)) => {
                        let success = exit_code == 0;
                        if success {
                            info!(
                                "[NodeExecutor] Node {} completed successfully in {}ms",
                                node.id, duration_ms
                            );
                        } else {
                            warn!(
                                "[NodeExecutor] Node {} failed with exit code {} in {}ms",
                                node.id, exit_code, duration_ms
                            );
                        }

                        NodeExecutionResult {
                            node_id: node.id.clone(),
                            success,
                            exit_code: Some(exit_code),
                            stdout,
                            stderr: stderr.clone(),
                            error_msg: if success {
                                None
                            } else {
                                Some(format!("Exit code {}: {}", exit_code, stderr))
                            },
                            duration_ms,
                            is_gate: false,
                            gate_passed: false,
                        }
                    }
                    Err(e) => {
                        error!(
                            "[NodeExecutor] Node {} execution error: {}",
                            node.id, e
                        );
                        NodeExecutionResult {
                            node_id: node.id.clone(),
                            success: false,
                            exit_code: None,
                            stdout: String::new(),
                            stderr: String::new(),
                            error_msg: Some(format!("Execution error: {}", e)),
                            duration_ms: start.elapsed().as_millis() as u64,
                            is_gate: false,
                            gate_passed: false,
                        }
                    }
                }
            }
            Err(_) => {
                error!(
                    "[NodeExecutor] Node {} timed out after {}s",
                    node.id, node.timeout
                );
                NodeExecutionResult {
                    node_id: node.id.clone(),
                    success: false,
                    exit_code: None,
                    stdout: String::new(),
                    stderr: String::new(),
                    error_msg: Some(format!("Timeout after {}s", node.timeout)),
                    duration_ms: start.elapsed().as_millis() as u64,
                    is_gate: false,
                    gate_passed: false,
                }
            }
        }
    }

    /// Run a shell command
    async fn run_command(&self, script: &str) -> Result<(i32, String, String), std::io::Error> {
        let mut cmd = Command::new(&self.config.shell);
        cmd.arg("-c").arg(script);

        // Set working directory
        if let Some(ref dir) = self.config.working_dir {
            cmd.current_dir(dir);
        }

        // Set environment variables
        for (key, value) in &self.config.env {
            cmd.env(key, value);
        }

        // Capture output
        cmd.stdout(Stdio::piped());
        cmd.stderr(Stdio::piped());

        let mut child = cmd.spawn()?;

        let mut stdout = String::new();
        let mut stderr = String::new();

        if let Some(ref mut stdout_handle) = child.stdout {
            stdout_handle.read_to_string(&mut stdout).await?;
        }

        if let Some(ref mut stderr_handle) = child.stderr {
            stderr_handle.read_to_string(&mut stderr).await?;
        }

        let status = child.wait().await?;
        let exit_code = status.code().unwrap_or(-1);

        Ok((exit_code, stdout, stderr))
    }

    /// Prepare context data with budget constraints
    pub fn prepare_context(
        &self,
        upstream_context: &mut HashMap<String, Value>,
        budget: &ContextBudget,
    ) {
        apply_budget(upstream_context, budget);
    }
}

/// Dry-run executor that doesn't actually execute commands
pub struct DryRunExecutor;

impl DryRunExecutor {
    /// Simulate execution without running commands
    pub async fn execute(node: &ReadyNode) -> NodeExecutionResult {
        info!(
            "[DryRunExecutor] Would execute node {}: {}",
            node.id,
            sanitize_script(&node.script, 100)
        );

        // Simulate some execution time
        tokio::time::sleep(Duration::from_millis(100)).await;

        NodeExecutionResult {
            node_id: node.id.clone(),
            success: true,
            exit_code: Some(0),
            stdout: format!("[dry-run] {}", sanitize_script(&node.script, 100)),
            stderr: String::new(),
            error_msg: None,
            duration_ms: 100,
            is_gate: false,
            gate_passed: false,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_node(id: &str, script: &str, timeout: u64) -> ReadyNode {
        ReadyNode {
            id: id.to_string(),
            script: script.to_string(),
            retry: 0,
            timeout,
            priority: 50,
            is_critical_path: false,
            deadline: None,
        }
    }

    #[tokio::test]
    async fn test_execute_success() {
        let executor = NodeExecutor::with_defaults();
        let node = make_node("TASK-001", "echo hello", 10);

        let result = executor.execute(&node).await;
        assert!(result.success);
        assert_eq!(result.exit_code, Some(0));
        assert!(result.stdout.contains("hello"));
    }

    #[tokio::test]
    async fn test_execute_failure() {
        let executor = NodeExecutor::with_defaults();
        let node = make_node("TASK-002", "exit 1", 10);

        let result = executor.execute(&node).await;
        assert!(!result.success);
        assert_eq!(result.exit_code, Some(1));
    }

    #[tokio::test]
    async fn test_execute_timeout() {
        let executor = NodeExecutor::with_defaults();
        let node = make_node("TASK-003", "sleep 10", 1);

        let result = executor.execute(&node).await;
        assert!(!result.success);
        assert!(result.error_msg.unwrap().contains("Timeout"));
    }

    #[tokio::test]
    async fn test_execute_with_retry() {
        let executor = NodeExecutor::with_defaults();
        // This will fail on first attempt but we're just testing retry logic runs
        let mut node = make_node("TASK-004", "exit 1", 10);
        node.retry = 1;

        let result = executor.execute(&node).await;
        // Still fails because command always exits 1
        assert!(!result.success);
    }

    #[tokio::test]
    async fn test_dry_run_executor() {
        let node = make_node("TASK-005", "dangerous_command", 10);

        let result = DryRunExecutor::execute(&node).await;
        assert!(result.success);
        assert!(result.stdout.contains("dry-run"));
    }

    #[tokio::test]
    async fn test_execute_with_env() {
        let mut config = ExecutorConfig::default();
        config.env.insert("MY_VAR".to_string(), "test_value".to_string());

        let executor = NodeExecutor::new(config);
        let node = make_node("TASK-006", "echo $MY_VAR", 10);

        let result = executor.execute(&node).await;
        assert!(result.success);
        assert!(result.stdout.contains("test_value"));
    }

    #[tokio::test]
    async fn test_prepare_context() {
        let executor = NodeExecutor::with_defaults();
        let mut context: HashMap<String, Value> = HashMap::new();
        context.insert(
            "tool_output_1".to_string(),
            serde_json::json!("large data"),
        );
        context.insert("user_message".to_string(), serde_json::json!("hello"));

        let budget = ContextBudget {
            exclude_tool_outputs: true,
            ..Default::default()
        };

        executor.prepare_context(&mut context, &budget);

        assert!(!context.contains_key("tool_output_1"));
        assert!(context.contains_key("user_message"));
    }

    // TASK-638: Script sanitization tests
    #[test]
    fn test_sanitize_script_truncates_long_scripts() {
        let long_script = "a".repeat(150);
        let result = sanitize_script(&long_script, 100);
        assert_eq!(result.len(), 103); // 100 + "..."
        assert!(result.ends_with("..."));
    }

    #[test]
    fn test_sanitize_script_no_truncate_short() {
        let short_script = "echo hello";
        let result = sanitize_script(short_script, 100);
        assert_eq!(result, "echo hello");
    }

    #[test]
    fn test_sanitize_script_masks_api_key() {
        let script = "curl -H API_KEY=secret123 http://api";
        let result = sanitize_script(script, 200);
        assert!(result.contains("API_KEY=***"));
        assert!(!result.contains("secret123"));
    }

    #[test]
    fn test_sanitize_script_masks_token() {
        let script = "export TOKEN=mytoken123";
        let result = sanitize_script(script, 200);
        assert!(result.contains("TOKEN=***"));
        assert!(!result.contains("mytoken123"));
    }

    #[test]
    fn test_sanitize_script_masks_bearer() {
        let script = "curl -H Authorization: Bearer eyJhbGciOiJIUzI1NiJ9 http://api";
        let result = sanitize_script(script, 200);
        assert!(result.contains("Bearer ***"));
        assert!(!result.contains("eyJhbGciOiJIUzI1NiJ9"));
    }

    #[test]
    fn test_sanitize_script_masks_github_pat() {
        let script = "git clone https://ghp_1234567890abcdefABCDEF@github.com/user/repo";
        let result = sanitize_script(script, 200);
        assert!(result.contains("***"));
        assert!(!result.contains("ghp_1234567890abcdefABCDEF"));
    }

    #[test]
    fn test_sanitize_script_masks_multiple() {
        let script = "API_KEY=key1 TOKEN=tok1 Bearer secret123";
        let result = sanitize_script(script, 200);
        assert!(result.contains("API_KEY=***"));
        assert!(result.contains("TOKEN=***"));
        assert!(result.contains("Bearer ***"));
        assert!(!result.contains("key1"));
        assert!(!result.contains("tok1"));
        assert!(!result.contains("secret123"));
    }
}
