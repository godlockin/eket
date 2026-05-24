# TASK-AUTO-06: 自动重试机制 - 3 次 Resume

**Epic**: EPIC-009  
**Priority**: P0  
**Status**: 📋 Ready  
**Estimate**: 4h  
**Agent Type**: backend  
**Depends On**: TASK-AUTO-04

---

## Goal

Slaver 失败后自动 resume，最多 3 次，失败后人工告警。

---

## Acceptance Criteria

**AC-1**: 失败时记录重试计数  
**AC-2**: 自动派遣 resume (最多 3 次)  
**AC-3**: 3 次失败后创建人工告警  
**AC-4**: 避免无限循环

---

## Implementation

```typescript
// node/src/core/auto-retry-manager.ts
export class AutoRetryManager {
  private async handleSlaverFailure(taskId: string): Promise<void> {
    const retryCount = await this.getRetryCount(taskId);
    
    if (retryCount < 3) {
      await this.dispatchResume(taskId, retryCount + 1);
    } else {
      await this.createHumanAlert(taskId);
    }
  }
}
```

**Time**: 4h  
**Created**: 2026-05-14
