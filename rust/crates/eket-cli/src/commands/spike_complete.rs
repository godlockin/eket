/// spike:complete — mark spike done + write findings doc
///
/// Usage: eket spike:complete <SPIKE_ID> --outcome adopt|reject|defer [--notes "<text>"]
use anyhow::Result;
use clap::Parser;
use eket_core::doc_lifecycle::{DocEvent, TemplateRenderer, handle_event};
use serde_json::json;
use std::path::PathBuf;

#[derive(Parser, Debug)]
pub struct SpikeCompleteArgs {
    /// Spike ID (e.g. SPIKE-001)
    pub spike_id: String,

    /// Outcome: adopt | reject | defer
    #[arg(long)]
    pub outcome: String,

    /// Optional notes to append
    #[arg(long)]
    pub notes: Option<String>,
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

pub async fn run(args: SpikeCompleteArgs) -> Result<()> {
    // Validate outcome
    match args.outcome.as_str() {
        "adopt" | "reject" | "defer" => {}
        other => anyhow::bail!("Invalid outcome '{other}'. Must be: adopt | reject | defer"),
    }

    let root = find_project_root()?;
    let renderer = TemplateRenderer::new();

    // Update ticket status
    let ticket_path = root.join("jira").join("tickets").join(format!("{}.md", &args.spike_id));
    if ticket_path.exists() {
        let content = std::fs::read_to_string(&ticket_path)?;
        let updated = content.replace("**状态**: todo", "**状态**: done")
                             .replace("**状态**: in-progress", "**状态**: done");
        std::fs::write(&ticket_path, updated)?;
    }

    handle_event(
        DocEvent::SpikeCompleted {
            spike_id: args.spike_id.clone(),
            outcome: args.outcome.clone(),
            project_root: root.clone(),
        },
        &renderer,
    )
    .await?;

    let findings_path = root
        .join("confluence")
        .join("spikes")
        .join(&args.spike_id)
        .join("findings.md");

    // Append notes if provided
    if let Some(ref notes) = args.notes {
        if findings_path.exists() {
            use std::io::Write as IoWrite;
            let mut f = std::fs::OpenOptions::new().append(true).open(&findings_path)?;
            writeln!(f, "\n## 备注\n\n{notes}")?;
        }
    }

    println!(
        "{}",
        serde_json::to_string_pretty(&json!({
            "success": true,
            "spike_id": args.spike_id,
            "outcome": args.outcome,
            "findings": findings_path.display().to_string(),
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
            t.join("spike-findings.md.hbs"),
            "# Spike 结论: {{spike_id}}\n<!-- eket:doc:spike-findings -->\n**完成时间**: {{timestamp}}\n**结论**: {{outcome}}\n",
        )
        .unwrap();
    }

    #[tokio::test]
    async fn spike_complete_writes_findings() {
        let dir = TempDir::new().unwrap();
        make_project(&dir);
        let root = dir.path().to_path_buf();
        let renderer = TemplateRenderer::new();

        handle_event(
            DocEvent::SpikeCompleted {
                spike_id: "SPIKE-001".to_string(),
                outcome: "adopt".to_string(),
                project_root: root.clone(),
            },
            &renderer,
        )
        .await
        .unwrap();

        assert!(root.join("confluence/spikes/SPIKE-001/findings.md").exists());
    }
}
