# TASK-AUTO-04: Master 监控循环 - Slaver 心跳检测

**Epic**: EPIC-009  
**Priority**: P0  
**Status**: 📋 Ready  
**Estimate**: 3h  
**Agent Type**: backend  
**Depends On**: TASK-AUTO-03

---

## Goal

Master 定期检查 Slaver 心跳文件，650s 超时自动触发 resume。

---

## Acceptance Criteria

**AC-1**: 60s 循环读取心跳文件  
- Given: Master 监控启动
- When: 每 60s
- Then: 读取所有 `.eket/state/slaver-*-heartbeat`

**AC-2**: 650s 超时检测  
- Given: Slaver 心跳 > 650s
- When: Master 检测
- Then: 标记为超时状态

**AC-3**: 自动 dispatch resume  
- Given: Slaver 超时
- When: 有 checkpoint 分支
- Then: 自动派遣新 Slaver --resume

**AC-4**: 日志记录  
- Given: 检测到超时
- When: 触发恢复
- Then: 写入 `.eket/logs/master-monitor.log`

---

## Implementation

```typescript
// node/src/core/master-slaver-monitor.ts
export class MasterSlaverMonitor {
  private monitorInterval: NodeJS.Timeout;
  
  start(): void {
    this.monitorInterval = setInterval(async () => {
      await this.checkAllSlavers();
    }, 60000);  // AC-1: 60s
  }
  
  private async checkAllSlavers(): Promise<void> {
    const heartbeats = await glob('.eket/state/slaver-*-heartbeat');
    
    for (const file of heartbeats) {
      const taskId = this.extractTaskId(file);
      const lastBeat = parseInt(await fs.readFile(file, 'utf-8'));
      const elapsed = Date.now() - lastBeat;
      
      if (elapsed > 650000) {  // AC-2: 650s
        console.warn(`[Monitor] Slaver timeout: ${taskId}`);
        
        // AC-3: Auto resume
        const hasCheckpoint = await this.checkCheckpoint(taskId);
        if (hasCheckpoint) {
          await this.dispatchResume(taskId);
        }
        
        // AC-4: Log
        await this.logTimeout(taskId, elapsed);
      }
    }
  }
}
```

---

**Time**: 3h  
**Created**: 2026-05-14
