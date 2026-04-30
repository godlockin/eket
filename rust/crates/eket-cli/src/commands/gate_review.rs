/// gate:review — Run CI checks for a PR via `gh pr checks`
use anyhow::Result;
use clap::Args;
use serde::Serialize;
use serde_json::{json, Value};
use std::process::Command;

#[derive(Args, Debug)]
pub struct GateReviewArgs {
    /// PR URL to check (e.g. https://github.com/org/repo/pull/123)
    #[arg(long)]
    pub pr_url: Option<String>,

    /// Associated ticket ID
    #[arg(long)]
    pub ticket_id: Option<String>,

    /// SQLite DB path (unused, for API parity)
    #[arg(long)]
    pub db_path: Option<String>,

    /// Output structured JSON
    #[arg(long)]
    pub json: bool,

    /// Auto-approve: immediately output APPROVE decision without running checks
    #[arg(long)]
    pub auto_approve: bool,

    /// Force veto with given reason: immediately output VETO decision
    #[arg(long)]
    pub force_veto: Option<String>,

    /// Dry run: run all checks but don't write any files
    #[arg(long)]
    pub dry_run: bool,
}

#[derive(Debug, Serialize)]
pub struct CheckResult {
    pub name: String,
    pub status: String,
}

/// Parse `gh pr checks` output lines into CheckResult list.
/// Each non-empty line: `<name>\t<pass/fail>\t...`
pub fn parse_gh_checks_output(output: &str) -> Vec<CheckResult> {
    output
        .lines()
        .filter(|l| !l.trim().is_empty())
        .map(|line| {
            let parts: Vec<&str> = line.splitn(3, '\t').collect();
            let name = parts.first().copied().unwrap_or("unknown").trim().to_string();
            let raw_status = parts.get(1).copied().unwrap_or("").trim().to_lowercase();
            let status = if raw_status.contains("pass") || raw_status == "success" || raw_status == "completed" {
                "pass".to_string()
            } else {
                "fail".to_string()
            };
            CheckResult { name, status }
        })
        .collect()
}

pub async fn run(args: GateReviewArgs) -> Result<()> {
    // --auto-approve: short-circuit, output APPROVE immediately
    if args.auto_approve {
        let result = json!({
            "decision": "APPROVE",
            "reason": "auto-approved",
            "pass": true,
            "ticket_id": args.ticket_id,
        });
        println!("{}", serde_json::to_string_pretty(&result)?);
        return Ok(());
    }

    // --force-veto: short-circuit, output VETO immediately
    if let Some(ref reason) = args.force_veto {
        let result = json!({
            "decision": "VETO",
            "reason": reason,
            "pass": false,
            "ticket_id": args.ticket_id,
        });
        println!("{}", serde_json::to_string_pretty(&result)?);
        return Ok(());
    }

    let mut result = run_gate_review(args.pr_url.as_deref(), args.ticket_id.as_deref());

    // --dry-run: note it in output (no file writes occur anyway in current impl)
    if args.dry_run {
        result["dry_run"] = json!(true);
    }

    println!("{}", serde_json::to_string_pretty(&result)?);
    Ok(())
}

pub fn run_gate_review(pr_url: Option<&str>, ticket_id: Option<&str>) -> Value {
    let Some(url) = pr_url else {
        return json!({
            "pass": false,
            "ticket_id": ticket_id,
            "error": "no --pr-url provided",
            "checks": []
        });
    };

    let output = Command::new("gh")
        .args(["pr", "checks", url])
        .output();

    match output {
        Err(_) => json!({
            "pass": false,
            "ticket_id": ticket_id,
            "error": "gh not available",
            "checks": []
        }),
        Ok(out) if !out.status.success() => {
            let stderr = String::from_utf8_lossy(&out.stderr).to_string();
            json!({
                "pass": false,
                "ticket_id": ticket_id,
                "error": stderr,
                "checks": []
            })
        }
        Ok(out) => {
            let stdout = String::from_utf8_lossy(&out.stdout).to_string();
            let checks = parse_gh_checks_output(&stdout);
            let all_pass = !checks.is_empty() && checks.iter().all(|c| c.status == "pass");
            json!({
                "pass": all_pass,
                "ticket_id": ticket_id,
                "checks": checks
            })
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn no_pr_url_returns_error() {
        let result = run_gate_review(None, Some("TASK-001"));
        assert_eq!(result["pass"], false);
        assert!(result["error"].as_str().unwrap().contains("no --pr-url"));
    }

    #[test]
    fn parse_gh_output_pass() {
        let mock_output = "lint\tpass\t\nbuild\tpass\t\ntest\tpass\t";
        let checks = parse_gh_checks_output(mock_output);
        assert_eq!(checks.len(), 3);
        assert!(checks.iter().all(|c| c.status == "pass"));
    }

    #[test]
    fn parse_gh_output_with_fail() {
        let mock_output = "lint\tpass\t\nbuild\tfail\t";
        let checks = parse_gh_checks_output(mock_output);
        assert_eq!(checks.len(), 2);
        assert_eq!(checks[1].status, "fail");
    }

    #[tokio::test]
    async fn auto_approve_short_circuits() {
        let args = GateReviewArgs {
            pr_url: None,
            ticket_id: Some("TASK-001".to_string()),
            db_path: None,
            json: false,
            auto_approve: true,
            force_veto: None,
            dry_run: false,
        };
        // Just verify it doesn't call gh (no pr_url needed)
        // We can't capture stdout easily, but run() should succeed
        let result = run(args).await;
        assert!(result.is_ok());
    }
}
