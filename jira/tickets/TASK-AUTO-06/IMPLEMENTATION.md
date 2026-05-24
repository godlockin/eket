# TASK-AUTO-06: 自动重试机制 - 实现文档

**完成时间**: 2026-05-14  
**Slaver**: Slaver-021 (backend_dev)  
**实际工时**: 3.5h

---

## 1. 实现概要

实现 Slaver 失败自动重试机制，最多 3 次，超限后人工告警。

### 核心模块

| 模块 | 路径 | LOC | 功能 |
|------|------|-----|------|
| AutoRetryManager | `node/src/core/auto-retry-manager.ts` | 280 | 重试状态管理 |
| MasterSlaverMonitor | `node/src/core/master-slaver-monitor.ts` | +120 | 集成超时检测 + retry |
| task-reset-retry | `node/src/commands/task-reset-retry.ts` | 70 | CLI 重置命令 |

---

## 2. AC 验收

| AC | 描述 | 验证方式 | 状态 |
|----|------|---------|------|
| AC-1 | Slaver 失败时记录状态 | `recordFailure()` 自动存储 | ✅ |
| AC-2 | Master 自动派遣 resume (最多 3 次) | `shouldRetry()` 检查 + `handleTimeoutWithRetry()` | ✅ |
| AC-3 | 3 次失败后人工告警 | `sendHumanAlert()` 写 inbox/human_feedback | ✅ |
| AC-4 | 避免无限循环 | `maxRetries=3` + `hasReachedMaxRetries()` | ✅ |

---

## 3. 技术实现

### 3.1 AutoRetryManager

**状态存储**:
```json
{
  "taskId": "TASK-001",
  "attempts": 2,
  "maxRetries": 3,
  "lastFailedAt": 1715664000000,
  "failureReasons": [
    "Timeout after 650s",
    "Timeout after 650s again"
  ],
  "createdAt": 1715660000000,
  "updatedAt": 1715664000000
}
```

**文件位置**: `.eket/state/retry/retry-<task-id>.json`

**核心方法**:
- `shouldRetry(taskId)`: 检查是否可重试 (attempts < maxRetries)
- `recordFailure(taskId, reason)`: 记录失败，attempts++
- `resetRetryState(taskId)`: 人工重置（删除状态文件）
- `getTasksNeedingIntervention()`: 扫描所有达到 maxRetries 的任务

### 3.2 MasterSlaverMonitor 集成

**触发时机**: 检测到 Slaver 心跳超时 (650s)

**流程**:
```
timeout detected
  ↓
shouldRetry() → canRetry?
  ↓
YES: recordFailure() → triggerResume()
NO:  sendHumanAlert() → 写 inbox/human_feedback
```

**关键方法**: `handleTimeoutWithRetry(taskId, elapsed, hasCheckpoint)`

### 3.3 人工告警

**触发条件**: `attempts >= maxRetries`

**文件位置**: `inbox/human_feedback/alert-max_retries_reached-<task-id>-<timestamp>.md`

**内容模板**:
```markdown
# 🚨 HUMAN INTERVENTION REQUIRED

**Task ID**: TASK-001
**Alert Type**: max_retries_reached

## Failure History
  1. Timeout after 650s
  2. Timeout after 650s again
  3. Timeout after 650s third time

## Required Actions
1. Investigate Root Cause
2. Manual Fix
3. Reset Retry State: `eket task:reset-retry TASK-001 --force`
4. Re-dispatch
```

---

## 4. CLI 命令

### `eket task:reset-retry <task-id>`

重置任务重试状态（需人工确认）。

```bash
# 查看当前状态并重置
eket task:reset-retry TASK-001

# 跳过确认（自动化脚本）
eket task:reset-retry TASK-001 --force
```

**输出示例**:
```
📊 Current Retry State for TASK-001:
   Attempts: 3/3
   Last Failed: 2026-05-14T10:30:00.000Z

   Failure History:
     1. Timeout after 650s
     2. Timeout after 650s again
     3. Timeout after 650s third time

⚠️  WARNING: Resetting retry state will allow this task to be retried again.
   Make sure you have fixed the root cause before resetting.

✅ Retry state reset for TASK-001
   Task can now be retried from scratch (0/3 attempts)
```

---

## 5. 测试覆盖

**文件**: `node/tests/auto-retry-manager.test.ts`

**测试套件**:
- AC-1: Record failure (3 tests)
- AC-2: Check retry eligibility (4 tests)
- AC-3: Max retries detection (3 tests)
- AC-4: Reset retry state (2 tests)
- Edge cases (3 tests)
- Integration: Full retry cycle (1 test)

**结果**: 16/16 passed ✅

**执行**:
```bash
cd node && npm test -- auto-retry-manager.test.ts
```

---

## 6. 使用示例

### Master 端自动重试

```typescript
import { MasterSlaverMonitor } from './core/master-slaver-monitor.js';

const monitor = new MasterSlaverMonitor();

// 定期检查心跳
const timedOutTasks = await monitor.checkHeartbeats();
// → 自动触发 retry (最多 3 次)
// → 超限后发送人工告警到 inbox/human_feedback
```

### 人工干预

```bash
# 1. 收到告警（inbox/human_feedback/alert-*.md）
# 2. 修复根因
# 3. 重置重试状态
eket task:reset-retry TASK-001 --force

# 4. 重新派发任务
eket task:assign TASK-001 slaver-backend-01
```

---

## 7. 文件清单

### 新增文件
- `node/src/core/auto-retry-manager.ts` (280 LOC)
- `node/src/commands/task-reset-retry.ts` (70 LOC)
- `node/tests/auto-retry-manager.test.ts` (250 LOC)
- `jira/tickets/TASK-AUTO-06/SUMMARY.md`
- `jira/tickets/TASK-AUTO-06/IMPLEMENTATION.md` (本文件)

### 修改文件
- `node/src/core/master-slaver-monitor.ts` (+120 LOC)
- `node/src/index.ts` (+3 LOC - import + register)

### 生成文件（运行时）
- `.eket/state/retry/retry-<task-id>.json` (状态)
- `inbox/human_feedback/alert-max_retries_reached-<task-id>-*.md` (告警)

---

## 8. 后续优化建议

1. **指数退避**: 当前固定立即重试，可改为延迟重试（1min → 5min → 15min）
2. **失败分类**: 区分"可重试失败"（timeout）vs "不可重试失败"（auth error）
3. **Metrics**: 记录重试成功率、平均重试次数到监控系统
4. **Circuit Breaker**: 连续失败达阈值时暂停新任务派遣

---

**Slaver-021 签名**  
2026-05-14
