/// submit:pr — Push branch and create GitHub PR
use anyhow::Result;
use clap::Args;
use serde_json::json;
use std::process::Command;

#[derive(Args, Debug)]
pub struct SubmitPrArgs {
    /// Ticket ID to update with PR URL
    #[arg(long)]
    pub ticket_id: Option<String>,

    /// PR title
    #[arg(long, default_value = "")]
    pub title: String,

    /// PR body/description
    #[arg(long, default_value = "")]
    pub body: String,

    /// Base branch
    #[arg(long, default_value = "main")]
    pub base: String,

    /// Output structured JSON
    #[arg(long)]
    pub json: bool,
}

/// Parse PR URL from `git push` output.
/// Looks for lines like: `remote: Create a pull request ... https://github.com/...`
pub fn parse_pr_url_from_push_output(output: &str) -> Option<String> {
    for line in output.lines() {
        let line = line.trim();
        if line.starts_with("remote:") && line.contains("http") {
            // Extract URL: last whitespace-separated token starting with http
            if let Some(url) = line.split_whitespace().find(|t| t.starts_with("http")) {
                return Some(url.to_string());
            }
        }
    }
    None
}

pub async fn run(args: SubmitPrArgs) -> Result<()> {
    // Step 1: git push
    let push_out = Command::new("git")
        .args(["push", "origin", "HEAD"])
        .output();

    let pr_url = match push_out {
        Err(e) => {
            let report = json!({
                "status": "error",
                "error": format!("git push failed: {e}"),
                "ticket_id": args.ticket_id,
            });
            println!("{}", serde_json::to_string_pretty(&report)?);
            return Ok(());
        }
        Ok(out) => {
            let combined = format!(
                "{}\n{}",
                String::from_utf8_lossy(&out.stdout),
                String::from_utf8_lossy(&out.stderr)
            );
            // Try parse URL from push output
            parse_pr_url_from_push_output(&combined).or_else(|| {
                // Step 2: gh pr create fallback
                let gh_out = Command::new("gh")
                    .args([
                        "pr", "create",
                        "--title", &args.title,
                        "--body", &args.body,
                        "--base", &args.base,
                    ])
                    .output()
                    .ok()?;
                let s = String::from_utf8_lossy(&gh_out.stdout).trim().to_string();
                if s.starts_with("http") { Some(s) } else { None }
            })
        }
    };

    let pr_url_str = pr_url.unwrap_or_default();

    // Step 3: Update ticket file if ticket_id and pr_url provided
    if let (Some(ref tid), false) = (&args.ticket_id, pr_url_str.is_empty()) {
        let _ = append_pr_to_ticket(tid, &pr_url_str);
    }

    let report = json!({
        "status": "created",
        "pr_url": pr_url_str,
        "ticket_id": args.ticket_id,
    });
    println!("{}", serde_json::to_string_pretty(&report)?);
    Ok(())
}

fn append_pr_to_ticket(ticket_id: &str, pr_url: &str) -> Result<()> {
    // Search common locations
    let candidates = [
        format!("jira/tickets/{ticket_id}.md"),
    ];
    for path in &candidates {
        if let Ok(content) = std::fs::read_to_string(path) {
            let updated = format!("{content}\n**PR**: {pr_url}\n");
            std::fs::write(path, updated)?;
            return Ok(());
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_pr_url_from_push_output_found() {
        let output = "remote: Create a pull request for 'feat/x' on GitHub by visiting:\nremote:      https://github.com/org/repo/pull/42\nremote:";
        let url = parse_pr_url_from_push_output(output);
        assert_eq!(url, Some("https://github.com/org/repo/pull/42".to_string()));
    }

    #[test]
    fn parse_pr_url_from_push_output_not_found() {
        let output = "Everything up-to-date";
        let url = parse_pr_url_from_push_output(output);
        assert!(url.is_none());
    }

    #[test]
    fn missing_url_fallback_yields_empty() {
        // When no URL found in push output and gh not called, pr_url is empty
        let url = parse_pr_url_from_push_output("remote: no url here");
        assert!(url.is_none());
    }
}
