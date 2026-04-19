# Archon 借鉴研究报告 — Round 22

**研究日期**: 2026-04-19  
**研究对象**: https://github.com/coleam00/Archon  
**团队**: Slaver 1 (fullstack) + Slaver 2 (frontend) + Slaver 3 (backend)

---

## 项目定位

Archon 是 **AI 编码 Agent 的工作流引擎**：用 YAML 声明式定义 DAG 工作流（Plan→Implement→Validate→Review→PR），把 AI 的不确定性限制在节点内部，流程控制归开发者。类比：GitHub Actions 之于 CI/CD，Archon 之于 AI 编码。

技术栈：Bun + TypeScript（main），React 19 + ReactFlow（UI），pydantic-ai（v1 Python），Supabase pgvector（RAG），FastMCP（MCP 服务）。

---

## 核心发现（可借鉴点汇总）

### 1. YAML DAG 工作流引擎（最高价值）

Archon 把任务执行表达为 DAG：
```yaml
nodes:
  - id: classify
    model: haiku          # 低成本节点用便宜模型
    output_format:
      type: object
      properties:
        issue_type: { type: string, enum: [bug, feature] }

  - id: implement
    depends_on: [classify]
    when: "$classify.output.issue_type == 'bug'"
    model: claude-opus-4
    fresh_context: true   # 隔离上下文，不受前置节点污染
```

**6种节点类型**：prompt（AI推理）/ bash（确定性脚本）/ loop（until条件）/ approval（人工审批门禁）/ command（复用命令）/ script（Node.js）

**并行执行**：同 `depends_on` 的节点自动并行（`Promise.allSettled`），等全部完成再进入下一层。

**trigger_rule**：`one_success` = 多路径任一成功即可继续，适合 investigate/plan 分支。

---

### 2. 模型路由策略（成本优化）

| 节点类型 | 模型 | 原因 |
|--------|------|------|
| 分类/判断 | haiku | 低成本，够用 |
| 研究/分析 | sonnet | 中等 |
| 实现/代码 | opus | 最强 |

EKET 目前单一模型，引入此策略可降低 30-50% 成本。

---

### 3. SSE 流式事件体系（15种事件）

Archon 前端用原生 EventSource（SSE），定义了完整事件类型体系：

| 事件 | 用途 |
|------|------|
| `text` | 流式 token（50ms batch 批处理，减少 re-render） |
| `dag_node` | 单节点状态更新（实时染色） |
| `workflow_status` | 整体状态变更 |
| `conversation_lock` | 锁定+队列位置 |
| `retract` | 撤回正在输出的消息 |
| `tool_call/tool_result` | 工具调用展示 |
| `heartbeat` | 保活 |

全局 `useDashboardSSE` 广播所有 Agent 状态 → Zustand store → 任意页面实时感知。

---

### 4. 可视化 DAG 执行监控

- ReactFlow 12 + dagre 布局算法
- 节点颜色实时反映状态（running=accent, completed=success, failed=error）
- 点击节点 → 右侧日志面板自动滚动
- Graph ↔ YAML 双视图无缝切换
- MiniMap 缩略图全局预览

---

### 5. MCP HTTP 委托模式

MCP 服务器不直接访问 DB，通过 HTTP 委托给 API 服务：
```
MCP Client → HTTP POST /rpc → MCP Server (FastMCP)
                                → HTTP → API Server (DB查询)
```
好处：MCP 容器极轻量（150MB vs 1.66GB），职责分离，独立部署。

---

### 6. 3层 RAG 检索策略（Strategy Pattern）

```
BaseSearchStrategy     → 纯向量相似度
HybridSearchStrategy   → 向量 + PostgreSQL 全文检索
RerankingStrategy      → CrossEncoder ML 重排序
AgenticRAGStrategy     → Agent 动态选择策略
```

---

### 7. BaseAgent 泛型 + 依赖注入

```python
class BaseAgent(Generic[T_deps, T_output]):
    async def run(self, prompt, deps: T_deps) -> AgentOutput[T_output]:
        # 120s timeout, rate limit, structured output
```
DI 模式使 Agent 完全可测，mock deps 即可。

---

### 8. Docker Compose Profile 选择性部署

```yaml
services:
  eket-server:   # 始终运行
  eket-mcp:      # 始终运行
  eket-agents:
    profiles: [ml]       # GPU服务器才开
  eket-code-gen:
    profiles: [code-gen] # 需要时才开
```

---

## 拟拆 Ticket（TASK-070~075）

| Ticket | 内容 | 优先级 | 依赖 |
|--------|------|--------|------|
| TASK-070 | YAML DAG 工作流引擎 — 声明式任务编排 | P1 | 无 |
| TASK-071 | Agent 模型路由 — 节点级模型指定（haiku/sonnet/opus） | P2 | 无 |
| TASK-072 | SSE 事件体系 — 替换轮询，15种事件+全局广播 | P1 | 无 |
| TASK-073 | DAG 可视化 Dashboard — ReactFlow + 实时染色 | P1 | TASK-072 |
| TASK-074 | 3层 RAG 检索 — pgvector + 全文 + CrossEncoder | P2 | 无 |
| TASK-075 | trigger_rule + fresh_context — 依赖灵活化+上下文隔离 | P2 | TASK-070 |
