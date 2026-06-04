# 01 — 什么是 EKET：特种兵团论

> **TL;DR** — EKET 是一套**面向人机团队的协作协议**，不是另一个 agent 框架。它把人类和 AI 视为同一套工作流中的对等节点：小型指挥层（1–5 名人类）通过 ticket 设定方向，大规模执行层（N 个 AI agent）并行落地。协议由三个正交层支撑——三仓分离、四级降级、Master-Slaver 状态机——并以**完全相同**的形式交付到 Claude Code、Cursor、Codex、Copilot、Gemini。

> **核心要点**
> 1. EKET 是**协议层**，不是 workflow 引擎，也不是 agent runtime。
> 2. 1–5 人 + N agent 的模型之所以成立，依赖"人机遵守同一份契约"这一前提。
> 3. 三大支柱（仓分离 / 降级 / 状态机）相互独立、可干净组合。
> 4. **协议与具体 LLM 工具解耦**——模型只是实现细节。
> 5. 核心论点：小指挥、大执行、通过 artifact 共同担责。

---

## Executive Summary

**给决策者（读完这段即可离开）：**

| 问题 | 答案 |
|---|---|
| 它是什么？ | 一套通过 ticket / branch / PR 表达的人机团队协作协议 |
| 给谁用？ | 已经跨过"AI 仅作自动补全"、进入"AI 作为团队成员"阶段的工程团队 |
| 收益是什么？ | 可预测的吞吐：ticket → claim → PR → review，无论执行者是人还是模型 |
| 代价是什么？ | 纪律：三个关注点放在三个地方，agent 必须先注册才能领取 |
| 不做的代价？ | 临时性 prompt 调度随人数线性增长，AI 产能随模型指数增长——**协调债会复利** |

本文其余部分展开协议的结构与每一处设计的理由。

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

2024 到 2026 之间，软件工程瓶颈转移了两次。

- **2024 — Prompt 稀缺。** 工程师花数小时打磨 prompt，从模型中挤出价值。
- **2025 — Agent 泛滥。** 多家自治 agent（Claude Code、Cursor、Codex、Copilot、Aider）各自能端到端地完成 ticket。**新瓶颈变成协调**：谁在做什么、处于什么状态、crash 后会怎样？

同一年，每个规模化采用 agent 的团队开始出现三种失败模式：

1. **上下文丢失。** agent 跑了 30 分钟然后挂了。30 分钟的工作不可恢复——它只活在 chat 滚动条里。
2. **编辑冲突。** 两个 agent 并行修同一条 lint，第二个覆盖第一个。
3. **review 不透明。** 人类 reviewer 拿到 4000 行 diff，没有任何叙述——只有模型自己知道每行存在的理由。

这些不是模型问题，而是**协调协议问题**。模型是执行者；协议决定**执行什么、谁执行、什么顺序、出了事怎么恢复**。

> "如果你的团队超过一人，你面对的并非 agent 问题——你面对的是恰好涉及 agent 的协调问题。"
> — *EKET 设计笔记，2025-08*

EKET 的赌注：**把状态的关键路径从模型中抽出来，落到 artifact 上**。模型变得可替换；artifact 持久存在。

---

## 2. 核心论点

论点有三个，且相互正交。每个独立，每个都可与其它组合。单独看都不是新想法——新的是**把它们一起用在人机团队上**。

### 2.1 小指挥、大执行（1–5 + N）

"特种兵团"团队规模小、决策密集，背后有更大执行体。指挥层决定**做什么、为什么**；执行层决定**怎么做、何时做**。**数字本身有意义**：1–5 人是同步通信（Slack 频道、站会、pair）仍然有效的规模。超过这个数你需要流程；不到这个数流程是负担。

### 2.2 人机遵守同一份协议

这是最激进的部分。人类"领取"ticket 是把 Kanban 板上从 `READY` 挪到 `IN_PROGRESS`。AI "领取"是跑 `eket task:claim TASK-NNN` 命中 SQLite。**从系统视角看，是同一个操作**——原子、幂等、单一事实源。结果：人机可以中途交接工作而无需翻译。

### 2.3 三个关注点、三个仓库

知识（我们学到了什么）、任务（我们在做什么）、代码（我们在造什么）是三种不同生命周期。知识 append 居多；任务有状态；代码有版本。试图把它们混在一起，必然造就一个对三种都糟糕的工具。EKET 把它们分别放在 `confluence/`、`jira/`、`code_repo/`，并显式交叉引用。

---

## 3. 协议如何运转

协议是状态机。状态是三份 artifact 的并集。状态转移是协议操作。

### 3.1 状态机（master-slaver）

```
                    ┌──────────────┐
                    │   INBOX      │  ← 人类提交需求
                    └──────┬───────┘
                           │ epic:create
                           ▼
                    ┌──────────────┐
            ┌──────│    READY     │  ← ticket 在 jira/tickets/
            │      └──────┬───────┘
            │             │ task:claim  (SQLite CAS)
            │             ▼
            │      ┌──────────────┐
            │      │ IN_PROGRESS  │  ← checkpoint、分支、工作
            │      └──────┬───────┘
            │             │ task:complete (Saga 5 步)
            │             ▼
            │      ┌──────────────┐
            │      │ IN_REVIEW    │  ← PR open，master 扫描
            │      └──────┬───────┘
            │             │ gate:review (通过)
            │             ▼
            │      ┌──────────────┐
            │      │    DONE      │  ← 合并：feature → testing → main → miao
            │      └──────────────┘
            │
            │      失败 / 崩溃
            └─────► RESUME（task:resume 从最后一个 checkpoint）
```

状态机实现在 `node/src/core/`，Rust core (`rust/crates/eket-core/`) 镜像以便 CLI 高速访问。两端读写同一张 SQLite 表；**数据库是唯一事实源**。

### 3.2 三个仓库

| 关注点 | 路径 | 生命周期 | 可变性 |
|---|---|---|---|
| 知识 | `confluence/memory/` | append 居多 | 允许编辑但不鼓励 |
| 任务 | `jira/tickets/` | 有状态、有限 | 由 `check-ticket-immutability.sh` 强制不可变 |
| 代码 | `code_repo/`（或 `rust/`、`node/`） | 有版本、有分支 | 标准 git |

`jira/tickets/TASK-001/` 里的 ticket 引用 `confluence/memory/lessons/` 中的一条或多条 note，并引用 code repo 中的一次或多次 commit。**任何 ticket 必须至少引用其它两个之一**。这条规则由 `validate-ticket-pr.sh` 强制，是跨仓导航可幸存的原因。

### 3.3 降级是 feature，不是 bug

EKET **同一份协议交付四种实现**，按能力排序：

| 级别 | 实现 | 何时运行 | 能力 |
|---|---|---|---|
| L0 | Shell 脚本（`scripts/eket-*.sh`） | 零依赖环境、CI、恢复 | 读、写、claim——**除文件锁外无并发保证** |
| L1 | Rust core（`rust/crates/eket-cli/`） | 人类默认、快速循环 | 完整 CAS、axum HTTP API、21ms/cmd |
| L2 | Node.js（`node/src/`） | Dashboard、LLM gateway、webhook | 完整 Saga、hook server、跨工具桥 |
| L3 | Shell 降级 | L2 不可用但 L1 可用 | 只读 + heartbeat |

**协议不因级别变化。** 通过 L0 shell claim 的 ticket 与通过 L1 Rust CLI claim 的是同一个 ticket。降级链自动；`eket system:doctor` 报告当前激活的级别。

### 3.4 与具体工具解耦

协议是契约。契约有实现者。EKET 为五种 LLM 工具提供实现：Claude Code（`CLAUDE.md` + `.claude/skills/`）、Cursor（`CURSOR.md` + `.cursorrules`）、Codex（`CODEX.md`）、Copilot（`COPILOT.md`）、Gemini（`AGENTS.md`）。**五者读同一份状态，发射同一组操作。** 你可以让 3 个 Cursor agent + 2 个 Claude Code agent 共用同一份 backlog，留下同样的 audit 痕迹。

---

## 4. 取舍与替代方案

| 替代方案 | 做什么 | EKET 的差异 |
|---|---|---|
| **LangGraph / CrewAI / AutoGen** | *agent 间对话*的 workflow 引擎 | EKET 不编排 agent 之间的对话；编排的是 agent 与 **artifact** 的对话 |
| **OpenAI Swarm** | 轻量 agent 交接 | EKET 让交接**可持久**（ticket 状态在 crash 后幸存） |
| **纯 shell 脚本** | 每团队自造一次性自动化 | EKET 是**可复用**的协议——状态机、claim、review、dashboard 全部预制 |
| **GitHub Projects + Actions** | 单一 repo 上的 Kanban + CI | EKET 把知识、任务、代码放在三个不同关注点；GitHub Projects 把它们混在一起 |
| **临时 prompt 链** | 每个工程师自创 | EKET 标准化**契约**；prompt 保持自由 |

### 什么时候**不**该用 EKET

- 单人 + 单一 agent。协议开销超过协调收益。
- 纯 chat workflow，输出是消息而非 artifact。EKET 以 artifact 为中心。
- 拒绝把知识库放进版本控制的团队。

---

## 5. 实现要点

### 5.1 你实际跑的命令

```bash
# 一行安装
curl -fsSL https://raw.githubusercontent.com/godlockin/eket/main/scripts/quick-setup.sh | bash

# 启动角色
/eket-start                     # 自动检测：master 还是 slaver？
/eket-start -r master           # 显式
/eket-start -r slaver           # 显式

# 领取与交付
eket task:claim                 # 领取下一个 READY ticket
eket task:progress              # 看 DAG 与关键路径
git checkout -b feature/TASK-001-foo
# ... 实现 + 提交 ...
eket task:complete TASK-001     # Saga 5 步
```

### 5.2 源码哪里看

| 关注点 | 路径 | 备注 |
|---|---|---|
| 协议状态机 | `node/src/core/` | TypeScript 参考实现 |
| 高速 CLI | `rust/crates/eket-cli/` | 比 Node `task:claim` 快 19× |
| Axum HTTP API | `rust/crates/eket-server/` | 默认端口 9877 |
| Hook server | `node/src/hooks/` | 跨工具事件桥 |
| 三仓布局 | `confluence/`、`jira/`、`code_repo/`（或 `rust/`、`node/`） | 见 `docs/architecture/THREE_REPO_ARCHITECTURE.md` |
| 降级链 | `docs/architecture/DEGRADATION-STRATEGY.md` | 591 行权威规范 |

### 5.3 仓库内交叉引用

- 白皮书：`docs/architecture/FRAMEWORK.md:1`（576 行，协议语义的事实源）
- 三仓哲学：`docs/architecture/THREE_REPO_ARCHITECTURE.md:1`
- Master-Slaver 模式 ADR：`docs/adr/ADR-002-master-slaver-mode.md:1`
- File-queue 降级 ADR：`docs/adr/ADR-003-file-queue-fallback.md:1`

---

## 6. 经验教训

**教训 1 —— "降级"是被低估的设计决定。** 大多数"AI 编排"工具在 Redis 挂掉那天就死了。EKET 之所以幸存，是因为 300 行 shell 就能表达协议。shell 实现不是历史包袱，是系统的**地板**。

**教训 2 —— 三仓分离不是关于 git，是关于生命周期。** 知识、任务、代码的写入模式不同。混在一起强迫一个工具对三种都糟糕。分开让每个工具对一种都优秀。

**教训 3 —— 人机同一协议消除了一整类 bug。** 当人类可以中途把 ticket 交给 AI，AI 不可能做到人类做不到的事——因为状态机不允许。**协议是安全护栏**。

**教训 4 —— 1–5 人不是随便定的。** 不到 1，你不需要协议；超过 5，你需要组织设计。"特种兵团"规模是临界点：往下流程是负担，往上流程是必需。

---

## 7. 参考

- 内部：`README.md`、`docs/architecture/FRAMEWORK.md`、`docs/architecture/THREE-LEVEL-ARCHITECTURE.md`
- ADR：`docs/adr/ADR-001..003-*.md`
- 知识库：`confluence/memory/MEMORY.md`
- 系列下一篇：[`02-why-you-need-eket`](../../02-why-you-need-eket/zh-CN/article.md) —— 痛点 × 解法 × ROI
