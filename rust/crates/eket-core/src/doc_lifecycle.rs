/// DocLifecycleMiddleware — auto-writes docs on EKET events.
///
/// Template lookup order:
///   1. <project_root>/templates/
///   2. ~/.eket/templates/
///   3. Built-in strings
use async_trait::async_trait;
use handlebars::Handlebars;
use serde_json::json;
use std::path::{Path, PathBuf};

use crate::middleware_pipeline::{Middleware, PipelineCtx};

// ─── DocEvent ─────────────────────────────────────────────────────────────────

#[derive(Debug, serde::Serialize, serde::Deserialize)]
#[serde(tag = "type")]
pub enum DocEvent {
    EpicCreated { epic_id: String, title: String, project_root: PathBuf },
    EpicPlanned { epic_id: String, project_root: PathBuf },
    TaskClaimed { ticket_id: String, slaver_id: String, project_root: PathBuf },
    TaskCompleted {
        ticket_id: String,
        title: String,
        slaver_id: String,
        project_root: PathBuf,
    },
    TaskTested {
        ticket_id: String,
        status: String,
        coverage: Option<u8>,
        project_root: PathBuf,
    },
    ExpertReviewed { topic: String, project_root: PathBuf },
}

// ─── TemplateRenderer ─────────────────────────────────────────────────────────

pub struct TemplateRenderer {
    handlebars: Handlebars<'static>,
}

impl TemplateRenderer {
    pub fn new() -> Self {
        Self { handlebars: Handlebars::new() }
    }

    /// Render template_name with data.
    /// Lookup: project_root/templates/ > ~/.eket/templates/ > built-in.
    pub fn render(
        &self,
        template_name: &str,
        data: &serde_json::Value,
        project_root: &Path,
    ) -> anyhow::Result<String> {
        // Search order for template file
        let candidates = {
            let mut v = vec![project_root.join("templates").join(template_name)];
            if let Some(home) = dirs::home_dir() {
                v.push(home.join(".eket").join("templates").join(template_name));
            }
            v
        };

        for path in &candidates {
            if path.exists() {
                let src = std::fs::read_to_string(path)?;
                let rendered = self.handlebars.render_template(&src, data)?;
                return Ok(rendered);
            }
        }

        // Fall back to built-ins
        let builtin = builtin_template(template_name)
            .ok_or_else(|| anyhow::anyhow!("No template found: {template_name}"))?;
        let rendered = self.handlebars.render_template(builtin, data)?;
        Ok(rendered)
    }
}

impl Default for TemplateRenderer {
    fn default() -> Self {
        Self::new()
    }
}

fn builtin_template(name: &str) -> Option<&'static str> {
    match name {
        "confluence/requirement-analysis.md.hbs" => Some(include_str!(
            "../../../../templates/confluence/requirement-analysis.md.hbs"
        )),
        "confluence/architecture-plan.md.hbs" => Some(include_str!(
            "../../../../templates/confluence/architecture-plan.md.hbs"
        )),
        "confluence/retrospective.md.hbs" => Some(include_str!(
            "../../../../templates/confluence/retrospective.md.hbs"
        )),
        "confluence/expert-review.md.hbs" => {
            Some(include_str!("../../../../templates/confluence/expert-review.md.hbs"))
        }
        "jira/epic.md.hbs" => {
            Some(include_str!("../../../../templates/jira/epic.md.hbs"))
        }
        _ => None,
    }
}

// ─── handle_event ─────────────────────────────────────────────────────────────

pub async fn handle_event(
    event: DocEvent,
    renderer: &TemplateRenderer,
) -> anyhow::Result<()> {
    let now = chrono::Utc::now();
    let timestamp = now.to_rfc3339();
    let date = now.format("%Y-%m-%d").to_string();

    match event {
        DocEvent::EpicCreated { ref epic_id, ref title, ref project_root } => {
            // jira/epics/<EPIC>/epic.md
            let epic_path =
                project_root.join("jira").join("epics").join(epic_id).join("epic.md");
            let data = json!({ "epic_id": epic_id, "title": title, "timestamp": timestamp });
            write_rendered(renderer, "jira/epic.md.hbs", &data, project_root, &epic_path)?;

            // confluence/requirements/<EPIC>-analysis.md
            let req_path = project_root
                .join("confluence")
                .join("requirements")
                .join(format!("{epic_id}-analysis.md"));
            let data2 = json!({ "epic_id": epic_id, "title": title, "timestamp": timestamp, "author": "eket" });
            write_rendered(
                renderer,
                "confluence/requirement-analysis.md.hbs",
                &data2,
                project_root,
                &req_path,
            )?;
        }

        DocEvent::EpicPlanned { ref epic_id, ref project_root } => {
            let plan_path = project_root
                .join("confluence")
                .join("architecture")
                .join(format!("{epic_id}-plan.md"));
            let data = json!({ "epic_id": epic_id, "timestamp": timestamp });
            write_rendered(
                renderer,
                "confluence/architecture-plan.md.hbs",
                &data,
                project_root,
                &plan_path,
            )?;
        }

        DocEvent::TaskClaimed { ref ticket_id, ref slaver_id, ref project_root } => {
            let ticket_path = find_ticket_path(project_root, ticket_id);
            if let Some(path) = ticket_path {
                let section_content = format!(
                    "\n## 分析记录\n\n**领取时间**: {timestamp}\n**执行者**: {slaver_id}\n\nTODO: 填写分析结论\n"
                );
                append_section_if_absent(&path, "## 分析记录", &section_content)?;
            }
        }

        DocEvent::TaskCompleted { ref ticket_id, ref title, ref slaver_id, ref project_root } => {
            let retro_path = project_root
                .join("confluence")
                .join("memory")
                .join("retrospectives")
                .join(format!("{date}-{ticket_id}.md"));
            let data = json!({
                "ticket_id": ticket_id,
                "title": title,
                "completed_at": timestamp,
                "slaver_id": slaver_id,
                "execution_summary": "TODO: 填写执行摘要",
            });
            write_rendered(
                renderer,
                "confluence/retrospective.md.hbs",
                &data,
                project_root,
                &retro_path,
            )?;
        }

        DocEvent::TaskTested { ref ticket_id, ref status, coverage, ref project_root } => {
            let ticket_path = find_ticket_path(project_root, ticket_id);
            if let Some(path) = ticket_path {
                let cov_str = coverage
                    .map(|c| format!("{c}%"))
                    .unwrap_or_else(|| "N/A".to_string());
                let section_content = format!(
                    "\n## 测试记录\n\n**测试时间**: {timestamp}\n**状态**: {status}\n**覆盖率**: {cov_str}\n"
                );
                append_section_if_absent(&path, "## 测试记录", &section_content)?;
            }
        }

        DocEvent::ExpertReviewed { ref topic, ref project_root } => {
            let review_path = project_root
                .join("docs")
                .join("reviews")
                .join(format!("{date}-{}.md", slugify(topic)));
            let data = json!({ "topic": topic, "date": date });
            write_rendered(
                renderer,
                "confluence/expert-review.md.hbs",
                &data,
                project_root,
                &review_path,
            )?;
        }
    }

    Ok(())
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

fn write_rendered(
    renderer: &TemplateRenderer,
    template_name: &str,
    data: &serde_json::Value,
    project_root: &Path,
    dest: &Path,
) -> anyhow::Result<()> {
    let content = renderer.render(template_name, data, project_root)?;
    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(dest, content)?;
    Ok(())
}

/// Append `content` to `file_path` if `section_marker` not already present.
pub fn append_section_if_absent(
    file_path: &Path,
    section_marker: &str,
    content: &str,
) -> anyhow::Result<()> {
    if file_path.exists() {
        let existing = std::fs::read_to_string(file_path)?;
        if existing.contains(section_marker) {
            return Ok(()); // idempotent
        }
        let mut f = std::fs::OpenOptions::new().append(true).open(file_path)?;
        use std::io::Write;
        f.write_all(content.as_bytes())?;
    }
    Ok(())
}

fn find_ticket_path(project_root: &Path, ticket_id: &str) -> Option<PathBuf> {
    let p = project_root.join("jira").join("tickets").join(format!("{ticket_id}.md"));
    if p.exists() { Some(p) } else { None }
}

fn slugify(s: &str) -> String {
    s.chars()
        .map(|c| if c.is_alphanumeric() || c == '-' { c.to_ascii_lowercase() } else { '-' })
        .collect()
}

// ─── DocLifecycleMiddleware ───────────────────────────────────────────────────

pub struct DocLifecycleMiddleware;

#[async_trait]
impl Middleware for DocLifecycleMiddleware {
    fn name(&self) -> &str {
        "doc_lifecycle"
    }

    async fn pre(&self, _ctx: &mut PipelineCtx) -> anyhow::Result<()> {
        Ok(())
    }

    async fn post(&self, ctx: &mut PipelineCtx) -> anyhow::Result<()> {
        if let Some(raw) = ctx.metadata.get("doc_event") {
            match serde_json::from_value::<DocEvent>(raw.clone()) {
                Ok(event) => {
                    let renderer = TemplateRenderer::new();
                    if let Err(e) = handle_event(event, &renderer).await {
                        eprintln!("[WARN] doc_lifecycle: {e}");
                    }
                }
                Err(e) => {
                    eprintln!("[WARN] doc_lifecycle: failed to deserialize doc_event: {e}");
                }
            }
        }
        Ok(())
    }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn append_section_idempotent() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("ticket.md");
        std::fs::write(&path, "# Ticket\n\n## 分析记录\n\nExisting content\n").unwrap();

        append_section_if_absent(&path, "## 分析记录", "\n## 分析记录\n\nNew\n").unwrap();
        let content = std::fs::read_to_string(&path).unwrap();
        assert_eq!(content.matches("## 分析记录").count(), 1);
    }

    #[test]
    fn append_section_adds_when_absent() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("ticket.md");
        std::fs::write(&path, "# Ticket\n\nSome content\n").unwrap();

        append_section_if_absent(&path, "## 分析记录", "\n## 分析记录\n\nNew\n").unwrap();
        let content = std::fs::read_to_string(&path).unwrap();
        assert!(content.contains("## 分析记录"));
    }

    #[tokio::test]
    async fn epic_created_writes_files() {
        let dir = tempdir().unwrap();
        let root = dir.path().to_path_buf();

        // Need template files — write minimal ones
        let tpl_dir = root.join("templates").join("jira");
        std::fs::create_dir_all(&tpl_dir).unwrap();
        std::fs::write(tpl_dir.join("epic.md.hbs"), "# {{epic_id}}: {{title}}\n").unwrap();

        let req_dir = root.join("templates").join("confluence");
        std::fs::create_dir_all(&req_dir).unwrap();
        std::fs::write(
            req_dir.join("requirement-analysis.md.hbs"),
            "# {{epic_id}}: {{title}}\n",
        )
        .unwrap();

        let renderer = TemplateRenderer::new();
        let event = DocEvent::EpicCreated {
            epic_id: "EPIC-001".to_string(),
            title: "Test Epic".to_string(),
            project_root: root.clone(),
        };
        handle_event(event, &renderer).await.unwrap();

        assert!(root.join("jira/epics/EPIC-001/epic.md").exists());
        assert!(root.join("confluence/requirements/EPIC-001-analysis.md").exists());
    }
}
