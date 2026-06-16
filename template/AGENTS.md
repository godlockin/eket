# EKET Agent Framework — AI Agent Guide (Bootstrap)

**Version**: v2.9.0-alpha  
**Date**: 2026-06-16  
**Compatible with**: Claude Code, Gemini CLI, GPT-4 (Codex), Cursor, opencode, and any LLM-based agent

> This is the **slim bootstrap** for newly scaffolded EKET projects.  
> The full universal guide lives at `docs/agents/AGENTS.md` in mature projects;
> for brand-new projects created from this template, the full guide is
> fetched on demand from the EKET framework source (see Section 4).

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

**Do NOT load the full agent guide preemptively.** It is 500+ lines and
most sessions only need a fraction of it. Load sections on demand:

| Need | Action |
|------|--------|
| Repository layout | `Read(docs/agents/AGENTS.md, offset=37, limit=30)` |
| Master role & red lines | `Read(docs/agents/AGENTS.md, offset=68, limit=80)` |
| Slaver role & workflow | `Read(docs/agents/AGENTS.md, offset=150, limit=100)` |
| Git branching strategy | `Read(docs/agents/AGENTS.md, offset=250, limit=60)` |
| PR / review process | `Read(docs/agents/AGENTS.md, offset=310, limit=80)` |
| A specific keyword | `Grep("DAG", path="docs/agents/AGENTS.md")` then Read that range |
| Quick command reference | Use the `eket` skill if available (see Section 4) |

General rule: if you can answer from `CLAUDE.md` (if present), README.md,
or your own knowledge of the codebase, **do that first**.

---

## 3. First thing: read your identity

**Every session, before doing work, read `.eket/IDENTITY.md`** to learn:

- Are you **Master** or **Slaver**?
- Your role/specialty (`backend_dev`, `qa_engineer`, …)
- Your permissions and forbidden actions

If `.eket/IDENTITY.md` is missing, run the initialization flow described
in `docs/agents/AGENTS.md#initialization`.

---

## 4. Prefer skills and slim docs

The `eket` skill (if installed under `.claude/skills/eket/`) is the
curated entry point — use it for command lookups instead of reading raw
docs. If the skill is not available in this project, fall back to
on-demand `Read` of the relevant section.

Use the skill or on-demand read whenever the user mentions:
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
| `docs/agents/AGENTS.md` | Full universal agent guide | Framework-level questions |
| `docs/architecture/FRAMEWORK.md` | Architecture whitepaper | Architecture decisions |
| `template/docs/MASTER-RULES.md` | Master detailed rules | After IDENTITY says you're Master |
| `template/docs/SLAVER-RULES.md` | Slaver detailed rules | After IDENTITY says you're Slaver |
