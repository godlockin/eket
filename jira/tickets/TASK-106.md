# TASK-106: DAG Middleware Pipeline — 核心框架

## 元数据
- **状态**: todo
- **类型**: feature
- **优先级**: P1
- **负责人**: 待领取
- **创建时间**: 2026-04-20
- **依赖**: 无

## 背景

EKET 现有 27 种 hook 事件是纯事件总线，处理器顺序不确定，无并行控制。
借鉴 deer-flow 18层有序 middleware + Archon DAG 执行引擎，
重构为 DAG-based middleware pipeline：节点声明依赖，支持并行层，失败语义可配置。

## 验收标准

1. `node/src/core/middleware-pipeline.ts`（新建）实现：
   - `MiddlewareNode` 接口：`id / deps[] / parallel / failBehavior / handle(state)→state`
   - `PipelineExecutor`：拓扑排序 + 并行层执行
2. 并行层：同一层级（无相互依赖）的节点并发执行，全部完成才进下一层
3. `failBehavior: 'block' | 'warn' | 'skip'`
4. 现有 `PreToolUse` hook 迁移为首个 pipeline（权限检查 ∥ 安全检查 ∥ 环境配置 → 工具执行）
5. `npm test` 全绿，新增 ≥ 5 单测

## Pipeline 示例（PreToolUse）

```
Layer 0（并行）：GuardrailMiddleware ∥ SecurityMiddleware ∥ EnvConfigMiddleware
       ↓ 全部通过
Layer 1（串行）：AuditLogMiddleware
       ↓
Layer 2：工具执行
       ↓
Layer 3（并行）：PostAuditMiddleware ∥ MetricsMiddleware
```

## 实现步骤

1. 实现 `MiddlewareNode` 接口和 `PipelineExecutor`
2. 拓扑排序算法（Kahn's algorithm）
3. 并行层用 `Promise.all` 执行
4. 迁移 `PreToolUse` hook
5. 写单测
