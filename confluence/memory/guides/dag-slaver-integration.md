# DAG-Slaver Integration Guide

> TASK-642: 将 DAG 编排与 Master-Slaver 协作模式整合

## 快速开始

```bash
# 一键执行 EPIC（DAG 模式）
eket epic:run EPIC-017 --dag

# 预览执行计划
eket epic:run EPIC-017 --dag --dry-run

# 实时监控进度
eket epic:run EPIC-017 --dag --watch
```

## 架构概览

```
                    ┌─────────────────────┐
                    │      Master         │
                    │   epic:run --dag    │
                    └──────────┬──────────┘
                               │
                    ┌──────────▼──────────┐
                    │    DAGExecutor      │
                    │  (dag-executor.ts)  │
                    └──────────┬──────────┘
                               │ EventBus events
                    ┌──────────▼──────────┐
                    │  DAGSlaverBridge    │
                    │ (dag-slaver-bridge) │
                    └──────────┬──────────┘
                               │ sendTaskAssignment()
                    ┌──────────▼──────────┐
                    │   Slaver Mailbox    │
                    │  (.eket/inboxes/)   │
                    └──────────┬──────────┘
                               │ slaver:poll
                    ┌──────────▼──────────┐
                    │      Slaver         │
                    │    task:claim       │
                    └─────────────────────┘
```

## 事件流

| DAG 事件 | 触发动作 |
|----------|---------|
| `dag.run.started` | 初始化 DAGProgress 追踪 |
| `dag.node.pending` | 排队等待分发 |
| `dag.node.ready` | 分发到空闲 Slaver |
| `dag.node.running` | 更新 Slaver 分配状态 |
| `dag.node.done` | 推进下游节点 |
| `dag.node.failed` | 根据 on_failure 策略决定重试/跳过/终止 |
| `dag.run.completed` | 触发 EPIC 验收流程 |

## Master Heartbeat 集成

`master:heartbeat` 现在包含 DAG 进度：

```
── DAG 执行进度 ─────────────────────────────────────
   ▶️ EPIC-017 (dag_abc123)
      节点: 5/10 完成, 2 运行中, 0 失败
      活跃分配: TASK-005→slaver_001, TASK-006→slaver_002
   ⏳ 等待分发: 3 个节点
```

JSON 输出（`--json`）增加：
```json
{
  "dagProgress": {
    "activeRuns": [...],
    "totalRunning": 2,
    "totalPending": 3
  }
}
```

## 配置选项

### epic:run 命令

| 选项 | 说明 |
|------|------|
| `--dag` | 启用 DAG 模式（并行执行 + Slaver 自动分发） |
| `--dry-run` | 仅预览执行计划 |
| `--force` | 强制重新生成 dag.yml |
| `--watch` | 持续监控进度 |
| `--interval <s>` | 监控间隔（默认 30s） |

### DAGSlaverBridge 配置

```typescript
createDAGSlaverBridge({
  projectRoot: process.cwd(),
  masterId: 'master',
  maxConcurrentPerSlaver: 1,  // 每个 Slaver 最大并发任务数
  assignmentTimeoutMs: 7200000,  // 分配超时（2h）
  eventBus: getGlobalEventBus(),
});
```

## 故障处理

### 节点执行失败

1. DAGExecutor 根据 `settings.on_failure` 决定：
   - `stop`: 暂停 DAG，等待人工干预
   - `continue`: 跳过失败节点，继续执行下游
   - `rollback`: 回滚已完成节点（需配置 rollback 脚本）

2. Master heartbeat 显示失败信息，推荐操作

### Slaver 超时无响应

1. Heartbeat 标记为 stale（超过 5 分钟无心跳）
2. DAG 节点可被重新分发到其他 Slaver
3. 健康状态降级为 YELLOW

## 相关文件

- `node/src/core/dag-slaver-bridge.ts` - 核心桥接模块
- `node/src/commands/epic-run.ts` - epic:run 命令
- `node/src/core/dag-executor.ts` - DAG 执行器
- `node/src/commands/master-heartbeat.ts` - Heartbeat 集成

## 版本

- 添加于 EKET v2.9.2
- TASK-642 (EPIC-017)
