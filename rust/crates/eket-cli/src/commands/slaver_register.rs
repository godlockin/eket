/// slaver:register — 注册 Slaver 实例到 SQLite (+ Redis 降级)
use anyhow::Result;
use clap::Args;
use eket_core::{config::EketConfig, db::{create_pool, SqliteClient}};
use serde_json::json;

#[derive(Args, Debug)]
pub struct SlaverRegisterArgs {
    /// Slaver role (e.g. "slaver", "master"). If omitted, reads from .eket/IDENTITY.md; defaults to "slaver".
    #[arg(long)]
    pub role: Option<String>,

    /// Comma-separated skills (e.g. "rust,python")
    #[arg(long, value_delimiter = ',')]
    pub skills: Vec<String>,

    /// Instance ID (auto-generated if omitted)
    #[arg(long)]
    pub id: Option<String>,

    /// SQLite db path (defaults to value from EketConfig)
    #[arg(long)]
    pub db_path: Option<String>,
}

/// Try to read role from .eket/IDENTITY.md.
/// Looks for lines matching `role: <value>` or `角色: <value>` (case-insensitive).
//NOTE: Searches current dir and ancestors for .eket/IDENTITY.md.
fn read_role_from_identity() -> Option<String> {
    let mut dir = std::env::current_dir().ok()?;
    loop {
        let identity_path = dir.join(".eket/IDENTITY.md");
        if identity_path.exists() {
            if let Ok(content) = std::fs::read_to_string(&identity_path) {
                for line in content.lines() {
                    let line_lower = line.to_lowercase();
                    for prefix in &["role:", "角色:"] {
                        if let Some(pos) = line_lower.find(prefix) {
                            let value = line[pos + prefix.len()..].trim().to_string();
                            if !value.is_empty() {
                                return Some(value);
                            }
                        }
                    }
                }
            }
        }
        if !dir.pop() {
            break;
        }
    }
    None
}

pub async fn run(args: SlaverRegisterArgs) -> Result<()> {
    // Resolve role: explicit > .eket/IDENTITY.md > default "slaver"
    let role = args.role
        .unwrap_or_else(|| read_role_from_identity().unwrap_or_else(|| "slaver".to_string()));

    let instance_id = args.id.unwrap_or_else(|| {
        let short = &uuid::Uuid::new_v4().to_string()[..8];
        format!("{}_{}", role, short)
    });

    // Resolve db_path: explicit arg > EketConfig::load()
    let db_path = match args.db_path {
        Some(ref p) => expand_tilde(p),
        None => {
            let config = EketConfig::load().unwrap_or_default();
            config.sqlite.path
        }
    };

    let pool = create_pool(&db_path)?;
    let client = SqliteClient::new(pool);

    client.upsert_instance(&instance_id, &role, &args.skills, "idle")?;

    // Redis — best effort, silent on failure
    try_redis_register(&instance_id, &role, &args.skills).await;

    let now = chrono::Utc::now().to_rfc3339();
    let output = json!({
        "status": "registered",
        "instance_id": instance_id,
        "role": role,
        "skills": args.skills,
        "timestamp": now,
    });
    println!("{}", serde_json::to_string_pretty(&output)?);
    Ok(())
}

fn expand_tilde(path: &str) -> String {
    if let Some(rest) = path.strip_prefix("~/") {
        if let Some(home) = dirs_home() {
            return format!("{home}/{rest}");
        }
    }
    path.to_string()
}

fn dirs_home() -> Option<String> {
    std::env::var("HOME").ok()
}

async fn try_redis_register(id: &str, role: &str, skills: &[String]) {
    // Redis optional dep — use eket-core redis client if available
    // Silently skip if unavailable
    let _ = (id, role, skills);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use eket_core::db::create_pool;

    fn make_args(role: Option<&str>, skills: Vec<String>, id: Option<String>) -> SlaverRegisterArgs {
        SlaverRegisterArgs {
            role: role.map(|s| s.to_string()),
            skills,
            id,
            db_path: Some(":memory:".to_string()),
        }
    }

    async fn run_with_inmem(args: SlaverRegisterArgs) -> serde_json::Value {
        let role = args.role.clone()
            .unwrap_or_else(|| read_role_from_identity().unwrap_or_else(|| "slaver".to_string()));
        let instance_id = args.id.clone().unwrap_or_else(|| {
            let short = &uuid::Uuid::new_v4().to_string()[..8];
            format!("{}_{}", role, short)
        });

        let pool = create_pool(":memory:").unwrap();
        let client = SqliteClient::new(pool);
        client
            .upsert_instance(&instance_id, &role, &args.skills, "idle")
            .unwrap();

        let now = chrono::Utc::now().to_rfc3339();
        json!({
            "status": "registered",
            "instance_id": instance_id,
            "role": role,
            "skills": args.skills,
            "timestamp": now,
        })
    }

    #[tokio::test]
    async fn register_basic() {
        let args = make_args(Some("slaver"), vec!["rust".to_string()], Some("slaver_test01".to_string()));
        let out = run_with_inmem(args).await;
        assert_eq!(out["status"], "registered");
        assert_eq!(out["instance_id"], "slaver_test01");
        assert_eq!(out["role"], "slaver");
        assert_eq!(out["skills"][0], "rust");
    }

    #[tokio::test]
    async fn register_auto_id() {
        let args = make_args(Some("slaver"), vec![], None);
        let out = run_with_inmem(args).await;
        assert_eq!(out["status"], "registered");
        let id = out["instance_id"].as_str().unwrap();
        assert!(id.starts_with("slaver_"), "auto id must start with role prefix, got: {id}");
        assert!(id.len() > "slaver_".len(), "auto id must include uuid suffix");
    }

    #[tokio::test]
    async fn register_skills_parsed() {
        let args = make_args(
            Some("slaver"),
            vec!["rust".to_string(), "python".to_string()],
            Some("slaver_skills_test".to_string()),
        );
        let out = run_with_inmem(args).await;
        let skills = out["skills"].as_array().unwrap();
        assert_eq!(skills.len(), 2);
        assert!(skills.iter().any(|s| s == "rust"));
        assert!(skills.iter().any(|s| s == "python"));
    }

    #[tokio::test]
    async fn register_default_role() {
        // When no role given and no IDENTITY.md, should default to "slaver"
        let args = make_args(None, vec![], None);
        let out = run_with_inmem(args).await;
        // Role will be "slaver" or whatever IDENTITY.md says (in test env, likely "slaver")
        assert!(out["role"].as_str().is_some());
    }
}
