# 06 — Master-Slaver 协议：从领取到合并的有限状态机

> **TL;DR** — Master-Slaver 协议是一个把"收件箱里一堆需求"变成"持续合并的 PR 流"的**状态机**。它包含 **5 个用户可见状态**（READY / IN_PROGRESS / IN_REVIEW / DONE / RESUME）、**5 个转移**（claim / complete / review / merge / resume）、一个**原子领取**原语（SQLite CAS，见 `node/src/core/task-checkpoint.ts:48-108`），以及一个**Saga 五步完成**流程（validate → test → checkpoint → commit → notify）。该协议**对人和 AI 是一视同仁的**：一个人手动认领 ticket 与一个 Agent 调用 `eket task:claim TASK-642`，在数据库层面是完全等价的同一次状态转移。状态存于 SQLite（`protocol/state-machines/ticket-status.yml:1`），并不在模型里。

> **关键收获**
> 1. 状态机就是协议本身；其余的都是策略层。
> 2. CAS 把一个容易出现竞态的多 Slaver 环境，变成了可串行化的单写者故事。
> 3. Saga 模式让 `task:complete` 可恢复：任何一步失败系统都能补偿。
> 4. Master 永远不领取 ticket——这不是风格选择，是一项安全不变量。
> 5. 多 Master 与多 Slaver 不是边角案例；当团队人数 > 2 时，它们就是稳态。

---

## 决策者摘要

**一表读懂**：

| 问题 | 回答 |
|---|---|
| 协议是什么？ | 一个被实现一次、放在 SQLite 里、被人类 / AI Agent / CI 共同消费的 5 状态有限状态机。 |
| "领取"是什么？ | 对 ticket 行的一次原子 CAS；谁把它从 `READY` 翻成 `IN_PROGRESS`，谁就拥有这项工作，不容争辩。 |
| Slaver 在中途宕机怎么办？ | 一个被 checkpoint 的 RunState（`node/src/core/task-checkpoint.ts:38-193`）让新的 Slaver 通过 `eket task:resume` 从上一次持久化步骤继续。 |
| "领取动作不要求人在回路"是什么规则？ | Master 被**禁止**领取自己创建的 ticket。Master 自领取会让审计链失效，并使协议的"关注点分离"特性失效。 |
| 协议带来了什么收益？ | 可预测的吞吐：ticket → 分支 → PR → 评审 → 合并，每一步可恢复，每一次转移可审计。 |
| 协议的代价是什么？ | 你必须运行一个 SQLite 数据库（或一个文件状态回退方案），并遵守转移表。 |

下文面向实现者。

---

## 1. 动机：为什么我们必须把工作写成一个状态机

多人 + 多 Agent 同时推进一个仓库时，会出现三种典型的失控模式。我们将分别分析，然后展示状态机如何系统地避免它们。

### 1.1 失控模式 A：两个 Slaver 领取了同一个 ticket

在 ticket 系统中，最常见的失配是"重复领取"：Slaver A 看到了一个 READY 状态的 ticket，正准备动手，Slaver B 几乎同时看见了它，两个人都基于"我拥有它"开始写代码。结果：

- 两份不同的 `feature/TASK-642` 分支
- 两个 PR 引用同一个 ticket
- Master 在评审时面对的"应当合并哪一个？"是一个不存在答案的问题

这种失配源于"读取 → 决定 → 写入"这一常见三步的非原子性。在分布式系统里，这种问题被叫做 TOCTOU（time-of-check-to-time-of-use），几十年来已有标准解法：**用一次原子 CAS 把三步压成一步**。EKET 把这条标准解法落到 SQLite 一条 `UPDATE ... WHERE state='READY'` 上（见 §3.3）。

### 1.2 失控模式 B：Slaver 在 commit 之后、推送之前宕机

"我已经写完了代码"与"代码已经进入主分支"之间存在一段危险的窗口：本地 commit 成功，单元测试通过，CI 跑绿，PR 刚开——然后进程被 `OOM killer` 终结。这时 Master 看到的是一个奇怪的中间态：分支存在但 PR 没开、CI 链接为空、状态停留在 `IN_PROGRESS`。

为了让这种半成品可见、可恢复，协议要求把"完成"动作拆成 5 个有序步骤，任一步骤失败都可以从上一个 checkpoint 重试，而不是把"完成"当一个不可分的操作（详见 §3.4）。

### 1.3 失控模式 C：Master 自己动手实现

第三个失控模式更微妙：当 Master 自己领取了一个 ticket、自己写代码、然后自己点合并时，**审计链就断了**。reviewer 应该是谁？PR 应当对谁负责？如果实现质量出了问题，谁承担？

Master 与 Slaver 的角色分离，并不是为了制造官僚流程，而是为了让"提出需求的人"与"实现需求的人"在协议上保持独立。Master 自领取会同时削弱这二者的独立性（详见 §3.5）。这不是一个允许通过审批来变通的规定，而是一个**结构层面的不变量**。

---

## 2. 三个核心赌注

在我们继续讨论之前，先把 EKET 协议所押注的三个判断写下来。这些不是设计原则，而是可被反驳的命题；它们都对应着真实的失败可能。

### 赌注 1：状态必须在单一可信源中

状态是 ticket 行的 `state` 列。分支、PR、checkpoint 文件、Slack 消息，都只是它的视图。**任何视图都可以暂时失真，但 SQLite 里的那一行不会**。这条命题意味着：把状态散布到多个系统（GitHub Issue 状态 + 分支名 + Slack 标签）是一个反模式；它看起来更"开放"，实际上把"什么是真的"这一问题变得不确定。

### 赌注 2：所有状态变更都走 CAS

不管变更来自 `eket task:claim` CLI、Node 的 `web:dashboard`、还是 Claude Code 内部的一次工具调用，最终都落到 `node/src/core/state/atomic.ts:19-42` 那段 SQLite CAS 上。这意味着协议不依赖客户端的合作——任何两个写入者并发地尝试翻转同一行，只有一个会成功。

### 赌注 3：完成是一个 Saga，不是原子操作

"完成"在直觉上是一个动作，但协议把它拆成 `validate → test → checkpoint → commit → notify` 五步（`node/src/core/saga-executor.ts:22-66`，Rust 镜像见 `rust/crates/eket-core/src/saga.rs:30-94`）。每一步都有自己的失败模式与补偿动作。把它压成一个"大原子动作"看起来更简单，实际上让恢复变得不可能。

---

## 3. 协议如何运转

### 3.1 5 个状态、5 个转移

| 状态 | 进入条件 | 离开条件 |
|---|---|---|
| **READY** | Master 创建 ticket 后 | Slaver 成功 CAS claim |
| **IN_PROGRESS** | CAS claim 成功 | Slaver 调用 `task:complete` |
| **IN_REVIEW** | Saga 第 4 步 `commit` 之后 | Master 评审通过 / 驳回 |
| **DONE** | Master 合并 PR | 终态 |
| **RESUME** | 检测到 Slaver 上次未完成 | 新的 Slaver `task:resume` 续跑 |

```
                claim (CAS)
   READY ───────────────────▶ IN_PROGRESS
     ▲                            │
     │ resume                     │ complete
     │ (checkpoint)               │ (Saga 5-step)
     │                            ▼
   RESUME ◀────────── fail ─── IN_REVIEW
                                │   ▲
                                │   │ reject
                          merge │   │
                                ▼   │
                              DONE ─┘
```

ASCII 状态机示意，5 个状态、5 个转移。

### 3.2 状态只活在一处

`state` 列存于 SQLite 的 `tickets` 表中（schema 在 `state/schema.ts`）。分支、PR 评论、checkpoint 文件，都不参与定义"现在处于什么状态"——它们只是该状态的投影。

这一选择有一个不易察觉的好处：CI、人类、Agent 在判断"能不能 claim 这个 ticket"时，不需要去同步 GitHub、Slack、邮件、本地 checkpoint；只需要去查一行。这种"真相唯一性"是 §2 赌注 1 的直接推论。

### 3.3 原子领取：SQLite CAS

**领取**对应的 SQL 形如：

```sql
UPDATE tickets
   SET state = 'IN_PROGRESS',
       owner = :slaver_id,
       claimed_at = :now
 WHERE id = :ticket_id
   AND state = 'READY'
```

它的关键在最后两行：`AND state = 'READY'`。SQLite 在单写者模式（WAL）下保证这是一次原子比较并替换。Rust 实现见 `rust/crates/eket-core/src/claim.rs`，Node 镜像见 `node/src/core/state/atomic.ts:19-42`。返回的 `changes()` 数为 0 即代表失败——已经有别人领取了这个 ticket。

为什么不是文件锁或 Redis 原子操作？三个原因：

1. **可降级**：L0 Shell 实现使用文件锁作为回退，但那是"可丢失的精确性"——失败时回退到 L1 Rust 即可（详见文章 05）。
2. **可审计**：SQLite 的 `.db-wal` 与 `.db-shm` 让我们能离线回放整个 claim 历史。
3. **可移植**：任何能跑 SQLite 的环境——从 macOS 笔记本到一台老式 x86 服务器——都可以跑这个协议。

### 3.4 不可压缩的完成：Saga 五步

直觉上"完成"是一个动作；协议把它拆成 5 步，因为每一步都可能失败，并且它们的失败方式互不相同：

| 步 | 动作 | 失败时做什么 |
|---|---|---|
| 1. **validate** | 重新读取 ticket 计划、检查 owner | 报错，状态保持 IN_PROGRESS |
| 2. **test** | 跑测试套件 | 报错，状态保持 IN_PROGRESS |
| 3. **checkpoint** | 持久化 RunState 到 `state/checkpoints/` | 重试；3 次后报错 |
| 4. **commit** | 推送分支、开 PR、设置 label | 报错，状态保持 IN_PROGRESS |
| 5. **notify** | 把 PR 链接写入 `outbox/`，触发 webhook | 异步重试，3 次后告警 |

完整实现见 `node/src/core/saga-executor.ts:22-66` 与 `rust/crates/eket-core/src/saga.rs:30-94`。

**关键不变量**：每一步都必须留下可被检测的副产物。下一步在执行前会显式检查上一步的副产物是否落盘。这种"显式副产物"模式让"Saga 卡在了第几步"这一问题可以直接通过文件系统回答，而不需要去查日志。

### 3.5 Master 不领取——这是一项安全不变量

我们规定 Master **永远不**领取自己创建的 ticket，并且永远不写实现代码。四个理由：

1. **审计链完整性**：当 PR 评审人是 ticket 创建者时，评审变成了一种仪式而不是一道独立的关卡。
2. **可追责性**：当实现质量有问题时，能区分"评审失职"与"实现失职"是必要的；让 Master 同时承担两者会让问题归因失真。
3. **认知带宽**：Master 的稀缺资源是上下文；让它同时维护"全局视角"与"细节 PR 评审"会显著降低决策质量。
4. **对称性失效**：协议对所有"领取动作"一视同仁；让 Master 拥有特权路径会让协议在它最被需要的地方失效——比如在它最忙、最容易产生"我先自己改一下"冲动的时刻。

**违反示例**（仅用于说明）：

假设 Master 在 23:55 创建了 ticket `TASK-700`，期望某个 Slaver 明天领取。但 Master 看到一个明显能 30 秒修完的 typo，于是想"我顺手改了算了，省得跑 ticket 流程"。即便最终实现是 100% 正确的，协议也已被削弱，因为：

- ticket 仍然停留在 READY 状态
- 修复是 Master 私下 commit 的
- PR 引用关系断裂
- 当 `eket system:doctor` 扫描时，会发现一个"声明的 ticket"和"实际的工作"对不上

看起来很小的捷径，会在审计、复盘、新人培训时产生**持续的成本**。这就是为什么这是一项不变量而不是一条建议。

### 3.6 失败模式与恢复

三种主要失败模式：

**A. Slaver 进程被 kill -9（最常见）**

检测路径：下一次 Slaver 启动时 `eket task:resume` 会读到 `state/checkpoints/` 里属于 owner=本 Slaver 的最后一份 RunState，验证其 `step_index` 与 ticket 状态自洽，然后从下一步继续。

**B. PR 被 Master 驳回**

Saga 第 4 步之后状态进入 `IN_REVIEW`，Master 在 PR 上写评审意见并选择 reject。此时 ticket **不**回退到 `IN_PROGRESS`，而是停留在 `IN_REVIEW` 并带 `review_rejected=true` 标志。Slaver 在收到通知后调用 `task:resume`，协议会把 `review_rejected` 标志清空，状态从 `IN_REVIEW` 回到 `IN_PROGRESS`，Slaver 接着修改并重新触发 Saga。

**C. checkpoint 陈旧（罕见但严重）**

如果 Slaver 进程在 Saga 第 3 步 checkpoint 与第 4 步 commit 之间被杀，且文件 checkpoint 与 Git 状态对不上，协议会判定 checkpoint 不可信并强制要求从 `validate` 重跑。这是一种"宁可重做，不可错做"的保守选择。

### 3.7 多 Master 与多 Slaver 不是边角案例

协议的设计目标是稳态运行在 **1–5 个 Master + N 个 Slaver**（N 不设上限）的环境下。

- **多 Slaver**：靠 SQLite 的 WAL + CAS 解决。任意两个 Slaver 尝试翻转同一行，第二个会拿到 `changes=0` 并优雅退出。
- **多 Master**：靠"Master ID 列"解决。每一个 ticket 都有 `created_by` 字段；评审 PR 时，Master 必须 `created_by != self`。这种约束在 `eket gate:review` 实现中以一条 SQL 形式存在。
- **跨机器**：当 Slaver 分布在不同机器上时，SQLite 文件本身需要被一个共享卷承载（NFS / S3FS / EFS）。这是 EKET 的部署约束之一。

### 3.8 完整走查：TASK-642 的 0 → 126 分钟

让我们把上述所有规则套到一个真实的 ticket 上（参考 `jira/tickets/EPIC-008/TASK-642.md` 的来源模板）。

| 时间 | 事件 | 状态 | 状态写入者 |
|---|---|---|---|
| t=0 | Master 创建 `TASK-642` | READY | Master CLI |
| t=4m | Slaver-A 调用 `eket task:claim TASK-642`，CAS 成功 | IN_PROGRESS | Slaver-A |
| t=4m | Slaver-A `git checkout -b feature/task-642` | IN_PROGRESS | Slaver-A |
| t=37m | Slaver-A 完成实现，commit 1 | IN_PROGRESS | Slaver-A |
| t=42m | Slaver-A 调用 `eket task:complete TASK-642` | IN_PROGRESS → 走 Saga | Slaver-A |
| t=42m + Δ | validate / test / checkpoint / commit 五步依次执行 | IN_REVIEW | Slaver-A |
| t=58m | 通知 Master，PR 链接写入 `outbox/` | IN_REVIEW | Slaver-A |
| t=72m | Master 开始评审，3 轮 review 反馈 | IN_REVIEW | Master |
| t=110m | Slaver-A 提交 3 次 push 响应评审 | IN_REVIEW | Slaver-A |
| t=120m | Master 合并 PR | DONE | Master |
| t=126m | `scripts/sync-branches.sh` 把分支同步到 testing | DONE | scripts/ |

总时长 126 分钟，其中真正用于"评审对话"的时间是 60 分钟（t=58 到 t=120）。**这就是协议让协作可度量的方式**：每段时间都有名字、可以比较、可以优化。

---

## 4. 取舍与替代

| 方案 | 优势 | 代价 |
|---|---|---|
| **EKET Master-Slaver 协议（本方案）** | 状态机清晰、可降级、可审计 | 需要 SQLite 或文件回退、需要守规矩 |
| GitHub Issue + GitHub Projects | 零部署成本 | 无 CAS，重复领取高发；状态散布在多个字段里 |
| Slack emoji + 自由 commit | 灵活、零依赖 | 完全不可审计；不可恢复；多 Slaver 时失效 |
| 自建 lock service（etcd / ZooKeeper） | 工业级强一致 | 部署与运维成本对单人 / 小团队过高 |
| LangGraph / AutoGen 内置的 agent 调度 | 集成度最高 | 把"调度"与"状态"耦合在 agent 框架里，换框架时一切归零 |

我们选 SQLite CAS 而非 Redis/etcd，是因为 §3.3 末尾列出的三条理由：**可降级、可审计、可移植**。这三条都优先于"性能"。

---

## 5. 实现要点

1. **状态列必须为 `state TEXT NOT NULL CHECK(state IN ('READY','IN_PROGRESS','IN_REVIEW','DONE','RESUME'))`**，约束写在 schema 迁移里（`state/schema.ts`），不要让应用层去保证。
2. **CAS 必须是 `UPDATE ... WHERE state=:expected_state`** 的形式。不要写"先 SELECT 再 UPDATE"的两步代码——任何在两步之间被打断的窗口都会让协议失效。
3. **Saga 五步每一步都要写副产物到磁盘**——`state/checkpoints/<ticket_id>.json` 与 `state/saga/<ticket_id>.step` 是核心的"恢复点"机制。
4. **`task:complete` 的入口必须用 `BEGIN IMMEDIATE` 事务包裹**。SQLite 默认事务可能用 `BEGIN DEFERRED`，会让 Saga 在第 2 步与第 3 步之间出现奇怪的锁升级。
5. **Master 自领取要在 `eket task:claim` 入口就硬性拒绝**，不要把它放在 lint / 提示 / 配置里。结构层的不变量不应该靠纪律来维持。

---

## 6. 经验教训

1. **把"完成"当一个动作而不是一个流程，是协议在生产中遇到的最常见错误**。把"完成"拆成 5 步之后，几乎所有"半成品 ticket"问题都被外显化了。
2. **CAS 的 SQL 形式看起来非常朴素，但它**是协议最有力的不变量。一行 `AND state = :expected` 解决了 90% 的并发问题。
3. **Master 不领取**这一条在第一次违反时几乎看不出问题；它的问题在三个月后的复盘会显现——审计链断裂、复盘报告失真、新人模仿错误路径。
4. **checkpoint 不必原子**。Saga 的恢复机制建立在"checkpoint 偶尔不一致但可以被检测并重做"的假设上。试图让 checkpoint 原子化反而会让系统变脆。
5. **多 Master 是稳态**。当一个项目里有 >2 个人类协作者时，"轮流当 Master"是不稳定的，状态机让每个人在"评审者"角色上的行为保持一致。
6. **协议的可读性比可证明性重要**。我们可以形式化证明这个状态机满足某些性质，但在 README 里用一段 ASCII 图（见 §3.1）解释它，让 90% 的协作者遵守协议。

---

## 7. 参考

- 状态机定义：`protocol/state-machines/ticket-status.yml:1`
- Saga 编排（Node）：`node/src/core/saga-executor.ts:22-66`
- Saga 编排（Rust）：`rust/crates/eket-core/src/saga.rs:30-94`
- 原子 CAS（Node）：`node/src/core/state/atomic.ts:19-42`
- 原子 CAS（Rust）：`rust/crates/eket-core/src/claim.rs`
- 任务 checkpoint 实现：`node/src/core/task-checkpoint.ts:38-193`
- Schema 与迁移：`state/schema.ts`
- 同步脚本：`scripts/sync-branches.sh`
- 总体框架白皮书：`docs/architecture/FRAMEWORK.md`
- 术语表：`docs/articles/GLOSSARY.md`
- 关联阅读：文章 01（EKET 是什么）、文章 05（四级降级）、文章 07（存储与事件源）、文章 10（0→1 Slaver 接入手册）
