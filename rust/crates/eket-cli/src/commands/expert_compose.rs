/// expert:compose — 按 skills/epic 推荐专家组合
/// expert:skills  — 查询专家的 skills 列表
/// expert:search  — 跨 default+extended 搜索专家/skills
///
/// 用法:
///   eket expert:compose --skills tdd,systematic-debugging
///   eket expert:compose --epic EPIC-001
///   eket expert:skills backend
///   eket expert:search "security"
///   eket expert:search "nlp" --pkg extended
use anyhow::Result;
use clap::{Args, Subcommand};
use eket_core::expert_skill_bridge::ExpertSkillBridge;
use serde_json::json;
use std::path::PathBuf;

// ─── Args ─────────────────────────────────────────────────────────────────────

#[derive(Args, Debug)]
pub struct ExpertComposeArgs {
    #[command(subcommand)]
    pub command: ExpertSubCmd,
}

#[derive(Subcommand, Debug)]
pub enum ExpertSubCmd {
    /// 按 skills 或 epic 推荐专家组合
    Compose {
        #[arg(long)]
        skills: Option<String>,
        #[arg(long)]
        domain: Option<String>,
        #[arg(long)]
        epic: Option<String>,
    },
    /// 查看某专家的 skills 列表
    Skills { expert_id: String },
    /// 跨 default+extended 搜索专家/skills（关键词匹配 id/name/role/domain/skills）
    Search {
        keyword: String,
        /// 限定搜索包："default" | "extended"，不填=全部
        #[arg(long)]
        pkg: Option<String>,
        /// 最多返回 N 条（默认 10）
        #[arg(long, default_value = "10")]
        limit: usize,
    },
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/// 返回所有要加载的 (目录, pkg标签)
fn resolve_all_expert_dirs() -> Vec<(PathBuf, String)> {
    let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("/tmp"));
    let base = home.join(".claude/skills/eket/experts");
    let mut dirs = vec![];

    let default_dir = base.join("default");
    if default_dir.exists() {
        dirs.push((default_dir, "default".to_string()));
    }
    // extended submodule clone 到 extended/experts/
    let extended_dir = base.join("extended/experts");
    if extended_dir.exists() {
        dirs.push((extended_dir, "extended".to_string()));
    }
    if let Ok(extra) = std::env::var("EKET_EXPERTS_DIR") {
        let p = PathBuf::from(&extra);
        if p.exists() {
            dirs.push((p, "custom".to_string()));
        }
    }
    dirs
}

fn resolve_experts_dir() -> PathBuf {
    if let Ok(d) = std::env::var("EKET_EXPERTS_DIR") {
        return PathBuf::from(d);
    }
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("/tmp"))
        .join(".claude/skills/eket/experts/default")
}

fn resolve_expert_id(bridge: &ExpertSkillBridge, id: &str) -> Option<String> {
    let all = bridge.all_experts();
    if let Some(p) = all.iter().find(|p| p.id == id) {
        return Some(p.id.clone());
    }
    if let Some(p) = all.iter().find(|p| p.id.contains(id) || p.domain.contains(id)) {
        return Some(p.id.clone());
    }
    None
}

// ─── Main ─────────────────────────────────────────────────────────────────────

pub async fn run(args: ExpertComposeArgs) -> Result<()> {
    match args.command {
        ExpertSubCmd::Search { keyword, pkg, limit } => {
            let all_dirs = resolve_all_expert_dirs();
            if all_dirs.is_empty() {
                println!("{}", json!({"error": "No expert dirs found", "hint": "Check ~/.claude/skills/eket/experts/"}));
                return Ok(());
            }
            let search_dirs: Vec<(PathBuf, String)> = if let Some(ref pf) = pkg {
                all_dirs.into_iter().filter(|(_, p)| p == pf).collect()
            } else {
                all_dirs
            };

            let bridge = match ExpertSkillBridge::load_from_dirs(&search_dirs) {
                Ok(b) => b,
                Err(e) => { println!("{}", json!({"error": e.to_string()})); return Ok(()); }
            };

            let results = bridge.search(&keyword);
            let total = results.len();
            let shown: Vec<serde_json::Value> = results.into_iter().take(limit).map(|r| {
                let load_hint = if r.expert.source_pkg == "extended" {
                    format!("eket expert:search \"{keyword}\" --pkg extended  # then load via EKET_EXPERTS_DIR or submodule")
                } else {
                    format!("eket expert:skills {}", r.expert.id)
                };
                json!({
                    "id":       r.expert.id,
                    "name":     r.expert.name_cn,
                    "role":     r.expert.role,
                    "emoji":    r.expert.emoji,
                    "domain":   r.expert.domain,
                    "pkg":      r.expert.source_pkg,
                    "score":    r.score,
                    "matched":  r.matched_fields,
                    "skills":   r.expert.skills.as_ref().map(|s| &s.primary),
                    "load_hint": load_hint,
                })
            }).collect();

            println!("{}", serde_json::to_string_pretty(&json!({
                "keyword": keyword,
                "total_matches": total,
                "shown": shown.len(),
                "results": shown,
            }))?);
        }

        ExpertSubCmd::Compose { skills, domain: _, epic } => {
            let experts_dir = resolve_experts_dir();
            let bridge = match ExpertSkillBridge::load_from_dir(&experts_dir) {
                Ok(b) => b,
                Err(e) => { println!("{}", json!({"error": e.to_string()})); return Ok(()); }
            };
            let matches = if let Some(ev) = epic {
                bridge.recommend_for_epic(&ev)
            } else if let Some(sv) = skills {
                let sl: Vec<&str> = sv.split(',').map(|s| s.trim()).filter(|s| !s.is_empty()).collect();
                bridge.compose_by_skills(&sl)
            } else {
                println!("{}", json!({"error": "Provide --skills or --epic"}));
                return Ok(());
            };
            let mut covered: Vec<String> = matches.iter().flat_map(|m| m.matched_skills.clone()).collect();
            covered.sort(); covered.dedup();
            println!("{}", serde_json::to_string_pretty(&json!({"experts": matches, "total_skills_covered": covered, "missing_skills": []}))?);
        }

        ExpertSubCmd::Skills { expert_id } => {
            let experts_dir = resolve_experts_dir();
            let bridge = match ExpertSkillBridge::load_from_dir(&experts_dir) {
                Ok(b) => b,
                Err(e) => { println!("{}", json!({"error": e.to_string()})); return Ok(()); }
            };
            let resolved = resolve_expert_id(&bridge, &expert_id).unwrap_or_else(|| expert_id.clone());
            let primary = bridge.skills_for_expert(&resolved);
            let contextual: Vec<serde_json::Value> = bridge.all_experts().into_iter()
                .find(|p| p.id == resolved)
                .and_then(|p| p.skills.as_ref())
                .map(|s| s.contextual.iter().map(|cs| json!({"skill": cs.skill, "when": cs.when})).collect())
                .unwrap_or_default();
            if primary.is_empty() && contextual.is_empty() {
                println!("{}", json!({"error": format!("Expert '{}' not found or has no skills", expert_id)}));
                return Ok(());
            }
            println!("{}", serde_json::to_string_pretty(&json!({"expert_id": resolved, "primary": primary, "contextual": contextual}))?);
        }
    }
    Ok(())
}
