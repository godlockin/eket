/// expert:compose — 按 skills/epic 推荐专家组合
/// expert:skills — 查询专家的 skills 列表
///
/// 用法:
///   eket expert:compose --skills tdd,systematic-debugging [--domain backend]
///   eket expert:compose --epic EPIC-001
///   eket expert:skills backend
use anyhow::Result;
use clap::{Args, Subcommand};
use eket_core::expert_skill_bridge::ExpertSkillBridge;
use serde_json::json;
use std::path::PathBuf;

// ─── Args ────────────────────────────────────────────────────────────────────

#[derive(Args, Debug)]
pub struct ExpertComposeArgs {
    #[command(subcommand)]
    pub command: ExpertSubCmd,
}

#[derive(Subcommand, Debug)]
pub enum ExpertSubCmd {
    /// 按 skills 或 epic 推荐专家组合
    Compose {
        /// 逗号分隔的 skills（如 tdd,systematic-debugging）
        #[arg(long)]
        skills: Option<String>,

        /// 按 domain 额外过滤
        #[arg(long)]
        domain: Option<String>,

        /// 按 EPIC 关键词推荐（如 "feature", "security", "frontend"）
        #[arg(long)]
        epic: Option<String>,
    },
    /// 查看某专家的 skills 列表
    Skills {
        /// 专家 ID（如 "backend", "architect" 或全名 "eket.backend.001"）
        expert_id: String,
    },
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

fn resolve_experts_dir() -> PathBuf {
    if let Ok(d) = std::env::var("EKET_EXPERTS_DIR") {
        return PathBuf::from(d);
    }
    // 默认 ~/.claude/skills/eket/experts/default/
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("/tmp"))
        .join(".claude/skills/eket/experts/default")
}

/// 支持短 ID（如 "backend"）→ 全 ID（"eket.backend.001"）的模糊匹配
fn resolve_expert_id<'a>(
    bridge: &'a ExpertSkillBridge,
    id: &str,
) -> Option<String> {
    // 精确匹配
    let all = bridge.all_experts();
    if let Some(p) = all.iter().find(|p| p.id == id) {
        return Some(p.id.clone());
    }
    // 模糊：domain 包含 id（eket.backend.001 中包含 "backend"）
    if let Some(p) = all.iter().find(|p| p.id.contains(id) || p.domain.contains(id)) {
        return Some(p.id.clone());
    }
    None
}

// ─── Main ─────────────────────────────────────────────────────────────────────

pub async fn run(args: ExpertComposeArgs) -> Result<()> {
    let experts_dir = resolve_experts_dir();

    // 尝试加载，失败则友好提示
    let bridge = match ExpertSkillBridge::load_from_dir(&experts_dir) {
        Ok(b) => b,
        Err(e) => {
            let out = json!({
                "error": format!("Failed to load experts from {:?}: {}", experts_dir, e),
                "hint": "Set EKET_EXPERTS_DIR or ensure ~/.claude/skills/eket/experts/default/ exists"
            });
            println!("{}", serde_json::to_string_pretty(&out)?);
            return Ok(());
        }
    };

    match args.command {
        ExpertSubCmd::Compose { skills, domain: _, epic } => {
            let matches = if let Some(epic_val) = epic {
                bridge.recommend_for_epic(&epic_val)
            } else if let Some(skills_val) = skills {
                let skill_list: Vec<&str> = skills_val
                    .split(',')
                    .map(|s| s.trim())
                    .filter(|s| !s.is_empty())
                    .collect();
                bridge.compose_by_skills(&skill_list)
            } else {
                let out = json!({
                    "error": "Provide --skills <skill1,skill2> or --epic <type>"
                });
                println!("{}", serde_json::to_string_pretty(&out)?);
                return Ok(());
            };

            // 收集所有 matched skills（去重）
            let mut total_covered: Vec<String> = matches
                .iter()
                .flat_map(|m| m.matched_skills.clone())
                .collect();
            total_covered.sort();
            total_covered.dedup();

            // 收集 missing（需要 required 列表）
            // 此处 missing 暂设为空（调用方可自行 diff）
            let out = json!({
                "experts": matches,
                "total_skills_covered": total_covered,
                "missing_skills": []
            });
            println!("{}", serde_json::to_string_pretty(&out)?);
        }

        ExpertSubCmd::Skills { expert_id } => {
            let resolved = resolve_expert_id(&bridge, &expert_id)
                .unwrap_or_else(|| expert_id.clone());

            let primary = bridge.skills_for_expert(&resolved);

            // 获取 contextual（需要访问 all_experts）
            let contextual: Vec<serde_json::Value> = bridge
                .all_experts()
                .into_iter()
                .find(|p| p.id == resolved)
                .and_then(|p| p.skills.as_ref())
                .map(|s| {
                    s.contextual
                        .iter()
                        .map(|cs| json!({ "skill": cs.skill, "when": cs.when }))
                        .collect()
                })
                .unwrap_or_default();

            if primary.is_empty() && contextual.is_empty() {
                let out = json!({
                    "error": format!("Expert '{}' not found or has no skills", expert_id)
                });
                println!("{}", serde_json::to_string_pretty(&out)?);
                return Ok(());
            }

            let out = json!({
                "expert_id": resolved,
                "primary": primary,
                "contextual": contextual
            });
            println!("{}", serde_json::to_string_pretty(&out)?);
        }
    }

    Ok(())
}
