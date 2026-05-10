# TASK-606 分析报告 - Context Health Dashboard

**提交者**: Slaver-DevOps-001  
**任务**: TASK-606 - Context Health Dashboard  
**时间**: 2026-05-10  
**状态**: 等待 Master 审批

---

## 📋 任务理解

### 核心需求
创建 `eket system:dashboard` 命令，集成 Context Health 监控面板，展示：
- Session token 实时使用率
- 400 错误率 + recovery 成功率
- ASCII 趋势图（最近 10 分钟）
- 高危 session 预警

### AC 验收标准
- ✅ AC-1: 展示活跃 sessions、平均/最高 token 使用率
- ✅ AC-2: 解析 `.eket/logs/context-overflow.log` 统计 400 错误
- ✅ AC-3: Token > 150k 红色高亮警告
- ✅ AC-4: 1h 内 3+ 次 400 错误显示 alert badge
- ✅ AC-5: 30s 自动刷新 + 实时趋势图

---

## 🔍 关键发现

### 1. 现有资源
- ✅ **ContextTracker API** (TASK-604 已完成)
  - `getStats()`: 返回所有 session 的 token 数据
  - `getStatus(sessionId)`: 单 session 状态
- ✅ **CLI 框架**: Commander.js（参考 `context-status.ts`）
- ❌ **`system:dashboard` 命令不存在** - 需从零创建

### 2. 并行任务依赖
- ⚠️ **TASK-603 进行中** (Slaver-004 执行)
  - `.eket/logs/context-overflow.log` 未就绪
  - **解决方案**: 先用 Mock 数据，预留真实数据接口

### 3. 技术约束
- ASCII 渲染（终端兼容性）
- 30s 刷新无阻塞
- Token 估算（基于 ContextTracker）

---

## 🎨 设计方案

### 架构设计

```
node/src/commands/dashboard.ts          ← 新增，CLI 命令入口
node/src/core/context-health-stats.ts  ← 新增，统计 + 渲染逻辑
node/src/core/context-tracker.ts       ← 已有，API 提供者
node/tests/commands/dashboard.test.ts  ← 新增，测试
```

### Dashboard 布局

```
╔════════════════════════════════════════════════════════════════╗
║ 🖥️  EKET System Dashboard v2.0                                ║
╠════════════════════════════════════════════════════════════════╣
║                                                                 ║
║ 📊 Context Health Monitor                                      ║
║ ┌─────────────────────────────────────────────────────────────┐║
║ │ Active Sessions: 3                                          │║
║ │ Avg Token Usage: 82,500 / 200,000 (41.3%)  [████░░░░░░]    │║
║ │ Max Token Usage: 156,000 / 200,000 (78.0%) [███████░░░] ⚠️ │║
║ │                                                              │║
║ │ 400 Errors (Last 24h): [MOCK - TASK-603 pending]           │║
║ │   Total: 5                                                   │║
║ │   Recovered: 4 (80.0%) ✅                                   │║
║ │   Failed: 1 (20.0%) ❌                                      │║
║ │                                                              │║
║ │ High-Risk Sessions:                                          │║
║ │   • slaver-backend-004 (156k tokens) ⚠️                     │║
║ │                                                              │║
║ │ Token Trend (Last 10 min):                                  │║
║ │   200k ┤                                                     │║
║ │   150k ┤            ╭─╮                                      │║
║ │   100k ┤      ╭─────╯ ╰─╮                                   │║
║ │    50k ┤──────╯          ╰───                               │║
║ │        └────────────────────────────┘║
║                                                                 ║
║ Press Ctrl+C to exit • Refreshes every 30s                     ║
╚════════════════════════════════════════════════════════════════╝
```

### 数据流设计

```typescript
// 1. ContextTracker API 集成
interface SessionStats {
  sessionId: string;
  tokens: number;
  lastCompact: number;
}

contextTracker.getStats(): SessionStats[]

// 2. Mock 400 错误数据（TASK-603 完成后替换）
interface ErrorStats {
  total: number;
  recovered: number;
  failed: number;
  successRate: number;
}

async function getErrorStats(): Promise<ErrorStats> {
  const logPath = '.eket/logs/context-overflow.log';
  if (fs.existsSync(logPath)) {
    // 真实数据（TASK-603 完成后）
    return parseContextOverflowLog(logPath);
  } else {
    // Mock 数据（当前）
    return {
      total: 5,
      recovered: 4,
      failed: 1,
      successRate: 0.8
    };
  }
}

// 3. ASCII 渲染
function renderProgressBar(current: number, max: number): string {
  const width = 10;
  const filled = Math.round((current / max) * width);
  return '[' + '█'.repeat(filled) + '░'.repeat(width - filled) + ']';
}

function renderTrendChart(history: number[]): string {
  // 简易 5 行 × 20 列 ASCII 图表
  // 避免引入新依赖
}
```

---

## 🛠️ 实施计划

### Phase 1: 基础结构 (1h)
1. 创建 `node/src/commands/dashboard.ts`
2. 注册 `system:dashboard` 命令（修改 `index.ts`）
3. 基础框架：静态面板 + 占位数据

### Phase 2: 数据集成 (1.5h)
1. 创建 `node/src/core/context-health-stats.ts`
2. 集成 ContextTracker API
3. Mock 400 错误数据 + 预留真实数据接口
4. 实现 `getContextHealthStats()` 函数

### Phase 3: 可视化 (1.5h)
1. ASCII 进度条（token 使用率）
2. 简易趋势图（最近 10 数据点）
3. 高亮逻辑（token > 150k → 红色 ⚠️）
4. Alert badge（1h 内 3+ 错误）

### Phase 4: 实时刷新 (0.5h)
1. 30s 自动刷新 loop
2. 清屏 + 重绘优化
3. Ctrl+C 退出处理

### Phase 5: 测试 + PR (0.5h)
1. 单元测试（Mock 数据场景）
2. 手工验证（真实环境）
3. 文档更新
4. 提交 PR

**总时间**: 5h（符合工时预算）

---

## ⚠️ 并行执行策略

### TASK-603 依赖处理
**问题**: TASK-603 (400 错误日志) 由 Slaver-004 并行执行中

**解决方案**:
```typescript
// 自适应数据源
async function getErrorStats(): Promise<ErrorStats> {
  if (fs.existsSync('.eket/logs/context-overflow.log')) {
    // TASK-603 完成，使用真实数据
    return parseContextOverflowLog();
  } else {
    // TASK-603 未完成，使用 mock
    console.log('[Mock] 400 error data (TASK-603 pending)');
    return MOCK_ERROR_STATS;
  }
}
```

**优势**:
- ✅ 立即可开发测试（不阻塞）
- ✅ TASK-603 完成后零改动切换
- ✅ 向前兼容（日志文件存在即自动切换）

---

## 🔍 风险评估

| 风险 | 影响 | 概率 | 缓解方案 | 状态 |
|------|------|------|----------|------|
| TASK-603 延期 | 400 数据缺失 | 中 | ✅ Mock 数据 + 预留接口 | 已缓解 |
| ASCII 图表复杂 | 开发超时 | 低 | ✅ 简化版 5×20 手写 | 已缓解 |
| 实时刷新卡顿 | UX 差 | 低 | ✅ 30s 间隔 + 优化渲染 | 已缓解 |
| ContextTracker API 变更 | 集成失败 | 极低 | ✅ TASK-604 已稳定完成 | 无风险 |

---

## ✅ 验收标准映射

| AC | 实现方案 | 状态 |
|----|----------|------|
| AC-1 | `contextTracker.getStats()` + 统计计算 | ✅ 可实现 |
| AC-2 | Mock + 预留 `parseContextOverflowLog()` | ✅ 可实现 |
| AC-3 | `if (tokens > 150000)` 红色渲染 | ✅ 可实现 |
| AC-4 | 时间窗口统计 + alert badge | ✅ 可实现 |
| AC-5 | `setInterval(30s)` + 趋势数组 | ✅ 可实现 |

---

## 📊 技术债务

### 暂时性技术债
1. **Mock 400 数据**: TASK-603 完成后需替换
2. **简易 ASCII 图表**: 未来可用 `asciichart` 优化
3. **内存存储趋势**: 可改为持久化（SQLite）

### 未来优化
- 支持多 metric 面板（CPU/Memory）
- WebSocket 实时推送（替代轮询）
- 自定义刷新间隔

---

## 🎯 交付物清单

### 代码文件
- ✅ `node/src/commands/dashboard.ts` (新增)
- ✅ `node/src/core/context-health-stats.ts` (新增)
- ✅ `node/src/index.ts` (修改，注册命令)
- ✅ `node/tests/commands/dashboard.test.ts` (新增)

### 文档
- ✅ TASK-606.md 更新（status → in_progress → done）
- ✅ PR 描述（包含 Mock 数据说明）
- ✅ CHANGELOG 更新

---

## 📝 Master 审批清单

请 Master 确认以下设计决策：

- [ ] **Mock 数据策略**: 接受 TASK-603 并行期间使用 mock 吗？
- [ ] **简易 ASCII 图表**: 手写 5×20 简化版 vs 引入 `asciichart` 依赖？
- [ ] **刷新间隔**: 30s 合理吗？需要可配置吗？
- [ ] **命令名称**: `eket system:dashboard` 合适吗？
- [ ] **面板布局**: 上述 ASCII 布局设计 OK 吗？

---

**请求**: 批准后，将立即切换到 `feature/TASK-606-context-dashboard` 分支开始实施。

**Slaver-DevOps-001**  
2026-05-10
