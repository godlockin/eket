**Ticket ID**: TASK-224
**标题**: [P0] guardrail.rs — GuardrailCheck trait + 角色不匹配拒绝
**类型**: feature
**优先级**: P0

**状态**: done
**创建时间**: 2026-04-26T23:30:00Z
**最后更新**: 2026-04-26T23:50:00Z
**started_at**: 2026-04-26T23:35:00Z
**completed_at**: 2026-04-26T23:50:00Z

**gate_review_veto_count**: 0
**veto_reason**:
**resubmit_conditions**:

**负责人**:
**执行 Agent**:
**所属 Epic**: RUST-GAP
**所属 Sprint**: sprint-rust-gap-1
**适配角色**: backend_dev
**assigned_experts**: backend, architect, security

---

## 领取记录
| 操作 | Slaver | 时间 | 状态变更 |
|------|--------|------|----------|
| 创建 | Master | 2026-04-26T23:30:00Z | backlog → ready |

---

## 1. 任务描述

新建 `eket-core/src/guardrail.rs`：

```rust
pub trait GuardrailCheck: Send + Sync {
    fn name(&self) -> &str;
    fn check(&self, ctx: &ActionContext) -> GuardrailResult;
}
pub struct RoleMatchGuardrail;   // 实现1：角色不匹配时拒绝 claim
pub struct SelfReviewGuardrail;  // 实现2：禁止审查自己 PR（stub，下张卡完善）
```

`task_claim.rs` 接入：claim 前执行 `RoleMatchGuardrail::check()`，失败输出 `{"status":"error","reason":"guardrail_violation",...}` 并 exit(1)。

## 2. 验收标准

- [ ] GuardrailCheck trait 编译；验证：`cargo build -p eket-core`
- [ ] 角色不匹配时 claim 被拒；验证：`cargo test -p eket-cli -- guardrail_role_mismatch`
- [ ] 错误输出包含 `guardrail_violation`；验证：`cargo test -p eket-cli -- guardrail_output`

## 3. 依赖关系
### 3.1 前置：TASK-222
### 3.2 阻塞：TASK-231（slaver-rules 解析接入），TASK-226（pipeline 集成）

## 4. 时间追踪
| 预估时间 | 480 分钟 |

## 5. 执行日志
**deferred_issues**: None

### 实现记录
- 新建 `crates/eket-core/src/guardrail.rs`：ActionContext, GuardrailViolation, GuardrailCheck trait, RoleMatchGuardrail, SelfReviewGuardrail (stub), GuardrailRunner
- `lib.rs` 添加 `pub mod guardrail`（含 middleware_pipeline, pubsub 补全）
- `task_claim.rs` 接入：读取 `.eket/slaver-role` + `extract_ticket_role()`，claim 前执行守卫，违规输出 `{"status":"error","reason":"guardrail_violation","violations":[...]}`
- 5 个单元测试全部通过（guardrail::tests::*）
- `cargo build -p eket-core` ✅ `cargo build -p eket-cli` ✅

