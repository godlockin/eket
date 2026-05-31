/// guardrail_middleware.rs — GuardrailRunner 接入 Pipeline 的 Middleware 封装
///
/// GuardrailMiddleware 在 pre() 阶段运行所有守卫检查，
/// 将违规记录写入 ctx.metadata["guardrail_violations"]，
/// 调用方（task_claim.rs）检查后决定是否 exit(1)。
use async_trait::async_trait;
use eket_core::{
    guardrail::{ActionContext, GuardrailRunner},
    middleware_pipeline::{Middleware, PipelineCtx},
};

// ─── GuardrailMiddleware ──────────────────────────────────────────────────────

pub struct GuardrailMiddleware {
    pub runner: GuardrailRunner,
}

impl GuardrailMiddleware {
    pub fn new(runner: GuardrailRunner) -> Self {
        Self { runner }
    }
}

#[async_trait]
impl Middleware for GuardrailMiddleware {
    fn name(&self) -> &str {
        "guardrail"
    }

    async fn pre(&self, ctx: &mut PipelineCtx) -> anyhow::Result<()> {
        let action_ctx = build_action_ctx(ctx);
        let violations = self.runner.run(&action_ctx);

        if !violations.is_empty() {
            // 序列化 violations 到 ctx.metadata
            let v_json: Vec<serde_json::Value> = violations
                .iter()
                .map(|v| {
                    serde_json::json!({
                        "rule": v.rule,
                        "message": v.message,
                    })
                })
                .collect();

            if let serde_json::Value::Object(ref mut map) = ctx.metadata {
                map.insert(
                    "guardrail_violations".to_string(),
                    serde_json::Value::Array(v_json),
                );
            }
        }

        Ok(())
    }

    async fn post(&self, _ctx: &mut PipelineCtx) -> anyhow::Result<()> {
        Ok(())
    }
}

// ─── Helper ───────────────────────────────────────────────────────────────────

/// 从 PipelineCtx 构建 ActionContext，用于守卫检查。
fn build_action_ctx(ctx: &PipelineCtx) -> ActionContext {
    ActionContext {
        action: ctx.command.clone(),
        ticket_id: ctx.ticket_id.clone().unwrap_or_default(),
        slaver_id: ctx.slaver_id.clone().unwrap_or_default(),
        slaver_role: ctx
            .metadata
            .get("slaver_role")
            .and_then(|v| v.as_str())
            .map(str::to_string),
        ticket_role: ctx
            .metadata
            .get("ticket_role")
            .and_then(|v| v.as_str())
            .map(str::to_string),
        metadata: ctx.metadata.clone(),
    }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use eket_core::middleware_pipeline::{Pipeline, PipelineCtx};

    #[tokio::test]
    async fn pipeline_guardrail() {
        let runner = GuardrailRunner::default_for_claim();
        let middleware = GuardrailMiddleware::new(runner);
        let pipeline = Pipeline::new().add_middleware(middleware);

        let mut ctx = PipelineCtx::new("claim");
        ctx.ticket_id = Some("TASK-233".to_string());
        ctx.slaver_id = Some("slaver_test".to_string());

        // Should not panic
        pipeline.run_pre(&mut ctx).await.unwrap();
        pipeline.run_post(&mut ctx).await.unwrap();
    }

    #[tokio::test]
    async fn pipeline_guardrail_no_violations_by_default() {
        let runner = GuardrailRunner::default_for_claim();
        let middleware = GuardrailMiddleware::new(runner);
        let pipeline = Pipeline::new().add_middleware(middleware);

        let mut ctx = PipelineCtx::new("claim");
        ctx.ticket_id = Some("TASK-233".to_string());
        ctx.slaver_id = Some("slaver_test".to_string());

        pipeline.run_pre(&mut ctx).await.unwrap();

        // No role mismatch → no violations
        let violations = ctx.metadata.get("guardrail_violations");
        assert!(
            violations.is_none()
                || violations
                    .unwrap()
                    .as_array()
                    .map_or(true, |a| a.is_empty()),
            "No violations expected for default claim context"
        );
    }

    #[tokio::test]
    async fn pipeline_guardrail_role_mismatch_recorded() {
        let runner = GuardrailRunner::default_for_claim();
        let middleware = GuardrailMiddleware::new(runner);
        let pipeline = Pipeline::new().add_middleware(middleware);

        let mut ctx = PipelineCtx::new("claim");
        ctx.ticket_id = Some("TASK-233".to_string());
        ctx.slaver_id = Some("slaver_test".to_string());
        // Set role mismatch via metadata
        if let serde_json::Value::Object(ref mut map) = ctx.metadata {
            map.insert("slaver_role".to_string(), serde_json::json!("frontend"));
            map.insert("ticket_role".to_string(), serde_json::json!("backend"));
        }

        pipeline.run_pre(&mut ctx).await.unwrap();

        let violations = ctx
            .metadata
            .get("guardrail_violations")
            .and_then(|v| v.as_array());
        assert!(
            violations.map_or(false, |a| !a.is_empty()),
            "Role mismatch should produce guardrail violation"
        );
    }
}
