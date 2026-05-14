# TASK-AUTO-05: 假死检测 - I/O 活动监控

**Epic**: EPIC-009  
**Priority**: P0  
**Status**: 📋 Ready  
**Estimate**: 3h  
**Agent Type**: backend

---

## Goal

监控 Slaver I/O 活动，180s 无输出触发假死告警。

---

## Acceptance Criteria

**AC-1**: 监控 ProgressTracker checkpoint 调用  
**AC-2**: 180s 无 I/O → 创建假死告警  
**AC-3**: Health check HTTP 端点 (optional)  
**AC-4**: Master 接收告警后重启

---

## Implementation

```typescript
// node/src/core/io-activity-monitor.ts
export class IOActivityMonitor {
  private lastActivity: number = Date.now();
  
  constructor(tracker: ProgressTracker) {
    tracker.on('checkpoint', () => {
      this.lastActivity = Date.now();
    });
    
    setInterval(() => {
      if (Date.now() - this.lastActivity > 180000) {
        this.createDeadlockAlert();
      }
    }, 60000);
  }
}
```

**Time**: 3h  
**Created**: 2026-05-14
