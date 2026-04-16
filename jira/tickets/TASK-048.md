# TASK-048: 补全 7 个缺 Skills 角色的工具库

**Ticket ID**: TASK-048
**Epic**: SELF-EVOLVE
**标题**: 为 7 个角色补全 Skills 工具库（需求分析/规划/审查/安全/数据/运维/集成）
**类型**: feature
**优先级**: P1
**重要性**: high

**状态**: completed
**创建时间**: 2026-04-16
**创建者**: Master
**负责人**: Slaver
**领取时间**: 2026-04-16
**完成时间**: 2026-04-16

**依赖关系**:
- blocks: []
- blocked_by: [TASK-046]

**标签**: `skills`, `analysis`, `planning`, `review`, `security`, `data`, `ops`, `integration`

---

## 1. 需求概述

### 1.1 背景

TASK-046 重设计了 9 种 Slaver 角色，但部分角色缺乏对应的 Skills 工具库支持。
Skills 是角色执行任务的标准化流程，缺少 Skills 的角色只有角色定义，没有执行指引。

### 1.2 需补全的 Skills

| 角色 | Skills 文件 | 状态 |
|------|------------|------|
| analysis | `node/src/skills/analysis/requirements-analysis.ts` | ✅ 已创建 |
| planning | `node/src/skills/planning/ticket-breakdown.ts` | ✅ 已创建 |
| review | `node/src/skills/review/pr-review-checklist.ts` | ✅ 已创建 |
| security | `node/src/skills/security/dependency-audit.ts` | ✅ 已创建 |
| data | `node/src/skills/data/data-pipeline.ts` | ✅ 已创建 |
| ops | `node/src/skills/ops/incident-runbook.ts` | ✅ 已创建 |
| implementation | `node/src/skills/implementation/third-party-integration.ts` | ✅ 已创建 |

### 1.3 验收标准

- [x] 7 个 Skill 文件全部创建，遵循 `Skill<Input, Output>` 泛型接口
- [x] 每个 Skill 有 `execute()` 方法，返回 `SkillOutput<T>`
- [x] `npm run build` 0 error
- [x] `npm test` 无新增失败

---

## 2. 实现详情

### 2.1 文件列表

```
node/src/skills/analysis/requirements-analysis.ts
  - RequirementsAnalysisSkill
  - 6 步流程：访谈 → 分类 → 用户故事 → 验收标准 → 风险 → 规格文档

node/src/skills/planning/ticket-breakdown.ts
  - TicketBreakdownSkill
  - 6 步流程：理解 Epic → Story 拆分 → Task 拆分 → 依赖标注 → 优先级 → 验收命令

node/src/skills/review/pr-review-checklist.ts
  - PRReviewChecklistSkill
  - 7 步检查：类型安全 → 测试覆盖 → 构建 → 全量测试 → 安全 → 文档 → PR 描述

node/src/skills/security/dependency-audit.ts
  - DependencyAuditSkill
  - 5 步流程：npm audit → CVE 分析 → 升级策略 → 风险文档 → 锁定提交

node/src/skills/data/data-pipeline.ts
  - DataPipelineSkill
  - 6 步流程：数据源确认 → 清洗 → 转换 → 质量校验 → 落库 → 监控告警

node/src/skills/ops/incident-runbook.ts
  - IncidentRunbookSkill
  - 6 步流程：告警确认 → 影响评估 → 应急处置 → 根因分析 → 修复上线 → Postmortem

node/src/skills/implementation/third-party-integration.ts
  - ThirdPartyIntegrationSkill
  - 7 步流程：文档锁定 → 沙箱验证 → 错误处理 → 幂等设计 → 超时降级 → 凭证管理 → 监控
```

### 2.2 设计决策

- 所有 Skill 遵循 `node/src/skills/types.ts` 定义的 `Skill<I, O>` 泛型接口
- `execute()` 方法接受 `SkillInput<T>`，返回 `Promise<SkillOutput<T>>`
- 每个 Skill 包含：`inputSchema`、`outputSchema`、`examples`、`execute()`
- 代码模板（codeTemplate）提供可直接使用的 TypeScript 代码片段
- 反模式（antiPatterns）标注常见错误，指导 Slaver 避坑

---

## 3. 测试结果

```
npm run build: 0 errors
npm test: 全量通过，无新增失败
```

---

## 4. 知识沉淀

### 4.1 Skills 接口规范

参见 `node/src/skills/types.ts`：
- `Skill<I, O>` 泛型接口
- `SkillInput<T>` 包含 `data`、`context`、`parameters`
- `SkillOutput<T>` 包含 `success`、`data`、`error`、`duration`、`logs`
- `SkillCategory` 枚举：REQUIREMENTS/DESIGN/DEVELOPMENT/TESTING/DEVOPS/SECURITY/DATA

### 4.2 新增 SkillCategory 说明

`data-pipeline.ts` 使用了 `SkillCategory.DATA`，需确认 `types.ts` 中存在该枚举值。
若不存在，需在 `types.ts` 中补充 `DATA = 'data'`（已在 types.ts 中确认存在）。
