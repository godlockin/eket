/**
 * AlertManager - Context Overflow Alert System (TASK-607)
 *
 * Monitors context overflow errors (400) and creates alerts when thresholds are met:
 * - Task-level: 3 errors for a single task
 * - System-level: 5 errors across all tasks
 *
 * Alerts are written to inbox/human_feedback/ for Master review.
 */

import * as fs from 'fs/promises';
import * as path from 'path';

// ============================================================================
// Types
// ============================================================================

export interface ErrorRecord {
  count: number;
  firstOccurredAt: string;
  lastOccurredAt: string;
  tokenHistory: number[];
}

export interface AlertManagerOptions {
  projectRoot?: string;
  taskAlertThreshold?: number; // Default: 3
  systemAlertThreshold?: number; // Default: 5
}

// ============================================================================
// AlertManager Class
// ============================================================================

export class AlertManager {
  private readonly projectRoot: string;
  private readonly taskAlertThreshold: number;
  private readonly systemAlertThreshold: number;

  private errorCounts: Map<string, ErrorRecord> = new Map();
  private globalErrorCount: number = 0;
  private alertedTasks: Set<string> = new Set(); // Prevent duplicate alerts

  constructor(options: AlertManagerOptions = {}) {
    this.projectRoot = options.projectRoot || process.cwd();
    this.taskAlertThreshold = options.taskAlertThreshold ?? 3;
    this.systemAlertThreshold = options.systemAlertThreshold ?? 5;
  }

  /**
   * Record a context overflow error for a task.
   *
   * Automatically triggers task-level or system-level alerts when thresholds are met.
   *
   * @param taskId - Task ID (e.g., TASK-607)
   * @param estimatedTokens - Estimated tokens at time of error
   */
  async recordError(taskId: string, estimatedTokens: number): Promise<void> {
    const now = new Date().toISOString();

    // Update task-level count
    const record = this.errorCounts.get(taskId) || {
      count: 0,
      firstOccurredAt: now,
      lastOccurredAt: now,
      tokenHistory: [],
    };

    record.count++;
    record.lastOccurredAt = now;
    record.tokenHistory.push(estimatedTokens);
    this.errorCounts.set(taskId, record);

    // Update global count
    this.globalErrorCount++;

    console.log(
      `[AlertManager] Recorded error for ${taskId}: count=${record.count}, global=${this.globalErrorCount}`
    );

    // Task-level alert
    if (record.count === this.taskAlertThreshold && !this.alertedTasks.has(taskId)) {
      await this.createTaskAlert(taskId, record);
      this.alertedTasks.add(taskId);
    } else if (record.count > this.taskAlertThreshold && this.alertedTasks.has(taskId)) {
      await this.updateTaskAlert(taskId, record.count);
    }

    // System-level alert
    if (this.globalErrorCount === this.systemAlertThreshold) {
      await this.createGlobalAlert();
    }
  }

  /**
   * Create a task-level alert file.
   */
  private async createTaskAlert(taskId: string, record: ErrorRecord): Promise<void> {
    const alertDir = path.join(this.projectRoot, 'inbox', 'human_feedback');
    const alertPath = path.join(alertDir, `[ALERT] context-overflow-${taskId}.md`);

    const avgTokens = Math.round(
      record.tokenHistory.reduce((sum, t) => sum + t, 0) / record.tokenHistory.length
    );

    const content = `# 🚨 Context Overflow Alert: ${taskId}

**触发时间**: ${record.lastOccurredAt}
**错误次数**: ${record.count}
**首次发生**: ${record.firstOccurredAt}
**平均 tokens**: ${avgTokens.toLocaleString()}
**Token 历史**: ${record.tokenHistory.map(t => t.toLocaleString()).join(', ')}

---

## 问题描述

Task **${taskId}** 已触发 **${record.count} 次** context overflow 错误（400）。

该任务可能包含以下问题：
- 分析深度过大（读取过多文件）
- 单个文件体积过大
- 依赖关系复杂导致上下文膨胀

---

## 建议操作

### 选项 A: 拆分任务（推荐）

将 ${taskId} 拆分为 2-3 个更小的子任务，每个聚焦单一模块或功能。

**操作步骤**:
1. 暂停当前任务：\`eket task:pause ${taskId}\`
2. 创建子任务：\`eket task:split ${taskId} --count=3\`
3. 分配给不同 Slaver 或逐个执行

### 选项 B: 限制分析深度

指示 Slaver 减少探索范围：
- 限制 Read 文件数量（建议 < 5 个）
- 优先使用 Grep/Glob 定位代码
- 避免读取大型文件的全部内容

**操作步骤**:
\`\`\`bash
# 在 ticket 中添加约束
echo "## 执行约束\n- Max Read: 5 files\n- Use Grep for search" >> jira/tickets/${taskId}.md
\`\`\`

### 选项 C: 人工接管

暂停自动执行，由 Master 或人类手动完成此任务。

**操作步骤**:
\`\`\`bash
eket task:manual-override ${taskId}
\`\`\`

---

## Master 决策

**状态**: ⚠️ 待人工决策
**回复位置**: 本文件末尾追加决策

请在下方填写决策：

\`\`\`markdown
## 决策记录

**决策者**: <Master ID>
**时间**: <ISO8601>
**决策**: <A/B/C>
**备注**: <补充说明>
\`\`\`
`;

    await fs.mkdir(alertDir, { recursive: true });
    await fs.writeFile(alertPath, content, 'utf-8');

    console.error(`🚨 ALERT: Task ${taskId} exceeded context limit ${record.count} times`);
    console.error(`   Alert file: ${alertPath}`);
  }

  /**
   * Update an existing task alert with new error count.
   */
  private async updateTaskAlert(taskId: string, newCount: number): Promise<void> {
    const alertPath = path.join(
      this.projectRoot,
      'inbox',
      'human_feedback',
      `[ALERT] context-overflow-${taskId}.md`
    );

    try {
      const content = await fs.readFile(alertPath, 'utf-8');
      const updated = content.replace(
        /\*\*错误次数\*\*: \d+/,
        `**错误次数**: ${newCount}`
      );

      await fs.writeFile(alertPath, updated, 'utf-8');
      console.log(`[AlertManager] Updated alert for ${taskId}: count=${newCount}`);
    } catch (err) {
      console.warn(`[AlertManager] Failed to update alert for ${taskId}:`, err);
    }
  }

  /**
   * Create a system-level alert for global threshold.
   */
  private async createGlobalAlert(): Promise<void> {
    const alertDir = path.join(this.projectRoot, 'inbox', 'human_feedback');
    const alertPath = path.join(alertDir, '[ALERT] context-system-critical.md');

    const taskList = Array.from(this.errorCounts.entries())
      .map(([taskId, record]) => `- ${taskId}: ${record.count} errors`)
      .join('\n');

    const content = `# 🚨 System Critical: Context Overflow Epidemic

**触发时间**: ${new Date().toISOString()}
**全局错误数**: ${this.globalErrorCount}
**受影响任务数**: ${this.errorCounts.size}

---

## 问题描述

系统已累计触发 **${this.globalErrorCount} 次** context overflow 错误，跨 **${this.errorCounts.size} 个任务**。

这表明可能存在系统性问题：
- 任务拆分粒度普遍过大
- Slaver 分析策略需调整（过度探索）
- 项目复杂度超出当前模型上下文窗口

---

## 受影响任务

${taskList}

---

## 建议操作

### 🔴 紧急措施（立即执行）

1. **暂停所有自动任务分配**
   \`\`\`bash
   eket config set auto_assignment=false
   \`\`\`

2. **审查任务拆分策略**
   - 检查 Epic/Task 拆分粒度是否过大
   - 考虑引入"micro-task"模式（单文件/单函数级）

3. **升级 Slaver 指令**
   - 在 SLAVER-RULES.md 中添加硬性约束：
     * 单任务最多 Read 5 个文件
     * 禁止全文读取 > 1000 行的文件
     * 优先使用符号搜索（Grep/Glob）

### 🟡 中期优化（48 小时内）

1. **Context Budget 机制**
   - 实现 TASK-608（预算管理器）
   - 为每个任务预分配 token 预算

2. **分析瘫痪检测**
   - 强化 SLAVER-RULES.md 第 3 节规则
   - 连续 5 次 Read 无 Write → 强制报告 BLOCKED

3. **升级模型层级**
   - 考虑为复杂任务自动切换到更大上下文窗口模型
   - 配置 model-router.ts 添加"context-sensitive"策略

---

## Master 决策

**状态**: 🔴 系统性风险，需立即处理
**优先级**: P0

请在下方记录应对措施：

\`\`\`markdown
## 应对记录

**决策者**: <Master ID>
**时间**: <ISO8601>
**措施**: <具体行动>
**效果追踪**: <Ticket ID 或监控指标>
\`\`\`
`;

    await fs.mkdir(alertDir, { recursive: true });
    await fs.writeFile(alertPath, content, 'utf-8');

    console.error(
      `🚨🚨🚨 SYSTEM CRITICAL: ${this.globalErrorCount} context overflows detected!`
    );
    console.error(`   Alert file: ${alertPath}`);
  }

  /**
   * Clear task alert when task completes successfully.
   *
   * @param taskId - Task ID to clear
   */
  async clearTaskAlert(taskId: string): Promise<void> {
    const alertPath = path.join(
      this.projectRoot,
      'inbox',
      'human_feedback',
      `[ALERT] context-overflow-${taskId}.md`
    );

    try {
      await fs.access(alertPath);
      await fs.unlink(alertPath);
      console.log(`✅ Cleared alert for ${taskId}`);
    } catch {
      // File doesn't exist, no-op
    }

    // Clean up internal state
    this.errorCounts.delete(taskId);
    this.alertedTasks.delete(taskId);
  }

  /**
   * Get current error count for a task (for debugging/testing).
   */
  getErrorCount(taskId: string): number {
    return this.errorCounts.get(taskId)?.count ?? 0;
  }

  /**
   * Get global error count (for debugging/testing).
   */
  getGlobalErrorCount(): number {
    return this.globalErrorCount;
  }

  /**
   * Reset all state (for testing only).
   */
  reset(): void {
    this.errorCounts.clear();
    this.alertedTasks.clear();
    this.globalErrorCount = 0;
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

export const alertManager = new AlertManager();
