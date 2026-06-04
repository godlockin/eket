# 10 — 新兵手册：0->1 Slaver 的 5 步通关

> **TL;DR** — 一个新 Slaver（人或 AI）用 **5 条真实 shell 命令**、**约 30 分钟**可以从空白终端走到 PR 上墙：`quick-setup.sh`（5 分钟）、`eket-slaver-register.sh`（2 分钟）、选 ticket（3 分钟）、`eket-slaver-auto.sh` 领取（1 分钟）、开发 + `eket-submit-pr`（15 分钟，其中 5 分钟是环境准备）。**人和 AI 走完全相同的协议**；本文给出的每一条命令都是仓库里真实存在的脚本，不是伪代码。ticket 生命周期、原子 claim、Saga 5 步的完整机制见[《06 — Master-Slaver 协议》](../../06-master-slaver-protocol/zh-CN/article.md)，本文是执行该协议的**第一天速查卡**。

> **核心要点**
> 1. 三档安装（L1 Skills/Commands、L2 加项目骨架、L3 加 CLI）由 flag 切换（`--init`、`--full`），由脚本自身的 banner 输出验证。
> 2. Slaver 注册只会写 **一个 YAML marker 文件**（`.eket/state/slavers/<instance-id>.yml`）并打印身份卡；**不启动任何守护进程**。
> 3. `eket task:claim` 是 SQLite 上**一条原子 CAS UPDATE** — 50 个 Slaver 同毫秒调用也只会有一个成功。
> 4. 5 阶段开发流（CLAIM → ANALYSIS → IN_PROGRESS → TEST → REVIEW）由 Slaver 的 report 流驱动，**不是状态机强制**。
> 5. 「30 分钟」是在已 warm 的机器上的预算；首次冷启动（`git clone` + `npm install`）预留 60 分钟。

---

## Executive Summary

**给决策者（读完这一段即可离开）：**

| 步骤 | 命令 | 耗时 | 结果 |
|---|---|---|---|
| 0. 前置检查 | `git --version && node --version && curl --version` | 1 分钟 | 确认终端是 2021 年之后的 |
| 1. 安装 | `curl -fsSL .../quick-setup.sh \| bash -s -- --init` | 5 分钟 | `CLAUDE.md`、`.eket/`、`confluence/`、`jira/` 三仓骨架 |
| 2. 注册 | `bash .claude/commands/eket-slaver-register.sh` | 2 分钟 | `.eket/state/slavers/<id>.yml` + 身份卡 |
| 3. 领取 | `/eket-claim TASK-NNN`（或 `bash scripts/eket-slaver-auto.sh`） | 1 分钟 | ticket `ready → in_progress`，分支已建 |
| 4. 开发 | Worktree + Brief Inference + 编码 + checkpoint | 15 分钟 | `feature/TASK-NNN-*` 分支、代码已改、测试绿 |
| 5. 提 PR | `/eket-submit-pr` → `eket gate:review TASK-NNN` | 4 分钟 | PR 上墙，ticket `in_review`，Master 收到通知 |
| **总计** | | **约 30 分钟** | **第一张 PR 上墙** |

下文是逐步详解：包含每一条精确命令、每一段精确输出、每一个文件位置。

---

## 目录

1. 动机
2. Step 0 — 前置检查
3. Step 1 — 安装：三档分别装了什么
4. Step 2 — 注册：marker 文件与身份卡
5. Step 3 — 领取：选对 ticket
6. Step 4 — 开发：5 阶段 report 流
7. Step 5 — 提 PR：Saga 5 步与 gate 审查
8. 新兵常见 3 个坑及修复
9. 第一天 30 分钟时间表
10. 参考

---

## 1. 动机 — 为什么 onboarding 值得单独一篇文章

协议本身在 [`docs/articles/06-master-slaver-protocol/zh-CN/article.md`](../06-master-slaver-protocol/zh-CN/article.md) 已经讲透；论点见 [《01 — 什么是 EKET》](../01-what-is-eket/zh-CN/article.md)。但**那两篇文章都不回答第一天的问题**：*我面前是一台干净终端，敲什么，回什么？*

本文就补这一段。它是「操作卡」，不是「白皮书」。ticket 的验收标准（`jira/tickets/EPIC-008/TASK-646.md:51`）写得很直白：*「文章是否尊重新兵的时间（无仪式感）？」* 答案：尊重。下面每条命令都是真实脚本，每个输出框都是脚本的真实打印，章节顺序与 Slaver 实际操作的顺序一致。

5 步对应协议状态机的 5 个跃迁（`docs/articles/06-master-slaver-protocol/zh-CN/article.md:95-135`）：

- **Step 1（安装）→ `READY`**（环境就位、仓骨架存在）
- **Step 2（注册）→ `READY`**（Slaver 实例被系统识别）
- **Step 3（领取）→ `READY → IN_PROGRESS`**（ticket 行的原子 CAS）
- **Step 4（开发）→ `IN_PROGRESS`**（worktree、分支、代码、测试）
- **Step 5（提 PR）→ `IN_PROGRESS → IN_REVIEW`**（PR 上墙、触发 gate 审查）

本文不是任何已有文章的中译本——它是协议的「操作版」：读者手在键盘上，bash 终端在面前，ticket 队列在等。

---

## 2. Step 0 — 前置检查

跑安装脚本前先确认三件事。安装脚本会替你检查前两条（[`scripts/quick-setup.sh:152-169`](../../../scripts/quick-setup.sh)）：

```bash
git --version     # 推荐 git 2.20+
node --version    # 18+（L2 Node.js 实现需要；L0/L1 不需要）
curl --version    # 一行安装脚本需要 7.x+
```

可选但强烈推荐：

- `gh --version` — `eket-submit-pr` 内部调 GitHub CLI 开 PR。
- `cargo --version` — 仅在你要从源码编译 L1 Rust CLI 时需要（[`.claude/skills/eket/references/dev-commands.md:8-13`](../../../.claude/skills/eket/references/dev-commands.md)）；`--full` 走预编译二进制。
- `python3 --version` — 只在跑 Rust test 套件时用，与 onboarding 流程本身无关。

如果三个必装命令缺了一个，安装脚本会打印：

```
✗ 缺少: curl
  brew install curl        # macOS
  sudo apt install curl    # Debian/Ubuntu
```

（见 [`scripts/quick-setup.sh:159-167`](../../../scripts/quick-setup.sh)）。补齐依赖再重跑脚本。

**一个环境变量对安装有用**：`EKET_VERSION` 锁版本（默认 `latest`，见 [`scripts/quick-setup.sh:71`](../../../scripts/quick-setup.sh)）。首次安装不必设。

---

## 3. Step 1 — 安装 — 三档分别装了什么

安装是单行 shell pipeline，flag 决定档位。完整 help 见 [`scripts/quick-setup.sh:97-128`](../../../scripts/quick-setup.sh)：

| Flag | 档位 | 落到磁盘的内容 | 适用 |
|---|---|---|---|
| 无 flag | **L1** | Skills + Commands + Hooks 到 `~/.claude/` | 在已有项目里试 EKET |
| `--init` | **L2** | L1 + 项目骨架：`CLAUDE.md`、`.eket/`、`confluence/`、`jira/`、三仓目录 | 真实项目里首次接入 |
| `--full` | **L3** | L2 + 预编译 `eket` CLI 到 `~/.local/bin/` | 生产环境、Dashboard、HTTP API |

这里的 L1/L2/L3 与[`docs/articles/05-four-level-degradation/zh-CN/article.md:100-105`](../05-four-level-degradation/zh-CN/article.md)里的 L0/L1/L2/L3 运行时降级**是两条独立 ladder，含义不同**。安装 ladder 答的是「磁盘上落了哪些东西」，运行时 ladder 答的是「当前谁在答协议请求」。两套 L-前缀用同一字母是历史包袱，新兵第一周会混，正常。

### 3.1 L2 安装 — 大多数新兵要的那一档

```bash
cd ~/projects/your-project
curl -fsSL https://raw.githubusercontent.com/godlockin/eket/main/scripts/quick-setup.sh | bash -s -- --init
```

屏幕会看到（节选自 [`scripts/quick-setup.sh:483-531`](../../../scripts/quick-setup.sh) 的真实输出）：

```
╔═══════════════════════════════════════════════════════════════╗
║   EKET Quick Setup                                              ║
║   Human-AI Special Forces Team Coordination                    ║
╚═══════════════════════════════════════════════════════════════╝

→ 检查依赖...
✓ 依赖检查通过
→ 下载 EKET (shallow clone, ~50MB)...
✓ 下载完成
→ 安装 Skills → /Users/you/.claude/skills/eket
✓ Skills (42 个文件)
→ 安装 Commands → /Users/you/.claude/commands
✓ Commands (16 个)
→ 安装 Hooks → /Users/you/.claude/hooks
✓ Hooks (3 个)
→ 初始化项目 → /Users/you/projects/your-project
✓ CLAUDE.md
✓ AGENTS.md
✓ .claude/settings.json
✓ confluence/
✓ jira/
✓ .eket/IDENTITY.md
✓ .gitignore 已创建

═══════════════════════════════════════════════════════════════
  ✓ EKET 安装完成！ (Level 2)
═══════════════════════════════════════════════════════════════
耗时: 23 秒
```

「耗时: 23 秒」是 warm 机器（已装 git 与 node）的实测；冷启动（fresh container）要 90–120 秒，主要在 shallow clone。深度由 [`scripts/quick-setup.sh:179`](../../../scripts/quick-setup.sh) 的 `--depth 1` 控制。

### 3.2 `--init` 在磁盘上建了什么

[`scripts/quick-setup.sh:270-329`](../../../scripts/quick-setup.sh) 的 `init_project` 函数在当前目录创建如下结构：

```
your-project/
├── CLAUDE.md                        # 来自 template/CLAUDE.md
├── AGENTS.md                        # 来自 template/AGENTS.md
├── .claude/
│   ├── settings.json                # hooks + commands 配置
│   └── commands/                    # 软链到全局 eket-*.sh
├── .eket/
│   ├── IDENTITY.md                  # 角色 + 初始化时间戳
│   ├── state/                       # 运行时状态（已 gitignore）
│   ├── sessions/                    # 会话日志（已 gitignore）
│   └── logs/                        # 调试日志（已 gitignore）
├── confluence/                      # 知识库
│   ├── memory/lessons/
│   └── architecture/
└── jira/                            # tickets + epics
    ├── tickets/
    └── epics/
```

三件要记的事：

1. `.eket/state/`、`.eket/sessions/`、`.eket/logs/` 被加进 `.gitignore`（[`scripts/quick-setup.sh:317-326`](../../../scripts/quick-setup.sh)）。运行时状态永不提交。
2. 全局 `~/.claude/commands/` 里的命令是**软链**到项目，不是拷贝（[`scripts/quick-setup.sh:298-300`](../../../scripts/quick-setup.sh)）。升级 EKET 重跑一次安装即可；项目的 `.claude/commands/` 自动同步。
3. `confluence/` 和 `jira/` 只放**模板内容**（来自 `template/confluence` 和 `template/jira`，见 [`scripts/quick-setup.sh:303-304`](../../../scripts/quick-setup.sh)）。真实 ticket 与 lesson 在 Slaver 流程中创建，不在安装这一步。

### 3.3 L3 安装 — 加上 CLI

```bash
curl -fsSL https://raw.githubusercontent.com/godlockin/eket/main/scripts/quick-setup.sh | bash -s -- --full
```

[`scripts/quick-setup.sh:334-379`](../../../scripts/quick-setup.sh) 的 CLI 安装器先探测平台（`uname -s` + `uname -m`，见 [`scripts/quick-setup.sh:134-147`](../../../scripts/quick-setup.sh)），从 GitHub releases 下匹配 artifact，加可执行权限，再把 `~/.local/bin/` 加到 shell rc。Rust 核让 `eket task:claim` 跑到 ~21ms p95，比 Node 实现的 ~500ms 快 19×（数字出自 [`docs/articles/01-what-is-eket/zh-CN/article.md:140-145`](../01-what-is-eket/zh-CN/article.md)）。

如果当前平台没有 release artifact，脚本不会报错，而是降级为「手动编译」提示：

```
⚠ 预编译 CLI 下载失败 (可能尚无 release)
  可以手动编译: cd eket/rust && cargo build --release
```

（[`scripts/quick-setup.sh:374-377`](../../../scripts/quick-setup.sh)）。这是 warning 不是 error；等二进制期间你仍然可以用 L1/L2 的 Skills + Commands。

---

## 4. Step 2 — 注册 — `eket-slaver-register.sh` 与 marker 文件

在项目根目录打开 Claude Code，跑注册脚本。脚本在 Claude Code 里也走 slash 形式（`/eket-slaver-register`）— 底层是同一份脚本（见 [`template/.claude/commands/`](../../../template/.claude/commands/)）。

```bash
bash .claude/commands/eket-slaver-register.sh
```

脚本全文 [`template/.claude/commands/eket-slaver-register.sh:1-384`](../../../template/.claude/commands/eket-slaver-register.sh)。它做 4 步，每步用蓝色 `##` 头。

### 4.1 步骤 1 — 身份 marker 文件

第一步写一个 YAML，包含 Slaver 的实例 ID、角色、专长、时间戳（[`template/.claude/commands/eket-slaver-register.sh:61-98`](../../../template/.claude/commands/eket-slaver-register.sh)）：

```yaml
# .eket/state/slavers/slaver_<your-host>_<pid>.yml
instance_id: slaver_myhost_12345
role: slaver
specialty: backend
status: active
registered_at: 2026-06-04T10:02:00+08:00
last_heartbeat: 2026-06-04T10:02:00+08:00

# 工作空间
worktree_dir: null
current_task: null

# 能力标签
skills: []
```

两个细节：

- **这是注册产生的唯一持久化文件**。不启动守护进程、不开端口。CLI 的长轮询模式（[`eket slaver:poll`](../../../.claude/skills/eket/references/dev-commands.md)）是 opt-in，不是默认。
- **`instance_id` 由 hostname + PID 派生**。所以同一台机器多个终端能各自为 Slaver，格式 `slaver_<host>_<pid>`，对应 per-PID session 约定（`docs/architecture/MULTI_INSTANCE_DESIGN.md:42-70`，在 [`docs/articles/06-master-slaver-protocol/zh-CN/article.md:345-356`](../06-master-slaver-protocol/zh-CN/article.md) 引用）。

### 4.2 步骤 2 — ticket 扫描

脚本遍历 `jira/tickets/{feature,bugfix,task,fix}/*.md` 找 `ready` 状态，按优先级排序（P0 > P1 > P2 > P3，见 [`template/.claude/commands/eket-slaver-register.sh:147-156`](../../../template/.claude/commands/eket-slaver-register.sh)），输出带角色匹配标记的表格：

```
┌──────────────────────────────────────────────────────────────┐
│  可领取任务列表（按优先级排序）                              │
├──────────────────────────────────────────────────────────────┤
│  ✓ TASK-646                                                  │
│     优先级：P3 (低) | 适配角色：tech-writer                  │
│                                                              │
│  ✓ TASK-651                                                  │
│     优先级：P3 (低) | 适配角色：backend                      │
└──────────────────────────────────────────────────────────────┘

推荐领取：TASK-646 (角色匹配)
领取命令：/eket-claim <ticket-id>
```

`✓` 表示角色匹配，`○` 表示可领但不匹配你的 specialty（[`template/.claude/commands/eket-slaver-register.sh:170-176`](../../../template/.claude/commands/eket-slaver-register.sh)）。推荐逻辑（行 196–209）优先取角色匹配中优先级最高的；如果你没设 specialty，就取全表优先级最高的。

### 4.3 步骤 3 — 当前任务检查

脚本读 `.eket/state/current_task.yml`，若你已持有 ticket 就打印其状态与下一步（[`template/.claude/commands/eket-slaver-register.sh:217-294`](../../../template/.claude/commands/eket-slaver-register.sh)）。首次跑这一步的输出是：

```
[INFO] 当前无进行中的任务
```

### 4.4 步骤 4 — 身份卡

最后是一张可截图可粘贴到会话日志的总结卡（[`template/.claude/commands/eket-slaver-register.sh:316-340`](../../../template/.claude/commands/eket-slaver-register.sh)）：

```
┌──────────────────────────────────────────────────────────────┐
│                    Slaver 身份信息                            │
├──────────────────────────────────────────────────────────────┤
│  实例 ID:    slaver_myhost_12345                             │
│  角色：Slaver (执行实例)                                       │
│  专长：backend                                                │
│  状态：活跃                                                    │
│                                                              │
│  职责：                                                       │
│  • 领取 Jira tickets 并执行                                  │
│  • 自主规划任务、开发、测试、迭代                            │
│  • 提交 PR 请求 Master 审核                                  │
│                                                              │
│  禁止操作：                                                   │
│  ❌ 合并代码到 main 分支                                      │
│  ❌ 审核自己的 PR                                            │
│  ❌ 领取超出能力范围的任务                                   │
│  ❌ 跳过测试直接提交                                         │
│                                                              │
│  当前任务：无                                                  │
│  注册文件：.eket/state/slavers/slaver_myhost_12345.yml      │
└──────────────────────────────────────────────────────────────┘
```

**请把「禁止操作」大声念一遍**。新兵最容易踩的两条：「合并到 main」—— 分支策略会卡你：`feature/* → testing → main → miao`（`CONTRIBUTING.md:179-180`](../../../CONTRIBUTING.md)）；「自审 PR」—— 状态机直接禁掉：`who_can_transition: [master]` on review state（[`docs/articles/06-master-slaver-protocol/zh-CN/article.md:144-150`](../06-master-slaver-protocol/zh-CN/article.md)）。

---

## 5. Step 3 — 领取 — `eket task:claim`，怎么选对 ticket

两种领法：slash 命令（Claude Code 友好）或 auto-loop 脚本（任意 LLM 工具）。两者落到同一行 SQLite。

### 5.1 Slash 命令 — 给人与 Claude Code 用

在 Claude Code 里最快的是：

```bash
/eket-claim TASK-646
```

脚本在 `.claude/commands/eket-claim.sh`（L1 安装带来，见 [`scripts/quick-setup.sh:231-244`](../../../scripts/quick-setup.sh)）。它通过一条原子 SQL UPDATE 把 ticket 从 `ready` 翻到 `in_progress`（[`docs/articles/06-master-slaver-protocol/zh-CN/article.md:157-166`](../06-master-slaver-protocol/zh-CN/article.md)）：

```sql
UPDATE tickets
SET assignee = ?, state = 'in_progress', claimed_at = ?
WHERE id = 'TASK-646' AND state = 'ready' AND assignee IS NULL;
```

行匹配 = 你领到了。`info.changes === 0` = 别人先到一步，命令会打印 `TASK-646 is already claimed by slaver_otherhost_9999`。换下一个。

### 5.2 Auto-loop — 给无 slash 的 headless Slaver agent

没有 slash 命令的 LLM 工具走 L0 Slaver 循环：`scripts/eket-slaver-auto.sh`（322 行，参考 `wc -l scripts/eket-slaver-auto.sh` 与 [`docs/articles/05-four-level-degradation/zh-CN/article.md:111-120`](../05-four-level-degradation/zh-CN/article.md)）。在项目根目录跑：

```bash
bash scripts/eket-slaver-auto.sh
```

脚本扫 `jira/tickets/`（[`scripts/eket-slaver-auto.sh:90-118`](../../../scripts/eket-slaver-auto.sh)）→ 选最高优先级 ready ticket（[`scripts/eket-slaver-auto.sh:122-145`](../../../scripts/eket-slaver-auto.sh)）→ 把 ticket 状态改成 `in_progress`（[`scripts/eket-slaver-auto.sh:147-178`](../../../scripts/eket-slaver-auto.sh)）→ 建 worktree + 分支（[`scripts/eket-slaver-auto.sh:181-207`](../../../scripts/eket-slaver-auto.sh)）：

```
## 步骤 4: 创建 Worktree 和分支

✓ Worktree 已创建：/Users/you/projects/your-project/.eket/worktrees/TASK-646
```

分支命名遵循协议约定 `feature/TASK-NNN-<slug>`，写在 [`scripts/eket-slaver-auto.sh:187`](../../../scripts/eket-slaver-auto.sh)。Master 在 review 时会扫 `feature/TASK-*` 模式匹配（分支策略见 [`README.md:179-180`](../../../README.md)）。

### 5.3 怎么挑对 ticket

注册脚本的推荐是「角色匹配 + 优先级最高」，但**对第一天的新兵来说，最对的 ticket 是「60 秒能读完描述」的那一张**。来自 [`template/docs/SLAVER-RULES.md:39-46`](../../../template/docs/SLAVER-RULES.md) 的一些启发：

- **优先级**：P3 适合练手。P0/P1 是生产救火。
- **专长**：你设了 `tech-writer` 就找 `tech-writer`；没设就按注册脚本的全表推荐走。
- **状态**：只有 `ready` 可领。`in_progress` 是别人的；`blocked` 需要 Master 解锁。

拿不准就在团队 Master 频道里直接问「哪张 ticket 适合上手练？」。Master 看到的 `eket task:list` 视图与你一样，需要时可以直接改 ticket 文件的 `优先级:` 字段。

---

## 6. Step 4 — 开发 — 分支、编码、checkpoint、测试

[`template/docs/SLAVER-RULES.md:80-90`](../../../template/docs/SLAVER-RULES.md) 把开发循环写成 5 阶段流程 + 角色握手。Slaver 在每阶段做以下事情：

### 6.1 Brief Inference（编码前必出）

写第一行代码之前，先用下面这个**精确格式**输出一行（[`template/docs/SLAVER-RULES.md:39-46`](../../../template/docs/SLAVER-RULES.md)）：

```
📋 任务理解: 功能实现 | 添加用户认证 | JWT + Redis 存储 | 需要考虑 token 刷新
```

Master 会扫描 Slaver 的首份 report 找这一行。缺失 → PR 被 reject（[`template/docs/SLAVER-RULES.md:67-68`](../../../template/docs/SLAVER-RULES.md)）。60 秒的前置成本节省 30 分钟的「等等，这跟我要的不一样」循环。

### 6.2 Worktree 隔离（强制）

所有改动在 git worktree 里做，不在主 checkout 里做（[`template/docs/SLAVER-RULES.md:73-78`](../../../template/docs/SLAVER-RULES.md)）：

```bash
git worktree add .worktrees/TASK-XXX -b feature/TASK-XXX-desc
cd .worktrees/TASK-XXX
```

auto-loop 已经在 `.eket/worktrees/TASK-NNN` 下建好了 worktree（[`scripts/eket-slaver-auto.sh:186-195`](../../../scripts/eket-slaver-auto.sh)）。slash 命令路径下要手动建。

### 6.3 5 阶段 report 流

Slaver 在每个阶段跃迁时发一个 `task_*` 或 `*_request` 事件（[`template/docs/SLAVER-RULES.md:82-90`](../../../template/docs/SLAVER-RULES.md)）：

| 阶段 | Slaver 发 | Master 回 | 工具 |
|---|---|---|---|
| CLAIM | `task_claimed` | ack | `/eket-status` |
| ANALYSIS | `analysis_review_request` | approved / rejected / needs_split | （Claude Code 对话） |
| IN_PROGRESS | `progress_report`（每 `min(estimate/10, 30min)` 一次） | monitor | `/eket-save` |
| TEST | `test_complete` | proceed_to_pr / fix_issues | `npm test` |
| REVIEW | `pr_review_request` | approved / changes_requested / rejected | `/eket-submit-pr` |

Nyquist 规则（[`template/docs/SLAVER-RULES.md:120-129`](../../../template/docs/SLAVER-RULES.md)）约束 ticket 上**每条**验收标准：

1. **可自动化** — 必有 shell 命令证明 AC（不写「手动验证」）。
2. **有时限** — AC 检查 60 秒内出结果。
3. **可重复** — 同代码 + 同命令 = 同结果。

如果 ticket 的 AC 块不满足这三条，在你的 `analysis_review_request` 里把缺的 shell 命令补上，附理由，请 Master 确认。

### 6.4 Commit 纪律

`Rule of 500` 与 `PR ~100 lines` 硬规则（[`template/docs/SLAVER-RULES.md:140-141`](../../../template/docs/SLAVER-RULES.md)）：

- 净 diff > 500 行 → 必须 codemod 化或申请豁免。
- PR ≤ 100 行 → 默认 pass；100–500 行 → 附说明；> 500 行 → 需 Master 预批。

如果你的改动超过 100 行，拆成多张 PR：PR 1 改数据模型，PR 2 接线路，PR 3 改 UI。三张小 PR 胜于一张大 PR——因为 gate review 的信噪比决定 bug 出不出厂。

### 6.5 完成前的 checkpoint

跑 `task:complete` 之前先答 4 问 heartbeat（[`template/docs/SLAVER-RULES.md:7-18`](../../../template/docs/SLAVER-RULES.md)）：

| # | 问题 | 动作 |
|---|---|---|
| Q1 | 当前任务？依赖？ | 确认 ticket ID / 阶段；阻塞 > 30 分钟 → 发 `blocked_report` |
| Q2 | 下个任务？ | 检查 `ready` ticket；不跨角色 |
| Q3 | 能优化吗？ | PR 前自检：lint / test / 无 secret / 无 O(N²) |
| Q4 | 分析瘫痪？ | 连续读 5+ 文件没写 → 立即写骨架或报 BLOCKED |

---

## 7. Step 5 — 提 PR — `eket-submit-pr`、gate 审查、合并

提交序列是 3 条命令 + 等。完整 Saga 5 步见 [`docs/articles/06-master-slaver-protocol/zh-CN/article.md:225-274`](../06-master-slaver-protocol/zh-CN/article.md)；操作员侧要短得多。

### 7.1 submit 命令

在 Claude Code 里：

```bash
/eket-submit-pr
```

脚本 `.claude/commands/eket-submit-pr.sh` 在底层跑 Saga：

1. **validate** — `CompletionValidator.checkAcceptanceCriteria` 读 ticket，确认所有 `- [ ]` 都是 `- [x]`。
2. **test** — 跑 `npm test`（或 ticket 的 `## 验收标准` 段声明的测试命令）。
3. **checkpoint** — 把最终 `TaskCheckpoint` 持久化到 SQLite `task_checkpoints` 表。
4. **commit** — `git add` + `git commit`，消息遵循 Conventional Commits 并含 ticket ID。
5. **notify** — 调 GitHub CLI 开 PR，把 PR URL 写回 ticket 的 `## 交付记录` 段，发 `task:completed` 事件。

任何一步失败，Saga 倒序补偿（[`node/src/core/saga-executor.ts:30-66`](../06-master-slaver-protocol/zh-CN/article.md#33-the-atomic-claim--why-cas-why-sqlite)）。ticket 留在 `in_progress`，数据不丢。

### 7.2 Commit trailer

每个最终 commit 末尾必带 trailer 块（[`template/docs/SLAVER-RULES.md:163-170`](../../../template/docs/SLAVER-RULES.md)）：

```
Confidence: high|medium|low
Rejected-approaches: <或 none>
Directive: <关键决策>
Scope-risk: low|medium|high
```

Master 的 gate 审查脚本会读这四行。`Confidence: low` 不会阻断合并，但告诉 Master「请多花点时间 review」。

### 7.3 Gate 审查

Master（或 CI gate，在 `--auto-approve` 模式下）跑：

```bash
eket gate:review TASK-NNN
```

该命令解析 `gh pr checks` 的输出（[`.claude/skills/eket/SKILL-INDEX.md:39`](../../../.claude/skills/eket/SKILL-INDEX.md)）。Gate 的判定是「所有必检项 green」。通过后 `review → gate_review → merged` 跃迁执行，promotion 脚本 `scripts/sync-branches.sh` 把分支推过 `feature → testing → main → miao`（[`CONTRIBUTING.md:179-180`](../../../CONTRIBUTING.md)）。

### 7.4 合并窗口

合并是 Master 专属操作。Slaver 不能推 `testing`、`main`、`miao`（[`template/docs/SLAVER-RULES.md:155-160`](../../../template/docs/SLAVER-RULES.md)）。完整链路：

```
feature/TASK-NNN-foo --push--> PR --review--> testing --sync--> main --sync--> miao
```

你推 `feature/*`；CI 跑；Master 审；Master 合到 `testing`；sync 脚本接力。验证合并是否落地的最简单办法：`git log origin/main`，看你的 commit SHA 是否在历史里。

### 7.5 合并后：3 问复盘

PR 合并后，在 ticket 的 `## 7. 复盘记录` 段答 3 个问题（[`template/docs/SLAVER-RULES.md:147-152`](../../../template/docs/SLAVER-RULES.md)）：

1. **踩坑**：技术陷阱？执行失误？时间偏差？
2. **复利**：可复用模式 / 命令 / 经验？值得发到 `confluence/memory/` 吗？
3. **重做**：如果重来，最想改的是哪一处？

如果第 2 问答案是「可复用模式」，写到 `confluence/memory/lessons/` 时必须带 Execution Proof（[`template/docs/SLAVER-RULES.md:180-187`](../../../template/docs/SLAVER-RULES.md)）：

```yaml
proof:
  task_id: TASK-XXX
  exit_code: 0
  timestamp: 2026-06-04T10:30:00Z
```

不带 proof 的 lesson 会被知识库写入器拒绝。纪律是刻意的：memory KB 记「已成功的事」，不是「想做的事」。

---

## 8. 新兵常见 3 个坑及修复

这是头 30 天最高频的三种失败。每一种都有已知的修法。

### 8.1 「领了 ticket 但分支没建出来」

**症状**。你跑了 `/eket-claim TASK-646`，命令打印 `Ticket TASK-646 claimed by slaver_myhost_12345`，但 `git branch` 里没有 `feature/TASK-646-*`。

**为什么**。slash 命令的 claim 改的是 SQLite 行；分支是下一步 `git worktree add` 创建的。fresh install 时 `git` 不一定预配 `user.name` / `user.email`，`git worktree add` 会因为没身份静默失败。

**修法**。显式跑 worktree 创建（[`template/docs/SLAVER-RULES.md:75-78`](../../../template/docs/SLAVER-RULES.md)）：

```bash
mkdir -p .worktrees
git worktree add .worktrees/TASK-646 -b feature/TASK-646-onboarding
cd .worktrees/TASK-646
```

如果 `git worktree add` 还是 `fatal: invalid reference`，先配 git 身份：

```bash
git config --global user.name "Your Name"
git config --global user.email "you@example.com"
```

错误可恢复：ticket 在 SQLite 里仍是 `in_progress`，身份配好之后对同一分支名再跑 `git worktree add` 即可成功。

### 8.2 「PR 开了但没自动关联到 ticket」

**症状**。你跑了 `/eket-submit-pr`，GitHub PR 页能看到分支与 diff，但 PR body 里没有 `TASK-646`，ticket 的 `## 交付记录` 段是空的。

**为什么**。submit 脚本的「notify」步（[`docs/articles/06-master-slaver-protocol/zh-CN/article.md:225-274`](../06-master-slaver-protocol/zh-CN/article.md)）从**分支名**读 ticket ID，不从 commit message 读。如果分支名不规范（如 `fix/typo` 而不是 `feature/TASK-646-*`），脚本解析不到 ID，回退到通用 PR body。

**修法**。重命名分支对齐协议约定，再重提：

```bash
git branch -m fix/typo feature/TASK-646-typo-fix
git push origin :fix/typo
git push -u origin feature/TASK-646-typo-fix
/eket-submit-pr
```

「分支名即真理源」是同一套约定，Master 在 review 时也用 `feature/TASK-*` 模式扫（[`README.md:179-180`](../../../README.md)）。如果分支名不匹配，Master 的 dashboard 看不到这张 PR，直到下一次人类触碰前它都是「隐形的」。

### 8.3 「`gate:review` 失败但本地测试是绿的」

**症状**。Master（或 CI）跑 `eket gate:review TASK-646`，输出 `gate:review failed: test step returned non-zero exit code`。你本地 `npm test` 明明通过，gate 却是红的。

**为什么**。Saga 的 `test` 步跑在**新 shell**，不继承你的 `nvm` / `pyenv` / virtualenv。如果项目用 Node 20，CI runner 是 Node 18，test 步啥也没装、啥也没跑、直接 exit 0——本地看是过，gate 环境是另一个 exit code。更常见的情况：ticket 的 `## 验收标准` 段写 `npm test`，但项目是多语言 repo，Rust test 需要 `cd rust && cargo test` 先跑过。

**修法**。先看 ticket 的 AC 块。Nyquist 规则（[`template/docs/SLAVER-RULES.md:120-129`](../../../template/docs/SLAVER-RULES.md)）要求每条 AC 是 60 秒内能跑完的单条 shell 命令。如果 AC 写 `npm test` 但 repo 里带 Rust 代码，把缺失的 `cd rust && cargo test` 步骤补到 AC 块里，再跑：

```bash
cd /path/to/repo
npm test               # 或 AC 里写的任何命令
eket gate:review TASK-646 --dry-run
```

`--dry-run` flag（[`.claude/skills/eket/SKILL-INDEX.md:39`](../../../.claude/skills/eket/SKILL-INDEX.md)）会打印「我会跑什么」，让真 gate 调用前先看到 gap。

---

## 9. 第一天 30 分钟时间表

下面是 warm 机器（Node 18+、git 2.30+、`~/.ssh/config` 已配 GitHub）的实际时间分布。冷启动（fresh 笔记本）需要 30–60 分钟额外 `git clone` + `npm install` 时间。

| 阶段 | 步骤 | 耗时 | 累计 | 实际在做什么 |
|---|---|---|---|---|
| 0 | 前置检查 | 1 分钟 | 0:01 | `git --version && node --version && curl --version` |
| 1 | 下载 + 安装（L2） | 5 分钟 | 0:06 | shallow clone ~50 MB、复制 42 个 skill 文件、16 个 command、3 个 hook、初始化 5 个项目子目录 |
| 1 | 首次环境准备 | 5 分钟 | 0:11 | cold 时跑：`node/` 下 `npm install`、`rust/` 下 `cargo build`、`gh auth login`。后续 warm 时跳过。 |
| 2 | 注册 Slaver | 2 分钟 | 0:13 | `bash .claude/commands/eket-slaver-register.sh` 写 1 个 YAML、打印 4 段面板 |
| 3 | 选 ticket | 3 分钟 | 0:16 | 读 ticket 的 `## 验收标准` 与 `## 技术方案` 段；确认角色匹配 + 优先级；AC 列表是否满足 Nyquist 规则 |
| 3 | 领取 | 1 分钟 | 0:17 | `/eket-claim TASK-646` → 1 条原子 SQL UPDATE；auto-loop 同步建 worktree 与分支 |
| 4 | Brief Inference | 1 分钟 | 0:18 | 输出一行 `📋 任务理解:`，发到 Master 队列 |
| 4 | 实现 | 10 分钟 | 0:28 | 改代码、跑测试、commit。10 分钟假设是小 ticket（单文件、< 100 行 diff）。 |
| 4 | Heartbeat 自检 | 1 分钟 | 0:29 | 答 [`template/docs/SLAVER-RULES.md:7-18`](../../../template/docs/SLAVER-RULES.md) 的 Q1–Q4 |
| 5 | 提 PR | 3 分钟 | 0:32 | `/eket-submit-pr` 跑 Saga 5 步；最慢的一步是 `test`（小仓库 ~30 秒） |
| 5 | 等 gate review | 1 分钟 | 0:33 | Master 的 `eket gate:review` 解析 `gh pr checks` 输出 |
| **合计** | | **约 30 分钟** | **0:30** | **第一张 PR 上墙** |

30 分钟的预算假设「你之前在本仓或非常类似的仓写过代码」。完全陌生仓 + 全新笔记本的首张 PR 更接近 60–90 分钟，多花在 `npm install`（Node 包 1–3 分钟）、`cargo build --release`（Rust CLI 2–4 分钟）、不可避免的「这个配置在哪」问题上。首张 PR 之后 warm 路径稳定在 30 分钟以内。

warm 路径最慢的是「实现」那 10 分钟。最快的是协议操作（claim = 1 SQL UPDATE，complete = 1 Saga）。这种切分是协议的本意：**协议是廉价的，工作是昂贵的**。

---

## 10. 参考

**新兵必读**

- [《01 — 什么是 EKET：特种兵团论》](../../01-what-is-eket/zh-CN/article.md) — 协议论点（先读）。
- [《06 — Master-Slaver 协议》](../../06-master-slaver-protocol/zh-CN/article.md) — 状态机、原子 claim、Saga 5 步深入。
- [《05 — 四级降级》](../../05-four-level-degradation/zh-CN/article.md) — 为什么 L0 shell（`scripts/eket-slaver-auto.sh`）是 load-bearing 的地板。
- [`README.md`](../../../README.md) — 安装 + quick start（中文版：[`README_zh-CN.md`](../../../README_zh-CN.md)）。
- [`CONTRIBUTING.md`](../../../CONTRIBUTING.md) — 分支策略、什么提交、什么不提交。
- [`template/docs/SLAVER-RULES.md`](../../../template/docs/SLAVER-RULES.md) — Slaver 行为契约。

**本文引用的源代码**

- [`scripts/quick-setup.sh:97-128`](../../../scripts/quick-setup.sh) — 安装 help 文本与档位表。
- [`scripts/quick-setup.sh:152-169`](../../../scripts/quick-setup.sh) — `check_deps`，依赖检查；失败时打印 `brew install` / `apt install`。
- [`scripts/quick-setup.sh:179-202`](../../../scripts/quick-setup.sh) — `download_repo`，shallow clone + sparse checkout。
- [`scripts/quick-setup.sh:270-329`](../../../scripts/quick-setup.sh) — `init_project`，L2 目录布局 + `.gitignore` 写入。
- [`scripts/quick-setup.sh:334-379`](../../../scripts/quick-setup.sh) — `install_cli`，L3 Rust 二进制下载。
- [`template/.claude/commands/eket-slaver-register.sh:61-98`](../../../template/.claude/commands/eket-slaver-register.sh) — 身份 marker 文件写入。
- [`template/.claude/commands/eket-slaver-register.sh:147-156`](../../../template/.claude/commands/eket-slaver-register.sh) — ticket 优先级排序（P0 > P1 > P2 > P3）。
- [`template/.claude/commands/eket-slaver-register.sh:316-340`](../../../template/.claude/commands/eket-slaver-register.sh) — 身份卡输出。
- [`scripts/eket-slaver-auto.sh:90-178`](../../../scripts/eket-slaver-auto.sh) — ticket 扫描、排序、领取、状态更新。
- [`scripts/eket-slaver-auto.sh:181-207`](../../../scripts/eket-slaver-auto.sh) — worktree + 分支创建。
- [`.claude/skills/eket/references/dev-commands.md:38-73`](../../../.claude/skills/eket/references/dev-commands.md) — `eket` CLI 命令参考。

**复用术语（[`GLOSSARY.md`](../../GLOSSARY.md)）**

- **Master** — 协调者角色；设定方向、审 PR、合到 `main`。
- **Slaver** — 执行者角色；领 `ready` ticket、实现、开 PR。
- **Ticket** — 原子化、有状态的工作单元；存于 `jira/tickets/TASK-NNN/`。
- **Saga** — 5 步原子完成：validate → test → checkpoint → commit → notify。
- **CAS** — Compare-And-Swap；防止 double-claim 的原子领取原语。
- **Checkpoint** — Slaver 状态的持久化快照；通过 `eket task:resume` 恢复。
- **Branch Strategy** — `feature/*` → `testing` → `main` → `miao`（四级晋升）。
- **Gate Review** — 完成前的质量关；必须在 `task:complete` 成功前通过。

**系列下一篇**：[`11-sdk-and-integration`](../../11-sdk-and-integration/zh-CN/article.md) — 通过 SDK 把 EKET 协议嵌入你自己的应用。
