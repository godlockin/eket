# TASK-608: Slaver 主动 Context 风险上报 + 拆卡请求

**EPIC**: EPIC-006 | **Milestone**: M0-Emergency | **优先级**: P0 | **工时**: 4h | **状态**: analysis_review | **依赖**: TASK-602, TASK-603

---
agent_type: backend
estimate_hours: 4
---

## 需求

Slaver 执行任务到一半时，检测到自己 context 可能超限，主动通知 Master 召唤专家组对当前 task 拆分为更小的子任务。

## 验收标准

- **AC-1**: Given Slaver session tokens 达到 120k（80% 阈值）, When `contextTracker.checkRisk()` 调用, Then 返回 `{ risk: 'high', shouldAlert: true }`
- **AC-2**: Given risk 检测为 high, When Slaver 创建上报文件, Then `inbox/human_feedback/[SLAVER-ALERT] context-risk-TASK-XXX.md` 生成，包含：当前 tokens、已完成工作概述、建议拆分点、预计剩余工作量
- **AC-3**: Given 上报文件创建, When 发送消息到 Master, Then `shared/message_queue/inbox/` 新增 `context_risk_alert` 类型消息
- **AC-4**: Given Master 收到告警, When 读取上报文件, Then 展示：3 个拆分选项（按模块拆 / 按功能拆 / 降低分析深度）+ 推荐方案
- **AC-5**: Given Master 决策拆分, When 执行 `eket task:split TASK-XXX --into 2`, Then 创建 2 个子 task（TASK-XXX-a, TASK-XXX-b）+ 原 task 标记 `split` 状态 + Slaver 收到新 task 通知

## 技术方案

### 新增文件
- `node/src/core/slaver-context-monitor.ts`（Slaver 侧监控）
- `node/src/commands/task-split.ts`（Master 拆卡命令）

### Slaver 侧监控
```typescript
// node/src/core/slaver-context-monitor.ts
export class SlaverContextMonitor {
  async checkAndReport(sessionId: string, taskId: string): Promise<void> {
    const tokens = contextTracker.getSessionTokens(sessionId);
    const threshold = 120000; // 80% of 150k

    if (tokens > threshold) {
      console.warn(`⚠️  Context risk detected: ${tokens} tokens (80% threshold)`);
      await this.createRiskAlert(sessionId, taskId, tokens);
      await this.notifyMaster(taskId);
    }
  }

  private async createRiskAlert(
    sessionId: string,
    taskId: string,
    tokens: number
  ): Promise<void> {
    const alertPath = path.join(
      process.cwd(),
      'inbox/human_feedback',
      `[SLAVER-ALERT] context-risk-${taskId}.md`
    );

    // 分析已完成工作
    const workSummary = await this.summarizeCompletedWork(sessionId);

    const content = `# 🟡 Slaver Context Risk Alert: ${taskId}

**上报时间**: ${new Date().toISOString()}
**当前 tokens**: ${tokens} / 150,000 (${((tokens / 150000) * 100).toFixed(1)}%)
**风险等级**: 🟡 HIGH（80% 阈值）

---

## 已完成工作

${workSummary}

---

## 预计剩余工作

${await this.estimateRemainingWork(taskId)}

---

## 建议拆分方案

### 选项 A: 按模块拆分（推荐）
- ${taskId}-a: 完成已分析的前端部分
- ${taskId}-b: 剩余后端部分独立 task

### 选项 B: 按功能拆分
- ${taskId}-a: 核心功能实现
- ${taskId}-b: 边缘 case 处理 + 测试

### 选项 C: 降低分析深度
继续当前 task，但减少 Read 文件数量，优先 Grep/Glob。

---

**状态**: ⚠️ 等待 Master 决策

**Slaver 当前状态**: 暂停执行，等待拆分指令
`;

    await fs.mkdir(path.dirname(alertPath), { recursive: true });
    await fs.writeFile(alertPath, content);

    console.log(`🟡 Context risk alert created: ${alertPath}`);
  }

  private async summarizeCompletedWork(sessionId: string): Promise<string> {
    // 读取最近 10 轮对话，提取已完成工作
    // TODO: 从 session history 提取
    return `- 已分析 3 个模块\n- 已完成设计方案草稿\n- 已识别 2 个依赖`;
  }

  private async estimateRemainingWork(taskId: string): Promise<string> {
    // 读取 ticket AC，计算未完成项
    const ticket = await readTicket(taskId);
    const remaining = ticket.acceptance_criteria.filter(ac => !ac.completed);
    return `剩余 ${remaining.length} 个 AC 未完成`;
  }

  private async notifyMaster(taskId: string): Promise<void> {
    const message = {
      type: 'context_risk_alert',
      taskId,
      timestamp: new Date().toISOString(),
      priority: 'high',
    };

    await writeMessageToQueue('shared/message_queue/inbox/', message);
    console.log(`📤 Notified Master about context risk: ${taskId}`);
  }
}

export const slaverContextMonitor = new SlaverContextMonitor();
```

### Master 拆卡命令
```typescript
// node/src/commands/task-split.ts
export async function taskSplit(taskId: string, splitCount: number): Promise<void> {
  console.log(`✂️  Splitting ${taskId} into ${splitCount} sub-tasks...`);

  // 1. 读取原 ticket
  const original = await readTicket(taskId);

  // 2. 召唤专家组分析拆分点
  console.log(`📢 Summoning expert panel for split analysis...`);
  const splitPlan = await analyzeTaskSplit(original, splitCount);

  // 3. 创建子 tasks
  for (let i = 0; i < splitCount; i++) {
    const subTaskId = `${taskId}-${String.fromCharCode(97 + i)}`; // a, b, c...
    await createSubTask(subTaskId, splitPlan.subTasks[i], original);
    console.log(`✅ Created ${subTaskId}`);
  }

  // 4. 原 task 标记 split
  await updateTicketStatus(taskId, 'split');
  await addTicketNote(taskId, `Splitted into: ${splitCount} sub-tasks due to context risk`);

  // 5. 通知 Slaver
  await notifySlaver(original.assignedSlaver, {
    type: 'task_splitted',
    originalTask: taskId,
    subTasks: splitPlan.subTasks.map(t => t.id),
  });

  console.log(`✅ ${taskId} split complete, Slaver notified`);
}

async function analyzeTaskSplit(ticket: Ticket, count: number): Promise<SplitPlan> {
  // 调用专家组分析（简化版：按 AC 拆分）
  const acsPerTask = Math.ceil(ticket.acceptance_criteria.length / count);
  
  return {
    subTasks: Array.from({ length: count }, (_, i) => ({
      id: `${ticket.id}-${String.fromCharCode(97 + i)}`,
      title: `${ticket.title} - Part ${i + 1}`,
      acceptance_criteria: ticket.acceptance_criteria.slice(
        i * acsPerTask,
        (i + 1) * acsPerTask
      ),
      estimate_hours: Math.ceil(ticket.estimate_hours / count),
    })),
  };
}
```

### 集成到 claude-runner.ts
```typescript
import { slaverContextMonitor } from './slaver-context-monitor.js';

export async function runClaude(options: ClaudeRunOptions): Promise<ClaudeRunResult> {
  const sessionId = options.sessionId || 'default';

  // Slaver 主动检测 context 风险
  if (options.role === 'slaver' && options.taskId) {
    await slaverContextMonitor.checkAndReport(sessionId, options.taskId);
  }

  // ... 原有逻辑 ...
}
```

## 测试策略

- **unit**: `tests/core/slaver-context-monitor.test.ts`
  - tokens 达到 120k → 验证告警创建
  - 验证消息发送到 Master
  
- **unit**: `tests/commands/task-split.test.ts`
  - 拆分 1 个 task → 验证生成 2 个子 task
  - 验证原 task 状态改为 `split`
  
- **integration**: 端到端测试
  ```bash
  # 1. Slaver 领取任务
  eket task:claim TASK-BIG
  
  # 2. 模拟 context 增长到 120k
  # （触发 Slaver 主动上报）
  
  # 3. Master 执行拆分
  eket task:split TASK-BIG --into 2
  
  # 4. 验证
  ls jira/tickets/TASK-BIG-a.md
  ls jira/tickets/TASK-BIG-b.md
  cat inbox/human_feedback/[SLAVER-ALERT]*
  ```

## observability
- logs: ["slaver.context_risk.detected", "slaver.context_risk.reported", "master.task.splitted"]
- metrics: ["slaver.context_alerts", "master.task_splits"]
- files: ["inbox/human_feedback/[SLAVER-ALERT] context-risk-*.md"]

## rollback_plan
Revert PR。拆分后的子 tasks 可手动删除，原 task 改回 `in_progress`。

---

**类型**: feature  
**技能要求**: Node.js / TypeScript / Task Management  
**依赖**: TASK-602（需要 contextTracker）, TASK-603（需要 logging）  
**assigned_experts**: backend-engineer, tech-architect

---

## 领取记录

**领取时间**: 2026-05-10T12:09:00+08:00  
**Slaver ID**: slaver-architect-001  
**角色**: backend / tech-architect
