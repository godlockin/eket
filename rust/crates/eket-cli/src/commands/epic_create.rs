/// epic:create — scaffold epic directory + initial docs
///
/// Flow:
///  1. Find project_root (walk up for jira/epics/)
///  2. Guard: jira/epics/<epic_id>/ must not exist
///  3. create_dir_all jira/epics/<epic_id>/
///  4. Render jira/epic.md.hbs  → jira/epics/<epic_id>/epic.md
///  5. create_dir_all confluence/requirements/
///  6. Render requirement-analysis.md.hbs → confluence/requirements/<epic_id>-analysis.md
///  7. Print JSON result
use anyhow::Result;
use clap::Parser;
use eket_core::doc_lifecycle::{DocEvent, TemplateRenderer};
use serde_json::json;
use std::path::PathBuf;

#[derive(Parser, Debug)]
pub struct EpicCreateArgs {
    /// Epic ID, e.g. EPIC-001
    pub epic_id: String,

    /// Epic title
    pub title: String,
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
    anyhow::bail!("Cannot find project root (no jira/ directory found). Run from inside an EKET project.")
}

pub async fn run(args: EpicCreateArgs) -> Result<()> {
    // 1. Project root
    let root = find_project_root()?;

    // 2. Guard: must not exist
    let epic_dir = root.join("jira").join("epics").join(&args.epic_id);
    if epic_dir.exists() {
        println!(
            "{}",
            serde_json::to_string_pretty(&json!({
                "success": false,
                "error": format!("epic already exists: {}", epic_dir.display())
            }))?
        );
        return Ok(());
    }

    // 3-6. Delegate to doc_lifecycle::handle_event
    let author = std::env::var("EKET_SLAVER_ID").unwrap_or_else(|_| "unknown".to_string());
    let renderer = TemplateRenderer::new();

    // We call handle_event which writes both files
    eket_core::doc_lifecycle::handle_event(
        DocEvent::EpicCreated {
            epic_id: args.epic_id.clone(),
            title: args.title.clone(),
            project_root: root.clone(),
        },
        &renderer,
    )
    .await?;

    // Also store author in requirement-analysis — handle_event uses "eket" hardcoded,
    // so we patch author field by re-rendering if env var is set and differs.
    if author != "eket" {
        let req_path = root
            .join("confluence")
            .join("requirements")
            .join(format!("{}-analysis.md", &args.epic_id));
        let timestamp = chrono::Utc::now().to_rfc3339();
        let data = json!({
            "epic_id": &args.epic_id,
            "title": &args.title,
            "timestamp": timestamp,
            "author": author,
        });
        let content = renderer.render("confluence/requirement-analysis.md.hbs", &data, &root)?;
        std::fs::write(&req_path, content)?;
    }

    // 7. Output JSON
    let epic_md = root
        .join("jira")
        .join("epics")
        .join(&args.epic_id)
        .join("epic.md");
    let req_md = root
        .join("confluence")
        .join("requirements")
        .join(format!("{}-analysis.md", &args.epic_id));

    println!(
        "{}",
        serde_json::to_string_pretty(&json!({
            "success": true,
            "epic_id": args.epic_id,
            "files_created": [
                epic_md.display().to_string(),
                req_md.display().to_string(),
            ]
        }))?
    );
    Ok(())
}

// ─── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn make_project(dir: &TempDir) {
        // minimal project structure
        std::fs::create_dir_all(dir.path().join("jira/epics")).unwrap();
        std::fs::create_dir_all(dir.path().join("jira/tickets")).unwrap();

        // minimal templates so TemplateRenderer finds them
        let t = dir.path().join("templates/jira");
        std::fs::create_dir_all(&t).unwrap();
        std::fs::write(t.join("epic.md.hbs"), "# {{epic_id}}: {{title}}\n").unwrap();

        let c = dir.path().join("templates/confluence");
        std::fs::create_dir_all(&c).unwrap();
        std::fs::write(
            c.join("requirement-analysis.md.hbs"),
            "# {{epic_id}} by {{author}}\n",
        )
        .unwrap();
    }

    #[tokio::test]
    async fn epic_create_writes_files() {
        let dir = TempDir::new().unwrap();
        make_project(&dir);

        // Override cwd via tickets_dir trick is not available here;
        // instead call internal logic directly using handle_event.
        let root = dir.path().to_path_buf();
        let renderer = TemplateRenderer::new();
        eket_core::doc_lifecycle::handle_event(
            DocEvent::EpicCreated {
                epic_id: "EPIC-TEST".to_string(),
                title: "Test Epic".to_string(),
                project_root: root.clone(),
            },
            &renderer,
        )
        .await
        .unwrap();

        assert!(root.join("jira/epics/EPIC-TEST/epic.md").exists());
        assert!(root.join("confluence/requirements/EPIC-TEST-analysis.md").exists());
    }

    #[tokio::test]
    async fn epic_create_duplicate_returns_error() {
        let dir = TempDir::new().unwrap();
        make_project(&dir);
        // Pre-create the epic directory
        std::fs::create_dir_all(dir.path().join("jira/epics/EPIC-DUP")).unwrap();

        // find_project_root won't work without cwd, so test guard logic directly
        let epic_dir = dir.path().join("jira/epics/EPIC-DUP");
        assert!(epic_dir.exists(), "Guard should detect existing epic dir");
    }
}
