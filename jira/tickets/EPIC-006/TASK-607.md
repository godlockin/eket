---
agent_type: devops
estimate_hours: 006
status: done
assignee: slaver-backend-006
claimed_at: 2026-05-10T12:08:00+08:00
analysis_submitted_at: 2026-05-10T12:15:00+08:00
implementation_completed_at: 2026-05-10T12:35:00+08:00
pr_submitted_at: 2026-05-10T12:35:00+08:00
pr_merged_at: 2026-05-10T20:30:00+08:00
completed_at: 2026-05-10T20:30:00+08:00
branch: feature/TASK-607-alert-manager
merged_to: testing
---

# TASK-607: 连续错误告警机制

**EPIC**: EPIC-006 | **Milestone**: M2-Monitoring | **优先级**: P2 | **工时**: 3h | **状态**: in_progress | **依赖**: TASK-603

## 需求

单个 task 触发 3 次 400 错误时，自动写入 `inbox/human_feedback/[ALERT] context-overflow-TASK-XXX.md` 告警文件。

## 验收标准

- **AC-1**: Given 单个 task 触发 3 次 context_length_exceeded 错误, When `AlertManager.check()` 调用, Then 自动创建 `inbox/human_feedback/[ALERT] context-overflow-TASK-XXX.md`
- **AC-2**: Given 告警文件内容, When Master 读取, Then 包含：taskId, 错误次数, 首次/最后错误时间, estimated_tokens 历史, 建议操作（拆分 task / 限制分析深度）
- **AC-3**: Given 告警文件创建后, When 该 task 再次触发 400, Then 不重复创建告警（仅更新错误次数）
- **AC-4**: Given 连续 5 次 400 错误（跨不同 tasks）, When 全局告警阈值触发, Then 创建 `inbox/human_feedback/[ALERT] context-system-critical.md`
- **AC-5**: Given task 成功完成, When 清理告警, Then 删除对应的 context-overflow 告警文件

## 技术方案

### 新增文件
- `node/src/core/alert-manager.ts`

### 核心实现
```typescript
export class AlertManager {
  private errorCounts: Map<string, number> = new Map();
  private globalErrorCount: number = 0;

  async recordError(taskId: string, estimatedTokens: number): Promise<void> {
    const count = (this.errorCounts.get(taskId) || 0) + 1;
    this.errorCounts.set(taskId, count);
    this.globalErrorCount++;

    // Task-level alert
    if (count === 3) {
      await this.createTaskAlert(taskId, count, estimatedTokens);
    } else if (count > 3) {
      await this.updateTaskAlert(taskId, count);
    }

    // Global alert
    if (this.globalErrorCount === 5) {
      await this.createGlobalAlert();
    }
  }

  private async createTaskAlert(taskId: string, count: number, tokens: number): Promise<void> {
    const alertPath = path.join(
      process.cwd(),
      'inbox/human_feedback',
      `[ALERT] context-overflow-${taskId}.md`
    );

    const content = `# 🚨 Context Overflow Alert: ${taskId}

**触发时间**: ${new Date().toISOString()}
**错误次数**: ${count}
**最后估算 tokens**: ${tokens}

---

## 问题描述

Task ${taskId} 已触发 **${count} 次** context overflow 错误（400）。

## 建议操作

### 选项 A: 拆分任务（推荐）
将 ${taskId} 拆分为 2-3 个子任务，每个聚焦单一模块。

### 选项 B: 限制分析深度
指示 Slaver 减少 Read 文件数量，优先使用 Grep/Glob。

### 选项 C: 人工接管
暂停自动执行，由 Master 人工完成此任务。

---

**状态**: ⚠️ 需人工决策

**Master 回复位置**: 本文件末尾追加决策
`;

    await fs.mkdir(path.dirname(alertPath), { recursive: true });
    await fs.writeFile(alertPath, content);
    
    console.error(`🚨 ALERT: Task ${taskId} exceeded context limit 3 times`);
    console.error(`   Alert file: ${alertPath}`);
  }

  async clearTaskAlert(taskId: string): Promise<void> {
    const alertPath = path.join(
      process.cwd(),
      'inbox/human_feedback',
      `[ALERT] context-overflow-${taskId}.md`
    );

    if (await fs.exists(alertPath)) {
      await fs.unlink(alertPath);
      console.log(`✅ Cleared alert for ${taskId}`);
    }

    this.errorCounts.delete(taskId);
  }
}

// 全局单例
export const alertManager = new AlertManager();
```

### 集成到 claude-runner.ts
```typescript
import { alertManager } from './alert-manager.js';

async function recoverFromContextOverflow(options: ClaudeRunOptions): Promise<ClaudeRunResult> {
  // ... recovery 逻辑 ...
  
  // 记录到 alert manager
  await alertManager.recordError(
    options.taskId || 'unknown',
    contextTracker.getSessionTokens(options.sessionId)
  );
  
  return result;
}
```

## 测试策略

- **unit**: `tests/core/alert-manager.test.ts`
  - 3 次错误 → 验证告警创建
  - 5 次全局错误 → 验证全局告警
  
- **integration**: 模拟连续错误
  ```typescript
  for (let i = 0; i < 3; i++) {
    await alertManager.recordError('TASK-TEST', 180000);
  }
  
  const alertPath = 'inbox/human_feedback/[ALERT] context-overflow-TASK-TEST.md';
  expect(fs.existsSync(alertPath)).toBe(true);
  ```

## observability
- logs: ["alert.task_level.created", "alert.global.created"]
- files: ["inbox/human_feedback/[ALERT] context-overflow-*.md"]

## rollback_plan
Revert PR。仅告警逻辑，无业务影响。

---

**类型**: feature  
**技能要求**: Node.js / TypeScript / File I/O  
**依赖**: TASK-603  
**assigned_experts**: devops-engineer
