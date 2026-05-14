# Core Module API Documentation

## 概述

Core 模块包含 EKET 框架的核心功能，负责 Agent 管理、任务分配、消息传递和状态管理。

## 主要职责

- **Agent 生命周期管理**：注册、健康检查、自动剔除
- **任务分配与调度**：基于角色匹配、负载均衡的智能分配
-Git worktree 隔离执行环境

---

## 核心组件

### AgentPool (`agent-pool.ts`)

**版本**: 2.0.0

**职责**：
- 维护可用 Agent 列表（按角色/技能分类）
- 智能任务分配（角色匹配、负载均衡、历史表现）
- 健康检查和自动剔除离线 Agent
- Agent 容量管理（最大并发任务数）
- 与 HTTP Hook Server 集成（接收 TeambmateIdle 事件）

**主要功能**：
- **分布式轮询索引**：Redis 原子递增，防止任务重复分配
- **按角色维护轮询计数器**：不同角色独立负载均衡
- **TTL 防止键堆积**：自动过期清理 Redis 键

**使用示例**：
```typescript
import { AgentPool } from './core/agent-pool.js';

const pool = new AgentPool(config);

// 注册 Agent
await pool.register({
  id: 'agent-001',
  role: 'backend_dev',
  capacity: 3
});

// 获取可用 Agent
const agent = await pool.getAvailableAgent('backend_dev');

// 健康检查
await pool.healthCheck();
```

**依赖**：
- `InstanceRegistry`：实例注册中心
- `RedisClient`：分布式状态存储

---

### InstanceRegistry (`instance-registry.ts`)

**职责**：
- Agent 实例注册与注销
- 实例状态追踪（idle/busy/offline）
- 按角色筛选可用实例
- 持久化实例元数据（SQLite）

**主要 API**：
- `register(instance: Instance): Promise<void>` - 注册实例
- `unregister(instanceId: string): Promise<void>` - 注销实例
- `getByRole(role: string): Promise<Instance[]>` - 按角色查询
- `updateStatus(instanceId: string, status: string): Promise<void>` - 更新状态

**使用示例**：
```typescript
import { createInstanceRegistry } from './core/instance-registry.js';

const registry = await createInstanceRegistry(config);

await registry.register({
  id: 'slaver-001',
  role: 'frontend_dev',
  status: 'idle',
  capacity: 2
});

const frontendDevs = await registry.getByRole('frontend_dev');
```

---

### TaskAssigner (`task-assigner.ts`)

**版本**: 4.3

**职责**：
- 智能任务分配（集成 AgentPool 和 InstanceRegistry）
- 角色匹配验证
- 负载均衡策略（轮询/最少任务优先）
- 分配结果持久化

**分配策略**：
1. 按角色筛选候选 Agent
2. 排除超容量 Agent
3. 轮询或最少任务策略选择
4. 原子更新 Agent 状态

**使用示例**：
```typescript
import { createTaskAssigner } from './core/task-assigner.js';

const assigner = await createTaskAssigner(config);

const result = await assigner.assign({
  ticketId: 'TASK-001',
  requiredRole: 'backend_dev',
  strategy: 'round_robin'
});

if (result.success) {
  console.log(`Assigned to ${result.assignedTo}`);
}
```

---

### EnvelopeManager (`envelope-manager.ts`)

**职责**：
- 消息封装与解封（统一ing;
  type: string;
  from: string;
  to: string;
  payload: unknown;
  timestamp: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
}
```

**使用示例**：
```typescript
import { EnvelopeManager } from './core/envelope-manager.js';

const manager = new EnvelopeManager(projectRoot);

// 发送消息
await manager.send({
  type: 'task_claim',
  from: 'slaver-001',
  to: 'master',
  payload: { ticketId: 'TASK-001' },
  priority: 'high'
});

// 接收消息
const messages = await manager.receive('master');
```

---

### WorktreeManager (`worktree-manager.ts`)

**职责**：
- Git worktree 创建与清理
- 分支隔离（多 Agent 并行工作）
- 自动清理过期 worktree
- 冲突检测（分支名去重）

**使用示例**：
```typescript
import { WorktreeManager } from './core/worktree-manager.js';

const manager = new WorktreeManager(config);

// 创建 worktree
const worktree = await manager.create({
  branch: 'feature/TASK-001',
  baseBranch: 'miao'
});

// 清理 worktree
await manager.remove(worktree.path);
```

---

### ContextCompressor (`context-compressor.ts`)

**职责**：
- 上下文压缩（减少 token 消耗）
- 优先级排序（保留关键信息）
- 压缩率统计

**使用示例**：
```typescript
import { contextCompressor } from './core/context-compressor.js';

const compressed = contextCompressor.compress({
  ticketContent: '...',
  activeContext: '...',
  rulesDoc: '...'
}, { maxTokens: 5000 });

console.log(`Compression ratio: ${compressed.ratio}`);
```

---

### SagaExecutor (`saga-executor.ts`)

**职责**：
- 分布式事务管理（Saga 模式）
- 自动回滚（失败时撤销已完成步骤）
- 补偿操作执行
- 事务日志记录

**使用示例**：
```typescript
import { SagaExecutor } from './core/saga-executor.js';

const executor = new SagaExecutor();

const saga = executor.createSaga('claim-task')
  .step('reserve-agent', reserveFn, unreserveFn)
  .step('update-ticket', updateFn, revertUpdateFn)
  .step('send-notification', notifyFn, () => {});

await saga.execute({ ticketId: 'TASK-001' });
```

---

## 配置示例

```typescript
interface CoreConfig {
  redis: {
    enabled: boolean;
    host: string;
    port: number;
  };
  sqlite: {
    path: string;
  };
  agentPool: {
    healthCheckInterval: number; // ms
    maxCapacity: number;
  };
  worktree: {
    basePath: string;
    autoCleanup: boolean;
    cleanupAfterDays: number;
  };
}
```

---

## 错误处理

所有核心模块使用统一错误类型 `EketError`：

```typescript
class EketError extends Error {
  code: string;
  details?: Record<string, unknown>;
}
```

**常见错误码**：
- `AGENT_NOT_FOUND` - Agent 不存在或已下线
- `NO_AVAILABLE_AGENT` - 无可用 Agent
- `CAPACITY_EXCEEDED` - Agent 容量已满
- `REDIS_UNAVAILABLE` - Redis 连接失败（降级到内存模式）
- `WORKTREE_CONFLICT` - 分支名冲突

---

## 性能优化

- **Redis 缓存**：减少数据库查询
- **TTL 自动清理**：防止 Redis 键堆积
- **批量操作**：合并多次 Redis 写入
- **连接池**：复用数据库连接
|------|------|
| 2.0.0 | 2026-05 | AgentPool 分布式轮询，Redis TTL 支持 |
| 1.5.0 | 2026-04 | WorktreeManager 自动清理 |
| 1.0.0 | 2026-03 | 初始版本 |

---

**更多信息**：参见 [TypeDoc 自动生成文档](./index.html)
