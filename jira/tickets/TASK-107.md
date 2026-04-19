# TASK-107: DAG Middleware — 迁移现有所有 Hook

## 元数据
- **状态**: todo
- **类型**: refactor
- **优先级**: P1
- **负责人**: 待领取
- **创建时间**: 2026-04-20
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

## 实现步骤

1. 按分组逐一迁移，每迁移一组跑一次 `npm test`
2. 更新 `http-hook-server.ts` 内部使用 `PipelineExecutor`
3. 补充文档注释
