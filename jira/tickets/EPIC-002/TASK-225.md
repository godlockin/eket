# TASK-225: 60 个 optional 专家 — 3 节最小子集对齐

## 元数据
- **状态**: todo
- **类型**: refactor
- **优先级**: P1
- **agent_type**: fullstack
- **estimate_hours**: 16
- **parent_epic**: EPIC-002
- **创建时间**: 2026-04-27
- **依赖**: TASK-224
- **assigned_experts**: tech-architect, qa-lead

## 背景

60 个 optional 专家由社区贡献，全量 7 节侵入太大（U-1）。专家组决议：仅强制 3 节最小子集——`Common Rationalizations` / `Red Flags` / `Verification`。

跨仓协调：本 ticket 改动落在 `eket-experts-extended/experts/` 子仓，需另开 PR。

## 详细描述

按目录分批，每批 = 一个分类目录（ai/business/consulting/design/hr/knowledge/marketing/ops/pr/tech/training），共 11 批。

每批生成 codemod 脚本（Rule of 500 自洽，禁止逐文件手改），自动注入 3 节模板，行数失败则降级为半自动。

## 验收标准

- [ ] AC-1 (GWT): Given 60 个 optional 专家, When 11 个 PR 全部合并, Then 每份 MD 至少含 `## Common Rationalizations` ≥3 行 + `## Red Flags` ≥3 项 + `## Verification` ≥3 项
- [ ] AC-2: `scripts/check-skill-anatomy.sh --minimal ~/.claude/skills/eket/experts/optional/*.md` 通过率 ≥90%
- [ ] AC-3: 单 PR 净变更 ≤ 300 行（EPIC 内特批，依 §6 风险缓解）；超出必须拆分
- [ ] AC-4: codemod 脚本本身 ≤ 200 行 + 含单元测试
- [ ] AC-5: INDEX.md 不在本 ticket 触碰（留给 TASK-227）

## observability
- logs: ["optional.expert.batch_started", "optional.expert.batch_completed"]
- metrics: ["optional.expert.batches_done", "optional.expert.minimal_pass_rate"]

## rollback_plan

每批一个独立 PR；可单独 revert。社区拒绝时降级为该目录跳过 + 记录到 `docs/skip-list.md`。

## test_strategy
- unit: codemod 在 fixture 目录上跑出预期 diff
- integration: 11 个 PR 串行合入，每个 PR 跑 anatomy check
- regression: TASK-223 default 专家不受影响（独立目录）

---

**类型**: Refactor
**技能要求**: Bash / sed / awk / codemod 设计
**依赖**: TASK-224
**assigned_experts**: tech-architect, qa-lead

<!-- machine-readable fields -->
agent_type: fullstack
estimate_hours: 16
