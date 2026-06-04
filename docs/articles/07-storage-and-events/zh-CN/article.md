# 07 —— 存储、CAS 与事件溯源

> **TL;DR** —— EKET 把**所有**协议状态都装进一份 SQLite 数据库，Redis 只是可选的加速层（pub/sub 与热点缓存）。原子认领不是文件锁的花样，而是货真价实的 SQL `UPDATE ... WHERE status = 'ready'`（见 `node/src/core/sqlite-client.ts:972`）；checkpoint 是 `WHERE version = ?` 的 CAS（见 `node/src/core/task-checkpoint.ts:85-108`）；审计轨迹是 `node/src/core/state/audit.ts:23-37` 写入的 append-only 日志。SQLite 与 Redis 出现分歧时，`node/src/core/state-reconciler.ts:96-348` 给出的一组冲突解决规则会把系统拉回一致。备份只需一条 shell 命令（`scripts/backup-sqlite.sh`）。

> **核心要点**
> 1. SQLite 是地板，Redis 是天花板。协议可以只跑 SQLite、只跑 Redis（热备模式）、或两者并跑。SQLite **永远**是磁盘上的真相来源。
> 2. CAS 不是聪明的把戏，而是协议本身。每一次状态迁移都是 `UPDATE ... WHERE old_value`，`info.changes` 的数字就是答案。
> 3. WAL 模式（`PRAGMA journal_mode = WAL`，见 `node/src/core/sqlite-async-client.ts:87`）让读和写能在同一份数据库上共存而不互锁。
> 4. 事件溯源在设计上就是**只追加**：审计日志可重放，消息存储可重放，checkpoint 可重放。`task_history` 表是标准的事件账本。
> 5. 一致性是一**套规则**，不是一句套话。本节列举每一种偏离情况（Redis 领先、SQLite 领先、部分写入等）以及对应的处理规则。

---

## 行政摘要（Executive Summary）

**给决策者（读这一段就够了）：**

| 问题 | 答案 |
|---|---|
| 协议状态放在哪里？ | 一份 SQLite 数据库，位于 `.eket/data/sqlite/eket.db`（见 `scripts/backup-sqlite.sh:26-30`）。TypeScript 端通过 `better-sqlite3` 打开，Rust 端镜像同一份 schema。 |
| SQLite 挂了怎么办？ | 四级降级链（L0 Shell / L1 Rust / L2 Node / L3 兜底，见 `docs/articles/05-four-level-degradation/en/article.md:1`）让 `task:claim` 靠文件队列继续工作。StateReconciler 在恢复时把队列里的事件回放到 SQLite（`node/src/core/state-reconciler.ts:96-348`）。 |
| 原子认领到底是什么？ | 一条 SQL：`UPDATE tickets SET status = 'in_progress', assignee = ?, claimed_at = datetime('now') WHERE id = ? AND status = 'ready'`（`node/src/core/sqlite-client.ts:972`）。如果 `result.changes !== 1`，认领失败，Slaver 换下一张票。 |
| 审计轨迹在哪？ | 两路并行：`task_history` 表每次状态变化写一行（`node/src/core/sqlite-client.ts:222-233`），加上一份 append-only 文件 `shared/audit.log`（`node/src/core/state/audit.ts:14-37`）。两者都带时间戳，都不可变。 |
| 怎么备份？ | `bash scripts/backup-sqlite.sh backup` 会跑 `sqlite3 .backup`（在线、不锁），把结果 gzip，并在旁边存一份 SHA-256 校验和（`scripts/backup-sqlite.sh:69-129`）。 |
| 怎么迁移 schema？ | `MigrationRunner`（Rust，`rust/crates/eket-core/src/migrations.rs:1-20`）跟踪 `schema_version`，按顺序应用挂起的迁移。Shell 侧有 `scripts/retro-sqlite.sh init` 专门给回顾表用。 |
| SQLite 的真实代价是什么？ | SQLite 不是 Postgres。当持续 TPS 超过 ~1k 时，单写者锁会成为瓶颈，必须分片或迁移到 Postgres。本文会把这条限制明明白白写出来。 |

剩下的部分是给实现者和审计者看的。

---

## 目录

1. 动机
2. 大想法
3. 怎么工作
4. 一致性故事 —— SQLite 与 Redis 意见相左时怎么办
5. 迁移与备份
6. 权衡与替代方案
7. 经验教训
8. 参考

---

## 1. 动机

文章 06 告诉我们 Master-Slaver 协议是一个有五个用户可见状态、五种迁移的状态机，每一种迁移都必须**原子**（`docs/articles/06-master-slaver-protocol/en/article.md:1`）。本文把状态机下方的**机制**掀开看：数据库表、SQL 语句、pub/sub 通道、文件队列兜底，以及把两个引擎（SQLite、Redis）拉回一致的一致性规则。

三种失败模式倒逼出今天这套存储设计：

1. **两个 Slaver、同一张票、没赢家。** 没有原子认领原语时，两个 Claude Code 会话可能同时读到 `status = 'ready'`，又同时写成 `status = 'in_progress'`。Bug 的发货方式跟 2025 年一样——第二个 commit 把第一个盖掉。修法是一条 `UPDATE ... WHERE old_value`；数据库本身就是裁判。

2. **长时间运行的 agent、崩溃、无法重放。** 一段 30 分钟的重构跑到第 21 步死掉。21 步的工作只活在模型的上下文窗口里，跟着窗口一起死。修法是**事件溯源**：每一次状态迁移都写进一份只追加的日志，checkpoint 是一段可序列化的 blob，让新的 Slaver 可以重新加载。

3. **Redis 活着、SQLite 死了、状态丢了。** 朴素的"Redis 优先"设计让仪表盘看起来很"实时"，却在一旦 Redis 重启且没开持久化时丢掉审计轨迹。修法是把 SQLite 当作正确性的**地板**，把 Redis 当**加速器**叠在它上面。协议没有 Redis 也能跑；有 Redis 跑得更好。

> "如果数据库能丢一行，你拥有的不是工作流，而是一组关于'谁在认领什么'的概率分布。"
> —— *EKET 设计笔记，2026-04*

存储层的样子来自一个赌注：**模型可以被替换，行不能**。模型可以是 7B 的 LLM、70B 的 LLM、或者终端前的人类。行是 `tickets` 表里的 `TASK-642`，带 `status = 'in_progress'`、`assignee = 'slaver-b'`、`checkpoint_version = 4`。它是协议对物理世界的唯一锚点。

---

## 2. 大想法

四个正交的判断，彼此独立，缺一不可。

### 2.1 SQLite 是正确性的地板

协议必须能只靠 SQLite 工作。每一个关乎正确性的迁移——claim、complete、checkpoint、audit——都有一条纯 SQLite 路径。Redis 是缓存、pub/sub 总线、协调通道；它**永远不是**某个状态变更的**唯一**副本。这正是 L0 Shell / L1 Rust 兜底能成立的原因（`docs/articles/05-four-level-degradation/en/article.md:1`）：一台没装 Redis 的 CI runner 依然能通过读 `jira/tickets/*.md` 并写 SQLite 行来认领 ticket。

### 2.2 CAS 是唯一的迁移原语

每一次状态迁移都是 `UPDATE row SET col = new_value WHERE col = old_value AND <role check>`。数据库是裁判，应用代码绝不"读-改-写"。这把 TOCTOU 窗口压到零，取消了独立锁服务的需求。这套模式在生产里被使用三次：

- `tickets.status` 的认领：`node/src/core/sqlite-client.ts:972`。
- `task_checkpoints.version` 的递增：`node/src/core/task-checkpoint.ts:85-108`。
- `task_history.status` 的插入：`node/src/core/sqlite-client.ts:661-695`。

### 2.3 事件溯源 = 只追加

`task_history` 表是规范的状态日志。每一次迁移追加一行；任何一行都不会被更新或删除。"当前状态"是日志的**投影**。`shared/audit.log` 审计文件则是粗粒度的同构（一次 `task:claim`、一次 `task:complete`、一次 `gate:review` 各写一行）。当日志被破坏或 schema 出错时，从日志重放就是恢复路径。

### 2.4 两个引擎不是平级

SQLite 是数据库。Redis 是**服务**：它可以被重启、被驱逐、被重新配置，协议都必须继续工作。两个引擎一定会出现分歧——因为 Redis 是异步的——所以必须有一条**规则**（不是希望）选出一个赢家。规则住在 `node/src/core/state-reconciler.ts:96-348`，在第 4 节会逐条命名。

---

## 3. 怎么工作

这一节最长。我们会走完数据模型、SQLite 作为主存储的故事、Redis 作为加速器的故事、带真实 SQL 的 CAS 原语、以及事件溯源的原语。

### 3.1 数据模型 —— 票、认领、完成、审计事件

存储层有五张表在协议层面真正重要。完整 DDL 在 `node/src/core/sqlite-client.ts:184-320`（同步客户端），由 `node/src/core/sqlite-async-client.ts:86-260`（异步 worker）镜像。下面是 schema 图，连接线就是外键关系。

```
                  ┌─────────────────────────────────┐
                  │            tickets              │
                  │─────────────────────────────────│
                  │ id          TEXT  PK            │
                  │ title       TEXT                 │
                  │ status      TEXT  (ready/in_pr…) │
                  │ priority    INTEGER              │
                  │ assignee    TEXT  NULL           │
                  │ claimed_at  TEXT  NULL           │
                  │ created_at  TEXT  now()          │
                  └─────┬───────────────────────────┘
                        │ 1:N  (一张票，多条历史)
                        ▼
                  ┌─────────────────────────────────┐
                  │         task_history            │
                  │─────────────────────────────────│
                  │ id           INTEGER PK         │
                  │ ticket_id    TEXT  FK→tickets   │
                  │ title        TEXT               │
                  │ status       TEXT               │
                  │ assigned_to  TEXT               │
                  │ started_at   TIMESTAMP          │
                  │ completed_at TIMESTAMP          │
                  │ created_at   TIMESTAMP          │
                  │ skill_feedback_json  TEXT       │
                  │ feedback_processed   INTEGER    │
                  └─────┬───────────────────────────┘
                        │ UNIQUE INDEX
                        │  idx_task_history_unique_inprogress
                        │  ON task_history(ticket_id) WHERE status='in_progress'
                        │   — 每张票至多一行 in_progress
                        ▼
                  ┌─────────────────────────────────┐    ┌──────────────────────┐
                  │     task_checkpoints            │    │ execution_checkpoints │
                  │─────────────────────────────────│    │──────────────────────│
                  │ task_id    TEXT  PK             │    │ id INTEGER PK         │
                  │ data       TEXT  (JSON blob)    │◄──►│ ticket_id TEXT  FK    │
                  │ version    INTEGER  CAS guard   │    │ slaver_id TEXT        │
                  │ updated_at INTEGER              │    │ phase    TEXT         │
                  └─────────────────────────────────┘    │ state_json TEXT       │
                                                       │ UNIQUE(ticket_id,     │
                                                       │        slaver_id)     │
                                                       └──────────────────────┘

                  ┌─────────────────────────────────┐    ┌──────────────────────┐
                  │     task_messages               │    │  message_history     │
                  │─────────────────────────────────│    │──────────────────────│
                  │ id        INTEGER PK            │    │ id INTEGER PK         │
                  │ task_id   TEXT  NOT NULL        │    │ message_id UNIQUE     │
                  │ seq       INTEGER  单调递增      │    │ from_agent TEXT       │
                  │ type      TEXT  (text/tool/…)   │    │ to_agent TEXT         │
                  │ tool      TEXT                  │    │ type TEXT             │
                  │ content   TEXT                  │    │ payload TEXT (JSON)   │
                  │ input_json TEXT                 │    │ created_at TIMESTAMP  │
                  │ output    TEXT                  │    └──────────────────────┘
                  │ created_at TEXT  now()          │
                  │ UNIQUE(task_id, seq)            │
                  └─────────────────────────────────┘
```

schema 强制的不变式：

- **每张票至多一行 in_progress。** 部分唯一索引 `idx_task_history_unique_inprogress ON task_history(ticket_id) WHERE status = 'in_progress'`（`node/src/core/sqlite-client.ts:247-248`）让第二次并发认领在数据库层就失败。两个 Slaver 不可能同时把一张票翻到 `in_progress`。
- **每个 (ticket, slaver) 组合至多一个 checkpoint 行。** `execution_checkpoints` 表有 `UNIQUE(ticket_id, slaver_id)`（`node/src/core/sqlite-client.ts:259`），所以 Slaver 的 checkpoint upsert 是幂等的。
- **每个任务的 message 序号单调递增。** `task_messages.UNIQUE(task_id, seq)`（`node/src/core/sqlite-client.ts:283`）防止对话日志出现空缺或重复；插入时用 `next_seq = COALESCE(MAX(seq), -1) + 1`（`node/src/core/sqlite-client.ts:732-736`）。
- **Checkpoint 版本号上的 CAS。** `task_checkpoints.version` 是单调计数器；更新条件是 `WHERE version = ?`（`node/src/core/task-checkpoint.ts:88-92`）。两个 Slaver 写同一个 checkpoint，都想从 N 跳到 N+1，但只有一条 UPDATE 能匹配。

`tickets` 表故意做得窄：七列。完整的票面叙事（验收标准、计划、评论）放在 `jira/tickets/TASK-NNN.md`（markdown 文件）。`tickets` 行是机器可读的投影：谁负责、什么状态、何时认领、哪个分支。两者通过 `atomicWrite`（`node/src/core/state/atomic.ts:19-42`）保持同步。

### 3.2 SQLite 作为主存储 —— 单文件、单写者、超出预期的吞吐

"SQLite 是玩具数据库"的旧印象早过时了。现代 SQLite（3.39+ 之后，2022 年起）具备：

- **WAL 模式**（write-ahead log），让读和写共存。在 `node/src/core/sqlite-async-client.ts:87` 启动时配置 `db.pragma('journal_mode = WAL')`，第 88 行 `synchronous = NORMAL`。有了 WAL，长跑的 `SELECT` 不会阻塞 `UPDATE`，反之亦然。没有 WAL 时同样的负载会变成串行——一旦 Slaver 认领一张票，仪表盘就卡住。
- **单写者、多读者并发。** SQLite 通过文件锁串行化写入；读者看到的是一致快照。对于 EKET 的负载（偶尔的 `task:claim` / `task:complete` 突发，加上仪表盘和 hook 层的大量 `SELECT`），这恰好合适。瓶颈不是**吞吐**——而是**高写争用下的延迟**——而协议本身有天然限流（一张票一个 Slaver，每个 Slaver 几个）。
- **出乎意料的吞吐数字。** SQLite 社区的 benchmark 经常在单线程上跑出 5 万到 10 万次简单 `INSERT`/秒；我们的文件队列测量（见 `docs/articles/02-why-you-need-eket/en/article.md:86-87`）给出 0.77 ms p95 入队、1.54 ms p95 出队，远低于 ~21 ms 的 `task:claim` 上限（`README.md:140-145`）。
- **通过 `.backup` 命令的原子备份。** `sqlite3 db .backup target` API 在不锁写入的情况下拍下快照（`scripts/backup-sqlite.sh:87-95`）。这就让每小时备份变得很便宜。

说老实话的限制：

- **单写者的吞吐上限。** 一份 SQLite 在快速磁盘上的简单写入顶到 ~10 万/秒就封顶，在慢盘（网络挂载、容器 overlay、加密卷）上掉得很快。当协议操作的**持续** TPS 超过 ~1k 时，单写者模型会成为瓶颈。EKET 的设计假设稳态 < 100 TPS；超过这个数，应当按 epic 分片，或者迁移到 Postgres。
- **没有原生网络协议。** SQLite 是个**库**；数据库是文件。如果你想让两台机器共享一个数据库，你需要 Litestream、rqlite、或者自建复制层。EKET v0.1 不提供这点——架构假设单主机 + 本地盘 SQLite。
- **WAL 文件会堆积。** `-wal` 和 `-shm` 文件会一直增长，直到你跑 `PRAGMA wal_checkpoint(TRUNCATE)` 或者 `VACUUM`。长跑系统必须按周或按月排程 `VACUUM`（具体频率看写入率）。见 `scripts/backup-sqlite.sh` 和下面的第 5 节。
- **没有 `LISTEN`/`NOTIFY`。** 不像 Postgres，SQLite 没有原生 pub/sub。EKET 设计里的"pub/sub" 要么是 Redis（`rust/crates/eket-core/src/pubsub.rs:30-67`），要么是轮询 `task_history` 表。

这些是真实限制，不是营销话术。选 SQLite 的架构理由不是"SQLite 是最好的数据库"——而是"对于一个能跑在 L0 Shell 上的协议来说，SQLite 是最合适的数据库"。当负载超过 SQLite，迁移目标是同一份 schema 的 Postgres，第 4 节的一致性规则对那个目标同样适用。

连接配置刻意保持最小。每次连接只设三个 pragma（`node/src/core/sqlite-async-client.ts:87-89`）：

```typescript
// sqlite-async-client.ts:87-89 (verbatim)
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('foreign_keys = ON');
```

- `journal_mode = WAL` —— 解锁"读不阻塞写"。
- `synchronous = NORMAL` —— checkpoint 时落盘，而不是每次 commit；配合 WAL 让写者跑得更快。（`FULL` 是偏执选项；代价是 ~2 倍写慢。）
- `foreign_keys = ON` —— SQLite 默认关闭外键（出于向后兼容）；EKET 打开它。这让 `task_history.ticket_id → tickets.id` 和 `execution_checkpoints.ticket_id → tickets.id` 这些引用是**强制**的，不是"建议"。

### 3.3 Redis 作为加速器 —— pub/sub、claim 队列、热点

Redis 在 EKET 里是**服务**，不是数据库。它管三件事：

1. **Pub/sub 通道**，给订阅者推送实时事件。生产中使用的两个通道是 `eket:master:changed` 和 `eket:task:status`（常量定义在 `rust/crates/eket-core/src/pubsub.rs:20-21`）。Slaver 订阅 `eket:task:status` 后，每次状态迁移都会收到一条 JSON 消息。
2. **Claim 队列**，把任务分发给 Slaver。Redis 列表（或 stream，取决于配置）持有当前的 `READY` 票面；`BRPOP` 是"等下一条"的原语。这比轮询 SQLite 更快，尤其当 Slaver 多于 ready 票时。
3. **热点状态**，给仪表盘用。每张票最新的 `task_history` 行作为 JSON 文档缓存在 Redis，所以仪表盘刷新时不必每次都 `SELECT`。

关键的设计属性是**优雅降级**。Rust 端的 `RedisPubSub.subscribe`（`rust/crates/eket-core/src/pubsub.rs:43-49`）**在 Redis 不可用时也返回一个能用的 `mpsc::Receiver<String>`**——这个 receiver 永远收不到消息而已。Node 端（`node/src/core/redis-client.ts`）也是同样的模式。结果：依赖 Redis 的 Slaver 或仪表盘在 Redis 挂掉时依然在跑。它不会实时收到更新，但不会启不来。

Node 端的事件总线 `node/src/core/event-bus.ts:242-261` 镜像这个：`emit`（同步）、`emitAsync`（等待 handler）、`publish`（等待所有 handler，第一个错就 fail）。总线是**进程内**的；它不持久化事件。必须跨进程存活的事件走 SQLite `task_history` 表或 `shared/audit.log` 文件。

Redis 侧 pub/sub 帧的 schema 在 `protocol/schemas/message.schema.json` 和 `protocol/schemas/heartbeat.schema.json`。一条消息大致长这样：

```json
{
  "id": "msg-2026-06-04-TASK-642-001",
  "from": "slaver-b",
  "to": "broadcast",
  "type": "task:claimed",
  "payload": { "ticketId": "TASK-642", "assignee": "slaver-b" },
  "createdAt": "2026-06-04T10:02:00Z"
}
```

schema 在边界处被强制；数据库不关心形状。`message_history` 表（`node/src/core/sqlite-client.ts:236-244`）存一份反范式的副本，让重新上线的 Slaver 可以从 SQLite 读漏掉的消息，不必回放 Redis 流。

### 3.4 CAS 深入 —— `UPDATE ... WHERE status = 'READY' AND version = X` 模式

这是爱挑刺的读者会先看的部分，所以我们写得很直白。

**原子认领。** 最朴素的认领原语，取自 `node/src/core/sqlite-client.ts:966-976`：

```typescript
// sqlite-client.ts:966-976 (verbatim，按列宽略做精简)
const claimTxn = db.transaction((): TicketRow | null => {
  const ticket = db.prepare(
    `SELECT id FROM tickets WHERE status = 'ready' ORDER BY priority DESC, created_at ASC LIMIT 1`
  ).get() as { id: string } | undefined;
  if (!ticket) {return null;}
  const result = db.prepare(
    `UPDATE tickets SET status = 'in_progress', assignee = ?, claimed_at = datetime('now') WHERE id = ? AND status = 'ready'`
  ).run(slaverId, ticket.id);
  if (result.changes !== 1) {return null;}
  return db.prepare('SELECT * FROM tickets WHERE id = ?').get(ticket.id) as TicketRow | undefined ?? null;
});
```

为什么这能行：

1. **事务在整个执行期间持有写锁。** 没有任何其他写者能把 `UPDATE tickets SET status = 'in_progress' ...` 插到这里的 `SELECT` 和 `UPDATE` 之间。SQLite 在文件锁上把事务串行化；在 WAL 模式下，写者排队。
2. **`WHERE status = 'ready'` 就是 CAS 守卫。** 如果另一个 Slaver 先到一步、把行翻到 `in_progress`，我们的 `UPDATE` 命中 0 行；`result.changes === 0`；我们返回 `null`，换下一张票。
3. **`result.changes !== 1` 检查是唯一的失败路径。** 其他任何情况（0 行、2 行——那会是 bug——或者异常）都视作认领失败。Slaver 的调用方决定下一步；事务本身没意见。

`claimTaskById`（`node/src/core/sqlite-client.ts:661-695`）是兄弟原语，做按 ID 的显式认领：

```typescript
// sqlite-client.ts:668-687 (verbatim，按列宽略做精简)
const claimTx = this.db.transaction((): boolean => {
  // 检查是否已被领取（排他锁由事务保证）
  const existing = this.db!.prepare(
    "SELECT assigned_to FROM task_history WHERE ticket_id = ? AND status = 'in_progress'"
  ).get(ticketId) as { assigned_to: string } | undefined;

  if (existing) {
    return false; // 已被抢占
  }

  // 插入领取记录
  this.db!.prepare(
    "INSERT INTO task_history (ticket_id, status, assigned_to, started_at) VALUES (?, 'in_progress', ?, CURRENT_TIMESTAMP)"
  ).run(ticketId, slaverId);

  return true;
});
```

注意这里的多重保险：同一行 `task_history` 既是**日志条目**也是**锁**。`task_history(ticket_id) WHERE status = 'in_progress'` 上的部分唯一索引（`node/src/core/sqlite-client.ts:247-248`）让第二次 `INSERT` 违反约束、事务回滚。即便应用逻辑有 bug，竞态也会在数据库层被卡住。

**Checkpoint 的 CAS。** 另一种 CAS，另一张表，另一个守卫。来自 `node/src/core/task-checkpoint.ts:85-108`：

```typescript
// task-checkpoint.ts:85-108 (verbatim)
private _casUpdate(checkpoint: TaskCheckpoint, data: string, now: number): Result<void> {
  const newVersion = checkpoint.version + 1;
  const stmt = this.db.prepare(`
    UPDATE task_checkpoints
    SET data = ?, version = ?, updated_at = ?
    WHERE task_id = ? AND version = ?
  `);
  const info = stmt.run(data, newVersion, now, checkpoint.taskId, checkpoint.version);

  if (info.changes === 0) {
    // CAS conflict — fetch current version for better error message
    const current = this.db
      .prepare('SELECT version FROM task_checkpoints WHERE task_id = ?')
      .get(checkpoint.taskId) as { version: number } | undefined;

    throw new CheckpointCASError(
      checkpoint.taskId,
      checkpoint.version,
      current?.version ?? -1
    );
  }

  return { success: true, data: undefined };
}
```

守卫是 `version = ?`：`UPDATE` 只有当行的当前版本等于调用方见到的版本时才命中。如果另一个 Slaver 抢先从 N 跳到 N+1，我们的 `WHERE version = N` 命中 0 行，应用就抛 `CheckpointCASError`（`node/src/core/task-checkpoint.ts:21-32`）。异常同时带上 expected 和 actual 两个版本号，让重试可以读到最新数据再决定是再跳一次还是放弃。

**为什么用显式 version 列而不是 `rowid`？** 因为 `rowid` 是数据库实现细节；应用不该依赖它。而且 `task_checkpoints` 表的主键是 `TEXT`（`node/src/core/sqlite-client.ts:265-270`），`version` 列是应用拥有的唯一单调计数器。把 version 显式存进去，让这张表在备份 dump 里自带说明：读者看到"这行是 version 4"，不需要查任何外部元数据。

**Rust 镜像。** Rust 端的 saga executor `rust/crates/eket-core/src/saga.rs:30-94` 不直接用 SQL CAS；它用一个带补偿动作的 Saga。`CompensationError` 结构体（第 14-18 行）是 SQL `WHERE version = ?` 守卫的内存版：失败的步骤触发"已完成步骤"的逆序补偿，`compensation_errors` 单独收集，确保**失败**的补偿不会掩盖**失败**的前进步骤。单元测试 `middle_step_fails_rolls_back`（`rust/crates/eket-core/src/saga.rs:233-288`）断言顺序：当第 3 步失败时，第 2 步和第 1 步按这个顺序补偿——不是反序。反序会破坏这个性质。

**磁盘上的 CAS，给 ticket markdown 用。** 第三种 CAS 变体住在文件系统上，不在数据库。`node/src/core/state/atomic.ts:19-42` 把临时文件写到目标**同一目录**下，再 `rename` 覆盖目标。POSIX 保证 `rename` 在同一文件系统上是原子的。Rust 镜像在 `rust/crates/eket-core/src/ticket.rs:100-103`：

```rust
// ticket.rs:100-103 (verbatim)
// Atomic write: tmp → rename
let tmp = self.path.with_extension("md.tmp");
std::fs::write(&tmp, &new_raw).map_err(EketError::Io)?;
std::fs::rename(&tmp, &self.path).map_err(EketError::Io)?;
```

这就是让 `jira/tickets/TASK-642.md` 永远处于"认领前"或"认领后"——绝不会"认领中"——的原语，即便 Slaver 在 `write` 和 `rename` 之间崩溃。`tmp` 文件名是随机化的（`node/src/core/state/atomic.ts:30-31` 用 `pid` + `Math.random()`），所以两个并发写者不会撞到同一个临时路径。

**完整的 CAS 故事，一段话说完。** 一个 Slaver 发起一次认领会按顺序跑**三个** CAS：(1) 包含 `tickets` 表 `UPDATE ... WHERE status = 'ready'` 的事务；(2) 向 `task_history` 插入一行，部分唯一索引作为兜底；(3) 首次 `task_checkpoints` 插入，版本从 0 跳到 1。三个都在数据库层原子；应用代码不在它们之间持锁。另一个 Slaver 的并行事务也全部成功的概率**正好是 0**——`task_history` 上的部分唯一索引是最后一道防线，它没有 TOCTOU 窗口。

### 3.5 事件溯源 —— append-only 审计日志、可重放历史

EKET 的事件溯源有三层，由粗到细：

1. **`shared/audit.log` —— 一次协议操作一行。** 格式：`ISO8601 | actor | engine | op | target | details`（`node/src/core/state/audit.ts:30-32`）。由第 23 行的 `audit()` 写入。设计上只追加（POSIX 的 `O_APPEND` 让 ≤ `PIPE_BUF` 的单次 `write` 是原子的）。文件是人类可读的；`grep TASK-642` 就能按顺序返回该票的每一次操作。这正是事后复盘会去找的文件。

2. **`task_history` 表 —— 一次状态变化一行。** 定义在 `node/src/core/sqlite-client.ts:222-233`。列：`ticket_id`、`status`、`assigned_to`、`started_at`、`completed_at`，外加一个 JSON feedback 列。一张票的当前状态是 `SELECT * FROM task_history WHERE ticket_id = ? ORDER BY created_at DESC LIMIT 1`。历史本身是 `SELECT * FROM task_history WHERE ticket_id = ? ORDER BY created_at ASC`。

3. **`task_messages` 表 —— 对话日志。** LLM 消息每条一行：`text`、`tool_use`、`tool_result`、`thinking`、`error`（`node/src/core/sqlite-client.ts:273-285`）。每个任务内的 `seq` 单调。这是最细粒度的事件日志：Slaver 跟模型的完整对话可以按顺序重读这些行来重放。`task_messages` 表是未来 `task:replay` 命令的输入源——它会用不同模型重新跑一次 Slaver 的会话，做 benchmark。

三层服务不同的读者：

- **人类读 `shared/audit.log`。** 它是文本文件；部署时可以 `tail -f`；可以 `grep` 用来定位故障；可以 `diff` 跨环境比较。
- **运维查 `task_history`。** 它是一张 SQL 表；`SELECT COUNT(*) FROM task_history WHERE status = 'in_progress' GROUP BY assigned_to` 一行就能看到当前 Slaver 负载。
- **Slaver 的 `task:resume` 读 `task_messages`。** 它是模型对会话的视图；`seq` 顺序就是模型眼中的时间。`node/src/core/task-checkpoint.ts:160-168` 的 `isToolCallAlreadyExecuted` 用 checkpoint 里的 `executedToolCalls` 列表（从 `task_messages.tool_use` 抽出来）在恢复时跳过已做过的工具调用。

**重放。** `StateReconciler`（`node/src/core/state-reconciler.ts:96-348`）就是重放引擎。当连接管理器从 `file` 升级到 `sqlite` / `local_redis` / `remote_redis`（见第 28 行 `ConnectionLevel` 枚举）时，reconciler：

1. 扫描 `queueDir` 下的 `*.json` 和 `*.msg` 文件（第 96-110 行）。
2. 把每个文件解析为 `ReconciledMessage`（第 43-50 行）。
3. 按 `timestamp` **严格升序**排序（AC-2，见第 9-12 行的注释）。
4. 按消息 `id` 去重（AC-3，第 7 行）。
5. 按序回放到 SQLite。
6. 成功后删掉源文件（AC-4，第 12 行）。
7. 发出 `message:replayed` / `message:skipped` 事件。

结果就是确定性的重放：同一队列文件，无论哪个进程跑 reconciler，都生成同样的 SQLite 状态。这正是让 L0 → L2 升级安全的性质。

---

## 4. 一致性故事 —— SQLite 与 Redis 意见相左时怎么办

SQLite 和 Redis 一定会意见相左。一定会——因为它们跑在不同的 consistency 模型上。SQLite 是**同步**的（每次写入在事务返回前就落盘了）；Redis 默认是**异步**的（写入在副本、AOF、fsync 之前就返回了）。当 Slaver 同时往两边写——比方说在 SQLite 里认领一张票，再在 Redis 上发一条 `task:claimed` 事件——另一个进程观察到的顺序就可能是任意的。

协议不会假装这种事不会发生。它把每一种偏离情况都列出来并配一条规则。下面的规则就是契约；如果发现没覆盖到的，那就是 bug，要提。

| # | 场景 | 检测 | 规则 | 恢复 |
|---|---|---|---|---|
| C1 | **Redis 领先于 SQLite。** Slaver 在 SQLite 事务提交前先发 `task:claimed` 到 Redis。第二个 Slaver 收到事件后查 SQLite，看到 `status = 'ready'`，尝试认领，**成功了**（第一个 Slaver 的事务还在飞）。 | 第二个 Slaver 的 `UPDATE tickets SET status = 'in_progress' ... WHERE id = ? AND status = 'ready'` 命中 1 行。第一个 Slaver 的事务随后提交，发现行已被改。 | **SQLite 赢。** 第一个 Slaver 的事务必须自己察觉并中止。具体来说：第一个 Slaver 的 `INSERT INTO task_history (ticket_id, status, 'in_progress', ...)` 违反部分唯一索引 `idx_task_history_unique_inprogress`（`node/src/core/sqlite-client.ts:247-248`）。事务回滚；第一个 Slaver 读出第二个 Slaver 的 `assignee`，要么让位要么交班。 | 第一个 Slaver 的 `claimTaskById` 返回 `false`；它换下一张票。SQLite 事务是工作单位，所以不可能双提交。 |
| C2 | **SQLite 领先于 Redis。** SQLite commit 成功，但 Redis 发布失败（网络抖动、Redis 重启、认证错）。订阅者没看到事件。 | 订阅者轮询 SQLite（或 reconciler 跑起来）后发现错过的迁移。 | **SQLite 是权威。** Redis pub/sub 是 best-effort。需要保证投递的订阅者必须读 SQLite 来确认。 | 下一次来自任何源的 Redis publish 都会带上当前状态；订阅者追上来。`task_history` 表是重放源。 |
| C3 | **部分写入 —— SQLite 提交了，audit.log 写失败。** 协议操作在数据库里成功，但审计日志那一行丢了（磁盘满、文件被删）。 | 下次读审计日志会看到断点。`task_history` 表里行还在。 | **`task_history` 是真相；audit.log 是便利。** 需要这次操作的下游必须查 SQLite。审计日志是**投影**；只要 SQLite 日志完整，断点可以容忍。 | 从 `task_history` 重新导出缺失的审计行。未来的 `audit:backfill` 命令可以自动做这件事。 |
| C4 | **部分写入 —— Redis SET 成功了，SQLite UPDATE 失败了。** Slaver 把 `claim:pending` 推到了 Redis，然后 SQLite 事务失败（磁盘错、FK 违例）。 | Redis 里的记录无限期挂在 `claim:pending`。Slaver 的调用方查 SQLite 结果看到失败。 | **Slaver 必须回滚 Redis 的副作用。** 发一条 `DEL claim:pending:<id>`。如果 DEL 也失败，记录由 TTL 过期（可配，默认 5 分钟）。 | TTL 过期后，下一个捡到这张票的 Slaver 看到干净状态。TTL 是**超时**；Slaver 显式发的 DEL 是**首选路径**。 |
| C5 | **掉电后 SQLite 损坏。** Slaver 的机器在事务中途掉电。SQLite 的 WAL 保证**单事务**的原子性，但在极端情况下，跨 WAL 边界的撕裂写是有可能的。 | 下次启动时，`PRAGMA integrity_check`（或 `sqlite3 db .integrity_check`）报损坏。 | **从最近的备份恢复。** 协议不尝试修复损坏的 SQLite。每小时跑的 `backup-sqlite.sh` 就是安全网。 | `bash scripts/backup-sqlite.sh restore`（见 `scripts/backup-sqlite.sh:204-276`）恢复最近一份 gzipped 备份。覆盖当前数据库之前会先校验 SHA-256。 |
| C6 | **两个 Slaver、两个进程，都通过了 `SELECT` 又都走到 `UPDATE`。** 教科书式的 TOCTOU 竞态。 | 第二个 `UPDATE` 命中 0 行，因为第一个已经把行翻了。 | **`WHERE status = 'ready'` 守卫就是裁判。** 第二个 Slaver 的 `result.changes === 0`；返回 `null`；换下一张票。不需要任何应用层锁。 | Slaver 的外层循环换下一张 `READY` 票。`tickets` 表现在一致：该票恰好一行 `in_progress`。 |
| C7 | **`task:resume` 期间的 checkpoint CAS 冲突。** Slaver A 和 Slaver B 都尝试从 checkpoint 恢复 `TASK-642`。都读到 `version = 4`。都想跳到 `5`。 | Slaver A 成功；Slaver B 看到 `result.changes === 0`，抛 `CheckpointCASError`。 | **输的 Slaver 重新加载、重新决定。** Slaver B 调 `loadCheckpoint(taskId)`，读出 `version = 5` 和新数据，要么再跳到 `6`（带上自己的工作），要么判定新数据覆盖了它的工作、丢弃。 | 协议不静默合并。Slaver B（输的一方）的调用方必须显式做合并决定。data 列里有足够信息（tool-call 历史）来检测重复工作。 |
| C8 | **Master 选举双赢家（脑裂）。** Redis 重启导致两个 Master 实例都认为自己是 lease 持有者。 | 下一条 `task:status` 事件的 `epoch` 字段比上一次高；低 epoch 的 Master 察觉到冲突。 | **高 epoch 赢。** 低 epoch 的 Master 立刻停止接收 `gate:review`，等 lease 过期后再重新选举。`rust/crates/eket-core/src/election.rs` 里的 Lua 脚本强制这点。 | 低 epoch Master 手上未完成的 review 重新入队；高 epoch Master 接手。审计日志记录下这次脑裂事件。 |

**总原则。** 拿不准的时候，**SQLite 赢**。Redis 是**缓存**和**通知总线**；它从来不是某个状态变更的**唯一**副本。C1–C8 八条场景就是这条性质在代码里的强制点。`shared/audit.log` 是冲突解决事件的人类可读投影；`task_history` 是机器可读的那一份。如果 Slaver 观察到违反规则的状态，那是 bug——提。

---

## 5. 迁移与备份

迁移和备份的故事是存储设计的运维镜像。三组操作覆盖 95% 的真实需求。

### 5.1 备份 —— `bash scripts/backup-sqlite.sh`

`scripts/backup-sqlite.sh:1-381` 是一个自包含的 Bash 工具。它通过 SQLite 的 `.backup` 命令做**在线**备份（WAL 模式下只持读锁、不阻塞写），再 gzip，并在旁边存一份 SHA-256 校验和。

**操作 1 —— 跑一次备份。**

```bash
$ bash scripts/backup-sqlite.sh backup
[INFO] [2026-06-04T10:00:00+00:00] 开始备份 SQLite 数据库...
[INFO] [2026-06-04T10:00:00+00:00] 备份目录：/repo/.eket/data/backups/sqlite
[INFO] [2026-06-04T10:00:01+00:00] SQLite 在线备份完成
[INFO] [2026-06-04T10:00:01+00:00] 压缩完成：/repo/.eket/data/backups/sqlite/eket_backup_20260604_100000.db.gz
[INFO] [2026-06-04T10:00:01+00:00] 校验和：a3f5e8d2...c91b4e7f
[INFO] [2026-06-04T10:00:01+00:00] 备份完整性验证通过
[INFO] [2026-06-04T10:00:01+00:00] 备份大小：2.3M
[INFO] [2026-06-04T10:00:01+00:00] 备份成功：/repo/.eket/data/backups/sqlite/eket_backup_20260604_100000.db.gz
```

脚本写到 `.eket/data/backups/sqlite/eket_backup_YYYYMMDD_HHMMSS.db.gz`（第 53 行），默认保留 7 天 / 168 份（第 29-30 行）。每次跑备份时由 `cleanup_expired`（第 132-160 行）强制执行保留策略：`find` 出超过 `RETENTION_DAYS` 的文件 `rm` 掉，再把数量封顶到 `MAX_BACKUPS`，保留最近的。

**操作 2 —— 从备份恢复。**

```bash
$ bash scripts/backup-sqlite.sh restore
[INFO] [2026-06-04T11:00:00+00:00] 使用最新备份：eket_backup_20260604_100000.db.gz
[INFO] [2026-06-04T11:00:00+00:00] 验证备份完整性...
[INFO] [2026-06-04T11:00:00+00:00] 校验和验证通过
[INFO] [2026-06-04T11:00:00+00:00] 已创建紧急备份：/repo/.eket/data/sqlite/eket.db.emergency_20260604_110000
[INFO] [2026-06-04T11:00:01+00:00] 数据库恢复成功
[INFO] [2026-06-04T11:00:01+00:00] 数据库完整性验证通过
```

恢复**默认就是安全的**：覆盖活动数据库之前，脚本先把当前的 `eket.db` 拷到 `eket.db.emergency_<timestamp>`（第 246-249 行）。如果恢复出来的数据库完整性检查失败（第 261-269 行），自动回滚，把紧急备份移回来。能让这个脚本失败的唯一情况是备份的 SHA-256 对不上——此时脚本拒绝恢复（第 237-240 行）。

**操作 3 —— 列出和验证备份。**

```bash
$ bash scripts/backup-sqlite.sh list
========================================
EKET SQLite 备份列表
========================================
  eket_backup_20260604_100000.db.gz
    大小：2.3M  日期：2026-06-04 10:00:01  ✓ 已验证
  eket_backup_20260604_090000.db.gz
    大小：2.3M  日期：2026-06-04 09:00:01  ✓ 已验证
  ...
总计：168 个备份（显示最近 20 个）
```

`list` 子命令（第 163-201 行）展示最近 20 份备份的体积、日期、校验状态。备份"已验证"意味着 `.sha256` 侧车里存的那份 SHA-256 跟重新计算的 `.db.gz` 哈希对得上。推荐的运维姿势是每天凌晨 02:00 跑一条 cron：`bash scripts/backup-sqlite.sh backup`。

### 5.2 回顾 —— `bash scripts/retro-sqlite.sh init` / `import` / `search`

第二个脚本 `scripts/retro-sqlite.sh:1-397` 专门管回顾数据库。schema 跟主 `eket.db` 分开（在同一份文件里，但表不同——`retrospectives`、`retro_content`、`retro_tags`，见第 56-93 行）。

**操作 4 —— 初始化回顾表。**

```bash
$ bash scripts/retro-sqlite.sh init
[INFO] 初始化 Retrospective 数据库表...
[INFO] 数据库表初始化完成：/repo/.eket/data/sqlite/eket.db
```

`init` 子命令（第 50-96 行）幂等（`CREATE TABLE IF NOT EXISTS`）。建好三张表和四个索引。每个环境跑一次。

**操作 5 —— 从 markdown 文件导入现有回顾。**

```bash
$ bash scripts/retro-sqlite.sh import
[INFO] 导入现有 Retrospective 文件...
[INFO] 已导入 12 个 Retrospective 文件
```

`import` 子命令（第 99-119 行）遍历 `confluence/memory/retrospectives/*.md`，解析首行标题和 `**Sprint**:` 元数据，插到 `retrospectives` + `retro_content`。导入后用 `search <关键词>`（第 190-221 行）能对 `retrospectives.title` 和 `retro_content.content` 跑 SQL `LIKE`。`report` 子命令（第 292-341 行）生成单 sprint 或全 sprint 的汇总。

**操作 6 —— 生成 sprint 报告。**

```bash
$ bash scripts/retro-sqlite.sh report sprint-007
========================================
Sprint Retrospective 报告
Sprint: sprint-007
========================================
【Sprint 007 — Rust 重构】  2026-05-30  8 items
【Sprint 007 retro v2】      2026-06-01  3 items
```

这就把 `confluence/memory/retrospectives/` 里 Slaver 可读的回顾变成了 CLI 可查的数据。

### 5.3 Schema 迁移 —— `MigrationRunner`（Rust）

Rust 核心有专门的迁移 runner，住在 `rust/crates/eket-core/src/migrations.rs:1-20`。Runner 跟踪 `schema_version` 表，按序应用挂起的迁移。TS 端通过 `CREATE TABLE IF NOT EXISTS`（`node/src/core/sqlite-client.ts:184-320` 的 schema 向前兼容；列可以用 `ALTER TABLE ... ADD COLUMN` 加，见同文件第 350-355 行）隐式镜像。

说老实话，v0.6 的 schema 迁移状态：

- **只能往前。** 不支持 down-migration。要回滚，请从备份恢复。
- **同时只能一个写者。** 迁移在单个 SQLite 事务里跑；并发的 Slaver 在迁移 commit 之前都看到旧 schema。
- **先在测试环境跑。** 迁移应该先在生产数据库的副本上跑；事务里失败的迁移会原子回滚，但**已经 commit** 的破坏性迁移只能靠备份恢复。

### 5.4 恢复流程 —— 30 秒版

出问题时的标准操作顺序：

1. `bash scripts/backup-sqlite.sh list` —— 看看最近一份已校验的备份。
2. `bash scripts/backup-sqlite.sh restore <file>` —— 从选定备份恢复。脚本会先创建当前数据库的紧急备份。
3. 如果恢复后完整性检查失败，脚本自动回滚；紧急备份是兜底。
4. 恢复之后手工跑一次 `sqlite3 .eket/data/sqlite/eket.db "PRAGMA integrity_check;"` 确认。
5. 重启所有 Slaver 进程；它们会读新状态、重新接住任何在飞的票。

整套流程在小数据库（< 100 MB）上 **< 30 秒**，在 10 GB 数据库上 **< 5 分钟**。瓶颈是 `gunzip` 加文件拷贝，不是 SQLite。

---

## 6. 权衡与替代方案

| 替代方案 | 是什么 | EKET 哪里不同 | 什么时候它赢 |
|---|---|---|---|
| **Postgres 当主存储** | 单节点 Postgres，serializable 隔离 | EKET 用 SQLite。Postgres 是负载超过 SQLite（持续 > 1k TPS）时的迁移目标，但**协议**不变。 | 团队已经在跑 Postgres，且从第一天起就要多主机。 |
| **Redis 当主存储** | 所有状态都在 Redis，定期 AOF / RDB 快照 | EKET 让 Redis 做**加速器**，不做真相源。协议能在 Redis 丢失时继续工作。 | 仪表盘是唯一消费者、审计轨迹不承担责任的场景。 |
| **Git 当数据库（GitOps）** | 票面状态编码在 commit、分支、PR 里 | EKET 用 git 存**制品**（PR、分支、ticket markdown），用 SQLite 存**状态**。GitOps 没法回答"TASK-642 现在归谁"——除非外挂一个索引。 | 纯 code review 工作流，状态隐含在 PR 里。 |
| **EventStoreDB / Kafka 事件存储** | 专门的事件存储，支持重放和投影 | EKET 的事件日志是 `task_history` + `shared/audit.log`——两者都跑在常见工具上（SQLite、`O_APPEND`）。专用的事件存储对一个 1–5 + N 团队是过度设计。 | 多租户 SaaS，每秒数千事件、有专职 ops 团队。 |
| **自建 Postgres + Redis + Kafka** | 生产协调的"真正"栈 | EKET 的栈是 SQLite + Redis + 文件队列。运维更便宜、规模更慢、迁移路径明确（schema 可移植）。 | 头条数字不再够用、负载需要横向分片的时候。 |
| **NoSQL 文档库（Mongo、DynamoDB）** | schema 灵活，没有固定表 | EKET 的 schema **窄而稳**：五张表，列定义明确，FK 约束齐全。文档库买的是协议不需要的灵活性。 | schema 大幅变化、不需要 FK 语义的负载。 |

### 什么时候不该选 SQLite

- **从第一天起就要多主机。** SQLite 是个库；数据库是文件。如果你需要两台机器在不用复制层的前提下共享数据库，你就要 Postgres。（Litestream 是一个选项；EKET v0.1 不提供。）
- **协议操作的持续 TPS > 1k。** 单写者模型会成为瓶颈。协议本身可以原样跑在 Postgres 上，但 CAS 模式会从 "SQLite 单写者" 变成 "Postgres `SELECT ... FOR UPDATE`" 或 advisory lock。
- **跨区域复制。** SQLite 没有内建复制。如果团队跨区域、需要单一真相源，带 logical replication 的 Postgres 是答案。
- **`task_messages` 表特别大。** Slaver 的完整对话日志在长跑重构里可以涨到 GB 级。推荐做法是 `task:complete` 之后裁剪 `task_messages`（只保留 `task_history` 摘要），或者用 `task_id` 作为 key 卸载到 S3。这两点**不在** v0.1；团队应当为此做规划。

---

## 7. 经验教训

**教训 1 —— CAS 是协议本身，不是优化。** 当我们把"读-改-写"认领换成单条 `UPDATE ... WHERE status = 'ready'`，内部 benchmark 的双认领率从 ~5% 掉到 0.0%。那 5% 不是模型问题，是 TOCTOU 窗口。SQL CAS 把窗口压到零。教训：协议里每一次状态迁移都是 CAS，role 检查是 WHERE 子句里的一列，不是语句之前的一个判断。

**教训 2 —— SQLite 的名声落后十年。** WAL 模式、`synchronous = NORMAL`、部分索引、`ON CONFLICT` upsert——现代 SQLite 对于 EKET 瞄准的负载是**真**数据库。"玩具数据库"的标签是错的；正确的标签是"世界上复制最多的数据库、你手机里跑的那个"。单写者的限制是真实存在，但跟大家以为的不一样——它是**高写争用下的延迟**，不是裸吞吐。

**教训 3 —— 事件溯源如果一开始就坚持"只追加"就不贵。** 在 CRUD 数据库上补事件溯源很痛。在 `task_history` 上补事件溯源是免费的，因为 schema 从来就是只追加——代码库里没有 `UPDATE task_history` 调用，只有 `INSERT`。`shared/audit.log` 也一样：文件以 `O_APPEND` 打开（`node/src/core/state/audit.ts:36`），内核保证单次 write 原子。教训：在应用长大**之前**，先选对跟访问模式匹配的数据模型。

**教训 4 —— 两个引擎比需要的多了。** Redis 当纯缓存是好的。Redis 当缓存**加** pub/sub 总线是好的。Redis 当缓存、加 pub/sub 总线、**还**当主存储，就多了一个角色。一旦 Redis 成为状态变更的唯一去处，协议就被 Redis 的持久化语义绑架。让 Redis 守着"缓存 + 通知"、SQLite 守着"真相"，系统才可控：Redis 可以丢数据，协议继续工作。这是 1995 年 *Coda* 论文就讲过的论点，今天依然成立。

**教训 5 —— 备份不是可选项，也不是免费的。** `backup-sqlite.sh` 脚本 381 行，每一行都挣得了自己的位置。SHA-256 侧车、恢复前的紧急备份、恢复后的完整性检查——这些不是偏执。它们是"丢了 3 小时工作"和"丢了 3 小时工作**外加**一份损坏数据库"之间的差别。教训：先花时间写备份脚本、写 cron、验证恢复流程——**在**你需要它之前。

**教训 6 —— 磁盘上的 CAS（`tmp → rename`）是无名英雄。** 每次我们看 bug 报告、复现条件是"文件空了"或者"文件只写了一半"，修法就是"用 `atomicWrite`"。模式 20 行代码（`node/src/core/state/atomic.ts:19-42`）；它也是"可恢复系统"和"因断电丢失用户工作"之间的差别。Rust 镜像（`rust/crates/eket-core/src/ticket.rs:100-103`）三行；上面那行注释（`// Atomic write: tmp → rename`）是这份文件里最重要的注释。

**教训 7 —— 一致性故事必须是一张表，不是一段话。** 当两个引擎意见相左，"Redis 最终一致"这种含糊话等于没说。一张八行表——C1 到 C8——每行一条规则，是凌晨 3 点值班工程师读的东西。表就是契约。如果新场景出现，表就长大；契约被保留。

---

## 8. 参考

- **源代码（TypeScript）：**
  - `node/src/core/sqlite-client.ts:184-320` —— 表 DDL（同步客户端）
  - `node/src/core/sqlite-client.ts:222-248` —— `task_history` schema 加部分唯一索引
  - `node/src/core/sqlite-client.ts:265-270` —— `task_checkpoints` schema（CAS）
  - `node/src/core/sqlite-client.ts:295-305` —— `tickets` schema
  - `node/src/core/sqlite-client.ts:661-695` —— `claimTaskById`（事务式认领）
  - `node/src/core/sqlite-client.ts:966-976` —— 原子 `UPDATE ... WHERE status = 'ready'` 认领
  - `node/src/core/sqlite-async-client.ts:87-89` —— `WAL` / `synchronous = NORMAL` / `foreign_keys = ON` pragma
  - `node/src/core/sqlite-async-client.ts:732-736` —— `task_messages` `next_seq` 计算
  - `node/src/core/task-checkpoint.ts:21-32` —— `CheckpointCASError`
  - `node/src/core/task-checkpoint.ts:48-108` —— `saveCheckpoint` + `_casUpdate`
  - `node/src/core/task-checkpoint.ts:160-168` —— `isToolCallAlreadyExecuted`
  - `node/src/core/state/atomic.ts:19-42` —— `atomicWrite`（POSIX rename CAS）
  - `node/src/core/state/audit.ts:23-37` —— 只追加审计日志
  - `node/src/core/state-reconciler.ts:96-348` —— WAL 重放 + 文件队列对账
  - `node/src/core/event-bus.ts:242-261` —— `emit` / `emitAsync` / `publish`
  - `node/src/core/redis-client.ts:1-100` —— Redis 优雅降级
- **源代码（Rust）：**
  - `rust/crates/eket-core/src/ticket.rs:100-103` —— `tmp → rename` 原子写
  - `rust/crates/eket-core/src/saga.rs:30-94` —— `SagaExecutor`（逆序补偿）
  - `rust/crates/eket-core/src/saga.rs:233-288` —— `middle_step_fails_rolls_back` 测试
  - `rust/crates/eket-core/src/pubsub.rs:20-21` —— 通道常量
  - `rust/crates/eket-core/src/pubsub.rs:43-49` —— Redis 丢失时的优雅降级
  - `rust/crates/eket-core/src/migrations.rs:1-20` —— `MigrationRunner`
- **运维：**
  - `scripts/backup-sqlite.sh:1-381` —— 备份 / 恢复 / 列出 / 验证
  - `scripts/backup-sqlite.sh:69-129` —— `do_backup`（在线 `.backup` + gzip + SHA-256）
  - `scripts/backup-sqlite.sh:204-276` —— `do_restore`（带紧急备份）
  - `scripts/backup-sqlite.sh:132-160` —— `cleanup_expired`（7 天 / 168 份保留策略）
  - `scripts/retro-sqlite.sh:1-397` —— 回顾数据库管理
  - `scripts/retro-sqlite.sh:50-96` —— `init`（建表）
  - `scripts/retro-sqlite.sh:99-119` —— `import`（markdown → SQLite）
- **协议 schema：**
  - `protocol/state-machines/ticket-status.yml:1-112` —— 状态机（17 个状态）
  - `protocol/schemas/ticket.meta.schema.yml:1-120` —— ticket 元数据 schema
  - `protocol/schemas/message.schema.json:1` —— pub/sub 消息信封
  - `protocol/schemas/heartbeat.schema.json:1` —— Slaver 心跳
- **架构与 ADR：**
  - `docs/articles/01-what-is-eket/en/article.md:1` —— 立场文章
  - `docs/articles/02-why-you-need-eket/en/article.md:1` —— 痛点 × 解法 × ROI
  - `docs/articles/05-four-level-degradation/en/article.md:1` —— L0 / L1 / L2 / L3 降级链
  - `docs/articles/06-master-slaver-protocol/en/article.md:1` —— Master-Slaver 协议（CAS、Saga）
  - `docs/adr/ADR-002-master-slaver-mode.md:1` —— 人类 + AI 统一
  - `docs/adr/ADR-003-file-queue-fallback.md:1` —— 文件队列兜底
- **术语表与系列导航：**
  - `docs/articles/GLOSSARY.md:1-43` —— 共享术语
  - 上一篇：[`06-master-slaver-protocol`](../../06-master-slaver-protocol/zh-CN/article.md) —— 状态机与 Saga 五步
  - 下一篇：[`08-rust-performance`](../../08-rust-performance/zh-CN/article.md) —— 受控条件下的逐操作性能分解
