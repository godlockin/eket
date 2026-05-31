/// roadmap:update — create or append a quarter section to a project roadmap
///
/// Usage: eket roadmap:update <PROJECT_ID> [--quarter <Q1-2026>]
use anyhow::Result;
use clap::Parser;
use eket_core::doc_lifecycle::{handle_event, DocEvent, TemplateRenderer};
use serde_json::json;
use std::path::PathBuf;

#[derive(Parser, Debug)]
pub struct RoadmapUpdateArgs {
    /// Project ID (e.g. my-project)
    pub project_id: String,

    /// Quarter label (e.g. Q2-2026). Defaults to current quarter.
    #[arg(long)]
    pub quarter: Option<String>,
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

pub async fn run(args: RoadmapUpdateArgs) -> Result<()> {
    let root = find_project_root()?;
    let renderer = TemplateRenderer::new();

    let quarter = args.quarter.clone();
    let resolved_quarter = quarter.clone().unwrap_or_else(|| {
        use chrono::Datelike;
        let now = chrono::Utc::now();
        let q = (now.month0() / 3) + 1;
        format!("Q{}-{}", q, now.year())
    });

    handle_event(
        DocEvent::RoadmapUpdated {
            project_id: args.project_id.clone(),
            quarter: quarter,
            project_root: root.clone(),
        },
        &renderer,
    )
    .await?;

    let path = root
        .join("confluence")
        .join("roadmap")
        .join(format!("{}.md", &args.project_id));

    println!(
        "{}",
        serde_json::to_string_pretty(&json!({
            "success": true,
            "project_id": args.project_id,
            "quarter": resolved_quarter,
            "path": path.display().to_string(),
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
            t.join("roadmap.md.hbs"),
            "# {{project_id}} Roadmap\n\n<!-- eket:doc:roadmap -->\n**更新时间**: {{timestamp}}\n\n<!-- eket:section:{{quarter}} -->\n## {{quarter}}\n",
        )
        .unwrap();
    }

    #[tokio::test]
    async fn roadmap_update_creates_file() {
        let dir = TempDir::new().unwrap();
        make_project(&dir);
        let root = dir.path().to_path_buf();
        let renderer = TemplateRenderer::new();

        handle_event(
            DocEvent::RoadmapUpdated {
                project_id: "my-project".to_string(),
                quarter: Some("Q2-2026".to_string()),
                project_root: root.clone(),
            },
            &renderer,
        )
        .await
        .unwrap();

        assert!(root.join("confluence/roadmap/my-project.md").exists());
    }

    #[tokio::test]
    async fn roadmap_update_appends_new_quarter() {
        let dir = TempDir::new().unwrap();
        make_project(&dir);
        let root = dir.path().to_path_buf();
        let renderer = TemplateRenderer::new();

        // Create initial roadmap
        std::fs::create_dir_all(root.join("confluence/roadmap")).unwrap();
        std::fs::write(
            root.join("confluence/roadmap/proj.md"),
            "# proj Roadmap\n\n<!-- eket:doc:roadmap -->\n<!-- eket:section:Q1-2026 -->\n## Q1-2026\n",
        )
        .unwrap();

        handle_event(
            DocEvent::RoadmapUpdated {
                project_id: "proj".to_string(),
                quarter: Some("Q2-2026".to_string()),
                project_root: root.clone(),
            },
            &renderer,
        )
        .await
        .unwrap();

        let content = std::fs::read_to_string(root.join("confluence/roadmap/proj.md")).unwrap();
        assert!(content.contains("<!-- eket:section:Q1-2026 -->"));
        assert!(content.contains("<!-- eket:section:Q2-2026 -->"));
    }
}
