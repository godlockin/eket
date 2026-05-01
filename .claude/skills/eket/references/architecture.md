# EKET 架构参考

## 运行时降级架构

EKET 采用四级渐进式架构，高层不可用时自动降级到低层：

```
Level 0: Shell   lib/adapters/hybrid-adapter.sh    ← 100% 可用基底 ⭐⭐⭐⭐⭐
Level 1: Rust    eket binary (:9877 axum)           ← 高性能核心引擎 ⭐⭐⭐⭐⭐ NEW
    ↓ Rust server 不可用时降级
Level 2: Node.js (精简，保留 Web UI / LLM proxy)   ← 前端层 ⭐⭐⭐⭐
    ↓ Node.js 不可用时降级
Level 3: Shell + 文档 (基础版)                      ← 最终兜底
```

### 各级能力对比

| 能力 | Shell (L0) | Rust (L1) | Node.js (L2) |
|------|-----------|-----------|-------------|
| 任务管理 | 文件读写 | SQLite + Redis | 文件队列+去重 |
| Master 选举 | File mkdir | Redis SETNX / SQLite / File 三级 | SQLite 锁 |
| 消息传递 | 文件轮询 | Mailbox (tokio) + Redis | 优化文件队列 |
| 数据持久化 | Markdown 文件 | SQLite (rusqlite) | JSON 文件 |
| 心跳监控 | Shell 脚本 | tokio interval (HeartbeatMonitor) | Node.js 定时器 |
| Web Dashboard | ✗ | HTTP API (:9877) | Express + React |
| 知识库/搜索 | ✗ | SQLite FTS5 + TF-IDF | 文件搜索 |
| 并发支持 | 低 | 高（async tokio） | 中 |
| 冷启动延迟 | ~5ms | ~10ms | ~1.5s |
| task:claim | ~5ms | ~21ms | ~500ms |

### Rust 内部降级链（election.rs）

```
Redis SETNX (3s TTL) → SQLite BEGIN IMMEDIATE → File mkdir (POSIX 原子)
```

### Node.js → Rust 代理（server-start.ts）

```
eket server &        # 启动 axum :9877（detached，unref）
waitForRustServer()  # poll /health 最多 3s
Node web-server      # 检测到 Rust 存活 → createProxyMiddleware /api/v1/* → :9877
                     # Rust 不可用 → fallback 到 Node.js 本地处理（透明）
```

---

## Rust Workspace 模块（rust/crates/）

### eket-core（基础库）

| 模块 | 功能 |
|------|------|
| `db/mod.rs` | SQLite CRUD（tickets/instances/retros/checkpoints） |
| `config.rs` | ConfigManager（env + 默认值） |
| `election.rs` | 三级 Master 选举（Redis SETNX / SQLite / File） |
| `queue.rs` | 消息队列（Redis Pub/Sub + 文件降级），带重试 |
| `circuit_breaker.rs` | 断路器（closed/open/half_open），退避重试 |
| `cache.rs` | L1 moka (300s) + L2 Redis 二级缓存 |
| `redis.rs` | Redis 客户端封装（fred crate，async） |
| `registry.rs` | Instance 注册 + 心跳管理 |
| `dag.rs` | DAG 解析、拓扑排序（Kahn）、关键路径、循环检测 |
| `saga.rs` | Saga 补偿事务（async_trait，forward/compensate） |
| `ticket.rs` | Ticket 业务逻辑（claim 原子化 BEGIN IMMEDIATE） |
| `types.rs` | 全局类型定义（TicketStatus, AgentRole 等） |
| `error.rs` | EketError 统一错误类型 |

### eket-engine（高阶引擎）

| 模块 | 功能 |
|------|------|
| `workflow.rs` | 工作流状态机（tokio async，5种内置流程） |
| `agent_pool.rs` | Agent Pool（轮询/角色匹配/健康检查） |
| `mailbox.rs` | P2P 文件邮箱（原子写，per-agent Mutex） |
| `event_bus.rs` | broadcast 事件总线（DomainEvent，死信队列） |
| `knowledge.rs` | SQLite FTS5 知识库（BM25 评分） |
| `recommender.rs` | TF-IDF 余弦相似度推荐（CJK unigram tokenize） |
| `monitors.rs` | HeartbeatMonitor + StaleCleaner（tokio interval，AbortHandle） |
| `protocol.rs` | Master↔Slaver 协议消息（serde tag，ProtocolSender） |
| `lock.rs` | 分布式锁（Redis SETNX + 内存 fallback，FIFO 等待队列） |
| `conflict_resolver.rs` | 冲突解决（first_claim_wins / lock_queue / priority） |

### eket-cli（命令层）

| 命令 | 功能 |
|------|------|
| `task:claim` | 原子领取 ticket（BEGIN IMMEDIATE，<21ms） |
| `task:create` | 创建 ticket（自动编号，循环检测） |
| `task:complete` | Saga 5步完成（ValidateTicket→CommitWork→UpdateStatus→NotifyMaster→Record） |
| `task:resume` | 从 checkpoint 恢复中断任务 |
| `task:progress` | DAG 进度 + 关键路径 |
| `slaver:register` | 注册 Slaver 到 instance-registry |
| `slaver:poll` | 长轮询 mailbox（Ctrl+C 退出） |
| `master:heartbeat` | 扫描 ready tickets → 分发给空闲 Slaver |
| `master:poll` | 处理 TaskResult/Heartbeat/StatusUpdate |
| `gate:review` | PR CI 检查（解析 gh pr checks 输出） |
| `submit:pr` | git push + gh pr create |
| `team:status` | 列出所有实例 + 当前任务 |
| `knowledge:*` | 知识库 index/search |
| `recommend` | TF-IDF 推荐相似 ticket |
| `handoff` | 任务移交给其他 Slaver |
| `system:doctor` | 系统连通性诊断 |
| `server` | 启动 axum :9877 |

### eket-server（HTTP API）

| 路由 | 说明 |
|------|------|
| `GET /health` | 健康检查，200 OK |
| `GET /api/v1/tasks` | 列出所有 tickets（支持 status/assignee 过滤） |
| `GET /api/v1/tasks/:id` | 获取单个 ticket |
| `PATCH /api/v1/tasks/:id/status` | 更新 ticket 状态 |
| `GET /api/v1/agents` | 列出所有 Agent 实例 |
| `GET /api/v1/agents/:id` | 获取单个 Agent |
| `GET /api/v1/dag` | DAG 拓扑图（blocked_by 关系） |

---

## Node.js 保留模块（node/src/）

Phase 5 后仅保留前端/LLM 层，核心引擎由 Rust 提供：

| 文件 | 职责 |
|------|------|
| `api/web-server.ts` | Web Dashboard（Express → 代理 Rust API） |
| `api/openclaw-gateway.ts` | LLM HTTP 代理 |
| `api/eket-server.ts` | 反向代理（检测 Rust 是否存活） |
| `commands/init-wizard.ts` | inquirer 交互式初始化 |
| `commands/interactive-start.ts` | 终端 UI |
| `commands/server-start.ts` | spawn eket server + 启动 Node web-server |
| `core/claude-runner.ts` | Claude API 调用 |

> **已删除**（Rust 替代）：`master-election.ts`, `agent-pool.ts`, `event-bus.ts`

---

## Master-Slaver 协作流程

```
1. 启动
   └─ server-start.ts → spawn `eket server` (detached) → 等待 /health
   └─ 启动 Node Express web-server

2. Master 选举
   └─ eket master:heartbeat → 竞争 Redis SETNX / SQLite / File
   └─ 获胜者持续心跳续租

3. 需求分析
   └─ 读取 inbox/human_input.md
   └─ eket task:create "ticket" → 创建 jira/tickets/TASK-NNN.md
   └─ dag::detect_cycle 验证无循环依赖

4. Gate Review
   └─ eket gate:review TASK-NNN
   └─ 检查 AC 完整性 / TBD / 依赖状态
   └─ APPROVE → in_progress；VETO → analysis（≥2次否决 → 第3次强制）

5. 任务分发
   └─ eket master:heartbeat → 扫描 ready tickets → assign 给 idle Slaver
   └─ ProtocolMessage::TaskAssign 写入 Slaver mailbox

6. Slaver 执行
   └─ eket slaver:poll → 收到 TaskAssign → 自动 claim
   └─ eket task:claim TASK-NNN → SQLite BEGIN IMMEDIATE（原子，<21ms）
   └─ TDD 开发 → eket submit:pr

7. 完成回报
   └─ eket task:complete TASK-NNN → Saga 5步
   └─ ProtocolMessage::TaskResult → Master mailbox
   └─ eket master:poll → 处理结果，更新状态

8. 心跳监控
   └─ monitors.rs HeartbeatMonitor → 90s 超时 → 标记 offline
   └─ StaleCleaner → stale in_progress → 重置 todo
```

### Ticket 状态机

```
backlog → analysis → ready → gate_review → in_progress → test → pr_review → done
                                              ↓ VETO
                                           analysis（打回重新分析）
                              ↓ stale（StaleCleaner）
                           todo（重新入队）
```

### 三仓库分离（可选高级模式）

```
confluence/   ← 文档知识库（需求、架构、进度追踪）
jira/         ← 任务管理（tickets、backlog、sprint）
code_repo/    ← 源代码（当前目录）
```

---

## 错误处理约定

**Rust**：所有函数返回 `Result<T, EketError>`，不 panic：

```rust
// ✓ 正确模式
let ticket = db.get_ticket(&id)?;  // ? 传播错误
// CLI 命令：错误时 eprintln! + process::exit(1)
// 输出 JSON: {"success": false, "error": "..."}
```

**TypeScript（Node.js 保留层）**：

```typescript
// ✓ 错误码定义在 types/index.ts → EketErrorCode 枚举
// 失败示例：[ERROR] REDIS_CONNECTION_FAILED: Cannot connect to Redis
```

## ESM 导入规范（Node.js 层）

```typescript
// ✓ 必须带 .js 扩展名（ES Modules）
import { createRedisClient } from './core/redis-client.js';
```
