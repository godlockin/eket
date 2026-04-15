# TASK-035: Layer 3b — Hook 脚本骨架（状态变更触发管道）

**Ticket ID**: TASK-035
**Epic**: RULE-RETENTION（规则保持性增强）
**标题**: 实现 ticket 状态变更事件触发 hook 的基础管道
**类型**: feature
**优先级**: P1
**重要性**: high

**状态**: ready
**创建时间**: 2026-04-15
**创建者**: Master
**负责人**: 待领取

**所属 Epic**: RULE-RETENTION
**标签**: `hook`, `workflow-engine`, `typescript`

**依赖关系**:
- blocks: [TASK-036]
- blocked_by: []

---

## 1. 需求概述

### 1.1 功能描述

作为 EKET 框架运维者，我需要在 ticket 状态变更到 `pr_review` 时自动触发 hook 脚本，以便机器层面强制校验规则（不依赖 agent 上下文记忆）。

### 1.2 验收标准

- [ ] `workflow-engine.ts` 的 `transitionStatus()` 在目标状态为 `pr_review` 时调用 hook
- [ ] 新增 `EketErrorCode.HOOK_BLOCKED` 错误码
- [ ] 支持 `EKET_HOOK_DRYRUN=true` 环境变量（只记录日志不阻断）
- [ ] 支持 ticket 元数据 `hookOverride: true` 强制跳过 hook（防死锁）
- [ ] 验收命令：
  ```bash
  grep -l 'HOOK_BLOCKED\|runPrePrReviewHook' node/src/core/workflow-engine.ts node/src/types/index.ts
  EKET_HOOK_DRYRUN=true node dist/index.js task:update-status TASK-001 pr_review 2>&1 | grep -i dryrun
  cd node && npm test 2>&1 | tail -3
  ```

---

## 2. 技术设计

### 2.1 影响文件

- `node/src/core/workflow-engine.ts` — 注入 `runPrePrReviewHook()` 调用点
- `node/src/types/index.ts` — 新增 `HOOK_BLOCKED` error code 和 `HookResult` 类型

### 2.2 实现方案

在 `workflow-engine.ts` 状态机 transition 逻辑中注入 hook 调用：

```typescript
async function transitionStatus(
  ticketId: string,
  from: TicketStatus,
  to: TicketStatus,
  options?: { hookOverride?: boolean }
): Promise<Result<void>> {
  // 状态进入 pr_review 时触发 hook
  if (to === 'pr_review' && !options?.hookOverride) {
    if (process.env.EKET_HOOK_DRYRUN === 'true') {
      logger.info({ msg: '[DRYRUN] Hook would run here', ticketId });
    } else {
      const hookResult = await runPrePrReviewHook(ticketId);
      if (!hookResult.success) {
        return { success: false, error: hookResult.error };
      }
    }
  }
  return performTransition(ticketId, from, to);
}
```

`runPrePrReviewHook()` 此阶段实现为 stub（返回 `{ success: true }`），等 TASK-036 实现真实脚本后接入。

### 2.3 新增类型

```typescript
// types/index.ts
HOOK_BLOCKED = 'HOOK_BLOCKED',

interface HookResult {
  passed: boolean;
  errors: string[];
  ticketId: string;
  timestamp: string;
}
```

### 2.4 测试要点

- `transitionStatus(id, 'ready', 'pr_review')` 调用 hook stub
- `EKET_HOOK_DRYRUN=true` 时不调用 shell，只记录日志
- `hookOverride: true` 时跳过 hook
- 非 `pr_review` 目标状态时 hook 不触发

---

## 4. 执行记录

### 4.1 领取信息
- **领取者**: 待填写
- **领取时间**: 待填写
- **预计工时**: 3h

### 4.2 状态流转

| 时间 | 状态变更 | 操作者 | 备注 |
|------|----------|--------|------|
| 2026-04-15 | backlog → ready | Master | 初始创建 |
