# EPIC-009: Slaver 高可用与故障恢复完整方案

**优先级**: P0 🔴 (Critical - 系统稳定性基石)  
**状态**: `planning`  
**创建时间**: 2026-05-14 19:15  
**负责人**: Master

---

## Epic 概述

**目标**: 实现 Slaver 零工作丢失 + 全自动故障恢复 + 保活机制

**核心问题** (用户提出):
1. ❌ **超时未解决** - 600s stall 仍会丢失工作
2. ❌ **假死无检测** - Slaver 卡死但不超时 (无 I/O 输出)
3. ❌ **异常退出无恢复** - OOM/Crash 直接终止
4. ❌ **无保活策略** - 长任务无心跳机制
5. ❌ **无 Failover** - Slaver 失败后需人工重启

---

## 当前实现缺陷分析

### ✅ 已实现 (EPIC-008 M1+M2)
- ProgressTracker 自动 checkpoint (30s flush)
- Git 分支同步 (关键节点 commit)
- Resume 恢复命令 (--resume flag)
- Master 查看进度 (task:status)

### ❌ 未实现 (关键缺失)
1. **无 Watchdog** - 500s 预警 checkpoint (TASK-AUTO-03 进行中)
2. **无心跳机制** - Master 不知 Slaver 活跃状态
3. **无自动重试** - 超时后需人工派遣
4. **无假死检测** - 卡死但未超时的场景
5. **无 Failover** - 单点故障无备份

---

## 完整高可用架构设计

### Layer 1: 预防 (避免超时/假死)

**1.1 任务拆分 (设计阶段)**
```
原则: 单个 AC 执行时间 < 300s
- 大 AC → 拆分为多个小 AC
- 长测试 → 分批执行
- 大文件 → 增量处理
```

**1.2 实时进度输出**
```typescript
// Slaver 每完成一个小步骤立即输出
console.log('[Progress] Completed: AC-1 implementation');
console.log('[Progress] Running tests (1/10)...');
// 防止 watchdog 误判假死
```

**1.3 超时估算**
```typescript
// 派遣前评估任务复杂度
const estimate = estimateTaskDuration(task);
if (estimate > 600) {
  // 建议拆分
  await suggestTaskSplit(task);
}
```

---

### Layer 2: 检测 (及时发现异常)

**2.1 Watchdog 超时预警** (TASK-AUTO-03)
```
500s → 自动 checkpoint
600s → Slaver 系统超时
650s → Master 检测触发恢复
```

**2.2 心跳机制** (TASK-AUTO-03)
```typescript
// 每 60s 更新心跳
setInterval(() => {
  fs.writeFileSync('.eket/state/slaver-heartbeat', Date.now());
}, 60000);

// Master 监控
if (Date`

**2.3 假死检测**
```typescript
// 监控 I/O 活动
let lastIOActivity = Date.now();

// Hook into ProgressTracker
tracker.on('checkpoint', () => {
  lastIOActivity = Date.now();
});

// Master 检测
if (Date.now() - lastIOActivity > 180000) {
  // 180s 无 I/O → 可能假死
  sendHealthCheck();  // Ping Slaver
}
```

**2.4 异常退出监控**
```typescript
// Process 退出监听
process.on('exit', async (code) => {
  if (code !== 0) {
    await emergencyCheckpoint('abnormal_exit', { code });
  }
});

process.on('uncaughtException', async (err) => {
  await emergencyCheckpoint('uncaught_exception', { error: err.message });
  process.exit(1);
});
```

---

### Layer 3: 恢复 (自动 Failover)

**3.1 自动重试机制**
```typescript
// Master 监控循环
async function monitorSlaver(taskId: string, agentId: string) {
  let retryCount = 0;
  const MAX_RETRIES = 3;
  
  while (retryCount < MAX_RETRIES) {
    const status = await checkSlaverStatus(agentId);
    
    if (status === 'timeout' || status === 'dead') {
      console.warn(`[Master] Slaver ${agentId} failed, retry ${retryCount + 1}/${MAX_RETRIES}`);
      
      // 自动 resume
      agentId = await dispatchSlaverResume(taskId, {
        previousSlaver: agentId,
        retryCount: retryCount + 1
      });
      
      retryCount++;
    } else if (status === 'completed') {
      break;  // 成功
    }
    
    await sleep(60000);  // 每分钟检查
  }
  
  if (retryCount >= MAX_RETRIES) {
    // 3 次失败 → 人工介入
    await createHumanAlert(taskId, 'slaver_retry_exhausted');
  }
}
```

**3.2 Failover 策略**
```typescript
// 主 Slaver 失败 → 备份 Slaver 接管
const failoverConfig = {
  primary: 'slaver-001',
  backup: 'slaver-002',
  checkpointBranch: 'checkpoint/TASK-XXX'
};

if (primaryFailed) {
  await dispatchBackupSlaver({
    ...failoverConfig,
    mode: 'resume',
    先级**
```
P0: 立即恢复 (< 1min)
  - 有 checkpoint → resume
  - checkpoint < 10min old

P1: 快速恢复 (< 5min)
  - checkpoint 10-60min old
  - 需验证 checkpoint 有效性

P2: 重新开始 (> 5min)
  - checkpoint > 60min (可能过期)
  - 或 checkpoint 损坏
```

---

### Layer 4: 保活 (Keep-Alive)

**4.1 长任务分片**
```typescript
// 自动拆分长任务
async function runLongTask(steps: Step[]) {
  for (const [i, step] of steps.entries()) {
    console.log(`[Progress] Step ${i+1}/${steps.length}: ${step.name}`);
    
    await step.execute();
    
    // 每步完成后 checkpoint
    await tracker.checkpoint(`step_${i+1}_done`, {
      step: step.name,
      progress: `${i+1}/${steps.length}`
    });
    
    // 重置 watchdog
    watchdog.resetTimer();
  }
}
```

**4.2 健康检查端点**
```typescript
// Slaver 暴露健康检查 (optional HTTP server)
app.get('/health', (req, res) => {
  res.json({
    slaver_id: process.env.SLAVER_ID,
    task_id: currentTaskId,
    uptime: process.uptime(),
    lastCheckpoint: lastCheckpointTime,
    status: 'healthy'
  });
});

// Master 定期 ping
const health = await fetch(`http://localhost:${port}/health`);
if (!health.ok) {
  triggerFailover();
}
```

**4.3 资源监控**
```typescript
// 监控内存/CPU，提前预警 OOM
setInterval(() => {
  const mem = process.memoryUsage();
  const cpu = process.cpuUsage();
  
  if (mem.heapUsed > 1.5e9) {  // 1.5GB
    console.warn('[Watchdog] High memory usage:', mem.heapUsed);
    // 触发 GC 或 checkpoint
  }
}, 30000);
```

---

### Layer 5: 降级 (Graceful Degradation)

**5.1 功能降级优先级**
```
关键功能 (永不禁用):
  ✅ ProgressTracker 写 progress.md
  ✅ 本地 checkpoint

可降级功能:
  ⚠️ Git push (网络失败时)
  ⚠️ 系统通知 (非 macOS)
  ⚠️ 心跳上报 (Master 离线时)

可禁用功能:
  ❌ Rust monitor (降级 Node)
  ❌ 精估模式 (降级粗估)
```

**5.2 Circuit Breaker**
```typescript
// Git push 连续失败 3 次 → 禁用
let pushFailureCount = 0;

async function safePush() {
  try {
    await gitPush();
    pushFailureCount = 0;  // 重置
  } catch (err) {
    pushFailureCount++;
    
    if (pushFailureCount >= 3) {
      console.warn('[Circuit Breaker] Git push disabled (3 failures)');
      gitEnabled = false;  // 熔断
    }
  }
}
```

---

## 任务拆解

### Milestone 1: 基础保活 + 监控 (Week 1)
- ✅ **TASK-AUTO-01**: Auto-compact hook (已完成)
- ✅ **TASK-AUTO-02**: Compact watcher (已完成)
- 🏃 **TASK-AUTO-03**: Watchdog + 心跳 (进行中)
- 📋 **TASK-AUTO-04**: Master 监控循环
- 📋 **TASK-AUTO-05**: 假死检测 (I/O 活动监控)

### Milestone 2: 自动恢复 + Failover (Week 2)
- 📋 **TASK-AUTO-06**: 自动重试机制 (3 次重试)
- 📋 **TASK-AUTO-07**: Failover 备份 Slaver
- 📋 **TASK-AUTO-08**: 异常退出捕获 (uncaughtException)
- 📋 **TASK-AUTO-09**: 资源监控 (OOM 预警)

### Milestone 3: 测试 + 文档 (Week 3)
- 📋 **TASK-AUTO-10**: 混沌测试 (模拟各种故障)
- 📋 **TASK-AUTO-11**: 故障恢复文档
- 📋 **TASK-AUTO-12**: 运维手册 (监控指标 + 告警响应)

---

## 验收标准 (Epic 级别)

**防超时**:
- [ ] 500s 预警 checkpoint ✅ (AUTO-03)
- [ ] 60s 心跳机制 ✅ (AUTO-03)
- [ ] Master 650s 超时检测 ✅ (AUTO-04)

**防假死**:
- [ ] 180s 无 I/O 检测 (AUTO-05)
- [ ] Health check 端点 (AUTO-05)

**防异常**:
- [ ] uncaughtException 捕获 (AUTO-08)
- [ ] OOM 预警 (AUTO-09)
- [ ] Process exit hook (AUTO-08)

**自动恢复**:
- [ ] 3 次自动重试 (AUTO-06)
- [ ] Failover 备份 Slaver (AUTO-07)
- [ ] Resume 优先级策略 (AUTO-06)

**测试覆盖**:
- [ ] 超时恢复测试 (AUTO-10)
- [ ] 假死恢复测试 (AUTO-10)
- [ ] OOM 恢复测试 (AUTO-10)
- [ ] 网络失败测试 (AUTO-10)

---

## 风险评估

| 风险 | 当前状态 | M1 后 | M2 后 | M3 后 |
|------|---------|-------|-------|-------|
| **600s 超时** | ❌ 100% 丢失 | ⚠️ 最多丢 100s | ✅ 自动恢复 | ✅ + 测试覆盖 |
| **假死** | ❌ 无检测 | ❌ 无检测 | ✅ 180s 检测 | ✅ + Health check |
| **OOM 崩溃** | ❌ 直接终止 | ❌ 直接终止 | ✅ 预警 + checkpoint | ✅ + 自动降级 |
| **网络失败** | ⚠️ Push 容错 | ✅ 降级 local | ✅ 降级 local | ✅ + Circuit breaker |
| **并发冲突** | ❌ 未处理 | ❌ 未处理 | ⚠️ 提示 | ✅ 自动合并 |

---

## 完整防护矩阵

### 故障类型 vs 防护措施

| 故障 | 检测 | 预防 | 恢复 | Failover |
|------|------|------|------|----------|
| **超时** | 心跳 (60s) | Watchdog checkpoint (500s) | Auto-resume (650s) | 备份 Slaver |
| **假死** | I/O 监控 (180s) | 任务分片 | Health check → 重启 | 备份 Slaver |
| **OOM** | 内存监控 | GC + 降级 | Emergency checkpoint | 重新派遣 |
| **Crash** | Process exit hook | 稳定依赖 | Resume from checkpoint | 备份 Slaver |
| **网络** | Push 失败率 | Circuit breaker | Local checkpoint | 离线模式 |

---

## Milestone 规划

### M1: 基础监控 (4 tasks, 12-15h) 🏃
- ✅ AUTO-01: Auto-compact hook (已完成)
- ✅ AUTO-02: Compact watcher (已完成)
- 🏃 AUTO-03: Watchdog + 心跳 (进行中)
- 📋 AUTO-04: Master 监控循环
- 📋 AUTO-05: 假死检测

**交付**: Slaver 超时可恢复 (最多丢 100s)

### M2: 自动恢复 (4 tasks, 12-16h) 📋
- 📋 AUTO-06: 自动重试机制 (3 retries)
- 📋 AUTO-07: Failover 备份 Slaver
- 📋 AUTO-08: 异常退出捕获
- 📋 AUTO-09: 资源监控 (OOM 预警)

**交付**: 全自动故障恢复 + Failover

### M3: 混沌工程 (3 tasks, 8-10h) 📋
- 📋 AUTO-10: 混沌测试 (模拟 10+ 故障场景)
- 📋 AUTO-11: 故障恢复文档
- 📋 AUTO-12: 运维监控手册

**交付**: 生产级高可用系统

---

## 技术架构图

```
┌────────────────────────────────────────────────┐
│              Slaver 生命周期监控                │
├────────────────────────────────────────────────┤
│                                                │
│  启动 (t=0)                                    │
│    ├─> Watchdog.start() ← 500s 定时器          │
│    ├─> Heartbeat.start() ← 60s 定时器          │
│    └─> ProgressTracker.init() ← 30s flush      │
│                                                │
│  执行中 (t=0~500s)                             │
│    ├─> 每 60s: 更新心跳 ✅                     │
│    ├─> 每 30s: Flush progress ✅               │
│    ├─> 关键节点: Git checkpoint ✅             │
│    └─> Master 监控: 读心跳，检测健康 ✅        │
│                                                │
│  超时预警 (t=500s)                             │
│    ├─> Watchdog 触发 ✅                        │
│    ├─> 自动 checkpoint('timeout_warning') ✅   │
│    ├─> Git commit + push 中间产物 ✅           │
│    └─> 继续执行 (尝试完成)                    │
│                                                │
│  系统超时 (t=600s)                             │
│    ├─> Agent 系统 kill Slaver ❌              │
│    └─> 工作丢失 100s (500s checkpoint 已保护)  │
│                                                │
│  Master 检测 (t=650s)                          │
│    ├─> 心跳超时检测 ✅                         │
│    ├─> 读 checkpoint 分支 ✅                   │
│    └─> 自动 dispatch resume ✅                 │
│                                                │
│  恢复 (t=660s)                                 │
│    ├─> 新 Slaver-XXX --resume ✅              │
│    ├─> 从 500s checkpoint 继续 ✅              │
│    └─> 完成任务 (最多重做 100s 工作) ✅        │
│                                                │
│  Failover (retries 耗尽)                      │
│    ├─> 3 次 resume 仍失败 → 备份 Slaver       │
│    ├─> 不同实现策略 (简化方案)                │
│    └─> 人工告警 (最后手段)                    │
│                                                │
└────────────────────────────────────────────────┘
```

---

## 保活策略完整清单

### ✅ 已实现
1. ProgressTracker 30s 异步 flush
2. Git checkpoint 关键节点同步
3. Resume 恢复命令
4. Auto-compact 120K 触发

### 🏃 进行中 (TASK-AUTO-03)
5. Watchdog 500s 超时预警
6. Heartbeat 60s 心跳机制

### 📋 待实现
7. Master 监控循环 (AUTO-04)
8. 假死检测 I/O 监控 (AUTO-05)
9. 自动重试 3 次 (AUTO-06)
10. Failover 备份 Slaver (AUTO-07)
11. 异常退出捕获 (AUTO-08)
12. lth check 端点 (AUTO-05)

---

## 对比：当前 vs 完整方案

| 场景 | 当前 (EPIC-008 M2) | 完整方案 (EPIC-009) |
|------|-------------------|-------------------|
| **600s 超时** | ❌ 100% 丢失 | ✅ 自动恢复，最多丢 100s |
| **假死卡住** | ❌ 无检测 | ✅ 180s I/O 检测 + 重启 |
| **OOM 崩溃** | ❌ 直接终止 | ✅ 预警 + emergency checkpoint |
| **网络失败** | ⚠️ Local 降级 | ✅ Circuit breaker + 自动恢复 |
| **3 次失败** | ❌ 需人工派遣 | ✅ Failover 备份 Slaver |
| **Master 离线** | ❌ 阻塞 | ✅ 离线模式 + 队列 |

---

## 建议执行优先级

### 🔴 Critical (立即执行)
1. **完成 TASK-AUTO-03** (进行中) - Watchdog + 心跳
2. **TASK-AUTO-04** - Master 监控循环
3. **TASK-AUTO-06** - 自动重试 3 次

**原因**: 解决 90% 超时问题

### 🟡 High (本周完成)
4. **TASK-AUTO-05** - 假死检测
5. **TASK-AUTO-08** - 异常退出捕获
6. **TASK-AUTO-09** - OOM 预警

**原因**: 覆盖其他失败模式

### 🟢 Medium (下周)
7. **TASK-AUTO-07** - Failover (复杂，非必需)
8. **TASK-AUTO-10~12** - 测试 + 文档

---

## 预期效果

**M1 完成后** (EPIC-009 M1):
- 超时: ✅ 自动恢复
- 假死: ✅ 检测 + 重启
- 工作丢失: ⚠️ 最多 100s

**M2 完成后** (EPIC-009 M2):
- 超时: ✅ 零工作丢失 (3 次重试)
- 假死: ✅ 全自动恢复
- 异常: ✅ Emergency checkpoint + Failover
- 可用性: 🚀 **99.9%**

---

**总工时**: M1 (15h) + M2 (16h) + M3 (10h) = **41h** (约 5 天)

**当前进度**: AUTO-01/02 完成, AUTO-03 进行中 (3/12 tasks, 25%)

---

**状态**: `planning_complete`  
**下一步**: 完成 AUTO-03，立即派遣 AUTO-04/05/06
