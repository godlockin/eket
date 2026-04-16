# TASK-030: 工作流模板 — CrewAI Flows 借鉴

**Ticket ID**: TASK-030
**标题**: 借鉴 CrewAI Flows：为 workflow-engine.ts 新增预设工作流模板
**类型**: improvement
**优先级**: P2

**状态**: ready
**创建时间**: 2026-04-14
**最后更新**: 2026-04-14
**started_at**:
**completed_at**:

**负责人**:
**Slaver**:

**gate_review_veto_count**: 0
**veto_reason**:
**resubmit_conditions**:

## 领取记录

| 操作 | Slaver / Reviewer | 时间 | 状态变更 |
|------|-------------------|------|----------|
| 创建 | Master | 2026-04-14 | backlog → ready |

---

## 1. 任务描述

借鉴 CrewAI Flows 的 **预定义工作流模板** 设计：在 EKET 的 `workflow-engine.ts` 中新增 3 个常用协作流程模板，让 Master 通过名称快速启动标准化多智能体协作，无需每次手工配置。

**问题**：当前 `WorkflowEngine` 的骨架代码存在（`SEQUENTIAL`/`PARALLEL`/`DAG` 三种类型），但没有任何预设模板，每次使用都要从头配置，复用率为零。

### 具体改动

**Part A — `node/src/core/workflow-engine.ts`**

新增 `WORKFLOW_TEMPLATES` 常量和 `getWorkflowTemplate()` 函数：

```typescript
// ─── 预设工作流模板（借鉴 CrewAI Flows）────────────────────────────
export const WORKFLOW_TEMPLATES = {
  /**
   * Feature 开发标准流：分析 → 实现 → 测试 → PR
   * 适用：单 feature ticket，1 个 Slaver
   */
  FEATURE_DEV: {
    name: 'feature-dev',
    description: 'Feature 开发标准流：analysis → in_progress → test → pr_review',
    type: WorkflowType.SEQUENTIAL,
    steps: [
      { id: 'analysis', role: 'analyzer', action: 'analyze_ticket', timeout: 30 },
      { id: 'implement', role: 'developer', action: 'implement', timeout: 120 },
      { id: 'test', role: 'tester', action: 'run_tests', timeout: 30 },
      { id: 'pr', role: 'developer', action: 'create_pr', timeout: 10 },
    ],
  },

  /**
   * 并行代码审查流：2 个 reviewer 独立审查，Master 汇总
   * 适用：重要 PR，需要多角度审查
   */
  PARALLEL_REVIEW: {
    name: 'parallel-review',
    description: '并行代码审查：2 个 reviewer 独立审查后汇总',
    type: WorkflowType.PARALLEL,
    steps: [
      { id: 'review_a', role: 'reviewer', action: 'code_review', timeout: 30 },
      { id: 'review_b', role: 'reviewer', action: 'security_review', timeout: 30 },
      { id: 'merge', role: 'master', action: 'merge_reviews', timeout: 10, dependsOn: ['review_a', 'review_b'] },
    ],
  },

  /**
   * Bug 修复快速流：复现 → 定位 → 修复 → 验证
   * 适用：紧急 bug，P0/P1 级别
   */
  BUG_FIX: {
    name: 'bug-fix',
    description: 'Bug 修复快速流：reproduce → locate → fix → verify',
    type: WorkflowType.SEQUENTIAL,
    steps: [
      { id: 'reproduce', role: 'analyzer', action: 'reproduce_bug', timeout: 20 },
      { id: 'locate', role: 'analyzer', action: 'locate_root_cause', timeout: 20 },
      { id: 'fix', role: 'developer', action: 'implement_fix', timeout: 60 },
      { id: 'verify', role: 'tester', action: 'verify_fix', timeout: 20 },
    ],
  },
} as const;

export type WorkflowTemplateName = keyof typeof WORKFLOW_TEMPLATES;

/**
 * 通过模板名称获取工作流配置
 * @param name 模板名称（FEATURE_DEV | PARALLEL_REVIEW | BUG_FIX）
 * @returns WorkflowDefinition 或 null
 */
export function getWorkflowTemplate(name: WorkflowTemplateName) {
  return WORKFLOW_TEMPLATES[name] ?? null;
}
```

**Part B — `node/src/commands/` 新增子命令 `workflow:list` 和 `workflow:start`**

在 `node/src/index.ts` 的现有命令中新增：

```typescript
// 列出所有预设工作流模板
program
  .command('workflow:list')
  .description('List available workflow templates')
  .action(() => {
    Object.entries(WORKFLOW_TEMPLATES).forEach(([key, tpl]) => {
      console.log(`  ${key.padEnd(20)} ${tpl.description}`);
    });
  });

// 用模板名启动工作流
program
  .command('workflow:start <template>')
  .description('Start a workflow from a template (FEATURE_DEV | PARALLEL_REVIEW | BUG_FIX)')
  .option('--ticket <id>', 'Associated ticket ID')
  .action((template, opts) => {
    const tpl = getWorkflowTemplate(template as WorkflowTemplateName);
    if (!tpl) {
      console.error(`Unknown template: ${template}. Run workflow:list to see options.`);
      process.exit(1);
    }
    console.log(`Starting workflow: ${tpl.name}`);
    console.log(`Ticket: ${opts.ticket ?? 'none'}`);
    console.log(`Steps: ${tpl.steps.map(s => s.id).join(' → ')}`);
  });
```

**Part C — 新增 2 个单元测试**

`node/tests/core/workflow-engine.test.ts` 新增（或在已有文件中追加）：

1. `getWorkflowTemplate('FEATURE_DEV')` 返回正确的 steps 数量（4）
2. `getWorkflowTemplate('UNKNOWN' as any)` 返回 null（不 crash）

---

## 2. 验收标准

- [ ] `workflow-engine.ts` 包含 `WORKFLOW_TEMPLATES` 和 `getWorkflowTemplate`；验证：`grep -l 'WORKFLOW_TEMPLATES\|getWorkflowTemplate' node/src/core/workflow-engine.ts`
- [ ] `workflow:list` 命令输出 3 个模板名；验证：`node dist/index.js workflow:list 2>&1 | grep -c 'FEATURE_DEV\|PARALLEL_REVIEW\|BUG_FIX'`（输出 ≥ 3）
- [ ] `workflow:start FEATURE_DEV` 不 crash，输出 steps；验证：`node dist/index.js workflow:start FEATURE_DEV 2>&1 | grep 'analysis'`
- [ ] `workflow:start UNKNOWN` 以非零 exit code 退出；验证：`node dist/index.js workflow:start UNKNOWN 2>&1; echo "EXIT:$?"`（EXIT:1）
- [ ] 新增 2 个测试，全量 1114+ 通过；验证：`cd node && npm test 2>&1 | tail -3`

---

## 3. 技术方案

- 在 `WorkflowEngine` 类 **同文件** 追加 `WORKFLOW_TEMPLATES` 常量（不修改类本身结构）
- `getWorkflowTemplate` 是纯函数，无副作用
- CLI 子命令直接在 `index.ts` 注册（与现有模式一致）
- 测试使用 Jest 直接 import `getWorkflowTemplate`，无需 mock

---

## 4. 影响范围

- `node/src/core/workflow-engine.ts` — 新增 WORKFLOW_TEMPLATES + getWorkflowTemplate
- `node/src/index.ts` — 新增 workflow:list 和 workflow:start 子命令
- `node/tests/core/workflow-engine.test.ts` — 新增 2 个测试

---

## 5. blocked_by

无依赖。与 TASK-027/028/029 可并行。
