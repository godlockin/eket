# EKET Rust 迁移综合 Review 反思
**日期**: 2026-04-21  
**背景**: Node.js → Rust 迁移（Phase 5 完成后）两轮专家 review 合并整合  
**参与**: 架构师组 A（第一轮）+ 架构师组 B（第二轮）+ QA + 后端工程师

---

## 一、已确认实现良好的部分

| 模块 | 亮点 |
|------|------|
| **Redis 三级降级** | `queue.rs` auto-detect → File；`election.rs` Redis→SQLite→mkdir；`cache.rs` L1 静默降级。比 Node 实现更清晰 |
| **DAG 图分析** | Kahn 拓扑排序、循环检测、`ready_tickets`、`critical_path` —— 均优于 Node（Node 无这些） |
| **Saga 补偿事务** | 语义等价，生产可用 |
| **Circuit Breaker** | 线程安全（`Arc<Mutex<Inner>>`），named breaker，HalfOpen→Open 重置计时，比 Node 更健壮 |
| **P0 修复** | tower 版本冲突、dag.rs 孤儿边 panic、DB 路径分叉均已修复 |

---

## 二、完整差距清单（两轮合并）

### 2.1 完全缺失的模块

| 缺失 | 严重性 | Node 来源 | 说明 |
|------|--------|-----------|------|
| **SSE 推送层** | P0 | `sse-bus.ts` + `sse-event-bus.ts` + `/api/v1/events` | Dashboard 实时事件完全死锁；axum SSE 支持原生，实现成本低 |
| **Hook HTTP 服务器** | P0 | `hooks/http-hook-server.ts` + `hooks:start` | Claude Code 生命周期钩子（pre-tool-use / post-tool-use / teammate-idle / task-completed / permission-request）— Master 感知 Slaver 行为的核心通路 |
| **DAG 并行执行器** | P1 | `middleware-pipeline.ts` | Kahn 排序已有，但只有图分析，无执行层；缺 `Promise.all` 并行层、`FailBehavior: block/warn/skip`、transitive skip 传播、per-node retry |
| **向量搜索 / RAG** | P1 | `rag-search.ts` | 向量 embedding 存储、余弦相似度、策略模式 `SearchStrategy` 接口——完全没有 Rust 实现 |
| **ResultAggregator** | P1 | `result-aggregator.ts` | 多 Slaver 结果合并 + 冲突检测，无 Rust 等价物 |
| **PR 生命周期 API** | P1 | `eket-server.ts /api/v1/prs/*` | `POST /prs`、`/prs/:id/review`、`/prs/:id/merge` 三条路由全缺 |
| **JWT 鉴权层** | P1 | `eket-server.ts` `/agents/register` → JWT | Rust server 零认证机制 |
| **WorkflowType 执行** | P1 | `workflow-engine.ts` `WorkflowType.PARALLEL` | Rust workflow 仅顺序执行；`dependsOn` fan-out/join 缺失 |
| **Warm Standby / Failover** | P1 | `master-election.ts` `WarmStandbyConfig` | 热备 Master 注册、心跳检测、failover 提升、认知连续性加载 |
| **Instance 自举向导** | P2 | `interactive-start.ts` / `init-wizard.ts` | inquirer 交互向导，首次部署必需 |
| **Skill 提炼** | P2 | `skill-extract.ts` | 从复盘自动提炼通用 Skill |
| **Alerts 子系统** | P2 | `alerts.ts` | 告警 status/acknowledge/resolve |
| **YAML Workflow 加载** | P2 | `workflow-yaml-engine.ts` | YAML DSL → WorkflowDefinition 解析 |
| **Schema 版本迁移** | P2 | — | 只有 `CREATE TABLE IF NOT EXISTS`；无 `schema_version` 表；无 ALTER TABLE 迁移 |

### 2.2 已实现但有功能退化

| 模块 | 退化点 | 影响 |
|------|--------|------|
| **消息队列 Redis 语义** | Node 用 `PUBLISH/SUBSCRIBE`（真 pub/sub，多订阅者扇出）；Rust 用 `LPUSH/RPOP`（队列，单消费者） | **跨语言部署时两端完全无法通信**；Rust 发的消息 Node 收不到，反之亦然 |
| **冲突仲裁策略** | Rust 只有 `first_claim_wins`；Node 有 `role_priority` + `manual`（升级 Master）+ `read_write_lock` + `auto_reassign` | 复杂冲突场景退化为先到先得 |
| **Agent Pool 技能匹配** | Rust 大小写敏感（`"Rust"` ≠ `"rust"`）；Node 大小写不敏感 | **现有 bug**，技能分配静默失败 |
| **Agent Pool 选择策略** | Rust 只有 least-utilization；Node 有 4 种（least_loaded / round_robin / random / best_match） | 分配灵活性下降 |
| **Agent Pool 分布式 RR** | Rust 进程内局部计数；Node 用 Redis `INCR`（跨进程一致） | 多实例部署时 RR 失效 |
| **Workflow 步骤数据流** | Rust `StepResult.output` 不回写 context；Node 逐步累积 | **已有 bug**：步骤间无法传递数据 |
| **Workflow retry_count** | 字段存在但从不递增 | **已有 bug**：重试计数永远为 0 |
| **Mailbox 并发安全** | Rust 用 `tokio::Mutex`（进程内）；Node 用 `proper-lockfile`（跨进程） | **已有 bug**：多 OS 进程并发访问 mailbox 会数据竞争 |
| **EscalateToMaster fallback** | Rust 只打 log；Node 实际发 Master inbox | judgment 超时无法上报 |
| **Instance Registry** | 无 `updateInstanceStatus()`（只能全量 upsert）；无 `unregisterInstance()`；缺 `currentTaskId`/`currentLoad`/`levelChanges` 字段 | Agent 状态管理粗糙 |
| **知识库查询** | 无 entry type 分类、无作者、无多 ticket 关联、无分页、无 tag 结构化过滤 | 知识库可用性低 |
| **推荐引擎** | 纯 TF-IDF；Node 有个性化（历史 + 负载 + 技能匹配） | 推荐质量下降 |
| **Task/SSE 事件覆盖** | Rust 事件体系约覆盖 Node 的 60%；`tool_call`/`tool_result`/`ticket_progress`/`agent_status` 均缺失 | Dashboard 数据不完整 |
| **task:claim** | 无 git worktree 隔离；无 active-context 注入；无 SSE 发布 | 并行开发隔离性丢失 |
| **task:complete** | 无 worktree 合并；无冲突检测；无 scope-risk 推断 | 合并质量下降 |
| **gate:review** | Rust 版深度约为 Node 版 1/5 | CI 门卡力度不足 |

### 2.3 已知 Bug（需立即修复）

| Bug | 位置 | 严重性 |
|-----|------|--------|
| 步骤输出不回写 context | `eket-engine/src/workflow.rs` | P1 |
| `retry_count` 从不递增 | `eket-engine/src/workflow.rs` | P1 |
| 技能匹配大小写敏感 | `eket-engine/src/agent_pool.rs` | P1 |
| `last_heartbeat: Option<Instant>` 被 `#[serde(skip)]` | `eket-engine/src/agent_pool.rs` | P1 |
| Mailbox 跨进程并发不安全 | `eket-engine/src/mailbox.rs` | P1 |
| `resign()` 不删除 lock 文件 | `eket-core/src/election.rs` | P2 |
| `mailbox.rs:91` parent() unwrap | `eket-engine/src/mailbox.rs` | P2 |

---

## 三、整体架构升级思考

### 3.1 当前架构的本质问题

**Rust 层是「功能子集」而非「功能对等」替代**。Phase 5 宣布完成，但实际迁移率约 55%——核心引擎 OK，边界能力（实时推送、钩子、执行器、认证）全部缺失。这不是缺陷，是计划外的现实。

**更深层的问题**：两个语言层之间存在**语义不兼容**（Redis pub/sub vs LPUSH/RPOP），意味着 Node 和 Rust 当前**无法协同运行**——混合部署时消息层完全断裂。这是 P0 级架构债务。

### 3.2 建议的升级路线

#### 短期（修 bug + 补 P0）
1. 修复 5 个 P1 bug（workflow 数据流、技能匹配、heartbeat 序列化、mailbox 并发、retry_count）
2. 实现 SSE 端点（axum `Sse<S>`，成本低，收益大）
3. 统一 Redis 消息语义：要么 Rust 改为 pub/sub，要么两侧约定用 LPUSH/RPOP——**必须选一个**

#### 中期（补 P1 能力）
4. DAG 并行执行器（在 `eket-engine` 新增 `dag_executor.rs`，复用 `dag.rs` 的拓扑结果）
5. Hook HTTP 服务器（`hooks:start` 命令 + 5 个端点）
6. JWT 鉴权（`eket-server` 添加 `tower-http` 的 `ValidateRequestHeader` 层）
7. WorkflowType::Parallel（`workflow.rs` 添加 `tokio::join_all` 并行层）
8. Schema 版本迁移（`schema_version` 表 + 滚动 ALTER TABLE）

#### 长期（补完整功能）
9. 向量搜索（`tantivy` 或直接 SQLite `sqlite-vec` 扩展）
10. Warm Standby Master（`election.rs` 扩展热备状态机）
11. ResultAggregator（多 Slaver 结果合并）
12. 补全 12 个缺失 CLI 命令

### 3.3 一个更根本的反思：迁移策略的教训

**「全量迁移」计划低估了 Node 版的隐性复杂度**。Node 代码 ~16,600 行，但其中约 40% 是「协议胶水」（Hook server、SSE bus、JWT、PR 生命周期）——这些在迁移计划清单里被归类为「保留 Node.js」，但实际上它们是 Rust server 也需要承担的。

**正确的迁移心智模型**应该是：
```
不是「Node.js → Rust」的替换，
而是「Node.js 分裂为两层」：
  - Rust：数据引擎（高频、低延迟、CPU密集）
  - Node：协议层（SSE、Hook、JWT、Dashboard）
两层之间通过 HTTP API + 内部消息总线协作。
```

当前 Rust server 已经是这个形态的雏形，但缺少协议层的能力（SSE/Hook/JWT）——需要明确哪些「协议能力」应该在 Rust 侧实现，哪些继续留在 Node。

### 3.4 能力分层建议（最终态）

```
┌─────────────────────────────────────────────────────────┐
│  Level 0: Shell hooks (lib/adapters/)   — 100% 保留不动  │
├─────────────────────────────────────────────────────────┤
│  Level 1: Rust binary                                    │
│  ├── 数据引擎: SQLite/Redis/Queue/Election/Cache/DAG      │
│  ├── 工作流引擎: workflow + dag_executor（并行层）         │
│  ├── HTTP API: /api/v1/* + SSE /events + /hooks/*        │ ← 待补
│  └── CLI: 全 35 命令（当前 18/35）                        │
├─────────────────────────────────────────────────────────┤
│  Level 2: Node.js（精简后）                               │
│  ├── Web Dashboard (React + Express)                     │
│  ├── inquirer 交互向导 (init-wizard / interactive-start)  │
│  ├── LLM proxy (openclaw-gateway)                        │
│  └── Claude runner (API 调用)                            │
└─────────────────────────────────────────────────────────┘
```

**原则**：SSE、Hook、JWT 移入 Rust（已有 axum 支持），Dashboard / 向导 / LLM 留在 Node。Node 层只剩「前端展示 + 交互引导 + LLM 调用」，不再承担任何业务逻辑。

---

## 四、下一步 Ticket 建议

| Ticket | 优先级 | 工作量 |
|--------|--------|--------|
| `TASK-139` 修复 5 个 P1 bug（workflow 数据流等） | P0 | 1-2天 |
| `TASK-140` Redis 消息语义统一（pub/sub 或 list，二选一） | P0 | 1天 |
| `TASK-141` SSE 端点（axum Sse，两路由） | P0 | 1-2天 |
| `TASK-142` Hook HTTP 服务器（5端点 + hooks:start 命令） | P1 | 2-3天 |
| `TASK-143` DAG 并行执行器（FailBehavior + tokio::join_all） | P1 | 3-5天 |
| `TASK-144` JWT 鉴权层（tower-http ValidateRequestHeader） | P1 | 1-2天 |
| `TASK-145` WorkflowType::Parallel（fan-out/join） | P1 | 2-3天 |
| `TASK-146` Schema 版本迁移系统 | P1 | 2天 |
| `TASK-147` 补全 PR 生命周期 API（/prs/* 三条路由） | P2 | 1-2天 |
| `TASK-148` 向量搜索 / RAG（sqlite-vec 或 tantivy） | P2 | 5-7天 |
| `TASK-149` 补全 12 个缺失 CLI 命令 | P2 | 5-7天 |
| `TASK-150` Warm Standby Master | P2 | 3-5天 |
