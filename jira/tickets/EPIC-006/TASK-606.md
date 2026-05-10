---
agent_type: devops
estimate_hours: 006
assigned_to: slaver-devops-001
claimed_at: 2026-05-10T11:45:00Z
status: done
merged_at: 2026-05-10T12:20:00Z
---

# TASK-606: Context Health Dashboard

**EPIC**: EPIC-006 | **Milestone**: M1-Optimization | **优先级**: P1 | **工时**: 5h | **状态**: done | **依赖**: TASK-604

## 需求

在 `eket system:dashboard` 新增 Context Health 面板，展示：session token 使用率、400 错误率、recovery 成功率。

## 验收标准

- **AC-1**: Given 执行 `eket system:dashboard`, When 展示 Context Health 面板, Then 包含：当前活跃 sessions 数量、平均 token 使用率、最高 token 使用率
- **AC-2**: Given 读取 `.eket/logs/context-overflow.log`, When 解析统计, Then 展示：总 400 错误次数、recovery 成功次数、成功率百分比
- **AC-3**: Given 有 session 超过 150k tokens, When 面板刷新, Then 高亮显示（红色警告）
- **AC-4**: Given 最近 1 小时内发生 3+ 次 400 错误, When 面板展示, Then 显示红色 alert badge
- **AC-5**: Given dashboard 数据每 30 秒刷新, When 持续运行, Then 展示实时趋势图（最近 10 分钟）

## 技术方案

### 修改文件
- `node/src/commands/dashboard.ts`（新增 Context Health 面板）
- `node/src/core/context-stats.ts`（新增，统计逻辑）

### 面板设计
```
╔═══════════════════════════════════════════════════════════╗
║ 📊 Context Health Monitor                                 ║
╠═══════════════════════════════════════════════════════════╣
║ Active Sessions: 3                                         ║
║ Avg Token Usage: 82,500 / 200,000 (41.3%)  [████░░░░░░]  ║
║ Max Token Usage: 156,000 / 200,000 (78.0%) [███████░░░] ⚠️║
║                                                            ║
║ 400 Errors (Last 24h):                                    ║
║   Total: 5                                                 ║
║   Recovered: 4 (80.0%) ✅                                  ║
║   Failed: 1 (20.0%) ❌                                     ║
║                                                            ║
║ High-Risk Sessions:                                        ║
║   • slaver-TASK-601 (156k tokens) ⚠️                      ║
║                                                            ║
║ Recent Alerts:                                             ║
║   🔴 3 errors in last hour (TASK-604)                     ║
╚═══════════════════════════════════════════════════════════╝
```

### 实现
```typescript
// node/src/core/context-stats.ts
export interface ContextHealthStats {
  activeSessions: number;
  avgTokenUsage: number;
  maxTokenUsage: number;
  errors24h: {
    total: number;
    recovered: number;
    failed: number;
    successRate: number;
  };
  highRiskSessions: Array<{
    sessionId: string;
    tokens: number;
    taskId?: string;
  }>;
  recentAlerts: Array<{
    message: string;
    severity: 'warning' | 'error';
    timestamp: string;
  }>;
}

export async function getContextHealthStats(): Promise<ContextHealthStats> {
  // 从 context-tracker 读取 session data
  const sessions = contextTracker.getAllSessions();
  
  // 从 logs 读取 error stats
  const errors = await parseContextOverflowLog();
  
  return {
    activeSessions: sessions.length,
    avgTokenUsage: calculateAvg(sessions.map(s => s.tokens)),
    maxTokenUsage: Math.max(...sessions.map(s => s.tokens)),
    errors24h: errors,
    highRiskSessions: sessions.filter(s => s.tokens > 150000),
    recentAlerts: await getRecentAlerts(),
  };
}
```

## 测试策略

- **unit**: `tests/core/context-stats.test.ts`
  - 验证统计计算逻辑
  - 验证 log 解析
  
- **integration**: 启动 dashboard
  ```bash
  eket system:dashboard
  # 验证 Context Health 面板显示
  ```

## observability
- logs: ["dashboard.context_health.rendered"]
- metrics: ["dashboard.refresh_interval"]

## rollback_plan
Revert PR。仅展示逻辑，无数据变更。

---

**类型**: feature  
**技能要求**: Node.js / TypeScript / CLI UI  
**依赖**: TASK-603  
**assigned_experts**: backend-engineer, devops-engineer
