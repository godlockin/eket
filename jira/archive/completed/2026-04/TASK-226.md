**Ticket ID**: TASK-226
**标题**: [P0] middleware-pipeline — Pipeline trait + AuditMiddleware
**类型**: feature
**优先级**: P0

**状态**: done
**创建时间**: 2026-04-26T23:30:00Z
**最后更新**: 2026-04-27T00:00:00Z
**started_at**: 2026-04-27T00:00:00Z
**completed_at**: 2026-04-27T00:00:00Z

**gate_review_veto_count**: 0
**veto_reason**:
**resubmit_conditions**:

**负责人**: slaver_backend_dev
**执行 Agent**: backend_dev
**所属 Epic**: RUST-GAP
**所属 Sprint**: sprint-rust-gap-1
**适配角色**: backend_dev
**assigned_experts**: backend, architect

---

## 领取记录
| 操作 | Slaver | 时间 | 状态变更 |
|------|--------|------|----------|
| 创建 | Master | 2026-04-26T23:30:00Z | backlog → ready |

---

## 1. 任务描述

新建 `eket-core/src/middleware_pipeline.rs`：

```rust
#[async_trait]
pub trait Middleware: Send + Sync {
    async fn pre(&self, ctx: &mut PipelineCtx) -> Result<()>;
    async fn post(&self, ctx: &mut PipelineCtx) -> Result<()>;
}
pub struct Pipeline { pub middlewares: Vec<Arc<dyn Middleware>> }
```

实现 `AuditMiddleware`（写 SQLite audit_log 表）+ `TimingMiddleware`（统计耗时）。

`task_claim.rs` 接入 Pipeline（pre/post 各调一次）。

## 2. 验收标准

- [ ] Pipeline 编译；验证：`cargo build -p eket-core`
- [ ] claim 后 audit_log 表有记录；验证：`cargo test -p eket-cli -- pipeline_audit`
- [ ] JSON result 含 `elapsed_ms`；验证：`cargo test -p eket-cli -- pipeline_timing`

## 3. 依赖关系
### 3.1 前置：TASK-222
### 3.2 阻塞：TASK-233（GuardrailMiddleware 接入）

## 4. 时间追踪
| 预估时间 | 480 分钟 |

## 5. 执行日志
**deferred_issues**:

## 6. 实现细节

- 新建 `crates/eket-core/src/middleware_pipeline.rs`：PipelineCtx, Middleware trait, Pipeline, TimingMiddleware, AuditMiddleware
- AuditMiddleware：CREATE TABLE IF NOT EXISTS audit_log，post 写入记录
- TimingMiddleware：post 在 ctx.metadata 写 elapsed_ms
- lib.rs：添加 `pub mod middleware_pipeline` + `pub mod pubsub`（修复预存在缺失）
- task_claim.rs：接入 Pipeline，JSON result 含 `pipeline.elapsed_ms`
- 顺带修复 pubsub.rs 缺失 fred trait imports + election.rs 测试引用不存在的 API
- Tests: `pipeline_timing` + `pipeline_audit` 均通过
