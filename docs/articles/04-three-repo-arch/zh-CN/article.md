# 04 — 三仓架构：confluence / jira / code_repo

> **TL;DR** — EKET 把"知识、任务、代码"三件事拆成三个并列目录：`confluence/`、`jira/`、`code_repo/`。它们共用一棵文件树，却按三套不同的生命周期运行：可变性、版本模型、写入模式、读者群各自独立。这种拆分**首先不是关于 git，而是关于生命周期**。把三种生命周期塞进同一个工具，结果是这个工具对三种都不擅长；分开之后，每一边只对一种擅长。本文用一张生命周期对比表和一个真实 ticket（TASK-637）走完跨仓引用链，讲清楚"为什么分三个仓"在 EKET 里是协议的一部分。

> **核心要点**
> 1. **三仓 ≠ 三个 git 仓库。** 一级拆分是目录（生命周期、权限、写入模式），git 拆分只是其中一种存储实现。把两者混为一谈，是阅读本文最容易踩的坑。
> 2. **三个仓的可变性不同。** 知识 append 居多；任务有状态、字段不可变（由 `scripts/check-ticket-immutability.sh:30` 强制）；代码是唯一按 git 分支/合并方式工作的仓。
> 3. **"ticket 必须有跨引用"是强制规则，不是建议。** `scripts/validate-ticket-pr.sh:1-79` 会在 CI 拒绝没有 PR/branch 字段、没有测试输出、或者测试输出是占位词的 ticket 文件。
> 4. **真实 ticket 在三仓里都能被追溯。** `jira/tickets/EPIC-007/TASK-637.md:148-203` 关联了 `confluence/memory/pitfalls/slaver-worktree-code-loss.md:5` 这条经验，也对应了 `.github/workflows/rust-build.yml` 这份产物。
> 5. **迁移是机械的，不是信仰。** 三个具体动作（建三个子仓、接 `validate-ticket-pr.sh`、按目录收口 Slaver 写权限）就能在一周内把团队从"单仓一锅炖"推进到"生命周期分离"。

---

## Executive Summary

**给决策者（读完即可离开）：**

| 问题 | 答案 |
|---|---|
| "三仓架构"具体是什么？ | 知识在 `confluence/`、任务在 `jira/`、代码在 `code_repo/`。三种生命周期、三套权限模型、三种写入模式。 |
| 是三个 git 仓库还是三个目录？ | **首先是三个目录。** git 拆分是可选的——submodule 指针、平级克隆、甚至 `../` 相对路径都可以，因为协议基于路径（见 `docs/architecture/three-repo-deployment.md:301-304`）。 |
| 成本是什么？ | 一周迁移时间；CI 多挂一个 `validate-ticket-pr.sh`；pre-commit 多挂一个 `check-ticket-immutability.sh`。不需要新服务器、不需要新厂商。 |
| 收益是什么？ | 不同角色拿不同写权限（`docs/architecture/three-repo-deployment.md:242-249`）：人和 AI agent 在三个仓里的权限不同，跨引用在崩溃后仍能重建。 |
| 风险是什么？ | 如果坚持"知识 + 任务 + 代码"放同一个 wiki，不到一季度，跨引用就会断。 |
| **什么时候不该做？** | 一个人 + 一个 agent 的小项目、一个月内的原型、或者合规上必须用 Jira-the-product 的团队——见第 4 节"何时违反"。 |

下文先讲生命周期这个总论，再用 `TASK-637` 走完跨仓引用，最后给出本周可执行的迁移清单。

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

绝大多数接入 EKET 的团队，最初都是单仓结构：一份 `docs/`、一份 `tickets/`、一份 `code/`（或者一个外置的 Notion / Confluence / Jira-the-product）。**三种关注点散落在不同地方，没有任何强制引用。** 一旦模型在 ticket 中途崩溃，人就要去 chat 滚动条、commit message、wiki 三处拼凑上下文——这就是三仓拆分要解决的事故模式。

更深的诊断：**知识、任务、代码是三种生命周期，被错当成"都是文件"塞进同一个工具。** 三者的写入频率不同（知识最稀、任务稳态、代码最密），读者群不同（知识=所有人、任务=负责人+评审、代码=CI+全开发者），失效模式也不同（知识陈旧、任务过期、代码崩溃）。"都是文件"等于"都可以共用工作流"——这个推论是错的。文件可以共用文件系统，但**工作流不能共用一个工作流**。

EKET 的判断是：**生命周期分离胜过工具统一。** 我们不提供"一个能管三件事"的超级工具；我们提供三个目录、配套三套访问模式，然后用脚本把跨引用**变成 CI 可校验的合同**。审计轨迹就是一张路径图：每个 ticket 指向 `confluence/` 里的一条 note，又指向代码仓里的若干 commit；每条 note 反过来指向产生它的 ticket。当一个仓暂时不可用，剩下两个仓仍然能回答"为什么这么做、做了什么"。

> "如果 ticket、知识库、代码都挤在同一棵树下，CI 迟早会把 build 产物盖在经验 note 上。放在三棵并行树里，这事不会发生；而且跨引用能告诉你：谁在什么时间、带着什么上下文，做了什么。"
> — *EKET 设计注记，源自 `confluence/memory/pitfalls/slaver-worktree-code-loss.md:5-46`*

`confluence/memory/pitfalls/slaver-worktree-code-loss.md:1-46` 是这件事最干净的"证人"。两条 Slaver 事故（TASK-636、TASK-X04）之所以丢工作，是因为 build 系统、agent 的 worktree、agent 的 chat 滚动条共用了一棵树，相互打架。文件里记录的教训不是"用好 git"，而是**"把生命周期分开，让失效模式不再叠加。"**

---

## 2. 核心论点

总论点有三条，每一条都不可替代。单独看都不算新；新的是**把它们一起用在人机协作团队上**。

### 2.1 三种生命周期，三个目录

**知识**写入最稀、读者最广。它在被"顿悟"时更新（post-mortem、回顾、after-action review），被每一个后续接同类 ticket 的人阅读。最合适的工具是 append-mostly 的知识库：编辑被允许（用于纠错），但**默认操作是 append**（新写一条 note），不是覆盖。`confluence/memory/lessons/`、`confluence/memory/patterns/` 即便在 git 层面允许重写，实际上是 append-only。

**任务**写入中等频率、读者窄（负责人 + 评审）。它有状态（一个 ticket 从 `READY` 走到 `IN_PROGRESS` 再到 `IN_REVIEW` 再到 `DONE`），且**有限**（每个 ticket 都有明确的终止态，到点归档）。最合适的工具是状态机；最合适的存储是数据库行，或者带状态标记的 Markdown 文件——**默认操作是状态转移**，不是自由改写。`jira/tickets/TASK-NNN.md` 就是这个。

**代码**写入最密、读者最广（开发者、CI、部署系统）。它**有版本、有分支**，git 的语义就是为它设计的。**默认操作是 commit + branch + merge**。`code_repo/`（或 `rust/`、`node/`）就是它。

硬把三者塞进一个工具，意味着这个工具必须同时精通三种默认操作：append、转移、分支。实际效果是**一种都不精通**——git 不擅长状态转移，Kanban 板不擅长 append-mostly，wiki 不擅长版本分支。**EKET 的解法是：每个仓用最合适的工具，跨引用用脚本强制。**

### 2.2 三目录 ≠ 三 git 仓，但 git 友好

常见误读："三仓"="三个 git remote"。这是**一种**实现，但不是唯一一种；混为一谈会带来很多麻烦。

| 存储形态 | 适用场景 |
|---|---|
| 三个 git remote + submodule 接入 | 多组织、强隔离、CI 需要独立 clone 每一个 |
| 三个 git remote + 平级目录（`../confluence` 等） | 多组织、团队嫌 submodule 指针烦 |
| 单 monorepo 内的三个目录 | 单组织、用 `validate-ticket-pr.sh` 和 `check-ticket-immutability.sh` 强制生命周期分离 |
| 单非 git 树下的三个目录 | 一次性原型，几乎不用 |

EKET 运行时**不依赖** git submodule。`docs/architecture/three-repo-deployment.md:301-304` 写得很直接："可以[纯平级目录]。在 `config.yml` 中用相对路径 `../sibling` 访问即可，EKET 运行时不依赖 git submodule 机制。submodule 仅是便于主项目统一追踪版本一致性。" Submodule 是**推荐**布局（因为能锁版本、一次 `git clone --recurse-submodules` 拉齐全套），但协议本身是**基于路径的**。

**如果这一节只能记一句话：生命周期拆分是必须的，git 拆分是可选的。**

### 2.3 跨引用就是合同

让"三个目录"能被人读懂的关键不是 git，是**跨引用**。

- `jira/` 的 ticket 指向 `confluence/memory/` 里的一条或几条 note（"为什么这么做"）。
- `jira/` 的 ticket 也指向 `code_repo/` 里的一次或多次 commit（"具体怎么做"）。
- `confluence/` 的 note 反向指向产生它的 ticket。
- commit message 里写 ticket id。

结果是**一张有向图**：即使一个仓临时不可用，剩下两个仓仍然能拼出"谁、什么时间、为什么、做了什么"。

跨引用是"三仓"从布局升级为**协议**的关键。`scripts/validate-ticket-pr.sh:1-79` 把它变成了机器可校验的合同：一个 ticket 文件必须有 `^PR:` / `pr_link:` / `branch:` / `feature/` 之一（38-46 行）；必须有 `## Test` / `Tests:` / `npm test` 之一（48-56 行）；不能是占位词（58-74 行）。**脚本的存在让"必须有跨引用"从 Slack 帖变成可强制规则。**

---

## 3. 协议如何运转

### 3.1 生命周期对比表

| 生命周期 | 目录 | 可变性 | 版本模型 | 默认写入模式 | 主要读者 | 引用源 |
|---|---|---|---|---|---|---|
| 知识 | `confluence/memory/`（lessons、patterns、pitfalls、retrospectives） | append 居多；允许编辑但不鼓励 | 实践上 append-only；rewrite 罕见且需在文件内留痕 | 新增一个 note 文件；编辑仅用于纠错 | 所有未来贡献者；知识库是阅读最频繁的仓 | `confluence/memory/MEMORY.md:17-46` |
| 任务 | `jira/tickets/EPIC-NNN/TASK-NNN.md` | 有状态、有限；**不可变字段**（priority / acceptance_criteria / blocked_by / parent_epic / agent_type / estimate_hours）由 `scripts/check-ticket-immutability.sh:30-87` 强制 | 生命周期状态（READY → IN_PROGRESS → IN_REVIEW → DONE）；`IN_REVIEW` 之后 ticket 文件实质 append-only | 状态字段转移；末尾追加 `## Implementation Notes` | 负责人、评审、Master 审计 | `scripts/check-ticket-immutability.sh:30`；`docs/articles/GLOSSARY.md:10-12` |
| 代码 | `code_repo/`（或 `rust/`、`node/`） | 可变；`main` / `testing` 受分支保护 | git；四分支模型 `miao` → `main` → `testing` → `feature/*`（另有 `hotfix/*` 快速通道） | commit + branch + PR | 构建系统、CI、全体开发者 | `docs/architecture/THREE_REPO_ARCHITECTURE.md:240-247` |

这张表希望把几件事讲清楚：

- **只有代码仓在 git 意义上"分支"。** 任务不分支——它转移。知识也不分支——它 append。把 git 当成唯一工具，等于让"转移"和"append"都强行套上"分支"的壳。
- **审计轨迹各归各位。** 代码的审计是 git log；任务的审计是 ticket 的 `## Implementation Notes` 段 + `check-ticket-immutability.sh` 的退出历史；知识的审计是 append-only 的文件 + 反向指向 ticket 的引用。
- **读者群不同。** `feature/*` 分支被 CI 和下一个开发者读；ticket 被负责人、评审、Master 读；知识 note 被**所有遇到同类问题的未来贡献者**读。三者放同一处，等于强制同一访问模型覆盖三类读者，**至少对其中一类是错的**。

### 3.2 为什么推荐 submodule 接入

对需要强隔离的团队（多组织、严格权限、CI 各自独立 clone），推荐路径是 git submodule。`docs/architecture/THREE_REPO_ARCHITECTURE.md:158-168` 给出标准 `.gitmodules`：

```ini
[submodule "confluence"]
    path = confluence
    url = https://github.com/{org}/{project}-confluence.git
    branch = main

[submodule "jira"]
    path = jira
    url = https://github.com/{org}/{project}-jira.git
    branch = main
```

submodule 模型有三个协议需要的属性：

1. **一次 `git clone --recurse-submodules` 拉齐全套。** 新 Slaver 不需要 runbook——clone 就是 runbook。见 `docs/architecture/three-repo-deployment.md:147-154`。
2. **每个 submodule 有自己的 remote、branch、CI。** 代码仓的 CI 不需要 jira 仓的 secret；jira 仓可以被 AI Slaver clone 而完全不持有 code 写权限（见 `docs/architecture/three-repo-deployment.md:242-249` 的权限矩阵）。
3. **submodule 指针就是一行 commit hash。** Master 把 jira 指针往前推一格，主仓的 audit log 只有一行 `chore: 更新 jira submodule 指针到最新`。Slaver 独立推 jira 仓，主仓看到的也是同一行（`docs/architecture/three-repo-deployment.md:174-185`）。

不想要 submodule 的团队（典型如单组织单 CI），平级目录模型完全等价。`docs/architecture/three-repo-deployment.md:301-304` 用一段话讲清取舍：实质差别是"管三个 `git remote`、在每个仓里 `git pull`"和"用 `git submodule update`"之间的运维口味。

### 3.3 权限矩阵——为什么三仓解锁了按角色收口

`docs/architecture/three-repo-deployment.md:242-249` 是整份架构里**最被低估的一张表**。原样转录：

| 角色 | `myproject`（主） | `-confluence` | `-jira` | `-code` |
|------|:---:|:---:|:---:|:---:|
| Human Master | read/write | read/write | read/write | read/write |
| Human Slaver | read | read/write | read/write | read/write |
| AI Master | read | read/write | read/write | review only |
| AI Slaver | read | read | read/write | feature/* only |
| CI/CD Bot | - | - | read | read/write |

这张表说的是 monorepo 说不出来的一件事：**AI Slaver 可以往 `jira/` 写（领取/完成任务），但不能往 `confluence/` 写（不能伪造知识），也不能往 `code_repo/` 写到自己被分配的分支之外。** 最后一列是 audit 还能幸存的原因。一个误操作的 Slaver 被困在 `feature/TASK-NNN-*` 命名空间里，爆炸半径是一个分支，不是整棵树。

在 monorepo 里要实现同样约束，得靠路径白名单的 pre-commit hook——而 Slaver 总会在某次升级后绕过它。三仓方案里，约束由 git 物理执行：Slaver 没有主仓 `main` 的 push 权限，code 仓的 pre-receive hook 拒绝 `feature/` 前缀之外的 push。

### 3.4 一个真实 ticket 的端到端追溯：TASK-637

生命周期拆分说起来简单，证起来难。最好的证据是一个**真的发出去过、跨引用清晰可见**的 ticket。**`jira/tickets/EPIC-007/TASK-637.md`** 就是这个例子。TASK-637 是 "Rust CI Pipeline — 跨平台自动编译"（1-10 行），由 Slaver-009 在 2026-05-14 完成（`TASK-637.md:148-158`），产出 `.github/workflows/rust-build.yml` 与 `.github/workflows/rust-test.yml`（`TASK-637.md:163-175`）。它在三仓里都能被追溯：

| 层 | 产物 | 位置 | 跨引用 |
|---|---|---|---|
| 任务 | `jira/tickets/EPIC-007/TASK-637.md` | `jira/tickets/EPIC-007/TASK-637.md:1-258` | `Blocked By: TASK-636`（148 行），`Created: 2026-05-14`（148 行） |
| 知识（前置经验） | `confluence/memory/pitfalls/slaver-worktree-code-loss.md` | `confluence/memory/pitfalls/slaver-worktree-code-loss.md:5` | 文件 `source:` 字段写明 `TASK-636, TASK-X04`；70 行记录 `E2E tests 先行 (TASK-635) → 发现 3 个集成问题` |
| 知识（具体教训） | `confluence/memory/pitfalls/perf-ac-ambiguity.md` | `confluence/memory/pitfalls/perf-ac-ambiguity.md:5,25,33` | 文件 `source:` 字段是 `TASK-636`；记录 14.5% 精度偏差的教训，影响了 TASK-637 的 benchmark 设计 |
| 代码（交付物） | `.github/workflows/rust-build.yml`（4.3 KB） | 代码仓，Slaver-009 提交 | `TASK-637.md:163-167` 记录了 LOC、4 平台矩阵、SHA256SUMS 自动生成 |
| 代码（运行时 hook） | `.claude/hooks/UserPromptSubmit.sh` | 代码仓 | hook 的首行注释是 `# UserPromptSubmit Hook - TASK-631`（仓库内可验证）；`UserPromptSubmit.sh` 是 TASK-637 整套 context-monitor 流水线的实际调用入口 |
| 实施痕迹（在 ticket 内） | `TASK-637.md:148-203` | ticket 文件本身 | `实施记录` 段记录实际耗时、`AC 验证状态`、`技术亮点`、`已知限制`——全部由执行 Slaver 填写 |

**跨引用不是愿望。** 经验文件点名产生它的 ticket；ticket 点名满足 AC 的代码；代码的运行时 hook（UserPromptSubmit.sh）是 Slaver 工作最终被系统使用的入口。删掉其中任何一仓，剩下两仓仍能回答"为什么这么做"和"具体做了什么"——因为跨引用写在文件内容里，不在一个随 wiki 倒闭而消失的第三方索引里。

第二条更直接的证据在 `inbox/human_input.md:18-25`：原文写"TASK-636 Slaver-003 声称完成，但 `rust/crates/context-mon/` 从未入 git"和"TASK-635 Slaver-004 超时后需重新派遣（虽然测试文件幸存）"。同份需求的原始诉求在 11 行——"eket 团队做事的时候要有经常更新 ticket/文档的机制"——这是整个生命周期分离恢复设计的**人类作者源头**。它说的是"从 ticket/文档 恢复"，不是"从 chat 恢复"。整套架构是这句话的下游。

### 3.5 "强制"的含义：两个脚本

让生命周期拆分在 Slaver 偷懒时仍能幸存的，是两个 shell 脚本：

1. **`scripts/validate-ticket-pr.sh:1-79`**——CI 在 PR 合入前跑。强制 4 条规则（7-12 行）：ticket 文件必须存在；必须含 PR URL 或 branch 引用；必须含测试输出段；测试输出不能是占位词（`截图` / `手动` / `todo` / `tbd`）。exit 0 = ticket 诚实；exit 1 = PR 拒绝。脚本无依赖，和 `scripts/check-ticket-immutability.sh:1-94` 同构——这本身是有意设计（验证链是 L0-shell，见四级降级文章）。
2. **`scripts/check-ticket-immutability.sh:1-94`**——pre-commit 跑。强制**不可变 ticket 字段**不被非 Master 修改。不可变字段清单在 `scripts/check-ticket-immutability.sh:30`：`priority, acceptance_criteria, blocked_by, parent_epic, agent_type, estimate_hours, estimated_hours`。两条豁免路径（52-68 行）：commit message 含 `[master-override]` 标记；或 `.eket/config.yml` 的 `master_emails` 匹配当前作者邮箱。这条脚本的存在，让"原定 4h 的 ticket 在合入前被改成 1h"变成**可审计事件**，不是静默漂移。

缺这两个脚本，生命周期拆分在 `THREE_REPO_ARCHITECTURE.md` 里**只是描述**。有了它，拆分在机制上**被保护**。协议是脚本，不是架构文档。

---

## 4. 取舍与替代方案

### 4.1 替代方案，及各自的死法

| 替代方案 | 做什么 | EKET 的差异 |
|---|---|---|
| **单 monorepo + `docs/` `tickets/` `code/`** | 一种生命周期、一棵 git、一套 CI | EKET 把三种生命周期拆到三个权限独立的仓。monorepo 表达不出"AI Slaver 可写 jira、不可写 confluence" |
| **GitHub Projects + Actions** | Kanban + CI，ticket 存在 GitHub Issues | EKET 把 ticket 当 `jira/tickets/` 下的文件，用 `validate-ticket-pr.sh` 强制跨引用规则。GitHub Issues 对 git 和 agent 是不透明黑盒，审计只能走 GitHub UI |
| **Confluence-the-product + Jira-the-product + GitHub** | 三个厂商各管一摊 | EKET 用三个 git 下的纯文本树替代三个厂商。无供应商锁定；审计就是 `git log`；跨引用就是 `file:line` |
| **统一 wiki（Notion / Slab / …）** | 三个生命周期塞进一个产品 | EKET 拒绝 wiki：(a) 不在 git 下；(b) 不在团队访问控制下；(c) 跨引用无法被 pre-commit 强制 |
| **单仓 + 严格路径白名单** | 用 pre-commit hook 限制谁能写哪些路径 | 理论上可行，实际上"被绕过一次"只是时间问题。三仓让访问边界**物理化**，不止是策略 |

### 4.2 何时违反这条规则

三仓拆分是强默认，不是信仰。下面这些场景单仓才是对的，理由是结构性的，不是品味。

1. **单兵 + 单 agent + 一次性原型。** 生命周期分离的开销 > 协调收益。审计是一个人的 `git log`；访问控制是"我信自己"。等到第二个人或第二个 agent 出现再拆。
2. **一个月内不打算维护的原型。** 三个仓、三套 CI、三张权限表——这些在第五周重写的原型里都活不下来。等"重写还是晋升"的决策做出再动。
3. **合规上必须用 Jira-the-product 的环境。** 一些受监管场景要求厂商托管的 ticketing 以做审计。EKET 仍能跑**协议层**（状态机、Saga 5 步、ticket 文件），只是存储换成 Jira-the-product + 一个 `code_repo/` + 一个 `confluence/`。**协议**还在；**文件布局**不在。
4. **6 人以上、零 agent 的团队。** 这时协调债主要由人的组织设计决定（参 `docs/articles/02-why-you-need-eket/en/article.md:168`）。三仓拆分仍有用（审计、ticket plan 当 review 前置），但 ROI 的核心不在拆分上，在 master-slaver 协议上。6 人团队接入 EKET，应预期三仓**有用**但**不是承重墙**。
5. **绿地项目、历史上没有 `jira/` 或 `confluence/` 内容。** 给一棵没有历史包袱的树做"一周迁移"是过度工程。先单仓；等到第一次出现"未来 ticket 要引用一条经验 note"时再升级——升级本身是机械的（见 5.3）。

一条好用的自检：团队能不能在 30 秒内，从一次 `git grep` 回答"谁在什么时间、基于哪条 note、在哪个 ticket 上、提了哪个 PR"？能——布局够用。不能——已超出布局承受能力，三仓拆分一个季度回本。

### 4.3 反模式

- **Notion 数据库和 `jira/tickets/` 文件同时作为 ticket 事实源。** 一个 sprint 内就会漂。选一个；如果确实需要 Notion 视图，建**只读**同步，不要双写。
- **让 AI Slaver 写 `confluence/memory/lessons/`。** 知识默认由人写；Slaver 可以**提议**（写到 `inbox/`），由人晋升。`docs/architecture/three-repo-deployment.md:242-249` 已经把这条写成权限：AI Slaver 在 confluence 上是只读，不是写。这条规则本身是知识库诚实的护栏。
- **把 jira 仓当私人草稿本。** 任何 Slaver 在 ticket 文件里自由涂改，`check-ticket-immutability.sh` 的强制就垮了。ticket 是 **artifact**；字段受保护；`## Implementation Notes` 段是唯一自由段。
- **"为了赶进度"在 CI 跳过 `validate-ticket-pr.sh`。** 跳过的每一次都会被未来某次"PR 没被评审就合并"的复盘打回原形。脚本 79 行（`scripts/validate-ticket-pr.sh:1-79`），CI 加一个 5 行 step 就接好。
- **团队里 < 1 人 + < 2 agent 时强推三仓。** 协议开销 > 协调收益（参 `docs/articles/02-why-you-need-eket/en/article.md:160-181`）。

---

## 5. 实现要点

### 5.1 你实际跑的命令

最小可用的三仓布局（取自 `docs/architecture/three-repo-deployment.md:120-140` 与 `38-69`）：

```bash
# 1. 建主项目和三个 submodule remote
mkdir myproject && cd myproject
git init -b main

# 2. clone 三个平级仓（或先本地建好）
git clone git@github.com:my-org/myproject-confluence.git myproject-confluence
git clone git@github.com:my-org/myproject-jira.git       myproject-jira
git clone git@github.com:my-org/myproject-code.git       myproject-code

# 3. 注册为 submodule
git submodule add git@github.com:my-org/myproject-confluence.git myproject-confluence
git submodule add git@github.com:my-org/myproject-jira.git       myproject-jira
git submodule add git@github.com:my-org/myproject-code.git       myproject-code

# 4. 提交并推送
git add .gitmodules myproject-confluence myproject-jira myproject-code
git commit -m "feat: 注册三个 submodule"
git remote add origin git@github.com:my-org/myproject.git
git push -u origin main
```

之后每个新 Slaver 跑一次 `git clone --recurse-submodules` 拉齐全套。运行时路径就是 `myproject-confluence/`、`myproject-jira/`、`myproject-code/` 三个平级目录，Slaver 的 `config.yml` 用 `../myproject-confluence`、`../myproject-jira`、`../myproject-code` 引用（`docs/architecture/three-repo-deployment.md:191-217`）。

### 5.2 关键引用一览

| 主张 | 引用源 |
|---|---|
| Submodule `.gitmodules` 模板 | `docs/architecture/THREE_REPO_ARCHITECTURE.md:158-168` |
| 四分支模型表 | `docs/architecture/THREE_REPO_ARCHITECTURE.md:240-247` |
| 任务状态 × 仓交互图 | `docs/architecture/THREE_REPO_ARCHITECTURE.md:265-296` |
| 为什么要三仓（权限收口论证） | `docs/architecture/three-repo-deployment.md:9-17` |
| 权限矩阵（5 角色 × 4 仓） | `docs/architecture/three-repo-deployment.md:242-249` |
| Submodule-or-sibling 逃生口 | `docs/architecture/three-repo-deployment.md:301-304` |
| Ticket 验证规则（4 条，79 行） | `scripts/validate-ticket-pr.sh:1-79` |
| Ticket 不可变字段清单 | `scripts/check-ticket-immutability.sh:30` |
| 知识库结构（lessons、patterns、pitfalls） | `confluence/memory/MEMORY.md:17-46` |
| 跨引用样例：TASK-637 → 经验 → 代码 | `jira/tickets/EPIC-007/TASK-637.md:148-203`；`confluence/memory/pitfalls/slaver-worktree-code-loss.md:5` |
| 设计源头（人类原始诉求） | `inbox/human_input.md:11,18-25` |

### 5.3 本周可执行的三步迁移

不是口号，是 5 个工作日可以落地的最小集，只用现成 EKET 脚本 + 一次 CI 改动。

1. **Day 1–2 — 原地建三个并列目录。** 把现有 `docs/`（知识）挪到顶层 `confluence/`；把现有 `tickets/` / `issues/` Markdown 挪到 `jira/`；代码留在原位（或挪到 `code_repo/` 以求对称）。每次挪动单独 commit，让 history 可查。**单组织团队无需动 git remote。** 工时：目录本就叫 `docs/` `tickets/` 的半天；要解开混杂内容的一整天。

2. **Day 3 — 把 `scripts/validate-ticket-pr.sh` 接入 CI。** 加一个 workflow step，对每个变更的 ticket 文件跑 `bash scripts/validate-ticket-pr.sh jira/tickets/<id>.md`。脚本 79 行无依赖，对文档化的 4 类违规返回非 0（`scripts/validate-ticket-pr.sh:7-12`）。工时：1 小时，含 CI workflow 编辑 + 一次故意违规的测试 PR 确认 gate 真在。

3. **Day 4–5 — 按目录收口 Slaver 写权限。** 在所有触及 `jira/tickets/*.md` 或 `jira/epics/**/*.md` 的 commit 上挂 pre-commit，跑 `scripts/check-ticket-immutability.sh --staged`；给 `[master-override]` 留豁免（用于 Slaver 在 Master 评审后调整 AC 等合法场景）。如果 Slaver 在 CI 容器里跑、用 scoped token，把 `code_repo/` token 限制到 `refs/heads/feature/TASK-*`，`jira/` token 给整个仓。工时：1 天，主要是权限矩阵核对 + 一次 token 轮换测试。

Day 5 之后：三个生命周期、跨引用被 CI 强制、权限矩阵落地。再往后的 submodule 指针、四分支模型、inbox 桥接——都是优化，不是前置条件。

### 5.4 仓库内交叉引用

- 生命周期分离总论（本文）：`docs/articles/04-three-repo-arch/zh-CN/article.md:1`
- 架构权威规范：`docs/architecture/THREE_REPO_ARCHITECTURE.md:1`（338 行，布局的事实源）
- 部署 playbook：`docs/architecture/three-repo-deployment.md:1`（312 行，"如何搭建"配套）
- 协议层三仓上下文：`docs/articles/01-what-is-eket/zh-CN/article.md:121-127`
- 拆分 ROI 论据：`docs/articles/02-why-you-need-eket/en/article.md:107-114`
- 术语表条目：`docs/articles/GLOSSARY.md:16-21`（Three-Repo Architecture、Memory KB、Ticket、Epic）
- 知识库顶层索引：`confluence/memory/MEMORY.md:1-91`

---

## 6. 经验教训

**教训 1 —— "三仓"和"三个 git 仓"不是同一句话。** 生命周期拆分是必须的；git 拆分是四种存储实现之一。看到"三个 git 仓"就因为运维开销打退堂鼓的团队，错过了真正的推荐。正确读法是：**三个目录，各有访问模型；要最强隔离就用 submodule。** `docs/architecture/three-repo-deployment.md:301-304` 写明了逃生口。

**教训 2 —— 跨引用是协议，目录不是。** 三个目录没有跨引用，只是三个文件夹。三个目录里，每个 ticket 指向一条 note、每条 note 反指 ticket——这才是一张可查询的 audit 图。跨引用是 `scripts/validate-ticket-pr.sh:38-46` 强制的；正是这条强制让布局在崩溃、换人、轮岗中幸存。架构文档是描述，脚本是合同。

**教训 3 —— 教训本身就是设计源头，不是脚注。** `confluence/memory/pitfalls/slaver-worktree-code-loss.md:1-46` 是生命周期拆分的真正触发点。两条 Slaver 事故（TASK-636、TASK-X04）丢工作，是因为生命周期绞在一起。教训记录在 `confluence/`，被 `inbox/human_input.md:11,18-25` 引用，又反过来塑造了 TASK-637 的设计。**audit 之所以能跑通，是因为教训文件本身就是跨引用目标。** 不能 `grep` ticket id 的 wiki 不是协议的一部分，是装饰。

**教训 4 —— 权限矩阵是最被低估的承重墙。** 整份仓里最被低估的表是 `docs/architecture/three-repo-deployment.md:242-249`。接了 EKET 三仓拆分的团队，能用一行回答"这个 AI Slaver 能做什么"。没接的团队，得审完 CI 里所有 pre-commit hook 才能回答。**生命周期拆分把按角色访问控制从"策略"变成"物理"**（不同 git 仓、不同 token），从"有人会绕过"变成"绕不过"。这是 submodule 隔离即便运维更重也优于"单仓 + 严格路径策略"的最强理由。

**教训 5 —— 一周迁移比一季度排错便宜。** 5.3 的五天迁移是机械的。不做的代价是"上下文丢了"事件持续累积，每次花一天拼凑、修一个季度的信任。**ROI 不对称：迁移有上限，漂移没上限。** 经历过 TASK-636 式损失（声称完成、代码没进 git）的团队，不需要被推销三仓；没经历过的团队，也应该直接跑这次迁移——因为预防比恢复便宜。

---

## 7. 参考

- **架构文档**：
  - `docs/architecture/THREE_REPO_ARCHITECTURE.md:1-338` — 权威规范（中文，338 行）
  - `docs/architecture/three-repo-deployment.md:1-312` — 部署 playbook（英文，312 行）
  - `docs/architecture/DEGRADATION-STRATEGY.md:1` — 配套文章：四级降级
- **Ticket 协议**：
  - `scripts/validate-ticket-pr.sh:1-79` — 4 条规则的 CI gate
  - `scripts/check-ticket-immutability.sh:1-94` — 7 字段的 pre-commit gate
  - `docs/adr/ADR-001..003-*.md:1` — 锚定协议的三个 ADR
- **知识库**：
  - `confluence/memory/MEMORY.md:1-91` — 顶层索引
  - `confluence/memory/pitfalls/slaver-worktree-code-loss.md:1-275` — 触发本次拆分的教训
  - `confluence/memory/pitfalls/perf-ac-ambiguity.md:1-33` — 精度偏差 AC 的教训
- **真实样例 ticket**：
  - `jira/tickets/EPIC-007/TASK-637.md:1-258` — Rust CI Pipeline（已完成，Slaver-009，2026-05-14）
  - `inbox/human_input.md:1-105` — 触发恢复设计的人类原始需求
- **本系列配套文章**：
  - [`01-what-is-eket`](../../01-what-is-eket/zh-CN/article.md) — 总论，含三仓一句话
  - [`02-why-you-need-eket`](../../02-why-you-need-eket/en/article.md) — 痛点 × 解法 × ROI
  - [`03-technical-value-choices`](../../03-technical-value-choices/en/article.md) — 七个非显然选择
  - **下一篇**：[`05-four-level-degradation`](../../05-four-level-degradation/en/article.md) — 为什么同一协议用四种实现是系统的地板
- **术语表**：[`docs/articles/GLOSSARY.md:1-46`](../../GLOSSARY.md) — 共享术语（Three-Repo Architecture、Memory KB、Ticket、Epic、Saga、CAS、Checkpoint）
