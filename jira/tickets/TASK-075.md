# TASK-075: trigger_rule + fresh_context — 依赖灵活化与上下文隔离

**Ticket ID**: TASK-075
**Epic**: SELF-EVOLVE
**标题**: 借鉴 Archon：Ticket 依赖支持 trigger_rule（one_success），任务执行支持 fresh_context 隔离
**类型**: feature
**优先级**: P2
**重要性**: medium

**状态**: ready
**创建时间**: 2026-04-19
**创建者**: Master
**负责人**: 待认领

**依赖关系**:
- blocks: []
- blocked_by: [TASK-070]

---

## 背景 & 动机

Archon DAG 的两个精妙设计：
1. `trigger_rule: one_success` — 多个前置任务任一成功即可触发后续，适合"调研路线A 或 路线B 任一完成就可以开始实现"
2. `fresh_context: true` — 节点用全新 Claude session，避免长工作流中前置节点的上下文污染后续判断

EKET 目前 `blocked_by` 要求全部前置完成（`all_success`）且无法控制 Slaver 是否复用 session。

---

## 需求

### 验收标准

- **AC-1**: `jira/tickets/*.md` 元数据新增可选字段：
  ```
  **trigger_rule**: all_success|one_success|all_done  （默认 all_success）
  **fresh_context**: true|false                        （默认 false）
  ```
- **AC-2**: `node/src/core/task-dependency.ts` 新增 `canProceed(deps, completed, failed)` 函数，实现3种规则：
  - `all_success`：所有前置 ticket 均 done
  - `one_success`：至少一个前置 ticket done
  - `all_done`：所有前置均 done 或 failed（不阻塞于失败）
- **AC-3**: `node/src/commands/master-heartbeat.ts` 中 `generateReport()` 使用 `canProceed()` 判断哪些 ticket 可解锁
- **AC-4**: `fresh_context` 字段写入 `.eket/ACTIVE_CONTEXT.md`，Slaver 读取后决定是否开新 session
- **AC-5**: 单元测试：3种 trigger_rule 各2个场景（满足/不满足）= 6个测试

### 技术方案

```typescript
// node/src/core/task-dependency.ts

export type TriggerRule = 'all_success' | 'one_success' | 'all_done';

export function canProceed(
  blockedBy: string[],
  triggerRule: TriggerRule = 'all_success',
  completedIds: Set<string>,
  failedIds: Set<string>
): boolean {
  switch (triggerRule) {
    case 'all_success':
      return blockedBy.every(id => completedIds.has(id));
    case 'one_success':
      return blockedBy.some(id => completedIds.has(id));
    case 'all_done':
      return blockedBy.every(id => completedIds.has(id) || failedIds.has(id));
  }
}
```

---

## 测试命令

```bash
cd node && npm test -- --testPathPattern=task-dependency
```

## 回滚

纯新增函数 + ticket 元数据字段，向后兼容（缺省值 = 原有行为）。
