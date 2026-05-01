# TASK-226: Rule of 500 + ~100 行 PR 上限 — 写入 RULES + CI

## 元数据
- **状态**: todo
- **类型**: feature
- **优先级**: P0
- **agent_type**: devops
- **estimate_hours**: 6
- **parent_epic**: EPIC-002
- **创建时间**: 2026-04-27
- **依赖**: 无（可与 TASK-222 并行）
- **assigned_experts**: tech-architect, qa-lead

## 背景

addyosmani 的 Rule of 500（>500 行重构必须用 codemod / AST）+ ~100 行 PR 上限 是高 ROI 习惯。需写入 MASTER-RULES + SLAVER-RULES + CI 校验。

## 详细描述

1. 在 `template/docs/MASTER-RULES.md` 与 `template/docs/SLAVER-RULES.md` 增加两条红线：
   - **Rule of 500**：单次重构净变更 > 500 行必须用 codemod / AST 工具，禁止逐行手改
   - **PR Sizing**：单个 PR 净变更 ≤ ~100 行；超出需 Master 显式审批 (`--allow-large-pr` 标记)
2. 交付 `scripts/check-pr-size.sh`：
   - 净变更 = 全量 diff − generated 文件 − migration / lockfile − 注释 / 空白行
   - > 500 行 fail；100 ~ 500 warn（pass）；≤ 100 silent
3. GitHub Actions 集成：在 PR check 阶段调用 check-pr-size.sh
4. 提供 `--allow-large-pr` 标记 + Master 审批留痕（PR description 中含 `Approved-Large-PR-By: master-001`）

## 验收标准

- [ ] AC-1 (GWT): Given `template/docs/MASTER-RULES.md` 与 `SLAVER-RULES.md`, When PR 合并, Then `git diff` 可见两条新红线 (`**红线**: Rule of 500 ...` / `**红线**: PR Sizing ...`)
- [ ] AC-2: Given 一个 600 行 PR 无 `Approved-Large-PR-By`, When CI 运行, Then check-pr-size 失败
- [ ] AC-3: Given 一个 600 行 PR 有 Master 审批, When CI 运行, Then check-pr-size pass + 输出 warn
- [ ] AC-4: Given 一个 80 行 PR, When CI 运行, Then silent pass
- [ ] AC-5: 净变更定义按专家组决议（U-2）：去 generated / migration / lock / 纯注释 / 空白行
- [ ] AC-6: 本 ticket 自身 PR ≤ 200 行（meta 自洽）

## observability
- logs: ["pr.size.check", "pr.size.threshold_exceeded"]
- metrics: ["pr.size.lines_net", "pr.size.warn_count", "pr.size.fail_count"]

## rollback_plan

CI 阶段先用 `continue-on-error: true` 上线 1 周观察；任何误报立即 revert 该 step。RULES 红线一旦上线只能 patch 不能 revert（项目纪律）。

## test_strategy
- unit: check-pr-size.sh 对 fixture diff（80 / 200 / 600 / 600+approval 4 个样本）输出预期
- integration: 在 fork PR 上挂载 workflow，验证 4 个场景
- regression: 现有 PR 全部跑一遍，记录 warn / fail 比例

---

**类型**: Feature
**技能要求**: Bash / GitHub Actions / Markdown
**依赖**: 无
**assigned_experts**: tech-architect, qa-lead

<!-- machine-readable fields -->
agent_type: devops
estimate_hours: 6
