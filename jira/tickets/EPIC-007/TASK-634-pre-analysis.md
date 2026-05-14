# TASK-634 Pre-Analysis Report

**Slaver**: Slaver-004 (QA + Fullstack)  
**分析时间**: 2026-05-13  
**预计工时**: 2h  
**当前状态**: ⏸️ 阻塞中（等待 TASK-632）

---

## 1. 需求理解

**核心目标**: 当 Slaver context ≥ 150K 时，自动创建风险报告 `.eket/inbox/context-risk-TASK-XXX.md`，通知 Master 处理。

**验收标准**:
- AC-1: 150K 触发上报
- AC-2: 上报文件格式完整（包含 taskId, tokens, turnCount, timestamp, recommendation）
- AC-3: Master 可见（`eket master:poll` 检测）
- AC-4: 去重（同一 task 仅上报一次）

---

## 2. 技术方案

### 2.1 核心模块设计

```typescript
// node/src/core/context-alert.ts
export class ContextAlert {
  private readonly alertedTasks: Set<string>;
  private readonly inboxPath = '.eket/inbox';
  private readonly threshold = 150_000;  // 150K tokens
  
  constructor() {
    this.alertedTasks = this.loadAlertedTasks();
  }
  
  /**
   * 检查是否需要上报 Master
   */
  shouldAlert(taskId: string, tokens: number): boolean {
    return tokens >= this.threshold && !this.alertedTasks.has(taskId);
  }
  
  /**
   * 创建风险报告文件
   */
  async alertMaster(data: {
    taskId: string;
    tokens: number;
    turnCount: number;
  }): Promise<void> {
    if (!this.shouldAlert(data.taskId, data.tokens)) {
      return;
    }
    
    const filename = `${this.inboxPath}/context-risk-${data.taskId}.md`;
    const content = this.generateAlertMarkdown(data);
    
    await fs.writeFile(filename, content);
    this.alertedTasks.add(data.taskId);
    this.saveAlertedTasks();
    
    // 记录到日志
    await this.logEvent(data);
  }
  
  /**
   * 生成 Markdown 内容
   */
  private generateAlertMarkdown(data: {
    taskId: string;
    tokens: number;
    turnCount: number;
  }): string {
    const percentage = ((data.tokens / 168_000) * 100).toFixed(1);
    
    return `# [ALERT] Context Overflow Risk: ${data.taskId}

**时间**: ${new Date().toISOString()}  
**估算 Tokens**: ${data.tokens.toLocaleString()}  
**累计轮次**: ${data.turnCount}  
**阈值**: 150K / 168K (${percentage}%)

---

## 风险评估

当前 context 已接近 Claude API 限制（168K），存在崩溃风险。

## 建议措施

**选项 A**: 立即执行 \`/compact\`，压缩上下文  
**选项 B**: 拆分任务 \`eket task:split ${data.taskId}\`  
**选项 C**: 保存快照后重启 session  

## 自动操作

- ✅ 已保存快照到 \`logs/context-snapshots/\`
- ✅ 已记录日志到 \`logs/context-monitor.jsonl\`

---

**需要 Master 决策**
`;
  }
  
  /**
   * 加载已上报任务列表
   */
  private loadAlertedTasks(): Set<string> {
    const statePath = '.eket/state/alerted-tasks.json';
    if (!fs.existsSync(statePath)) {
      return new Set();
    }
    const data = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
    return new Set(data.alertedTasks || []);
  }
  
  /**
   * 持久化已上报列表
   */
  private saveAlertedTasks(): void {
    const statePath = '.eket/state/alerted-tasks.json';
    fs.writeFileSync(statePath, JSON.stringify({
      alertedTasks: Array.from(this.alertedTasks),
      lastUpdated: new Date().toISOString()
    }));
  }
  
  /**
   * 记录事件到 JSONL 日志
   */
  private async logEvent(data: {
    taskId: string;
    tokens: number;
    turnCount: number;
  }): Promise<void> {
    const logPath = 'logs/context-monitor.jsonl';
    const logEntry = JSON.stringify({
      timestamp: Date.now(),
      event: 'alert_master',
      taskId: data.taskId,
      tokens: data.tokens,
      turnCount: data.turnCount
    }) + '\n';
    
    await fs.appendFile(logPath, logEntry);
  }
}
```

### 2.2 集成点设计

**调用位置**: `node/src/core/context-monitor.ts`

```typescript
// 在 ContextMonitor.check() 中集成
export class ContextMonitor {
  private alert: ContextAlert;
  
  async check(taskId: string): Promise<void> {
    const tokens = await this.estimator.estimate();
    const turnCount = this.getTurnCount();
    
    // 120K: 生成快照（TASK-633）
    if (tokens >= 120_000) {
      await this.snapshot.save({ taskId, tokens, turnCount });
    }
    
    // 150K: 上报 Master（TASK-634）
    if (tokens >= 150_000) {
      await this.alert.alertMaster({ taskId, tokens, turnCount });
    }
  }
}
```

---

## 3. 影响面分析

| 影响模块 | 影响程度 | 说明 |
|----------|----------|------|
| `node/src/core/context-monitor.ts` | 中 | 新增 Alert 逻辑调用 |
| `.eket/inbox/` | 低 | 新增风险报告文件 |
| `.eket/state/` | 低 | 新增 `alerted-tasks.json` 状态文件 |
| `logs/context-monitor.jsonl` | 低 | 追加上报事件日志 |
| Master 流程 | 中 | 需适配 `eket master:poll` 检测风险文件 |

---

## 4. 任务拆解

| 子任务 | 预估工时 | 优先级 | 依赖 |
|--------|----------|--------|------|
| 实现 ContextAlert 类 | 45min | P0 | TASK-632 已合并 |
| 集成到 ContextMonitor | 20min | P0 | ContextAlert 完成 |
| 编写单元测试 | 30min | P0 | ContextAlert 完成 |
| 手动测试 + 验收 | 15min | P1 | 全部完成 |
| 文档更新 | 10min | P2 | 全部完成 |

**总计**: 2h

---

## 5. 风险评估

| 风险项 | 可能性 | 影响 | 缓解措施 |
|--------|--------|------|----------|
| TASK-632 API 变更 | 中 | 高 | 等 632 merge 后再实现，确保 API 稳定 |
| 文件写入权限问题 | 低 | 中 | 提前检查 `.eket/inbox/` 权限，fallback 到 stderr |
| 去重状态丢失 | 低 | 低 | 状态文件持久化 + 启动时重建 |
| Master 轮询未适配 | 中 | 高 | 与 Master 开发者确认检测逻辑（可能需 TASK-638） |

---

## 6. 测试策略

### 6.1 单元测试

```typescript
// tests/unit/context-alert.test.ts
import { ContextAlert } from '../../src/core/context-alert';

describe('ContextAlert', () => {
  let alert: ContextAlert;
  
  beforeEach(() => {
    alert = new ContextAlert();
    // 清理状态
    fs.rmSync('.eket/state/alerted-tasks.json', { force: true });
  });
  
  it('应在 150K 触发上报', async () => {
    await alert.alertMaster({
      taskId: 'TASK-001',
      tokens: 155_000,
      turnCount: 25
    });
    
    expect(fs.existsSync('.eket/inbox/context-risk-TASK-001.md')).toBe(true);
  });
  
  it('不应重复上报同一 task', async () => {
    await alert.alertMaster({
      taskId: 'TASK-001',
      tokens: 155_000,
      turnCount: 25
    });
    
    // 删除文件，再次上报
    fs.rmSync('.eket/inbox/context-risk-TASK-001.md');
    
    await alert.alertMaster({
      taskId: 'TASK-001',
      tokens: 160_000,
      turnCount: 30
    });
    
    // 不应重新创建文件
    expect(fs.existsSync('.eket/inbox/context-risk-TASK-001.md')).toBe(false);
  });
  
  it('应记录日志到 JSONL', async () => {
    await alert.alertMaster({
      taskId: 'TASK-002',
      tokens: 155_000,
      turnCount: 25
    });
    
    const log = fs.readFileSync('logs/context-monitor.jsonl', 'utf-8');
    expect(log).toContain('"event":"alert_master"');
    expect(log).toContain('"taskId":"TASK-002"');
  });
});
```

### 6.2 集成测试

由 TASK-635 覆盖（E2E 场景）。

---

## 7. 可观测性

**日志输出**:
```jsonl
{"timestamp":1715644800,"event":"alert_master","taskId":"TASK-XXX","tokens":155000,"turnCount":25}
```

**状态文件**:
```json
{
  "alertedTasks": ["TASK-001", "TASK-002"],
  "lastUpdated": "2026-05-13T10:00:00Z"
}
```

---

## 8. Rollback Plan

删除 ContextAlert 模块，移除集成代码，仅保留日志记录（不影响其他功能）。

---

## 9. 后续优化点

1. **Alert 聚合**: 如果短时间内多个 task 触发，合并为一个报告
2. **Master 自动处理**: 支持 Master 自动执行 `/compact` 或拆分任务
3. **Alert 级别**: 区分 WARNING (150K) 和 CRITICAL (165K)

---

## 10. 待确认问题

**Q1**: Master `eket master:poll` 逻辑在哪个模块？  
**推荐**: 检查 `node/src/commands/master/poll.ts`，如不存在，可能需创建新 ticket

**Q2**: `.eket/inbox/` 目录是否已存在？  
**推荐**: 启动时检查并创建

**Q3**: 是否需要通知 webhook（如 Slack）？  
**推荐**: Phase 1 仅文件 + 日志，webhook 留给后续 EPIC

---

## 11. 下一步计划

1. **等待 TASK-632 merge**
2. **创建 feature/TASK-634 分支**
3. **实现 ContextAlert 类**
4. **编写单元测试**
5. **集成到 ContextMonitor**
6. **手动验收 + 提交 PR**

---

**状态**: ⏸️ 等待依赖  
**预计可开始时间**: TASK-632 合并后 1h 内
