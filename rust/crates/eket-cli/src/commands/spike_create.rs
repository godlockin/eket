/// spike:create — create spike ticket + plan doc
///
/// Usage: eket spike:create <SPIKE_ID> "<title>" [--epic <EPIC_ID>]
use anyhow::Result;
use clap::Parser;
use eket_core::doc_lifecycle::{handle_event, DocEvent, TemplateRenderer};
use serde_json::json;
use std::path::PathBuf;

#[derive(Parser, Debug)]
pub struct SpikeCreateArgs {
    /// Spike ID (e.g. SPIKE-001)
    pub spike_id: String,

    /// Spike title
    pub title: String,

    /// Associated Epic ID (optional)
    #[arg(long)]
    pub epic: Option<String>,
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
    anyhow::bail!("Cannot find project root (no jira/ directory found).")
}

pub async fn run(args: SpikeCreateArgs) -> Result<()> {
    let root = find_project_root()?;
    let renderer = TemplateRenderer::new();

    // Create jira ticket
    let tickets_dir = root.join("jira").join("tickets");
    std::fs::create_dir_all(&tickets_dir)?;
    let ticket_path = tickets_dir.join(format!("{}.md", &args.spike_id));
    let timestamp = chrono::Utc::now().to_rfc3339();
    let epic_ref = args.epic.as_deref().unwrap_or("N/A");
    let ticket_content = format!(
        "# {id}: {title}\n\n**类型**: spike\n**状态**: todo\n**预估**: 3天（480min）\n**关联 Epic**: {epic}\n**创建时间**: {ts}\n\n## 目标\n\nTODO\n",
        id = args.spike_id,
        title = args.title,
        epic = epic_ref,
        ts = timestamp,
    );
    std::fs::write(&ticket_path, ticket_content)?;

    // Trigger doc event
    handle_event(
        DocEvent::SpikeStarted {
            spike_id: args.spike_id.clone(),
            title: args.title.clone(),
            epic_id: args.epic.clone(),
            project_root: root.clone(),
        },
        &renderer,
    )
    .await?;

    let plan_path = root
        .join("confluence")
        .join("spikes")
        .join(&args.spike_id)
        .join("plan.md");

    println!(
        "{}",
        serde_json::to_string_pretty(&json!({
            "success": true,
            "spike_id": args.spike_id,
            "ticket": ticket_path.display().to_string(),
            "plan": plan_path.display().to_string(),
        }))?
    );
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use eket_core::doc_lifecycle::handle_event;
    use tempfile::TempDir;

    fn make_project(dir: &TempDir) {
        std::fs::create_dir_all(dir.path().join("jira/tickets")).unwrap();
        let t = dir.path().join("templates/confluence");
        std::fs::create_dir_all(&t).unwrap();
        std::fs::write(
            t.join("spike-plan.md.hbs"),
            "# Spike: {{spike_id}} — {{title}}\n<!-- eket:doc:spike-plan -->\n**创建时间**: {{timestamp}}\n**关联 Epic**: {{epic_id}}\n",
        )
        .unwrap();
    }

    #[tokio::test]
    async fn spike_create_writes_plan() {
        let dir = TempDir::new().unwrap();
        make_project(&dir);
        let root = dir.path().to_path_buf();
        let renderer = TemplateRenderer::new();

        handle_event(
            DocEvent::SpikeStarted {
                spike_id: "SPIKE-001".to_string(),
                title: "Test Spike".to_string(),
                epic_id: Some("EPIC-001".to_string()),
                project_root: root.clone(),
            },
            &renderer,
        )
        .await
        .unwrap();

        assert!(root.join("confluence/spikes/SPIKE-001/plan.md").exists());
    }
}
