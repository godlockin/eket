# TASK-073: DAG 可视化 Dashboard — ReactFlow + 实时染色

**Ticket ID**: TASK-073
**Epic**: SELF-EVOLVE
**标题**: 借鉴 Archon：Web Dashboard 新增 Ticket 依赖关系 DAG 图，节点状态实时染色
**类型**: feature
**优先级**: P1
**重要性**: high

**状态**: ready
**创建时间**: 2026-04-19
**创建者**: Master
**负责人**: 待认领

**依赖关系**:
- blocks: []
- blocked_by: [TASK-072]

---

## 背景 & 动机

Archon 的 `WorkflowExecutionPage` 用 ReactFlow 12 + dagre 布局算法实现实时 DAG 监控：节点颜色反映状态、点击节点跳日志、MiniMap 全局预览。EKET Dashboard 目前是纯 HTML/CSS 静态页面，无法可视化 Ticket 依赖关系和执行进度。

---

## 需求

### 验收标准

- **AC-1**: `node/src/api/eket-server.ts` 新增 `/dashboard/dag` 路由，渲染 DAG 可视化页面
- **AC-2**: 前端使用 ReactFlow 12 + `@dagrejs/dagre` 布局，展示当前 Sprint 所有 Ticket 节点及其 `blocked_by` 依赖边
- **AC-3**: 节点颜色按状态实时更新（通过 TASK-072 SSE `__dashboard__` 频道）：
  - `ready` → 灰色
  - `in_progress` → 蓝色（accent）
  - `done` → 绿色（success）
  - `blocked/failed` → 红色（error）
- **AC-4**: 节点显示：Ticket ID + 标题 + 负责人（Slaver ID）
- **AC-5**: 支持 MiniMap 缩略图（`@xyflow/react` MiniMap 组件）
- **AC-6**: 页面可通过 `node dist/index.js web:dashboard` 访问

### 技术方案

```typescript
// 前端打包为 dist/dashboard/
// node/src/api/eket-server.ts 提供静态文件服务
// 数据接口：GET /api/v1/tickets/dag → { nodes: DagNode[], edges: DagEdge[] }

interface DagNode {
  id: string;        // ticket id
  label: string;     // title
  status: string;    // ready|in_progress|done|blocked|failed
  assignee?: string; // slaver id
}

interface DagEdge {
  source: string;  // ticket id
  target: string;  // blocked_by ticket id
}
```

**前端架构**：
- React 19 + Vite 6（独立 `packages/web/` 目录）
- ReactFlow 节点颜色 Map：`{ ready: '#94a3b8', in_progress: '#3b82f6', done: '#22c55e', blocked: '#ef4444' }`
- SSE 连接 `__dashboard__` 频道，收到 `agent_status` 事件时更新节点颜色
- dagre 自动布局（`rankdir: 'LR'`，左→右方向）

---

## 测试命令

```bash
cd node && npm test -- --testPathPattern=dag-dashboard
node dist/index.js web:dashboard --port 3000
# 访问 http://localhost:3000/dashboard/dag
```

## 回滚

新增静态页面路由，不修改现有 Dashboard 逻辑。
