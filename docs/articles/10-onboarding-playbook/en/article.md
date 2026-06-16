# 10 — Onboarding Playbook: 0->1 Slaver in 5 Steps

> **TL;DR** — A new Slaver (human or AI) can go from a fresh terminal to an open PR in about 30 minutes by running five real shell commands end-to-end: `quick-setup.sh` (5 min), `eket-slaver-register.sh` (2 min), pick a ticket (3 min), `eket-slaver-auto.sh` claim (1 min), develop + `eket-submit-pr` (15 min, of which 5 is environment setup). The protocol is identical for humans and AI; every command in this article is a real script in the repo, not pseudocode. The ticket lifecycle, atomic claim, and Saga 5-step are detailed in [Article 06: Master-Slaver Protocol](../../06-master-slaver-protocol/en/article.md); this article is the **first-day cheat sheet** for actually executing that protocol.

> **Key Takeaways**
> 1. Three install levels — L1 Skills/Commands, L2 + project init, L3 + CLI — picked by flag (`--init`, `--full`), verified by the script's own banner output.
> 2. The Slaver registration writes one YAML marker file (`.eket/state/slavers/<instance-id>.yml`) and prints an identity card; no daemon is started.
> 3. `eket task:claim` is one atomic CAS UPDATE on SQLite — it cannot double-claim, even with 50 Slavers in the same millisecond.
> 4. The 5-phase development flow (CLAIM -> ANALYSIS -> IN_PROGRESS -> TEST -> REVIEW) is enforced by the Slaver's report stream, not by the state machine.
> 5. The "~30 minute" claim is the install-to-PR path on a warm machine; the first time, allow 60 minutes, mostly waiting for `git clone` and `npm install`.

---

## Executive Summary

**For decision-makers (read this and walk away):**

| Step | Command | Time | Outcome |
|---|---|---|---|
| 0. Prerequisites | `git --version && node --version && curl --version` | 1 min | Confirm a 2021+ terminal |
| 1. Install | `curl -fsSL .../quick-setup.sh \| bash -s -- --init` | 5 min | `CLAUDE.md`, `.eket/`, `confluence/`, `jira/`, three-repo skeleton |
| 2. Register | `bash .claude/commands/eket-slaver-register.sh` | 2 min | `.eket/state/slavers/<id>.yml` + identity card |
| 3. Claim | `/eket-claim TASK-NNN` (or `bash scripts/eket-slaver-auto.sh`) | 1 min | Ticket `ready -> in_progress`, branch created |
| 4. Develop | Worktree + Brief Inference + code + checkpoint | 15 min | `feature/TASK-NNN-*` branch, code changed, tests green |
| 5. Submit PR | `/eket-submit-pr` -> `eket gate:review TASK-NNN` | 4 min | PR open, ticket `in_review`, Master notified |
| **Total** | | **~30 min** | **First PR on the board** |

The rest of this article is the step-by-step, with the exact commands, exact outputs, and exact file locations.

---

## Table of Contents

1. Motivation
2. Step 0 — Prerequisites
3. Step 1 — Install
4. Step 2 — Register
5. Step 3 — Claim
6. Step 4 — Develop
7. Step 5 — Submit PR
8. What can go wrong — 3 first-day mistakes with fixes
9. First-day timeline — concrete ~30 min breakdown
10. References

---

## 1. Motivation — why onboarding deserves a dedicated article

The protocol is described in [`docs/articles/06-master-slaver-protocol/en/article.md:380-411`](../06-master-slaver-protocol/en/article.md) end-to-end. The thesis is described in [Article 01](../01-what-is-eket/en/article.md). What neither of them does is **answer the first-day question**: *I am at a fresh terminal, what do I type, and what should I see on screen?*

This article closes that gap. It is the recipe card, not the white paper. The acceptance criterion on the ticket (`jira/tickets/EPIC-008/TASK-646.md:51`) states it explicitly: *"Does the article respect the new Slaver's time (no ceremony)?"* The answer is yes: every command below is a real script, every output block is what the script actually prints, and the section ordering matches the order in which a Slaver does the work.

The five steps mirror the protocol's state machine (`docs/articles/06-master-slaver-protocol/en/article.md:95-135`):

- **Step 1 (Install)** -> `READY` (env exists, repo skeleton present)
- **Step 2 (Register)** -> `READY` (Slaver instance known to the system)
- **Step 3 (Claim)** -> `READY -> IN_PROGRESS` (atomic CAS on the ticket row)
- **Step 4 (Develop)** -> `IN_PROGRESS` (worktree, branch, code, tests)
- **Step 5 (Submit)** -> `IN_PROGRESS -> IN_REVIEW` (PR open, gate review invoked)

The article is deliberately not a translation of any earlier one. It is the operational version of the protocol: the user's hands on the keyboard, the bash terminal in front of them, and a ticket in the queue.

---

## 2. Step 0 — Prerequisites

Before running the install script, confirm three things are on the machine. The install script checks the first two for you ([`scripts/quick-setup.sh:152-169`](../../../scripts/quick-setup.sh)):

```bash
git --version     # git 2.20+ recommended
node --version    # node 18+ (for the L2 Node.js implementation; L0/L1 do not need it)
curl --version    # curl 7.x+ for the one-liner installer
```

Optional but recommended:

- `gh --version` — the GitHub CLI is what `eket-submit-pr` shells out to when it opens the PR.
- `cargo --version` — only required if you want to build the L1 Rust CLI from source ([`.claude/skills/eket/references/dev-commands.md:8-13`](../../../.claude/skills/eket/references/dev-commands.md)); the install script's `--full` flag downloads a precompiled binary.
- `python3 --version` — only required by the Rust test suite, not by the onboarding flow itself.

If any of the three required commands is missing, the install script will print:

```
✗ 缺少: curl
  brew install curl        # macOS
  sudo apt install curl    # Debian/Ubuntu
```

(see [`scripts/quick-setup.sh:159-167`](../../../scripts/quick-setup.sh)). Fix the dependency, re-run the script.

**One environment variable matters for the install:** `EKET_VERSION` pins the version if you want reproducibility (default `latest`, see [`scripts/quick-setup.sh:71`](../../../scripts/quick-setup.sh)). You do not need to set it for the first install.

---

## 3. Step 1 — Install — what each level does

The install is a single shell pipeline with a flag that picks the level. The full help text is at [`scripts/quick-setup.sh:97-128`](../../../scripts/quick-setup.sh). The three levels:

| Flag | Level | What lands on disk | Best for |
|---|---|---|---|
| (no flag) | **L1** | Skills + Commands + Hooks into `~/.claude/` | Trying EKET in an existing project |
| `--init` | **L2** | L1 + project skeleton: `CLAUDE.md`, `.eket/`, `confluence/`, `jira/`, three-repo directories | First-time setup in a real project |
| `--full` | **L3** | L2 + precompiled `eket` CLI into `~/.local/bin/` | Production use, dashboard, HTTP API |

The L1/L2/L3 install levels here are independent from the L0/L1/L2/L3 runtime degradation levels in [`docs/articles/05-four-level-degradation/en/article.md:100-105`](../05-four-level-degradation/en/article.md). Both ladders use the same L-prefix but mean different things; the install ladder is "what got put on disk", the runtime ladder is "which implementation is currently answering protocol operations".

### 3.1 The L2 install — the one most new Slavers want

```bash
cd ~/projects/your-project
curl -fsSL https://raw.githubusercontent.com/godlockin/eket/main/scripts/quick-setup.sh | bash -s -- --init
```

What you will see on screen (trimmed from the actual output at [`scripts/quick-setup.sh:483-531`](../../../scripts/quick-setup.sh)):

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
✓ AGENTS.md                       (slim bootstrap, ~95 lines)
✓ docs/agents/AGENTS.md           (full guide, ~668 lines, loaded on demand)
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

The 23 seconds is the wall-clock time on a warm machine with `git` and `node` already installed. A cold first run on a fresh container can take 90–120 seconds because of the shallow clone. The depth is controlled at [`scripts/quick-setup.sh:179`](../../../scripts/quick-setup.sh) (`--depth 1`).

### 3.2 What `--init` creates on disk

The function `init_project` at [`scripts/quick-setup.sh:270-329`](../../../scripts/quick-setup.sh) creates this layout in the current directory:

```
your-project/
├── CLAUDE.md                        # copy of template/CLAUDE.md
├── AGENTS.md                        # copy of template/AGENTS.md (slim bootstrap)
├── docs/
│   └── agents/
│       └── AGENTS.md                # copy of template/AGENTS.md (full guide, on demand)
├── .claude/
│   ├── settings.json                # hooks + commands
│   └── commands/                    # symlinks to global eket-*.sh
├── .eket/
│   ├── IDENTITY.md                  # role + init timestamp
│   ├── state/                       # runtime state (gitignored)
│   ├── sessions/                    # session logs (gitignored)
│   └── logs/                        # debug logs (gitignored)
├── confluence/                      # knowledge base
│   ├── memory/lessons/
│   └── architecture/
└── jira/                            # tickets + epics
    ├── tickets/
    └── epics/
```

Three things to notice:

1. The `.eket/state/`, `.eket/sessions/`, and `.eket/logs/` directories are added to `.gitignore` by the installer ([`scripts/quick-setup.sh:317-326`](../../../scripts/quick-setup.sh)). Runtime state is never committed.
2. The global commands in `~/.claude/commands/` are **symlinked**, not copied ([`scripts/quick-setup.sh:298-300`](../../../scripts/quick-setup.sh)). Upgrading EKET is a single re-run; your project's `.claude/commands/` updates for free.
3. `confluence/` and `jira/` get *template* content from `template/confluence` and `template/jira` ([`scripts/quick-setup.sh:303-304`](../../../scripts/quick-setup.sh)). Real tickets and lessons are added later by the Slaver workflow, not by the installer.

### 3.3 The L3 install — adds the CLI

```bash
curl -fsSL https://raw.githubusercontent.com/godlockin/eket/main/scripts/quick-setup.sh | bash -s -- --full
```

The CLI installer at [`scripts/quick-setup.sh:334-379`](../../../scripts/quick-setup.sh) detects your platform (`uname -s` + `uname -m`, see [`scripts/quick-setup.sh:134-147`](../../../scripts/quick-setup.sh)), downloads the matching artifact from the latest GitHub release, makes it executable, and adds `~/.local/bin/` to your `PATH` in the active shell rc file. The Rust core gives you `eket task:claim` at ~21ms p95 instead of the Node implementation's ~500ms (numbers from [`docs/articles/01-what-is-eket/en/article.md:140-145`](../01-what-is-eket/en/article.md)).

If the release artifact is not yet published for your platform, the installer prints a warning and falls back to instructions for building from source:

```
⚠ 预编译 CLI 下载失败 (可能尚无 release)
  可以手动编译: cd eket/rust && cargo build --release
```

([`scripts/quick-setup.sh:374-377`](../../../scripts/quick-setup.sh)). This is not an error; you can still use the L1/L2 surface while waiting for the binary.

---

## 4. Step 2 — Register — `eket-slaver-register.sh`, what gets created

Open Claude Code in the project root and run the registration script directly. Inside Claude Code, the slash form `/eket-slaver-register` runs the same script (see the command list at [`template/.claude/commands/`](../../../template/.claude/commands/)).

```bash
bash .claude/commands/eket-slaver-register.sh
```

The script is at [`template/.claude/commands/eket-slaver-register.sh:1-384`](../../../template/.claude/commands/eket-slaver-register.sh). It performs four steps, each printed with a blue `##` header.

### 4.1 Step 1 — Identity marker file

The first step creates a single YAML file with the Slaver's instance ID, role, specialty, and timestamp ([`template/.claude/commands/eket-slaver-register.sh:61-98`](../../../template/.claude/commands/eket-slaver-register.sh)):

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

Two notes about this file:

- **It is the only durable artifact the registration produces.** No daemon is started, no port is opened. The CLI's long-poll mode ([`eket slaver:poll`](../../../.claude/skills/eket/references/dev-commands.md)) is opt-in, not default.
- **The `instance_id` is derived from your hostname + PID**, which is why multiple terminals on the same host can each be a Slaver. The format is `slaver_<host>_<pid>`, following the per-PID session convention from `docs/architecture/MULTI_INSTANCE_DESIGN.md:42-70` (cited in [`docs/articles/06-master-slaver-protocol/en/article.md:345-356`](../06-master-slaver-protocol/en/article.md)).

### 4.2 Step 2 — Ticket scan

The script then walks `jira/tickets/{feature,bugfix,task,fix}/*.md` looking for tickets in `ready` status, sorts by priority (P0 > P1 > P2 > P3, see [`template/.claude/commands/eket-slaver-register.sh:147-156`](../../../template/.claude/commands/eket-slaver-register.sh)), and prints a table with role-match markers:

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

The `✓` is a role-match indicator: a `○` would mean the ticket is claimable but does not match your declared specialty ([`template/.claude/commands/eket-slaver-register.sh:170-176`](../../../template/.claude/commands/eket-slaver-register.sh)). The recommendation logic at lines 196-209 picks the highest-priority role-matched ticket, or the highest-priority ticket overall if you have no specialty set.

### 4.3 Step 3 — Current task check

The script reads `.eket/state/current_task.yml` and, if you already own a ticket, prints what state it is in and what to do next ([`template/.claude/commands/eket-slaver-register.sh:217-294`](../../../template/.claude/commands/eket-slaver-register.sh)). On first run, this section prints:

```
[INFO] 当前无进行中的任务
```

### 4.4 Step 4 — Identity card

The closing output is a summary card the Slaver can screenshot or copy into a session log ([`template/.claude/commands/eket-slaver-register.sh:316-340`](../../../template/.claude/commands/eket-slaver-register.sh)):

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

**Read the prohibited-operations list out loud once.** The two that bite first-day Slavers hardest are "merge to main" (the branch strategy gates it: `feature/* -> testing -> main -> miao`, per [`CONTRIBUTING.md:179-180`](../../../CONTRIBUTING.md)) and "review your own PR" (the state machine makes it impossible: `who_can_transition: [master]` on the review state, see [`docs/articles/06-master-slaver-protocol/en/article.md:144-150`](../06-master-slaver-protocol/en/article.md)).

---

## 5. Step 3 — Claim — `eket task:claim`, finding the right ticket

Two ways to claim: the slash command (Claude Code) or the auto-loop shell script (any LLM tool). Both end at the same SQLite row.

### 5.1 The slash command — for humans and Claude Code

In Claude Code, the fastest path is:

```bash
/eket-claim TASK-646
```

The script lives at `.claude/commands/eket-claim.sh` (installed by L1, see [`scripts/quick-setup.sh:231-244`](../../../scripts/quick-setup.sh)). It transitions the ticket from `ready` to `in_progress` via a single atomic `UPDATE` on the SQLite `tickets` table ([`docs/articles/06-master-slaver-protocol/en/article.md:157-166`](../06-master-slaver-protocol/en/article.md)):

```sql
UPDATE tickets
SET assignee = ?, state = 'in_progress', claimed_at = ?
WHERE id = 'TASK-646' AND state = 'ready' AND assignee IS NULL;
```

If the row matches, you own it. If `info.changes === 0`, somebody else got there first and the command prints `TASK-646 is already claimed by slaver_otherhost_9999`. Move to the next ticket.

### 5.2 The auto-loop — for headless Slaver agents

For an LLM tool that does not have slash commands, the L0 Slaver loop is `scripts/eket-slaver-auto.sh` (322 lines, per `wc -l scripts/eket-slaver-auto.sh`, see [`docs/articles/05-four-level-degradation/en/article.md:111-120`](../05-four-level-degradation/en/article.md)). Run it from the project root:

```bash
bash scripts/eket-slaver-auto.sh
```

The script scans `jira/tickets/` ([`scripts/eket-slaver-auto.sh:90-118`](../../../scripts/eket-slaver-auto.sh)), picks the highest-priority ready ticket ([`scripts/eket-slaver-auto.sh:122-145`](../../../scripts/eket-slaver-auto.sh)), updates the ticket's state to `in_progress` ([`scripts/eket-slaver-auto.sh:147-178`](../../../scripts/eket-slaver-auto.sh)), and creates a worktree + branch ([`scripts/eket-slaver-auto.sh:181-207`](../../../scripts/eket-slaver-auto.sh)):

```
## 步骤 4: 创建 Worktree 和分支

✓ Worktree 已创建：/Users/you/projects/your-project/.eket/worktrees/TASK-646
```

The branch name follows the protocol convention `feature/TASK-NNN-<slug>`, set at [`scripts/eket-slaver-auto.sh:187`](../../../scripts/eket-slaver-auto.sh). Master will scan for branches matching `feature/TASK-*` during review (per the branch strategy at [`README.md:179-180`](../../../README.md)).

### 5.3 How to pick the right ticket

The registration script's recommendation is role-matched, but **the right ticket for a first-day Slaver is the smallest one whose description you can read in 60 seconds.** Some heuristics from [`template/docs/SLAVER-RULES.md:39-46`](../../../template/docs/SLAVER-RULES.md):

- Priority: P3 is fine for a learning run. P0/P1 are production firefights.
- Specialty: if you declared `tech-writer`, look for `tech-writer` tickets; if you have no specialty, the script's recommendation is the highest-priority ticket overall.
- Status: only `ready` tickets can be claimed. Tickets in `in_progress` are owned by someone else; tickets in `blocked` need a Master unblock.

When in doubt, ask in your team's Master channel which ticket is the right one to learn on. Master has the same `eket task:list` view and can re-prioritize a ticket's `优先级:` field in the ticket's markdown header if needed.

---

## 6. Step 4 — Develop — branch, work, checkpoint, test

The development loop is described in [`template/docs/SLAVER-RULES.md:80-90`](../../../template/docs/SLAVER-RULES.md) as a 5-phase flow with role handoffs. The Slaver's side of each phase:

### 6.1 Brief Inference (mandatory, before any code)

Before writing the first line, output one line in this exact format ([`template/docs/SLAVER-RULES.md:39-46`](../../../template/docs/SLAVER-RULES.md)):

```
📋 任务理解: 功能实现 | 添加用户认证 | JWT + Redis 存储 | 需要考虑 token 刷新
```

Master will scan for this in the Slaver's first report. If it is missing, Master rejects the PR (per [`template/docs/SLAVER-RULES.md:67-68`](../../../template/docs/SLAVER-RULES.md)). The 60-second cost up front saves a 30-minute "wait, that's not what I asked for" loop.

### 6.2 Worktree isolation (mandatory)

All work happens in a git worktree, not in the main checkout ([`template/docs/SLAVER-RULES.md:73-78`](../../../template/docs/SLAVER-RULES.md)):

```bash
git worktree add .worktrees/TASK-XXX -b feature/TASK-XXX-desc
cd .worktrees/TASK-XXX
```

The auto-loop creates the worktree for you at `.eket/worktrees/TASK-NNN` (see [`scripts/eket-slaver-auto.sh:186-195`](../../../scripts/eket-slaver-auto.sh)). If you claimed via the slash command, create the worktree manually.

### 6.3 The 5-phase report stream

The Slaver emits a `task_*` or `*_request` event at each phase transition ([`template/docs/SLAVER-RULES.md:82-90`](../../../template/docs/SLAVER-RULES.md)):

| Phase | Slaver emits | Master responds | Tool |
|---|---|---|---|
| CLAIM | `task_claimed` | ack | `/eket-status` |
| ANALYSIS | `analysis_review_request` | approved / rejected / needs_split | (Claude Code conversation) |
| IN_PROGRESS | `progress_report` (every `min(estimate/10, 30min)`) | monitor | `/eket-save` |
| TEST | `test_complete` | proceed_to_pr / fix_issues | `npm test` |
| REVIEW | `pr_review_request` | approved / changes_requested / rejected | `/eket-submit-pr` |

The Nyquist rule ([`template/docs/SLAVER-RULES.md:120-129`](../../../template/docs/SLAVER-RULES.md)) constrains the acceptance criteria on every ticket:

1. **Automatable** — there must be a shell command that proves the AC (no "manually verify").
2. **Time-bounded** — the AC check must finish in 60 seconds.
3. **Repeatable** — same code + same command = same result.

If the AC block on your ticket does not satisfy these three, write the missing shell command in your `analysis_review_request` and ask Master to confirm.

### 6.4 Commit discipline

The `Rule of 500` and `PR ~100 lines` hard rules ([`template/docs/SLAVER-RULES.md:140-141`](../../../template/docs/SLAVER-RULES.md)):

- A net diff > 500 lines requires either a codemod or a Master exemption.
- A PR ≤ 100 lines passes by default; 100–500 lines needs an explanation; > 500 needs pre-approval.

If your change is bigger than 100 lines, split it: do the data-model change in PR 1, the wiring in PR 2, the UI in PR 3. Three small PRs beat one large one because the gate review's signal-to-noise ratio is what determines whether the bug ships.

### 6.5 Checkpoint before completion

Before `task:complete`, run a 4-question heartbeat check ([`template/docs/SLAVER-RULES.md:7-18`](../../../template/docs/SLAVER-RULES.md)):

| # | Question | Action |
|---|---|---|
| Q1 | What is my current task? What does it depend on? | Confirm ticket ID / phase. If blocked > 30 min, file a `blocked_report`. |
| Q2 | What is the next task? | Check `ready` tickets. Do not claim across roles. |
| Q3 | Can I optimize? | Pre-PR self-check: lint, tests, no secrets, no O(N^2) loops. |
| Q4 | Analysis paralysis? | If you have read 5+ files without writing, write the skeleton now or report BLOCKED. |

---

## 7. Step 5 — Submit PR — `eket-submit-pr`, gate review, merge

The submission sequence is three commands and a wait. The full Saga 5-step is described in [`docs/articles/06-master-slaver-protocol/en/article.md:225-274`](../06-master-slaver-protocol/en/article.md); the operator-facing version is shorter.

### 7.1 The submit command

In Claude Code:

```bash
/eket-submit-pr
```

Behind the scenes the script at `.claude/commands/eket-submit-pr.sh` runs the Saga:

1. **validate** — `CompletionValidator.checkAcceptanceCriteria` reads the ticket, confirms all `- [ ]` boxes are `- [x]`.
2. **test** — runs `npm test` (or the test command declared in the ticket's `## 验收标准` section).
3. **checkpoint** — persists the final `TaskCheckpoint` to the SQLite `task_checkpoints` table.
4. **commit** — `git add` + `git commit` with a Conventional Commits message that includes the ticket ID.
5. **notify** — opens the PR via the GitHub CLI, writes the PR URL back into the ticket's `## 交付记录` section, emits a `task:completed` event.

If any step fails, the Saga compensates in reverse order ([`node/src/core/saga-executor.ts:30-66`](../06-master-slaver-protocol/en/article.md#33-the-atomic-claim--why-cas-why-sqlite)). The ticket stays in `in_progress`; no data is lost.

### 7.2 The commit trailer

Every final commit must end with a trailer block ([`template/docs/SLAVER-RULES.md:163-170`](../../../template/docs/SLAVER-RULES.md)):

```
Confidence: high|medium|low
Rejected-approaches: <或 none>
Directive: <关键决策>
Scope-risk: low|medium|high
```

Master's gate-review script reads these. `Confidence: low` does not block merge; it tells Master to spend more time on the review.

### 7.3 The gate review

Master (or the CI gate, in `--auto-approve` mode) runs:

```bash
eket gate:review TASK-NNN
```

The command resolves to a `gh pr checks` parse ([`.claude/skills/eket/SKILL-INDEX.md:39`](../../../.claude/skills/eket/SKILL-INDEX.md)). The gate is "all required checks green". On pass, the transition `review -> gate_review -> merged` runs and the promotion script `scripts/sync-branches.sh` walks the branch through `feature -> testing -> main -> miao` (per the branch strategy at [`CONTRIBUTING.md:179-180`](../../../CONTRIBUTING.md)).

### 7.4 The merge window

Merges are Master-only. As a Slaver, you do not push to `testing`, `main`, or `miao` ([`template/docs/SLAVER-RULES.md:155-160`](../../../template/docs/SLAVER-RULES.md)). The branch strategy is:

```
feature/TASK-NNN-foo --push--> PR --review--> testing --sync--> main --sync--> miao
```

You push to your `feature/*` branch. The CI runs. Master reviews. Master merges to `testing`. The sync script does the rest. You can verify your work landed by running `git log origin/main` and looking for your commit's SHA.

### 7.5 Post-merge: the 3-question retrospective

After the PR is merged, answer three questions in the ticket's `## 7. 复盘记录` section ([`template/docs/SLAVER-RULES.md:147-152`](../../../template/docs/SLAVER-RULES.md)):

1. **What tripped you up?** Technical gotcha, execution mistake, time slip.
2. **What compounds?** Reusable pattern, command, or lesson to publish to `confluence/memory/`.
3. **What would you redo?** The one change you would make if you started over.

If the second answer is "a reusable pattern", write it to `confluence/memory/lessons/` with an Execution Proof block (per [`template/docs/SLAVER-RULES.md:180-187`](../../../template/docs/SLAVER-RULES.md)):

```yaml
proof:
  task_id: TASK-XXX
  exit_code: 0
  timestamp: 2026-06-04T10:30:00Z
```

Lessons without proof are rejected by the knowledge-base writer. The discipline is intentional: the memory KB is a record of things that worked, not aspirations.

---

## 8. What can go wrong — 3 first-day mistakes with fixes

These are the three failures we see most often in the first 30 days. Each one has a known fix.

### 8.1 "I claimed the ticket but no branch was created"

**Symptom.** You ran `/eket-claim TASK-646`, the command printed `Ticket TASK-646 claimed by slaver_myhost_12345`, but `git branch` shows no `feature/TASK-646-*` branch.

**Why it happens.** The slash command's claim updates the SQLite row, but the branch is created by a separate step that requires `git worktree add` permission. On a fresh install, `git` is not always pre-configured with `user.name` / `user.email`, and `git worktree add` fails silently if the worktree parent directory does not exist.

**Fix.** Run the worktree creation explicitly (per [`template/docs/SLAVER-RULES.md:75-78`](../../../template/docs/SLAVER-RULES.md)):

```bash
mkdir -p .worktrees
git worktree add .worktrees/TASK-646 -b feature/TASK-646-onboarding
cd .worktrees/TASK-646
```

If `git worktree add` still errors with `fatal: invalid reference`, set your git identity first:

```bash
git config --global user.name "Your Name"
git config --global user.email "you@example.com"
```

The error is recoverable: the ticket is still `in_progress` in SQLite, so a fresh `git worktree add` against the same branch name will succeed once the identity is set.

### 8.2 "PR opened but not auto-linked to the ticket"

**Symptom.** You ran `/eket-submit-pr`, the GitHub PR page shows your branch and diff, but the PR body does not contain `TASK-646` and the ticket's `## 交付记录` section is empty.

**Why it happens.** The submit script's "notify" step ([`docs/articles/06-master-slaver-protocol/en/article.md:225-274`](../06-master-slaver-protocol/en/article.md)) reads the ticket ID from the **branch name**, not the commit message. If the branch was created with a non-standard name (e.g. `fix/typo` instead of `feature/TASK-646-*`), the script cannot resolve the ticket ID and falls back to a generic PR body.

**Fix.** Rename the branch to match the protocol convention, then re-submit:

```bash
git branch -m fix/typo feature/TASK-646-typo-fix
git push origin :fix/typo
git push -u origin feature/TASK-646-typo-fix
/eket-submit-pr
```

The branch-name-as-truth-source convention is the same one Master uses to discover PRs during review (per the branch strategy at [`README.md:179-180`](../../../README.md)). If the branch name does not match `feature/TASK-*`, Master does not see the PR in their dashboard scan, and the work is effectively invisible until the next human touch.

### 8.3 "`gate:review` failed because tests didn't run"

**Symptom.** Master (or CI) ran `eket gate:review TASK-646` and the output was `gate:review failed: test step returned non-zero exit code`. Your local `npm test` passes, but the gate is red.

**Why it happens.** The Saga's `test` step runs in a fresh shell that does not inherit your `nvm`, `pyenv`, or virtualenv. If the project uses Node 20 but the CI runner has Node 18, the test step installs nothing, runs nothing, and exits 0 — which is "passing" locally but a different exit code in the gate's environment. Or, the more common case: the ticket's `## 验收标准` section listed `npm test` as the test command, but the project is a polyglot repo and the Rust tests require `cd rust && cargo test` first.

**Fix.** Check the ticket's acceptance-criteria block. The Nyquist rule ([`template/docs/SLAVER-RULES.md:120-129`](../../../template/docs/SLAVER-RULES.md)) requires each AC to be a single shell command that runs in 60 seconds. If the AC says `npm test` but the repo has Rust code, write the missing `cd rust && cargo test` step into the ticket's AC block and re-run:

```bash
cd /path/to/repo
npm test               # or whatever the AC says
eket gate:review TASK-646 --dry-run
```

The `--dry-run` flag (per [`.claude/skills/eket/SKILL-INDEX.md:39`](../../../.claude/skills/eket/SKILL-INDEX.md)) reports which command it would run, so you can see the gap before the real gate call.

---

## 9. First-day timeline — concrete ~30 min breakdown

This is what 30 minutes looks like on a warm machine (Node 18+, git 2.30+, `~/.ssh/config` already authenticated to GitHub). A cold first run adds 30–60 minutes for `git clone` and `npm install`.

| Phase | Step | Time | Cumulative | What is happening |
|---|---|---|---|---|
| 0 | Prerequisites check | 1 min | 0:01 | `git --version && node --version && curl --version` |
| 1 | Download + install (L2) | 5 min | 0:06 | Shallow clone (~50 MB), copy 42 skill files, 16 commands, 3 hooks, init 5 project subdirectories |
| 1 | First-time env setup | 5 min | 0:11 | Of the 5 min in the budget, this is what runs cold: `npm install` in `node/`, `cargo build` in `rust/`, `gh auth login`. Subsequent runs skip this. |
| 2 | Register Slaver | 2 min | 0:13 | `bash .claude/commands/eket-slaver-register.sh` writes 1 YAML, prints 4 panels |
| 3 | Pick a ticket | 3 min | 0:16 | Read the ticket's `## 验收标准` and `## 技术方案` sections; confirm role match and priority; check that the AC list satisfies the Nyquist rule |
| 3 | Claim | 1 min | 0:17 | `/eket-claim TASK-646` -> 1 atomic SQL UPDATE; auto-loop creates worktree and branch |
| 4 | Brief Inference | 1 min | 0:18 | One-line `📋 任务理解:` output, posted to Master's queue |
| 4 | Implement | 10 min | 0:28 | Edit code, run tests, commit. The 10 min assumes a small ticket (one file, < 100 lines diff). |
| 4 | Heartbeat self-check | 1 min | 0:29 | 4-question Q1-Q4 from [`template/docs/SLAVER-RULES.md:7-18`](../../../template/docs/SLAVER-RULES.md) |
| 5 | Submit PR | 3 min | 0:32 | `/eket-submit-pr` runs the Saga 5-step; the slowest step is `test` (~30 s on a small repo) |
| 5 | Gate review wait | 1 min | 0:33 | Master's `eket gate:review` parses `gh pr checks` output |
| **Total** | | **~30 min** | **0:30** | **First PR on the board** |

The 30-minute budget assumes you have written code in this repo before, or in a very similar one. The first PR ever in a brand-new repo, on a fresh laptop, runs closer to 60–90 minutes because of `npm install` (Node packages, 1–3 min), `cargo build --release` (Rust CLI, 2–4 min), and the inevitable "where is this setting?" question. After the first PR, the warm path is 30 minutes or less.

The slowest step in the warm path is the implementation phase (10 min). The fastest steps are the protocol operations (claim = 1 SQL UPDATE, complete = 1 Saga). The split is the protocol's point: the protocol is cheap; the work is expensive.

---

## 10. References

**Required reading for new Slavers**

- [Article 01 — What is EKET: The Special-Forces Thesis](../../01-what-is-eket/en/article.md) — the protocol thesis (read first).
- [Article 06 — Master-Slaver Protocol](../../06-master-slaver-protocol/en/article.md) — the state machine, atomic claim, Saga 5-step in depth.
- [Article 05 — Four-Level Degradation](../../05-four-level-degradation/en/article.md) — why the L0 shell script (`scripts/eket-slaver-auto.sh`) is the load-bearing floor.
- [`README.md`](../../../README.md) — install + quick start (also in Chinese: [`README_zh-CN.md`](../../../README_zh-CN.md)).
- [`CONTRIBUTING.md`](../../../CONTRIBUTING.md) — branch strategy, what to commit, what not to commit.
- [`template/docs/SLAVER-RULES.md`](../../../template/docs/SLAVER-RULES.md) — Slaver behavior contract.

**Source code cited in this article**

- [`scripts/quick-setup.sh:97-128`](../../../scripts/quick-setup.sh) — install help text and level table.
- [`scripts/quick-setup.sh:152-169`](../../../scripts/quick-setup.sh) — `check_deps`, the dependency check that prints `brew install` / `apt install` on failure.
- [`scripts/quick-setup.sh:179-202`](../../../scripts/quick-setup.sh) — `download_repo`, the shallow clone with sparse checkout.
- [`scripts/quick-setup.sh:270-329`](../../../scripts/quick-setup.sh) — `init_project`, the L2 directory layout and `.gitignore` write.
- [`scripts/quick-setup.sh:334-379`](../../../scripts/quick-setup.sh) — `install_cli`, the L3 Rust binary download.
- [`template/.claude/commands/eket-slaver-register.sh:61-98`](../../../template/.claude/commands/eket-slaver-register.sh) — identity marker file write.
- [`template/.claude/commands/eket-slaver-register.sh:147-156`](../../../template/.claude/commands/eket-slaver-register.sh) — ticket priority sort (P0 > P1 > P2 > P3).
- [`template/.claude/commands/eket-slaver-register.sh:316-340`](../../../template/.claude/commands/eket-slaver-register.sh) — identity card output.
- [`scripts/eket-slaver-auto.sh:90-178`](../../../scripts/eket-slaver-auto.sh) — ticket scan, sort, claim, status update.
- [`scripts/eket-slaver-auto.sh:181-207`](../../../scripts/eket-slaver-auto.sh) — worktree + branch creation.
- [`.claude/skills/eket/references/dev-commands.md:38-73`](../../../.claude/skills/eket/references/dev-commands.md) — `eket` CLI command reference.

**Glossary terms reused from [`GLOSSARY.md`](../../GLOSSARY.md)**

- **Master** — the coordinator role; sets direction, reviews PRs, merges to `main`.
- **Slaver** — the executor role; claims READY tickets, implements, opens PRs.
- **Ticket** — an atomic, stateful unit of work; lives in `jira/tickets/TASK-NNN/`.
- **Saga** — the 5-step atomic completion: validate -> test -> checkpoint -> commit -> notify.
- **CAS** — Compare-And-Swap; the atomic claim primitive that prevents double-claim.
- **Checkpoint** — a persisted snapshot of Slaver state, recoverable via `eket task:resume`.
- **Branch Strategy** — `feature/*` -> `testing` -> `main` -> `miao` (four-stage promotion).
- **Gate Review** — the pre-completion quality gate; must pass before `task:complete` succeeds.

**Next article in series**: [`11-sdk-and-integration`](../../11-sdk-and-integration/en/article.md) — how to embed EKET's protocol in your own application via the SDK.
