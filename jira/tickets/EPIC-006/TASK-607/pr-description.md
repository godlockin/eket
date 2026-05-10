# PR: TASK-607 - Context Overflow Alert Manager

**提交者**: slaver-backend-006  
**分支**: `feature/TASK-607-alert-manager`  
**目标分支**: `testing`  
**创建时间**: 2026-05-10T12:30:00+08:00

---

## 关联 Ticket

- TASK-607 (EPIC-006 - Monitoring & Observability)

---

## 变更摘要

实现 AlertManager 连续错误告警机制，当单个任务触发 3 次 context overflow (400) 错误时自动创建告警文件，全局 5 次触发系统级告警。

**核心功能**:
- ✅ Task-level 告警 (3 次阈值)
- ✅ System-level 告警 (5 次阈值)
- ✅ 告警去重与更新
- ✅ 任务完成自动清理
- ✅ 完整单元测试覆盖

**文件统计**:
```
node/src/core/alert-manager.ts           | 313 +++++++++++++++
node/src/core/claude-runner.ts           |   5 +
node/src/commands/complete.ts            |   7 +
node/tests/core/alert-manager.test.ts    | 351 +++++++++++++++
jira/tickets/EPIC-006/TASK-607/          |   1 +
  acceptance-verification.md
```

**代码行数**: +676 / -0

---

## 变更详情

### 1. 新增 AlertManager 核心类

**文件**: `node/src/core/alert-manager.ts`

**功能**:
- `recordError(taskId, estimatedTokens)` - 记录单次错误
- `createTaskAlert()` - 创建任务级告警（3 次触发）
- `updateTaskAlert()` - 更新已有告警
- `createGlobalAlert()` - 创建系统级告警（5 次触发）
- `clearTaskAlert()` - 任务完成时清理

**设计亮点**:
```typescript
export class AlertManager {
  private errorCounts: Map<string, ErrorRecord> = new Map();
  private globalErrorCount: number = 0;
  private alertedTasks: Set<string> = new Set(); // 防重复

  async recordError(taskId: string, estimatedTokens: number) {
    // 1. 更新计数
    // 2. 检查阈值 (task=3, global=5)
    // 3. 触发告警创建或更新
  }
}
```

**告警文件格式**:
- Task-level: `inbox/human_feedback/[ALERT] context-overflow-TASK-XXX.md`
- System-level: `inbox/human_feedback/[ALERT] context-system-critical.md`

**告警内容包含**:
- 错误次数、触发时间、Token 历史
- 建议操作（拆分任务 / 限制分析深度 / 人工接管）
- Master 决策区块

### 2. 集成到 Claude Runner

**文件**: `node/src/core/claude-runner.ts`

**集成点**: `handle400Error()` 函数，在检测到 context_length_exceeded 错误后：

```typescript
// TASK-607: Record error for alerting
const taskId = readTaskIdFromProfile(options.projectRoot);
const sessionId = options.sessionId || 'unknown';
const estimatedTokens = contextTracker.getSessionTokens(sessionId);
await alertManager.recordError(taskId, estimatedTokens);
```

**无侵入性**: 仅添加 4 行代码，不影响现有恢复流程。

### 3. 集成到 Complete Command

**文件**: `node/src/commands/complete.ts`

**清理逻辑**: 任务标记为 `done` 后自动清理告警：

```typescript
// TASK-607: Clear context overflow alert for completed task
await alertManager.clearTaskAlert(ticketId);
```

**集成点**:
- Line 488: `isolation=none` 模式
- Line 593: `isolation=worktree` 模式

### 4. 单元测试（16 个测试用例）

**文件**: `node/tests/core/alert-manager.test.ts`

**测试覆盖**:
```
✓ Task-level alerts (6 tests)
  - 3 次错误创建告警
  - 阈值前不创建
  - 重复错误仅更新不重复创建
  - 多任务独立追踪
  - 清理逻辑
  - 空 ID 处理

✓ System-level alerts (3 tests)
  - 5 次全局错误创建系统告警
  - 阈值前不创建
  - 全局计数准确性

✓ Combined scenarios (1 test)
  - 同时触发 task + system 告警

✓ Edge cases (3 tests)
  - 0 token 估算
  - 超大 token 值
  - 空任务 ID

✓ Reset & Custom thresholds (3 tests)
```

**测试结果**: 16/16 通过 (100%)

---

## 验收标准验证

### AC-1: 单任务 3 次错误创建告警 ✅

```bash
$ npm test -- alert-manager.test.ts -t "creates alert after 3 errors"
✓ creates alert after 3 errors for the same task (37 ms)
```

### AC-2: 告警内容完整性 ✅

验证告警文件包含：
- ✅ taskId, 错误次数, 时间戳
- ✅ Token 历史记录
- ✅ 建议操作（3 选项）

### AC-3: 重复错误不重复创建 ✅

```bash
$ npm test -- alert-manager.test.ts -t "updates existing alert"
✓ updates existing alert instead of creating duplicates (3 ms)
```

### AC-4: 全局 5 次错误创建系统告警 ✅

```bash
$ npm test -- alert-manager.test.ts -t "creates system alert"
✓ creates system alert after 5 global errors (2 ms)
```

### AC-5: 任务完成清理告警 ✅

```bash
$ npm test -- alert-manager.test.ts -t "clears task alert"
✓ clears task alert when task completes (1 ms)
```

**详细验证报告**: `jira/tickets/EPIC-006/TASK-607/acceptance-verification.md`

---

## 测试情况

### 单元测试

```bash
$ cd node && npm test -- alert-manager.test.ts

Test Suites: 1 passed, 1 total
Tests:       16 passed, 16 total
Time:        0.224 s
```

### 集成测试

验证对现有模块无回归：

```bash
$ npm test -- claude-runner
Tests: 15 passed, 15 total ✅

$ npm test -- complete
Tests: 12 passed, 12 total ✅
```

### 构建验证

```bash
$ npm run build
> tsc
✅ No TypeScript errors
```

### 手动验证（可选）

创建测试脚本验证端到端流程：

```javascript
// manual-test-alert.mjs
import { alertManager } from './dist/core/alert-manager.js';

await alertManager.recordError('TASK-TEST', 150000);
await alertManager.recordError('TASK-TEST', 160000);
await alertManager.recordError('TASK-TEST', 170000);

console.log('Check: inbox/human_feedback/[ALERT] context-overflow-TASK-TEST.md');
```

---

## 注意事项

### ⚠️ Master 需知

1. **告警文件识别**
   - 文件命名格式: `[ALERT] context-overflow-TASK-XXX.md`
   - 位置: `inbox/human_feedback/`
   - 建议 Master 添加自动识别逻辑（轮询检查 `[ALERT]` 前缀文件）

2. **告警处理流程**
   - 读取告警文件
   - 评估建议操作（A: 拆分任务 / B: 限制深度 / C: 人工接管）
   - 在文件末尾追加决策记录

3. **依赖任务**
   - TASK-603 (日志记录) - 已完成，本任务可独立运行
   - TASK-608 (预算管理) - 可选增强，非阻塞

### 🔧 技术债务

- **内存态存储**: 当前计数存于内存，重启后清零（可接受）
- **未来增强**: 
  - 持久化到 SQLite（TASK-608 后实现）
  - 集成 Slack 通知（利用现有 `alerting.ts`）
  - 历史告警追踪

---

## Rollback Plan

若需回滚：

```bash
git revert <commit-sha>
npm run build
npm test
```

**影响**: 仅告警功能失效，核心恢复流程不受影响（AlertManager 完全解耦）。

---

## 文件清单

### 新增文件
- `node/src/core/alert-manager.ts` (313 LOC)
- `node/tests/core/alert-manager.test.ts` (351 LOC)
- `jira/tickets/EPIC-006/TASK-607/acceptance-verification.md`

### 修改文件
- `node/src/core/claude-runner.ts` (+5 lines)
- `node/src/commands/complete.ts` (+7 lines)

---

## Checklist

- [x] 代码符合 TypeScript 规范 (`npm run build` 通过)
- [x] 单元测试覆盖核心逻辑 (16/16 通过)
- [x] 无现有测试回归 (claude-runner, complete 测试通过)
- [x] 验收标准全部满足 (AC-1 ~ AC-5)
- [x] 代码注释完整
- [x] 验收文档已创建
- [x] Commit message 遵循规范

---

## 状态：✅ Ready for Review

**预估 Review 时间**: 30 分钟

**请 Master 重点关注**:
1. 告警文件格式是否满足 Master 读取需求
2. 阈值设置 (3/5) 是否合理
3. 清理逻辑是否完整

---

**Slaver**: slaver-backend-006  
**提交时间**: 2026-05-10T12:30:00+08:00

Co-Authored-By: Claude Sonnet 4 <noreply@anthropic.com>
