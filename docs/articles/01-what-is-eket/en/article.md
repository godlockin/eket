# 01 — What is EKET: The Special-Forces Thesis

> **TL;DR** — EKET is a *coordination protocol* for human-AI teams, not another agent framework. It treats humans and AI agents as peers in the same workflow: a small command staff (1–5 humans) sets direction through tickets, while a fleet of AI agents (N) executes in parallel. The protocol is enforced through three orthogonal layers — three-repository separation, four-level graceful degradation, and a master-slaver state machine — and is delivered identically to Claude Code, Cursor, Codex, Copilot, and Gemini.

> **Key Takeaways**
> 1. EKET is a **protocol layer**, not a workflow engine or agent runtime.
> 2. The 1–5 humans + N agents model only works if humans and AI follow the **same** contract.
> 3. The three pillars — repo separation, degradation, state machine — are independent and compose cleanly.
> 4. The protocol is **tool-agnostic** by design; the LLM is an implementation detail.
> 5. The thesis: small command, large execution, shared accountability through artifacts.

---

## Executive Summary

**For decision-makers (read this and walk away):**

| Question | Answer |
|---|---|
| What is it? | A protocol for human-AI team coordination, expressed as tickets, branches, and PRs. |
| Who is it for? | Engineering teams that have crossed the threshold from "AI as autocomplete" to "AI as team member." |
| What's the win? | Predictable throughput: ticket → claim → PR → review, regardless of whether the executor is a human or a model. |
| What's the cost? | Discipline: three concerns live in three places, agents must register before they can claim. |
| What's the risk if we don't? | Ad-hoc prompting scales linearly with humans, while AI capacity scales exponentially — coordination debt compounds. |

The rest of this article unpacks *how* the protocol is structured and *why* each piece exists.

---

## Table of Contents

1. Motivation
2. The Big Idea
3. How It Works
4. Trade-offs & Alternatives
5. Implementation Notes
6. Lessons Learned
7. References

---

## 1. Motivation

Between 2024 and 2026, the bottleneck in software engineering shifted twice.

- **2024 — Prompt scarcity.** Engineers spent hours crafting the perfect prompt to extract value from a model.
- **2025 — Agent sprawl.** Multiple autonomous agents (Claude Code, Cursor, Codex, Copilot, Aider) could each take a ticket end-to-end. The new bottleneck became *coordination*: who is doing what, what state are they in, and what happens when one of them crashes?

The same year, three failure modes began appearing in every team that adopted agents at scale:

1. **Lost context.** An agent runs for 30 minutes, then dies. The 30 minutes of work is irrecoverable because it lived only in a chat scrollback.
2. **Conflicting edits.** Two agents both fix the same lint warning in parallel; the second overwrites the first.
3. **Opaque review.** A human reviewer is handed a 4,000-line diff with no narrative — only the model knows why each line exists.

These are not model problems. They are **coordination protocol problems**. The model is the executor; the protocol decides *what gets executed, by whom, in what order, with what recovery story.*

> "If your team is bigger than one person, you don't have an agent problem — you have a coordination problem that happens to involve agents."
> — *EKET design note, 2025-08*

EKET's bet: **lift the model out of the critical path of state**, and put artifacts there instead. The model becomes replaceable; the artifacts persist.

---

## 2. The Big Idea

The thesis has three orthogonal claims. Each is independent. Each composes with the others. None of them is a new idea in distributed systems — what is new is applying them to human-AI teams.

### 2.1 Small command, large execution (1–5 + N)

A "special forces" team is small, decision-rich, and supported by a larger execution body. The command staff decides *what* and *why*; the execution body decides *how* and *when*. The numbers matter: 1–5 humans is the size at which synchronous communication still works (Slack channel, standup, pair session). Beyond that, you need ceremony; below that, ceremony is overhead.

### 2.2 Same protocol for human and AI

This is the radical part. A human "claims" a ticket by moving it from `READY` to `IN_PROGRESS` in a Kanban board. An AI "claims" it by running `eket task:claim TASK-NNN` against SQLite. **They are the same operation from the system's point of view** — atomic, idempotent, with a single source of truth. The consequence: humans and AI can hand off work mid-stream without translation.

### 2.3 Three concerns, three repositories

Knowledge (what we have learned), tasks (what we are doing), and code (what we are building) are three different lifecycles. Knowledge is append-mostly. Tasks are stateful. Code is versioned. Trying to colocate them creates a tool that is bad at all three. EKET puts them in `confluence/`, `jira/`, and `code_repo/` respectively, with explicit cross-references.

---

## 3. How It Works

The protocol is a state machine. The state is the union of three artifacts. The transitions are the protocol operations.

### 3.1 The state machine (master-slaver)

```
                    ┌──────────────┐
                    │   INBOX      │  ← humans post requirements
                    └──────┬───────┘
                           │ epic:create
                           ▼
                    ┌──────────────┐
            ┌──────│    READY     │  ← ticket in jira/tickets/
            │      └──────┬───────┘
            │             │ task:claim  (CAS on SQLite)
            │             ▼
            │      ┌──────────────┐
            │      │ IN_PROGRESS  │  ← checkpoint, branch, work
            │      └──────┬───────┘
            │             │ task:complete (Saga 5-step)
            │             ▼
            │      ┌──────────────┐
            │      │ IN_REVIEW    │  ← PR open, master scans
            │      └──────┬───────┘
            │             │ gate:review (pass)
            │             ▼
            │      ┌──────────────┐
            │      │    DONE      │  ← merged: feature → testing → main → miao
            │      └──────────────┘
            │
            │      failure / crash
            └─────► RESUME (task:resume from last checkpoint)
```

The state machine lives in `node/src/core/` and is mirrored in the Rust core (`rust/crates/eket-core/`) for fast CLI access. Both read/write the same SQLite table; **the database is the only source of truth**.

### 3.2 The three repositories

| Concern | Path | Lifecycle | Mutability |
|---|---|---|---|
| Knowledge | `confluence/memory/` | Append-mostly | Edit is allowed but discouraged |
| Tasks | `jira/tickets/` | Stateful, finite | Immutability enforced by `check-ticket-immutability.sh` |
| Code | `code_repo/` (or `rust/`, `node/`) | Versioned, branchy | Standard git |

A ticket in `jira/tickets/TASK-001/` references one or more notes in `confluence/memory/lessons/` and one or more commits in the code repo. **No ticket exists without references in at least one of the other two.** This rule, enforced by `validate-ticket-pr.sh`, is what makes the cross-repo navigation survivable.

### 3.3 Degradation is a feature

EKET ships **four implementations of the same protocol**, ranked by capability:

| Level | Implementation | When it runs | Capability |
|---|---|---|---|
| L0 | Shell scripts (`scripts/eket-*.sh`) | Zero-dep environment, CI, recovery | Read, write, claim — *no concurrency guarantees beyond filesystem locks* |
| L1 | Rust core (`rust/crates/eket-cli/`) | Default for humans, fast loops | Full CAS, axum HTTP API, 21ms/cmd |
| L2 | Node.js (`node/src/`) | Dashboard, LLM gateway, webhooks | Full Saga, hook server, multi-tool bridge |
| L3 | Shell fallback | When L2 is down but L1 is up | Read-only ops + heartbeat |

**The protocol does not change across levels.** A ticket claimed via L0 shell is the same ticket claimed via L1 Rust CLI. The fallback chain is automatic; `eket system:doctor` reports which level is active.

### 3.4 Multi-tool by construction

A protocol is a contract. A contract has implementers. EKET ships implementers for five LLM tools: Claude Code (`CLAUDE.md` + `.claude/skills/`), Cursor (`CURSOR.md` + `.cursorrules`), Codex (`CODEX.md`), Copilot (`COPILOT.md`), Gemini (`AGENTS.md`). All five read the same state and emit the same operations. **You can have three Cursor agents and two Claude Code agents working the same backlog, with the same audit trail.**

---

## 4. Trade-offs & Alternatives

| Alternative | What it does | What EKET does differently |
|---|---|---|
| **LangGraph / CrewAI / AutoGen** | Workflow engines for *agent-to-agent* conversations | EKET does not orchestrate agents talking to each other; it orchestrates agents talking to *artifacts* |
| **OpenAI Swarm** | Lightweight agent handoff | EKET makes the handoff durable (ticket state survives crashes) |
| **Pure shell scripts** | Custom one-off automation per team | EKET is a *reusable* protocol — the state machine, claims, reviews, and dashboards are pre-built |
| **GitHub Projects + Actions** | Kanban + CI on a single repo | EKET keeps knowledge, tasks, and code in three separate concerns; GitHub Projects conflates them |
| **Bespoke prompt chains** | Each engineer invents their own | EKET standardizes the *contract*; prompts remain free |

### When **not** to use EKET

- A single human, working solo, with one agent. The protocol overhead exceeds the coordination benefit.
- Pure chat workflows where the output is a message, not an artifact. EKET is artifact-centric.
- Teams that refuse to put their knowledge base in version control.

---

## 5. Implementation Notes

### 5.1 What you actually run

```bash
# One-line install
curl -fsSL https://raw.githubusercontent.com/godlockin/eket/main/scripts/quick-setup.sh | bash

# Start your role
/eket-start                     # auto-detect: master or slaver?
/eket-start -r master           # explicit
/eket-start -r slaver           # explicit

# Claim and deliver
eket task:claim                 # claim next READY ticket
eket task:progress              # see the DAG and critical path
git checkout -b feature/TASK-001-foo
# ... implement + commit ...
eket task:complete TASK-001     # Saga 5-step
```

### 5.2 Where to look in the source

| Concern | Path | Notes |
|---|---|---|
| Protocol state machine | `node/src/core/` | TypeScript reference impl |
| Fast CLI | `rust/crates/eket-cli/` | 19× faster than Node for `task:claim` |
| Axum HTTP API | `rust/crates/eket-server/` | Default port 9877 |
| Hook server | `node/src/hooks/` | Cross-tool event bridge |
| Three-repo layout | `confluence/`, `jira/`, `code_repo/` (or `rust/`, `node/`) | See `docs/architecture/THREE_REPO_ARCHITECTURE.md` |
| Degradation chain | `docs/architecture/DEGRADATION-STRATEGY.md` | 591 lines, the authoritative spec |

### 5.3 Cross-references inside the repo

- White paper: `docs/architecture/FRAMEWORK.md:1` (576 lines, the source of truth for protocol semantics)
- Three-repo philosophy: `docs/architecture/THREE_REPO_ARCHITECTURE.md:1`
- Master-Slaver mode ADR: `docs/adr/ADR-002-master-slaver-mode.md:1`
- File-queue fallback ADR: `docs/adr/ADR-003-file-queue-fallback.md:1`

---

## 6. Lessons Learned

**Lesson 1 — "Degradation" is the most underrated design decision.** Most "AI orchestration" tools die the day Redis goes down. EKET survives because the protocol can be expressed in 300 lines of shell. The shell implementation is not a legacy artifact; it is the floor of the system.

**Lesson 2 — The three-repo split is not about git; it's about lifecycles.** Knowledge, tasks, and code have different write patterns. Colocating them forces one tool to be bad at all three. The split lets each tool be excellent at one.

**Lesson 3 — Humans and AI on the same protocol eliminates an entire class of bugs.** When a human can hand off a ticket to an AI mid-stream, the AI cannot do something the human could not have done — because the state machine doesn't allow it. The protocol is the safety rail.

**Lesson 4 — The 1–5 humans is not arbitrary.** Below 1, you don't need a protocol. Above 5, you need org design. The "special forces" size is the sweet spot where ceremony is overhead below, and ceremony is required above.

---

## 7. References

- Internal: `README.md`, `docs/architecture/FRAMEWORK.md`, `docs/architecture/THREE-LEVEL-ARCHITECTURE.md`
- ADRs: `docs/adr/ADR-001..003-*.md`
- Memory KB: `confluence/memory/MEMORY.md`
- Next article in series: [`02-why-you-need-eket`](../../02-why-you-need-eket/en/article.md) — the pain × solution × ROI argument
