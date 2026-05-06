# TASK-071: Agent 模型路由 — 节点级模型指定（haiku/sonnet/opus）

**Ticket ID**: TASK-071
**Epic**: SELF-EVOLVE
**标题**: 借鉴 Archon：Ticket 元数据支持 model 字段，Master 按任务复杂度分配模型，降低 30-50% 成本
**类型**: feature
**优先级**: P2
**重要性**: medium

**状态**: done
**创建时间**: 2026-04-19
**创建者**: Master
**负责人**: 待认领

**依赖关系**:
- blocks: []
- blocked_by: []

---

## 背景 & 动机

Archon 每个 DAG 节点可独立指定模型：分类/判断用 haiku（便宜），代码实现用 opus（强力）。EKET 目前所有任务统一用同一模型，对简单任务（分类、路由、状态更新）造成不必要的成本浪费。

---

## 需求

### 验收标准

- **AC-1**: `jira/tickets/*.md` 元数据新增可选字段 `**模型**: haiku|sonnet|opus`
- **AC-2**: `node/src/core/model-router.ts` 新增 `resolveModel(ticket)` 函数，规则：
  - ticket 标签含 `classify|route|triage` → haiku
  - ticket 标签含 `implement|code|feature` → opus  
  - 其余 → sonnet（默认）
  - ticket 元数据显式指定 `model` 字段时优先使用
- **AC-3**: `node/src/commands/claim.ts` 在认领时调用 `resolveModel()`，写入 `.eket/ACTIVE_CONTEXT.md` 的 `## Identity` 节
- **AC-4**: 单元测试：4种路由规则各一个用例

### 技术方案

```typescript
// node/src/core/model-router.ts
type ModelTier = 'haiku' | 'sonnet' | 'opus';

interface ModelRouteRule {
  tags: string[];       // ticket 标签匹配
  model: ModelTier;
}

const DEFAULT_RULES: ModelRouteRule[] = [
  { tags: ['classify', 'route', 'triage', 'lint'], model: 'haiku' },
  { tags: ['implement', 'code', 'feature', 'refactor'], model: 'opus' },
];

export function resolveModel(ticket: { tags: string[]; model?: string }): ModelTier {
  if (ticket.model) return ticket.model as ModelTier;
  for (const rule of DEFAULT_RULES) {
    if (ticket.tags.some(tag => rule.tags.includes(tag))) return rule.model;
  }
  return 'sonnet'; // 默认
}
```

---

## 测试命令

```bash
cd node && npm test -- --testPathPattern=model-router
```

## 回滚

纯新增模块 + claim.ts 追加写入，不影响执行逻辑。
