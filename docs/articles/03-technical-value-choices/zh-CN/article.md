# 03 — 技术价值：7 个不那么显然的选择

> **TL;DR** — EKET 做了 7 个第一眼看上去不那么主流的技术选择，但当你看到完整的取舍空间时，它们每一个都是承重的。这篇文章写给资深工程师：不是表面 API，是取舍层。我们分别为 SQLite 而非 Postgres、CAS 而非分布式锁、三仓而非 monorepo、L0 shell 而非纯 Rust、人机同一协议而非分角色协议、状态机而非 CRDT/纯事件溯源、四级降级而非三级降级做了辩护。每一处都配对了**多数团队本来会选的默认方案**，并诚实承认那个被拒绝方案的真正优势。贯穿线只有一条：**EKET 优化的是 Slaver 崩溃那天、Redis 抖动那天、两个 agent 抢同一张 ticket 那天——而不是单机顺风局。**

> **核心要点**
> 1. 这 7 个选择不是"EKET 更好"清单；这是"默认工具 X 看起来对，但 X 在 EKET 实际面对的负载下违反属性 Y"清单。
> 2. SQLite 是 *ticket 状态*负载的正确 RDBMS，因为该负载是单主机、单文件 ACID、需要 WAL 读不阻塞写；Postgres 会让团队多管一个进程，协议层没有任何收益。
> 3. SQLite 上的 CAS 把"多 agent 抢同一 ticket"的多写竞争折叠成一条 SQL `UPDATE`；分布式锁会增加延迟、增加 Redis 依赖、增加 SQLite CAS 没有的失败模式。
> 4. 三仓（知识 / 任务 / 代码）是必须的，因为三种生命周期有不同的写入模式；git 拆分是下游、可选。
> 5. L0 shell 地板（`scripts/eket-slaver-auto.sh`，322 行，`wc -l` 验证）不是历史包袱；它和 L1 Rust 跑的是同一份协议；它是系统在"刚 clone 完的 CI runner"上仍然活着的根据。
> 6. "人机同一份协议"规则消灭了"人机翻译层"导致的那一整类 bug。
> 7. 状态机是正确原语，因为 ticket 是*有限的*、*有状态的*；CRDT 和纯事件溯源是*最终一致协同文档*的正确原语，ticket 不是。
> 8. 四级（L0/L1/L2/L3）是有"shell 地板 + Node.js 完整栈"两层兜底所需的最少数；三级试过，被否定，因为恢复路径有缺口。

---

## Executive Summary

**给决策者（读完这段即可离开）：**

| 问题 | 答案 |
|---|---|
| 这篇文章是写给谁的？ | 给要为 EKET 的 7 个不那么显然的技术选择辩护的架构师和资深工程师。 |
| 为什么不选 Postgres？ | 因为 ticket 状态负载是单主机、单文件 ACID；协议不需要跨主机写。SQLite 默认给出可串行化写 + `tmp → rename` 原子写镜像（`rust/crates/eket-core/src/ticket.rs:100-103`）。 |
| 为什么用 CAS 而不是分布式锁？ | 因为 claim 就是一行 `UPDATE ... WHERE state = 'old' AND assignee IS NULL`；Redis 锁会增加一次网络往返、一个 Redis 依赖、一个 SQLite CAS 没有的失败模式。 |
| 为什么不放在 monorepo？ | 因为知识、任务、代码是三种不同的生命周期；git 拆分是下游，可选。详见 `docs/architecture/THREE_REPO_ARCHITECTURE.md:1-338`。 |
| 为什么要发 L0 shell？ | 因为 Redis 抖动那天、Node.js 崩溃那天、Rust 在 CI runner 上编译不了那天——协议必须继续工作。`scripts/eket-slaver-auto.sh:1-322` 是 322 行 shell，就是 L0 地板。 |
| 为什么人机同一份协议？ | 因为人类 claim 和 AI claim 必须在同一行 audit row 上落地。role 编码在 transition 上，不在 actor 上。 |
| 为什么不选 CRDT？ | 因为 ticket 是有限有状态的，不是最终一致文档。状态机给出单写原语；CRDT 解的是另一个问题。 |
| 为什么是四级而不是三级？ | 因为三级没有 L3 fallback；L2 Node.js 崩了之后没有 shell 层接住。第四级把这个口补上了。 |
| 元教训？ | 7 个选择不是独立的。它们是一条主论的 7 种表达：**协议是地板，runtime 是可互换的。** |

本文其余部分给架构师和资深工程师。每个选择都有一段，附比较表（至少 3 处），最后一段写跨选择的经验。

---

## 目录

1. 动机——为什么"不那么显然的选择"
2. 选择 1：SQLite 而非 Postgres
3. 选择 2：CAS 而非分布式锁
4. 选择 3：三仓而非 monorepo
5. 选择 4：Shell L0 而非纯 Rust
6. 选择 5：人机同一份协议
7. 选择 6：状态机而非 CRDT/纯事件溯源
8. 选择 7：四级而非三级
9. 跨选择的经验
10. 参考

---

## 1. 动机——为什么"不那么显然的选择"

大多数"AI 编排"框架把展示面（dashboard、SDK、LLM 网关）放在最前面。读者走开时拿到的是"它能做什么"的心智模型，但拿不到"团队拒绝了什么、为什么"。这篇文章讲的是另一半。下面 7 个选择是设计评审时被问得最多的，也是如果误解就会走错岔路的那 7 个。

先说一个框架性的提醒：当一个团队挑了不那么主流的工具（SQLite、shell、三仓），自然的反弹是"但是标准工具 X 能做这件事，X 已经被几千个团队在生产里验证过"。反弹到这一步是对的。这篇文章不是要说标准工具不好，而是要说**EKET 优化的负载不是标准工具优化的负载**。EKET 的负载是"N 个 agent + M 个人类在一个有限的、有状态的 backlog 上协同，handoff 可审计、crash 可恢复"。标准工具优化的是"大量并发客户端读写共享数据集，最终一致可接受"。当你把负载讲清楚，那些不那么主流的选择就开始显得不可避免。

下面 7 段都是同一个结构：

- **选了什么。** 一句话。
- **拒绝了什么。** 多数团队本来会选的默认方案，并承认那个被拒方案的*真实*优势。
- **为什么。** 选中的方案保留了哪种被拒方案违反的属性，附一条 `file:line` 引用指到承重代码或文档。

一个有用的自测：如果某一段读起来像"被拒方案很烂、我们很好"，那它就写错了。被拒方案是好的。被拒的原因是它在 EKET 负载具体要求的某个属性上失分。诚实才是这篇文章。

> "EKET 里大多数不那么主流的选择之所以不那么主流，是因为它们优化的是第三个 agent 才出现的失败模式，不是第一个。第一个 agent 不需要 CAS。第三个需要。"
> — *EKET 设计笔记，2026-04*

---

## 2. 选择 1：SQLite 而非 Postgres

**选了什么。** EKET 把 ticket 状态存进 SQLite。同一份 SQLite 文件被 L0 shell、L1 Rust CLI、L2 Node.js core 同时读。数据库是单一事实源；`jira/tickets/` 里的 markdown ticket 文件是人类可读的投影，通过 `rust/crates/eket-core/src/ticket.rs:100-103` 的 `tmp → rename` 原子写原语保持同步。

**拒绝了什么。** Postgres。Postgres 是"我需要一个真正的 RDBMS"时的默认选择，默认不是没道理：MVCC、行级锁、复制、JSONB、被实战验证 20 年的查询优化器。一个团队要"给我们的状态机配个数据库"，十次有九次会拿 Postgres。EKET 不拿，这是第一个反直觉点。

**为什么。** ticket 状态负载有 3 个 Postgres 杀鸡用牛刀的属性，1 个 Postgres 反而比 SQLite 差的属性。

1. **单主机写竞争。** 每次 `task:claim` 都是对一张表的一行写。竞争是同一台机器上 2–10 个并发 Slaver 进程之间，不是网络上的上千个客户端。SQLite 的"单写者持锁"模型——一个写进程在 `UPDATE` 期间持有库锁——粒度刚好。Postgres 会给到行级锁，但行级锁要通过网络连接拿，这一来一回没有带来这个规模下有用的并发。

2. **单文件 ACID。** 审计轨迹的耐久性来自"数据库是一个 `fsync` 到 commit 的单文件"。SQLite 默认给。Postgres 要一个独立进程、一份独立 `pg_wal`、一套独立备份。L0 shell 地板的"灾难恢复就是 `git clone`"性质（`docs/articles/05-four-level-degradation/en/article.md:217-218`）依赖于数据库是 worktree 里的一个文件，不在另一台机器的服务里。

3. **WAL 读不阻塞写。** SQLite 的 `PRAGMA journal_mode=WAL` 允许一个 Slaver 在另一个 Slaver claim `UPDATE` 的过程中 `SELECT` ticket 板。claim 时 dashboard 不卡住；读到的是 CAS 前的快照。"原子 claim + 非阻塞读"的模式能跑通就是因为这个属性。

4. **"真 RDBMS" 的代价是运维。** Postgres 部署是一个要装的进程、一个要开的端口、一个要建的用户、一套要排的备份、一个要调的连接池、一套要跑的 migration。SQLite 部署是 `better-sqlite3.open('./eket.db')` 加一个 `git commit`。协议的态度是：协调层的运维 footprint 应该和它做的工作量成正比，1–5 + N 团队的协调工作量小到 SQLite 是大小正好的工具。

比较表是诚实呈现取舍的方式。

| 属性 | SQLite（选中） | Postgres（被拒） |
|---|---|---|
| 写者模型 | 单写者；一个进程在 `UPDATE` 期间持库锁 | MVCC；行级锁；并发写者 |
| 写时读 | WAL 模式；读不阻塞，看到 CAS 前快照 | MVCC；读看到事务前快照 |
| 持久性 | 单文件；commit 时 `fsync`；扛得住 host `kill -9` | `pg_wal` + checkpoint；扛得住大多数 host 故障；需要独立备份 |
| 我们这个规模（≤10 Slaver 进程）的并发 | 足够 | 足够，但多余的头寸用不上 |
| 运维 footprint | 一个文件，没有进程，没有端口 | 一个进程、一个端口、一个用户、一套备份 |
| 跨主机写 | 不支持——但协议不需要 | 支持，可配复制拓扑 |
| 高负载下的失败模式 | 5 秒 `BUSY` 超时后报错"database is locked"；Slaver 重试 | 连接池耗尽；长事务阻塞 |
| 何时输 | 跨主机状态、写重 OLTP、>100 并发写者 | 单主机、低竞争、审计优先的负载（也就是 EKET 的负载） |

重点不是"Postgres 不好"。重点是"Postgres 解的负载不是 EKET 的负载"。做多区域用户数据服务的团队该选 Postgres，会选对。做 1–5 + N 单主机协调层的团队该选 SQLite，运维上的节省是真的。

被拒方案"真正优势"那一段：Postgres 的复制是它最硬的论据，跑 50 个 Slaver 跨 3 个 region 的团队终将长出 SQLite 的天花板。EKET 的设计预留了出口——`node/src/core/state-reconciler.ts:96-348` 的 file-queue replay 就是逃生通道——但承认逃生通道是 L0 fallback，不是稳态。对 1–5 + N 单主机，SQLite 是对的工具。诚实的版本承认：对的工具随规模变化。

逐行证据：TypeScript 路径的原子 claim 原语在 `node/src/core/task-checkpoint.ts:85-108`（`_casUpdate` 方法），Rust 路径在 `rust/crates/eket-core/src/ticket.rs:72-145`。markdown ticket 文件的 `tmp → rename` 原子写在 `rust/crates/eket-core/src/ticket.rs:100-103`。两套实现都假设 SQLite，都会因为后端换成 Postgres 而改形状（不会消失，但会变）。

---

## 3. 选择 2：CAS 而非分布式锁

**选了什么。** 对 `tickets` 表做一次原子 `UPDATE ... WHERE state = 'old' AND assignee IS NULL`。这一条 SQL 就是 claim。如果 `info.changes === 1`，Slaver 拿到 ticket；如果 `info.changes === 0`，别人先到了。没有 `SELECT` 后 `UPDATE`；没有锁服务；没有 `WATCH`/`MULTI` 花样。状态机就是锁。

**拒绝了什么。** 分布式锁——通常是带 TTL 的 Redis `SETNX`，或 ZooKeeper 顺序节点，或 etcd `lease` 操作。这些是"N 个进程要就某个资源的所有权达成一致"时的默认工具。EKET 不用分布式锁服务做 ticket claim，这是第二个反直觉点。

**为什么。** claim 负载有两个属性，让分布式锁成为错配。

1. **"锁"和"资源"是同一行。** Redis 在一个合成 key（`eket:claim:TASK-642`）上的锁，和 ticket 表里那一行，是两条独立记录。锁服务和资源是两个事实源，必须保持同步。拿到锁但没更新资源的 claim 会留下"资源无人、锁在握"；更新了资源但没拿到锁的 claim 会留下"资源有人、没有审计"。SQLite CAS 把两者合一：`tickets` 表里那一行*就是*锁，flip 锁的同一条 `UPDATE` 也 flip 了状态。

2. **锁服务是独立的失败域。** Redis 99.95% 在线。剩下 0.05% 是 claim 竞争变成死锁的那一刻。Slaver 在 claim 中途丢 Redis 连接必须做选择：重试 Redis 调用，还是放弃这次 claim。重试路径是"ticket 被 claim 两次" bug 的源头。SQLite CAS 没有这个失败模式，因为数据库是本地文件，Slaver 到 SQLite 的"连接"是文件描述符，最坏失败是"文件在别的机器上"，那是配置错，不是运行错。

诚实的比较：

| 属性 | SQLite CAS（选中） | Redis SETNX + TTL（被拒） |
|---|---|---|
| 每次 claim 的网络往返 | 0（本地文件） | 1（Redis 调用）+ 1（释放） |
| 原子性保证 | 单条 `UPDATE` 就是原子边界 | `SETNX` 原子；释放尽力而为 |
| 服务宕时的失败模式 | Slaver 仍能工作；L0 shell 可以用 file-lock claim | Slaver 不能 claim；协议停摆 |
| 网络分区时的失败模式 | 同上，不涉及网络 | 锁在握；资源无人；Slaver 必须等分区愈合 |
| 租约 / TTL 语义 | 不需要；行的 `claimed_at` 时间戳就是审计记录 | 必须有；中途崩了的 Slaver 要等 TTL 过期 |
| 审计轨迹 | `tickets` 行记录 `assignee`、`claimed_at`、`state` | Redis 锁是一条独立记录；审计是 join |
| 何时输 | 跨主机 claim（协议不需要） | 单主机 claim 在持续高竞争下（>1000 claim/秒） |

被拒方案"真正优势"那一段：Redis SETNX 在*单进程* claim 场景下比 SQLite CAS 快，因为到本地 Redis 的网络往返是亚毫秒。在 EKET 面对的负载（单主机 ≤10 Slaver 进程）下，延迟优势在噪声地板之下，"不依赖 Redis"的运维优势压倒一切。100 主机、10000 claim/秒的团队终将去拿 Redis。`node/src/core/state-reconciler.ts:96-348` 的 file-queue replay 还是那条逃生通道。

逐行证据：SQLite CAS 模式记录在 `node/src/core/task-checkpoint.ts:85-108`（`_casUpdate` 方法，带 `WHERE version = ?` 守卫）。Rust 镜像在 `rust/crates/eket-core/src/ticket.rs:72-145`（`set_status` 方法，同款守卫）。协议*确实*用的 Redis SETNX——用在**master 选举**而不是 ticket claim——在 `rust/crates/eket-core/src/election.rs:294`（`.setnx(REDIS_LOCK_KEY, &self.instance_id, REDIS_LEASE_TTL_SECS)`）。选择不是"SQLite 还是 Redis"。选择是"ticket 状态用 SQLite，master 选举用 Redis"，原因是两个负载的一致性和延迟要求不同。

更深一层：协议里的"claim"是单行变更，数据库是本地文件，审计轨迹就是那一行。锁服务被拿掉了；锁服务要提供的属性由 SQL `UPDATE` 提供。这和 `git status` 在分布式版本控制上玩的是同一个把戏：工作树就是锁，工作树也是文件。协议在利用一个事实——"资源"和"资源的锁"可以是同一个对象。

---

## 4. 选择 3：三仓而非 monorepo

**选了什么。** EKET 把知识、任务、代码放在三个兄弟目录——`confluence/memory/`、`jira/tickets/`、`code_repo/`（或 `rust/`、`node/`）——看起来像一棵树，行为上是三个独立的关注点。每个目录有不同的可变性 profile、不同的版本模型、不同的写入模式、不同的读者群体。这个拆分和 git 无关，和生命周期有关。强行把三种生命周期塞进一个工具，会造出一个对三种都糟糕的工具；分开让每一边对一种都优秀。

**拒绝了什么。** monorepo：`docs/`、`tickets/`、`code/` 同一棵树、同一个 git 历史、同一套 CI。这是外面最常见的布局，也是团队上手 EKET 时最常见的起点。EKET 主动反对它，这是第三个反直觉点。

**为什么。** 生命周期分离论是最长的一段，也是最常被误读成"三个 git 仓库"而不是"三个生命周期"的一段。完整论证在 `docs/articles/04-three-repo-arch/en/article.md:1-318`；摘要：

1. **三种生命周期写入模式不同。** 知识是 append-mostly；新的领悟是新的 note，不是重写老的。任务是有状态、有限的；ticket 走 READY → IN_PROGRESS → IN_REVIEW → DONE 然后归档。代码是分叉、有版本的；commit 是变更单元。一个对三种写入模式都优秀的工具不存在；git 不擅长状态转移，Kanban 板不擅长 append-mostly，wiki 不擅长版本化分叉。

2. **三种生命周期访问 profile 不同。** AI Slaver 应该被允许写 `jira/tickets/`（claim 和完成 ticket），但不该写 `confluence/memory/lessons/`（发明知识），不该写到 `code_repo/` 之外自己领的那条分支。这个矩阵在 monorepo 里表达不出来——除非用基于路径的 pre-commit hook，而每个 Slaver 都最终能（也的确会）绕过。三仓之后约束由 git 自身强制：Slaver 没有主仓 `main` 分支的 push 权限，code 仓的 pre-receive hook 会拒绝 Slaver 在允许前缀之外的 push。`docs/architecture/three-repo-deployment.md:242-249` 发布权威的权限矩阵（5 角色 × 4 仓），这才是拆分承重的地方。

3. **三种生命周期失败模式不同。** 知识腐化；任务变陈旧；代码崩。monorepo 的 CI 分不出失败的 test 属于哪种生命周期，只能一视同仁。三仓布局让每个仓的 CI 可以特化：code 仓跑 `cargo test` 和 `npm test`；jira 仓跑 `scripts/validate-ticket-pr.sh`；confluence 仓跑"Slaver 没在这里写"检查。失败是局部的，审计轨迹是 per-repo。

被拒方案"真正优势"那一段：monorepo *运维上更简单*。一个 `git clone`、一个 `git pull`、一套 CI。两个 human + 一个 agent、做一个月原型的团队就该待在 monorepo。生命周期分离在团队有 ≥2 human、≥2 agent、backlog 撑得过一个季度时回本。低于这个门槛，迁移成本摊不掉。这是"三仓不适用所有人"的诚实版本；它尊重运维者。

逐行证据：生命周期分离论在 `docs/architecture/THREE_REPO_ARCHITECTURE.md:1-338`（权威 spec，338 行，*what*）；部署 playbook 在 `docs/architecture/three-repo-deployment.md:1-312`（*how*）；让拆分承重的权限矩阵在 `docs/architecture/three-repo-deployment.md:242-249`。"没有 ticket 就没有交叉引用"规则由 `scripts/validate-ticket-pr.sh:1-78` 强制；"ticket 字段不可变"规则由 `scripts/check-ticket-immutability.sh:1-94` 强制（`wc -l` 验证 78 / 94 行）。两段脚本是协议，架构文档是描述。

一个微妙但重要的点：**git 拆分是可选的**。三个目录放在同一个 git 仓里，用 `validate-ticket-pr.sh` 强制交叉引用、用 `check-ticket-immutability.sh` 强制字段不可变，是合法的 EKET 布局。submodule 指针、兄弟克隆、per-repo CI——那些是*细化*，不是前置。`docs/architecture/three-repo-deployment.md:301-304` 是显式逃生通道："可以 [纯平级目录]。在 `config.yml` 中用相对路径 `../sibling` 访问即可，EKET 运行时不依赖 git submodule 机制." 生命周期拆分是必须的；git 拆分是 4 种合法存储变体之一。

---

## 5. 选择 4：Shell L0 而非纯 Rust

**选了什么。** EKET 把同一份协调协议交付**四**个实现，按能力排序：L0 Shell、L1 Rust、L2 Node.js、L3 Shell fallback。L0 实现——`scripts/eket-slaver-auto.sh:1-322`，`wc -l` 验证 322 行 bash——跑完整的 Slaver 循环：扫 ticket、按优先级排序、用 file-lock claim、建 worktree 和分支、加载 agent profile、输出下一步指令。它不是桩。

**拒绝了什么。** 纯 Rust（或纯 Go、纯 Node.js）栈，没有 shell 地板。2024–2026 的默认假设是"要性能就写 Rust、要 DX 就写 Node.js、两个都要就写两套并保持同步"。EKET 做了两套，外加第三套：shell。shell 实现是反直觉点。

**为什么。** 论证是结构性的，不是性能性的。

1. **实现协议的 runtime 正是会失败的那个东西。** 协议层是"Node.js 进程碰巧做的事"的系统，在 Node.js 进程死时没有 fallback。协议层是"`scripts/eket-slaver-auto.sh` 里一串 bash 语句"的系统，fallback 在"刚装好的 Linux 容器、什么都没装"上能跑。原则：**协议的正确性不应该依赖于实现它的 runtime 的可用性。**

2. **322 行的 shell 脚本 15 分钟就能审完。** 8000 行 TypeScript 文件没人会审。L0 实现短到一个人能从头读到尾并验证它和文档说的一致。L1 Rust 实现比 L2 Node.js 短，L0 实现更短。短文件就是审计轨迹。

3. **L0 实现是测试夹具。** L1 Rust 在开发时，L0 是参考。L2 Node.js 在做 benchmark 时，L0 是地板。L0 不是"legacy 版本"；L0 是其它实现拿来对照的*基准*。

比较表：

| 属性 | Shell L0（选中） | 纯 Rust 栈（被拒） |
|---|---|---|
| 冷启动延迟 | ~5 ms（`task:claim`） | ~21 ms（Rust）/ ~500 ms（Node.js） |
| 依赖 | `bash` 4.0+、`git`、文件系统 | Rust 工具链 + `cargo`（Rust）或 Node.js 18+ + `npm`（Node） |
| 安装 footprint | `git clone` 然后跑 | 构建步骤或 `npm install` |
| 恢复步骤 | `git clone` | 备份 + 恢复 + migration |
| 阅读代码量 | 322 行（已验证） | 数千行 |
| runtime 不在时 | Shell 继续工作；协议幸存 | 协议停摆直到 runtime 恢复 |
| host 不在时 | 新 host 需要 `bash` | 新 host 需要工具链 |
| 何时输 | 吞吐、类型安全、可观测性 | 可幸存性、可审计性、可安装性 |

被拒方案"真正优势"那一段：纯 Rust 栈更快、类型更安全。L1 Rust CLI 是热循环和 CI 的对工具；L2 Node.js core 是 dashboard 和 LLM 网关的对工具。选纯 Rust 的团队会拿到更快的 `task:claim`（`README.md:140-145` 那个 19× 头条数字是 Rust 实现的，不是 shell 的）。shell 实现不替代 Rust 实现；它*垫在下面*做地板。优化顺风局的团队选 Rust-only。EKET 优化的是顺风局结束那天。

逐行证据：L0 Slaver 循环在 `scripts/eket-slaver-auto.sh:1-322`（322 行，`wc -l`）。配套 L0 脚本是 `scripts/heartbeat-monitor.sh:1-390`（390 行）、`scripts/ticket-board.sh:1-328`（328 行）、`scripts/eket-start.sh:1-883`（883 行含安装路径）。四级模型的权威 spec 在 `docs/architecture/DEGRADATION-STRATEGY.md:1-591`（591 行）。"为什么四级"决策记录在 `docs/adr/ADR-001-four-level-degradation.md:32-42`（阶梯：远程 Redis → 本地 Redis → SQLite → file queue）。"为什么底部是 file queue"决策记录在 `docs/adr/ADR-003-file-queue-fallback.md:96-131`（file-write ~20 ms、file-read ~10 ms 性能地板，file queue 是 `docs/adr/ADR-003-file-queue-fallback.md:96-100` 表里*唯一*零依赖选项）。

微妙的一点：L0 和 L3 是*同一段代码*，在不同条件下被激活。L0 是"什么都没装时的入口"（刚 clone 的 CI runner、灾难恢复主机）。L3 是"L2 Node.js 刚崩"时的 fallback。同一段 `scripts/eket-slaver-auto.sh` 在两种模式里都跑。这是维护成本可控的原因：*一份* shell 实现，不是两份。

---

## 6. 选择 5：人机同一份协议

**选了什么。** 人类"claim" ticket 是在 dashboard 里把它从 `READY` 挪到 `IN_PROGRESS`（或者在 L1 Rust CLI 里跑 `eket task:claim TASK-642`）。AI agent "claim" 是 L0 shell、L1 Rust CLI、L2 Node.js core 任一处跑 `eket task:claim TASK-642`。**两个操作从数据库视角是同一个**：对 `tickets` 表的一次 `UPDATE`，role 编码在 transition 上，不在 actor 上。

**拒绝了什么。** 分角色协议。2024–2026 的默认假设是"人和 AI 不同，把他们假装一样是天真"。本能是发"人类模式"——Kanban 板风格 claim——和"AI 模式"——CLI 风格 claim——然后按惯例保持两者同步。EKET 主动拒绝。这是第五个反直觉点。

**为什么。** 论证是关于*一类 bug*，不是关于人体工学。

1. **协议是安全护栏。** 人类可以把 ticket 中途交给 AI，AI 不能做人类做不到的事——因为状态机不允许。如果 AI claim 和人类 claim 是不同操作，就会出现"人类能、AI 不能（或反之）"的 transition 类别，handoff 会丢信息。同协议规则让 handoff 成为 no-op：ticket 行就是契约，契约对两个 role 一样。

2. **role 校验编码在 transition 上，不在 actor 上。** `protocol/state-machines/ticket-status.yml:14-91` 在 `ready → in_progress` transition 上有 `who_can_transition: [slaver]` 字段。actor 的 role 是行 flip 上的一列，不是用户上的一个标签。人类 Master 想 claim ticket 时，被拒绝它的 SQL 约束就是拒绝行为不端的 AI Slaver 的那一条。"Master 从不 claim"是 SQL 约束，不是准则。

3. **审计轨迹对两个 role 一样。** 每次 `READY → IN_PROGRESS` transition 是审计日志里的一事件。如果人类和 AI claim 是不同事件，审计日志要合并两种事件类型，合并处就是藏 bug 的地方。只有一种事件类型，合并就不需要了。

被拒方案"真正优势"那一段：分角色协议可以更符合人体工学。Kanban 板对人类是比 CLI 更友好的 claim UI；LLM 友好的 JSON-RPC API 对模型是比板子更友好的 claim 面。"人类模式"可以吃 UI 的 affordance，"AI 模式"可以吃 schema 的 affordance。代价是两面必须保持同步，一旦漂移，handoff 失败。协议的态度是 handoff 才是承重属性，UI 的 affordance 是下游。需要更友好人类 UI 的团队可以在*同一份*协议之上做一个；协议保持不变。

逐行证据：统一论在 `docs/articles/01-what-is-eket/en/article.md:74-75`（权威陈述）。带 role-gated transition 的状态机在 `protocol/state-machines/ticket-status.yml:1-112`（17 个细粒度状态，各带 `who_can_transition` 列表）。"为什么 Master/Slaver"决策记录在 `docs/adr/ADR-002-master-slaver-mode.md:23-30`（显式统一陈述："人类 Master 写 ticket、分派 Slaver、观察。如果没有 Slaver 可用，ticket 停在 `READY`"）。"claim 不允许人参与"是协议被违反得最多的部分；结构性强制的位置在 `protocol/state-machines/ticket-status.yml:14-91`（`ready` 状态上的 `who_can_transition: [slaver]`）。

微妙但重要的属性：规则反向也成立。AI Slaver 被禁止做 Master 保留的操作（`protocol/state-machines/ticket-status.yml:67-86` 的 `review` 和 `merge` transition）。不对称是故意的：Slaver 执行，Master 决定。不对称由同一种 SQL 约束机制强制，所以 AI Slaver 行为不端是数据库错误，不是 Slack 复盘。

---

## 7. 选择 6：状态机而非 CRDT/纯事件溯源

**选了什么。** 5 个用户可见状态（READY、IN_PROGRESS、IN_REVIEW、DONE、RESUME）、YAML schema 里 17 个细粒度状态、5 个 transition（claim、complete、review、merge、resume）的有限状态机。状态在 SQLite 里；transition 是带 role 检查的 SQL `UPDATE`；完成是 5 步 Saga，按反序补偿。模型是 `UPDATE ... WHERE state = 'old'`，数据库是事实源。

**拒绝了什么。** CRDT（Conflict-free Replicated Data Types）和纯事件溯源。CRDT 是*最终一致协同文档*（Google Docs、Figma、Linear 文本编辑器）的对原语。纯事件溯源是*append-only 审计日志任意回放*（金融账本、event-store 数据库）的对原语。2026 年一个团队拿到"我有一个有状态的工作流"时，本能会拿这两个之一。EKET 都不拿。这是第六个反直觉点。

**为什么。** Ticket 不是文档，审计日志不是工作流。Ticket 负载的三个属性把 CRDT 和事件溯源排除在*主*原语之外：

1. **Ticket 有限有状态，不是最终一致。** Ticket 有定义的终态（`DONE`）和定义的合法 transition 集合。没有"合并两个 ticket"产生新一致状态的操作；没有"last-writer-wins"规则；不需要 `Vector` 时钟。CRDT 解的是 ticket 没有的问题：怎么合并对同一文档的并发编辑。EKET 负载是那个问题的*反面*：对 ticket 行的并发编辑*不*合并——它们被 CAS *拒绝*，输家被要求重试。原语是"每行单写"，不是"合并两个写者"。

2. **审计轨迹是状态的下游，不是上游。** 纯事件溯源说：存事件，状态由回放得出。EKET 说：存状态，事件作为审计元数据记下来。原因是运维的：dashboard、CLI、hooks 层都要做"查询 TASK-642 当前状态"，一次 `SELECT` 就要给到答案。事件溯源系统需要 fold 或 snapshot。状态在 SQLite 的设计让 dashboard 跑 `SELECT state FROM tickets WHERE id = 'TASK-642'` 一次读出答案。事件在那里做审计（`task_checkpoints` 表、`claimed_at` 时间戳、`merged_at` 时间戳），但*状态*是那一行。

3. **Saga 模式是完成的对原语，不是事件日志。** `eket task:complete TASK-642` 是 5 步 Saga：validate → test → checkpoint → commit → notify。每一步可能失败；Saga 按反序补偿。Saga 是*控制流*原语，不是*数据*原语。事件溯源给你数据原语（事件永远在），但 Saga 是另一回事：怎么协调步骤、怎么从部分完成恢复。EKET 在 `node/src/core/saga-executor.ts:22-66`（TypeScript）和 `rust/crates/eket-core/src/saga.rs:30-94`（Rust 镜像）实现 Saga，单元测试在 `rust/crates/eket-core/src/saga.rs:233-288`（`middle_step_fails_rolls_back`）断言第 3 步失败时第 2、1 步按序补偿。

比较表：

| 属性 | 状态机 + Saga（选中） | CRDT（被拒） | 纯事件溯源（被拒） |
|---|---|---|---|
| 并发模型 | 每行单写；CAS 拒绝输家 | 多写；合并两个状态 | append-only；回放得状态 |
| 冲突解决 | 拒绝输家；请重试 | last-writer-wins 或 merge 函数 | "所有事件为真"；无冲突 |
| 审计轨迹 | `tickets` 行 + `task_checkpoints` 表 | CRDT 本身（带 vector clock） | 事件日志 |
| "当前状态？" 查询 | 单次 `SELECT` | materialize CRDT；读 | 回放事件；materialize |
| 步骤级失败恢复 | Saga 按反序补偿 | CRDT 特定回滚 | 从 snapshot 回放；无进行中补偿 |
| 何时赢 | 有限、有状态、每资源单写的工作流 | 最终一致文档；协同编辑 | append-only 审计；任意回放 |
| 何时输 | 多主工作流；离线优先协同 | 强一致的有限状态工作流 | 需要单行状态查询的工作流 |

被拒方案"真正优势"那一段：CRDT 是 Google-Docs 风格协同编辑器的对工具——两个用户编辑同一段、系统合并编辑。纯事件溯源是金融账本的对工具——每笔交易永久记录、余额是交易之和。EKET *不在*建这两种系统。EKET 在建一个有限 backlog 有状态 ticket 协调层，对原语是状态机。对原语是对负载的那个，不是对 buzzword 的那个。

逐行证据：状态机在 `protocol/state-machines/ticket-status.yml:1-112`（17 个细粒度状态、role-gated transition、声明式事实源）。TypeScript 的 Saga executor 在 `node/src/core/saga-executor.ts:22-66`（`execute` 方法，按反序补偿）。Rust 镜像在 `rust/crates/eket-core/src/saga.rs:30-94`，单元测试在 `rust/crates/eket-core/src/saga.rs:233-288`。原子 claim 原语在 `node/src/core/task-checkpoint.ts:85-108`（`_casUpdate` 方法，带 `WHERE version = ?` 守卫）。"为什么是状态机不是事件溯源"隐含在 `tickets` 表作为 state-of-record 的存在里；"为什么是 Saga 不是仅仅 `git commit`"在 `docs/articles/06-master-slaver-protocol/en/article.md:226-274` 的 5 步完成契约里。

微妙的一点：协议*确实*保留事件日志。`task_checkpoints` 表、`claimed_at` 和 `merged_at` 时间戳、per-instance 的 `claimed_tasks.txt`、`node/src/core/event-bus.ts` 的 EventBus——全是事件溯源原语。区别在于它们是*审计*和*恢复*原语，不是*状态*原语。状态是 SQL 行；事件是恢复故事。承重的区别是："我们有一个状态机，外加一个事件日志"比"我们是事件溯源的"更强。

---

## 8. 选择 7：四级而非三级

**选了什么。** 同一份协议的 4 个实现，按能力排序：L0 Shell、L1 Rust、L2 Node.js、L3 Shell fallback。编号看起来像重复（L0 和 L3 都是 shell），但它们在不同条件下激活，这才是关键：L0 是"什么都没装"的入口；L3 是"L2 Node.js 崩了但 L1 Rust 还活着"的 fallback。两个 shell 实现是同一段代码；两个*激活上下文*不同。

**拒绝了什么。** 三级模型。历史 EKET 架构（`docs/architecture/THREE-LEVEL-ARCHITECTURE.md:1-3`，冻结、已弃用）有三级：L1 Shell、L2 Node.js、L3 Redis。三级模型图上更简单，但恢复路径有缺口：L2 Node.js 崩了、L1 Shell 在跑时，如果 L2 进程起不来，没有 Node.js 那一层可以"恢复到"。四级模型把缺口补上：L3 Shell fallback 是一层永久在的，不是临时在的。

**为什么。** 论证是关于*恢复*，不是能力。

1. **恢复是一层，不是状态。** 等运维重启进程的系统不是在恢复；它在等。自动 fallback 到下一级、上一级健康时自动 upgrade 的系统是在恢复。四级模型是有"自动 fallback + 自动 upgrade"所需的最少级数。三级有 fallback 没 upgrade；五级对 EKET 负载是过度设计。

2. **第四级和第一级是同一段代码，激活不同。** L0 和 L3 都是 `scripts/eket-slaver-auto.sh`。区别是触发：L0 是"什么都没装"的入口（刚 clone 的 CI runner）；L3 是"L2 崩了"的 fallback。同段代码，两条激活路径。这是维护成本可控的原因：*一份* shell 实现，不是两份。

3. **四级模型对应 `ConnectionManager` 4 级阶梯。** 在 L1/L2 runtime 内部，`ConnectionManager`（`docs/architecture/DEGRADATION-STRATEGY.md:114-124`）有自己的 4 级阶梯：远程 Redis → 本地 Redis → SQLite → file queue。两个阶梯组合：外层 L2（Node.js）、内层 L3-D（file queue）时，系统*仍然在*跑——在 shell 上，在 file queue 上，没有 Redis、没有 SQLite、没有 Node。组合就是那个属性。

比较表：

| 属性 | 四级（选中） | 三级（被拒） | 二级（被拒） |
|---|---|---|---|
| L0 shell 地板 | 有 | 有 | 无 |
| L1 Rust | 有 | （折进 L2） | 无 |
| L2 Node.js | 有 | 有 | 有 |
| L3 shell fallback | 有（L2 挂时自动） | 无 | 无 |
| 自动恢复回更高一级 | 有（断路器 + 30 秒冷却） | 部分（要手动重启） | 无 |
| 冷启动延迟地板 | ~5 ms（L0 shell） | ~5 ms（L1 shell） | ~500 ms（L2 Node） |
| host 挂时的恢复步骤 | `git clone` | `git clone` + 装 Node.js | `git clone` + 装 Node.js + 装依赖 |
| 要维护的代码面 | L0 shell + L1 Rust + L2 Node | L1 shell + L2 Node | 只 L2 Node |
| 何时输 | 维护成本（三个 runtime 同步） | 恢复故事（无自动 upgrade） | 可幸存性（无 shell 地板） |

被拒方案"真正优势"那一段：二级模型（Node.js + Redis）是 2024–2026 最常见的起点，最常见的失败模式是"Redis 抖动、系统停摆"。三级模型加了 shell 地板，是正确的下一步。四级模型加了自动 L3 fallback，把环闭合。每一级都是*细化*，不是重写。今天发 L2-only、跑得开心的团队不该直接跳四级；迁移路径是"加 L1 Rust 拿性能，加 L0 shell 拿可幸存性，加 L3 拿自动恢复"。诚实的版本承认：对的级数取决于负载。

逐行证据：四级决策在 `docs/adr/ADR-001-four-level-degradation.md:32-42`（阶梯：远程 Redis → 本地 Redis → SQLite → file queue）。runtime 降级阶梯在 `docs/architecture/DEGRADATION-STRATEGY.md:18-46`（外层 L1/L2/L3 阶梯）。`ConnectionManager` 4 级阶梯在 `docs/architecture/DEGRADATION-STRATEGY.md:114-124`（内层 L3-A/B/C/D 阶梯）。管自动恢复的断路器在 `docs/architecture/DEGRADATION-STRATEGY.md:228-246`（5 次失败阈值、30 秒冷却、3 次半开探针）。L0 Slaver 循环在 `scripts/eket-slaver-auto.sh:1-322`（322 行，`wc -l`）。历史三级模型在 `docs/architecture/THREE-LEVEL-ARCHITECTURE.md:1-3`（566 行，冻结、已弃用）。

微妙的一点：四级模型*不是*"shell、Rust、Node、shell"。是"shell、Rust、Node、shell-fallback"。L0 和 L3 是同一段代码；L1 和 L2 是 runtime 层。编号是"L0 = shell，L1 = Rust，L2 = Node，L3 = shell-fallback"，不对称是故意的：shell 在底部（L0）和 fallback（L3），runtime 层在中间。把级别映射成"shell、Rust、Node、shell"的人没看懂：第四级是*触发上下文*，不是*能力*级别。

---

## 9. 跨选择的经验

上面 7 个选择不是独立的。它们是一条主论的 7 种表达：**协议是地板，runtime 是可互换的。** 当这条主论成立，那些不那么主流的选择就变得不可避免；不成立时，那些选择看起来是武断的。

3 条经验能泛化到 EKET 之外。

**经验 1 — 优化失败模式，不是顺风局。** 第一个 agent 不需要 CAS。第一个 Slaver 不需要 Saga。第一台 host 不需要四级降级。但*第二个* agent 需要，*第二个* Slaver 需要，*第二台* host 需要。7 个选择优化的是第二个 agent / 第二个 Slaver / 第二台 host，不是第一个。在第一个 agent 阶段采纳 EKET 是过度配置；在第二个 agent 阶段是正确配置；等到第三次 agent 事故再上的是配置不足。正确的采纳时刻是"第一次有 2 个并发 executor"而不是"第一次有 1 个 executor"。

**经验 2 — 协议是契约，runtime 是可互换的。** 同一份 `eket task:claim` 在 L0 shell、L1 Rust、L2 Node.js 都能跑。同一张 `tickets` 表是事实源。同一个 Saga 补偿同样的 5 步。当 L2 Node.js 进程死了，L3 Shell fallback 接住同一份状态、同样的操作。原则能泛化：任何声称"优雅降级"的系统应该能指着协议层说"runtime 变了协议还在"。如果协议和 runtime 是同一件事，没有东西可以降。

**经验 3 — 状态机是有限有状态工作流的对原语。** CRDT 是最终一致文档的对原语。纯事件溯源是 append-only 审计日志的对原语。状态机是"一组有限资源，遍历定义好的状态集合，transition 集合有定义，恢复故事有定义"的对原语。大多数协调层属于第三类。错误是因为前两个时髦就拿前两个，过晚才发现跟负载不匹配。对的原语是匹配负载的那个，不是匹配热点的那个。

元教训，短而坦白：**这 7 个选择是按我们的经验、在设计评审时被问到最多的那 7 个**。它们不是唯一的选择。它们甚至不一定是最重要的选择。它们是*默认方案*（Postgres、分布式锁、monorepo、纯 Rust、分角色协议、CRDT、三级）是多数团队会选的那个、*承重理由*从表面看不显然的那 7 个。这篇文章存在，是为了让下一次设计评审不必从零重推一遍。

---

## 10. 参考

- **内部 — 协议层**：
  - `docs/articles/01-what-is-eket/en/article.md:1-225` — 论点文章，含协议层摘要
  - `docs/articles/02-why-you-need-eket/en/article.md:1-265` — 痛点 × 解法 × ROI 论证
  - `docs/articles/04-three-repo-arch/en/article.md:1-318` — 生命周期分离论（选择 3 深入）
  - `docs/articles/05-four-level-degradation/en/article.md:1-314` — 四级模型（选择 4 与选择 7 深入）
  - `docs/articles/06-master-slaver-protocol/en/article.md:1-536` — 状态机与 CAS 原语（选择 2 与选择 6 深入）
- **内部 — ADR**：
  - `docs/adr/ADR-001-four-level-degradation.md:32-42` — 四级决策
  - `docs/adr/ADR-002-master-slaver-mode.md:23-30` — Master/Slaver 统一决策
  - `docs/adr/ADR-003-file-queue-fallback.md:96-131` — file-queue 地板决策
- **内部 — 架构**：
  - `docs/architecture/THREE_REPO_ARCHITECTURE.md:1-338` — 三仓 spec
  - `docs/architecture/three-repo-deployment.md:242-249` — 权限矩阵
  - `docs/architecture/three-repo-deployment.md:301-304` — submodule-or-sibling 逃生通道
  - `docs/architecture/DEGRADATION-STRATEGY.md:1-591` — 四级权威 spec
  - `docs/architecture/DEGRADATION-STRATEGY.md:18-46` — runtime 降级阶梯
  - `docs/architecture/DEGRADATION-STRATEGY.md:114-124` — `ConnectionManager` 4 级阶梯
  - `docs/architecture/DEGRADATION-STRATEGY.md:228-246` — 断路器
  - `docs/architecture/THREE-LEVEL-ARCHITECTURE.md:1-3` — 历史（冻结）三级
- **内部 — 源码**：
  - `node/src/core/task-checkpoint.ts:85-108` — `_casUpdate` 带 `WHERE version = ?` 守卫
  - `node/src/core/saga-executor.ts:22-66` — `SagaExecutor` 按反序补偿
  - `node/src/core/state-reconciler.ts:96-348` — file-queue WAL 回放
  - `rust/crates/eket-core/src/ticket.rs:100-103` — 原子写 `tmp → rename`
  - `rust/crates/eket-core/src/ticket.rs:72-145` — `set_status` 带 `tmp → rename`
  - `rust/crates/eket-core/src/election.rs:79-84` — `ElectionLevel { File, Sqlite, Redis }`
  - `rust/crates/eket-core/src/election.rs:294` — 用于 master 选举的 `SETNX`（不用于 ticket claim）
  - `rust/crates/eket-core/src/saga.rs:30-94` — `SagaExecutor` Rust 镜像
  - `rust/crates/eket-core/src/saga.rs:233-288` — `middle_step_fails_rolls_back` 单元测试
- **内部 — 协议 schema**：
  - `protocol/state-machines/ticket-status.yml:1-111` — 17 个细粒度状态带 `who_can_transition` 列表
  - `protocol/state-machines/ticket-status.yml:14-91` — `ready → in_progress` transition 带 `who_can_transition: [slaver]`
  - `protocol/state-machines/ticket-status.yml:67-86` — `review → gate_review → merged` transitions
- **内部 — 脚本**：
  - `scripts/eket-slaver-auto.sh:1-322` — L0 Slaver 循环，322 行（`wc -l`）
  - `scripts/heartbeat-monitor.sh:1-390` — L0 heartbeat，390 行（`wc -l`）
  - `scripts/ticket-board.sh:1-328` — L0 板视图，328 行（`wc -l`）
  - `scripts/eket-start.sh:1-883` — L0 Master 启动，883 行（`wc -l`）
  - `scripts/validate-ticket-pr.sh:1-78` — ticket PR 的 4 条规则 CI 网关（78 行，`wc -l`）
  - `scripts/check-ticket-immutability.sh:1-94` — ticket 不可变性的 7 字段 pre-commit 网关（94 行，`wc -l`）
- **内部 — 头条数字**：
  - `README.md:140-145` — `task:claim` 19×、冷启动 187×、内存 10×
  - `docs/getting-started/QUICKSTART.md:10-14` — 每模式启动 / 内存表
  - `benchmarks/baseline.json:5-6` — file-queue p95 地板（enqueue 0.77 ms、dequeue 1.54 ms）
- **Memory KB**：
  - `confluence/memory/MEMORY.md:1-91` — 顶层索引
  - `confluence/memory/pitfalls/slaver-worktree-code-loss.md:1-46` — 触发生命周期拆分的那条教训
- **Glossary**: [`docs/articles/GLOSSARY.md:1-46`](../../GLOSSARY.md)
- **系列导航**：
  - 上一篇：[`02-why-you-need-eket`](../../02-why-you-need-eket/zh-CN/article.md) — 痛点 × 解法 × ROI 论证
  - 下一篇：[`04-three-repo-arch`](../../04-three-repo-arch/zh-CN/article.md) — 生命周期分离深入
