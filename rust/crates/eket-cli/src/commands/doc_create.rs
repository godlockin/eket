/// doc:create — create design/adr/runbook/onboarding document
///
/// Usage: eket doc:create <TYPE> <ID> "<title>"
///   TYPE: design | adr | runbook | onboarding
use anyhow::Result;
use clap::Parser;
use eket_core::doc_lifecycle::{handle_event, DocEvent, TemplateRenderer};
use serde_json::json;
use std::path::PathBuf;

#[derive(Parser, Debug)]
pub struct DocCreateArgs {
    /// Document type: design | adr | runbook | onboarding
    pub doc_type: String,

    /// Document ID (e.g. ADR-001)
    pub doc_id: String,

    /// Document title
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
    anyhow::bail!("Cannot find project root (no jira/ directory found).")
}

pub async fn run(args: DocCreateArgs) -> Result<()> {
    match args.doc_type.as_str() {
        "design" | "adr" | "runbook" | "onboarding" => {}
        other => {
            anyhow::bail!("Invalid type '{other}'. Must be: design | adr | runbook | onboarding")
        }
    }

    let root = find_project_root()?;
    let renderer = TemplateRenderer::new();

    handle_event(
        DocEvent::DesignDocCreated {
            doc_type: args.doc_type.clone(),
            doc_id: args.doc_id.clone(),
            title: args.title.clone(),
            project_root: root.clone(),
        },
        &renderer,
    )
    .await?;

    let path = root
        .join("confluence")
        .join(&args.doc_type)
        .join(format!("{}.md", &args.doc_id));

    println!(
        "{}",
        serde_json::to_string_pretty(&json!({
            "success": true,
            "type": args.doc_type,
            "id": args.doc_id,
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
            t.join("design.md.hbs"),
            "# 设计文档: {{doc_id}} — {{title}}\n<!-- eket:doc:{{doc_type}} -->\n**创建时间**: {{timestamp}}\n",
        )
        .unwrap();
    }

    #[tokio::test]
    async fn doc_create_writes_design() {
        let dir = TempDir::new().unwrap();
        make_project(&dir);
        let root = dir.path().to_path_buf();
        let renderer = TemplateRenderer::new();

        handle_event(
            DocEvent::DesignDocCreated {
                doc_type: "design".to_string(),
                doc_id: "DESIGN-001".to_string(),
                title: "Test Design".to_string(),
                project_root: root.clone(),
            },
            &renderer,
        )
        .await
        .unwrap();

        assert!(root.join("confluence/design/DESIGN-001.md").exists());
    }

    #[tokio::test]
    async fn doc_create_adr() {
        let dir = TempDir::new().unwrap();
        make_project(&dir);
        let root = dir.path().to_path_buf();
        let renderer = TemplateRenderer::new();

        handle_event(
            DocEvent::DesignDocCreated {
                doc_type: "adr".to_string(),
                doc_id: "ADR-001".to_string(),
                title: "Use PostgreSQL".to_string(),
                project_root: root.clone(),
            },
            &renderer,
        )
        .await
        .unwrap();

        assert!(root.join("confluence/adr/ADR-001.md").exists());
    }
}
