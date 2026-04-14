# EKET 架构参考

## 运行时降级架构

EKET 采用三级渐进式架构，高层不可用时自动降级到低层：

```
Level 3: Redis + SQLite (满血版)    ← 生产级高并发 ⭐⭐⭐
    ↓ Redis 不可用时降级
Level 2: Node.js + 文件队列 (增强版) ← 更高效专业 ⭐⭐⭐⭐
    ↓ Node.js 不可用时降级
Level 1: Shell + 文档 (基础版)      ← 优先保证 100% 可用 ⭐⭐⭐⭐⭐

运行时降级: Level 3 → Level 2 → Level 1 (优雅降级)
```

### 各级能力对比

| 能力 | Level 1 (Shell) | Level 2 (Node) | Level 3 (Redis+SQLite) |
|------|----------------|----------------|------------------------|
| 任务管理 | 文件读写 | 文件队列+去重 | Redis Pub/Sub |
| Master 选举 | File mkdir | SQLite 锁 | Redis SETNX |
| 消息传递 | 文件轮询 | 优化文件队列 | Redis Pub/Sub |
| 数据持久化 | Markdown 文件 | JSON 文件 | SQLite |
| 心跳监控 | Shell 脚本 | Node.js 定时器 | Redis TTL |
| 并发支持 | 低 | 中 | 高 |

### 连接降级链（connection-manager.ts）

```
Remote Redis → Local Redis → SQLite → File System
```

---

## 核心模块（node/src/core/）

| 文件 | 功能 |
|------|------|
| `master-election.ts` | 三级 Master 选举（Redis SETNX / SQLite / File mkdir），租约续期 |
| `connection-manager.ts` | 四级降级连接（Remote Redis → Local Redis → SQLite → File） |
| `message-queue.ts` | 消息队列（Redis Pub/Sub + 文件降级），带重试 |
| `circuit-breaker.ts` | 断路器（closed/open/half_open），带退避重试 |
| `cache-layer.ts` | LRU 内存缓存 + Redis 二级缓存，缓存穿透保护 |
| `redis-client.ts` | Redis 客户端封装（心跳、Slaver 注册） |
| `sqlite-client.ts` | SQLite 同步客户端（Retrospective 存储） |
| `instance-registry.ts` | Instance 注册与心跳管理 |
| `agent-pool.ts` | Agent Pool 管理（负载均衡、角色选择） |
| `workflow-engine.ts` | 工作流引擎（预定义协作流程） |
| `event-bus.ts` | 事件总线（DomainEvent、死信队列） |
| `alerting.ts` | 四级告警（info/warning/error/critical）+ 多渠道通知 |
| `optimized-file-queue.ts` | 原子文件队列（临时文件+rename，SHA256 校验和验证） |
| `knowledge-base.ts` | 知识库（artifact/pattern/decision/lesson 等类型） |

### node/src/ 目录总览

| 目录/文件 | 职责 |
|-----------|------|
| `index.ts` | CLI 入口，注册所有 Commander 命令 |
| `commands/` | 各 CLI 命令实现（`registerXxx` 函数），含 `gate-review.ts` |
| `core/` | 核心业务逻辑模块（见上表） |
| `api/` | HTTP 服务器（Web Dashboard、OpenCLAW Gateway、Hook Server） |
| `skills/` | Skills 系统（Registry、Loader、内置 Skills） |
| `types/index.ts` | 全局类型定义和 `EketErrorCode` 枚举 |
| `utils/` | 工具库（logger、error-handler、yaml-parser 等） |
| `config/app-config.ts` | 配置管理（ConfigManager） |
| `di/container.ts` | 依赖注入容器（DIContainer） |
| `hooks/` | HTTP Hook 服务器（Agent 生命周期事件） |
| `integration/` | OpenCLAW 适配器 |
| `i18n/` | 国际化 |
| `health-check.ts` | 健康检查 |

---

## Master-Slaver 协作流程

```
1. Master 选举
   └─ 竞争 Redis SETNX / SQLite 锁 / File mkdir
   └─ 获胜者成为 Master，启动租约续期心跳

2. 需求分析
   └─ 读取 inbox/human_input.md
   └─ 创建 jira/tickets/ Ticket（含验收标准、依赖关系）
   └─ 状态：backlog → analysis → ready

3. Gate Review（执行前关卡）
   └─ 状态进入 ready 后自动触发 gate_reviewer
   └─ gate_reviewer 检查：AC 完整性 / TBD 检测 / 依赖状态
   └─ APPROVE → in_progress；VETO → 打回 analysis
   └─ 同一 ticket 否决 ≥ 2 次 → 第 3 次强制 APPROVE（死锁防止）
   └─ 命令：node dist/index.js gate:review <ticket-id>

4. Slaver 初始化
   └─ Master 通过 subagent 唤醒 Slaver 节点
   └─ Slaver 注册到 instance-registry
   └─ 状态：ready → gate_review → in_progress

5. 任务执行（Slaver）
   └─ 领取任务：node dist/index.js task:claim [id]
   └─ 分析设计（编写分析报告）
   └─ TDD 开发：写失败测试 → 实现 → 通过
   └─ 提交 PR（feature/* → testing → miao → main）

6. 代码审核（Master）
   └─ 检查 PR 验证证据（真实 npm test stdout）
   └─ 检查 CI test check 绿灯
   └─ 通过后合并到 miao，再同步到 main

7. 心跳监控
   └─ Slaver 每 30s 上报心跳
   └─ Master 检测超时（>30min 无更新）自动告警
```

### Ticket 状态机

```
backlog → analysis → ready → gate_review → in_progress → test → pr_review → done
                                              ↓ VETO
                                           analysis（打回重新分析）
```

### 三仓库分离（可选高级模式）

```
confluence/   ← 文档知识库（需求、架构、进度追踪）
jira/         ← 任务管理（tickets、backlog、sprint）
code_repo/    ← 源代码（当前目录）
```

---

## 错误处理约定

所有函数返回 `Result<T>`，不抛出异常：

```typescript
// ✓ 正确模式
const result = await someOperation();
if (!result.success) {
  printError({ code: result.error.code, message: result.error.message });
  process.exit(1);
}

// ✓ 错误码定义在 types/index.ts → EketErrorCode 枚举
```

## ESM 导入规范

```typescript
// ✓ 必须带 .js 扩展名（ES Modules）
import { createRedisClient } from './core/redis-client.js';

// ✗ 运行时报错
import { createRedisClient } from './core/redis-client';
```
