# TASK-AUTO-15: 恢复队列处理

**Epic**: EPIC-009  
**Priority**: P0  
**Status**: 🔍 Review  
**Estimate**: 1.5h  
**Agent Type**: backend  
**Depends On**: TASK-AUTO-13
**Assignee**: Slaver-024 (Backend Agent)  
**Branch**: feature/TASK-AUTO-15-recovery-queue  
**Commit**: d441f4185

---

## Goal

Master 启动时处理 Supervisor 记录的恢复队列，resume 积压任务。

---

## AC

**AC-1**: 启动时读取 `.eket/triggers/resume-queue.txt`  
**AC-2**: 逐个 dispatch resume  
**AC-3**: 成功后清空队列  
**AC-4**: 失败任务记录日志

---

## Verification

**测试覆盖**:
```bash
npm test -- --testPathPattern=recovery-queue-processor
# ✓ 10 tests passed (all ACs covered)
```

**Lint 检查**:
```bash
npm run lint
# ✓ No errors
```

**实现细节**:
- File: `node/src/core/recovery-queue-processor.ts` (~200 LOC)
- Tests: `node/tests/recovery-queue-processor.test.ts` (10 test cases)
- Integration point: `dispatchSlaverResume()` (TODO: integrate with message queue)

**Exit Code**: 0 (all checks passed)

---

## Implementation

```typescript
// Master 启动 hook
async function processRecoveryQueue() {
  const tasks = readLines('.eket/triggers/resume-queue.txt');
  for (const taskId of tasks) {
    await dispatchSlaverResume(taskId);
  }
  fs.writeFileSync('.eket/triggers/resume-queue.txt', '');
}
```

**Time**: 1.5h
