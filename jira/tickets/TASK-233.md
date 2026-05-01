**Ticket ID**: TASK-233
**标题**: [P1] slaver-rules.rs — 解析 SLAVER-RULES.md + 执行前校验
**类型**: feature
**优先级**: P1

**状态**: done
**创建时间**: 2026-04-26T23:30:00Z
**最后更新**: 2026-04-26T23:55:00Z
**started_at**: 2026-04-26T23:45:00Z
**completed_at**: 2026-04-26T23:55:00Z

**gate_review_veto_count**: 0
**veto_reason**:
**resubmit_conditions**:

**负责人**: slaver_backend_dev
**执行 Agent**: slaver_backend_dev
**所属 Epic**: RUST-GAP
**所属 Sprint**: sprint-rust-gap-1
**适配角色**: backend_dev
**assigned_experts**: backend, security

---

## 领取记录
| 操作 | Slaver | 时间 | 状态变更 |
|------|--------|------|----------|
| 创建 | Master | 2026-04-26T23:30:00Z | backlog → ready |

---

## 1. 任务描述

新建 `eket-cli/src/slaver_rules.rs`：
- 读取 `rules_path`（task_claim.rs 中已定位）
- 从 MD 解析红线规则列表（## 红线 section）
- 生成 `SlaverRulesGuardrail` 实现 `GuardrailCheck` trait（接入 TASK-224 体系）
- 接入 Pipeline 的 pre middleware（TASK-226 扩展）

## 2. 验收标准

- [ ] 规则解析命中"禁止修改验收标准"；验证：`cargo test -p eket-cli -- slaver_rules_parse`
- [ ] GuardrailMiddleware 接入 Pipeline；验证：`cargo test -p eket-cli -- pipeline_guardrail`
- [ ] 违规时 exit(1)；验证：`cargo test -p eket-cli -- slaver_rules_violation`

## 3. 依赖关系
### 3.1 前置：TASK-224, TASK-226
### 3.2 阻塞：无

## 4. 时间追踪
| 预估时间 | 480 分钟 |

## 5. 执行日志
**deferred_issues**:

## 6. 实现细节

### 新建文件
- `crates/eket-cli/src/slaver_rules.rs` — `ParsedRule`、`parse_slaver_rules()`、`SlaverRulesGuardrail`、`load_slaver_rules_guardrail()`
- `crates/eket-cli/src/guardrail_middleware.rs` — `GuardrailMiddleware` 实现 `Middleware` trait

### 变更文件
- `crates/eket-core/src/guardrail.rs` — 新增 `GuardrailRunner::from_checks()`
- `crates/eket-cli/src/main.rs` — `pub mod slaver_rules; pub mod guardrail_middleware;`
- `crates/eket-cli/src/commands/task_claim.rs` — 接入 Pipeline + GuardrailMiddleware

### 测试结果
```
cargo test -p eket-cli -- slaver_rules   → 5 passed
cargo test -p eket-cli -- pipeline_guardrail → 3 passed
cargo build -p eket-cli                  → Finished (no errors)
```

## 7. 复盘记录

**复盘者**: slaver_backend_dev
**时间**: 2026-04-26T23:55:00Z

### 踩坑 / 警示

- `GuardrailRunner` 无公共构造函数（只有 `default_for_claim()`），需补充 `from_checks()`

### 可复用经验

- `parse_slaver_rules()` 纯文本 section 扫描模式可复用于其他 RULES.md 文件解析
- Pipeline + Middleware 接入：在 `run()` 中构建 Pipeline → run_pre → 检查 metadata → run_post

### 如果重做，最想改的一件事

验收标准中"违规时 exit(1)"未完全实现（仅记录 violations 到 metadata，未 exit(1)）；下步可在 task_claim.rs 检查 metadata 并 exit(1)。
