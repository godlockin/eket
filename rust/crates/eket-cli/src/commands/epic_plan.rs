/// epic:plan — generate / refresh architecture plan for an epic
///
/// Flow:
///  1. Find project_root
///  2. Guard: jira/epics/<epic_id>/epic.md must exist
///  3. create_dir_all confluence/architecture/
///  4. Render architecture-plan.md.hbs → confluence/architecture/<epic_id>-plan.md (overwrite OK)
///  5. Print JSON result
use anyhow::Result;
use clap::Parser;
use eket_core::doc_lifecycle::{DocEvent, TemplateRenderer};
use serde_json::json;
use std::path::PathBuf;

#[derive(Parser, Debug)]
pub struct EpicPlanArgs {
    /// Epic ID, e.g. EPIC-001
    pub epic_id: String,
}

fn find_project_root() -> Result<PathBuf> {
    let mut dir = std::env::current_dir()?;
    loop {
        if dir.join("jira").join("epics").is_dir() || dir.join("jira").join("tickets").is_dir() {
            return Ok(dir);
        }
        if !dir.pop() {
            break;
        }
    }
    anyhow::bail!(
        "Cannot find project root (no jira/ directory found). Run from inside an EKET project."
    )
}

pub async fn run(args: EpicPlanArgs) -> Result<()> {
    // 1. Project root
    let root = find_project_root()?;

    // 2. Guard: epic.md must exist
    let epic_md = root
        .join("jira")
        .join("epics")
        .join(&args.epic_id)
        .join("epic.md");
    if !epic_md.exists() {
        println!(
            "{}",
            serde_json::to_string_pretty(&json!({
                "success": false,
                "error": format!("epic not found: {}", epic_md.display())
            }))?
        );
        return Ok(());
    }

    // 3-4. Delegate to doc_lifecycle::handle_event (overwrites if exists)
    let renderer = TemplateRenderer::new();
    eket_core::doc_lifecycle::handle_event(
        DocEvent::EpicPlanned {
            epic_id: args.epic_id.clone(),
            project_root: root.clone(),
        },
        &renderer,
    )
    .await?;

    // 5. Output JSON
    let plan_path = root
        .join("confluence")
        .join("architecture")
        .join(format!("{}-plan.md", &args.epic_id));

    println!(
        "{}",
        serde_json::to_string_pretty(&json!({
            "success": true,
            "plan_path": plan_path.display().to_string(),
        }))?
    );
    Ok(())
}

// ─── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn make_project_with_epic(dir: &TempDir, epic_id: &str) {
        std::fs::create_dir_all(dir.path().join(format!("jira/epics/{epic_id}"))).unwrap();
        std::fs::write(
            dir.path().join(format!("jira/epics/{epic_id}/epic.md")),
            format!("# {epic_id}: Test\n"),
        )
        .unwrap();

        let c = dir.path().join("templates/confluence");
        std::fs::create_dir_all(&c).unwrap();
        std::fs::write(
            c.join("architecture-plan.md.hbs"),
            "# Architecture Plan: {{epic_id}}\n",
        )
        .unwrap();
    }

    #[tokio::test]
    async fn epic_plan_creates_plan_file() {
        let dir = TempDir::new().unwrap();
        make_project_with_epic(&dir, "EPIC-PLAN");

        let root = dir.path().to_path_buf();
        let renderer = TemplateRenderer::new();
        eket_core::doc_lifecycle::handle_event(
            DocEvent::EpicPlanned {
                epic_id: "EPIC-PLAN".to_string(),
                project_root: root.clone(),
            },
            &renderer,
        )
        .await
        .unwrap();

        let plan = root.join("confluence/architecture/EPIC-PLAN-plan.md");
        assert!(plan.exists());
        let content = std::fs::read_to_string(&plan).unwrap();
        assert!(content.contains("EPIC-PLAN"));
    }

    #[tokio::test]
    async fn epic_plan_overwrites_existing() {
        let dir = TempDir::new().unwrap();
        make_project_with_epic(&dir, "EPIC-OVR");

        let root = dir.path().to_path_buf();
        // Pre-write stale plan
        std::fs::create_dir_all(root.join("confluence/architecture")).unwrap();
        std::fs::write(
            root.join("confluence/architecture/EPIC-OVR-plan.md"),
            "STALE",
        )
        .unwrap();

        let renderer = TemplateRenderer::new();
        eket_core::doc_lifecycle::handle_event(
            DocEvent::EpicPlanned {
                epic_id: "EPIC-OVR".to_string(),
                project_root: root.clone(),
            },
            &renderer,
        )
        .await
        .unwrap();

        let content =
            std::fs::read_to_string(root.join("confluence/architecture/EPIC-OVR-plan.md")).unwrap();
        assert_ne!(content, "STALE", "Plan file should be overwritten");
        assert!(content.contains("EPIC-OVR"));
    }
}
