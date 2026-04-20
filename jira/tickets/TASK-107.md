# TASK-107: DAG Middleware — 迁移现有所有 Hook

## 元数据
- **状态**: done
- **类型**: refactor
- **优先级**: P1
- **负责人**: Slaver
- **创建时间**: 2026-04-20
- **完成时间**: 2026-04-20
- **依赖**: TASK-106

## 背景

TASK-106 建立 DAG middleware 框架后，将现有 27 种 hook 事件全部迁移到新 pipeline 体系，
保留向后兼容（旧 hook 注册方式仍可用，内部转换为 pipeline 节点）。

## 验收标准

1. 所有 27 种 HookEvent 迁移完成，各自有对应 pipeline 定义
2. 旧 `http-hook-server.ts` 的注册方式向后兼容（不破坏现有 hooks:start 用法）
3. 各 pipeline 的并行/串行关系有文档说明（注释）
4. `npm test` 全绿，零新增失败

## Hook 分组（pipeline 设计参考）

| Pipeline | 并行节点 | 串行节点 |
|----------|---------|---------|
| PreToolUse | 权限∥安全∥环境配置 | 审计日志 |
| PostToolUse | 审计∥指标 | — |
| SessionStart | 索引加载∥心跳注册 | — |
| TaskCompleted | 反馈上报∥worktree清理 | skill_graph更新 |
| TeammateIdle | — | 任务调度 |

## 实现结果

- 新建 `node/src/hooks/pipelines/` 目录，7 个 pipeline 文件
- `pre-tool-use.ts`: GuardrailNode ∥ SecurityNode ∥ EnvConfigNode → AuditLogNode
- `post-tool-use.ts`: MetricsNode ∥ AuditNode
- `session.ts`: IndexLoadNode ∥ HeartbeatNode
- `task.ts`: FeedbackNode ∥ WorktreeCleanupNode → SkillGraphUpdateNode
- `compact.ts`: SummarizationNode
- `permission.ts`: PermissionCheckNode
- `misc.ts`: PassthroughNode（其余 15 种事件）
- `http-hook-server.ts` 内部增加 `EVENT_PIPELINE_GROUP` 映射 + `getPipeline` + pipeline 调用逻辑，对外 API 不变
- `npm test`: 1276 passed, 0 新增失败（1 pre-existing suite failure 与本任务无关）
