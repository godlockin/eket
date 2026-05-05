/// guardrail.rs — EKET 守卫系统
///
/// 在 claim/complete 等动作前执行规则校验，防止角色越权等问题。
use serde_json::Value;

// ─── Types ────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct ActionContext {
    pub action: String,
    pub ticket_id: String,
    pub slaver_id: String,
    pub slaver_role: Option<String>,
    pub ticket_role: Option<String>,
    pub metadata: Value,
}

#[derive(Debug)]
pub struct GuardrailViolation {
    pub rule: String,
    pub message: String,
}

pub type GuardrailResult = Result<(), GuardrailViolation>;

// ─── Trait ────────────────────────────────────────────────────────────────────

pub trait GuardrailCheck: Send + Sync {
    fn name(&self) -> &str;
    fn check(&self, ctx: &ActionContext) -> GuardrailResult;
}

// ─── RoleMatchGuardrail ───────────────────────────────────────────────────────

/// 检查 slaver_role 是否匹配 ticket_role。
/// - ticket_role 为 None → 任意角色可领，通过
/// - slaver_role 为 None → 未设置角色的 slaver 可领任意卡，通过
/// - 两者均有值 → 必须相等（case-insensitive）
pub struct RoleMatchGuardrail;

impl GuardrailCheck for RoleMatchGuardrail {
    fn name(&self) -> &str {
        "role_match"
    }

    fn check(&self, ctx: &ActionContext) -> GuardrailResult {
        match (&ctx.ticket_role, &ctx.slaver_role) {
            (Some(ticket_role), Some(slaver_role)) => {
                if ticket_role.to_lowercase() != slaver_role.to_lowercase() {
                    Err(GuardrailViolation {
                        rule: self.name().to_string(),
                        message: format!(
                            "Ticket requires role '{}', but slaver has role '{}'",
                            ticket_role, slaver_role
                        ),
                    })
                } else {
                    Ok(())
                }
            }
            // ticket_role None → 任意角色可领
            (None, _) => Ok(()),
            // slaver_role None → 未设置角色的 slaver 可领任意卡
            (_, None) => Ok(()),
        }
    }
}

// ─── SelfReviewGuardrail (stub) ───────────────────────────────────────────────

/// 禁止 slaver 审查自己的 PR（stub，未来接 PR 元数据）
pub struct SelfReviewGuardrail;

impl GuardrailCheck for SelfReviewGuardrail {
    fn name(&self) -> &str {
        "self_review"
    }

    fn check(&self, _ctx: &ActionContext) -> GuardrailResult {
        // TODO: 当 action == "review" 时检查 PR author == slaver_id
        Ok(())
    }
}

// ─── GuardrailRunner ──────────────────────────────────────────────────────────

pub struct GuardrailRunner {
    checks: Vec<Box<dyn GuardrailCheck>>,
}

impl GuardrailRunner {
    /// 构建 claim 动作的默认守卫集合
    pub fn default_for_claim() -> Self {
        Self {
            checks: vec![
                Box::new(RoleMatchGuardrail),
                Box::new(SelfReviewGuardrail),
            ],
        }
    }

    /// 从自定义 checks 列表构建 runner
    pub fn from_checks(checks: Vec<Box<dyn GuardrailCheck>>) -> Self {
        Self { checks }
    }

    /// 运行所有守卫，返回所有违规
    pub fn run(&self, ctx: &ActionContext) -> Vec<GuardrailViolation> {
        self.checks
            .iter()
            .filter_map(|c| c.check(ctx).err())
            .collect()
    }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn make_ctx(ticket_role: Option<&str>, slaver_role: Option<&str>) -> ActionContext {
        ActionContext {
            action: "claim".to_string(),
            ticket_id: "TASK-224".to_string(),
            slaver_id: "slaver_test".to_string(),
            slaver_role: slaver_role.map(str::to_string),
            ticket_role: ticket_role.map(str::to_string),
            metadata: json!({}),
        }
    }

    #[test]
    fn guardrail_role_mismatch() {
        let ctx = make_ctx(Some("backend"), Some("frontend"));
        let violations = GuardrailRunner::default_for_claim().run(&ctx);
        assert!(!violations.is_empty(), "Expected violation but got none");
        assert_eq!(violations[0].rule, "role_match");
    }

    #[test]
    fn guardrail_role_match() {
        let ctx = make_ctx(Some("backend"), Some("backend"));
        let violations = GuardrailRunner::default_for_claim().run(&ctx);
        assert!(violations.is_empty(), "Expected no violations but got: {:?}", violations);
    }

    #[test]
    fn guardrail_no_role() {
        let ctx = make_ctx(None, Some("frontend"));
        let violations = GuardrailRunner::default_for_claim().run(&ctx);
        assert!(violations.is_empty(), "ticket_role=None should always pass");
    }

    #[test]
    fn guardrail_case_insensitive() {
        let ctx = make_ctx(Some("Backend"), Some("backend"));
        let violations = GuardrailRunner::default_for_claim().run(&ctx);
        assert!(violations.is_empty(), "Role match should be case-insensitive");
    }

    #[test]
    fn guardrail_slaver_no_role() {
        let ctx = make_ctx(Some("backend"), None);
        let violations = GuardrailRunner::default_for_claim().run(&ctx);
        assert!(violations.is_empty(), "slaver_role=None should always pass");
    }
}
