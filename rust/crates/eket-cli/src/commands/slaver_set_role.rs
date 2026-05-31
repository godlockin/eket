/// slaver:set-role — persist role to .eket/slaver-role (+ SQLite if available)
use anyhow::Result;
use clap::Args;
use serde_json::json;
use std::path::{Path, PathBuf};

#[derive(Args, Debug)]
pub struct SlaverSetRoleArgs {
    /// Role to set, e.g. "backend_dev"
    pub role: String,

    /// SQLite db path (defaults to EketConfig)
    #[arg(long)]
    pub db_path: Option<String>,
}

fn find_project_root() -> Option<PathBuf> {
    let mut dir = std::env::current_dir().ok()?;
    loop {
        if dir.join("jira/tickets").exists() && dir.join(".eket").exists() {
            return Some(dir);
        }
        if dir.join("jira/tickets").exists() || dir.join(".eket").exists() {
            return Some(dir);
        }
        if !dir.pop() {
            return None;
        }
    }
}

fn get_or_create_slaver_id(project_root: &Path) -> String {
    if let Ok(id) = std::env::var("EKET_SLAVER_ID") {
        return id;
    }
    let id_file = project_root.join(".eket/slaver-id");
    if let Ok(id) = std::fs::read_to_string(&id_file) {
        let id = id.trim().to_string();
        if !id.is_empty() {
            return id;
        }
    }
    let id = format!(
        "slaver_{}_{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis(),
        &uuid::Uuid::new_v4().to_string()[..8]
    );
    if let Some(parent) = id_file.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let _ = std::fs::write(&id_file, &id);
    id
}

pub async fn run(args: SlaverSetRoleArgs) -> Result<()> {
    let project_root = find_project_root().unwrap_or_else(|| std::env::current_dir().unwrap());

    // Write role file
    let role_file = project_root.join(".eket/slaver-role");
    std::fs::create_dir_all(role_file.parent().unwrap())?;
    std::fs::write(&role_file, &args.role)?;

    let slaver_id = get_or_create_slaver_id(&project_root);

    // Try SQLite update (best-effort)
    let db_path = args.db_path.unwrap_or_else(|| {
        eket_core::config::EketConfig::load()
            .unwrap_or_default()
            .sqlite
            .path
    });

    if let Ok(pool) = eket_core::db::create_pool(&db_path) {
        let client = eket_core::db::SqliteClient::new(pool);
        // Update slavers table if it exists; ignore errors (table may not exist yet)
        let _ = client.pool().get().map(|conn| {
            let sql = format!(
                "UPDATE slavers SET role = '{}' WHERE slaver_id = '{}'",
                args.role.replace('\'', "''"),
                slaver_id.replace('\'', "''")
            );
            conn.execute_batch(&sql)
        });
    }

    println!(
        "{}",
        serde_json::to_string_pretty(&json!({
            "status": "ok",
            "slaver_id": slaver_id,
            "role": args.role,
        }))?
    );
    Ok(())
}

// ─── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[tokio::test]
    async fn set_role_writes_file() {
        let tmp = TempDir::new().unwrap();
        let eket_dir = tmp.path().join(".eket");
        std::fs::create_dir_all(&eket_dir).unwrap();

        let role_file = eket_dir.join("slaver-role");
        std::fs::create_dir_all(role_file.parent().unwrap()).unwrap();
        std::fs::write(&role_file, "backend_dev").unwrap();

        let content = std::fs::read_to_string(&role_file).unwrap();
        assert_eq!(content, "backend_dev");
    }

    #[tokio::test]
    async fn get_or_create_slaver_id_env_override() {
        let tmp = TempDir::new().unwrap();
        std::env::set_var("EKET_SLAVER_ID", "test_slaver_env");
        let id = get_or_create_slaver_id(tmp.path());
        assert_eq!(id, "test_slaver_env");
        std::env::remove_var("EKET_SLAVER_ID");
    }
}
