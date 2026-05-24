# TASK-AUTO-03: Slaver 超时自动恢复机制

**Epic**: EPIC-008  
**Priority**: P0 🔴 (Critical - 防止工作丢失)  
**Status**: 📋 Ready  
**Estimate**: 4h  
**Agent Type**: backend + devops  
**Category**: 🔧 Resilience

---

## Problem Statement

**现象**: Slaver Agent 超时 (600s stall) 导致任务失败
- TASK-635: Slaver-004 stall → 文件幸存但需重新派遣
- TASK-X04: Slaver-010 worktree 环境代码丢失

**根因**:
1. **长任务阻塞** - 单个步骤超过 watchdog 阈值 (600s)
2. **无中间产物** - 超时前未 commit，工作全丢失
3. **无进度心跳** - Master 不知 Slaver 卡在哪步

---

## Goal

实现 Slaver 超时自动恢复 + 中间产物保护机制。

---

## Acceptance Criteria

**AC-1**: 超时前自动 checkpoint  
- Given: Slaver 执行时间 > 500s (预警阈值)
- When: Watchdog 检测
- Then: 自动触发 `ProgressTracker.checkpoint('timeout_warning')`

**AC-2**: 心跳机制  
- Given: Slaver 执行长任务 (测试/编译)
- When: 每 60s
- Then: 更新 `.eket/state/slaver-<id>-heartbeat` 时间戳

**AC-3**: 超时后自动重试  
- Given: Slaver stall 600s
- When: Master 检测到超时
- Then: 自动启用 `--resume` 模式重新派遣

**AC-4**: 中间产物保护  
- Given: Slaver 执行中创建文件
- When: 超时发生
- Then: 文件已 commit 到 checkpoint 分支（可恢复）

---

## Technical Design

### 1. Slaver 内置 Watchdog

```typescript
// node/src/core/slaver-watchdog.ts
export class SlaverWatchdog {
  private taskId: string;
  private progressTracker: ProgressTracker;
  private heartbeatInterval: NodeJS.Timeout;
  private lastActivity: number = Date.now();
  
  constructor(taskId: string, tracker: ProgressTracker) {
    this.taskId = taskId;
    this.progressTracker = tracker;
    
    // AC-2: 心跳机制 (60s)
    this.heartbeatInterval = setInterval(() => {
      this.updateHeartbeat();
    }, 60000);
    
    // AC-1: 超时预警 (500s)
    setTimeout(() => {
      this.handleTimeoutWarning();
    }, 500000);
  }
  
  private async updateHeartbeat(): Promise<void> {
    const heartbeatFile = `.eket/state/slaver-${this.taskId}-heartbeat`;
    await fs.writeFile(heartbeatFile, Date.now().toString());
    this.lastActivity = Date.now();
  }
  
  private async handleTimeoutWarning(): Promise<void> {
    console.warn('[Watchdog] Timeout warning - auto checkpoint');
    
    // AC-1: 自动 checkpoint
    await this.progressTracker.checkpoint('timeout_warning', {
      elapsed: Date.now() - this.startTime,
      reason: 'watchdog_timeout_prevention'
    });
    
    // AC-4: 强制 git commit (保护中间产物)
    await this.progressTracker.flush();
  }
  
  close(): void {
    clearInterval(this.heartbeatInterval);
  }
}
```

### 2. Master 超时检测 + 重试

```typescript
// Master 派遣逻辑扩展
async function dispatchSlaver(taskId: string): Promise<void> {
  const agent = await Agent({
    description: `Slaver: ${taskId}`,
    prompt: slaverPrompt,
    run_in_background: true
  });
  
  // 监控心跳
  const monitor = setInterval(async () => {
    const heartbeat = await readHeartbeat(taskId);
    const elapsed = Date.now() - heartbeat;
    
    // AC-3: 超时自动重试
    if (elapsed > 650000) {  // 650s (给 watchdog 缓冲)
      clearInterval(monitor);
      console.error(`[Master] Slaver timeout detected: ${taskId}`);
      
      // 检查是否有 checkpoint
      const hasCheckpoint = await checkCheckpointBranch(taskId);
      
      if (hasCheckpoint) {
        // 自动 resume 重试
        await dispatchSlaverResume(taskId);
      } else {
        // 重新派遣
        await dispatchSlaver(taskId);
      }
    }
  }, 60000);  // 每 60s 检查
}
```

### 3. Checkpoint 分支作为恢复点

```bash
# Master 检测逻辑
if git ls-remote origin checkpoint/TASK-XXX; then
  # 存在 checkpoint → resume 模式
  eket task:claim TASK-XXX --resume
else
  # 无 checkpoint → 全新开始
  eket task:claim TASK-XXX
fi
```

---

## Implementation Plan

### Phase 1: Slaver Watchdog (2h)
1. 创建 `node/src/core/slaver-watchdog.ts`
2. 集成到 Slaver 初始化流程
3. 测试心跳机制
4. 测试超时自动 checkpoint

### Phase 2: Master 监控 (1.5h)
1. 创建 `node/src/core/master-slaver-monitor.ts`
2. 读取心跳文件
3. 超时检测 + 自动重试逻辑
4. 集成测试

### Phase 3: 端到端验证 (30min)
1. 模拟长任务 Slaver (sleep 700s)
2. 验证超时 checkpoint 创建
3. 验证 Master 自动 resume
4. 验证中间产物恢复

---

## Observability

**心跳文件**:
```bash
.eket/state/slaver-TASK-XXX-heartbeat
# 内容: 1778751234567 (timestamp)
```

**Watchdog 日志**:
```bash
.eket/logs/watchdog.log
# [2026-05-14 18:30:00] Slaver-004 heartbeat (elapsed: 320s)
# [2026-05-14 18:38:20] Slaver-004 timeout warning (500s) - auto checkpoint
```

**Master 监控日志**:
```bash
.eket/logs/master-monitor.log
# [2026-05-14 18:40:00] Slaver-004 timeout (650s) - triggering resume
# [2026-05-14 18:40:05] Dispatched Slaver-005 with --resume
```

---

## Edge Cases

| 场景 | 处理 |
|------|------|
| Slaver 正常完成 (< 500s) | 不触发 watchdog，正常流程 |
| Slaver 500-600s | Watchdog checkpoint，继续执行 |
| Slaver > 600s stall | Watchdog + Master 双重恢复 |
| Checkpoint push 失败 | Local checkpoint 仍可用 |
| Resume 失败 | Master 告警人工介入 |

---

## Test Strategy

**Unit**: 
- Mock setTimeout 测试 watchdog 触发
- Mock fs.watch 测试心跳更新

**Integration**:
```typescript
it('should auto-checkpoint on timeout warning', async () => {
  jest.useFakeTimers();
  const watchdog = new SlaverWatchdog('TASK-999', tracker);
  
  jest.advanceTimersByTime(500000);  // 500s
  
  expect(tracker.checkpoint).toHaveBeenCalledWith('timeout_warning', ...);
});

it('should resume on Master timeout detection', async () => {
  // 模拟 Slaver stall
  const agent = dispatchSlaver('TASK-999');
  
  // 模拟 650s 后心跳超时
  jest.advanceTimersByTime(650000);
  
  // 验证 Master 触发 resume
  expect(dispatchSlaverResume).toHaveBeenCalledWith('TASK-999');
});
```

---

## Security Considerations

**防止滥用**:
- Watchdog 仅在 Slaver 环境启用
- 心跳文件权限 0600 (仅 owner 可写)
- Resume 重试最多 3 次 (防无限循环)

---

## Performance Impact

**开销**:
- 心跳写入: 60s interval × 1KB = 可忽略
- Watchdog checkpoint: 500s 时触发 1 次 = 低频

**收益**:
- 避免工作丢失 (价值 >> 开销)
- 自动恢复节省人工介入时间

---

**Blocked By**: EPIC-008 M2 (TASK-X04 git checkpoint) ✅  
**Blocks**: None  
**Priority**: P0 (应立即实现)  
**Created**: 2026-05-14
