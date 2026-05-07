# TASK-235: skill system split + expert×skills + doc lifecycle 回灌 main

## 元数据
- **状态**: todo
- **类型**: refactor
- **优先级**: P2
- **agent_type**: fullstack
- **estimate_hours**: 3
- **parent_epic**: EPIC-003
- **创建时间**: 2026-04-29
- **依赖**: TASK-231
- **assigned_experts**: tech-architect

## 背景

EPIC-003 第 6 步。miao 上 4 个 commit 涉及 skill 系统重构 + expert×skills 关联 + 文档生命周期自动化。与 main 上 EPIC-002 的 expert persona 改动有 overlap，需协调。可与 TASK-236 并行。

## 详细描述

回灌范围（按 hash）：
- `64604913` expert×skills 关联 + spike/roadmap/design 工作流
- `54fe33d6` 文档生命周期自动化（每节点自动产生 jira+confluence）
- `196fcbaf` skill system split — core 留主仓 / extended 迁出
- `84897dd0` 删除 70 个 dead-code skill TS 实现

## 协调约束

- main 上 EPIC-002 的 `template/agents/` 改动可能与 `196fcbaf` skill split 路径冲突
- TASK-225/227 注入的 3 节 skeleton 必须保留（不能被 dead-code 删除波及）
- `~/.claude/skills/eket/experts/optional/` 镜像同步（与 TASK-228 一致）

## 验收标准

- [ ] AC-1: 4 commit cherry-pick 到 testing
- [ ] AC-2: `bash scripts/check-skill-anatomy.sh --all` 全绿（default 7/7 + optional 59/59）
- [ ] AC-3: skill split 后 `template/skills/core/` 与 `template/skills/extended/` 路径正确
- [ ] AC-4: dead-code 70 文件删除不影响 `node dist/index.js skill:list` 正常输出
- [ ] AC-5: ~/.claude/skills/ 镜像与主仓 identical

## observability
- logs: ["epic003.skill_refactor.backport_completed"]
- metrics: ["skill.dead_code.removed_count", "expert.skill.association_count"]

## rollback_plan

revert PR；70 个 dead-code skill 删除可逆，但 expert×skills 关联表会回滚到无关联状态。

## test_strategy
- unit: tests/unit/skill-loader.test.ts
- integration: skill:list / skill:run 端到端
- regression: TASK-228 注入的 3 节 skeleton 仍存在

---

**类型**: Refactor (回灌)
**技能要求**: Node.js / TypeScript / skill system
**依赖**: TASK-231
**assigned_experts**: tech-architect

<!-- machine-readable fields -->
agent_type: fullstack
estimate_hours: 3
