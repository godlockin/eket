# TASK-070: YAML DAG 工作流引擎 — 声明式任务编排

**Ticket ID**: TASK-070
**Epic**: SELF-EVOLVE
**标题**: 借鉴 Archon：新增 YAML DAG 工作流引擎，支持节点依赖、条件分支、并行执行
**类型**: feature
**优先级**: P1
**重要性**: high

**状态**: ready
**创建时间**: 2026-04-19
**创建者**: Master
**负责人**: 待认领

**依赖关系**:
- blocks: [TASK-075]
- blocked_by: []

---

## 背景 & 动机

Archon 用 YAML 声明式定义 DAG 工作流，把任务编排从"Master LLM 脑子里"外化为可版本管理的代码：

```yaml
# .archon/workflows/fix-issue.yaml
nodes:
  - id: classify
    type: prompt
    model: haiku
    output_format:
      type: object
      properties:
        issue_type: { type: string, enum: [bug, feature] }

  - id: implement
    type: prompt
    depends_on: [classify]
    when: "$classify.output.issue_type == 'bug'"
    model: claude-opus-4
    fresh_context: true

  - id: test
    type: bash
    depends_on: [implement]
    bash: "npm test"
```

EKET 目前任务编排完全靠 Master LLM 判断，不可重放、不可版本化、难以审计。

---

## 需求

### 验收标准

- **AC-1**: 新建 `node/src/core/workflow-yaml-engine.ts`，支持从 YAML 文件解析并执行 DAG
- **AC-2**: 支持 3 种基础节点类型：`prompt`（AI调用）、`bash`（Shell）、`noop`（占位）
- **AC-3**: 支持 `depends_on` 声明依赖，同层节点自动并行（`Promise.allSettled`）
- **AC-4**: 支持 `when` 条件表达式（简单变量引用：`"$nodeId.output.field == 'value'"`）
- **AC-5**: 支持节点间变量传递：`$nodeId.output` 在后续节点 prompt 中替换
- **AC-6**: 单元测试：3节点线性 DAG、2节点并行 DAG、条件分支 DAG 各一个

### Schema（TypeScript）

```typescript
interface WorkflowNode {
  id: string;
  type: 'prompt' | 'bash' | 'noop';
  depends_on?: string[];
  when?: string;           // 条件表达式
  prompt?: string;         // type=prompt 时
  bash?: string;           // type=bash 时
  model?: string;          // 节点级模型覆盖
  fresh_context?: boolean; // 隔离上下文
  output_format?: object;  // 结构化输出 schema
}

interface WorkflowDefinition {
  name: string;
  description?: string;
  nodes: WorkflowNode[];
}
```

### 技术方案

1. 用 `js-yaml` 解析 YAML → `WorkflowDefinition`
2. 拓扑排序 → 按层分组（同层并行）
3. 执行时 context map `{ [nodeId]: output }` 传递变量
4. `when` 表达式用简单字符串替换+`eval`（沙箱内）或手写解析器

---

## 测试命令

```bash
cd node && npm test -- --testPathPattern=workflow-yaml-engine
```

## 回滚

新增独立模块，不影响现有 `workflow-engine.ts`。
