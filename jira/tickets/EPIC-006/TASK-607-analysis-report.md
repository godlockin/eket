# 任务分析报告：TASK-607

**Slaver**: slaver-backend-006  
**分析时间**: 2026-05-10 12:10  
**预计工时**: 3 小时

---

## 1. 需求理解

**核心目标**：建立连续错误告警机制，当单个 task 触发 3 次 400 (context_length_exceeded) 错误时自动生成告警文件到 `inbox/human_feedback/`，便于 Master 及时发现并处理问题。

**验收标准分析**：
- **AC-1**: 单任务 3 次 400 → 创建 task-level 告警
- **AC-2**: 告警内容完整（taskId, 次数, 时间, tokens, 建议操作）
- **AC-3**: 同一任务重复触发 → 仅更新不重复创建
- **AC-4**: 全局 5 次 400 → 创建 system-level 告警
- **AC-5**: 任务完成 → 清理对应告警

**依赖 TASK-603**: 该任务提供日志记录（`.eket/logs/context-overflow.log`），本任务基于日志数据实现告警。

---

## 2. 技术方案

### 2.1 架构设计

**新增文件**:
- `node/src/core/alert-manager.ts` - 核心告警管理器

**集成点**:
- `node/src/hooks/pipelines/post-tool-use.ts` - Hook 中捕获 400 错误后调用 AlertManager
- `node/src/commands/alerts.ts` - 已有告警命令，需补充 context overflow 专用子命令

**数据流**:
```
400 错误触发 → recordError(taskId, tokens)
  ↓
errorCounts.get(taskId) === 3? → createTaskAlert()
  ↓
写入 inbox/human_feedback/[ALERT] context-overflow-TASK-XXX.md
  ↓
globalErrorCount === 5? → createGlobalAlert()
```

### 2.2 核心实现

**AlertManager 类设计**:
```typescript
export class AlertManager {
  private errorCounts: Map<string, ErrorRecord> = new Map();
  private globalErrorCount: number = 0;
  private alertedTasks: Set<string> = new Set(); // 防重复

  interface ErrorRecord {
    count: number;
    firstOccurredAt: string;
    lastOccurredAt: string;
    tokenHistory: number[];
  }

  async recordError(taskId: string, estimatedTokens: number): Promise<void>
  async createTaskAlert(taskId: string, record: ErrorRecord): Promise<void>
  async updateTaskAlert(taskId: string, count: number): Promise<void>
  async createGlobalAlert(): Promise<void>
  async clearTaskAlert(taskId: string): Promise<void>
}
```

**文件写入位置**:
- Task-level: `inbox/human_feedback/[ALERT] context-overflow-TASK-XXX.md`
- System-level: `inbox/human_feedback/[ALERT] context-system-critical.md`

**告警内容模板** (见 ticket 技术方案中的示例)

### 2.3 与现有系统关系

| 现有组件 | 作用 | 本任务集成方式 |
|---------|------|---------------|
| `AlertingSystem` (alerting.ts) | 通用告警框架（Slack/Email） | **不复用**，因需求是写本地文件非外部通知 |
| `ContextTracker` | 估算 tokens | **依赖**，获取 `estimatedTokens` |
| TASK-603 日志 | 记录历史 400 错误 | **可选**，用于冷启动恢复状态 |

---

## 3. 影响面分析

| 影响模块 | 影响程度 | 说明 |
|----------|----------|------|
| `node/src/hooks/pipelines/` | **中** | 需在 post-tool-use hook 中调用 AlertManager |
| `inbox/human_feedback/` | **低** | 新增告警文件，Master 需识别 `[ALERT]` 前缀 |
| `node/src/core/` | **低** | 新增独立模块，零侵入现有 alerting.ts |
| `.eket/logs/` | **无** | 依赖 TASK-603，无修改 |

**风险点**:
1. TASK-603 未完成时无法获取历史数据 → **降级**：内存态管理，重启后清零
2. 告警文件与 Master 的读取逻辑需对齐 → **缓解**：在 PR description 中明确文件格式

---

## 4. 任务拆解

| 子任务 | 预估工时 | 优先级 | 说明 |
|--------|----------|--------|------|
| 实现 AlertManager 核心逻辑 | 1h | P0 | recordError, createTaskAlert, updateTaskAlert |
| 编写单元测试 | 0.5h | P0 | 验证计数、告警创建、防重复 |
| 集成到 Hook | 0.5h | P0 | 在 400 错误处调用 recordError |
| 实现 clearTaskAlert | 0.5h | P1 | Task 完成时清理告警 |
| 全局告警逻辑 | 0.5h | P1 | 5 次跨任务触发系统级告警 |

**总计**: 3h

---

## 5. 风险评估

| 风险项 | 可能性 | 影响 | 缓解措施 |
|--------|--------|------|----------|
| TASK-603 未完成 | **中** | **中** | 降级实现：内存态存储，不依赖日志文件 |
| 告警文件冲突（多 Slaver 并发） | **低** | **低** | 文件名包含 taskId（唯一） |
| Master 不识别告警格式 | **低** | **中** | PR 中明确说明，建议 Master 添加识别逻辑 |
| 错误计数重启后丢失 | **高** | **低** | 可接受，重启视为新周期 |

---

## 6. 测试策略

### 单元测试 (`tests/core/alert-manager.test.ts`)

```typescript
describe('AlertManager', () => {
  test('3 次错误创建 task alert', async () => {
    for (let i = 0; i < 3; i++) {
      await alertManager.recordError('TASK-607', 180000);
    }
    
    const alertPath = 'inbox/human_feedback/[ALERT] context-overflow-TASK-607.md';
    expect(fs.existsSync(alertPath)).toBe(true);
  });

  test('重复错误不重复创建', async () => {
    // 已触发 3 次
    await alertManager.recordError('TASK-607', 180000);
    
    const files = fs.readdirSync('inbox/human_feedback');
    const alertFiles = files.filter(f => f.includes('TASK-607'));
    expect(alertFiles.length).toBe(1); // 仅一个告警文件
  });

  test('5 次全局错误创建系统告警', async () => {
    for (let i = 1; i <= 5; i++) {
      await alertManager.recordError(`TASK-${i}`, 180000);
    }
    
    const systemAlertPath = 'inbox/human_feedback/[ALERT] context-system-critical.md';
    expect(fs.existsSync(systemAlertPath)).toBe(true);
  });
});
```

### 集成测试

模拟 400 错误流程：
```bash
# 构建
npm run build

# 模拟连续错误（需 TASK-603 完成或 mock）
node dist/index.js test:simulate-context-overflow --task=TASK-607 --count=3

# 验证告警文件
ls inbox/human_feedback/ | grep ALERT
cat inbox/human_feedback/[ALERT]\ context-overflow-TASK-607.md
```

---

## 7. 实施计划

### Phase 1: 核心功能（1.5h）
1. 创建 `alert-manager.ts`
2. 实现 recordError, createTaskAlert
3. 编写单元测试

### Phase 2: 集成与扩展（1h）
4. Hook 集成（需找到 400 捕获点）
5. 实现全局告警
6. clearTaskAlert 逻辑

### Phase 3: 验证与文档（0.5h）
7. 端到端测试
8. 更新 PR description

---

## 8. 待确认问题

**Q1**: TASK-603 当前状态？
- 若已完成 → 可直接读取 `.eket/logs/context-overflow.log` 恢复历史计数
- 若未完成 → 降级为内存态，重启后计数清零

**Q2**: Master 是否有告警文件的自动识别机制？
- 若无 → 需在 PR 中建议 Master 添加轮询 `inbox/human_feedback/[ALERT]` 的逻辑

**推荐**: 
- 问题 1 → 先按降级方案实施（内存态），TASK-603 完成后再升级持久化
- 问题 2 → PR description 明确说明文件格式，Master 可手动/自动识别

---

## 9. 下一步

等待 **Master 审批**本分析报告，批准后开始实施 Phase 1。

---

**状态**: `analysis_review` ⏳ 等待 Master 反馈
