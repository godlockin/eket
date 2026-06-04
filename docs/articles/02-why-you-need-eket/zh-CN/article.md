# 02 —— 为什么你需要 EKET：痛点 x 解法 x ROI

> **TL;DR** —— EKET 的价值不在模型，而在**协调**。当一个团队从「一个 agent 跑一会儿」跨越到「多个 agent 共用一个 backlog」的那一刻，四个痛点必然浮现：上下文丢失、编辑冲突、review 不透明、缺少审计轨迹。EKET 用一份 1–5 + N 的协议把这四件事一并处理掉，并把**可测量的回报**放在台面上：`task:claim` 在 Rust 下比 Node.js 快 **19 倍**（约 21 ms vs 约 400 ms），CLI 冷启动快 **约 187 倍**（约 8 ms vs 约 1,500 ms），内存占用低 **约 10 倍**（约 12 MB vs 约 120 ms）——数据来源 `README.md:140-145`。给决策者的问题是：继续用 ad-hoc 的方式手写这些解法，究竟是更便宜，还是更贵？

> **核心要点**
> 1. 2026 年的瓶颈不是模型质量，而是**协调债**——每多一个 agent，债就加一笔利息。
> 2. 四个痛点不是某个工具的 bug，而是**协议缺位**的症状。
> 3. EKET 的回报**可点验**：19x claim、~187x 启动、~10x 内存，全部可追到 `README.md:140-145` 与 `docs/getting-started/QUICKSTART.md:10-14`。
> 4. 协议把人类和 AI 拉到同一张桌子上——交接是**可持久**的，不是聊着聊着就丢的。
> 5. EKET **不是**万能药：单人单 agent、纯 chat 流程、拒绝把知识库进 git 的团队——这三类明确不建议用（见 anti-pattern 段）。

---

## Executive Summary

**给决策者（读完这一节即可离开）：**

| 问题 | 答案 |
|---|---|
| 收益是什么？ | 四个痛点（上下文丢失 / 编辑冲突 / review 不透明 / 无审计）被同一张 ticket 形状的契约一并压平。 |
| 数据在哪儿？ | 头条 ROI 来自 `README.md:140-145`：`task:claim` 19x（~21 ms vs ~400 ms）、冷启动 ~187x（~8 ms vs ~1,500 ms）、内存 ~10x（~12 MB vs ~120 MB）。 |
| 代价是什么？ | 纪律：ticket 在 `jira/`、知识在 `confluence/`、代码在 `code_repo/`；agent 必须先注册再领取。 |
| 谁最受益？ | 1–5 人 + N agent 的团队，每个周期有 20+ ticket 的 backlog，且要求可 review、可审计、可恢复的交接。 |
| 谁该走开？ | 单人开发、纯 chat 交付物、拒绝把知识库放进版本控制的团队（见 anti-pattern）。 |

下文把每个痛点对应到一份协议级解法，给出 before/after 对照表，落到决策矩阵与诚实的反模式列表。

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

从第一款「agentic」编码工具上线到今天（2026 年中），十八个月里软件工程的瓶颈**换了两次**。2024 年是 **prompt 稀缺**——从模型里榨出价值靠手艺。2025 年五大 LLM 工具（Claude Code、Cursor、Codex、Copilot、Aider）全部上线了能端到端接 ticket 的 agent。到了 2026 年，瓶颈变成**协调债**——让 N 个 agent 加上管它们的人类在同一份事实源上行动，**互不踩脚**。

四个痛点不是哪家供应商的问题，而是**协议缺位**的症状。我们见过每一个跨过「两个并发 agent」门槛的团队：

1. **上下文丢失。** 一个 agent 跑了 25 分钟、脑子里已经建模了代码库，然后挂了。25 分钟的活只活在 chat 滚动条里。下一个 agent（或 resume 回来的同一个）只能从 diff、commit message、幸存的评论里**反推**。
2. **编辑冲突。** 两个 agent 都看到 `tests/foo.rs` 那个失败用例，都去修。第二个 commit 静默覆盖第一个，团队三天后才发现——而那时 `testing` 分支上的 CI 已经挂在**另一行**上。
3. **review 不透明。** 人类 reviewer 拿到一份 4,000 行 diff，**没有任何叙述**——没有「我改 X 是因为 Y、我考虑过 Z 但因 W 放弃」。只有产出它的模型自己知道**为什么**。review 变成猜谜。
4. **无审计轨迹。** 「谁、什么时候、用哪张 ticket、跑哪个 prompt 改了什么？」30 秒内答不上来。出了事故，post-mortem 耗时一周，不是一小时。

这些不是 LLM 问题，而是**协调层缺失**的症状。模型是执行者；协议决定**执行什么、谁执行、什么顺序、出了事怎么恢复**（`01-what-is-eket/zh-CN/article.md:55`）。

> 「如果你的团队不止一个人，你面对的不是 agent 问题——你面对的是恰好涉及 agent 的协调问题。」
> —— *EKET 设计笔记，2025-08，引用见 `01-what-is-eket/zh-CN/article.md:57-58`*

本文论点：**团队为这四个痛点发明的每一种 workaround，拆开看都是 EKET 协议的一块碎片**。把碎片拼回协议，比反复重造要便宜。

---

## 2. 核心论点

核心论点由三个正交主张构成。本文大部分篇幅花在主张 1（痛点 x 解法映射）和主张 2（ROI 表）。主张 3（决策矩阵）放在文末。

### 2.1 痛点 x 解法是一一映射

每个成功缓解某个痛点的 workaround，回头看都是 EKET 协议的**一个零件**。映射是直接的：

- **上下文丢失** -> ticket 本身即上下文。状态机持久化它（`node/src/core/`），Rust 核心镜像它（`rust/crates/eket-core/`），`task:resume` 从 checkpoint 读，不从 chat 滚动条读。
- **编辑冲突** -> `tickets` 表上的 CAS（Compare-And-Swap）。定义在 `rust/crates/eket-core/src/ticket.rs`，通过 `eket task:claim TASK-NNN` 暴露。原子、幂等、单一事实源（`01-what-is-eket/zh-CN/article.md:117`）。
- **review 不透明** -> PR 自带叙述，因为 ticket **强制要求**在 claim 之前写好计划与验收标准。agent 不是在编造上下文；上下文在它上游。
- **无审计轨迹** -> `task:complete` 的 Saga 在一个事务里写五件 artifact：validate、test、checkpoint、commit、notify（`GLOSSARY.md:12`）。每一次状态转移都带 ticket id、instance id、时间戳。

模式都是同一个：**把模型从状态的关键路径上挪开，让 artifact 顶上去**（`01-what-is-eket/zh-CN/article.md:60`）。模型变得可替换；artifact 持久存在。

### 2.2 ROI 是 artifact，不是 slogan

多数 AI 编排项目死掉，是因为团队指不出一个数字说「我们拿回来了」。EKET 的头条数字**故意做得朴素、可追溯**：

| 指标 | Rust | Node.js | 加速比 | 来源 |
|---|---|---|---|---|
| `task:claim` 延迟 | ~21 ms | ~400 ms | **19x** | `README.md:140-145` |
| CLI 冷启动 | ~8 ms | ~1,500 ms | **~187x** | `README.md:142-143`；`docs/getting-started/QUICKSTART.md:10-14` |
| 内存占用（RSS） | ~12 MB | ~120 MB | **~10x** | `README.md:144`；`docs/getting-started/QUICKSTART.md:10-14` |
| 文件队列 enqueue p95 | 0.77 ms | n/a（同一引擎） | n/a | `benchmarks/baseline.json:5` |
| 文件队列 dequeue p95 | 1.54 ms | n/a（同一引擎） | n/a | `benchmarks/baseline.json:6` |

Master 在发稿前请审的三点诚实说明：

- **19x 与 ~187x 的数字是 `README.md:140-145` 的头条数据**。它们也出现在 `01-what-is-eket/zh-CN/article.md:136` 与 `01-what-is-eket/zh-CN/article.md:192`。仓库里 `benchmarks/baseline.json` 测的是**文件队列**（enqueue/dequeue p95），不是 `task:claim` 的端到端延迟。**这是源头缺口，不是矛盾**——文件队列的 p95 比 `task:claim` 的整体延迟小一个数量级，所以端到端数字与队列地板**是一致的**。未来 `08-rust-performance` 一文应给出受控条件下的分项拆解。
- **~10x 内存**反映的是「加载 tsc 输出的 Node 进程」对「stripped Rust 二进制」的差距。真实集群开销（LLM SDK、dashboard、hook server）会更高；头条数字是**地板**。
- **`TASK-638.md:24` 提到的「time-to-merge delta」**在仓库里**没有硬基准**。它是基于「19x claim + 统一审计」复合效果的合理推论。**发稿时不写具体数字，只描述为「方向性」**，等 08 文给测量计划。

### 2.3 人类和 AI 跑同一份协议

`docs/adr/ADR-002-master-slaver-mode.md:23-30` 把这件事写成了显式设计决策：人类「领取」ticket 是把 Kanban 板上从 `READY` 挪到 `IN_PROGRESS`；AI「领取」是跑 `eket task:claim TASK-NNN` 命中 SQLite。**从系统视角看，是同一个操作**——原子、幂等、单一事实源（`01-what-is-eket/zh-CN/article.md:74`）。下游效果：人类和 AI 可以中途交接 ticket，**不需要翻译**。状态机不区分人/AI；于是 AI 也做不了「人类做不出来」的事——因为状态机不允许（`01-what-is-eket/zh-CN/article.md:213`）。

---

## 3. 协议如何运转

协议是状态机。状态是三份 artifact（知识、任务、代码）的并集。状态转移是协议操作。我们按痛点逐个走一遍，给出协议级解法。

### 3.1 Before / After —— 一张具体对照表

| 痛点 | 现状（Before） | 为什么规模一大就崩 | 协议解法（After） | 落在哪里 |
|---|---|---|---|---|
| 上下文丢失 | 「把上一段 chat 重新粘到新会话」 | 滚动条不是档案；模型重新推导；推导会漂移 | ticket + checkpoint 即档案；`task:resume` 从磁盘读 | `node/src/core/checkpoint.ts`；`rust/crates/eket-core/src/ticket.rs` |
| 编辑冲突 | 「每个 agent 用一个分支」 | 分支冲突数随 N 线性增长 | `tickets` 表上的 CAS；只有一份 claim 成功 | `rust/crates/eket-core/src/ticket.rs`；`eket task:claim` |
| review 不透明 | 「让 agent 写个总结」 | 总结是后置的；模型会合理化；diff 仍在前头 | ticket **要求**先有计划与 AC 才能 claim；PR diff 是唯一要审的 artifact | `jira/tickets/TASK-NNN/`；`template/docs/GATE-REVIEW-PROTOCOL.md` |
| 无审计轨迹 | 「截个终端图」 | 截图不可查；崩溃后责任链断裂 | `task:complete` Saga 写 5 件原子 artifact；所有状态转移带时间戳 | `GLOSSARY.md:12`；`node/src/core/` |
| 协调开销随 N 增长 | 「站会 + Slack 频道 + Notion 文档」 | 每多一个 agent 多两次人会议 | 一张 ticket、一次 CAS、一份 PR；人/agent 在同一协议里平权 | `docs/adr/ADR-002-master-slaver-mode.md:23-30` |
| 热循环延迟 | 「每个命令 spawn 一个新 Node 进程」 | ~1.5 s 冷启动让 100 步循环等 2.5 分钟 | Rust CLI 冷启动 ~8 ms；同样循环约 1 秒 | `README.md:142-143`；`docs/getting-started/QUICKSTART.md:10-14` |

### 3.2 数字从哪儿来

- **`README.md:140-145`** 发布规范 ROI 表（Rust vs Node.js 的 `task:claim`、冷启动、内存）。
- **`docs/getting-started/QUICKSTART.md:10-14`** 发布三种安装模式（Rust CLI / Shell / Node.js）对应的启动与内存表。
- **`.claude/skills/eket/references/architecture.md:20-30`** 发布按组件拆分的延迟（L0 Shell / L1 Rust / L2 Node.js），含每层 `task:claim` 延迟（~5 ms / ~21 ms / ~500 ms）。
- **`benchmarks/baseline.json:5-6`** 发布文件队列 p95 地板（enqueue 0.77 ms、dequeue 1.54 ms），是任何端到端 claim 操作的下界。
- **`benchmarks/check-regression.mjs:1-84`** 是 CI 闸口——p95 退步超过 30% 直接 fail 构建（`benchmarks/baseline.json:4` 的 `_threshold_pct: 30`）。

诚实的缺口：这些数字对 **time-to-merge 的复合影响**在仓库里**没有端到端测量**。`19x` claim、`~187x` 冷启动、`~10x` 内存是**输入**；**输出**（更短的 merge 周期、更少的冲突）是方向性主张，不是测量。`INDEX.md:33` 里排队的 08-rust-performance 一文是发测量数据的地方。

### 3.3 重要的是协议，不是语言

合理的反问是：「用 Go 写 CLI 不也能拿到这些数字？」是的——语言是手段，不是论点。**论点是用四种实现交付同一份协议**（`01-what-is-eket/zh-CN/article.md:131-140`）：

- L0 Shell：零依赖环境、CI、恢复
- L1 Rust：人类默认、快速循环
- L2 Node.js：dashboard、LLM gateway、webhook
- L3 Shell fallback：L2 挂而 L1 仍可用

`docs/architecture/THREE-LEVEL-ARCHITECTURE.md:3-6`（现已被四级模型替代）把历史赌注写明：「shell 实现是系统的地板。」Redis 死了、Node.js 崩了、Rust 在某个 CI runner 上编不过——协议仍能跑，因为 L0 shell 是一份**完整**实现，不是 stub。**性能数字是「选 Rust 当 L1」的**后果**；**协议级**保证是「同一个 `task:claim` 操作在 L0 shell 和 L1 Rust 下都行」**。

### 3.4 现状，一句话

> 「三个 agent、两个 chat 滚动条、一份 Notion 文档、一张没有 ledger 的 backlog，外加一个 Slack 频道——人类在里面贴 diff，因为没人相信自动生成的 PR 描述。」

协议落地后，一句话：

> 「三个 agent、两个人类、一张 SQLite 表、每一次状态转移都有时间戳、每一份 PR 都带着 ticket 写好的计划与验收标准——因为 ticket 强制要求先有这些才能 claim。」

---

## 4. 取舍与替代方案

### 4.1 替代方案与它们的痛点失败

| 替代方案 | 上下文丢失 | 编辑冲突 | review 不透明 | 无审计轨迹 | 备注 |
|---|---|---|---|---|---|
| **LangGraph / CrewAI / AutoGen** | 改善（图记忆） | 恶化（无 CAS） | 恶化（无 PR 叙述） | 恶化（无 ledger） | 编排的是 *agent 间对话*，不是 *agent 对 artifact*。`01-what-is-eket/zh-CN/article.md:152` |
| **OpenAI Swarm** | 改善（交接对象） | 同（无 CAS） | 同 | 同 | 交接在内存；崩了就丢。`01-what-is-eket/zh-CN/article.md:153` |
| **GitHub Projects + Actions** | 恶化 | 改善（分支保护） | 改善（PR 模板） | 改善（PR 历史） | 把知识、任务、代码混在一起。`01-what-is-eket/zh-CN/article.md:155` |
| **每团队自造 shell 脚本** | 同 | 同 | 同 | 同 | 各自重造，未标准化。`01-what-is-eket/zh-CN/article.md:154` |
| **EKET** | 解决（checkpoint） | 解决（CAS） | 解决（ticket 计划） | 解决（Saga 5 步） | 本文的论点。 |

### 4.2 决策矩阵 —— 谁最受益

| 团队形态 | 痛点严重度 | EKET 适配度 | 理由 |
|---|---|---|---|
| 1 人，0–1 agent | 无 | **不建议** | 协议开销超过协调收益。 |
| 1–5 人，0 agent | 低 | 边缘 | 协议仍有用（审计、PR 叙述），但头条 ROI 拿不到。 |
| 1–5 人，1–2 agent | 中 | **适合** | 上下文丢失 + review 不透明已经冒头，协议几周内回本。 |
| 1–5 人，3–10 agent | 高 | **最佳** | 四个痛点全部发作；CAS + Saga 是承重的。 |
| 1–5 人，10+ agent | 高 | **强适配，有前提** | 需要 L1 Rust 核心把 claim 延迟压在 50 ms 内；超了就重 profile。 |
| 6+ 人，任意 agent | 协调债被人占满 | **先重做组织设计** | EKET 不是组织设计工具。 |
| 单人爱好项目 | 无 | **不建议** | 见 anti-pattern 1。 |

### 4.3 反模式 —— 什么时候**不**该用 EKET

一个协议如果对每个团队都说「适合」，它就**对任何团队都不适合**。下面四种情况下 EKET 是错误选择，理由是结构性的，不是审美性的。

1. **单人开发 + 单 agent。** 如果就一个人类 + 一个 agent，把状态搬进 SQLite 状态机的成本高于直接和模型对话。四个痛点需要**两个**执行者才会浮现。（`01-what-is-eket/zh-CN/article.md:160`）
2. **纯 chat 工作流 —— 交付物是消息，不是 artifact。** 如果「ticket」的产物是 Slack 回复、一封邮件、一段推荐意见，EKET 是过度工程。协议按设计就是 artifact-centric（`01-what-is-eket/zh-CN/article.md:161`）；硬塞给瞬时输出只会换来仪式、拿不到持久性。
3. **拒绝把知识库进版本控制的团队。** 三仓分离（`confluence/`、`jira/`、`code_repo/`）是协议的承重结构（`docs/architecture/THREE_REPO_ARCHITECTURE.md:1`；`01-what-is-eket/zh-CN/article.md:78`）。如果团队坚持用 Confluence-the-product、Jira-the-product、再加一个独立 vendor 的代码仓，会在协议的每个转角打架。协议的审计依赖**跨仓引用**——而跨仓引用只有在「三份都在 git 下的普通文件里」时才免费。
4. **瓶颈是「人」的协调，不是「agent」的协调。** EKET 解决的是「给 agent 自治权之后」冒出来的四个痛点。如果一个 12 人团队一个季度发不出一个 feature 是因为组织设计，不是因为 agent 蔓延——EKET 帮不上忙；用了反而给本已过载的流程再叠一层。**这是「拒绝卖」——也是这份列表里最重要的一条**。

一个有用的自测：如果团队能举出**最近一次事故**配上四个痛点（「我们为 rebase 冲突丢过 3 天」「我们把 agent 的活重做了一遍」「那份 PR 4,000 行，我们完全不知道为什么」），EKET 就在射程内。举不出，瓶颈在别处。

---

## 5. 实现要点

### 5.1 你实际跑的命令

```bash
# 一行安装（Level 1：Skills + Commands + Hooks）
curl -fsSL https://raw.githubusercontent.com/godlockin/eket/main/scripts/quick-setup.sh | bash

# 项目初始化（Level 2）
cd your-project && curl -fsSL https://raw.githubusercontent.com/godlockin/eket/main/scripts/quick-setup.sh | bash -s -- --init

# 完整安装（Level 3：CLI + API + Dashboard）
curl -fsSL https://raw.githubusercontent.com/godlockin/eket/main/scripts/quick-setup.sh | bash -s -- --full

# 在 Claude Code（或任何支持的工具）里
/eket-start                     # 自动检测：master 还是 slaver？
/eket-start -r master           # 显式
/eket-start -r slaver           # 显式

# 领取与交付
eket task:claim                 # 领取下一张 READY ticket
eket task:progress              # 看 DAG 与关键路径
git checkout -b feature/TASK-001-foo
# ... 实现 + 提交 ...
eket task:complete TASK-001     # Saga 5 步
```

（来源：`README.md:19-28`、`README.md:93-106`、`01-what-is-eket/zh-CN/article.md:171-185`。）

### 5.2 头条数字在源码里的位置

| 断言 | 引用 | 备注 |
|---|---|---|
| 19x `task:claim` 加速 | `README.md:140-145` | 复现在 `01-what-is-eket/zh-CN/article.md:192` 与 `.claude/skills/eket/references/architecture.md:29` |
| ~187x 冷启动 | `README.md:142-143` | 同见于 `docs/getting-started/QUICKSTART.md:12-14` |
| ~10x 内存 | `README.md:144` | 同见于 `docs/getting-started/QUICKSTART.md:12-14` |
| 文件队列 p95 地板 | `benchmarks/baseline.json:5-6` | Enqueue 0.77 ms、Dequeue 1.54 ms |
| 30% 退步阈值 | `benchmarks/baseline.json:4` | CI 闸口见 `benchmarks/check-regression.mjs:55-82` |
| 每层 claim 延迟 | `.claude/skills/eket/references/architecture.md:29` | L0 ~5 ms / L1 ~21 ms / L2 ~500 ms |
| 人 + AI 同一协议 | `docs/adr/ADR-002-master-slaver-mode.md:23-30` | 统一论点 |

### 5.3 仓库内交叉引用

- 论点文：`docs/articles/01-what-is-eket/zh-CN/article.md:1`（~2,200 词，讲「是什么」）
- Master-Slaver ADR：`docs/adr/ADR-002-master-slaver-mode.md:1`（讲「谁决定」）
- 三仓哲学：`docs/architecture/THREE_REPO_ARCHITECTURE.md:1`
- 降级策略：`docs/architecture/DEGRADATION-STRATEGY.md:1`（讲「怎么活下来」）
- 未来数字文章：`docs/articles/INDEX.md:33`（08-rust-performance，排队中）

---

## 6. 经验教训

**教训 1 —— 协调债是新债。** 2024 年的问题是「模型能不能做 X」；2026 年的问题是「N 个模型 + 我们的人，**能不能不丢上下文、不冲突、不透明**地把 X 做了」。四个痛点不是某家工具的 bug，而是**协议缺位**的症状。

**教训 2 —— 头条数字的可信度，等于它的源头链。** 19x / ~187x / ~10x 是真实的，源头在 `README.md:140-145`。文件队列 p95 是真实的，源头在 `benchmarks/baseline.json:5-6`。**对 time-to-merge 的复合影响**是方向性主张，不是测量。**永远别让一个没有 `file:line` 引用的数字进 slide**。协议是 artifact-centric；宣传也应该是。

**教训 3 —— 四个痛点与四个协议操作是一一映射。** 上下文丢失 -> checkpoint。编辑冲突 -> CAS。review 不透明 -> 把「ticket 计划」做成 claim 的前置条件。无审计 -> Saga 5 步。**你正在考虑的 workaround，如果能映到其中之一，你就是在重造 EKET；映不到任何一个，它大概率没解决你以为的痛点**。

**教训 4 —— 1–5 + N 的「特种兵团」规模，是协调债**首先出现**的带宽，也是协议开销**最快摊薄**的带宽**。不到 1，不需要协议；超过 5，需要组织设计。EKET 是这中间的绷带、脊柱、审计——AI 产能第一次跑赢人类协调肌肉的尺度上。

**教训 5 —— 一份诚实的反模式列表，比一份发光的更有说服力。**「单人单 agent、纯 chat 流程、拒绝 git 化的知识库，这三种我们不推荐」——这句话是当你说「1–5 + N 我们推荐」时**最快被相信**的方式。协议是**适配**，不是**信仰**。

---

## 7. 参考

- **内部**：
  - `docs/articles/01-what-is-eket/zh-CN/article.md` —— 论点文（先读）
  - `README.md:140-145` —— 头条 ROI 表
  - `docs/getting-started/QUICKSTART.md:10-14` —— 各模式启动 / 内存
  - `docs/architecture/THREE-LEVEL-ARCHITECTURE.md:1` —— 历史三级（已被替代）
  - `docs/architecture/DEGRADATION-STRATEGY.md:1` —— 当前四级
  - `docs/adr/ADR-002-master-slaver-mode.md:1` —— 人 + AI 统一
  - `benchmarks/baseline.json:1-7` —— 文件队列 p95 基线
  - `benchmarks/check-regression.mjs:1-84` —— CI 退步闸口
  - `benchmarks/simple-benchmark.js:1-206` —— 基准源码
  - `docs/articles/GLOSSARY.md:1-43` —— 共享术语
- **ADR**：`docs/adr/ADR-001..003-*.md`
- **知识库**：`confluence/memory/MEMORY.md`
- **系列下一篇**：[`03-technical-value-choices`](../../03-technical-value-choices/zh-CN/article.md) —— 七个非显然的技术抉择
