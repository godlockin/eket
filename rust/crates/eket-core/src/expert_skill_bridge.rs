use serde::{Deserialize, Serialize};
/// ExpertSkillBridge — 专家 × Skills 关联机制
///
/// 从 ~/.claude/skills/eket/experts/default/*.md 加载专家配置，
/// 提供按 skills 需求匹配专家、按 epic 类型推荐专家组合等能力。
use std::collections::HashMap;
use std::path::Path;

// ─── Data Structures ──────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct ExpertSkills {
    pub primary: Vec<String>,
    #[serde(default)]
    pub contextual: Vec<ContextualSkill>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ContextualSkill {
    pub skill: String,
    /// "domain=security" 或 "task_type=feature"
    pub when: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ExpertProfile {
    pub id: String,
    pub name_cn: String,
    pub role: String,
    pub emoji: String,
    pub domain: String,
    pub skills: Option<ExpertSkills>,
    /// 来源包标记："default" | "extended" | 自定义路径
    #[serde(skip_deserializing, default)]
    pub source_pkg: String,
    /// 文件路径（用于加载提示）
    #[serde(skip_deserializing, default)]
    pub file_path: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct ExpertMatch {
    pub expert_id: String,
    pub name_cn: String,
    pub emoji: String,
    pub matched_skills: Vec<String>,
    pub score: f32,
}

// ─── Bridge ───────────────────────────────────────────────────────────────────

pub struct ExpertSkillBridge {
    experts: HashMap<String, ExpertProfile>,
}

impl ExpertSkillBridge {
    /// 从单目录加载（保持向后兼容）
    pub fn load_from_dir(experts_dir: &Path) -> anyhow::Result<Self> {
        let pkg = dir_to_pkg_name(experts_dir);
        Self::load_from_dirs(&[(experts_dir.to_path_buf(), pkg)])
    }

    /// 从多个目录加载，每个目录带 pkg 标签；递归扫子目录
    pub fn load_from_dirs(dirs: &[(std::path::PathBuf, String)]) -> anyhow::Result<Self> {
        let mut experts = HashMap::new();
        for (dir, pkg) in dirs {
            load_dir_recursive(dir, pkg, &mut experts);
        }
        Ok(Self { experts })
    }

    /// 全文搜索：在 id/name_cn/role/domain/skills 中模糊匹配 keyword
    /// 返回 (score, ExpertProfile) 降序
    pub fn search(&self, keyword: &str) -> Vec<SearchResult> {
        let kw = keyword.to_lowercase();
        let mut results: Vec<SearchResult> = self
            .experts
            .values()
            .filter_map(|p| {
                let mut score = 0u32;
                let mut matched_fields: Vec<String> = vec![];

                if p.id.to_lowercase().contains(&kw) {
                    score += 10;
                    matched_fields.push(format!("id:{}", p.id));
                }
                if p.name_cn.to_lowercase().contains(&kw) {
                    score += 10;
                    matched_fields.push(format!("name:{}", p.name_cn));
                }
                if p.role.to_lowercase().contains(&kw) {
                    score += 8;
                    matched_fields.push(format!("role:{}", p.role));
                }
                if p.domain.to_lowercase().contains(&kw) {
                    score += 6;
                    matched_fields.push(format!("domain:{}", p.domain));
                }
                if let Some(skills) = &p.skills {
                    for s in &skills.primary {
                        if s.to_lowercase().contains(&kw) {
                            score += 5;
                            matched_fields.push(format!("skill:{s}"));
                        }
                    }
                    for cs in &skills.contextual {
                        if cs.skill.to_lowercase().contains(&kw) {
                            score += 3;
                            matched_fields.push(format!("contextual_skill:{}", cs.skill));
                        }
                    }
                }

                if score == 0 {
                    return None;
                }
                Some(SearchResult {
                    expert: p.clone(),
                    score,
                    matched_fields,
                })
            })
            .collect();

        results.sort_by_key(|b| std::cmp::Reverse(b.score));
        results
    }

    /// 获取专家的所有 primary skills
    pub fn skills_for_expert(&self, expert_id: &str) -> Vec<String> {
        self.experts
            .get(expert_id)
            .and_then(|p| p.skills.as_ref())
            .map(|s| s.primary.clone())
            .unwrap_or_default()
    }

    /// 按 skills 需求找到最匹配的专家列表（score = matched/required 比例）
    pub fn compose_by_skills(&self, required_skills: &[&str]) -> Vec<ExpertMatch> {
        let mut matches: Vec<ExpertMatch> = self
            .experts
            .values()
            .filter_map(|profile| {
                let all_skills = all_skills_for_profile(profile);
                let matched: Vec<String> = required_skills
                    .iter()
                    .filter(|s| all_skills.contains(&s.to_string()))
                    .map(|s| s.to_string())
                    .collect();

                if matched.is_empty() {
                    return None;
                }

                let score = matched.len() as f32 / required_skills.len().max(1) as f32;
                Some(ExpertMatch {
                    expert_id: profile.id.clone(),
                    name_cn: profile.name_cn.clone(),
                    emoji: profile.emoji.clone(),
                    matched_skills: matched,
                    score,
                })
            })
            .collect();

        matches.sort_by(|a, b| {
            b.score
                .partial_cmp(&a.score)
                .unwrap_or(std::cmp::Ordering::Equal)
        });
        matches
    }

    /// 按 epic_type 关键词推荐专家组合
    /// epic_type: "feature" | "security" | "performance" | "frontend" | "backend" | "data" | "infra"
    pub fn recommend_for_epic(&self, epic_type: &str) -> Vec<ExpertMatch> {
        let skills = epic_type_to_skills(epic_type);
        let skill_refs: Vec<&str> = skills.iter().map(|s| s.as_str()).collect();
        self.compose_by_skills(&skill_refs)
    }

    /// 获取所有专家列表（用于展示）
    pub fn all_experts(&self) -> Vec<&ExpertProfile> {
        let mut v: Vec<&ExpertProfile> = self.experts.values().collect();
        v.sort_by(|a, b| a.id.cmp(&b.id));
        v
    }
}

// ─── Search Result ────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Clone)]
pub struct SearchResult {
    pub expert: ExpertProfile,
    pub score: u32,
    pub matched_fields: Vec<String>,
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/// 目录路径 → pkg 标签（取最后两段）
fn dir_to_pkg_name(dir: &Path) -> String {
    let parts: Vec<&str> = dir
        .components()
        .filter_map(|c| c.as_os_str().to_str())
        .collect();
    match parts.len() {
        0 => "unknown".into(),
        1 => parts[0].into(),
        n => format!("{}/{}", parts[n - 2], parts[n - 1]),
    }
}

/// 递归扫目录加载 .md 专家文件（跳过 INDEX.md）
fn load_dir_recursive(dir: &Path, pkg: &str, experts: &mut HashMap<String, ExpertProfile>) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            load_dir_recursive(&path, pkg, experts);
        } else if path.extension().and_then(|e| e.to_str()) == Some("md") {
            let fname = path.file_name().and_then(|f| f.to_str()).unwrap_or("");
            if fname.eq_ignore_ascii_case("INDEX.md") {
                continue;
            }
            match parse_expert_md(&path) {
                Ok(mut profile) => {
                    profile.source_pkg = pkg.to_string();
                    profile.file_path = path.to_string_lossy().to_string();
                    experts.insert(profile.id.clone(), profile);
                }
                Err(e) => {
                    tracing::warn!("Failed to parse {:?}: {e}", path);
                }
            }
        }
    }
}

fn all_skills_for_profile(profile: &ExpertProfile) -> Vec<String> {
    let Some(skills) = &profile.skills else {
        return vec![];
    };
    let mut all = skills.primary.clone();
    for cs in &skills.contextual {
        all.push(cs.skill.clone());
    }
    all
}

/// epic_type → 所需 skills 映射
fn epic_type_to_skills(epic_type: &str) -> Vec<String> {
    match epic_type {
        "feature" => vec![
            "test-driven-development".into(),
            "systematic-debugging".into(),
            "brainstorming".into(),
        ],
        "security" => vec!["security-review".into(), "systematic-debugging".into()],
        "performance" => vec![
            "improve-codebase-architecture".into(),
            "systematic-debugging".into(),
            "webapp-testing".into(),
        ],
        "frontend" => vec![
            "frontend-design".into(),
            "test-driven-development".into(),
            "design-review".into(),
        ],
        "backend" => vec![
            "test-driven-development".into(),
            "systematic-debugging".into(),
            "fastapi-expert".into(),
        ],
        "data" => vec![
            "systematic-debugging".into(),
            "improve-codebase-architecture".into(),
        ],
        "infra" => vec![
            "improve-codebase-architecture".into(),
            "systematic-debugging".into(),
            "security-review".into(),
        ],
        _ => vec![
            "systematic-debugging".into(),
            "test-driven-development".into(),
        ],
    }
}

/// 从 .md 文件提取 YAML front matter 并解析为 ExpertProfile
fn parse_expert_md(path: &Path) -> anyhow::Result<ExpertProfile> {
    let content = std::fs::read_to_string(path)?;

    // 支持两种格式：```yaml ... ``` 或 --- ... ---
    let yaml_str = if content.trim_start().starts_with("```yaml") {
        // 去掉开头的 ```yaml，找到第一个 ``` 结束符
        let after_fence = content
            .trim_start()
            .strip_prefix("```yaml")
            .unwrap_or(&content);
        // 找到闭合 ```
        if let Some(end) = after_fence.find("\n```") {
            after_fence[..end].trim().to_string()
        } else {
            after_fence.trim().to_string()
        }
    } else if content.trim_start().starts_with("---") {
        let after = content.trim_start().strip_prefix("---").unwrap_or(&content);
        if let Some(end) = after.find("\n---") {
            after[..end].trim().to_string()
        } else {
            after.trim().to_string()
        }
    } else {
        anyhow::bail!("No YAML front matter found in {:?}", path);
    };

    let profile: ExpertProfile = serde_yaml::from_str(&yaml_str)
        .map_err(|e| anyhow::anyhow!("YAML parse error in {:?}: {e}", path))?;
    Ok(profile)
}

// ─── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use tempfile::TempDir;

    fn make_expert_md(dir: &TempDir, filename: &str, yaml: &str) {
        let path = dir.path().join(filename);
        let mut f = std::fs::File::create(path).unwrap();
        writeln!(f, "```yaml\n{yaml}\n```").unwrap();
    }

    #[test]
    fn expert_skill_load_and_query() {
        let dir = TempDir::new().unwrap();

        make_expert_md(
            &dir,
            "architect.md",
            r#"
id: eket.architect.001
name: Alex Chen
name_cn: 陈架构
role: 系统架构师
emoji: 🏗️
domain: architecture
tier: default
skills:
  primary:
    - systematic-debugging
    - improve-codebase-architecture
    - brainstorming
  contextual:
    - skill: security-review
      when: "domain=security"
"#,
        );

        make_expert_md(
            &dir,
            "backend.md",
            r#"
id: eket.backend.001
name: Wei Zhang
name_cn: 张后端
role: 后端工程师
emoji: 🖥️
domain: backend
tier: default
skills:
  primary:
    - test-driven-development
    - systematic-debugging
    - fastapi-expert
  contextual:
    - skill: security-review
      when: null
"#,
        );

        let bridge = ExpertSkillBridge::load_from_dir(dir.path()).unwrap();

        // skills_for_expert
        let skills = bridge.skills_for_expert("eket.architect.001");
        assert!(skills.contains(&"systematic-debugging".to_string()));
        assert_eq!(skills.len(), 3);

        // compose_by_skills
        let matches = bridge.compose_by_skills(&["systematic-debugging", "fastapi-expert"]);
        assert!(!matches.is_empty());
        // backend matches both
        let backend = matches
            .iter()
            .find(|m| m.expert_id == "eket.backend.001")
            .unwrap();
        assert_eq!(backend.score, 1.0);

        // recommend_for_epic
        let recs = bridge.recommend_for_epic("backend");
        assert!(!recs.is_empty());
    }

    #[test]
    fn expert_skill_missing_dir() {
        // load_from_dirs gracefully skips non-existent directories (degraded mode),
        // so load_from_dir on a missing path returns Ok with empty bridge.
        let result = ExpertSkillBridge::load_from_dir(Path::new("/nonexistent/dir"));
        assert!(result.is_ok());
        assert!(result.unwrap().experts.is_empty());
    }
}
