# 05 —— 四级降级：Shell -> Rust -> Node -> Shell

> **TL;DR** —— EKET 用**四份**实现去交付**同一份**协议，按能力排序：L0 Shell、L1 Rust、L2 Node.js、L3 Shell 降级。协议本身从不随级别变化；变化的只是底层实现。这是为什么大多数「AI 编排」工具在 Redis 或 Node.js 不可用的那天就停了，而 EKET 还能在一台没装 Node、没装 Redis、没装 SQLite 的 CI runner 上，靠一个 `bash` 解析器和 `scripts/eket-slaver-auto.sh`（**322 行**，`wc -l` 验证）继续协调。降级不是见不得人的回退；它是**承载重量的设计**——没有它，其他设计都站不住。

> **核心要点**
> 1. 同一份协议，四份实现：L0 Shell（零依赖）、L1 Rust（高速）、L2 Node.js（满血）、L3 Shell（L2 挂掉时的降级）。L0 是**地板**，不是占位。
> 2. **同协议不变量**才是承重约束：L0、L1、L2、L3 下的 `eket task:claim` 是对**同一份** SQLite 文件的**同一种**操作，语义**完全一致**。
> 3. L0 实现是 `scripts/eket-slaver-auto.sh` 里的 **322 行 bash**（下文有 `wc -l` 证据）。它是完整的，不是桩。
> 4. 触发和恢复都是自动的：`eket system:doctor` 报告当前激活的级别；断路器在 30 秒冷却后重连 Redis（`docs/architecture/DEGRADATION-STRATEGY.md:228-246`）。
> 5. 原则可迁移：每个生产系统都应该有一个 **shell 地板**，在它最快的运行时挂掉时仍然能跑。

---

## Executive Summary

**给决策者（读完这段即可离开）：**

| 问题 | 答案 |
|---|---|
| 这是什么？ | 一份协议、四个实现，由环境里「还活着什么」自动选。 |
| 为什么要关心？ | 别的工具在 Redis 或 Node 挂掉那天就停了；EKET 还能用 `bash` 继续协调。 |
| 代价是什么？ | 维护一套 shell 脚本来镜像协议操作。`scripts/eket-slaver-auto.sh` 是 **322 行**——这是你为可用性付的最小账单。 |
| 不做的风险？ | Redis 一抖动，你的「AI 编排」工具就成了一块死屏。团队退回 Slack 群和 Notion 文档——**协调债复利累积**。 |
| 什么时候是过度设计？ | 单人、单 agent、零并发。永远不会有第二个执行者时，地板是多余的。 |

本文其余部分展开四个级别、能力矩阵、触发和恢复流程，最后用一个 Redis 宕机的端到端示例走通全程。

---

## 目录

1. 动机
2. 核心论点
3. 协议如何运转
4. 取舍与替代方案
5. 实现要点
6. 经验教训
7. 参考

---

## 1. 动机

2024 年底到 2026 年中之间，「AI 编排」成了一个品类。这个品类里绝大多数产品共享一个隐藏假设：**Redis 在、Node.js 在、dashboard 在**。三者之一挂了，产品就挂了——不是因为 LLM 不工作，而是因为**协调层**不工作了。

大多数团队的标准恢复剧本，坦率说，挺难堪的：

1. 14:00 Redis 抖了一下。
2. agent dashboard 亮起红条：「Service degraded」。
3. 跑到一半的 agent 全部丢失状态。25 分钟读代码的功夫归零。
4. 群里有人问：「就我这样？」
5. on-call 重启 Redis。
6. 14:18 agent 回来。**它们重新读代码**。
7. 团队写 post-mortem，标题叫「协调层宕机」，决定加一个 Redis 从库。

复盘漏掉了关键一点。**协调层本身设计没错；它是为单一 tier 设计的。** 错在认为一个 tier 足够。

EKET 的赌注：把协议装在**四个** tier 里跑。当一个 tier 挂掉，**下一个**已经在那儿，做着同一件事、操着同一份状态。L0 实现是地板。它不是桩。它是一份完整的、工作的协议实现，能在一台什么都没装的 Linux 容器里跑起来。

> 「如果你的协调层在 Redis 挂掉那天就挂，你拥有的不是协调层——你拥有的是一个套了壳的 Redis 客户端。」
> —— *EKET 设计笔记，2026-04，改写自 `01-what-is-eket/zh-CN/article.md:57-58`*

四级模型回答的是每个其他编排工具拒绝回答的问题：**当实现协议的运行时就是那个挂掉的东西时，协议会怎样？**

---

## 2. 核心论点

四级模型立在一个核心论点上，下面有三根支柱。

### 2.1 协议是地板，不是实现

大多数栈把协议当作**某个运行时的特性**（Redis Pub/Sub、Node 事件循环，等等）。EKET 反过来：**协议**是地板；运行时是可互换的实现，叠在它上面。运行时可以单独挂；协议不能。

这和 TCP 与任何具体 TCP 栈的关系一模一样：TCP 是协议；Linux 的 `tcp_impl` 和 FreeBSD 的 `tcp_impl` 是可互换的实现。如果你写了一个分布式系统只跑在 Linux 上，等它在 FreeBSD 上挂了，你不会说「TCP 挂了」——你会说「我们忘了协议层」。

### 2.2 同协议不变量

`01-what-is-eket/zh-CN/article.md:131-140` 给出了规范的能力矩阵。下文 3.1 节的表是更细的版本。不变量用一句话概括：通过 L0 shell 领取的 ticket 和通过 L1 Rust CLI 领取的是**同一个 ticket**。`tickets` 表里的同一行，同一个 CAS 原语，下游是同一个 `task:complete` Saga。

不变量是让降级变便宜的原因。如果 L0 实现用的是**另一套**数据模型，降级就要迁移状态。有了不变量，降级只是「换二进制」。状态在磁盘上，在同一份 SQLite 文件里。L0 shell 实现读的就是 L1 Rust 实现写的那张 `tickets` 表。

### 2.3 恢复是设计的一部分，不是事后补丁

自封「弹性」系统的常见失败模式：降级是一道单向门。一旦降级，就停在那儿，等人来重启高级 tier。EKET 的设计**拒绝**这种模式。**L2 -> L3 触发和 L3 -> L2 恢复都是自动的**，30 秒冷却，由断路器主导（`docs/architecture/DEGRADATION-STRATEGY.md:228-246`）。系统不是「降级了直到重启」——而是「降级了直到高级 tier 重新健康」。

> 「协议的承诺是循环不停，不是循环永远最快。」
> —— *EKET 设计笔记，2026-04*

优先级在架构文档里写得直白：**可用性 > 性能 > 功能完整性**（`docs/architecture/DEGRADATION-STRATEGY.md:583`）。一个跑在半速的系统，好过一个不跑的系统。

---

## 3. 协议如何运转

### 3.1 能力矩阵

四个级别最好按能力阶梯读。每个级别在语义上**包含**上一级；每个级别比上一级**少**一项能力。

| 级别 | 实现 | 依赖 | 延迟（p95） | 能做什么 | 不能做什么 |
|---|---|---|---|---|---|
| **L0** | `scripts/eket-*.sh`（零依赖） | `bash` 4.0+、`git`、文件系统 | ~5 ms（`task:claim`） | 读 ticket、文件锁 claim、写状态、心跳、分支、提交 | 跨主机并发 claim、分布式 pub/sub、LLM gateway、webhook、dashboard |
| **L1** | `rust/crates/eket-cli/` | L0 + `cargo` 编译产物、SQLite | ~21 ms（`task:claim`） | 完整 SQLite CAS、axum HTTP API（端口 9877）、高速 claim 循环、crash-safe `task:resume` | 实时跨主机 pub/sub、dashboard UI、hook server |
| **L2** | `node/src/`（TypeScript） | L1 + Node.js 18+、`npm` | ~500 ms（`task:claim`） | 完整 Saga 5 步、dashboard、LLM gateway、hook server、webhook、跨工具桥 | 撑过一次 Node.js 进程崩溃；不靠运维人工介入就恢复 |
| **L3** | Shell 降级 | 与 L0 相同 | ~5 ms（`task:claim`） | 读 ticket、文件锁 claim、心跳、写状态 | L0 做不了的事（跨主机并发、分布式 pub/sub、LLM gateway） |

> 延迟列来源：`.claude/skills/eket/references/architecture.md:29`（L0 ~5 ms、L1 ~21 ms、L2 ~500 ms）。「不能做什么」来源：`01-what-is-eket/zh-CN/article.md:131-140` 与 `docs/architecture/DEGRADATION-STRATEGY.md:18-46`（运行时降级阶梯）。

矩阵里一个不显然的性质：**L0 和 L3 拥有相同的实现表面**（`scripts/eket-*.sh`），但在不同条件下激活。L0 是「什么都没装」时的入口（全新 CI runner、灾备主机）。L3 是「L1 Rust 在但 L2 Node.js 刚挂」时的降级。同一段代码路径，不同的触发。

### 3.2 「322 行 shell」声明——已验证

「L0 实现很小」不是口号，是 `wc -l` 测出来的：

```
$ wc -l scripts/eket-slaver-auto.sh
     322 scripts/eket-slaver-auto.sh
```

`scripts/eket-slaver-auto.sh` 是 **322 行 bash**（写作时验证，`wc -l scripts/eket-slaver-auto.sh`）。文件把 Slaver 协议的全流程跑完：扫 `jira/tickets/` 找 `READY` ticket（`scripts/eket-slaver-auto.sh:75-100`）、按优先级排序（`scripts/eket-slaver-auto.sh:103-118`）、挑最高优先级（`scripts/eket-slaver-auto.sh:128-145`）、状态机推进到 `in_progress`（`scripts/eket-slaver-auto.sh:150-178`）、建 worktree 和 `feature/TASK-NNN` 分支（`scripts/eket-slaver-auto.sh:183-207`）、加载 agent profile（`scripts/eket-slaver-auto.sh:212-225`）、输出下一步指令（`scripts/eket-slaver-auto.sh:230-301`）。它不是桩。

对照看，其他核心 shell 脚本同样精炼：`scripts/heartbeat-monitor.sh` **390 行**（`wc -l scripts/heartbeat-monitor.sh`）、`scripts/ticket-board.sh` **328 行**（`wc -l scripts/ticket-board.sh`）、`scripts/quick-setup.sh` **533 行**（`wc -l scripts/quick-setup.sh`，含安装路径）。重点不是具体数字；重点是**整个 L0 表面在「每个关注点几百行 shell」的尺度上**——这是一份可读、可审、可移植的产物。

深层教训是结构性的：当 L0 实现是几百行，**一个人 15 分钟能读完，验证它和文档一致**。当 L0 实现是 8000 行 TypeScript，永远没人会读完。

### 3.3 运行时降级阶梯

L0/L1/L2/L3 是**用户视角**的标签。内部，同一份架构文档用 Level 1/2/3 标**运行时**阶梯，编号方向反过来（Level 3 = 满血，Level 1 = shell）。`docs/architecture/DEGRADATION-STRATEGY.md:18-46` 给出运行时阶梯：

```
Level 3: Redis + SQLite（满血版）
  ↓ Redis 不可用或连不上
Level 2: Node.js + 文件队列（增强版）
  ↓ Node.js 不可用或崩溃
Level 1: Shell + 文件队列（基础版）
  ↓ 全部失败
优雅退出 + 错误日志
```

**第二把阶梯**埋在 L1/L2 运行时内部——**ConnectionManager 四级阶梯**（`docs/architecture/DEGRADATION-STRATEGY.md:114-124`）：

```
Level 3-A: 远程 Redis（分布式）
  ↓ 远程 Redis 不可用
Level 3-B: 本地 Redis
  ↓ 本地 Redis 不可用
Level 3-C: SQLite（持久化）
  ↓ SQLite 不可用
Level 3-D: 文件队列（离线）
```

两把阶梯会组合：当外层阶梯在 L2（Node.js）、内层阶梯在 L3-D（文件队列）时，**系统仍然在跑**——跑在 shell 上、文件队列上，没有 Redis、没有 SQLite、没有 Node。

### 3.4 触发条件

触发条件是显式的、可测的，是这个设计审计轨迹的胜利之一。`docs/architecture/DEGRADATION-STRATEGY.md:52-90` 原文给出触发表：

| 转换 | 触发 |
|---|---|
| L3 -> L2（Redis 宕） | Redis 连接超时（默认 5 秒）、连接拒绝、认证失败、连续 3 次命令错误、SQLite 损坏或不可写（`docs/architecture/DEGRADATION-STRATEGY.md:54-59`） |
| L2 -> L1（Node 宕） | Node.js 进程崩溃、`dist/index.js` 缺失、关键 Node 模块缺失（`ioredis`、`better-sqlite3`）、Node < 18.0.0、内存 > 90%（`docs/architecture/DEGRADATION-STRATEGY.md:86-90`） |
| 恢复（L_n -> L_(n+1)） | 健康检查 `ping()` 连续 3 次成功，期间冷却 30 秒（`docs/architecture/DEGRADATION-STRATEGY.md:208-222`） |

恢复由断路器主导（`docs/architecture/DEGRADATION-STRATEGY.md:228-246`），5 次失败阈值，30 秒冷却，3 次半开探针。半开探针成功，断路器闭合，运行时升级到上一级。Agent 或人不需要想这件事。

### 3.5 「降级在行动」——一份端到端示例

挑一个生产里会撞上的场景：**14:00 Redis 常规配置变更需要重启，重启耗时 90 秒。同时三个 Slaver 跑到一半。**

**第 1 步 —— 14:00:00，Redis 停了。**

`MessageQueue` 适配器（`docs/architecture/DEGRADATION-STRATEGY.md:62-72`）调用 `redis.publish('tasks', message)`。返回 `ECONNREFUSED 127.0.0.1:6379`。内部 `useRedis: true, fallbackToFile: true` 配置把这次调用**透明地**路由到文件队列实现。**调用方代码一行没改。**

**第 2 步 —— 14:00:01，断路器打开。**

5 次 `redis.ping()` 失败（每 10 秒一次健康检查，`docs/architecture/DEGRADATION-STRATEGY.md:208-222`）后，Redis 断路器进入 `Open` 状态（`docs/architecture/DEGRADATION-STRATEGY.md:250-266`）。后续所有 Redis 调用短路，全部路由到文件队列。**没有请求在死 Redis 上阻塞。**

**第 3 步 —— 14:00:02，三个 Slaver 继续工作。**

三个 Slaver 不知情，照常通过 L1 Rust CLI 跑完 `task:claim`。`tickets` 表上的 CAS 不依赖 Redis，照常工作（`docs/architecture/DEGRADATION-STRATEGY.md:155-188`）。Ticket 从 `READY` 转到 `IN_PROGRESS`，和满血运行时完全一致。25 分钟读代码的脑力成果**保住了**。协议没变。

**第 4 步 —— 14:00:30，告警发出。**

告警 hook（`docs/architecture/DEGRADATION-STRATEGY.md:341-353`）发出 `WARN: System degraded from Redis to File Queue` 事件。On-call 频道看到。**团队被通知；系统没停。** 这就是 `docs/architecture/DEGRADATION-STRATEGY.md:583` 写的设计意图：可用性第一，性能第二，功能完整性第三。

**第 5 步 —— 14:01:30，Redis 回来。**

14:01:00 的半开探针（`docs/architecture/DEGRADATION-STRATEGY.md:228-246`）发起 `redis.ping()`，得到 `PONG`。断路器闭合。新操作重新走 Redis。**飞行中的文件队列消息正常收尾；文件队列不会「丢」在半路的项目。**

**第 6 步 —— 14:01:31，系统回到满血。**

`eket system:doctor`（`01-what-is-eket/zh-CN/article.md:140`）报告新的激活级别。`task:complete` Saga 重新跑在 Redis 上。延迟回到 L1 的 ~21 ms 地基。

90 秒的降级窗口对运维是一条 warning。对 agent 和 ticket 状态机**完全透明**。**协议幸存，因为协议不是实现它的运行时。** 这就是「我们拥有协调层」和「我们拥有套了壳的 Redis 客户端」之间的实际差距。

### 3.6 ADR 锚

`docs/adr/ADR-001-four-level-degradation.md:32-42` 把设计决策写成代码：四级排序 远程 Redis -> 本地 Redis -> SQLite -> 文件队列。`docs/adr/ADR-003-file-queue-fallback.md:127-131` 给出底层的性能地板（文件写 ~20 ms、文件读 ~10 ms），并明确选它作为「最佳降级」，因为它是表中（`docs/adr/ADR-003-file-queue-fallback.md:96-100`）**唯一**的零依赖项。

---

## 4. 取舍与替代方案

### 4.1 四级的成本

| 成本 | 为什么真实 | 为什么值得 |
|---|---|---|
| 维护两套实现表面（shell + Rust + Node） | 每个协议操作至少有两份实现。修一个 bug 不会自动同步到另一份。 | Redis 挂掉那天，团队还在发版。维护成本是**可用性的价格**；另一选项是 Slack 群退路（见 1 节）。 |
| 性能差异 | L0/L3 文件队列 p95 约 2 ms（`docs/architecture/DEGRADATION-STRATEGY.md:278`）；L2 Redis Pub/Sub p95 约 0.5 ms（`docs/architecture/DEGRADATION-STRATEGY.md:276`）。 | 4 倍 p95 差异在 30 分钟宕机面前**完全透明**。 |
| 测试表面 | 每次转换路径（L3->L2、L2->L1、L1->L2、L2->L3）都需要测试。`docs/architecture/DEGRADATION-STRATEGY.md:524-570` 给出人工测试脚本。 | 测试就是审计轨迹。也是下一任 on-call 的文档。 |
| 文档漂移 | 架构文档 **591 行**（`wc -l docs/architecture/DEGRADATION-STRATEGY.md`）；让它和代码同步是笔税。 | 591 行权威规范，加上本系列文章，是撑过一年重构的最小文档表面。 |

### 4.2 四级换来什么

1. **协调连续性。** 凌晨两点的 CI runner 上，没有 Redis、没有 Node 的 Slaver 还能通过 `bash scripts/eket-slaver-auto.sh` 领 ticket。协议一样；不见的是 dashboard。
2. **扛得住的升级。** 团队发 L2.4 时，Node 这一层可以失败而不把系统拖下水——agent 降级到 L0/L3，shell 领活，Node 升级滚动期间 ticket 照常完成。
3. **写在源码里的灾备。** 一个新 region 上线就是 `git clone` + `bash scripts/eket-slaver-auto.sh`。**没有包安装，没有 Redis seed，没有迁移脚本。** 灾备流程是 `git clone`。
4. **可审计的行为。** `eket system:doctor`（`docs/architecture/DEGRADATION-STRATEGY.md:434-446`）一条命令报出现在激活的是哪一级、为什么、丢了什么（通常什么都没丢）。On-call 不用猜。

### 4.3 替代方案，以及它们各自缺什么

| 替代方案 | 它能给的 | 它漏的 |
|---|---|---|
| **纯 Redis**（LangGraph、CrewAI、AutoGen 默认） | 速度、pub/sub 语义、成熟生态 | Redis 挂，协调死。**没有同协议不变量**。 |
| **纯 Node.js**（OpenAI Swarm、多数 LLM 框架） | TypeScript DX、Web 生态 | Node 挂，协调死。**没有 shell 地板**。 |
| **纯 SQLite**（轻量工具） | ACID、单文件 | 主机挂，协调死。**没有跨主机降级**。 |
| **GitHub Projects + Actions** | 分支保护、PR 模板 | 知识、任务、代码被混在一起（`02-why-you-need-eket/zh-CN/article.md:155`）；**没有协议级降级**。 |
| **EKET 四级** | 同一份协议、四个运行时、自动恢复 | 4.1 节的维护成本。**唯一带 shell 地板的选项**。 |

### 4.4 四级不适合你的场景

- 单人、无 agent、无 CI。协调负载太低，摊不薄维护税。
- 不会承诺两套实现保持同步的团队。L0 实现一旦和 L1 漂移，**设计会响亮地崩**。
- 监管要求单一已审计运行时的环境。EKET 的审计面更宽，因为审计单位是协议，不是运行时。

---

## 5. 实现要点

### 5.1 你实际跑的命令

```bash
# 看当前激活的级别
eket system:doctor

# 强制级别切换（仅运维用）
node node/dist/index.js system:set-level --level 1

# 直接跑 L0 Slaver 循环
bash scripts/eket-slaver-auto.sh

# Redis 挂的时候看文件队列
ls -la .eket/data/queue/pending/ .eket/data/queue/processed/
```

（来源：`01-what-is-eket/zh-CN/article.md:171-185`；`docs/architecture/DEGRADATION-STRATEGY.md:424-446`。）

### 5.2 源码哪里看

| 关注点 | 路径 | 行数 | 备注 |
|---|---|---|---|
| L0 Slaver 循环（Slaver 端端到端） | `scripts/eket-slaver-auto.sh` | **322 行**（`wc -l`） | 完整的 ticket 领取 + 分支 + 提交 shell 表面。 |
| L0 Master 启动 | `scripts/eket-start.sh` | 883 行（`wc -l`） | 含安装路径，不全在热路径。 |
| L0 心跳 | `scripts/heartbeat-monitor.sh` | 390 行（`wc -l`） | 独立的存活信号。 |
| L0 板视图 | `scripts/ticket-board.sh` | 328 行（`wc -l`） | 人类可读的 ticket 板。 |
| L1 Rust CLI | `rust/crates/eket-cli/` | （按源码） | 完整 CAS、axum HTTP API。 |
| L2 Node.js 核心 | `node/src/` | （按源码） | Dashboard、LLM gateway、hook server。 |
| 运行时降级阶梯 | `docs/architecture/DEGRADATION-STRATEGY.md:18-46` | （591 行文档） | 外层 L1/L2/L3 阶梯。 |
| ConnectionManager 四级 | `docs/architecture/DEGRADATION-STRATEGY.md:114-124` | — | 内层 L3-A/B/C/D 阶梯。 |
| 断路器 | `docs/architecture/DEGRADATION-STRATEGY.md:228-266` | — | 5 次失败阈值，30 秒冷却。 |
| Master 选举三步 | `docs/architecture/DEGRADATION-STRATEGY.md:155-188` | — | Redis SETNX -> SQLite 行锁 -> `mkdir` 锁。 |
| 走通的场景 | `docs/architecture/DEGRADATION-STRATEGY.md:464-517` | — | Redis 维护、Node 崩溃、网络分区。 |
| ADR：为什么四级 | `docs/adr/ADR-001-four-level-degradation.md:32-42` | — | 决策记录。 |
| ADR：为什么文件队列 | `docs/adr/ADR-003-file-queue-fallback.md:96-131` | — | 底层 ADR。 |

### 5.3 仓库内交叉引用

- 论述文章：`01-what-is-eket/zh-CN/article.md:131-140`（L0-L3 矩阵，简化版）
- 痛点 x 解法文章：`02-why-you-need-eket/zh-CN/article.md:128-135`（协议不是语言的论证）
- 权威规范：`docs/architecture/DEGRADATION-STRATEGY.md:1`（**591 行**，「它怎么活下来」的事实源）
- 三级（历史）：`docs/architecture/THREE-LEVEL-ARCHITECTURE.md:1-3`（566 行文档，已冻结；被四级模型取代）
- 术语表：`docs/articles/GLOSSARY.md:15`（Four-Level Degradation 词条）

---

## 6. 经验教训

**教训 1 —— 每个生产系统都应该有一个 shell 地板。** 大多数自封「高可用」的栈都藏着单点：承载「高可用机器」的运行时本身。运行时挂了，那台本应兜底的机器也没了。修法是结构性的：**L0 实现必须是一份完整的、工作的协议版本，只靠 `bash` 就能跑。** 不是桩，不是「最小子集」，不是占位。322 行 shell（`scripts/eket-slaver-auto.sh:1-322`）的完整 Slaver 循环是你为这个性质付的最小账单。原则可迁移：任何依赖重型运行时（Java、.NET、Node、Elixir）的系统都应该能**说出自己的 shell 地板是什么，并证明它能跑**。

**教训 2 —— 同协议不变量是承重约束。** 容易把降级想成「退回一个更简单的版本」。这是错的框架。正确的框架是：**协议是固定的；实现它的运行时是可互换的。** 当 L0 实现是同一份 SQLite 文件上面的一层薄壳，而 L1 Rust CLI 写的就是这张表，L0 -> L1 转换是换二进制，不是数据迁移。当协议是独立于运行时的一层，恢复自动、状态保留。当协议**不是**独立的一层——当协议只是「Node 应用碰巧在做的事」——根本没东西可以降级。原则可迁移：任何声称「优雅降级」的系统都应该能**指出跨运行时幸存下来的那一层协议**。

**教训 3 —— 降级是 feature，不是丢人的回退。** `scripts/eket-slaver-auto.sh` 里的 L0 实现是整个代码库**被审得最细**的那部分，因为它是**最重要的**。Shell 挂了，其他一切都不算数。架构文档把这件事写白了：可用性 > 性能 > 功能完整性（`docs/architecture/DEGRADATION-STRATEGY.md:583`）。一个慢的、丑的、工作的系统，赢过一个快的、光鲜的、死的系统。原则可迁移：**按顺序排设计优先级，把地板放第一**。

---

## 7. 参考

- **权威规范**：`docs/architecture/DEGRADATION-STRATEGY.md:1`——**591 行**，四级模型的事实源。
- **历史三级**（已冻结，被取代）：`docs/architecture/THREE-LEVEL-ARCHITECTURE.md:1`——**566 行**，留作考古。
- **ADR**：
  - `docs/adr/ADR-001-four-level-degradation.md:32-42`——为什么四级的决策
  - `docs/adr/ADR-003-file-queue-fallback.md:96-131`——为什么文件队列的决策
- **代码**：
  - `scripts/eket-slaver-auto.sh:1-322`——**322 行**（`wc -l`），L0 Slaver 循环
  - `scripts/eket-start.sh:1-883`——**883 行**（`wc -l`），L0 Master 启动
  - `scripts/heartbeat-monitor.sh:1-390`——**390 行**（`wc -l`），L0 心跳
  - `scripts/ticket-board.sh:1-328`——**328 行**（`wc -l`），L0 板视图
  - `rust/crates/eket-cli/`——L1 Rust 核心
  - `node/src/`——L2 Node.js 核心
- **系列前文**：
  - `01-what-is-eket/zh-CN/article.md:131-140`——L0-L3 矩阵（简化版）
  - `02-why-you-need-eket/zh-CN/article.md:128-135`——协议不是语言的论证
- **术语表**：`docs/articles/GLOSSARY.md:15`（Four-Level Degradation 词条）
- **系列下一篇**：[`06-master-slaver-protocol`](../../06-master-slaver-protocol/zh-CN/article.md)——Master-Slaver 状态机深入
