/// skill:extract — extract skills/domain from active ticket context
use anyhow::Result;
use serde_json::json;
use std::path::PathBuf;

fn find_project_root() -> Option<PathBuf> {
    let mut dir = std::env::current_dir().ok()?;
    loop {
        if dir.join("jira/tickets").exists() && dir.join(".eket").exists() {
            return Some(dir);
        }
        if dir.join("jira/tickets").exists() || dir.join(".eket").exists() {
            return Some(dir);
        }
        if !dir.pop() {
            return None;
        }
    }
}

/// Parse domain from ACTIVE_CONTEXT.md.
/// Looks for lines under `## Active Ticket` like `domain: <value>`.
fn parse_domain(content: &str) -> Option<String> {
    let mut in_active = false;
    for line in content.lines() {
        if line.trim_start().starts_with("## Active Ticket") {
            in_active = true;
            continue;
        }
        if in_active {
            // Stop at next heading
            if line.starts_with("## ") {
                break;
            }
            let lower = line.to_lowercase();
            for prefix in &["domain:", "domain："] {
                if let Some(pos) = lower.find(prefix) {
                    let val = line[pos + prefix.len()..].trim().to_string();
                    if !val.is_empty() {
                        return Some(val);
                    }
                }
            }
        }
    }
    None
}

/// Try reading triggers from node/src/skills/<domain>.json
fn load_skills_from_domain(project_root: &std::path::Path, domain: &str) -> Vec<String> {
    let skill_file = project_root
        .join("node/src/skills")
        .join(format!("{domain}.json"));

    if let Ok(content) = std::fs::read_to_string(&skill_file) {
        if let Ok(val) = serde_json::from_str::<serde_json::Value>(&content) {
            if let Some(triggers) = val.get("triggers").and_then(|t| t.as_array()) {
                return triggers
                    .iter()
                    .filter_map(|t| t.as_str().map(|s| s.to_string()))
                    .collect();
            }
        }
    }
    vec![]
}

pub async fn run() -> Result<()> {
    let project_root = find_project_root().unwrap_or_else(|| std::env::current_dir().unwrap());

    let context_path = project_root.join(".eket/ACTIVE_CONTEXT.md");

    let (domain, skills) = if let Ok(content) = std::fs::read_to_string(&context_path) {
        let domain = parse_domain(&content);
        let skills = domain
            .as_deref()
            .map(|d| load_skills_from_domain(&project_root, d))
            .unwrap_or_default();
        (domain, skills)
    } else {
        (None, vec![])
    };

    println!(
        "{}",
        serde_json::to_string_pretty(&json!({
            "skills": skills,
            "domain": domain,
        }))?
    );
    Ok(())
}

// ─── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_domain_basic() {
        let md = "# Context\n## Active Ticket\ndomain: backend\n## Other\n";
        assert_eq!(parse_domain(md), Some("backend".to_string()));
    }

    #[test]
    fn parse_domain_missing() {
        let md = "# Context\n## Active Ticket\ntitle: something\n";
        assert_eq!(parse_domain(md), None);
    }

    #[test]
    fn parse_domain_no_active_section() {
        let md = "# Context\n## Other\ndomain: dev\n";
        assert_eq!(parse_domain(md), None);
    }
}
