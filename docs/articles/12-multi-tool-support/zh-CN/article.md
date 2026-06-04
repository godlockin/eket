# 12 — 多工具支持：一份协议，五种客户端

> **TL;DR** — EKET 在设计上**与具体 LLM 工具解耦**。协议——`task:claim`、`task:complete`、`task:resume`、`gate:review`——是契约；每种 LLM 工具（Claude Code、Cursor、Codex、Copilot、Gemini）都是一个**适配器（adapter）**，读同一份状态、发同一组操作。五种适配器中，两个是*完整*支持（Claude Code、Cursor），三个是*降级的单 agent* 模式（Codex、Copilot、AGENTS.md / Gemini）——这种区分是诚实陈述，不是贬低。跨工具事件桥位于 `node/src/hooks/`，在单一 HTTP 接口上暴露 28 种 hook 事件。**新增一种工具，大约 200 行 markdown 加上一个 HTTP 客户端就够了**，因为真正承担工作的是协议本身。

> **核心要点**
> 1. LLM 只是**实现细节**。契约是 `eket task:claim TASK-NNN` + ticket-shaped artifact，而不是"问 Claude"或"问 Cursor"。
> 2. 已交付的五种适配器分为**两个完整**（Claude Code、Cursor）和**三个单 agent**（Codex、Copilot、AGENTS.md / Gemini）——两者都是一等公民；差距是能力维度，不是合法性问题。
> 3. `node/src/hooks/` 中的跨工具事件桥是一台 HTTP 服务器，暴露 28 种 hook 事件（`PreToolUse`、`PostToolUse`、`TeammateIdle`、`TaskCompleted` 等），任何适配器都可以调用。
> 4. 一个真实的工作流——Cursor 写代码、Claude Code 审核、Codex 写测试、GitHub Actions 合并——运行在**同一张 SQLite tickets 表**上，留下**同一份审计轨迹**，与哪一步由哪个工具完成无关。
> 5. 新增工具是*契约测试*，不是*框架移植*：适配器必须（a）通过 `.eket/IDENTITY.md` 确认身份；（b）使用 ticket 的 YAML frontmatter；（c）遵守分支命名 + Conventional Commits；（d）向 HTTP 服务器发送 hook 事件；（e）写状态报告。`check-skill-anatomy.sh` 这个 CI 闸口会强制校验其结构。

---

## Executive Summary

**给决策者（读完这段即可离开）：**

| 问题 | 答案 |
|---|---|
| EKET 是不是把我们锁在某个 LLM 厂商？ | **不是。** 已交付五种适配器；适配器契约是文档化的、可测试的。 |
| 完整支持与降级模式有什么差别？ | 完整适配器使用 Skills + Subagents + Hooks；降级适配器用单一 agent 同时承担简化版 Master + Slaver。**协议相同，接口不同。** |
| 工具之间如何共享状态？ | 所有适配器都通过 `eket task:*` 命令读写同一张 SQLite `tickets` 表。没有 per-tool 数据库，没有 per-tool schema。 |
| 工具之间如何共享事件？ | `node/src/hooks/http-hook-server.ts` 中的 HTTP Hook Server 在 `/hooks/<event>` 上暴露 28 种生命周期事件。任何能讲 HTTP 的适配器都能参与。 |
| 新增第六种工具的成本？ | 约 200 行适配器 markdown（参考 `template/CLAUDE-TEMPLATE.md`）+ 一个向 hook 服务器发请求的 HTTP 客户端。无需修改协议。无需修改 schema。 |
| 如果*不*走"工具无关"路线，长期风险是什么？ | 厂商锁定效应会复利。如果底层模型 API 变化，协议可幸存；如果协议焊死在某个工具上，每次工具变化团队都要重新推导协议。 |

下文给出适配器契约、能力矩阵、跨工具事件桥、真实工作流样例，以及新工具的接入清单。

---

## 1. 动机——LLM 只是实现细节

2024 年的问题是"模型能不能做这个任务？" 2026 年的问题是"**在 N 个模型中，能不能用任意一个**，由少量人类指挥层监督，**完成这个任务，同时让我们不必在每次厂商发 breaking change 时重新设计协议**？"

三件事把这个问题推到台前：

1. **模型更迭频繁。** 2025 年 1 月到 2026 年 6 月之间，每家主流 LLM 工具至少发过两次破坏性 CLI 变更、一次 auth 轮换事件、一次 agent 框架弃用。焊死在单一工具上的团队每次都要重新做集成。把工具视为稳定协议的适配器的团队，改个 adapter 指向就能继续工作。
2. **专业化分工。** 不同模型各有擅长。Cursor 的 IDE 集成使它在有高 in-file 上下文的精准编辑上很强；Codex CLI 擅长按 spec 生成脚手架；Claude Code 的 Skills + Subagent 使它在多步审核与调度上很强。一个*能*混用三者的团队如果不混用，就在白白损失产能。
3. **采购异构化。** 许多工程组织同时向多家厂商采购，部分出于成本考虑，部分出于韧性，部分因为采购流程跑得比模型发布周期还快。焊死工具的协议强迫团队做单一采购决定；工具无关的协议则允许"按任务挑工具"。

EKET 的赌注，复述一遍：**模型是执行者；协议决定执行什么、谁执行、什么顺序、出了事怎么恢复**（`docs/articles/01-what-is-eket/en/article.md:55`）。当模型层变化时，只有适配器在变。

> "如果你的团队超过一人，你面对的并非 agent 问题——你面对的是恰好涉及 agent 的协调问题。"
> — *EKET 设计笔记，2025-08，引自 `01-what-is-eket/en/article.md:57-58`*

本文关注的推论是：如果你的团队同时使用多种 LLM 工具，你面对的不是*工具*问题，而是*适配器契约*问题。EKET 的回答是让这个契约**显式、最小、可测试**。

---

## 2. 核心论点——一份协议，多个客户端

每种工具看到的协议形态是相同的：

```
ticket（YAML frontmatter + 正文）
    │
    ├──> task:claim（SQLite 上的原子 CAS）
    ├──> <实现>
    ├──> task:complete（Saga 5 步）
    ├──> gate:review（PR + 叙述）
    └──> merge（feature → testing → main → miao）
```

契约中有五件事不容谈判，而且与哪种 LLM 来执行无关：

1. **Ticket 位于 `jira/tickets/`。** Ticket 是工作单元。状态机为 `INBOX → READY → IN_PROGRESS → IN_REVIEW → DONE`（`docs/articles/01-what-is-eket/en/article.md:88-115`）。
2. **`task:claim` 是 SQLite `tickets` 表上的 Compare-And-Swap。** 在 `rust/crates/eket-core/src/ticket.rs` 定义，通过 `eket task:claim TASK-NNN` 暴露。两个 agent 同时调用同一 ticket：一个赢，另一个收到明确的"已被领取"错误（`docs/articles/GLOSSARY.md:13`）。
3. **Saga 是五个原子步骤。** 验证 → 测试 → checkpoint → 提交 → 通知（`docs/articles/GLOSSARY.md:12`）。每一步都写一份 artifact。崩溃后通过 `task:resume` 可恢复。
4. **分支命名 `feature/<id>-<slug>`，提交遵循 Conventional Commits。** 由 `template/CLAUDE-TEMPLATE.md:218-230` 强制，并复刻到每个 per-tool 适配器文件。
5. **Review 产出带叙述的 PR。** Ticket 的 plan 与 AC 是叙述的事实源（`docs/articles/02-why-you-need-eket/en/article.md:111`）。

适配器之间变化的是 agent *如何*读 ticket、跑循环、写 PR——不是*协议操作是什么*。

---

## 3. 适配器矩阵——Claude Code / Cursor / Codex / Copilot / Gemini

下表是*诚实*的版本，不是排行榜。**完整支持**指该工具的原生原语（Skills、Subagents、Hooks）覆盖了全部五种 EKET 能力；**降级**指该工具运行在单 agent 模式下，一个执行者同时承担简化版 Master + Slaver；两种模式都接入同一张 SQLite。

| 能力 | Claude Code | Cursor | Codex CLI | Copilot CLI | Gemini / AGENTS.md |
|---|---|---|---|---|---|
| 启动时确认身份（`.eket/IDENTITY.md`） | ✅ | ✅ | ✅ | ✅ | ✅ |
| 读写 Ticket YAML frontmatter | ✅ | ✅ | ✅ | ✅ | ✅ |
| 通过 `eket` CLI 执行 `task:claim` | ✅（Subagent） | ✅（bash 块） | ✅（bash） | ✅（bash） | ✅（bash） |
| 执行 `task:complete` Saga 5 步 | ✅（完整 Saga） | ✅（完整 Saga） | ⚠️（手动 5 步） | ⚠️（手动 5 步） | ⚠️（手动 5 步） |
| Skills（`.claude/skills/eket/`） | ✅ | ❌（仅读 markdown） | ❌（读 `AGENTS.md`） | ❌（读 `AGENTS.md`） | ❌（读 `AGENTS.md`） |
| Subagent 调度（单进程内多 agent） | ✅ | ❌ | ❌ | ❌ | ❌ |
| Hook 事件发往 HTTP 服务器 | ✅（原生） | ⚠️（shell shim） | ⚠️（shell shim） | ❌（out-of-band） | ❌（out-of-band） |
| 多实例同 backlog（CAS 安全） | ✅ | ✅ | ✅ | ✅ | ✅ |
| 单 agent 模式（一会话 = Master + Slaver） | n/a（完整） | n/a（完整） | ✅ | ✅ | ✅ |
| 适配器文件 | `CLAUDE.md`（`CLAUDE.md:1-84`） | `CURSOR.md`（`CURSOR.md:1-32`） | `CODEX.md`（`CODEX.md:1-104`） | `COPILOT.md`（`COPILOT.md:1-80`） | `AGENTS.md`（`AGENTS.md:1-43`） |

**怎么读这张表：** 完整适配器（Claude Code、Cursor）原生支持整套*协议表面*——Skills、Subagents、Hooks。降级适配器（Codex、Copilot、AGENTS.md / Gemini）覆盖同样的**协议**，但覆盖不到同样的**表面**：单 agent 运行、遵守同样的 ticket 流、写入同一张 SQLite，但无法向自己派发 subagent，必须通过 shell 调用 `curl` 注册 hook 事件，而不是通过原生 hook 子系统。

这里应该诚实陈述强项与局限：

- **Claude Code** 是唯一拥有*原生* hook 子系统的适配器（每次工具调用前后都触发），加上内建 Subagent 调度机制。Hook 服务器本质上是对其原生事件面的封装（`node/src/hooks/http-hook-server.ts:1-22`）。
- **Cursor** 在 in-file 重构、IDE 内丰富上下文方面表现出色；`CURSOR.md` + `.cursorrules` 配对是五者中最精简的。Cursor 读 `CURSOR.md` 拿项目级规则，回退到 `.cursorrules` 拿 cursor 范围行为。**注意：截至本文撰写时仓库根目录下尚无独立 `.cursorrules` 文件**（README 的适配器行 `README.md:53` 提到了它），所以其 hook 集成走 shell shim 而非原生 on-save 规则——这一点在第 4.6 节还会复述。
- **Codex CLI** 没有 Hooks、Subagents、Slash Commands（`CODEX.md:82-88`）；其长项是从紧凑 spec 生成代码，适配器围绕"找 `status: ready` ticket → 改文件 → 提交 → 推送"循环构建（`CODEX.md:50-65`）。
- **Copilot CLI** 与 Codex 局限相同，配置相同的单 agent 模式（`COPILOT.md:17-28`）；其适配器是 Codex 适配器的严格子集。
- **AGENTS.md** 是任何能读 markdown 文件的 LLM 的通用回退——Gemini、Aider、自定义 agent、未来工具。设计上故意保持通用：不绑特定厂商、不绑 skills、不绑 hooks（`AGENTS.md:1-9`）。

这些差距都不是工具贬低。它们是对各工具原生原语能做什么的描述，适配器文件就是让每种工具"讲 EKET 语"的*桥*。

---

## 4. 分工具能力与局限

### 4.1 Claude Code —— 完整支持

- **适配器文件**：`CLAUDE.md:1-84`（84 行）。
- **强项**：Skills（`.claude/skills/eket/SKILL.md`）、Subagents、原生 Hooks。Skills 系统是五者中**唯一**能把 `/eket-start`、`/eket-claim`、`/eket-submit-pr` 当成具名命令调用的（完整命令集见 `template/CLAUDE-TEMPLATE.md:113-124`）。
- **局限**：hook 子系统是五者中表达力最强的，也是最脆弱的——`settings.json` 配错会让所有 hook 静默，失败模式是"什么都没发生"而不是"报错"。把 hook 服务器与 `system:doctor` 配对使用以早发现。
- **最佳适用**：*Master* 角色、*审核者* 角色，以及任意"一个 Claude Code 实例派发 Subagent"的多 agent 工作流（`docs/articles/01-what-is-eket/en/article.md:144`）。

### 4.2 Cursor —— 完整支持，IDE 锚定

- **适配器文件**：`CURSOR.md:1-32`（32 行，故意精简）。
- **强项**：精准的、file-local 编辑；IDE 内丰富上下文；`CURSOR.md` + `.cursorrules` 配对是五者中最精简的。Cursor 读 `CURSOR.md` 拿项目级规则，回退到 `.cursorrules` 拿 cursor 范围行为。
- **局限**：没有 Skills、Subagents、原生 Hook 子系统。Cursor 仍能通过 bash shim 调 hook 服务器（例如 `.cursorrules` 中配一条 `on-save` 规则调用 `curl` 到 `localhost:9877/hooks/file-changed`）。
- **最佳适用**：ticket 类型、file 锚定的工作——"修这条 lint"、"抽这个函数"、"重写这个组件"。Cursor 那四条"先想后写 / 简洁优先 / 精准改动 / 目标驱动"原则（`CURSOR.md:18-23`）几乎天然对上 Slaver 的"实现 + 测试"循环。

### 4.3 Codex CLI —— 降级，单 agent

- **适配器文件**：`CODEX.md:1-104`（104 行）。
- **强项**：从紧凑 spec 生成代码；快速生成脚手架；强在"给 ticket 就产 PR"。适配器围绕严格的"Slaver"模式构建（`CODEX.md:15-25`）。
- **局限**（`CODEX.md:82-88` 明示）：❌ Skills、❌ Subagent、❌ Slash Commands、❌ Hooks、❌ 自动任务派发。每个协议操作都是一次手动 bash 调用。多实例协同通过 ticket 的 `assigned_to` 字段加分支隔离完成（`CODEX.md:92-97`）。
- **最佳适用**：批量实现类工作——"实现这份 OpenAPI spec 里的 12 个端点"、"为这个模块搭一套测试套件"。Codex 的降级是诚实的，不是惩罚性的：协议一样工作，只是 agent 的手脚绑得更紧。

### 4.4 Copilot CLI —— 降级，单 agent，Codex 的严格子集

- **适配器文件**：`COPILOT.md:1-80`（80 行）。
- **强项**：与 Codex 相同（按 spec 生成代码）。适配器是严格子集——明确推荐单 agent 模式，由一个 Copilot 会话同时承担简化版 Master + Slaver（`COPILOT.md:17-28`）。
- **局限**（`COPILOT.md:56-62` 明示）：与 Codex 同五项 ❌。其中 Hooks 在 Copilot 适配器里**没有替代方案**——表格字面写着"无替代，依赖人工检查"（`COPILOT.md:62`）。
- **最佳适用**：Copilot 是唯一可用工具的环境。适配器强调"先读后改 / 小步提交 / 分支隔离 / 测试驱动"（`COPILOT.md:48-52`），是用纪律代替自动化的协议强制。

### 4.5 Gemini / AGENTS.md —— 通用回退

- **适配器文件**：通用部分为 `AGENTS.md:1-43`（全文 668 行；前 43 行覆盖身份、结构、Master/Slaver 角色）。
- **强项**：任何能读 markdown 的 LLM 都可用——Gemini、Aider、自定义 agent、未来工具。适配器故意保持通用；README 的"其他 LLM Agent"行（`README.md:57`）就指向这一项。
- **局限**：没有任何原生扩展。每个协议操作都是一份 markdown 指令，agent 自行读、自行执行。`AGENTS.md` 的 Master 节（`AGENTS.md:75-80`）明确禁止 Master 角色写代码——这条规则靠 markdown 信任而非工具强制。
- **最佳适用**：*长尾*场景。下一种 LLM 工具发布时，其适配器就是 `AGENTS.md` 加一份薄 shim 文件，协议照旧幸存。

### 4.6 诚实声明的差距

`.cursorrules` 在 README 的适配器行（`README.md:53`）中被引用，但截至本文撰写时仓库根目录下并无该独立文件。Cursor 的适配器仅有 `CURSOR.md`（32 行）。因此 Cursor 的 hook 服务器集成通过 shim 路由，而不是通过原生 `.cursorrules` "on-save" 规则。文中明示此点，以便未来给仓库加上 `.cursorrules` 时有据可查。

---

## 5. 跨工具工作流——一个完整例子

一个 ticket 全生命周期中用到**三种不同工具**的真实工作流。名字是真实适配器名，步骤是真实协议操作。

**场景。** 团队需要给 `eket task:claim` 热路径加一段 OpenTelemetry span。Ticket 是 `TASK-642`。三个执行者，三种工具，一个 ticket。

**第 1 步 —— Cursor（实现者）。** 一个 Cursor 会话读 `jira/tickets/TASK-642.md`，看到 AC，检出 `feature/TASK-642-otel-claim-span`。Cursor 的 `CURSOR.md:18-23` 原则推动它走"精准改动"和"目标驱动"——30 行 patch 的合适形态。Cursor 编辑 `rust/crates/eket-core/src/ticket.rs`，加上 span，在 IDE 内跑 `cargo test --release`，用 `feat(TASK-642): wrap claim path in otel span` 提交。提交落到 feature 分支。还没开 PR。

**第 2 步 —— Codex（测试编写者）。** 另一个 Codex CLI 实例，在不同的 `feature/TASK-642-otel-tests` 分支上，读同一份 `TASK-642.md` ticket 与第 1 步的 diff（Codex 擅长"给 spec 产测试"）。它写出 `rust/crates/eket-core/tests/otel_claim.rs`，跑 `cargo test otel_claim --release`，推送。Codex 的 `CODEX.md:50-65` "找 ready、改、提交、推"循环逐字执行。推送命中 `testing`，跑全量测试矩阵，发现一个 span-id 冲突——一个*有用*的失败，不是工具失败。

**第 3 步 —— Claude Code（审核者）。** 一个 Claude Code 会话，在 `main` 上，为 `TASK-642` 打开 PR。PR 描述从 ticket 的 `## Acceptance Criteria` 节自动填入（协议要求先有 plan + AC 才能 claim，见 `docs/articles/02-why-you-need-eket/en/article.md:111`）。Claude Code 的 Skills 系统调用 `gate:review`，依次：

1. 对 merge commit 重跑 `cargo test`。
2. 读 PR diff 与 ticket 的 AC。
3. 输出结构化 review（"approve with comments：把 `span_id` 改名以避免冲突，见第 47 行"）。
4. 把 review 回写到 ticket。

**第 4 步 —— Cursor（修改者）。** 第二个 Cursor 会话读 review、应用改名、再跑一次测试、推一份 amend 提交。Feature 分支现在干净。

**第 5 步 —— Master（任意工具、任意人类）。** 一个人类——或运行在五种适配器中任一种上的 AI Master——跑 `eket task:complete TASK-642`。Saga 5 步（`docs/articles/GLOSSARY.md:12`）在一个事务里写五份 artifact：测试报告、checkpoint、merge commit、Slack/邮件通知、审计日志。Ticket 状态 `IN_REVIEW → DONE`。分支按 `scripts/sync-branches.sh`（在 `docs/articles/01-what-is-eket/en/article.md:110` 中引用）走 `feature → testing → main → miao`。

**审计轨迹长这样。**

```
TASK-642
├── claim       : cursor-agent-1    @ 2026-06-04T10:01:12Z
├── implement   : cursor-agent-1    (commit a1b2c3d, 30 LOC)
├── test-write  : codex-agent-1     (commit e4f5g6h, 80 LOC)
├── review      : claude-code-M1    (approve+comments)
├── revise      : cursor-agent-1    (commit i7j8k9l)
├── complete    : saga-5step        @ 2026-06-04T10:42:55Z
└── merge       : feature→testing→main→miao
```

三种不同工具碰了四个不同步骤。审计轨迹是单条 per-ticket 日志。没有适配器需要知道下一步由谁执行。SQLite `tickets` 表没变；CLI 没变；协议没变。

**跨工具故事浓缩成一句话：契约就是 SQLite 那行记录加 PR 描述；工具是可互换的契约读写者。**

---

## 6. Hook 服务器（`node/src/hooks/`）——跨工具事件桥

Hook 服务器就是跨工具事件桥。它是一台 Node.js HTTP 服务器，在统一端点上暴露 28 种生命周期事件。它的职责是让*任何*适配器——Claude Code 的原生 hook 子系统、Cursor 的 shell shim、Codex 的 bash-on-save、CI 里一个 cron——都能参与协议级事件处理。

### 6.1 接口面

服务器为每个事件暴露一个端点。核心端点（`node/src/hooks/http-hook-server.ts:14-19`）：

```
POST /hooks/pre-tool-use
POST /hooks/post-tool-use
POST /hooks/teammate-idle
POST /hooks/task-completed
POST /hooks/permission-request
GET  /health
```

完整事件分类共 28 项（`node/src/hooks/http-hook-server.ts:144-171`）：

```
PreToolUse、PostToolUse、PostToolUseFailure、Notification、UserPromptSubmit、
SessionStart、SessionEnd、Stop、StopFailure、
SubagentStart、SubagentStop、
PreCompact、PostCompact、
PermissionRequest、PermissionDenied、
Setup、TeammateIdle、TaskCreated、TaskCompleted、
Elicitation、ElicitationResult、
ConfigChange、WorktreeCreate、WorktreeRemove、
InstructionsLoaded、CwdChanged、FileChanged
```

### 6.2 服务器实际做了什么

对每个进来的 POST，服务器（`node/src/hooks/http-hook-server.ts:889-913`）：

1. 从 URL 路径解析事件名。
2. 查找已注册 handler。
3. 把 payload 路由进*管道*——管道机制位于 `node/src/hooks/pipelines/`，由 `dispatcher.ts:213-225` 与 `pre-bash-dispatcher.ts:14-23` 组合。每条管道是一串*检查*（安全、质量、性能、审计），可以 `pass`、`fail`、*修改*输入，或向 LLM 上下文注入 `feedback`。
4. 返回 JSON 响应，让调用方工具采取行动（例如拒绝 `PreToolUse`、把 `TaskCompleted` 标记为已接受，或引导一个 `TeammateIdle` agent 去 claim 新 ticket）。

`TeammateIdle` handler 可调用 `assignTask(agentName)`（`node/src/hooks/http-hook-server.ts:1123-1136`）给刚 idle 的 agent 派下一个 ticket。`PreToolUse` handler 可调用 `checkPermission(toolName, toolInput)`（`node/src/hooks/http-hook-server.ts:1157-1167`）在破坏性命令执行前阻断。dispatcher 架构见 `dispatcher.ts:213-395`；bash 专用的 pre-check（路径遍历、危险命令、敏感路径、命令注入、资源限制）在 `pre-bash-dispatcher.ts:7-13`。

### 6.3 为什么它是跨工具桥

- **Claude Code** 触发原生 hook；服务器直接消费。
- **Cursor** 通过 `.cursorrules` 驱动的 shell shim 提交（一旦仓库补上 `.cursorrules`，就改走那条规则的 `on-save` 回调）。
- **Codex / Copilot** 通过 `git commit` 后的 hook 脚本提交。
- **Gemini / AGENTS.md** 通过 `inotify` 或 cron 调度 `curl` 到 `localhost:9877/hooks/file-changed`。

四种都往*同一*台服务器、*同一*个端口、*同一*组事件名写入。服务器不在乎事件由哪种工具触发。这就是"跨工具事件桥"在 EKET 中的含义：不是 per-tool 特殊协议，而是同一台 HTTP 服务器 + 一份 markdown 契约。

### 6.4 Dispatcher 模式

`dispatcher.ts` 是一份小巧、类型良好的注册表（`CheckRegistry` 见 `dispatcher.ts:120-200`；`HookDispatcher` 见 `dispatcher.ts:213-425`）。`Check` 接口（`dispatcher.ts:61-74`）是**检查的适配器契约**——不论哪个工具的事件触发该检查，形状相同。新工具的作者在写自定义检查前应该先读这份代码；`register` / `loadFromRegistry` / `dispatch` 三角坐一次就能读完。

---

## 7. 新增一种工具——适配器必须实现什么

适配器契约故意做得很小。下面五项要求都可测试；满足它们的新工具就能端到端参与协议。

### 要求 1 —— 身份文件（`.eket/IDENTITY.md`）

适配器必须在每次启动时读 `.eket/IDENTITY.md`，若文件缺失或不可读则拒绝执行。身份文件声明角色（Master / Slaver）、agent id、禁止动作清单。由 `template/CLAUDE-TEMPLATE.md:30-38`（"身份确认"）强制，并在通用 agent 指南 `AGENTS.md:24-33` 复述。

**可测试性**：不创建 `.eket/IDENTITY.md` 启动适配器；适配器必须在读任何 ticket 之前以明确错误退出。

### 要求 2 —— Ticket YAML frontmatter

适配器必须按 `CODEX.md:30-48` 声明的格式读 ticket，并在五份已交付适配器中通用：

```yaml
---
id: TASK-NNN
title: <string>
status: ready | in_progress | review | done
assigned_to: <agent-id>
priority: P0 | P1 | P2 | P3
---
```

适配器必须随处理进度更新 `status` 与 `assigned_to`。`status: in_progress` 的原子性保证由 EKET CLI（`eket task:claim`）提供，不由适配器自己提供；适配器的职责是**调用** CLI，而不是**自造轮子**。

**可测试性**：在 `jira/tickets/` 放一个 ticket，跑适配器，观察适配器通过 CLI 把 ticket 从 `READY → IN_PROGRESS → IN_REVIEW` 推进（而非直接改文件）。

### 要求 3 —— 分支命名 + Conventional Commits

适配器必须（a）创建 `feature/<task-id>-<slug>` 形式的分支；（b）用 `<type>(<scope>): <description>` 形式的 Conventional Commits 消息提交；（c）推送分支并开一份 PR，描述里引用 ticket id。这由 `template/CLAUDE-TEMPLATE.md:218-230` 指定，并在 `CLAUDE.md:30-32`、`CODEX.md:60-65` 复述。

**可测试性**：claim 一个 ticket，跑适配器，验证分支名匹配模式、提交消息过 `commitlint`（或项目等价工具）。`template/CLAUDE-TEMPLATE.md:217-230` 的表格是 type / scope / description 文法的事实源。

### 要求 4 —— 向 HTTP 服务器发 Hook 事件

适配器必须就至少四个"承重"事件向跨工具事件桥发送 hook 事件：`PreToolUse`、`PostToolUse`、`TaskCreated`、`TaskCompleted`。端点契约在 `node/src/hooks/http-hook-server.ts:14-19`。可以发更多，但**不能静默跳过**这四个。

**可测试性**：在 mock 的 `localhost:9877/hooks/pre-tool-use` 上跑适配器，验证破坏性 bash 命令被以 `403` 拦截。`dispatcher.ts:61-74` 中的 dispatcher 契约是适配器必须满足的类型。

### 要求 5 —— 阶段边界写状态报告

适配器必须在每个阶段边界（claim 完成、分析完成、实现完成、请求 review、review 已回复）写一份状态报告。格式在 `template/CLAUDE-TEMPLATE.md:382-414`（"反馈机制"），并在模板表 `template/CLAUDE-TEMPLATE.md:418-422` 复述。位置为 `inbox/human_feedback/<phase>-<task-id>-<timestamp>.md`。

**可测试性**：跑适配器，然后 `ls inbox/human_feedback/`，确认每个完成阶段都有一份状态报告。

### 适配器*不*需要做什么

适配器*不*需要：

- 实现 EKET 状态机。CLI 做。
- 实现 CAS。SQLite 客户端做（`node/src/core/sqlite-client.ts:966-976`）。
- 实现 Saga 5 步。`task:complete` 命令做。
- 实现 hook 管道。Hook 服务器做。

适配器是一份*薄*客户端。上面五项要求描述了新工具成为协议一等参与者所需的全部表面。

---

## 8. 为什么工具无关很重要——厂商锁定作为长期风险

厂商锁定是团队*每季度*为把工作流焊死在某家厂商的 API、CLI 或定价模型上而付出的税。这笔税会复利。

三条具体风险，源自 2024–2026 的行业事件而非任何一家厂商的路线图：

1. **定价重谈。** 按席位计费的 AI 厂商自 2024 年起每年至少重定价一次。把工作流绑在单一厂商上的团队付新价；工作流与工具解耦的团队能在一周内把 20% 工作迁移到更便宜的工具。
2. **特性弃用。** 上面每份适配器清单都至少带一项"今日 ✅、明日 ❌"风险：原生 hook 子系统会被弃用（2025 年已发生不止一次）。审计轨迹走*工具*原生 hook 的团队失去轨迹；审计轨迹走*协议* hook 服务器的团队留住轨迹。
3. **模型弃用。** 模型被弃用时，包装它的工具往往跟着退役。工具锁死的协议意味着重新工程化集成；工具无关的协议意味着改一份适配器文件。

更深层的论点是结构性的。*协议*是你拥有的契约。*工具*是你租来的契约。协议是经历 churn 仍幸存的部分；工具是被替换的部分。今天交付的五种适配器不是一份"兼容矩阵"——它们是*证据*，证明协议才是耐久的东西。

> "如果你的团队超过一人，你面对的并非 agent 问题——你面对的是恰好涉及 agent 的协调问题。"
> — *EKET 设计笔记，2025-08，引自 `01-what-is-eket/en/article.md:57-58`*

把这句话改写一下适用于多工具场景：**如果你的团队同时使用多种 LLM 工具，你面对的不是工具问题，而是适配器契约问题；正确的答案是让契约显式、最小、可测试。** 第 7 节那五项要求就是这个显式、最小、可测试的答案。

---

## 9. 参考

- **适配器文件**（每种已交付工具的契约表面）：
  - `CLAUDE.md:1-84` —— Claude Code（完整支持，Skills + Subagents + Hooks）
  - `CURSOR.md:1-32` —— Cursor IDE（完整支持，IDE 锚定，无 Skills/Subagents）
  - `CODEX.md:1-104` —— Codex CLI（降级，单 agent，Slaver 模式）
  - `COPILOT.md:1-80` —— Copilot CLI（降级，单 agent，Codex 严格子集）
  - `AGENTS.md:1-43` —— 通用回退（Gemini、Aider、未来工具）
- **模板**（每个适配器是它的特化）：
  - `template/CLAUDE-TEMPLATE.md:30-38` —— 身份确认
  - `template/CLAUDE-TEMPLATE.md:82-94` —— 核心工作流
  - `template/CLAUDE-TEMPLATE.md:113-124` —— 命令集
  - `template/CLAUDE-TEMPLATE.md:218-230` —— 分支 + Conventional Commits
  - `template/CLAUDE-TEMPLATE.md:233-250` —— Ticket 编号
  - `template/CLAUDE-TEMPLATE.md:382-414` —— 状态报告 / 反馈机制
- **Hook 服务器**（跨工具事件桥）：
  - `node/src/hooks/http-hook-server.ts:1-22` —— 用途与端点
  - `node/src/hooks/http-hook-server.ts:14-19` —— 端点接口
  - `node/src/hooks/http-hook-server.ts:144-171` —— 28 种 hook 事件类型
  - `node/src/hooks/http-hook-server.ts:1119-1136` —— `TeammateIdle` 任务派发
  - `node/src/hooks/http-hook-server.ts:1157-1167` —— `PreToolUse` 权限检查
  - `node/src/hooks/dispatcher.ts:61-74` —— `Check` 接口（检查的适配器契约）
  - `node/src/hooks/dispatcher.ts:120-200` —— `CheckRegistry`
  - `node/src/hooks/dispatcher.ts:213-425` —— `HookDispatcher`
  - `node/src/hooks/pre-bash-dispatcher.ts:7-13` —— bash 专用 pre-check（路径遍历、危险命令、敏感路径、命令注入、资源限制）
- **协议机器**（适配器之间不变的部分）：
  - `node/src/core/sqlite-client.ts:966-976` —— CAS 原语
  - `rust/crates/eket-core/src/ticket.rs` —— Rust 镜像的 ticket 状态机
  - `scripts/sync-branches.sh` —— `feature → testing → main → miao` 晋升
  - `docs/articles/GLOSSARY.md:12-13` —— Saga 5 步 + CAS 定义
- **系列相关文章**：
  - `docs/articles/01-what-is-eket/en/article.md:1` —— 核心论点
  - `docs/articles/02-why-you-need-eket/en/article.md:1` —— 痛点 × 解法 × ROI
  - `docs/articles/06-master-slaver-protocol/en/article.md:1` —— Master-Slaver 协议
  - `docs/articles/GLOSSARY.md:1-43` —— 共享术语
- **Tickets**：
  - `jira/tickets/EPIC-008/TASK-648.md` —— 本文的 ticket
  - `jira/tickets/EPIC-008/INDEX.md` —— 系列索引（Master 更新 production tracking）
- **待跟进事项**（Master 排期）：
  - 在仓库根目录补一份 `.cursorrules`，让 Cursor 适配器与其他四者形态一致。
  - 决定 `COPILOT.md` 的"Hooks 无替代"行（`COPILOT.md:62`）是否应改为推荐与 Codex 相同的 `git commit` 后置 shim。
  - 与下篇文章（13-adr-and-roadmap）确认是否发布 per-adapter 延迟预算（L0 / L1 / L2 / L3，见 `docs/articles/01-what-is-eket/en/article.md:131-140`）。
