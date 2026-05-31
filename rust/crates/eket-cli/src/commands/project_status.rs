use anyhow::Result;
use clap::Args;
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime};

#[derive(Args)]
pub struct ProjectStatusArgs {
    /// Path to .eket root (defaults to current directory)
    #[arg(long, default_value = ".")]
    pub root: PathBuf,
}

fn git_status_short(repo_path: &Path) -> Option<String> {
    if !repo_path.exists() {
        return None;
    }
    let out = std::process::Command::new("git")
        .args(["-C", &repo_path.to_string_lossy(), "status", "--short"])
        .output()
        .ok()?;
    Some(String::from_utf8_lossy(&out.stdout).trim().to_string())
}

fn git_last_commit(repo_path: &Path) -> Option<String> {
    if !repo_path.exists() {
        return None;
    }
    let out = std::process::Command::new("git")
        .args(["-C", &repo_path.to_string_lossy(), "log", "-1", "--oneline"])
        .output()
        .ok()?;
    let s = String::from_utf8_lossy(&out.stdout).trim().to_string();
    if s.is_empty() {
        None
    } else {
        Some(s)
    }
}

fn repo_info(path: &Path) -> Value {
    json!({
        "path": path.to_string_lossy(),
        "exists": path.exists(),
        "git_status": git_status_short(path).unwrap_or_default(),
        "last_commit": git_last_commit(path).unwrap_or_default(),
    })
}

fn count_in_progress_tickets(tickets_dir: &Path) -> usize {
    if !tickets_dir.exists() {
        return 0;
    }
    let Ok(entries) = std::fs::read_dir(tickets_dir) else {
        return 0;
    };
    let mut count = 0;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) == Some("md") {
            if let Ok(content) = std::fs::read_to_string(&path) {
                if content.contains("状态: in_progress") || content.contains("status: in_progress")
                {
                    count += 1;
                }
            }
        }
    }
    count
}

fn find_active_slavers(heartbeat_dir: &Path) -> Vec<String> {
    if !heartbeat_dir.exists() {
        return vec![];
    }
    let now = SystemTime::now();
    let threshold = Duration::from_secs(300); // 5 min
    let Ok(entries) = std::fs::read_dir(heartbeat_dir) else {
        return vec![];
    };
    let mut active = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        if let Ok(meta) = std::fs::metadata(&path) {
            if let Ok(modified) = meta.modified() {
                if now.duration_since(modified).unwrap_or(Duration::MAX) < threshold {
                    if let Some(name) = path.file_stem().and_then(|n| n.to_str()) {
                        active.push(name.to_string());
                    }
                }
            }
        }
    }
    active
}

fn load_repo_paths(eket_root: &Path) -> (PathBuf, PathBuf, PathBuf) {
    // Try reading .eket/config/config.yml for repo paths
    // Falls back to conventional locations relative to project root
    let parent = eket_root.parent().unwrap_or(eket_root);
    let config_path = eket_root.join("config/config.yml");

    if let Ok(content) = std::fs::read_to_string(&config_path) {
        let confluence = extract_yaml_path(&content, "confluence")
            .map(PathBuf::from)
            .unwrap_or_else(|| parent.join("confluence"));
        let jira = extract_yaml_path(&content, "jira")
            .map(PathBuf::from)
            .unwrap_or_else(|| parent.join("jira"));
        let code = extract_yaml_path(&content, "code")
            .map(PathBuf::from)
            .unwrap_or_else(|| parent.join("code_repo"));
        return (confluence, jira, code);
    }

    (
        parent.join("confluence"),
        parent.join("jira"),
        parent.join("code_repo"),
    )
}

fn extract_yaml_path(content: &str, key: &str) -> Option<String> {
    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with(&format!("{key}:")) || trimmed.starts_with(&format!("{key}_path:")) {
            let val = trimmed
                .split_once(':')?
                .1
                .trim()
                .trim_matches('"')
                .trim_matches('\'');
            if !val.is_empty() {
                return Some(val.to_string());
            }
        }
    }
    None
}

pub async fn run(args: ProjectStatusArgs) -> Result<()> {
    let root = args.root.canonicalize().unwrap_or(args.root.clone());
    let eket_dir = root.join(".eket");

    let (confluence, jira, code) = load_repo_paths(&eket_dir);

    let tickets_dir = jira.join("tickets");
    let heartbeat_dir = eket_dir.join("heartbeat");

    let in_progress = count_in_progress_tickets(&tickets_dir);
    let active_slavers = find_active_slavers(&heartbeat_dir);

    let output = json!({
        "confluence": repo_info(&confluence),
        "jira": repo_info(&jira),
        "code": repo_info(&code),
        "in_progress_tickets": in_progress,
        "active_slavers": active_slavers,
    });

    println!("{}", serde_json::to_string_pretty(&output)?);
    Ok(())
}
