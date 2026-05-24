# TASK-Y04: 动态多角色算力调度器与预算控制

**ID**: TASK-Y04  
**Epic**: EPIC-009  
**优先级**: P1  
**预估**: 8h  
**依赖**: TASK-Y03  
**Agent Type**: devops / orchestrator  
**Category**: ⚙️ Agent Orchestration / Cost Control

---

## Goal

实现算力弹性管理与 Token 消费防火墙。升级 EKET 实例加载流，使其支持根据任务复杂度、分类（Category）自动匹配并动态衍生（Spawn）具有专用技能集的轻量化 Agent 实例，并配合硬性预算墙（Budget Limit）防止循环调用造成的 Token 资金浪费。

---

## Acceptance Criteria

**Acceptance Criteria**

**AC-1**: 任务复杂度自动评估与角色匹配  
- Given: Master 创建了一个包含特定标签（如 `#ui` 或 `#perf`）的 Ticket
- When: 触发 Slaver 自动分派与 Spawn
- Then: 调度器能够准确解析标签，决定 Spawn 出 `frontend_dev`（选用轻量级模型）还是 `perf_expert`（选用高阶大上下文模型）

**AC-2**: 动态容器 / 子代理衍生 (Dynamic Spawn)  
- Given: Slaver 开始执行
- When: 检测到自身技能不足以解决某个特定 sub-task
- Then: 动态 Spawn 出具有特定 Skill Card 的子智能体节点（利用 `define_subagent` 或独立进程），传递隔离的 context 进行并发推进

**AC-3**: Token 消费阈值与硬熔断 (Budget Enforcement)  
- Given: 启动动态 Agent
- When: 该任务消耗的 Token 折合金额超过设定阈值（例如单 Task 预算 $2.00），或循环调用步数超过 15 步
- Then: 运行时抛出 `BudgetExceededError` 立即阻断并硬性挂起 Agent 进程，生成 debrief 报告，防止无意义的无限死循环

**AC-4**: 算力回收自愈  
- Given: 子代理任务处理完毕（无论成功或失败）
- When: 执行清理生命周期
- Then: 自动释放占用的线程/进程与内存，清理临时工作区分支，确保系统资源零残留

---

## Implementation Sketch

在 `node/src/core/claude-runner.ts` 扩展或在 `agent-orchestrator.ts` 中实现：

```typescript
export interface SpawnOptions {
  role: 'frontend_dev' | 'backend_dev' | 'qa' | 'perf_expert';
  maxBudgetDollars: number;
  taskId: string;
}

export class AgentOrchestrator {
  private activeAgents = new Map<string, any>();

  async spawnAgent(options: SpawnOptions): Promise<void> {
    // 1. 根据角色匹配最佳大模型 profile 与 system prompt
    const profile = this.resolveProfile(options.role);
    
    // 2. 检查当前 Task 累计 Token 消耗与计费
    const currentCost = await this.getAccumulatedCost(options.taskId);
    if (currentCost >= options.maxBudgetDollars) {
      throw new Error(`[Orchestrator] Task ${options.taskId} has exceeded its budget of $${options.maxBudgetDollars}. Hard halt.`);
    }

    // 3. 动态实例化 Agent 进程/线程
    const agentProcess = await this.initializeInstance(profile, options.taskId);
    this.activeAgents.set(options.taskId, agentProcess);
    
    // 4. 监听 Token 审计事件，达到临界值时触发主动熔断
    agentProcess.on('token_consumed', (tokens: number) => {
      const additionalCost = this.calculateCost(tokens, profile.modelName);
      if (currentCost + additionalCost >= options.maxBudgetDollars) {
        this.terminateAgent(options.taskId, 'Budget Exceeded');
      }
    });
  }

  private async terminateAgent(taskId: string, reason: string): Promise<void> {
    const process = this.activeAgents.get(taskId);
    if (process) {
      await process.kill();
      this.activeAgents.delete(taskId);
      console.warn(`[Orchestrator] Task ${taskId} terminated. Reason: ${reason}`);
    }
  }
}
```

---

## Test Strategy

**Integration**: 模拟一个死循环的任务（如重复 20 次自我对话）。启动 `AgentOrchestrator` 并将 `maxBudgetDollars` 设为一个极低值（如 $0.05）。观察 Agent 运行过程中是否能在达到预算临界点时被立刻 `kill`，并生成包含终止原因的 `budget_melt_report.md`。

---

**Blocked By**: TASK-Y03  
**Blocks**: TASK-Y05  
**Created**: 2026-05-24
---
status: ready
assignee: ""
branch: ""
ac_completed: 0/4
test_coverage: 0%
