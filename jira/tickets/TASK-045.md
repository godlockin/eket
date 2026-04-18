# TASK-045: Slaver Role 专项化（Code / Test / Review / Infra）

**Ticket ID**: TASK-045
**Epic**: SELF-EVOLVE
**标题**: Slaver 按专项角色初始化，系统提示词按 role 加载对应专业上下文
**类型**: feature
**优先级**: P3
**重要性**: low

**状态**: backlog
**创建时间**: 2026-04-16
**创建者**: Master
**负责人**: 待领取

**依赖关系**:
- blocks: []
- blocked_by: [TASK-043]

**标签**: `slaver`, `role`, `specialization`, `context`, `token-optimization`

---

## 1. 需求概述

### 1.1 背景与动机

**借鉴来源**：Harness AIDA 的专项 AI Agent 模式（专门的 RCA Agent、专门的 Pipeline Agent、专门的 Security Agent）。

**当前痛点**：所有 Slaver 加载相同的通用系统提示词（`SLAVER-RULES.md`），不管 ticket 是写代码、写测试、做 Code Review 还是改基础设施，上下文完全相同。通用提示词冗长，导致：
1. Token 浪费（Review Slaver 不需要知道 CI 流水线写法）
2. 精准度不足（Code Slaver 混入 Review 的规则，容易在实现阶段就开始自我审查）

**目标**：Master 初始化 Slaver 时，按 ticket 类型注入对应的专项提示词模块，实现上下文最小化 + 专业深度最大化。

### 1.2 功能描述

定义 4 种 Slaver Role：

| Role | 适用 ticket 类型 | 专项上下文 |
|------|----------------|-----------|
| `code` | feature, bug | 实现规范、类型安全、DRY |
| `test` | test, quality | 测试策略、覆盖率、断言风格 |
| `review` | review | PR 审查清单、违规检测 |
| `infra` | infra, ci, devops | 基础设施变更、回滚策略 |

Master 在 `task:claim` 或 `handoff:confirm` 时根据 ticket `type` 字段自动选择 role，注入 `SLAVER-RULES-{ROLE}.md` 模块。

### 1.3 验收标准

- [ ] `template/docs/` 新增 4 个专项规则文件：`SLAVER-RULES-CODE.md`、`SLAVER-RULES-TEST.md`、`SLAVER-RULES-REVIEW.md`、`SLAVER-RULES-INFRA.md`
- [ ] `node/src/commands/task-claim.ts` 根据 ticket `type` 字段输出"加载专项规则: SLAVER-RULES-{ROLE}.md"提示
- [ ] `node/src/core/role-selector.ts` 新建，提供 `selectRole(ticketType: string): SlaverRole` 函数
- [ ] `node dist/index.js task:claim TASK-042` 输出"[Role] 加载专项规则: SLAVER-RULES-CODE.md"
- [ ] 新增 3 个测试（role 选择逻辑：feature→code, test→test, review→review, 默认→code）
- [ ] `npm run build && npm test` 0 error

---

## 2. 技术设计

### 2.1 影响文件

| 文件 | 变更类型 | 说明 |
|------|----------|------|
| `node/src/core/role-selector.ts` | 新建 | role 映射逻辑 |
| `node/src/commands/task-claim.ts` | 修改 | 输出 role 提示 |
| `template/docs/SLAVER-RULES-CODE.md` | 新建 | Code Slaver 专项规则 |
| `template/docs/SLAVER-RULES-TEST.md` | 新建 | Test Slaver 专项规则 |
| `template/docs/SLAVER-RULES-REVIEW.md` | 新建 | Review Slaver 专项规则 |
| `template/docs/SLAVER-RULES-INFRA.md` | 新建 | Infra Slaver 专项规则 |
| `node/tests/core/role-selector.test.ts` | 新建 | 3 个测试 |

### 2.2 Role 选择逻辑

```typescript
// node/src/core/role-selector.ts
export type SlaverRole = 'code' | 'test' | 'review' | 'infra';

const ROLE_MAP: Record<string, SlaverRole> = {
  feature: 'code',
  bug: 'code',
  refactor: 'code',
  test: 'test',
  quality: 'test',
  review: 'review',
  infra: 'infra',
  ci: 'infra',
  devops: 'infra',
} as const;

export function selectRole(ticketType: string): SlaverRole {
  return ROLE_MAP[ticketType.toLowerCase()] ?? 'code';
}

export function getRulesPath(role: SlaverRole): string {
  return `template/docs/SLAVER-RULES-${role.toUpperCase()}.md`;
}
```

### 2.3 task:claim 输出示例

```
$ node dist/index.js task:claim TASK-042
[Task] Claiming TASK-042: 结构化消息 Schema + Zod Validation
[Role] Ticket type: feature → 加载专项规则: SLAVER-RULES-CODE.md
[Role] 规则路径: template/docs/SLAVER-RULES-CODE.md
[Task] Status: ready → in_progress
```

### 2.4 专项规则文件结构（以 SLAVER-RULES-CODE.md 为例）

```markdown
# Slaver 专项规则 — Code Role

> 本文件补充 SLAVER-RULES.md 通用规则，Code Slaver 必须遵守。

## 核心原则
- 类型安全优先：无 any，无 @ts-ignore
- Fail Fast：env 变量启动时验证
- DRY：提取复用，不 copy-paste

## 实现规范
- TypeScript strict mode，ESM 导入带 .js 后缀
- 函数 <20 行，文件 <200 行
- 每个 public 函数配测试

## 禁止行为
- 不自行修改验收标准
- 不自行 merge PR
- 连续 5 次读文件无写操作 → 立刻编码或报 BLOCKED
```

### 2.5 设计决策

1. **仅提示，不强制加载**：`task:claim` 只输出规则文件路径提示，不自动读取文件内容（避免 token 爆炸）；Slaver 收到提示后主动 `Read` 对应规则文件
2. **向后兼容**：未知 ticketType 默认 `code` role，不 break 现有流程
3. **P3 优先级**：专项化收益偏向 token 优化和精准度，不影响核心功能，可在 SELF-EVOLVE 其他 ticket 完成后再实施

---

## 4. 执行记录

### 4.1 领取信息
- **领取者**: 待填写
- **领取时间**: 待填写
- **预计工时**: 3h

### 4.2 状态流转

| 时间 | 状态变更 | 操作者 | 备注 |
|------|----------|--------|------|
| 2026-04-16 | backlog → ready | Master | 初始创建，借鉴 Harness 专项 Agent 模式，目标 token 压缩 + 精准度提升 |
