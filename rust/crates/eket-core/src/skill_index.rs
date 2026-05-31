//! skill_index.rs — Skill JSON 加载器（Rust 移植自 node/src/skills/index-loader.ts）
//!
//! 扫描 `{skills_root}/**/*.json`，构建：
//! - `model_route_table`: domain → 推荐 level (1/2/3)
//! - `nodes`: 所有 SkillMeta 列表
//!
//! 搜索路径优先级：
//!   1. `{project_root}/node/src/skills/`   (core, 内置)
//!   2. `{project_root}/node/src/skills/extended/`  (extended, 安装后)
//!   3. `~/.eket/skills/`  (用户级扩展)

use std::collections::HashMap;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

// ─── Types ────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillMeta {
    pub id: String,
    #[serde(rename = "type")]
    pub skill_type: String,
    pub domain: String,
    pub level: u8,
    pub model_hint: String,
    #[serde(default)]
    pub triggers: Vec<String>,
    #[serde(default)]
    pub collaborates_with: Vec<String>,
    #[serde(default)]
    pub lazy: bool,
    #[serde(default)]
    pub description: String,
}

#[derive(Debug, Clone)]
pub struct SkillIndex {
    pub nodes: Vec<SkillMeta>,
    /// domain → recommended level (1=haiku / 2=sonnet / 3=opus)
    pub model_route_table: HashMap<String, u8>,
}

// ─── Loader ───────────────────────────────────────────────────────────────────

/// 从多个目录扫描 JSON，合并构建 SkillIndex
pub fn load_skill_index(search_roots: &[PathBuf]) -> SkillIndex {
    let mut nodes: Vec<SkillMeta> = Vec::new();

    for root in search_roots {
        scan_dir(root, &mut nodes);
    }

    let model_route_table = build_model_route_table(&nodes);
    SkillIndex {
        nodes,
        model_route_table,
    }
}

/// 自动探测 project_root 下的 skills 目录 + ~/.eket/skills/
pub fn default_search_roots(project_root: &Path) -> Vec<PathBuf> {
    let mut roots = vec![
        project_root.join("node").join("src").join("skills"),
        project_root
            .join("node")
            .join("src")
            .join("skills")
            .join("extended"),
    ];

    if let Some(home) = dirs::home_dir() {
        roots.push(home.join(".eket").join("skills"));
    }

    roots.into_iter().filter(|p| p.exists()).collect()
}

fn scan_dir(dir: &Path, out: &mut Vec<SkillMeta>) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            scan_dir(&path, out);
        } else if path.extension().and_then(|e| e.to_str()) == Some("json") {
            if let Ok(content) = std::fs::read_to_string(&path) {
                if let Ok(meta) = serde_json::from_str::<SkillMeta>(&content) {
                    if is_valid_skill(&meta) {
                        out.push(meta);
                    }
                }
            }
        }
    }
}

fn is_valid_skill(m: &SkillMeta) -> bool {
    !m.id.is_empty()
        && m.skill_type == "skill"
        && !m.domain.is_empty()
        && (1..=3).contains(&m.level)
        && !m.model_hint.is_empty()
}

fn build_model_route_table(nodes: &[SkillMeta]) -> HashMap<String, u8> {
    let mut domain_levels: HashMap<String, Vec<u8>> = HashMap::new();

    for node in nodes {
        domain_levels
            .entry(node.domain.clone())
            .or_default()
            .push(node.level);
    }

    domain_levels
        .into_iter()
        .map(|(domain, levels)| {
            let avg = levels.iter().map(|&l| l as f64).sum::<f64>() / levels.len() as f64;
            let level = (avg.round() as u8).clamp(1, 3);
            (domain, level)
        })
        .collect()
}

// ─── Expert MD loader ─────────────────────────────────────────────────────────

/// 从 ticket 内容解析 assigned_experts 字段
pub fn parse_assigned_experts(ticket_content: &str) -> Vec<String> {
    for line in ticket_content.lines() {
        let lower = line.to_lowercase();
        if lower.contains("assigned_experts") {
            // 取冒号后内容
            if let Some(pos) = line.find(':') {
                let value = &line[pos + 1..];
                let ids: Vec<String> = value
                    .split(',')
                    .map(|s| s.trim().trim_matches('`').trim_matches('*').to_string())
                    .filter(|s| !s.is_empty() && s != "无" && s != "none" && s != "-")
                    .collect();
                if !ids.is_empty() {
                    return ids;
                }
            }
        }
    }
    vec![]
}

/// Expert MD 搜索路径
pub fn expert_search_roots() -> Vec<PathBuf> {
    let mut roots = Vec::new();
    if let Some(home) = dirs::home_dir() {
        let base = home
            .join(".claude")
            .join("skills")
            .join("eket")
            .join("experts");
        roots.push(base.join("default"));
        roots.push(base.join("optional"));
    }
    roots.into_iter().filter(|p| p.exists()).collect()
}

/// 加载 expert profile MD 内容（id → content）
pub fn load_expert_profiles(expert_ids: &[String]) -> HashMap<String, Option<String>> {
    let roots = expert_search_roots();
    let mut result: HashMap<String, Option<String>> = HashMap::new();

    for id in expert_ids {
        let filename = format!("{}.md", id);
        let mut found = false;

        'outer: for root in &roots {
            // Check root/<id>.md and root/**/<id>.md (one level deep)
            let direct = root.join(&filename);
            if direct.exists() {
                result.insert(id.clone(), std::fs::read_to_string(direct).ok());
                found = true;
                break;
            }
            // Search subdirectories
            if let Ok(entries) = std::fs::read_dir(root) {
                for entry in entries.flatten() {
                    let sub = entry.path().join(&filename);
                    if sub.exists() {
                        result.insert(id.clone(), std::fs::read_to_string(sub).ok());
                        found = true;
                        break 'outer;
                    }
                }
            }
        }

        if !found {
            result.insert(id.clone(), None);
        }
    }

    result
}

/// 生成注入 ACTIVE_CONTEXT 的专家片段
pub fn format_expert_section(profiles: &HashMap<String, Option<String>>) -> String {
    if profiles.is_empty() {
        return String::new();
    }

    let mut section = String::from("## 专家团队 (Assigned Experts)\n\n");
    let mut missing: Vec<&str> = Vec::new();

    for (id, content) in profiles {
        match content {
            Some(md) => {
                // Extract emoji + name_cn + role
                let emoji = extract_yaml_field(md, "emoji").unwrap_or_else(|| "👤".to_string());
                let name_cn = extract_yaml_field(md, "name_cn")
                    .or_else(|| extract_yaml_field(md, "name"))
                    .unwrap_or_else(|| id.clone());
                let role = extract_yaml_field(md, "role").unwrap_or_else(|| id.clone());

                section.push_str(&format!(
                    "### {} **{}** ({})\n\n<details>\n<summary>展开 profile</summary>\n\n",
                    emoji, name_cn, role
                ));

                // First 35 non-fence lines
                let preview: String = md
                    .lines()
                    .filter(|l| !l.starts_with("```"))
                    .take(35)
                    .collect::<Vec<_>>()
                    .join("\n");
                section.push_str(&preview);
                section.push_str("\n\n</details>\n\n");
            }
            None => missing.push(id.as_str()),
        }
    }

    if !missing.is_empty() {
        section.push_str(&format!(
            "> ⚠️ 以下专家 profile 未找到（需安装扩展包）：{}\n",
            missing.join(", ")
        ));
        section.push_str("> 安装命令：`bash ~/.claude/skills/eket/scripts/install-extended.sh`\n");
    }

    section
}

fn extract_yaml_field(content: &str, field: &str) -> Option<String> {
    for line in content.lines() {
        if line.trim_start().starts_with(&format!("{}:", field)) {
            if let Some(pos) = line.find(':') {
                let val = line[pos + 1..].trim().to_string();
                if !val.is_empty() {
                    return Some(val);
                }
            }
        }
    }
    None
}

// ─── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_assigned_experts() {
        let ticket = "**assigned_experts**: backend, security, tester\n";
        let ids = parse_assigned_experts(ticket);
        assert_eq!(ids, vec!["backend", "security", "tester"]);
    }

    #[test]
    fn test_parse_assigned_experts_none() {
        let ticket = "no experts here\n";
        assert!(parse_assigned_experts(ticket).is_empty());
    }

    #[test]
    fn test_build_model_route_table() {
        let nodes = vec![
            SkillMeta {
                id: "a".into(),
                skill_type: "skill".into(),
                domain: "dev".into(),
                level: 2,
                model_hint: "sonnet".into(),
                triggers: vec![],
                collaborates_with: vec![],
                lazy: false,
                description: "".into(),
            },
            SkillMeta {
                id: "b".into(),
                skill_type: "skill".into(),
                domain: "dev".into(),
                level: 3,
                model_hint: "opus".into(),
                triggers: vec![],
                collaborates_with: vec![],
                lazy: false,
                description: "".into(),
            },
        ];
        let table = build_model_route_table(&nodes);
        // avg(2,3) = 2.5 → round = 3
        assert_eq!(table["dev"], 3);
    }
}
