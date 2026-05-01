/// doc:status — EPIC document completeness checker
///
/// Usage:
///   eket doc:status <EPIC_ID>
///   eket doc:status --all
use anyhow::Result;
use clap::Args;
use serde_json::{json, Value};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Args)]
pub struct DocStatusArgs {
    /// EPIC ID to check (e.g. EPIC-001)
    pub epic_id: Option<String>,

    /// Scan all EPICs under jira/epics/
    #[arg(long)]
    pub all: bool,
}

fn find_project_root() -> Option<PathBuf> {
    let mut dir = std::env::current_dir().ok()?;
    loop {
        if dir.join(".eket").exists() {
            return Some(dir);
        }
        if !dir.pop() {
            return None;
        }
    }
}

/// Parse ticket list from `<!-- eket:section:tickets -->` block in plan.md
/// Each line format: `- TASK-NNN: ...`
fn parse_tickets_from_plan(plan_path: &Path) -> Vec<String> {
    let content = fs::read_to_string(plan_path).unwrap_or_default();
    let mut tickets = Vec::new();
    let mut in_section = false;

    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed == "<!-- eket:section:tickets -->" {
            in_section = true;
            continue;
        }
        // Stop at the next HTML comment section marker
        if in_section && trimmed.starts_with("<!-- eket:section:") {
            break;
        }
        if in_section {
            // Match `- TASK-NNN: ...`
            if let Some(rest) = trimmed.strip_prefix("- ") {
                if let Some(ticket_id) = rest.split(':').next() {
                    let tid = ticket_id.trim();
                    if !tid.is_empty() {
                        tickets.push(tid.to_string());
                    }
                }
            }
        }
    }

    tickets
}

/// Check if a retro file exists for a ticket under retrospectives dir
fn has_retro(retro_dir: &Path, ticket_id: &str) -> bool {
    if !retro_dir.exists() {
        return false;
    }
    let Ok(entries) = fs::read_dir(retro_dir) else {
        return false;
    };
    let suffix = format!("-{}.md", ticket_id.to_lowercase());
    let suffix_upper = format!("-{}.md", ticket_id);
    for entry in entries.flatten() {
        let name = entry.file_name();
        let name_str = name.to_string_lossy().to_string();
        if name_str.ends_with(&suffix)
            || name_str.ends_with(&suffix_upper)
            || name_str == format!("{}.md", ticket_id)
        {
            return true;
        }
    }
    false
}

fn check_epic(project_root: &Path, epic_id: &str) -> Value {
    let confluence = project_root.join("confluence");
    let jira = project_root.join("jira");
    let retro_dir = confluence.join("memory/retrospectives");

    // Files to check
    let epic_md = jira.join(format!("epics/{}/epic.md", epic_id));
    let analysis_md = confluence.join(format!("requirements/{}-analysis.md", epic_id));
    let plan_md = confluence.join(format!("architecture/{}-plan.md", epic_id));

    let mut present: Vec<String> = Vec::new();
    let mut missing: Vec<String> = Vec::new();

    for (path, rel) in [
        (&epic_md, format!("jira/epics/{}/epic.md", epic_id)),
        (
            &analysis_md,
            format!("confluence/requirements/{}-analysis.md", epic_id),
        ),
        (
            &plan_md,
            format!("confluence/architecture/{}-plan.md", epic_id),
        ),
    ] {
        if path.exists() {
            present.push(rel);
        } else {
            missing.push(rel);
        }
    }

    // Parse tickets from plan if it exists
    let tickets_raw = if plan_md.exists() {
        parse_tickets_from_plan(&plan_md)
    } else {
        vec![]
    };

    let mut ticket_results: Vec<Value> = Vec::new();
    let mut warnings: Vec<String> = Vec::new();

    for ticket_id in &tickets_raw {
        let retro = has_retro(&retro_dir, ticket_id);
        if !retro {
            warnings.push(format!("{} 缺少复盘文档", ticket_id));
        }
        ticket_results.push(json!({
            "ticket_id": ticket_id,
            "has_retro": retro,
        }));
    }

    json!({
        "epic_id": epic_id,
        "present": present,
        "missing": missing,
        "tickets": ticket_results,
        "warnings": warnings,
    })
}

fn list_epic_ids(project_root: &Path) -> Vec<String> {
    let epics_dir = project_root.join("jira/epics");
    if !epics_dir.exists() {
        return vec![];
    }
    let Ok(entries) = fs::read_dir(&epics_dir) else {
        return vec![];
    };
    let mut ids: Vec<String> = entries
        .flatten()
        .filter(|e| e.path().is_dir())
        .filter_map(|e| e.file_name().into_string().ok())
        .collect();
    ids.sort();
    ids
}

pub async fn run(args: DocStatusArgs) -> Result<()> {
    let project_root = find_project_root().unwrap_or_else(|| std::env::current_dir().unwrap());

    let epics: Vec<String> = if args.all {
        list_epic_ids(&project_root)
    } else if let Some(id) = args.epic_id {
        vec![id]
    } else {
        eprintln!("[ERROR] Specify EPIC_ID or use --all");
        std::process::exit(1);
    };

    if epics.is_empty() {
        let output = json!({ "epics": [], "message": "No EPICs found" });
        println!("{}", serde_json::to_string_pretty(&output)?);
        return Ok(());
    }

    if epics.len() == 1 {
        let result = check_epic(&project_root, &epics[0]);
        println!("{}", serde_json::to_string_pretty(&result)?);
    } else {
        let results: Vec<Value> = epics
            .iter()
            .map(|id| check_epic(&project_root, id))
            .collect();
        let output = json!({ "epics": results });
        println!("{}", serde_json::to_string_pretty(&output)?);
    }

    Ok(())
}

// ─── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    fn setup_project(tmp: &TempDir) -> PathBuf {
        let root = tmp.path().to_path_buf();
        // .eket marker
        fs::create_dir_all(root.join(".eket")).unwrap();
        root
    }

    #[test]
    fn test_parse_tickets_from_plan_basic() {
        let tmp = TempDir::new().unwrap();
        let plan = tmp.path().join("plan.md");
        fs::write(
            &plan,
            "# Plan\n\n<!-- eket:section:tickets -->\n- TASK-100: do thing\n- TASK-101: another\n\n<!-- eket:section:end -->\n",
        )
        .unwrap();
        let tickets = parse_tickets_from_plan(&plan);
        assert_eq!(tickets, vec!["TASK-100", "TASK-101"]);
    }

    #[test]
    fn test_parse_tickets_empty_when_no_section() {
        let tmp = TempDir::new().unwrap();
        let plan = tmp.path().join("plan.md");
        fs::write(&plan, "# Plan\n- TASK-100: no section marker\n").unwrap();
        let tickets = parse_tickets_from_plan(&plan);
        assert!(tickets.is_empty());
    }

    #[test]
    fn test_has_retro_found() {
        let tmp = TempDir::new().unwrap();
        let retro_dir = tmp.path().to_path_buf();
        fs::write(retro_dir.join("2024-01-01-TASK-100.md"), "retro").unwrap();
        assert!(has_retro(&retro_dir, "TASK-100"));
    }

    #[test]
    fn test_has_retro_not_found() {
        let tmp = TempDir::new().unwrap();
        let retro_dir = tmp.path().to_path_buf();
        fs::write(retro_dir.join("2024-01-01-TASK-200.md"), "retro").unwrap();
        assert!(!has_retro(&retro_dir, "TASK-100"));
    }

    #[test]
    fn test_list_epic_ids_all() {
        let tmp = TempDir::new().unwrap();
        let root = setup_project(&tmp);
        fs::create_dir_all(root.join("jira/epics/EPIC-001")).unwrap();
        fs::create_dir_all(root.join("jira/epics/EPIC-002")).unwrap();

        let ids = list_epic_ids(&root);
        assert_eq!(ids, vec!["EPIC-001", "EPIC-002"]);
    }

    #[test]
    fn test_check_epic_all_missing() {
        let tmp = TempDir::new().unwrap();
        let root = setup_project(&tmp);
        let result = check_epic(&root, "EPIC-999");

        let missing = result["missing"].as_array().unwrap();
        assert_eq!(missing.len(), 3);

        let present = result["present"].as_array().unwrap();
        assert!(present.is_empty());
    }

    #[test]
    fn test_check_epic_partial_present() {
        let tmp = TempDir::new().unwrap();
        let root = setup_project(&tmp);
        // Create epic.md only
        fs::create_dir_all(root.join("jira/epics/EPIC-001")).unwrap();
        fs::write(root.join("jira/epics/EPIC-001/epic.md"), "# Epic").unwrap();

        let result = check_epic(&root, "EPIC-001");
        let present = result["present"].as_array().unwrap();
        assert_eq!(present.len(), 1);
        let missing = result["missing"].as_array().unwrap();
        assert_eq!(missing.len(), 2);
    }

    #[test]
    fn test_check_epic_tickets_with_retro() {
        let tmp = TempDir::new().unwrap();
        let root = setup_project(&tmp);

        // Setup plan.md with tickets section
        fs::create_dir_all(root.join("confluence/architecture")).unwrap();
        fs::write(
            root.join("confluence/architecture/EPIC-001-plan.md"),
            "# Plan\n\n<!-- eket:section:tickets -->\n- TASK-100: task one\n- TASK-101: task two\n",
        )
        .unwrap();

        // TASK-100 has retro, TASK-101 does not
        fs::create_dir_all(root.join("confluence/memory/retrospectives")).unwrap();
        fs::write(
            root.join("confluence/memory/retrospectives/retro-TASK-100.md"),
            "retro",
        )
        .unwrap();

        let result = check_epic(&root, "EPIC-001");
        let tickets = result["tickets"].as_array().unwrap();
        assert_eq!(tickets.len(), 2);

        let t0 = &tickets[0];
        assert_eq!(t0["ticket_id"].as_str().unwrap(), "TASK-100");
        assert!(t0["has_retro"].as_bool().unwrap());

        let t1 = &tickets[1];
        assert_eq!(t1["ticket_id"].as_str().unwrap(), "TASK-101");
        assert!(!t1["has_retro"].as_bool().unwrap());

        let warnings = result["warnings"].as_array().unwrap();
        assert_eq!(warnings.len(), 1);
        assert!(warnings[0].as_str().unwrap().contains("TASK-101"));
    }
}
