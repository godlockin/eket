/// expert:summon — 按角色召唤/注册 Slaver 实例
///
/// 用法:
///   eket expert:summon --role rust
///   eket expert:summon --from-waiting
use anyhow::Result;
use clap::Args;
use eket_core::{
    config::EketConfig,
    db::{create_pool, SqliteClient},
    expert_skill_bridge::ExpertSkillBridge,
};
use serde_json::json;
use std::path::PathBuf;

// ─── Args ─────────────────────────────────────────────────────────────────────

#[derive(Args, Debug)]
pub struct ExpertSummonArgs {
    /// 要召唤的专家角色，如 rust / frontend / data-engineer
    #[arg(long)]
    pub role: Option<String>,

    /// 读 .eket/state/waiting-for-expert.json，对每条 required 批量召唤
    #[arg(long)]
    pub from_waiting: bool,

    /// SQLite db path (defaults to value from EketConfig)
    #[arg(long)]
    pub db_path: Option<String>,
}

// ─── Waiting-file types ───────────────────────────────────────────────────────

#[derive(serde::Deserialize)]
struct WaitingEntry {
    required: Vec<String>,
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

fn resolve_experts_dir() -> PathBuf {
    if let Ok(d) = std::env::var("EKET_EXPERTS_DIR") {
        return PathBuf::from(d);
    }
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("/tmp"))
        .join(".claude/skills/eket/experts/default")
}

fn waiting_file_path() -> PathBuf {
    let mut dir = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    loop {
        let candidate = dir.join(".eket/state/waiting-for-expert.json");
        if candidate.exists() {
            return candidate;
        }
        if !dir.pop() {
            break;
        }
    }
    // fallback: relative path (will be missing → handled by caller)
    PathBuf::from(".eket/state/waiting-for-expert.json")
}

fn load_roles_from_waiting() -> Result<Vec<String>> {
    let path = waiting_file_path();
    let content = std::fs::read_to_string(&path)
        .map_err(|e| anyhow::anyhow!("Cannot read {}: {}", path.display(), e))?;
    let entries: Vec<WaitingEntry> = serde_json::from_str(&content)?;
    let mut tags: Vec<String> = entries.into_iter().flat_map(|e| e.required).collect();
    tags.sort();
    tags.dedup();
    Ok(tags)
}

fn short_id() -> String {
    format!("{:08x}", rand_u32())
}

fn rand_u32() -> u32 {
    // Use system time as cheap entropy (no extra crate needed).
    use std::time::{SystemTime, UNIX_EPOCH};
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .subsec_nanos();
    // Mix with a thread-local counter via pointer address jitter.
    let jitter = &nanos as *const u32 as u32;
    nanos ^ jitter ^ (nanos.wrapping_mul(2654435761))
}

// ─── Core logic (extracted for testability) ──────────────────────────────────

pub struct SummonResult {
    pub summoned: Vec<String>,
    pub already_exist: Vec<String>,
    pub personas_loaded: Vec<String>,
}

pub fn summon_roles(client: &SqliteClient, roles: &[String]) -> Result<SummonResult> {
    let mut summoned: Vec<String> = Vec::new();
    let mut already_exist: Vec<String> = Vec::new();

    for role in roles {
        let instances = client.list_instances(None)?;
        let exists = instances.iter().any(|inst| {
            inst.role == *role || inst.skills.iter().any(|s| s == role)
        });

        if exists {
            // Return the matching instance id
            let id = instances
                .iter()
                .find(|i| i.role == *role || i.skills.iter().any(|s| s == role))
                .map(|i| i.id.clone())
                .unwrap_or_else(|| role.clone());
            already_exist.push(id);
        } else {
            let instance_id = format!("{}_{}", role, short_id());
            client.upsert_instance(&instance_id, role, &[role.clone()], "idle")?;
            summoned.push(instance_id);
        }
    }

    // Load personas for summoned roles
    let experts_dir = resolve_experts_dir();
    let personas_loaded: Vec<String> = if experts_dir.exists() {
        match ExpertSkillBridge::load_from_dir(&experts_dir) {
            Ok(bridge) => roles
                .iter()
                .filter(|r| summoned.iter().any(|s| s.starts_with(r.as_str())))
                .filter(|r| !bridge.skills_for_expert(r).is_empty())
                .map(|r| r.clone())
                .collect(),
            Err(_) => Vec::new(),
        }
    } else {
        Vec::new()
    };

    Ok(SummonResult {
        summoned,
        already_exist,
        personas_loaded,
    })
}

// ─── Run ──────────────────────────────────────────────────────────────────────

pub async fn run(args: ExpertSummonArgs) -> Result<()> {
    // 1. Determine roles to summon
    let roles: Vec<String> = if let Some(ref role) = args.role {
        vec![role.clone()]
    } else if args.from_waiting {
        load_roles_from_waiting()?
    } else {
        eprintln!("Usage: eket expert:summon --role <role>  OR  --from-waiting");
        return Ok(());
    };

    // 2. Open SQLite
    let db_path = match args.db_path {
        Some(ref p) => p.clone(),
        None => {
            let config = EketConfig::load().unwrap_or_default();
            config.sqlite.path
        }
    };
    let pool = create_pool(&db_path)?;
    let client = SqliteClient::new(pool);

    // 3 + 4. Summon
    let result = summon_roles(&client, &roles)?;

    // 5. Output JSON
    let output = json!({
        "summoned": result.summoned,
        "already_exist": result.already_exist,
        "personas_loaded": result.personas_loaded,
    });
    println!("{}", serde_json::to_string_pretty(&output)?);
    Ok(())
}

// ─── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use eket_core::db::create_pool;
    use std::io::Write;
    use tempfile::TempDir;

    fn make_client_inmem() -> SqliteClient {
        let pool = create_pool(":memory:").unwrap();
        SqliteClient::new(pool)
    }

    #[test]
    fn summon_registers_new_slaver() {
        let client = make_client_inmem();

        // First summon: should register
        let roles = vec!["rust".to_string()];
        let res = summon_roles(&client, &roles).unwrap();
        assert_eq!(res.summoned.len(), 1, "should have summoned 1 instance");
        assert!(res.summoned[0].starts_with("rust_"), "id should start with role prefix");
        assert!(res.already_exist.is_empty(), "should not be already_exist");

        // Verify in DB
        let instances = client.list_instances(None).unwrap();
        assert!(
            instances.iter().any(|i| i.role == "rust" && i.status == "idle"),
            "DB should contain rust slaver with idle status"
        );

        // Second summon: should detect existing
        let res2 = summon_roles(&client, &roles).unwrap();
        assert!(res2.summoned.is_empty(), "should not summon again");
        assert_eq!(res2.already_exist.len(), 1, "should detect existing instance");
    }

    #[test]
    fn summon_from_waiting() {
        let tmp = TempDir::new().unwrap();
        let state_dir = tmp.path().join(".eket/state");
        std::fs::create_dir_all(&state_dir).unwrap();

        let waiting_path = state_dir.join("waiting-for-expert.json");
        let content = r#"[{"ticket_id":"TASK-300","required":["devops"],"since":"2026-05-04T00:00:00Z","retries":2}]"#;
        let mut f = std::fs::File::create(&waiting_path).unwrap();
        f.write_all(content.as_bytes()).unwrap();

        // Parse waiting file directly
        let raw: Vec<WaitingEntry> = serde_json::from_str(content).unwrap();
        let mut tags: Vec<String> = raw.into_iter().flat_map(|e| e.required).collect();
        tags.sort();
        tags.dedup();
        assert_eq!(tags, vec!["devops"]);

        let client = make_client_inmem();
        let res = summon_roles(&client, &tags).unwrap();
        assert_eq!(res.summoned.len(), 1);
        assert!(res.summoned[0].starts_with("devops_"));

        // Verify DB
        let instances = client.list_instances(None).unwrap();
        assert!(
            instances.iter().any(|i| i.role == "devops"),
            "DB should have devops slaver"
        );
    }
}
