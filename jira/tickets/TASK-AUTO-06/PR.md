# PR 请求：TASK-AUTO-06

**提交者**: Slaver-021  
**分支**: feature/TASK-AUTO-06-auto-retry  
**目标分支**: testing  
**创建时间**: 2026-05-14T12:00:00+08:00

---

## 关联 Ticket

- TASK-AUTO-06: 自动重试机制

## 变更摘要

```
 jira/tickets/TASK-AUTO-06/IMPLEMENTATION.md       | 220 +++++++++++++++++++++
 jira/tickets/TASK-AUTO-06/SUMMARY.md              |  30 +++
 node/src/commands/task-reset-retry.ts             |  70 +++++++
 node/src/core/auto-retry-manager.ts               | 280 +++++++++++++++++++++++++
 node/src/core/master-slaver-monitor.ts            | 120 ++++++++++-
 node/src/index.ts                                 |   3 +
 node/tests/auto-retry-manager.test.ts             | 250 ++++++++++++++++++++++
 7 files changed, 971 insertions(+), 2 deletions(-)
```

## 变更详情

### 核心功能

**AutoRetryManager** (`node/src/core/auto-retry-manager.ts`):
- 管理任务重试状态（attempts, maxRetries, failureReasons）
- 状态持久化到 `.eket/state/retry/retry-<task-id>.json`
- 提供 `shouldRetry()`, `recordFailure()`, `resetRetryState()` API
- 支持扫描需人工干预的任务

**MasterSlaverMonitor 集成** (`node/src/core/master-slaver-monitor.ts`):
- 心跳超时检测后自动触发重试逻辑
- `handleTimeoutWithRetry()`: 检查 retry 资格 → 记录失败 → 触发 resume
- 3 次失败后发送人工告警到 `inbox/human_feedback/`

**CLI 命令** (`node/src/commands/task-reset-retry.ts`):
- `eket task:reset-retry <task-id>`: 重置重试状态
- `--force` 跳过确认（自动化场景）

### 验收标准

✅ **AC-1**: Slaver 失败时记录状态  
验证: `npm test -- auto-retry-manager.test.ts` → "AC-1: Record failure" suite passed

✅ **AC-2**: Master 自动派遣 resume (最多 3 次)  
验证: `shouldRetry()` 检查 + 测试覆盖 1/2/3 次失败场景

✅ **AC-3**: 3 次失败后人工告警  
验证: `sendHumanAlert()` 自动生成 `inbox/human_feedback/alert-*.md`

✅ **AC-4**: 避免无限循环  
验证: `maxRetries=3` 硬限制 + `hasReachedMaxRetries()` 检查

## 测试情况

**单元测试**: `node/tests/auto-retry-manager.test.ts`
- 16 tests passed (0 failures)
- 覆盖所有 AC + edge cases

```bash
cd node && npm test -- auto-retry-manager.test.ts
```

**测试输出**:
```
PASS tests/auto-retry-manager.test.ts
  AutoRetryManager
    AC-1: Record failure
      ✓ should create retry state on first failure
      ✓ should increment attempts on subsequent failures
      ✓ should persist state to file
    AC-2: Check retry eligibility
      ✓ should allow retry on first failure
      ✓ should allow retry after 1 failure
      ✓ should allow retry after 2 failures
      ✓ should block retry after 3 failures (max retries)
    AC-3: Max retries detection
      ✓ should return true when max retries reached
      ✓ should return false before max retries
      ✓ should identify tasks needing intervention
    AC-4: Reset retry state
      ✓ should remove state file on reset
      ✓ should allow retry after reset
    Edge cases
      ✓ should handle non-existent task gracefully
      ✓ should handle corrupted state file
      ✓ should support custom max retries
    Integration: Full retry cycle
      ✓ should complete full retry cycle

Test Suites: 1 passed, 1 total
Tests:       16 passed, 16 total
```

## 注意事项

### Master 审核时请检查

1. **重试逻辑正确性**: 
   - 第 1/2/3 次失败正确触发 retry
   - 第 4 次失败正确发送人工告警而非 retry

2. **状态文件隔离**:
   - 文件路径 `.eket/state/retry/` 独立于其他状态
   - 不会干扰现有 heartbeat / checkpoint 机制

3. **人工告警格式**:
   - 检查 `inbox/human_feedback/alert-*.md` 模板可读性
   - 确认包含完整失败历史和操作指引

4. **CLI 命令安全性**:
   - `--force` 标志行为符合预期
   - 无 `--force` 时正确提示用户确认

### 后续工作

- [ ] 集成 Metrics（记录重试成功率）
- [ ] 实现指数退避（延迟重试）
- [ ] 区分可重试/不可重试失败类型

---

## 状态：pending_review

**等待 Master 审核**  
**预计合并后可立即生效**（无需额外配置）
