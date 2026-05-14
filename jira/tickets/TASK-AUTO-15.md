# TASK-AUTO-15: 恢复队列处理

**Epic**: EPIC-009  
**Priority**: P0  
**Status**: 📋 Ready  
**Estimate**: 1.5h  
**Agent Type**: backend  
**Depends On**: TASK-AUTO-13

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
