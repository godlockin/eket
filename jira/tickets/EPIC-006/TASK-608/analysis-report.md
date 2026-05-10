# 任务分析报告：TASK-608

**Slaver**: slaver-architect-001  
**分析时间**: 2026-05-10T12:15:00+08:00  
**预计工时**: 4 小时

---

## 1. 需求理解

**核心目标**: Slaver 在任务执行到一半时，若检测到 context 可能超限（120k tokens，80% 阈值），主动上报 Master 请求拆分任务。

**验收标准**:
- AC-1: `contextTracker.checkRisk()` 在 120k 时返回 `{ risk: 'high', shouldAlert: true }`
- AC-2: 上报文件生成至 `inbox/human_feedback/[SLAVER-ALERT] context-risk-TASK-XXX.md`
- AC-3: 消息发送到 `shared/message_queue/inbox/`（类型 `context_risk_alert`）
- AC-4: Master 读取后展示 3 种拆分选项 + 推荐方案
- AC-5: Master 执行 `eket task:split TASK-XXX --into 2` 创建子任务

---

## 2. 技术方案

### 2.1 现状分析

**已有基础设施**（依赖已满足）:
- ✅ TASK-602: `ContextTracker` 类存在，已实现 `shouldCompact()` 逻辑（120k 阈值）
- ✅ TASK-603: 日志基础设施完备（`console.log/warn/error`）
- ✅ 消息队列目录存在：`shared/message_queue/inbox/`

**缺失功能**:
1. ❌ `checkRisk()` API — 需新增返回 `{ risk, shouldAlert }` 的方法
2. ❌ Slaver 上报机制 — 需新增 `SlaverContextMonitor` 模块
3. ❌ Master 拆卡命令 — 需新增 `task:split` 命令
4. ❌ 拆分方案生成 — 需分析 AC 自动拆分逻辑

### 2.2 实现设计

#### Phase 1: ContextTracker 增强（1h）

**文件**: `node/src/core/context-tracker.ts`

新增方法：
```typescript
checkRisk(sessionId: string): { risk: 'low' | 'medium' | 'high'; shouldAlert: boolean; tokens: number } {
  const tokens = this.getSessionTokens(sessionId);
  
  // Thresholds: 80k (40%) = low, 120k (60%) = medium, 140k (70%) = high
  if (tokens > 120000) {
    return { risk: 'high', shouldAlert: true, tokens };
  } else if (tokens > 100000) {
    return { risk: 'medium', shouldAlert: false, tokens };
  } else {
    return { risk: 'low', shouldAlert: false, tokens };
  }
}
```

**验收**: Unit test 覆盖 3 个阈值分支。

---

#### Phase 2: Slaver Context Monitor（2h）

**文件**: `node/src/core/slaver-context-monitor.ts`（新建）

**核心流程**:
```
1. checkAndReport(sessionId, taskId)
   ↓
2. contextTracker.checkRisk(sessionId)
   ↓ (if shouldAlert)
3. createRiskAlert() → 生成 MD 文件
   ↓
4. notifyMaster() → 写 JSON 消息
```

**关键方法**:
- `createRiskAlert()`: 生成 `inbox/human_feedback/[SLAVER-ALERT] context-risk-TASK-XXX.md`
  - 包含: 当前 tokens、已完成工作概述、建议拆分点、预计剩余工作量
  - **数据源**: 读取 ticket 文件的 AC 进度 + session history（简化版用占位符）
- `notifyMaster()`: 写入 `shared/message_queue/inbox/context-risk-alert-TASK-XXX-<timestamp>.json`

**集成点**: `claude-runner.ts` 的 `runClaude()` 函数，在工具执行后调用：
```typescript
if (options.role === 'slaver' && options.taskId) {
  await slaverContextMonitor.checkAndReport(sessionId, options.taskId);
}
```

---

#### Phase 3: Master 拆卡命令（1h）

**文件**: `node/src/commands/task-split.ts`（新建）

**流程**:
```
task:split TASK-XXX --into 2
  ↓
1. readTicket(TASK-XXX)
  ↓
2. analyzeTaskSplit(ticket, 2) → 按 AC 平均拆分
  ↓
3. createSubTask() x2 → TASK-XXX-a, TASK-XXX-b
  ↓
4. updateTicketStatus(TASK-XXX, 'split')
  ↓
5. notifySlaver() → 发送 task_splitted 消息
```

**拆分逻辑（简化版）**:
- 按 AC 数量平均分配：`Math.ceil(ac.length / splitCount)` per task
- 工时按比例分：`Math.ceil(hours / splitCount)`
- 子任务 title: `${原title} - Part 1/2`

**验收**: 手动测试 + unit test 验证文件生成。

---

## 3. 影响面分析

| 影响模块 | 影响程度 | 说明 |
|----------|----------|------|
| `context-tracker.ts` | 低 | 新增 1 个纯函数方法，无副作用 |
| `claude-runner.ts` | 中 | 新增调用点（3 行），依赖 slaver-context-monitor |
| `commands/` | 低 | 新增独立命令文件，无修改既有代码 |
| `jira/tickets/` | 中 | 拆分会生成新文件，需确保命名规范 |
| `message_queue/` | 低 | 新增消息类型，无破坏性变更 |

**风险**: 中低（主要新增，少量修改）

---

## 4. 任务拆解

| 子任务 | 预估工时 | 优先级 | 验收方式 |
|--------|----------|--------|----------|
| 1. ContextTracker 增强 | 30min | P0 | `npm test -- context-tracker` 通过 |
| 2. SlaverContextMonitor 实现 | 90min | P0 | 单元测试 + 手动触发验证文件生成 |
| 3. task:split 命令实现 | 60min | P1 | 手动测试拆分 1 个 ticket |
| 4. 集成到 claude-runner | 15min | P0 | 触发实际 Slaver 任务验证 |
| 5. 测试 + 文档 | 45min | P2 | 端到端测试脚本 + README 更新 |

**总计**: ~4h（与预估一致）

---

## 5. 风险评估

| 风险项 | 可能性 | 影响 | 缓解措施 |
|--------|--------|------|----------|
| Session history 读取未实现 | 高 | 中 | 先用占位符（"已完成 X 个模块"），后续迭代 |
| 拆分逻辑过于简单（按 AC 拆） | 中 | 低 | Phase 1 仅实现基础拆分，足够验证流程 |
| Master 未及时响应告警 | 低 | 中 | 告警文件持久化，可稍后处理 |
| 工具调用 role/taskId 参数缺失 | 中 | 高 | 需确认 claude-runner 调用点已传参 |

**关键缓解**: 先实现最小功能集（MVP），拆分逻辑简化为按 AC 均分，避免复杂度爆炸。

---

## 6. 开放问题

1. **Session history 来源**：当前 ContextTracker 无历史记录，`summarizeCompletedWork()` 需占位符？
   - **答**: 暂用占位符，标注 `TODO: 从 session history 提取`，不阻塞 AC 验收。

2. **拆分后原 ticket 状态**：`split` 是新状态还是 `done`？
   - **答**: 新增 `split` 状态，子任务完成后原 ticket 不自动关闭。

3. **Slaver 收到拆分通知后的行为**：是否自动领取子任务？
   - **答**: 不自动领取，仅通知，Slaver 需手动 `task:claim TASK-XXX-a`。

---

## 7. 依赖确认

- ✅ TASK-602: ContextTracker 已实现（已读源码确认）
- ✅ TASK-603: Logging 已可用（console.log/warn）
- ❌ **待确认**: `claude-runner.ts` 是否传递 `role` 和 `taskId` 参数？
  - **Action**: 需读取 `claude-runner.ts` 调用点确认

---

## 8. 验收自检清单（Nyquist Rule）

每条 AC 对应的命令验证：

- **AC-1**: 
  ```bash
  npm test -- --testPathPattern=context-tracker | grep "checkRisk.*high"
  echo "exit code: $?"  # 预期: 0
  ```

- **AC-2**: 
  ```bash
  ls inbox/human_feedback/[SLAVER-ALERT]*.md | wc -l
  # 预期: ≥ 1
  ```

- **AC-3**: 
  ```bash
  ls shared/message_queue/inbox/context-risk-alert*.json | wc -l
  # 预期: ≥ 1
  ```

- **AC-4**: 手动测试（Master 读取文件，展示拆分选项）

- **AC-5**: 
  ```bash
  node node/dist/index.js task:split TASK-XXX --into 2
  ls jira/tickets/TASK-XXX-a.md && ls jira/tickets/TASK-XXX-b.md
  echo "exit code: $?"  # 预期: 0
  ```

---

## 9. 实施计划

**顺序**: 1 → 2 → 4 → 3 → 5（优先核心功能，命令放后）

1. ContextTracker 增强（30min）
2. SlaverContextMonitor（90min）
3. 集成 claude-runner（15min）— 先确认参数传递
4. task:split 命令（60min）
5. 测试 + 文档（45min）

**预计完成时间**: 2026-05-10T16:30:00+08:00

---

**状态**: ⏳ 等待 Master 批准
