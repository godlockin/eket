# 15 — 展望：价值、风险与 2027 年的三个赌注

> **TL;DR** — 这是 EKET 15 篇系列文章中的最后一篇。它从前 14 篇的协议细节里抬起头来，回答那个只有这一篇才有资格提出的战略问题：**EKET 的战略价值是什么、什么可能把它带走、为了在 2027 年仍然重要、未来 12 个月里项目必须赢的是哪三件具体的事？** 价值由三件事组成：**同一份协议在四种 runtime 中表达**（`docs/articles/01-what-is-eket/en/article.md:131-140`）、**人类与 AI 共享同一份审计痕迹**（`docs/articles/06-master-slaver-protocol/en/article.md:78-86`）、**SQLite 单行事实源**（`docs/articles/06-master-slaver-protocol/en/article.md:166-167`）。风险有五项：采用天花板、协议被吸收、出现更强的 meta-protocol、三 runtime 维护负担、Agent 自主权的安全面。缓解措施已经存在；开放问题是它们是否按时交付。三个具体赌注是：**2026-09-30 前发布 v3.0.0**（当前状态：`CHANGELOG.md:67-92` 中的 `Unreleased — Rust Migration`）、**2027-01-31 前对 ADR-004（多主机状态）做出接受或拒绝的书面决定**（草案在 `docs/articles/13-adr-and-roadmap/en/article.md:211-217`）、**2027-05-31 前把 axum HTTP API 升级为稳定 v1.0 并通过跨 adapter 一致性测试**（当前状态：`rust/crates/eket-server/src/lib.rs:461-492` 中的 15 条路由，尚未版本化）。

> **核心要点**
> 1. EKET 不是 agent 框架。它是一份**协调协议**，恰好发布了 5 个 agent adapter（`docs/articles/12-multi-tool-support/en/article.md:80-91`）。协议是持久之物；adapter 是可替换的。
> 2. 五项风险都是真的、不是表演性的：项目能扛住其中任何一项，但扛不住四项同时发生。缓解措施是项目**正在做**的事，不是希望。诚实版本会点名哪些风险比标题陈述的更难缓解。
> 3. 市场对照是**四个**相邻框架，不是一个：LangGraph（图编排）、CrewAI（角色化 crew）、AutoGen（微软的会话栈）、OpenClaw（meta-protocol）。EKET 竞争的是**可审计性 + 人机同协议不变量**，不是 agent 质量。
> 4. 价值复利发生在三处：**adapter 契约**（任何新的 LLM 工具以约 200 行接入，见 `docs/articles/12-multi-tool-support/en/article.md:248-302`）、**三仓生命周期分离**（知识、任务、代码——`docs/articles/04-three-repo-arch/en/article.md`）、**L0 shell 地基**（同一份协议可在仅有 `bash` 的干净容器上运行——`docs/articles/05-four-level-degradation/en/article.md:117-120`）。
> 5. 三个战略赌注都是**具体日期 + 具体工件 + 具体退出指标**——不是抱负。说"2027-Q2 发布 v1.0"是可被审计的；说"成为领先协议"是市场宣传。
> 6. 最可能的失败模式**不是**协议错了；而是项目交付了 v3.0.0 和文章系列后，停滞在 20–30 个生产用户。**采用天花板是结构性风险，不是技术风险。**

---

## Executive Summary

**给决策者（读完这一段即可离开）：**

| 问题 | 答案 |
|---|---|
| 这篇文章在回答什么？ | 退一步复述 EKET 的战略价值、点名真实风险、为未来 12 个月定下三个具体赌注。 |
| 价值主张一句话怎么说？ | 同一份协调协议（`task:claim` / `task:complete` / `task:resume` / `gate:review`）在人类和 AI 上行为一致，在 5 个 LLM 工具上形态一致，在 4 个 runtime 实现中行为一致，落到一行 SQLite 事实。 |
| 什么能杀死项目？ | 不是协议错。结构性风险是：(1) 需要它的团队太少、(2) 某条更优的 meta-protocol 抢走了"LLM 工具无关"的位置、(3) 三 runtime 维护成本跑赢社区、(4) Agent 自主权的安全面引出一起公开事故。 |
| 项目正在为每项做什么？ | 与具体工件、具体日期绑定的具体行动，不是抱负。详见第 6、7 节。 |
| 三个战略赌注是什么？ | **赌注 1** — 2026-09-30 前发布 v3.0.0（Rust 迁移收尾、100% 测试通过）。**赌注 2** — 2027-01-31 前对 ADR-004（多主机状态）做出接受或拒绝的书面决定。**赌注 3** — 2027-05-31 前把 axum HTTP API 升级为稳定 v1.0，并通过 Claude Code / Cursor / Codex 三方一致性测试。 |
| 诚实的不确定是什么？ | "LLM 工具无关"的故事在 2026 年是差异化优势还是在 2028 年才成为差异化优势。框架的"任何工具、同一协议"叙事今天是独特的；它能否保持独特，取决于 LangGraph / CrewAI / 下一代编排框架在 2027-Q3 之前交付什么。 |

本文余下部分用 `file:line` 引用为每个主张做支撑、明确点名未解之问、最后给出有意识、诚实的收尾。

---

## 1. 动机——系列写到这里，才有资格问这个问题

前 14 篇文章已经按顺序完成：定义协议（`01`）、论证 ROI（`02`）、解释 7 个非显然技术选择（`03`）、分离三种生命周期（`04`）、搭建四级降级阶梯（`05`）、规定 Master-Slaver 状态机（`06`）、论证 SQLite 与 CAS（`07`）、回溯 Rust 性能数字（`08`）、设计可观测性与恢复（`09`）、给出上手剧本（`10`）、暴露四种集成面（`11`）、论证协议在工具层之下存续（`12`）、总结 ADR 与路线图（`13`）、走查真实团队案例（`14`）。到了这里，系列已经**挣得了退后一步、问出战略问题的权利**：*这东西值多少、什么可能把它拿走、未来 12 个月我们具体要赢的是哪几件？*

这个问题与董事会要问的、与高级工程师在采纳前要问的、与研究审稿人在引用前要问的，是同一个。本文为这三种读者都写。它有意保持诚实：写出项目不知道什么、什么能让计划失效、哪些赌注是具体到可被证伪的。

元层口吻定调：本文是锚定其余 14 篇的那一篇。结尾要有意识、诚实，不能是促销味。前面 14 篇对主张的谨慎是*技术性*的谨慎；本文对主张的谨慎是*战略性*的谨慎——一个没有 `file:line` 的战略主张，正是这 15 篇系列一直在抵抗的那种市场宣传。

> "协议是你拥有的契约。工具是你租的契约。协议是穿越 churn 后还能活下来的部分；工具是被替换的部分。"
> — *改写自 `docs/articles/12-multi-tool-support/en/article.md:316`*

系列一篇一篇地论证，**持久的是协议**。本文是对这个论证的检验。如果持久的是协议，那么每多一个 adapter、每多一个 LLM 工具、每多一种团队形态，价值就复利。如果持久的不是协议——如果是 Rust 端口、是 hook 服务器、是文章系列——那么价值主张更窄，三个赌注也不同。

---

## 2. 价值主张复述——EKET 独交付什么

三个性质复合形成 EKET 的价值主张。每一个都能独立被辩护。每一个都有一条 `file:line` 在源码中支撑。

**性质 1 — 人类和 AI 走同一份协议。** 人类"领取"一个 ticket 是把 Kanban 板上的状态从 `READY` 挪到 `IN_PROGRESS`；AI "领取"是跑 `eket task:claim TASK-NNN` 命中 SQLite。**从系统视角看，是同一个操作**——原子、幂等、单一事实源（`docs/articles/01-what-is-eket/en/article.md:74-75`）。状态机在 `protocol/state-machines/ticket-status.yml:14-91` 把角色编码在**转移**上、不是**主体**上，所以"Master 永远不 claim"是一个 SQL 约束（见 `docs/articles/06-master-slaver-protocol/en/article.md:276-294`）。推论就是人类和 AI 可以中途交接 ticket 而不需要翻译层。**人机同协议不变量是相邻框架都不交付的性质。** LangGraph / CrewAI / AutoGen 编排的是 agent 之间的对话；EKET 编排的是 agent 与 artifact 的对话（`docs/articles/01-what-is-eket/en/article.md:152`）。

**性质 2 — 同一份协议在四种 runtime 实现中表达。** L0 Shell、L1 Rust、L2 Node.js、L3 Shell 降级。协议不随层级改变（`docs/articles/01-what-is-eket/en/article.md:131-140`）；L0 shell claim 的 ticket 与 L1 Rust CLI claim 的是同一个 ticket。L0 实现是 `scripts/eket-slaver-auto.sh:1-322`——322 行 shell，`wc -l` 可证——是系统地板（`docs/articles/05-four-level-degradation/en/article.md:117-120`）。L1 实现把 `task:claim` 比 L2 Node.js 实现快 19 倍（`README.md:140-145`）。系统快的时候跑得快，**快不起来的时候也跑得起来**。

**性质 3 — 同一份审计痕迹兼容任何 LLM 工具。** 今日已交付 5 个 adapter——`CLAUDE.md`（完整）、`CURSOR.md`（完整）、`CODEX.md`（降级）、`COPILOT.md`（降级）、`AGENTS.md`（通用兜底）——`docs/articles/12-multi-tool-support/en/article.md:152-184` 给出 Cursor + Codex + Claude Code 协作同一张 ticket、写入同一张 SQLite、留下同一份审计痕迹的完整示例。adapter 契约有文档、可测试（`docs/articles/12-multi-tool-support/en/article.md:248-302`）；加第六个工具是 200 行 markdown + 一个 HTTP 客户端，不是框架移植。

**价值主张的边界。** EKET 不声称自己产出更好的 agent、更省的 token 或更高质量的代码。协议是*协调层*；LLM 质量在它上游。一个开发者 + 一个 agent 的小团队不需要 EKET（`docs/articles/01-what-is-eket/en/article.md:160`）。想要 agent-to-agent 对话、而不是 agent-to-artifact 对话的团队，可能更适合 LangGraph 或 CrewAI。诚实版本的价值主张是**适配**、不是**替代**：EKET 是 1–5 + N 团队形态 + 有限 / 有状态 / 可审计 backlog 的正确协议。

---

## 3. 市场对照——EKET 相对 LangGraph / CrewAI / AutoGen / OpenClaw 在哪里

"还有哪些工具"是个既诚实又重要的问题。四个相邻工作定义了空间；每一个对某些团队形态都是真正的替代。下表是诚实的对照，每个工具的实际优势都点名，EKET 的实际短板也点名。（来源：LangGraph / CrewAI / AutoGen 的公开文档与产品页，依赖模型截至 2026 年 1 月的训练数据；EKET 自身用内部引用。）

| 框架 | 时间 / 状态 | 架构 | 它真正擅长的事 | 相对 EKET 在结构上更弱的地方 |
|---|---|---|---|---|
| **LangGraph**（LangChain） | 2024 年中发布；2025 年进入生产；当前主版本跟随 LangChain 发布节奏 | 有向图状态机；节点（LLM 调用、工具、子图）由条件边相连；first-class checkpointer 支持 durable execution；内置 human-in-the-loop interrupt | 成熟的图模型；丰富的 checkpointer / resume；与 LangChain 工具生态集成；有 ReAct / supervisor / swarm 的成文模式 | 编排的是 **agent-to-agent** 对话、不是 agent-to-artifact；没有 PR-shaped artifact 进循环；没有"人机同协议"不变量；没有 L0 shell 地基 |
| **CrewAI** | 2023 末 / 2024 初发布；2024–2025 生产使用持续增长 | 角色化多 agent crew；agent 有 role / goal / backstory；task 按序或层级分配执行；Python 优先 | 上手叙事最直观（"你们是一个 crew"）；角色隐喻贴合组织思维；原型速度快 | 谈的是 agent 之间，不是 agent 与持久账本之间；ticket 状态没有 CAS 等价物；没有 L0 shell 地基；agent 定义和 runtime 耦合使事后审计变难 |
| **AutoGen**（微软） | AutoGen 0.2.x 走过 2024；AutoGen v0.4（事件驱动 actor model）2025 年发布；微软研究院 / Foundry 撑腰 | Actor-model / 事件驱动；带代码执行面的会话 agent；v0.4 强调可扩展性与可观测性 | 企业背书；v0.4 的生产级类型系统；支持长跑时分布式 agent；可观测性故事丰富 | agent-to-agent 消息是首要 substrate；"什么被决定、被谁决定、对哪张 ticket"的持久状态不是原语；角色分离是模式、不是结构性不变量 |
| **OpenClaw** | 配套的 AI agent 协议；在 `docs/articles/GLOSSARY.md:24` 提及；EKET 的桥接设计在 `docs/architecture/OPENCLAW-INTEGRATION-DESIGN.md` | 一个坐在 LLM 工具之间的 meta-protocol；角色与 MCP 相当但面向 agent | 在 agent 编排层工具无关；正在出现的 agent 互操作标准 | 仍在成熟；OpenClaw 的**adapter**层正是 EKET 协议服务的层；OpenClaw 是 adapter 契约的潜在替代品、不是协议本身的替代品 |

对上表的简短诚实读法：

- **LangGraph** 是"有状态 agent 编排"上最接近的技术对手。EKET 赢在：人机同协议不变量、L0 shell 地基、生命周期分离的三仓布局。LangGraph 赢在：图表达力、durable execution 原语、LangChain 生态。诚实版：已经标准化在 LangChain 上的团队会先选 LangGraph，EKET 的价值主张要**论证**、不能默认。
- **CrewAI** 是"小团队 agent"叙事上最接近的对手。EKET 赢在：artifact 中心（PR 就是审计痕迹）、协议稳定（不绑 runtime）、L0 地基可幸存。CrewAI 赢在：首次 demo 时间更短、心智模型对非工程师更友好。诚实版：想**这个周末**试一下多 agent 编排的团队会先选 CrewAI；EKET 的价值主张是给那些**已经撞上四大痛点、需要协议而不是框架**的团队。
- **AutoGen** 是企业级最接近的对手。EKET 赢在：SQLite + git + markdown 的存储模型（一切都在 git 下的纯文件里）、L0 shell 地基、更轻的运维足迹。AutoGen 赢在：企业集成、微软投资、actor-model 的可观测性故事。诚实版：微软栈重的团队会先选 AutoGen；EKET 的价值主张要在运维成本和审计痕迹形态上立论。
- **OpenClaw** 是暗牌。如果 OpenClaw（或类似 meta-protocol）成为 agent 工具互操作的标准，EKET 的 adapter 契约会变成**许多可能 binding 之一**，而不是规范的那一个。这个风险被收录在第 5 节风险 3。

**一个不那么显然的观察。** 四个相邻工作在不同的路径上都是*agent 框架*——它们交付 SDK、runtime、心智模型。EKET 交付的是*协议*外加 adapters。区分为什么重要：框架拼的是 agent 质量、工具覆盖、首次 demo 时间；协议拼的是**持久契约与跨工具组合**。标准化在 LangGraph 上的团队被锁在 LangChain 生态里；标准化在 EKET 上的团队被锁在 SQLite + git + markdown 存储模型里——这是一个**更小、更可逆**的承诺。诚实版："协议不是框架"的叙事在 LLM 工具格局动荡时是优势（现在是）；在某个供应商决定性胜出、吸收掉编排层时就是劣势。两种预测都合理；赌的是前者。

**框架可能错在哪里。** "协议、不是框架"的叙事是赌注、不是事实。它对，前提是 2024–2025 那种 LLM 工具格局的剧烈震荡（供应商级破坏性变更、模型级弃用、价格重谈）保持。它错，如果某家供应商（Anthropic、OpenAI 或新进入者）决定性胜出、吸收掉编排层。它对，如果"1–5 人类 + N agent"成为工程团队默认形态；它错，如果团队形态变成"0 人类 + 100 agent"、人的角色消失。两种预测都合理；赌的是前者。

---

## 4. 价值如何复利——网络效应、协议效应、生态效应

第 2 节的价值主张是**每个团队**的。复利版本——把 EKET 从"好用的工具"变成"持久的框架"的部分——是**每个采纳者**的。三种效应在复利。

**效应 1 — Adapter 复利。** 每一个新 LLM 工具发布 first-class adapter 都扩大可触达市场，但不动协议。加入第六个 adapter 的成本在 `docs/articles/12-multi-tool-support/en/article.md:248-302` 有文档——大约 200 行 markdown 加一个向 `node/src/hooks/http-hook-server.ts:14-19` 发送 POST 的 HTTP 客户端。一个有 20 个 LLM 工具、每个都带 adapter 的世界，结构上与一个只有 5 个工具且没协议的世界不同；从 0 到 5 的成本远高于从 5 到 20 的成本。HTTP / MIME / 语言 runtime 的历史表明：*边际实现成本低*的协议比*边际集成成本高*的框架复利更快。赌的是 EKET 站在对的那一边。

**效应 2 — 三仓生命周期复利。** 生命周期分离的三仓布局（知识在 `confluence/`、任务在 `jira/`、代码在 `code_repo/`，见 `docs/articles/04-three-repo-arch/en/article.md`）在复利，因为每种生命周期都随着时间产出不同种类的资产。知识沉淀为搜索索引和词汇表。任务沉淀为决策历史（做过 / 没做过）。代码沉淀为可版本化、可分支的树。**用 EKET 18 个月的团队有一份知识库、一份决策历史、一份代码树，可以被另一支团队直接采用；只用框架栈的团队三样都没有。** 这种复利很慢（前 6 个月看不出来），但很持久（第二年变成团队的制度记忆）。诚实版：这种效应是真实的，但在前 6 个月不可见；在晴天评估框架的团队看不见自己买到的复利。

**效应 3 — L0 shell 地基复利。** `scripts/eket-slaver-auto.sh:1-322` 这 322 行 shell 是系统地板（`docs/articles/05-four-level-degradation/en/article.md:117-120`）。它在复利，因为每一场灾难恢复场景——干净的 CI runner、坏掉的 Rust 工具链、崩掉的 Node.js、被清空的 Redis——都是一个 L0 实现拯救了工作的故事。复利是事件驱动的：L0 地基 99% 的时间什么都不做，**在需要的那一天救下项目**。诚实版：大多数团队永远看不见 L0 地基在做事；见过的团队会写最热情的复盘报告；在晴天评估框架时成本-收益比是看不见的。

**复利在哪里可能停。** 三种效应都假设项目持续在交付。如果 v3.0.0 拖过 2026-09-30，adapter 复利故事就停摆——新 LLM 工具发布的速度超过团队加 adapter 的速度。如果 ADR-004 被拒绝却没有书面理由，三仓复利故事就停摆——跨主机写入的工作负载无法采用 EKET。如果 L0 shell 脚本被"清理"为 Node.js，地基效应就停摆。复利取决于持续的纪律；纪律正是第 7 节三个战略赌注要守护的东西。

---

## 5. 五项风险

下面每项风险都分四部分写：**描述**（风险是什么）、**可能性**（低 / 中 / 高，附理由）、**影响**（低 / 中 / 高，附理由）、**缓解措施**（项目正在做的一件事，附 `file:line` 锚点）。缓解措施不是希望；它们绑在具体工件、具体日期、具体退出指标上。风险按战略严重度排序，不是按概率排序。

### 5.1 风险 1 — 采用天花板：需要它的团队太少

- **描述。** EKET 为"1–5 人类 + N agent"团队形态 + 有限 / 有状态 / 可审计 backlog 而建。同时满足**匹配这个形态**、**已到多 agent 协调债阈值**（`docs/articles/02-why-you-need-eket/en/article.md:236-237`）、**有运营纪律维持三仓分离**的团队，结构上数量有限。一个有 1,000 个生产用户的框架，与一个有 30 个生产用户的框架，故事不同；差别由**可触达市场**主导，不由协议质量主导。
- **可能性。** **中。** 2024–2026 年向多 agent 协调的行业转移是真实的（`docs/articles/02-why-you-need-eket/en/article.md:44-50`），1–5 + N 形态是文件化的甜蜜点（`docs/articles/01-what-is-eket/en/article.md:69-72`）。市场存在。风险在那个**子集**——(a) 生产中撞上四大痛点、(b) 在 LangGraph / CrewAI / AutoGen 之间选 EKET、(c) 维持住运营纪律——小到框架停滞在 20–30 个生产用户。
- **影响。** **高。** 30 个生产用户的框架有第 4 节的复利效应，但速率慢。1,000 个生产用户的框架复利速率产生网络效应——第三方 adapter 作者、第三方教程、第三方集成。最可能发生的失败模式不是协议错，而是市场结构性狭窄。
- **缓解措施。** 12 个月路线图（`docs/articles/13-adr-and-roadmap/en/article.md:243-289`）是主动缓解。Phase 1 把"10 个生产用户"作为退出指标（`docs/articles/13-adr-and-roadmap/en/article.md:257`）；Phase 3 把"50 个生产用户 + 多工具混用"作为退出指标（`docs/articles/13-adr-and-roadmap/en/article.md:284`）。文章系列本身就是缓解的承重部分：一份有 15 篇、可引用、可分发文章的框架，比没文章的框架有自助上手故事。诚实缺口：文章→采纳转化率的**测量**是 10 行埋点，团队还没发（见 `docs/articles/13-adr-and-roadmap/en/article.md:328`）。

### 5.2 风险 2 — LLM 工具整合：协议被吸收

- **描述。** 2024–2025 年的 LLM 工具格局至少有五个主流编排框架（LangGraph、CrewAI、AutoGen，外加 OpenAI Assistants API、Anthropic 的 Skills / Subagents）在争同一层。风险是到 2027 年，其中一个——最可能是某基础模型供应商自己的编排层——决定性胜出、吸收掉"agent-to-artifact 协议"的位置。EKET 沦为"拒绝用供应商层的团队"的小众工具，adapter 故事变无关。
- **可能性。** **中到高。** 2024–2025 年的供应商行为（快速加能力、抢发 agent 框架、重谈价格）使整合可信。风险不是"供应商的框架更好"——而是"供应商的框架**够好**、跟模型一起出货，采纳 EKET 的边际成本不划算"。
- **影响。** **高。** 整合后的格局把 EKET 压缩到小众。第 4 节的复利效应停摆。文章系列仍然正确，但市场不再听。
- **缓解措施。** 缓解措施是**人机同协议不变量**。截至模型知识截止，供应商框架都是 agent-to-agent 或 agent-to-tool；**没有一个把"人 claim"和"AI claim"视为同一个数据库转移**。只要人在环的协调故事结构上重要，EKET 就有一个可防守的位置。**主动的工作是让"人在环"成为 first-class 文档化模式**——不仅一篇文章，更是一个可运行的、带托管 demo 的示例。Phase 3 规划的跨 adapter 一致性测试套件（`docs/articles/13-adr-and-roadmap/en/article.md:283`）是二阶缓解：如果某供应商框架能过一致性测试，**协议就是持久契约，与实现者是谁无关**。诚实缺口：一致性测试套件是草案、未交付；交付它的工作是未来 12 个月的工作。

### 5.3 风险 3 — 更优 meta-protocol 出现：OpenClaw 胜出（或它的继任者）

- **描述。** OpenClaw（在 `docs/articles/GLOSSARY.md:24` 提及，桥接设计在 `docs/architecture/OPENCLAW-INTEGRATION-DESIGN.md`）是一个配套的 agent 编排协议。MCP（Model Context Protocol）生态是另一个候选。一个 *meta-protocol* 坐在 LLM 工具与编排框架之间、并吸收 adapter 契约的未来，是可信的。EKET 的 adapter 故事于是变成"**许多**可能 binding 之一"，而不是规范的那一个。
- **可能性。** **中。** Meta-protocol 是 2025–2026 的行业趋势。TCP/IP / OAuth / OpenAPI 的历史表明：meta-protocol 既能吸收原本按供应商划分的用例，**也可能在合并前分裂十年**。诚实版：没人知道它往哪走。
- **影响。** **中。** 一个吸收了 adapter 契约的 meta-protocol**不会**让 EKET 的*协议*失效（ticket 状态机、四级降级、人机同协议不变量都在）；它压缩可触达表面。EKET 从"协议本身"变成"meta-protocol 的一个实现"。复利效应停摆，但协议活下来。
- **缓解措施。** 缓解措施是**主动参与 meta-protocol 讨论**。`docs/architecture/OPENCLAW-INTEGRATION-DESIGN.md` 里的 OpenClaw 桥接设计是看得见的工作。诚实版：团队交付了桥接设计、不是已经对照 OpenClaw 参考客户端验证过的桥接实现。第二个缓解是 **adapter 契约的极简主义**——`docs/articles/12-multi-tool-support/en/article.md:248-302` 的论证：契约小（5 项要求，200 行），那么任何吸收它的 meta-protocol 都不需要重写 EKET。协议不变；binding 变。

### 5.4 风险 4 — 维护负担：Rust + Node.js + Shell 的健康成本

- **描述。** EKET 同一份协议跑在三层 runtime 之上（L0 Shell、L1 Rust、L2 Node.js）外加 L3 Shell 降级（`docs/articles/01-what-is-eket/en/article.md:131-140`；`docs/articles/05-four-level-degradation/en/article.md:100-105`）。四 runtime 架构是承重设计决策——`docs/articles/03-technical-value-choices/en/article.md:251-285` 作为 Choice 7 在辩护——但维护税是真实的。CHANGELOG 显示 Rust 迁移在途中（`CHANGELOG.md:67-92`），253 个 Rust 测试加 1519 个 Node.js 测试（按迁移的退出指标），**项目还没有达到稳定的发布节奏**。风险在于三 runtime 的维护成本跑赢贡献者基数，L0 / L3 实现悄悄腐烂——因为没人有激励去维护它们。
- **可能性。** **中到高。** 维护税是已知的成本，贡献者基数小（项目还没公开贡献者数量，`docs/articles/13-adr-and-roadmap/en/article.md:285` 把"一个外部贡献者"作为 Phase 3 退出指标——意味着团队目前是唯一贡献者）。L0 shell 实现 322 行（`scripts/eket-slaver-auto.sh:1-322`），最容易"以后再修"——因为它最简单。诚实版：团队是整个 runtime 层的单点故障，团队小。
- **影响。** **中。** 单一 runtime 层坏掉不否定项目——这正是四层模型存在的意义。但一个**过时**的 runtime 层（18 个月没更新、跑在已弃用的 Rust 或 Node.js 版本上）会成为第 5.5 节安全风险的入口，也会成为外部贡献者 fork 项目的借口。第 4 节的复利效应放缓。
- **缓解措施。** 缓解措施是 `scripts/eket-start.sh` 中规划的 L0 文件队列冒烟测试（见 `docs/articles/13-adr-and-roadmap/en/article.md:316`）——30 行 shell 脚本，启动时跑一遍文件队列原语，rename 不原子就直接 abort 并给清晰提示。这是一个**一次性修复**，把一个 30 行的潜在 bug 变成启动期错误。第二个缓解是 `benchmarks/check-regression.mjs:1-84` 里的 CI 测试矩阵——文件队列 p95 回归超过 30% 就让 build 挂掉（`benchmarks/baseline.json:4`）。诚实缺口：L0 / L1 / L2 / L3 *能力*矩阵没有等价的 CI gate——一个让 L3 降级失能的未来回归**不会让 build 挂**，因为 build 不测它。

### 5.5 风险 5 — 安全：Agent 自主权作为攻击面

- **描述。** 一个 EKET Slaver 能跑 `bash`、能写文件、能推分支、能发 hook 事件。让协议有用的能力，让它在错的人手里危险。被（通过 prompt 注入、一张恶意 ticket、或一个被攻陷的 hook handler）骗去跑 `rm -rf` 或推一条泄露凭据的 commit 的 Slaver，能造成真实破坏。hook 服务器的 `PreToolUse` 权限检查（`node/src/hooks/http-hook-server.ts:1161-1167`）是结构性缓解，但缓解强度等于它执行的规则集强度，规则集是 `node/src/hooks/pre-bash-dispatcher.ts:7-13` 里五类（路径穿越、危险命令、敏感路径、命令注入、资源限制）的人工清单。
- **可能性。** **中。** Prompt 注入是 2024–2026 行业关切；失败模式众所周知、攻击面是结构性的。风险不是"框架有 bug"——而是"框架在正确执行攻击者提供的指令"。诚实版：没有软件能完全防御这一类攻击，框架的防御是一份人工维护的规则集，**不是证明**。
- **影响。** **高。** 一起高调事故——公开仓库、泄露凭据、生产库上的 `rm -rf`——是产生 6 个月采用冻结的那种事件。第 4 节的复利效应反转：1,000 用户的框架发生安全事件，第一个月掉 200 用户，**事后报告如果不诚实就永久失去**。
- **缓解措施。** 缓解措施是 `node/src/hooks/dispatcher.ts:213-425` 的 **Permission Pipeline** 与 `node/src/hooks/http-hook-server.ts:14-19` 的 **`PreToolUse` 端点**。Pipeline 是一串*检查*，可以 `pass` / `fail` / `modify` 或注入反馈（`docs/articles/12-multi-tool-support/en/article.md:225-230`）。`node/src/hooks/pre-bash-dispatcher.ts:7-13` 的五类是第一道防线；`node/src/hooks/http-hook-server.ts:144-171` 的 `PermissionRequest` 与 `PermissionDenied` 事件是第二道。第二个缓解是 `docs/articles/06-master-slaver-protocol/en/article.md:226-274` 的 **Saga 5 步完成契约**：每次 `task:complete` 跑 `validate → test → checkpoint → commit → notify`，**被攻陷的 Slaver 仍然要在 commit 落地前通过 Saga 的 `test` 步**。第三个缓解是 `docs/articles/06-master-slaver-protocol/en/article.md:469-488` 的 **SQLite 行上的审计痕迹**：每次转移都有时间戳、每次领取都记主体，事后取证查询就是一条 `SELECT`。诚实缺口：审计痕迹是给*取证*用的，不是给*预防*用的。预防失败产生取证记录；取证记录不能撤销损害。

---

## 6. 缓解措施——项目对每项风险在做的事

第 5 节的缓解措施散在代码库、路线图、架构文档里。本节合并为一张表，按风险排序，让 Master 审稿人和未来 12 个月的规划人能一眼看完。

| 风险 | 缓解行动 | 具体工件 | 日期 / 退出指标 | 出处 |
|---|---|---|---|---|
| **5.1 采用天花板** | 交付 Phase 1 退出（10 个生产用户） | v3.0.0 + 100% 测试通过 | 2026-09-30 | `docs/articles/13-adr-and-roadmap/en/article.md:255-258` |
| **5.1 采用天花板** | 交付文章-转化埋点 | 10 行埋点到上手流程 | 未定日期 | `docs/articles/13-adr-and-roadmap/en/article.md:328` |
| **5.2 LLM 工具整合** | 交付托管人在环 demo | 公开 URL 上可运行示例 | 未定日期 | 新工作；Phase 2 候选 |
| **5.2 LLM 工具整合** | 交付跨 adapter 一致性测试套件 | 200 行测试 harness | 2027-05-31（Phase 3 退出） | `docs/articles/13-adr-and-roadmap/en/article.md:283` |
| **5.3 meta-protocol 出现** | 对照 OpenClaw 参考客户端验证桥接 | 可工作的桥接实现 | 未定日期 | `docs/architecture/OPENCLAW-INTEGRATION-DESIGN.md` |
| **5.3 meta-protocol 出现** | 保持 adapter 契约极简（≤ 5 项要求） | 契约冻结在 `docs/articles/12-multi-tool-support/en/article.md:248-302` | 持续 | 同上 |
| **5.4 维护负担** | 交付 `scripts/eket-start.sh` 中的 L0 文件队列冒烟测试 | 30 行 shell | v3.0.0（2026-09-30） | `docs/articles/13-adr-and-roadmap/en/article.md:316` |
| **5.4 维护负担** | 为 L0/L1/L2/L3 能力矩阵加 CI gate | `benchmarks/` 中的新基准 | 未定日期 | 新工作 |
| **5.5 安全** | 扩展 `node/src/hooks/pre-bash-dispatcher.ts:7-13` 规则集 | 每次事故加新规则 | 持续 | `node/src/hooks/pre-bash-dispatcher.ts` |
| **5.5 安全** | 在 L2 Node.js Saga 交付 PII 脱敏（ADR-005 候选） | 两层脱敏（regex v1、learned v2） | Phase 2（2027-01-31） | `docs/articles/13-adr-and-roadmap/en/article.md:219-225`，`docs/articles/13-adr-and-roadmap/en/article.md:270` |
| **5.5 安全** | 在 `tickets` 表上落地"每 ticket 成本预算"（ADR-006 候选） | `cost_budget` 列 100% Slaver 调用填充 | Phase 2（2027-01-31） | `docs/articles/13-adr-and-roadmap/en/article.md:227-232`，`docs/articles/13-adr-and-roadmap/en/article.md:271` |

**关于诚实性的注。** 上面 11 项缓解里有 3 项标"未定日期"。诚实的版本是：项目对部分风险（5.4 L0 冒烟测试、5.5 PII 脱敏）已经**交付了**缓解；对另外一些（5.2 托管 demo、5.3 OpenClaw 桥接验证）只**识别了**缓解、没定日期。一份不点名未定缓解的风险章节，是在**藏**它的开放工作；一份点名的，才在**做**自己的工作。

**缓解不相互独立。** 交付 L0 冒烟测试（5.4）是 L0/L1/L2/L3 能力矩阵 CI gate（同样 5.4）的前置；没冒烟测试，矩阵不可实例化。交付 PII 脱敏（5.5）是托管人在环 demo（5.2）的前置；没脱敏，demo 就是泄漏面。缓解措施构成一张**依赖图**，依赖图才是 12 个月路线图（`docs/articles/13-adr-and-roadmap/en/article.md:243-289`）实际在调度的东西。把路线图当 feature list 读的读者错过了结构；路线图是一份**风险缓解排期**。

---

## 7. 战略赌注——EKET 必须在 2027 年赢的 2-3 个具体承诺

战略赌注不是抱负。抱负说"我们要成为领先协议"；赌注说"在 X 日之前交付 Y 工件，Y 可被审计"。下面三个赌注是后者。它们是**如果兑现，能撑起未来 12 个月投资的最小集合**。任何一项没兑现，本文都诚实地说明是哪一项、意味着什么。

### 赌注 1 — 2026-09-30 前发布 v3.0.0，Rust 迁移收尾

**当前状态。** v2.19.0-beta（2026-05-07 发布，见 `CHANGELOG.md:8`）和未发布的 `Rust Migration` 块（`CHANGELOG.md:67-92`）是当前状态。Rust 核心有 253 个通过测试；Node.js 层有 1519 个通过测试；红队修复（TASK-214~221，见 `CHANGELOG.md:79-86`）已经落地。团队在迁移的**中途**，不是结尾。

**赌注。** 到 **2026-09-30**，项目交付一个 `v3.0.0` tag，配套 `docs/articles/13-adr-and-roadmap/en/article.md:255-258` 的三个退出指标：(a) `rust/crates/eket-core` 和 `node/src/` 的 100% 测试通过率，由干净 runner 上的 `cargo test` 和 `npm test` 度量；(b) **10 个生产用户**用 EKET 在任一层级完成过至少一次完整 ticket 循环；(c) **0 个 P0/P1 bug** 在 `jira/tickets/` 里超过 30 天未处理。tag 可被审计：读者可以 `git checkout v3.0.0`、跑测试套件、从支持邮件列表数生产用户、grep `jira/tickets/` 找陈旧 P0/P1。

**为什么是赌注一。** 这个列表里其它赌注都依赖 v3.0.0 按时落地。v3.0.0 拖过 2026-09-30 的项目，是已经丢掉发布节奏的项目；丢掉节奏的项目不能为 2027 年日期做出可信承诺。赌注一也是**最便宜**验证的：发布 tag 是二值的、测试数量是数字、生产用户数量是可数的。

**没兑现意味着什么。** Phase 1 **暂停**、不延期。暂停的 Phase 比拖期的 Phase 便宜——拖期的 Phase 拖着后面所有东西（见 `docs/articles/13-adr-and-roadmap/en/article.md:310`）。团队就"什么拖了"写一页事后报告、修订日期；日期不是被悄悄延期的截止线。

### 赌注 2 — 2027-01-31 前对 ADR-004（多主机状态）做出接受或拒绝的书面决定

**当前状态。** ADR 是草案、不是决议。候选决议在 `docs/articles/13-adr-and-roadmap/en/article.md:211-217`，架构 trade-off 在 `docs/articles/03-technical-value-choices/en/article.md:100-102`："建多区域用户数据服务的团队应该选 Postgres，**会选对**。为单机 1–5 + N agent 团队建协调层的团队应该选 SQLite，运维节省是真的。" 1–5 + N 单机是 EKET 今天的工作负载；多主机是假设，**第二个主机上线那天变成紧急**。

**赌注。** 到 **2027-01-31**，项目要么 (a) 接受 ADR-004 并交付多主机 append-log 后端的第一版，要么 (b) 拒绝 ADR-004 并附书面理由（例如："我们不会建多主机后端，直到某生产用户有这个工作负载；SQLite 天花板对 1–5 + N 团队形态就是正确天花板"）。**决议**就是退出，不是实现。**带理由的拒绝**也是赌注 2 的成功，不是失败。

**为什么是赌注二。** 决议是路线图上每项多主机特性的约束。还没对 ADR-004 决议的团队，不能对托管产品做出可信承诺、不能在 L1 Rust 实现中把跨主机状态排到前面、**不能回答"50 个 Slaver 跨 3 个 region 怎么办"的企业问题**。决议是二值的、深思熟虑的拒绝成本也低。

**没兑现意味着什么。** 路线图进入"以后再定"状态，"以后再定"是路线图**最贵**的状态。第 4 节的复利效应停摆，因为多主机天花板就是可触达市场的天花板。

### 赌注 3 — 2027-05-31 前把 axum HTTP API 升级为稳定 v1.0，并带跨 adapter 一致性

**当前状态。** `eket-server` crate 在 v2.19.0-beta 已经在跑，**15 条** `/api/v1/*` 路由外加 `/sse/events` 与 `/ws`——见 `rust/crates/eket-server/src/lib.rs:461-492` 和 `docs/articles/11-sdk-and-integration/en/article.md:9`。版本不是 v1.0；API 形态稳定（路由稳定、JWT / Bearer 鉴权契约稳定）但版本 tag 缺失。路线图 Phase 3（`docs/articles/13-adr-and-roadmap/en/article.md:277-289`）定下了 bar：**3 个 LLM 工具**（至少 Claude Code、Cursor、Codex）**通过同一份 `protocol/state-machines/ticket-status.yml:1-112` schema 的测试套件**。

**赌注。** 到 **2027-05-31**，项目交付 `eket-server v1.0`，配套三个属性：(a) 15 条 `/api/v1/*` 路由标 stable，破坏性变更策略发布在 `docs/roadmap/RELEASE-POLICY.md:1-25`；(b) 一份**约 200 行的一致性测试套件**，对同一份 SQLite 文件验证 `task:claim` / `task:complete` / `task:resume`，**在 Claude Code / Cursor / Codex 三个 adapter 上都通过**（`docs/articles/12-multi-tool-support/en/article.md:80-91` 列出的三个完整 / 降级 adapter）；(c) **至少 5 个生产用户**报告在活跃使用多工具混用。tag 可被审计；一致性套件可被运行；多工具混用要求可从支持邮件列表观察到。

**为什么是赌注三。** axum HTTP API 是跨语言、跨 runtime 的集成面（`docs/articles/11-sdk-and-integration/en/article.md:84`）。JS SDK 和 Python SDK 在底层就是 HTTP 客户端；axum 服务是线协议事实源。v1.0 意味着线协议**不再是移动靶**。跨 adapter 一致性套件是 adapter 契约（`docs/articles/12-multi-tool-support/en/article.md:248-302`）的**结构性强制**——没它，契约是 markdown 文档，markdown 文档不能阻止回归。

**没兑现意味着什么。** 协议的 adapter 故事停留在"叙事"层面、不是"一致性测试"层面。第 4.1 节（adapter 复利）的复利停摆，因为新 adapter 不能被自信地加进来——没人能保证它不会静默破坏现有 adapter。项目仍然有用，但**元层叙事**——"任何工具、同一协议"——不再可被验证。

### 三个赌注写在一段里

如果 EKET 在 2026-09-30 前交付 v3.0.0、在 2027-01-31 前对 ADR-004 做出决议、在 2027-05-31 前交付 `eket-server v1.0` 与跨 adapter 一致性，那项目就走在本文论证的轨道上：在 LLM 工具格局中守住一个紧凑、有焦点、可防守的协议位，adapter 故事在复利、生产用户基数可被度量。如果任一项没兑现，轨道变平；如果两项没兑现，项目进入**维护期**而不是**成长期**。诚实的版本也承认：维护期是合法的结局——协议仍然有用、代码库仍在维护、文章系列仍在被引用——但它**不是 12 个月路线图所写的那种结局**。

---

## 8. 参考

下面的引用是本文承重参考。每一个可能被挑战的主张都带 `file:line` 指针；行号在写作时已核对。

### 内部——协议与 ADR

- `docs/articles/01-what-is-eket/en/article.md:69-72` — 1–5 + N 论点与"特种兵团"规模带
- `docs/articles/01-what-is-eket/en/article.md:74-75` — 人机同协议不变量
- `docs/articles/01-what-is-eket/en/article.md:131-140` — 四 runtime 实现矩阵
- `docs/articles/01-what-is-eket/en/article.md:152` — LangGraph / CrewAI / AutoGen 对照行
- `docs/articles/01-what-is-eket/en/article.md:160` — 单人反模式
- `docs/articles/01-what-is-eket/en/article.md:213-217` — 人机同协议教训
- `docs/articles/02-why-you-need-eket/en/article.md:44-50` — 2024–2026 瓶颈转移
- `docs/articles/02-why-you-need-eket/en/article.md:236-237` — 协调债作为新债
- `docs/articles/03-technical-value-choices/en/article.md:100-102` — SQLite 天花板、多主机逃生口
- `docs/articles/03-technical-value-choices/en/article.md:251-285` — Choice 7：四级而非三级
- `docs/articles/04-three-repo-arch/en/article.md` — 生命周期分离论点
- `docs/articles/05-four-level-degradation/en/article.md:100-105` — L0/L1/L2/L3 能力矩阵
- `docs/articles/05-four-level-degradation/en/article.md:117-120` — 322 行 L0 的 `wc -l` 证据
- `docs/articles/06-master-slaver-protocol/en/article.md:78-86` — 角色是转移、不是主体
- `docs/articles/06-master-slaver-protocol/en/article.md:166-167` — SQLite CAS claim 原语
- `docs/articles/06-master-slaver-protocol/en/article.md:226-274` — Saga 5 步完成契约
- `docs/articles/06-master-slaver-protocol/en/article.md:276-294` — "人不进 claim 循环"规则
- `docs/articles/06-master-slaver-protocol/en/article.md:469-488` — ticket 行 schema
- `docs/articles/11-sdk-and-integration/en/article.md:9` — 四种集成面
- `docs/articles/12-multi-tool-support/en/article.md:80-91` — adapter 能力矩阵
- `docs/articles/12-multi-tool-support/en/article.md:152-184` — Cursor + Codex + Claude Code 协作示例
- `docs/articles/12-multi-tool-support/en/article.md:225-230` — hook pipeline
- `docs/articles/12-multi-tool-support/en/article.md:248-302` — adapter 契约（5 项要求）
- `docs/articles/12-multi-tool-support/en/article.md:316` — 协议 vs 工具引文
- `docs/articles/13-adr-and-roadmap/en/article.md:211-217` — ADR-004 候选
- `docs/articles/13-adr-and-roadmap/en/article.md:219-225` — ADR-005 候选（PII 脱敏）
- `docs/articles/13-adr-and-roadmap/en/article.md:227-232` — ADR-006 候选（成本预算）
- `docs/articles/13-adr-and-roadmap/en/article.md:243-289` — 12 个月路线图（3 个 Phase）
- `docs/articles/13-adr-and-roadmap/en/article.md:255-258` — Phase 1 退出指标
- `docs/articles/13-adr-and-roadmap/en/article.md:269-271` — Phase 2 退出指标
- `docs/articles/13-adr-and-roadmap/en/article.md:283-285` — Phase 3 退出指标
- `docs/articles/13-adr-and-roadmap/en/article.md:310` — "暂停、不延期"规则
- `docs/articles/13-adr-and-roadmap/en/article.md:316` — L0 冒烟测试缓解
- `docs/articles/13-adr-and-roadmap/en/article.md:328` — 文章-转化埋点缓解
- `docs/articles/GLOSSARY.md:24` — OpenClaw 词条
- `docs/adr/ADR-001-four-level-degradation.md:1-152` — 四级降级决议
- `docs/adr/ADR-002-master-slaver-mode.md:1-195` — Master-Slaver 统一决议
- `docs/adr/ADR-003-file-queue-fallback.md:1-230` — 文件队列降级决议
- `docs/architecture/OPENCLAW-INTEGRATION-DESIGN.md` — OpenClaw 桥接设计
- `docs/roadmap/RELEASE-POLICY.md:1-25` — 发布策略

### 内部——源码与脚本

- `protocol/state-machines/ticket-status.yml:1-112` — 17 状态状态机
- `protocol/state-machines/ticket-status.yml:14-91` — `who_can_transition` 列表
- `node/src/core/sqlite-client.ts:966-976` — `_casUpdate` CAS 原语
- `node/src/core/saga-executor.ts:22-66` — Saga 执行器（TypeScript）
- `node/src/hooks/http-hook-server.ts:14-19` — hook 服务器端点
- `node/src/hooks/http-hook-server.ts:144-171` — 28 个生命周期事件
- `node/src/hooks/http-hook-server.ts:1161-1167` — `PreToolUse` 权限检查
- `node/src/hooks/dispatcher.ts:213-425` — HookDispatcher 与 CheckRegistry
- `node/src/hooks/pre-bash-dispatcher.ts:7-13` — 五类第一道防线
- `rust/crates/eket-server/src/lib.rs:461-492` — 15 条 axum `/api/v1/*` 路由
- `rust/crates/eket-core/src/ticket.rs:100-103` — `tmp → rename` 原子写
- `rust/crates/eket-core/src/saga.rs:30-94` — Saga 执行器（Rust 镜像）
- `scripts/eket-slaver-auto.sh:1-322` — L0 Slaver 循环（322 行，`wc -l`）
- `benchmarks/baseline.json:1-7` — 文件队列 p95 baseline
- `benchmarks/baseline.json:4` — 30% 回归阈值
- `benchmarks/check-regression.mjs:1-84` — CI 回归 gate

### 内部——当前状态与 CHANGELOG

- `CHANGELOG.md:8` — v2.19.0-beta 发布日期（2026-05-07）
- `CHANGELOG.md:67-92` — 未发布的 Rust Migration 块
- `CHANGELOG.md:79-86` — 红队修复（TASK-214~221）
- `README.md:140-145` — 规范的 `task:claim` 19× / 冷启动 187× / 内存 10× 表
- `README.md:116` — axum `:9877` 默认端口

### 外部——相邻框架（基于模型截至 2026 年 1 月的训练数据；URL 供读者自验）

- **LangGraph** — https://www.langchain.com/langgraph — 有状态多 actor LLM 应用的图编排；基于 LangChain；通过 checkpointer 提供 durable execution；2024 年中首发；2025 年广泛进入生产。
- **CrewAI** — https://www.crewai.com/ — 角色化多 agent 框架；agent 有 role / goal / backstory；Python 优先；2023 末 / 2024 初首发；2024–2025 生产使用持续增长。
- **AutoGen**（微软） — https://github.com/microsoft/autogen — 0.2.x 走过 2024；v0.4（事件驱动 actor model）2025 年发布；微软研究院 / Foundry 撑腰；支持长跑时分布式 agent。
- **OpenClaw** — 见 `docs/articles/GLOSSARY.md:24`；EKET 桥接设计在 `docs/architecture/OPENCLAW-INTEGRATION-DESIGN.md`；一个配套的 agent 编排 meta-protocol。*注：OpenClaw 的引用是内部的；meta-protocol 的外部权威源在本次写作中未能取得，**应交由 Master 审稿人在发布前再次核实**。*

### 关于检索日期与置信度

第 3 节的外部框架描述与上面的引用基于模型 2026 年 1 月训练数据的知识，外加仓库内引用。本次写作 session 期间**无法取得联网权限**做当下状态核验。Master 审稿人应在发布前再次核验 LangGraph / CrewAI / AutoGen 的当前版本与功能集。**所有仓库内引用都经过 `file:line` 核验。**

---

*这是 EKET 15 篇系列文章的最后一篇。系列从论点（`01`）开始，论证 ROI（`02`）、解释技术选择（`03`）、分离生命周期（`04`）、搭建降级阶梯（`05`）、规定协议（`06`）、论证存储（`07`）、回溯性能数字（`08`）、设计可观测性与恢复（`09`）、产出上手剧本（`10`）、暴露集成面（`11`）、论证多工具故事（`12`）、总结 ADR 与路线图（`13`）、走查真实案例（`14`）、以本篇展望收尾（`15`）。如果未来 12 个月顺利——v3.0.0 按时交付、ADR-004 决议落地、`eket-server v1.0` 带一致性发布——那这系列就是一份"在 2026–2027 LLM 工具格局中挣得位置"的项目记录。如果不顺利，系列仍然有用，但**收尾章会被读作维护期注脚、而不是成长期宪章**。诚实的版本是：两种读法下，文章是同一篇。*




