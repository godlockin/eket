# TASK-633: Node.js DAG Executor (L2 fallback)

**EPIC**: EPIC-017  
**状态**: done  
**优先级**: P1  
**预估**: 2d  
**依赖**: TASK-631  
**层级**: L2 Node.js
**完成时间**: 2026-06-01

---

## 目标

TypeScript 实现 DAG 执行器，支持并发执行 + EventBus 状态广播。

## 验收标准

- [x] `node/src/core/dag-executor.ts` 实现完整
- [x] 并发控制：Semaphore 实现并发限制
- [x] EventBus 集成：节点状态变更广播 `dag.node.{pending/running/done/failed/skipped}`
- [x] 支持 `--dry-run` / `--resume`
- [x] 单元测试：`node/tests/core/dag-executor.test.ts` (23 tests passing)
- [ ] 集成测试：与现有 ticket 系统联动 (deferred to TASK-635)

## 核心接口

```typescript
interface DAGExecutor {
  load(yamlPath: string): Promise<DAG>;
  validate(dag: DAG): ValidationResult;
  execute(dag: DAG, options?: ExecuteOptions): Promise<DAGRun>;
  resume(runId: string): Promise<DAGRun>;
}

interface ExecuteOptions {
  dryRun?: boolean;
  maxParallel?: number;  // override settings
  onNodeStart?: (nodeId: string) => void;
  onNodeComplete?: (nodeId: string, result: NodeResult) => void;
}
```

## EventBus 事件

| 事件 | Payload |
|------|---------|
| `dag.run.started` | `{ runId, epicId, totalNodes }` |
| `dag.node.pending` | `{ runId, nodeId }` |
| `dag.node.running` | `{ runId, nodeId, startedAt }` |
| `dag.node.done` | `{ runId, nodeId, duration }` |
| `dag.node.failed` | `{ runId, nodeId, error }` |
| `dag.run.completed` | `{ runId, status, duration }` |

## 并发控制

```typescript
// Semaphore 限制最大并发
class Semaphore {
  constructor(private permits: number) {}
  async acquire(): Promise<void>;
  release(): void;
}

// 执行逻辑
const ready = getReadyNodes(dag);  // deps 全部 done 的节点
await Promise.all(ready.map(async (node) => {
  await semaphore.acquire();
  try {
    await executeNode(node);
  } finally {
    semaphore.release();
  }
}));
```

## CLI 命令

```bash
# 通过 node dist/index.js
node dist/index.js dag:run jira/epics/EPIC-017/dag.yml
node dist/index.js dag:run --dry-run jira/epics/EPIC-017/dag.yml
node dist/index.js dag:resume <run-id>
node dist/index.js dag:status <run-id>
```

---

## 变更日志

| 日期 | 变更 | 操作人 |
|------|------|--------|
| 2026-06-01 | 创建 ticket | Master |
| 2026-06-01 | 实现完成，23 tests passing | Slaver |

---

## 实现摘要

### 核心文件

- `node/src/core/dag-executor.ts` — DAGExecutor 类 + Semaphore 并发控制
- `node/tests/core/dag-executor.test.ts` — 23 个单元测试

### 主要功能

1. **DAG 加载与验证**
   - `load(yamlPath)`: 从 YAML 文件加载 DAG
   - `validate(dag)`: 验证 DAG 结构（依赖存在、无循环）

2. **并发执行**
   - Semaphore 类限制最大并发数
   - 拓扑排序，按 wave 执行（deps 完成后才启动下游节点）
   - `Promise.all` 并行执行同一 wave 的节点

3. **EventBus 集成**
   - `dag.run.started` / `dag.run.completed`
   - `dag.node.pending` / `running` / `done` / `failed` / `skipped`

4. **断点续传**
   - 状态持久化到 `.eket/dag-runs/{runId}.json`
   - `resume(runId)`: 从失败点恢复执行
   - `getStatus(runId)`: 查询运行状态

5. **故障处理**
   - 节点重试（configurable retry_count）
   - 依赖失败时自动 skip 下游节点
   - `on_failure: stop | continue` 策略
