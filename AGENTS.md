# EKET Agent Framework — AI Agent Guide (Bootstrap)

**Version**: v2.9.0-alpha  
**Date**: 2026-06-16  
**Compatible with**: Claude Code, Gemini CLI, GPT-4 (Codex), Cursor, opencode, and any LLM-based agent

> This is the **slim bootstrap**. The full universal guide (668 lines)
> lives at [`docs/agents/AGENTS.md`](docs/agents/AGENTS.md).  
> For Claude Code specific guidance, also read `CLAUDE.md`.  
> For opencode-specific on-demand rules, read `~/.config/opencode/AGENTS.md`.

---

## 1. What is EKET?

EKET is a **multi-agent collaborative development framework**. It
coordinates multiple AI agent instances on a single project using a
Master-Slaver architecture:

- **One Master** (PM / Scrum Master / Tech Lead): requirements, tasks, PR review — **no coding**
- **Multiple Slavers** (executors): pick tasks, write code, run tests, submit PRs

State is in files + Git. No central server.

---

## 2. On-demand loading (CRITICAL — read this first)

**Do NOT load `docs/agents/AGENTS.md` preemptively.** It is 668 lines and
most sessions only need a fraction of it. Load sections on demand:

| Need | Action |
|------|--------|
| Repository layout | `Read(docs/agents/AGENTS.md, offset=37, limit=30)` |
| Master role & red lines | `Read(docs/agents/AGENTS.md, offset=68, limit=80)` |
| Slaver role & workflow | `Read(docs/agents/AGENTS.md, offset=150, limit=100)` |
| Git branching strategy | `Read(docs/agents/AGENTS.md, offset=250, limit=60)` |
| PR / review process | `Read(docs/agents/AGENTS.md, offset=310, limit=80)` |
| A specific keyword | `Grep("DAG", path="docs/agents/AGENTS.md")` then Read that range |
| Quick command reference | Load the **`eket` skill** (see Section 4) |

General rule: if you can answer from `CLAUDE.md` (if present), README.md,
or your own knowledge of the codebase, **do that first**. Only escalate
to `docs/agents/AGENTS.md` when the question is genuinely framework-level.

---

## 3. First thing: read your identity

**Every session, before doing work, read `.eket/IDENTITY.md`** to learn:

- Are you **Master** or **Slaver**?
- Your role/specialty (`backend_dev`, `qa_engineer`, …)
- Your permissions and forbidden actions

If `.eket/IDENTITY.md` is missing, run the initialization flow described
in `docs/agents/AGENTS.md#initialization`.

---

## 4. Prefer skills over raw docs

The `eket` skill is the curated, summarized entry point to the framework.
It exposes the CLI command index (`task:claim`, `task:create`, `slaver:register`,
`gate:review`, `system:doctor`, …) without forcing you to read 668 lines.

Use the skill when the user mentions:
- "eket", "领取任务", "claim task"
- "slaver注册", "register slaver"
- "系统诊断", "system:doctor"
- "Master-Slaver", "gate review", "多智能体"
- Any `task:*`, `master:*`, `slaver:*`, `epic:*`, `gate:*` command

---

## 5. Branch policy (universal)

All work happens on `feature/*` branches. PRs flow:
`feature/*` → `testing` → `main` → `miao` (via `bash scripts/sync-branches.sh`).

**No direct commits to `main`, `testing`, or `miao`.**

---

## 6. Pointers to the rest of the docs

| File | Purpose | Load when |
|------|---------|-----------|
| `CLAUDE.md` | Claude-Code-specific tips | Using Claude Code |
| `README.md` | Project overview, install, quick start | First time on the project |
| `docs/agents/AGENTS.md` | Full universal agent guide (668 lines) | Framework-level questions |
| `docs/architecture/FRAMEWORK.md` | Architecture whitepaper (576 lines) | Architecture decisions |
| `template/CLAUDE-TEMPLATE.md` | External project template | Scaffolding a new project |
| `template/docs/MASTER-RULES.md` | Master detailed rules | After `.eket/IDENTITY.md` says you're Master |
| `template/docs/SLAVER-RULES.md` | Slaver detailed rules | After `.eket/IDENTITY.md` says you're Slaver |
