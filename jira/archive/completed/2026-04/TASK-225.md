**Ticket ID**: TASK-225
**标题**: [P0] gate-review VETO 写回 ticket + 状态回退
**类型**: feature
**优先级**: P0

**状态**: done
**创建时间**: 2026-04-26T23:30:00Z
**最后更新**: 2026-04-26T23:59:00Z
**started_at**: 2026-04-26T23:30:00Z
**completed_at**: 2026-04-26T23:59:00Z

**gate_review_veto_count**: 0
**veto_reason**:
**resubmit_conditions**:

**负责人**: slaver_backend_dev
**执行 Agent**:
**所属 Epic**: RUST-GAP
**所属 Sprint**: sprint-rust-gap-1
**适配角色**: backend_dev
**assigned_experts**: backend, architect, tester

---

## 领取记录
| 操作 | Slaver | 时间 | 状态变更 |
|------|--------|------|----------|
| 创建 | Master | 2026-04-26T23:30:00Z | backlog → ready |

---

## 1. 任务描述

Rust gate-review VETO 时需写回 ticket MD 文件三个字段并回退状态。

**待实现**：
1. 更新 ticket 文件 `veto_reason: <原因>`
2. 更新 ticket 文件 `resubmit_conditions: <条件>`
3. `gate_review_veto_count` +1
4. 状态回退：`gate_review → analysis`
5. 输出 JSON `{"status":"vetoed","veto_count":N,...}`

对标：`node/src/commands/gate-review.ts` `handleVeto()` 函数。

## 2. 验收标准

- [ ] VETO 后 ticket MD 含 veto_reason；验证：`cargo test -p eket-cli -- gate_review_veto_writeback`
- [ ] veto_count 累加正确；验证：`cargo test -p eket-cli -- gate_review_veto_count`
- [ ] 状态变 analysis；验证：`cargo test -p eket-cli -- gate_review_status_regression`

## 3. 依赖关系
### 3.1 前置：TASK-222
### 3.2 阻塞：TASK-232（force-approve 逻辑依赖 veto_count）

## 4. 时间追踪
| 预估时间 | 480 分钟 |

## 5. 执行日志
**deferred_issues**: none

## 6. 实现摘要（复盘）

- 新增 `apply_veto_writeback(raw, reason, conditions)` 纯函数：解析 veto_count 并 +1，调用 `set_field` 写回三字段，调用 `set_status_field` 将状态回退至 `analysis`
- `set_field` 支持已有字段替换 + 缺失时追加
- `run_veto_writeback` 负责文件定位 + 原子写（tmp→rename）+ JSON 输出
- 新增 `--veto / --approve / --reason / --conditions / --reviewer / --project-root` args，保持向后兼容旧 args
- 测试：10 项全部通过（含 3 项验收测试 + dry_run + count 累加 + 纯函数单元测试）

**知识沉淀**: ticket.rs 的 `set_status` 仅处理 "状态/负责人" 两字段；gate_review veto 需要写任意字段，故在 gate_review.rs 内实现通用 `set_field`，避免改动 eket-core API。
