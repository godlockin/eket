# 13 —— ADR 与路线图：三项决策、十二个月

> **TL;DR** —— 这篇文章做两件事，并且把它们放在同一页上。**第一**，把 EKET 已经接受的 3 份架构决策记录（ADR-001 四级降级即 L0 投资、ADR-002 Master-Slaver 模式即人机统一、ADR-003 文件队列降级即 L0 实现）逐一复盘，每份都按**背景 / 决策 / 后果**的结构铺开，并保留原始决策者的措辞。**第二**，在 3 份 ADR 之上铺出一张 12 个月的路线图——**3 个阶段、阶段退出条件是数字而不是形容词、至少 4 条会真正**让计划失效的风险，每条配一个具体动作而不是一句愿望。贯穿全文的母题是：ADR 是团队与未来自己的契约，路线图是框架与用户的契约。契约的检验点在**下一次事故发生的时刻**，不是下一篇博客发布的时刻。

> **核心要点**
> 1. 截至 v2.19.0-beta，EKET 共有 **3 份已接受 ADR**（`docs/adr/ADR-001-four-level-degradation.md:1`、`docs/adr/ADR-002-master-slaver-mode.md:1`、`docs/adr/ADR-003-file-queue-fallback.md:1`）；下文「待定问题」段把未来 3 份候选 ADR 先画出来。
> 2. ADR 是为**承重决策**服务的——推翻它需要重写协议的那种。ADR-001、002、003 都过这条线；「我们选了 X 库而不是 Y 库」通常不过。
> 3. 人机统一（ADR-002）是这组决策里**唯一**推翻它会改变整个协议、而不仅是改变实现的一条。其它两条都可以优雅降级；这一条不会。
> 4. 12 个月路线图**刻意**不是 feature 愿望清单。每个阶段带一个数字退出条件；整套计划假设 L0 地板在所有东西都挂掉时仍然能跑（`docs/adr/ADR-003-file-queue-fallback.md:111-117`）。
> 5. 「路线图风险」段说的是**让计划失效**的事——不是让团队不便的事。每条风险都带一个具体动作，下一季度开始前就能开干。

---

## Executive Summary

**给决策者（读完这段即可离开）：**

| 问题 | 答案 |
|---|---|
| 本文目的？ | 复盘 EKET 已接受的 3 份 ADR，画出未来 3 份候选 ADR，发布一张 12 个月、阶段退出条件是数字的路线图。 |
| 为什么要读？ | 2026 年 LLM 框架的成本**不在**模型质量，而在底层 LLM 工具、宿主、团队三者同时变化时还能不能保持一致的形状。ADR 是这个形状；路线图是它怎么演化。 |
| 一句话结论？ | 3 份 ADR 稳定，L0 地板承重，未来 12 个月的核心是**耐久性与可观测性**——不是再加 LLM 工具。 |
| 路线图的代价？ | 3 个阶段各 4 个月，每阶段 3 个明确数字。没达到退出条件，触发计划修订——**不是**触发 ADR 修订。 |
| 推翻 ADR 的代价？ | 推 ADR-001：L0 地板消失，Redis 抖动那天团队退回 Slack 群。推 ADR-002：协议裂成「human 模式」与「AI 模式」，EKET 存在要消除的那类 bug 重新出现。推 ADR-003：四级 ladder 断底，三级历史模型里那个「L2 挂了没有 L3 兜底」的洞重新出现（`docs/architecture/THREE-LEVEL-ARCHITECTURE.md:1-3`）。 |

下文先讲 ADR 是什么、什么时候该写，再依次复盘 3 份已接受的 ADR、3 份候选 ADR、12 个月 3 个阶段、4 条会失效计划的风险，最后是参考。

---

## 目录

1. 动机——为什么 ADR 和路线图要合在一篇里
2. 什么是 ADR——什么时候该写，什么时候不该
3. ADR-001——四级降级（L0 投资）
4. ADR-002——Master-Slaver 模式（人机统一）
5. ADR-003——文件队列降级（L0 实现）
6. 待定问题——未来 12 个月的 3 份候选 ADR
7. 12 个月路线图——3 个阶段与退出条件
8. 路线图风险——什么会让计划失效
9. 参考

---

## 1. 动机——为什么 ADR 和路线图要合在一篇里

两份文档通常由不同的人在不同时刻写：ADR 编码**为什么做这个决策**，路线图编码**下一步要造什么**。它们有联系，但写的时候常被当成没有联系。决策者签 ADR，项目经理签路线图；两个受众互相不读。

本文把它们放到同一页上，顺序是**先决策、后规划、最后识别风险**。理由是：ADR **就是**路线图的约束集。路线图如果与已接受 ADR 矛盾，要么路线图错了，要么在试图推翻 ADR。路线图如果忽略 ADR，那是愿望清单，不是路线图。

本文与现存文档不重复的三点：

- **`docs/articles/05-four-level-degradation/en/article.md:1-314`** 详细解释四级模型。本文把它当**决策**看，不是描述。
- **`docs/articles/06-master-slaver-protocol/en/article.md:1-535`** 详细解释状态机。本文把它当**决策**看。
- **`docs/roadmap/README.md:1-46`** 是现有的短版路线图。本文是**带证据的长版**，架构师或新贡献者读完不用再翻 `docs/archive/roadmap-history/`。

文章结构按 ticket 的要求排：ADR 入门、3 份已存在的 ADR、3 份候选 ADR、3 个阶段、4 条风险、参考。每份 ADR 用同样的形状（背景 / 决策 / 后果），便于横向对比。风险段每条都给一个**可执行**的 mitigation——没有 mitigation 的「风险」只是担心，不是风险。

> 「ADR 是团队与未来自己签的契约；路线图是框架与用户签的契约。两次契约都在**下一次事故发生的时刻**被检验，不是在下一次评审会上被检验。」
> —— *EKET 设计笔记，2026-04*

---

## 2. 什么是 ADR——什么时候该写，什么时候不该

架构决策记录（ADR）是一份**短文档**，记录**一个决策**、**催生它的背景**、**承担它的后果**。Michael Nygard 提出、ThoughtWorks、AWS、CNCF 通用的格式骨架一致：标题、状态、背景、决策、后果。EKET 的 ADR 沿用同一骨架（`docs/adr/ADR-001-four-level-degradation.md:1-6`、`docs/adr/ADR-002-master-slaver-mode.md:1-6`、`docs/adr/ADR-003-file-queue-fallback.md:1-6`）。

「要不要写 ADR」有个有用的自检——**「推翻成本测试」**。如果明天的工程师推翻这个决策，他们要重写协议，还是重写一个库？前者是 ADR 候选；后者是 config 变更。

| 决策 | 推翻成本 | 是否值得写 ADR |
|---|---|---|
| 「ticket 状态用 SQLite 不用 Postgres」 | 重写存储层、迁移路径、`rust/crates/eket-core/src/ticket.rs:100-103` 的 `tmp → rename` 镜像 | **是**——但已嵌入架构文档，详见 `docs/articles/03-technical-value-choices/en/article.md:71-105`，不另写 ADR |
| 在**跨主机写**负载下「ticket 状态用 SQLite 不用 Postgres」 | 重写状态机、master 选举、`docs/adr/ADR-001-four-level-degradation.md:32-42` 里的 L4 ladder | **是——且尚未决定**（见 §6.1） |
| HTTP server 用 `axum` crate 不用 `warp` | 换一行 Cargo 依赖 | **否**——属于 `rust/crates/eket-server/Cargo.toml` 注释，不属于 ADR |
| 测试里用 `serde_json::json!` 宏 | 删一行换一种宏 | **否**——code review 注释 |
| 「Master 永远不 claim ticket」 | 改 `protocol/state-machines/ticket-status.yml:14-91` 的角色检查；审查过去每一次 claim | **是——且已编码**于 ADR-002 后果段（`docs/adr/ADR-002-master-slaver-mode.md:127-146`） |

规律是：ADR 服务于**推翻成本是协议级**的决策，不是代码级决策。库选型、宏选型、依赖选型都在 ADR 线以下。横切约束——那些会动状态机、动角色规则、动恢复故事、动部署拓扑的——在 ADR 线以上。

第二个自检：**6 个月后入职的高级工程师，能不能从代码本身**正确地**重新推导出这个决策？** 如果能，ADR 是文档，不是决策；如果不能，ADR 才是决策。`docs/adr/ADR-001..003-*.md` 三份都过第二个测试——未来的工程师无法从代码本身重新推出「为什么是四级不是三级」或「为什么是 Master/Slaver 不是平面」。他们会推出**另一个**决策，得到另一个协议。

第三个测试更细致：**这个决策有没有**约束**一个未来的选择？** ADR-001 约束了「文件队列放在哪？」的未来选择——它承诺「L0 是 shell，L3 是同一份 shell 的另一种触发方式」。ADR-002 约束了「我们加不加『reviewer』角色？」的未来选择——它承诺「Master 是唯一能 transition `review → gate_review` 的角色」。ADR-003 约束了「v4 我们能不能砍掉文件队列？」的未来选择——它承诺「文件队列是四级 ladder 里**唯一**零依赖的选项」。对未来选择的约束是 ADR 的承重测试。

反面也用得上：**不要为没有未来的决策写 ADR**。「我们用 JSON 做 wire format」是个决策，推翻它要动每个 endpoint；它是协议级的；但如果团队打算把 JSON 一直用到项目结束，这个决策是稳的，ADR 是文书。ADR 在**承重且可重审**的决策上才发挥价值。

---

## 3. ADR-001——四级降级（L0 投资）

**状态：** 已接受（`docs/adr/ADR-001-four-level-degradation.md:3`）。
**日期：** 2026-03-26。
**决策者：** EKET Framework Team。
**入选本文的理由：** 它是「L0 地板」**存在**的那份决策。

### 背景

框架必须在异构基础设施上跑：企业环境有远程 Redis 集群，开发机有本地 Redis，CI runner 因策略禁止 Redis。第一版——「没有 Redis 就不行」——在 CI runner 拒接的那一刻失败：agent loop 停了，ticket 状态 stale，on-call 收到告警。团队需要的连接策略要**优雅降级**，不能直接当机（`docs/adr/ADR-001-four-level-degradation.md:9-27`）。

### 决策

交付**四种**连接后端，按能力排序：远程 Redis（Level 1）→ 本地 Redis（Level 2）→ 本地 SQLite（Level 3）→ 本地文件系统（Level 4）（`docs/adr/ADR-001-four-level-degradation.md:32-42`）。启动时探测；自动降级；**支持升级**——高级别恢复时自动切回去（`docs/adr/ADR-001-four-level-degradation.md:58-61`）。驱动是 `ConnectionManager`，对外只暴露一个 `initialize()`；第一个成功的级别成为 active level，其它三个被接进 fallback 链。

四级 ladder 跟 `docs/articles/05-four-level-degradation/en/article.md:100-105` 里 L0/L1/L2/L3 **runtime ladder** 不是同一件事。前者是 L1/L2 runtime 内部的**连接** ladder；后者是 operator 视角下的**运行时** ladder。两者组合（`docs/articles/05-four-level-degradation/en/article.md:151-152`）。

### 后果

**积极**（`docs/adr/ADR-001-four-level-degradation.md:90-96`）：

- 跨部署场景的高可用：企业、dev、CI、edge 都能跑。
- 降级透明：上层代码在 Level 1 与 Level 4 之间不需改。
- 高级别恢复时自动升级。

**消极**（`docs/adr/ADR-001-four-level-degradation.md:97-102`）：

- 四套实现要测；per-level 测试矩阵不小。
- 性能差异：远程 Redis ~1 ms，文件队列 ~20 ms（`docs/adr/ADR-003-file-queue-fallback.md:127-131`）。
- 维护税：每套后端有自己的 bug 面。

**ADR 里就采取的 mitigation**（`docs/adr/ADR-001-four-level-degradation.md:103-107`）：统一接口抽象；自动化测试覆盖所有降级路径；运行时统计与降级事件告警。

**推翻它要付什么代价：** L4 文件队列地板消失，「新容器只有 `bash` 也能让协议活着」的系统声明（`docs/articles/01-what-is-eket/en/article.md:135-140`）变成假话。「地板的运维成本」是可用性的对价，ADR 是团队**同意付**这个对价的记录（`docs/articles/05-four-level-degradation/en/article.md:204-211`）。

---

## 4. ADR-002——Master-Slaver 模式（人机统一）

**状态：** 已接受（`docs/adr/ADR-002-master-slaver-mode.md:3`）。
**日期：** 2026-03-26。
**决策者：** EKET Framework Team。
**入选本文的理由：** 它是「人类和 AI 走同一份协议」**成立**的那份决策。

### 背景

多个 agent 实例（人或 AI）要在一个共享 backlog 上协作，不撞、不单点、留一条审计链。团队要回答四个问题：工作怎么分配、冲突怎么避免、最终决定谁做、状态怎么同步（`docs/adr/ADR-002-master-slaver-mode.md:13-19`）。

### 决策

采用 **Master/Slaver** 架构：一个项目一个 Master 负责协调、拆需求、建 ticket、审 PR、仲裁冲突；N 个 Slaver（人或 AI）claim、执行、回报。角色编码在**状态转移**上，不在 actor 上（`docs/adr/ADR-002-master-slaver-mode.md:24-39`、`protocol/state-machines/ticket-status.yml:14-91`）。Master 选举走三级 ladder（Redis SETNX → SQLite 行锁 → `mkdir` 文件锁），30 秒租约、15 秒续约（`docs/adr/ADR-002-master-slaver-mode.md:77-89`）。

**统一命题**——一次「人类 claim」和一次「AI claim」从数据库视角看是**同一个操作**——是协议其余部分的前提。它就是为什么人与 AI 可以在中途交接 ticket 而不需翻译（`docs/articles/01-what-is-eket/en/article.md:74-75`）。

### 后果

**积极**（`docs/adr/ADR-002-master-slaver-mode.md:129-135`）：

- 角色边界清晰：每个实例知道自己的活。
- ticket claim 不撞：一条带 `WHERE state = 'ready' AND assignee IS NULL` 的 SQL `UPDATE` 决定归属。
- 可追溯：每次转移把角色记在行上。
- 分工高效：Slaver 执行，Master 决策。

**消极**（`docs/adr/ADR-002-master-slaver-mode.md:136-141`）：

- Master 是*决策*的单点：Master 挂时，新 ticket 建不了，review 跑不了。
- 选举开销，规模放大后尤其。
- 所有实例必须支持角色切换。

**ADR 里就采取的 mitigation**（`docs/adr/ADR-002-master-slaver-mode.md:142-146`）：租约过期自动重选；2 秒声明期防脑裂；Redis 不可用时降级到 SQLite 与文件锁选举。

**推翻它要付什么代价：** 协议裂成「human 模式」与「AI 模式」，统一命题要去消除的那类 bug——「AI 做了人类本不能做的事」——重新出现。`docs/articles/01-what-is-eket/en/article.md:131-140` 的同协议不变量不再成立。**这是这组 ADR 里唯一推翻它会改变协议、而不仅是改变实现的一条。**

「Master/Slaver」这个术语有历史包袱（`docs/adr/ADR-002-master-slaver-mode.md:190-195`）；团队已经认领了这个问题并备注「Coordinator/Worker」是候选替换。术语不是承重的，角色分离才是。

---

## 5. ADR-003——文件队列降级（L0 实现）

**状态：** 已接受（`docs/adr/ADR-003-file-queue-fallback.md:3`）。
**日期：** 2026-03-26。
**决策者：** EKET Framework Team。
**入选本文的理由：** 它是 L0 地板**具体到代码**的那份决策，不是口头承诺。

### 背景

四级降级模型需要一个 Level 4 后端。约束很硬：Level 4 后端必须**零外部依赖**跑起来，并且**在多个 Slaver 进程并发写时**安全。候选有四种：内存队列、纯 SQLite、消息中间件、文件队列。前三种在「零依赖」或「crash 后可恢复」这两条上至少失一条（`docs/adr/ADR-003-file-queue-fallback.md:13-21`）。

### 决策

交付**基于文件的消息队列**，带三条结构性属性：

1. **原子写**用 `tmp → rename` 模式（`docs/adr/ADR-003-file-queue-fallback.md:42-53`）。先写临时文件，再单次 `fs.renameSync` 改名为正式名。POSIX 文件系统上 rename 是原子的，消息要么完整写入，要么没写。
2. **文件锁**用 `mkdir`（`docs/adr/ADR-003-file-queue-fallback.md:55-66`）。`fs.mkdirSync(lockFile, { recursive: false })` 在 POSIX 上原子；同一时刻只有一个进程能持锁。
3. **CRC32 校验和**写到每条消息上（`docs/adr/ADR-003-file-queue-fallback.md:68-85`）。读时先验校验和，校验不过的消息进隔离区。

目录布局是 `pending/` → `processed/YYYY-MM-DD/` → `archive/`（`docs/adr/ADR-003-file-queue-fallback.md:28-40`）；布局是 human-readable，**队列就是审计轨迹**。

### 后果

**积极**（`docs/adr/ADR-003-file-queue-fallback.md:113-117`）：

- 「最终可靠」属性：没有别的服务可用时队列照常工作。
- 可调试：每条消息都是磁盘上一个 operator 能 `cat` 的文件。
- 部署简单：没有额外服务，没有额外端口。

**消极**（`docs/adr/ADR-003-file-queue-fallback.md:119-123`）：

- 文件 I/O 比内存慢 10-100 倍。
- 高并发时文件锁可能成瓶颈。
- `processed/` 会累积，需要定期清理。

**性能地板**（`docs/adr/ADR-003-file-queue-fallback.md:125-131`）：文件写 ~20 ms，文件读 ~10 ms，文件删 ~5 ms。这是文件队列 active 时系统端到端 claim 延迟的下限；系统的其它部分都被它顶住。

**ADR 里就采取的 mitigation**（`docs/adr/ADR-003-file-queue-fallback.md:133-137`）：批操作摊销 I/O；异步写避免阻塞；定期归档 `processed/` 防磁盘写满。

**推翻它要付什么代价：** L4 后端消失；ADR-001 的四级模型变成三级模型，**带着三级历史模型那个洞**——L2 Node.js 挂掉时没有 L3 兜底（`docs/articles/03-technical-value-choices/en/article.md:255-285`）。`docs/articles/01-what-is-eket/en/article.md:217-218` 的「恢复就是 `git clone`」属性不再普遍成立。

---

## 6. 待定问题——未来 12 个月的 3 份候选 ADR

未来 12 个月很可能再逼出 3 份到 ADR 线的决策。**粗略按紧迫度**排。每份按 **背景 / 候选决策 / 开放问题** 的形状画出来——不是终稿。

### 6.1 ADR-004 候选——多主机 ticket 状态（SQLite 的天花板）

**背景。** 状态当前是单台宿主上的单个 SQLite 文件（`docs/articles/03-technical-value-choices/en/article.md:73-105`）。Master 选举用 Redis `SETNX` 做跨主机协调（`rust/crates/eket-core/src/election.rs:294`），但 **ticket claim 不跨主机**。天花板已经清楚：3 个区域 50 个 Slaver 的团队用不了单个 SQLite 文件。

**候选决策。** 采用**文件队列**（即 ADR-003 的 L4 后端）上叠一层**事件追加日志**作为跨主机的权威状态；每台宿主的 SQLite 退化为本地缓存。ticket 行从追加日志物化出来；追加日志是事实源。

**开放问题。** 跑、调和追加日志的运维成本，是不是真的比直接跑一个 Postgres 实例低？诚实答案是「我们还不知道」，且 1–5 + N 单宿主的负载用不到跨主机状态——**ADR 还能等**。第二台宿主加入时它就变得紧急。

### 6.2 ADR-005 候选——PII 脱敏策略（审计轨迹的税）

**背景。** Saga 5 步完成会写 5 份原子 artifact（`docs/articles/GLOSSARY.md:12`）。其中 `notify` 一步可能含 diff、测试输出、prompt。Slaver 不小心把客户邮箱拉进 prompt，prompt 就永远留在审计日志里。监管行业（金融、医疗、国防）想用 EKET 的那一天，这就是合规问题。

**候选决策。** 采用**两层脱敏策略**：脱敏后的内容进审计日志，原始内容进单独 ACL 隔离的存储。默认是「在 Slaver 端脱敏，不在存储层脱敏」。候选脱敏库 v1 用正则、v2 用学习模型。

**开放问题。** v1 用正则够不够？还是要从 day 1 就用学习模型？诚实答案取决于 Slaver 可能见到什么 PII：只读代码的 Slaver 正则大概够；读客服工单的 Slaver 不够。

### 6.3 ADR-006 候选——LLM 成本预算控件（花费也是状态）

**背景。** 每次 Slaver 调用在 API token 上花 0.01 到 5 美元，模型和 prompt 大小而定。50 个 Slaver 跑 8 小时一天的 token 花的钱能超过一个月其余基础设施的预算。「成本」目前对协议**不可见**——它是 OpenAI 或 Anthropic 仪表盘上的一个数字，不是 ticket 行上的一列。

**候选决策。** 把**per-ticket 成本预算**提升为 ticket 的一等字段，带硬限和软限。硬限 abort Slaver；软限发警告并要求 Master 批准下一步。成本记在审计行上，和 `claimed_at`、`merged_at` 一样。

**开放问题。** 成本预算是 per-ticket、per-Slaver，还是 per-day？第一种最简单；第三种符合财务团队预算节奏。候选决策默认 per-ticket，per-day 作为覆盖规则。

### 6.4 我们在盯、但还不到 ADR 线的问题

- **命名。** 把「Master/Slaver」换成「Coordinator/Worker」（`docs/adr/ADR-002-master-slaver-mode.md:195`）。术语是 1 行 rename；角色规则不受影响。**还不算 ADR**。
- **Dashboard 的归属。** Dashboard 应该住在 L2 Node.js 进程里，还是单独的 L2-D 进程？目前 in-process；分离的问题是开放的但非承重。
- **插件模型。** EKET 要不要发插件 API，还是「fork + PR」就是扩展模型？插件 API 是维护税；fork 模型是发现性问题。**还不算 ADR**。

---

## 7. 12 个月路线图——3 个阶段与退出条件

路线图结构是**3 个阶段、每个 4 个月**，从当前状态（v2.19.0-beta、Rust 迁移后、2026-05）起算。每个阶段带一个*目标*、三个*退出数字*、一个*显式非目标*以防 scope creep。阶段不是愿望清单；它是**如果交付完、就能撑住未来 12 个月投资**的最小工作量。

阶段都假设 L0 地板（ADR-003）继续工作——**这是承重假设**。文件队列坏了，路线图暂停，**不是** ADR 暂停。

### 阶段 1——稳态化（2026-06 → 2026-09，4 个月）

**目标。** 发 v3.0.0。Rust 迁移落到 `main`；L0/L1/L2/L3 全绿；1–15 文章系列进 README。

**退出数字。**

1. `rust/crates/eket-core` 与 `node/src/` 的**测试通过率 100%**，在干净 runner 上 `cargo test` 与 `npm test` 测得。
2. **10 个生产用户**——完成过至少一个完整 EKET ticket 循环的团队，不论用哪一级。
3. **0 个超 30 天的 P0/P1 bug** 在 `jira/tickets/` 里。

**显式非目标。** 不加新的 LLM 工具支持。阶段 1 是**硬化**已有，不是**扩展**矩阵。

**为什么这是第一阶段。** v2.19.0-beta changelog（`CHANGELOG.md:8-66`）显示团队正处于 Rust 迁移中段；changelog 把这一段直接标成「Unreleased — Rust Migration」（`CHANGELOG.md:67-92`）。迁移是其它所有工作的限速器；阶段 1 把它收掉。

### 阶段 2——耐久性（2026-10 → 2027-01，4 个月）

**目标。** 协议在多主机部署下**不间断跑 72 小时**。审计日志可按任意历史 ticket 查询。跑 EKET 的成本**per-ticket 可见**。

**退出数字。**

1. **ADR-004（多主机状态）接受或拒绝并写出书面理由**。退出的是决策本身，不是实现。
2. **PII 脱敏（ADR-005）在 L2 Node.js Saga 里实现**，测试套件里至少有一个 customer 风格的用例。
3. **`tickets` 表上的 per-ticket 成本字段**，100% 的 Slaver 调用都填。

**显式非目标。** 不做社区规模获客。阶段 2 仍是为 1–5 + N 团队（`docs/articles/01-what-is-eket/en/article.md:69-72`）造东西；50 Slaver 的形状是再下一阶段的事。

**为什么这是第二阶段。** 耐久性是已经在用 EKET 的团队**第一时间**会问的。从「10 个生产用户」走到「100 个生产用户」的路，是审计轨迹和成本可见性的路，**不是**新 feature 的路。

### 阶段 3——多工具对等（2027-02 → 2027-05，4 个月）

**目标。** 协议在**至少 3 个 LLM 工具**上以**完全一致**的协议行为实现。一个团队可以把 Cursor、Claude Code、Codex agent 混在同一个 backlog 上，**不出现审计漂移**。

**退出数字。**

1. **3 个 LLM 工具**（最低 Claude Code、Cursor、Codex）跑同一份 `protocol/state-machines/ticket-status.yml:1-112` schema 的测试套件全过。
2. **50 个生产用户**，其中至少 5 个在活报告里说在用多工具混部。
3. **1 个外部贡献者**——他/她送了一份 EKET 团队**自己不会写**的 PR。

**显式非目标。** 不做 SaaS / 云服务。阶段 3 产出一个**框架**，不是一个托管产品。

**为什么这是第三阶段。** 多工具是 EKET 命题（`docs/articles/01-what-is-eket/en/article.md:144`）；一个连 3 个工具都没交付的框架还算不上框架。退出数字挑出来是为了**老实失败**：如果 3 个工具上只有 EKET 团队自己在用，多工具命题**未被验证**；第三个数字是测试。

### 阶段 3 之后

路线图停在阶段 3，因为阶段 3 之后往哪走**取决于数据**。两条合理延续：

- **路径 A——SaaS。** 如果 50 个生产用户要求 hosted EKET，下 12 个月是**在框架之上**做托管产品。
- **路径 B——规范。** 如果 50 个生产用户愿意自托管，下 12 个月是 EKET Protocol V2 正式规范、CNCF 风格治理模型、可互操作实现者轨道。

两条都合理。选哪条是数据驱动的，**不是**路线图驱动的。**12 个月退出条件还没达到就写 24 个月路线图，是路线图对自家团队撒的最常见的谎。**

---

## 8. 路线图风险——什么会让计划失效

没有风险的路线图是营销。下面的 4 条风险是**真的会让阶段暂停或 ADR 推翻**的事。每条带一个**可能性**、一个**影响**、一个**下一季度开始前**就能做的 mitigation 动作。mitigation 是动作，不是希望。

### 风险 1——Rust 迁移错过阶段 1 退出数字

- **可能性：** 中。v2.19.0-beta changelog（`CHANGELOG.md:8-66`）显示迁移在干净推进，红队修复已进 `main`（`CHANGELOG.md:79-86`）。风险不是「迁移失败」——是「迁移用 6 个月而不是 4 个月」。
- **影响：** 阶段 1 退出数字往后推。阶段 2 启动日期跟着推。路线图**没被推翻**，但日期被推。
- **Mitigation 动作：** **指派一名单独的迁移负责人，每周写一份书面状态报告发到 `confluence/memory/`**。如果负责人到 2026-09-30 还没贴 v3.0.0 tag，**暂停阶段 1 而不是延长它**。**一个被暂停的阶段**比**一个被拖长的阶段**便宜——被拖长的阶段会把后续阶段一起拖。

### 风险 2——L0 文件队列地板在生产中坏掉

- **可能性：** 低到中。L0 面很小（`scripts/eket-slaver-auto.sh` 322 行，`wc -l` 验证见 `docs/articles/05-four-level-degradation/en/article.md:117-120`），文件队列原语测得不错（`docs/adr/ADR-003-file-queue-fallback.md:11-21`）。风险不是「地板坏了」——是「一台非 POSIX 文件系统的 CI runner（Windows、NFSv3）误用 `tmp → rename` 把队列写坏」。
- **影响：** ADR-003 在事实上被推翻。四级变成带洞的三级。「恢复就是 `git clone`」属性（`docs/articles/01-what-is-eket/en/article.md:217-218`）不再普遍成立。
- **Mitigation 动作：** **在 `scripts/eket-start.sh` 里加一个「host OS smoke test」**——启动时在宿主文件系统上跑一次文件队列原语，rename 不原子就**带清晰报错 abort**。smoke test 是 30 行 shell；缺它，事故后**用一整个季度**才诊断出 30 行的 bug。

### 风险 3——ADR-002（Master-Slaver 统一）本身是错的统一

- **可能性：** 低。统一已经上线，已经过 2 轮生产验证（`CHANGELOG.md:67-92` 把 Rust 迁移标为 Round 20+），协议按它设计（`docs/articles/06-master-slaver-protocol/en/article.md:70-86`）。风险不是「统一错了」——是「某个未来的 LLM 工具拒绝参与同一份协议，因为 AI 厂商把 Slaver 角色视为风险」。
- **影响：** 协议裂成「human 模式」与「AI 模式」。统一命题要去消除的那类 bug 重新出现。其它 ADR（001、003）不受影响；**协议**受影响。
- **Mitigation 动作：** **为「声称 EKET 兼容」的任一 LLM 工具写一份「Conformance Test Suite」**——一个 200 行的测试 harness，跑 `task:claim`、`task:complete`、`task:resume` 打同一份 SQLite 文件。一个工具不通过这套测试，就**拿不到**「EKET 兼容」的标签。**测试套件是保护统一命题不被慢慢磨穿的边界。**

### 风险 4——文章系列发出去但没人读

- **可能性：** 中。开源世界文章系列的**长尾**是 90% 的读者读完前 3 篇就停，1% 读剩下 12 篇。风险不是「系列写得差」——是「系列写得不错，但对获客没有可测量的影响」。
- **影响：** 阶段 3 的「50 个生产用户」退出数字更难过。框架的采用曲线变平。ADR 和路线图都对，**但团队没把它们翻译成自助上手故事**。
- **Mitigation 动作：** **把每篇文章绑到一个具体上手步骤**并测转化——新用户**打开第一个 ticket 之前**读的最后一篇是哪篇？`docs/articles/01-what-is-eket/en/article.md:171-185` 是安装路径；下一个把读者转成用户的文章就是写进阶段 3 退出条件的那一篇。**测是 10 行 analytics 事件，不是研究项目。**

### 这些风险**不是**什么

它们**不是**「我们没赶上发版」（运营，不是战略）、**不是**「我们选了错的 feature」（可恢复）、**不是**「对手先发了」（出界——外部环境见 `docs/articles/15-outlook-risks/en/article.md`）。上面 4 条是**真正会让团队去修订 ADR 而不只是修订日历**的风险。

---

## 9. 参考

- **ADR（本文复盘的 3 份决策）**：
  - `docs/adr/ADR-001-four-level-degradation.md:1` —— 四级降级决策
  - `docs/adr/ADR-001-four-level-degradation.md:32-42` —— L1/L2/L3/L4 连接 ladder
  - `docs/adr/ADR-001-four-level-degradation.md:88-107` —— 积极 / 消极后果 + mitigation
  - `docs/adr/ADR-002-master-slaver-mode.md:1` —— Master-Slaver 统一决策
  - `docs/adr/ADR-002-master-slaver-mode.md:24-39` —— 角色架构图
  - `docs/adr/ADR-002-master-slaver-mode.md:77-89` —— Master 选举三级 ladder
  - `docs/adr/ADR-002-master-slaver-mode.md:127-146` —— 积极 / 消极后果 + mitigation
  - `docs/adr/ADR-002-master-slaver-mode.md:190-195` —— 命名问题（Master/Slaver → Coordinator/Worker）
  - `docs/adr/ADR-003-file-queue-fallback.md:1` —— 文件队列地板决策
  - `docs/adr/ADR-003-file-queue-fallback.md:42-85` —— 原子写、文件锁、CRC32
  - `docs/adr/ADR-003-file-queue-fallback.md:111-137` —— 后果、性能地板、mitigation
- **系列里更早的文章（背景）**：
  - `docs/articles/01-what-is-eket/en/article.md:69-78` —— 1–5 + N 命题
  - `docs/articles/01-what-is-eket/en/article.md:131-140` —— 四实现矩阵
  - `docs/articles/01-what-is-eket/en/article.md:213-217` —— 人 + AI 同一协议教训
  - `docs/articles/03-technical-value-choices/en/article.md:71-105` —— Choice 1：SQLite 优于 Postgres
  - `docs/articles/03-technical-value-choices/en/article.md:107-136` —— Choice 2：CAS 优于分布式锁
  - `docs/articles/03-technical-value-choices/en/article.md:255-285` —— Choice 7：四级优于三级
  - `docs/articles/05-four-level-degradation/en/article.md:100-105` —— L0/L1/L2/L3 能力矩阵
  - `docs/articles/05-four-level-degradation/en/article.md:117-120` —— 322 行 L0 的 `wc -l` 证据
  - `docs/articles/05-four-level-degradation/en/article.md:204-211` —— 四级的代价表
  - `docs/articles/06-master-slaver-protocol/en/article.md:70-86` —— 状态机的三个赌注
  - `docs/articles/06-master-slaver-protocol/en/article.md:226-274` —— Saga 5 步完成契约
- **架构与协议规范**：
  - `docs/architecture/DEGRADATION-STRATEGY.md:1` —— 591 行，四级权威规范
  - `docs/architecture/DEGRADATION-STRATEGY.md:18-46` —— runtime L1/L2/L3 ladder
  - `docs/architecture/DEGRADATION-STRATEGY.md:114-124` —— ConnectionManager L3-A/B/C/D ladder
  - `docs/architecture/DEGRADATION-STRATEGY.md:228-246` —— 断路器
  - `docs/architecture/DEGRADATION-STRATEGY.md:583` —— 优先级（可用性 > 性能 > 功能完整度）
  - `docs/architecture/THREE-LEVEL-ARCHITECTURE.md:1-3` —— 三级历史模型（已冻结、被超越）
  - `protocol/state-machines/ticket-status.yml:1-112` —— 17 状态状态机
  - `protocol/state-machines/ticket-status.yml:14-91` —— `ready → in_progress` 转移的 `who_can_transition: [slaver]`
  - `rust/crates/eket-core/src/election.rs:294` —— Master 选举的 Redis SETNX
  - `rust/crates/eket-core/src/ticket.rs:100-103` —— `tmp → rename` 原子写
- **路线图输入**：
  - `docs/roadmap/README.md:1-46` —— 现有短版路线图
  - `docs/roadmap/EKET-ROADMAP-2026-Q2-Q4.md:1-556` —— 2026-Q2/Q3/Q4 历史计划（Rust 迁移前）
  - `CHANGELOG.md:8-66` —— v2.19.0-beta（当前状态）
  - `CHANGELOG.md:67-92` —— 「Unreleased — Rust Migration」段
  - `CHANGELOG.md:79-86` —— TASK-214~221 的红队修复
- **源码（验证锚点）**：
  - `scripts/eket-slaver-auto.sh:1-322` —— L0 Slaver 循环
  - `scripts/eket-start.sh:1-883` —— L0 Master 启动
  - `scripts/heartbeat-monitor.sh:1-390` —— L0 heartbeat
  - `scripts/ticket-board.sh:1-328` —— L0 看板视图
  - `node/src/core/saga-executor.ts:22-66` —— Saga 执行器（TypeScript）
  - `rust/crates/eket-core/src/saga.rs:30-94` —— Saga 执行器（Rust 镜像）
  - `rust/crates/eket-core/src/saga.rs:233-288` —— `middle_step_fails_rolls_back` 单元测试
- **术语表**（本文用到的术语）：[`docs/articles/GLOSSARY.md:1-45`](../../GLOSSARY.md) —— Master、Slaver、Ticket、Saga、CAS、ADR、Four-Level Degradation。
- **系列导航**：
  - 上一篇：[`12-multi-tool-support`](../../12-multi-tool-support/zh-CN/article.md) —— 同一份协议跨 Claude Code、Cursor、Codex
  - 下一篇：[`14-case-studies`](../../14-case-studies/zh-CN/article.md) —— 真实团队的实现与教训
