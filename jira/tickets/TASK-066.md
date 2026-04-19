# TASK-066: Slaver 超时保底 — FailStaleTasks 定时清理

**Ticket ID**: TASK-066
**Epic**: SELF-EVOLVE
**标题**: 新增定时任务：清理 dispatched 超时的 ticket，防止 Slaver 失联后任务永远卡在 in_progress
**类型**: feature
**优先级**: P1
**重要性**: high

**状态**: ready
**创建时间**: 2026-04-19
**创建者**: Master
**负责人**: 待认领

**依赖关系**:
- blocks: []
- blocked_by: [TASK-065]

---

## 背景 & 动机

Multica 有 `FailStaleTasks` cron：

```sql
UPDATE agent_task_queue
SET status='failed', error='task timed out'
WHERE
  (status='dispatched' AND dispatched_at < now() - interval '5 min')
  OR
  (status='running'    AND started_at   < now() - interval '60 min')
```

EKET 目前无超时机制，Slaver 崩溃/网络中断后 ticket 永远停在 `in_progress`，Master 无法感知。

---

## 需求

### 验收标准

- **AC-1**: Master heartbeat 循环（`node/src/commands/master-heartbeat.ts`）中，每轮额外执行 `failStaleTasks()`
- **AC-2**: 超时阈值可配置（默认：`in_progress` 超过 30 分钟 → `blocked`，超过 2 小时 → `failed`）
- **AC-3**: 超时变更写入 ticket 的 `## 执行日志` 节：`[TIMEOUT] 2026-04-19T10:00:00Z — 超时自动标记为 failed`
- **AC-4**: 超时清理操作写入 `confluence/memory/` 的日志文件，便于事后审计
- **AC-5**: 单元测试：mock 一个 `in_progress` 超时 3 小时的 ticket，验证被正确标记为 `failed`

### 技术方案

新建 `node/src/core/stale-task-cleaner.ts`：

```typescript
export async function failStaleTasks(config: {
  blockedThresholdMs: number   // default: 30 * 60 * 1000
  failedThresholdMs: number    // default: 2 * 60 * 60 * 1000
}): Promise<{ blocked: string[]; failed: string[] }>
```

在 `master-heartbeat.ts` 的心跳循环末尾调用。

---

## 测试命令

```bash
cd node && npm test -- --testPathPattern=stale-task-cleaner
```

## 回滚

新增独立模块，不修改现有代码路径。删除调用点即可回滚。

---

## 执行日志

**负责人**: backend_dev (Slaver)
**领取时间**: 2026-04-18T00:00:00Z
**完成时间**: 2026-04-18T00:00:00Z
**状态**: done

### 实现细节

- 新建 `node/src/core/stale-task-cleaner.ts`，导出 `failStaleTasks(config)` 函数
  - 扫描 `jira/tickets/*.md`，检测 `**状态**: in_progress` 的 ticket
  - 解析 `**claimed_at**` / `**started_at**` 字段，fallback 到文件 mtime
  - 超过 `blockedThresholdMs`（默认 30 min）→ `blocked`
  - 超过 `failedThresholdMs`（默认 2h）→ `failed`
  - 追加 `[TIMEOUT]` 记录到 ticket 的 `## 执行日志` 节
  - 写审计日志到 `confluence/memory/stale-task-audit.md`
- 修改 `node/src/commands/master-heartbeat.ts`：
  - import `failStaleTasks`
  - `generateReport()` 末尾（return 前）调用 `failStaleTasks({ projectRoot })`，异常静默捕获

### 测试结果

文件：`node/tests/core/stale-task-cleaner.test.ts`

```
PASS tests/core/stale-task-cleaner.test.ts
Tests: 5 passed, 5 total
```

- ✅ AC-1: heartbeat 末尾调用 failStaleTasks
- ✅ AC-2: blockedThresholdMs / failedThresholdMs 可配置，默认 30min / 2h
- ✅ AC-3: 超时记录写入 ticket ## 执行日志
- ✅ AC-4: 审计日志写入 confluence/memory/stale-task-audit.md
- ✅ AC-5: mock 3h 超时 ticket → 正确标记为 failed
