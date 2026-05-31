/// slaver_rules.rs — SLAVER-RULES.md 解析 + GuardrailCheck 实现
///
/// 解析 SLAVER-RULES.md 中的红线规则，生成 SlaverRulesGuardrail。
/// 接入 Pipeline 时通过 GuardrailMiddleware 封装。
use eket_core::guardrail::{ActionContext, GuardrailCheck, GuardrailResult, GuardrailViolation};

// ─── ParsedRule ───────────────────────────────────────────────────────────────

/// 从 SLAVER-RULES.md 解析出的单条规则
#[derive(Debug, Clone)]
pub struct ParsedRule {
    /// 自动生成的规则 ID，如 "rule_0", "rule_1"
    pub id: String,
    /// 规则原文
    pub text: String,
}

// ─── Parser ───────────────────────────────────────────────────────────────────

/// 解析 SLAVER-RULES.md 中的红线规则。
///
/// 扫描策略：
/// - 寻找包含 "红线" 或 "Hard Rules" 关键词的 section（`##` 或 `###` 开头）
/// - 在该 section 内提取以 `- **红线**：`、`- 禁止` 或 `**禁止**` 开头的列表项
/// - 遇到下一个同级 section 停止
pub fn parse_slaver_rules(rules_md: &str) -> Vec<ParsedRule> {
    let mut rules = Vec::new();
    let mut in_redline_section = false;
    let mut idx = 0usize;

    for line in rules_md.lines() {
        let trimmed = line.trim();

        // 检测 section 标题
        if trimmed.starts_with('#') {
            let title_lower = trimmed.to_lowercase();
            if title_lower.contains("红线") || title_lower.contains("hard rule") {
                in_redline_section = true;
                continue;
            } else if in_redline_section {
                // 遇到同级或更高级 section，停止（只停止同级 ##）
                // 但 ### 子标题继续
                let level = trimmed.chars().take_while(|c| *c == '#').count();
                if level <= 2 {
                    in_redline_section = false;
                }
                continue;
            }
            continue;
        }

        if !in_redline_section {
            continue;
        }

        // 提取规则行
        let is_rule = trimmed.starts_with("- **红线**")
            || trimmed.starts_with("- 禁止")
            || trimmed.starts_with("**禁止**")
            || (trimmed.starts_with('-') && trimmed.to_lowercase().contains("禁止"));

        if is_rule {
            // 清理标记符号，保留纯文本
            let text = trimmed
                .trim_start_matches('-')
                .trim()
                .replace("**红线**：", "")
                .replace("**红线**: ", "")
                .replace("**禁止**", "禁止")
                .trim()
                .to_string();

            if !text.is_empty() {
                rules.push(ParsedRule {
                    id: format!("rule_{}", idx),
                    text,
                });
                idx += 1;
            }
        }
    }

    rules
}

// ─── SlaverRulesGuardrail ─────────────────────────────────────────────────────

/// 基于解析出的 SLAVER-RULES.md 规则进行守卫检查。
///
/// 检查逻辑（基于 metadata 显式标记，不做 NLP）：
/// - action="claim"：若 metadata["modifying_acceptance_criteria"] == true → violation
/// - action="complete"：若 metadata["self_review"] == true → violation
pub struct SlaverRulesGuardrail {
    pub rules: Vec<ParsedRule>,
}

impl GuardrailCheck for SlaverRulesGuardrail {
    fn name(&self) -> &str {
        "slaver_rules"
    }

    fn check(&self, ctx: &ActionContext) -> GuardrailResult {
        match ctx.action.as_str() {
            "claim" => {
                if ctx
                    .metadata
                    .get("modifying_acceptance_criteria")
                    .and_then(|v| v.as_bool())
                    .unwrap_or(false)
                {
                    return Err(GuardrailViolation {
                        rule: "slaver_rules/no_modify_acceptance".to_string(),
                        message: "Slaver 禁止修改验收标准 (modifying_acceptance_criteria=true)"
                            .to_string(),
                    });
                }
            }
            "complete" => {
                if ctx
                    .metadata
                    .get("self_review")
                    .and_then(|v| v.as_bool())
                    .unwrap_or(false)
                {
                    return Err(GuardrailViolation {
                        rule: "slaver_rules/no_self_review".to_string(),
                        message: "Slaver 禁止审查自己的 PR (self_review=true)".to_string(),
                    });
                }
            }
            _ => {}
        }
        Ok(())
    }
}

// ─── Loader ───────────────────────────────────────────────────────────────────

/// 从文件加载 SLAVER-RULES.md 并创建 SlaverRulesGuardrail。
///
/// 文件不存在或解析结果为空时返回 None。
pub fn load_slaver_rules_guardrail(rules_path: &str) -> Option<SlaverRulesGuardrail> {
    let content = std::fs::read_to_string(rules_path).ok()?;
    let rules = parse_slaver_rules(&content);
    if rules.is_empty() {
        return None;
    }
    Some(SlaverRulesGuardrail { rules })
}

// ─── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    const FIXTURE_MD: &str = r#"
# SLAVER-RULES.md

## 角色红线

- **红线**：禁止修改验收标准/优先级/依赖关系，禁止审查自己的 PR
- **红线**：连续读取 5+ 文件无写操作 = 分析瘫痪，立刻写代码或报 BLOCKED
- 禁止横向协助其他 Slaver（需上报 Master 决策）

## 其他规则

这里是其他内容，不包含红线。
"#;

    fn make_ctx(action: &str, metadata: serde_json::Value) -> ActionContext {
        ActionContext {
            action: action.to_string(),
            ticket_id: "TASK-233".to_string(),
            slaver_id: "slaver_test".to_string(),
            slaver_role: None,
            ticket_role: None,
            metadata,
        }
    }

    #[test]
    fn slaver_rules_parse() {
        let rules = parse_slaver_rules(FIXTURE_MD);
        assert!(!rules.is_empty(), "Should parse at least one rule");
        // 验证 id 格式
        assert_eq!(rules[0].id, "rule_0");
        // 验证文本非空
        assert!(!rules[0].text.is_empty());
    }

    #[test]
    fn slaver_rules_no_file() {
        let result = load_slaver_rules_guardrail("/non/existent/path/SLAVER-RULES.md");
        assert!(result.is_none(), "Should return None for missing file");
    }

    #[test]
    fn slaver_rules_claim_violation() {
        let rules = parse_slaver_rules(FIXTURE_MD);
        let g = SlaverRulesGuardrail { rules };
        let ctx = make_ctx("claim", json!({ "modifying_acceptance_criteria": true }));
        let result = g.check(&ctx);
        assert!(
            result.is_err(),
            "Expected violation for modifying_acceptance_criteria"
        );
        let err = result.unwrap_err();
        assert!(err.rule.contains("no_modify_acceptance"));
    }

    #[test]
    fn slaver_rules_complete_violation() {
        let rules = parse_slaver_rules(FIXTURE_MD);
        let g = SlaverRulesGuardrail { rules };
        let ctx = make_ctx("complete", json!({ "self_review": true }));
        let result = g.check(&ctx);
        assert!(result.is_err(), "Expected violation for self_review");
        let err = result.unwrap_err();
        assert!(err.rule.contains("no_self_review"));
    }

    #[test]
    fn slaver_rules_no_violation() {
        let rules = parse_slaver_rules(FIXTURE_MD);
        let g = SlaverRulesGuardrail { rules };
        let ctx = make_ctx("claim", json!({}));
        assert!(g.check(&ctx).is_ok(), "No metadata flags = no violation");
    }
}
