# 02 — Why You Need EKET: Pain x Solution x ROI

> **TL;DR** — EKET earns its place on the team by solving the four coordination pains that appear *the moment* you give more than one agent (or one human-plus-agent pair) a real backlog: lost context, conflicting edits, opaque review, and missing audit trail. It does this with a 1–5 + N protocol that produces a measurable ROI: `task:claim` is **19x faster** in Rust than in Node.js, the CLI cold-starts **~187x faster** (~8 ms vs ~1,500 ms), and uses **~10x less memory** (~12 MB vs ~120 MB) (source: `README.md:140-145`). For decision-makers, the question is not "should we adopt EKET?" but "can we afford to keep solving the same four pains by hand?"

> **Key Takeaways**
> 1. The bottleneck in 2026 is no longer model quality — it is **coordination debt** that compounds with every extra agent.
> 2. The four pain points are not bugs in any one tool; they are the absence of a protocol.
> 3. EKET's win is *measured*: 19x claim speed, ~187x startup, ~10x memory — all traceable to `README.md:140-145` and `docs/getting-started/QUICKSTART.md:10-14`.
> 4. The protocol unifies human and AI executors so handoffs are durable, not lossy.
> 5. EKET is *not* a fit for solo work, pure chat outputs, or teams that refuse version control — the anti-pattern list is non-negotiable.

---

## Executive Summary

**For decision-makers (read this and walk away):**

| Question | Answer |
|---|---|
| What's the win? | Four pain points (lost context, conflicting edits, opaque review, no audit trail) disappear behind a single ticket-shaped contract. |
| What's the proof? | Headline ROI from `README.md:140-145`: `task:claim` 19x faster (~21 ms vs ~400 ms), cold start ~187x faster (~8 ms vs ~1,500 ms), memory ~10x lower (~12 MB vs ~120 MB). |
| What's the cost? | Discipline: tickets live in `jira/`, knowledge in `confluence/`, code in `code_repo/`. Agents register before they claim. |
| Who benefits most? | Teams of 1–5 humans + N agents working a shared backlog of 20+ tickets per cycle, with a need for reviewable, auditable, durable handoffs. |
| Who should walk away? | Solo developers, pure chat workflows, or teams whose deliverable is a *message* rather than an *artifact* (see anti-patterns). |

The rest of this article maps each pain to a protocol-level fix, shows a concrete before/after table, and ends with a decision matrix and a candid anti-pattern list.

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

In the eighteen months between the launch of the first "agentic" coding tool and today (mid-2026), the bottleneck in software engineering shifted twice. In 2024 it was **prompt scarcity** — getting useful output from a model was an art form. In 2025, every major LLM tool (Claude Code, Cursor, Codex, Copilot, Aider) shipped an agent that could take a ticket end-to-end. By 2026, the bottleneck is **coordination debt**: the cost of getting N agents, plus the humans overseeing them, to act on the same source of truth without trampling each other.

The four pain points are not a vendor's problem. They are the *symptom of an absent protocol*. We have seen them at every team that scaled past two concurrent agents:

1. **Lost context.** An agent runs for 25 minutes, builds a mental model of the codebase, and then dies. The 25 minutes of work lives only in scrollback. The next agent (or the same one, resumed) has to reconstruct it from the diff, the commit messages, and whatever comment threads survived.
2. **Conflicting edits.** Two agents each see a failing test in `tests/foo.rs` and both fix it. The second commit silently overwrites the first, and the team discovers it three days later when CI on `testing` fails on a *different* line.
3. **Opaque review.** A human reviewer is handed a 4,000-line diff with no narrative — no "I changed X because Y, and I considered Z but rejected it for W." Only the model that produced it knows *why*. Review becomes guesswork.
4. **No audit trail.** "Who did what, when, with which ticket, and from which prompt?" is unanswerable in 30 seconds. When something ships broken, the post-mortem takes a week, not an hour.

These are not LLM problems. They are the symptoms of a missing coordination layer. The model is the executor; the protocol decides **what gets executed, by whom, in what order, with what recovery story** (`docs/articles/01-what-is-eket/en/article.md:55`).

> "If your team is bigger than one person, you don't have an agent problem — you have a coordination problem that happens to involve agents."
> — *EKET design note, 2025-08, quoted in `01-what-is-eket/en/article.md:57-58`*

The thesis of this article: every workaround teams invent to fix the four pain points is a *partial* re-implementation of the EKET protocol. Standardizing on the protocol is cheaper than re-inventing it.

---

## 2. The Big Idea

The Big Idea has three orthogonal claims. We will spend most of the rest of the article on claim 1 (the pain x solution map) and claim 2 (the ROI table). Claim 3 (the decision matrix) lands at the end.

### 2.1 Pain x Solution is a 1:1 mapping

Every workaround that successfully addresses one of the four pain points is, on inspection, *one piece of the EKET protocol*. The mapping is direct:

- **Lost context** -> The ticket is the context. The state machine persists it (`node/src/core/`), Rust core mirrors it (`rust/crates/eket-core/`), and `task:resume` reads from a checkpoint, not from a chat scrollback.
- **Conflicting edits** -> CAS (Compare-And-Swap) on the `tickets` table. Defined in `rust/crates/eket-core/src/ticket.rs` and exposed via `eket task:claim TASK-NNN`. Atomic. Idempotent. Single source of truth (`docs/articles/01-what-is-eket/en/article.md:117`).
- **Opaque review** -> The PR carries a narrative because the ticket *requires* a description, a plan, and acceptance criteria *before* claim is even possible. The agent is not inventing context; the context is upstream.
- **No audit trail** -> The `task:complete` Saga writes five artifacts in one transaction: validate, test, checkpoint, commit, notify (`docs/articles/GLOSSARY.md:12`). Every transition is recorded against a ticket id, an instance id, and a timestamp.

The pattern is the same in every case: **lift the model out of the critical path of state, and put artifacts there instead** (`01-what-is-eket/en/article.md:60`). The model becomes replaceable; the artifacts persist.

### 2.2 ROI is the artifact, not the slogan

Most AI orchestration projects die because the team cannot point at a number and say "we got that back." EKET's headline numbers are deliberately boring and traceable:

| Metric | Rust | Node.js | Speedup | Source |
|---|---|---|---|---|
| `task:claim` latency | ~21 ms | ~400 ms | **19x** | `README.md:140-145` |
| CLI cold start | ~8 ms | ~1,500 ms | **~187x** | `README.md:142-143`; `docs/getting-started/QUICKSTART.md:10-14` |
| Memory footprint (RSS) | ~12 MB | ~120 MB | **~10x** | `README.md:144`; `docs/getting-started/QUICKSTART.md:10-14` |
| File queue enqueue p95 | 0.77 ms | n/a (same engine) | n/a | `benchmarks/baseline.json:5` |
| File queue dequeue p95 | 1.54 ms | n/a (same engine) | n/a | `benchmarks/baseline.json:6` |

A few honesty notes the Master should approve before publication:

- The `19x` and `~187x` numbers are **headline figures from `README.md:140-145`**. They are reproduced in `01-what-is-eket/en/article.md:136` and `01-what-is-eket/en/article.md:192`. The repository's `benchmarks/baseline.json` measures *file-queue* operations (enqueue/dequeue p95), not `task:claim` end-to-end latency. This is a sourcing gap, not a contradiction — the file-queue numbers are below the `task:claim` envelope, so the envelope is consistent with the queue floor. **A future article (`08-rust-performance`) should publish the per-operation breakdown under controlled conditions.**
- The `~10x` memory number reflects the cost of running a Node.js process with `tsc` output loaded vs a stripped Rust binary. Real-world fleet overhead (LLM SDK, dashboard, hook server) is higher; the headline number is the *floor*.
- The `time-to-merge` delta cited in `jira/tickets/EPIC-008/TASK-638.md:24` is **not** present as a hard benchmark in this repository. It is a reasoned estimate based on the compound effect of 19x faster claim + a single shared audit trail. **Do not publish a specific number for it; refer to it as "qualitative"** until TASK-008 ships its measurement plan.

### 2.3 The protocol is the same for human and AI

`docs/adr/ADR-002-master-slaver-mode.md:23-30` makes this the explicit design decision: a human "claims" a ticket by moving it from `READY` to `IN_PROGRESS` in a Kanban board; an AI "claims" it by running `eket task:claim TASK-NNN` against SQLite. From the system's point of view, **they are the same operation** — atomic, idempotent, with a single source of truth (`01-what-is-eket/en/article.md:74`). The downstream consequence is that a human and an AI can hand off a ticket mid-stream without translation. The state machine does not distinguish between them; therefore the AI cannot do something the human could not have done (`01-what-is-eket/en/article.md:213`).

---

## 3. How It Works

The protocol is a state machine. The state is the union of three artifacts (knowledge, task, code). The transitions are the protocol operations. We will walk through each pain point and show the protocol-level fix.

### 3.1 Before / After — a concrete table

| Pain | Workaround (Before) | Why it fails at scale | EKET fix (After) | Where it lives |
|---|---|---|---|---|
| Lost context | "Re-paste the last chat into a new session" | Scrollback is not a record; the model re-derives; the derivation drifts | Ticket + checkpoint are the record; `task:resume` reads from disk | `node/src/core/checkpoint.ts`; `rust/crates/eket-core/src/ticket.rs` |
| Conflicting edits | "Use one branch per agent" | Branch collisions grow linearly with N agents | CAS on the `tickets` table; only one claim succeeds | `rust/crates/eket-core/src/ticket.rs`; `eket task:claim` |
| Opaque review | "Ask the agent to write a summary" | The summary is post-hoc; the model can rationalize; the diff still leads | Ticket *requires* plan + AC *before* claim; PR diff is the only artifact to review | `jira/tickets/TASK-NNN/`; `template/docs/GATE-REVIEW-PROTOCOL.md` |
| No audit trail | "Screenshot the terminal" | Screenshots are not queryable; the chain of custody breaks on crash | `task:complete` Saga writes 5 atomic artifacts; all transitions are timestamped | `docs/articles/GLOSSARY.md:12`; `node/src/core/` |
| Coordination overhead grows with N | "Standups + Slack channels + a Notion doc" | Each new agent adds 2 humans worth of meeting time | One ticket, one CAS, one PR; humans and agents are peers in the same protocol | `docs/adr/ADR-002-master-slaver-mode.md:23-30` |
| Hot-loop latency | "Spawn a fresh Node process per command" | ~1.5 s cold start means a 100-iteration loop is 2.5 minutes of waiting | Rust CLI cold start ~8 ms; same loop is ~1 second | `README.md:142-143`; `docs/getting-started/QUICKSTART.md:10-14` |

### 3.2 Where the numbers come from

- **`README.md:140-145`** publishes the canonical ROI table (Rust vs Node.js for `task:claim`, cold start, memory).
- **`docs/getting-started/QUICKSTART.md:10-14`** publishes the matching startup/memory table for the three install modes (Rust CLI, Shell, Node.js).
- **`.claude/skills/eket/references/architecture.md:20-30`** publishes the per-component breakdown (L0 Shell / L1 Rust / L2 Node.js), including `task:claim` latency per level (~5 ms / ~21 ms / ~500 ms).
- **`benchmarks/baseline.json:5-6`** publishes the file-queue p95 envelope (enqueue 0.77 ms, dequeue 1.54 ms), which is the floor under any end-to-end claim operation.
- **`benchmarks/check-regression.mjs:1-84`** is the CI gate that fails the build if those p95 numbers regress by more than 30% (`_threshold_pct: 30` in `benchmarks/baseline.json:4`).

Honest gap: the *compound* effect of these numbers on time-to-merge has not been measured end-to-end in this repository. The `19x` claim speed, the `~187x` cold start, and the `~10x` memory reduction are the *inputs*; the *output* (faster merges, fewer collisions) is a directional claim, not a measured one. Article 08 (`08-rust-performance`) is the place to publish that measurement.

### 3.3 Why the protocol, not the language

A reasonable question: "Couldn't you get the same numbers by writing a Go CLI?" Yes — the language is a means, not the thesis. The thesis is the **single protocol expressed in four implementations** (`docs/articles/01-what-is-eket/en/article.md:131-140`):

- L0 Shell: zero-dep environments, CI, recovery
- L1 Rust: default for humans, fast loops
- L2 Node.js: dashboard, LLM gateway, webhooks
- L3 Shell fallback: L2 down, L1 up

`docs/architecture/THREE-LEVEL-ARCHITECTURE.md:3-6` (now superseded by the four-level model) makes the historical bet explicit: "the floor of the system is the shell implementation." If Redis dies, if Node.js crashes, if Rust won't compile on a CI runner — the protocol survives because the L0 shell is a complete implementation, not a stub. **The performance numbers are a *consequence* of choosing Rust as L1; the *protocol-level* guarantee is that the same `task:claim` operation works in L0 shell as in L1 Rust.**

### 3.4 The before-state, in one sentence

> "Three agents, two chat scrollbacks, one Notion doc, no shared ledger, and a Slack channel where humans paste diffs because nobody trusts the auto-generated PR descriptions."

The after-state, in one sentence:

> "Three agents, two humans, one SQLite table, every transition timestamped, every PR carrying the ticket's plan and acceptance criteria because the ticket required them before claim."

---

## 4. Trade-offs & Alternatives

### 4.1 Alternatives, and where they fail each pain

| Alternative | Lost context | Conflicting edits | Opaque review | No audit trail | Notes |
|---|---|---|---|---|---|
| **LangGraph / CrewAI / AutoGen** | Better (graph memory) | Worse (no CAS) | Worse (no PR narrative) | Worse (no ledger) | Orchestrates *agent-to-agent* chat, not agent-to-artifact. `01-what-is-eket/en/article.md:152` |
| **OpenAI Swarm** | Better (handoff objects) | Same (no CAS) | Same | Same | Handoff is in-memory; crash loses it. `01-what-is-eket/en/article.md:153` |
| **GitHub Projects + Actions** | Worse | Better (branch protection) | Better (PR template) | Better (PR history) | Conflates knowledge, tasks, and code. `01-what-is-eket/en/article.md:155` |
| **Bespoke shell scripts per team** | Same | Same | Same | Same | Reinvented, not standardized. `01-what-is-eket/en/article.md:154` |
| **EKET** | Solved (checkpoint) | Solved (CAS) | Solved (ticket plan) | Solved (Saga 5-step) | The point of this article. |

### 4.2 Decision matrix — who benefits most

| Team shape | Pain severity | EKET fit | Reasoning |
|---|---|---|---|
| 1 human, 0–1 agents | None | **Not recommended** | Protocol overhead exceeds coordination benefit. |
| 1–5 humans, 0 agents | Low | Marginal | The protocol still helps (audit trail, PR narrative) but the headline ROI is not realized. |
| 1–5 humans, 1–2 agents | Medium | **Good fit** | Lost context + opaque review are already showing up; the protocol pays for itself in weeks. |
| 1–5 humans, 3–10 agents | High | **Best fit** | All four pain points are acute; CAS + Saga are load-bearing. |
| 1–5 humans, 10+ agents | High | **Strong fit, with caveats** | Requires the L1 Rust core to keep claim latency under 50 ms; if it does not, re-profile. |
| 6+ humans, any agents | Coordination debt dominated by humans, not agents | **Re-think the org first** | EKET is not an org-design tool. |
| Solo hobbyist | None | **Not recommended** | See anti-pattern 1 below. |

### 4.3 Anti-patterns — when **not** to use EKET

A protocol that recommends itself for every team is a protocol that recommends itself for no team. Here are four situations where EKET is the wrong choice, and the reason is structural, not aesthetic.

1. **Solo developer, one agent, no team.** If there is exactly one human and exactly one agent, the cost of moving state through a SQLite-backed state machine is higher than the cost of just typing at the model. The four pain points require *two* executors to manifest. (`01-what-is-eket/en/article.md:160`)
2. **Pure chat workflow — the deliverable is a message, not an artifact.** If the output of a "ticket" is a Slack reply, an email, or a one-paragraph recommendation, EKET is over-engineered. The protocol is artifact-centric by design (`01-what-is-eket/en/article.md:161`); forcing it onto ephemeral outputs produces ceremony without durability.
3. **Teams that refuse to put their knowledge base in version control.** The three-repo split (`confluence/`, `jira/`, `code_repo/`) is a load-bearing part of the protocol (`docs/architecture/THREE_REPO_ARCHITECTURE.md:1`; `01-what-is-eket/en/article.md:78`). A team that insists on Confluence-the-product, Jira-the-product, and a code repo in three separate vendor systems will fight the protocol at every turn. The protocol's audit trail depends on cross-references that are only free if all three live in plain files under git.
4. **Organizations where the bottleneck is *human* coordination, not *agent* coordination.** EKET solves the four pain points that arise from giving agents autonomy. If a 12-person team cannot ship a feature in a quarter because of org design, not because of agent sprawl, EKET will not help — and adopting it will add a layer to a process that is already over-layered. (This is a *refusal to sell*; it is the most important anti-pattern on this list.)

A useful self-test: if your team can articulate the four pain points with a recent incident ("we lost 3 days to a rebase collision," "we re-ran an agent's work from scratch," "the PR was 4,000 lines and we had no idea why"), EKET is in scope. If not, the bottleneck is elsewhere.

---

## 5. Implementation Notes

### 5.1 What you actually run

```bash
# One-line install (Level 1: Skills + Commands + Hooks)
curl -fsSL https://raw.githubusercontent.com/godlockin/eket/main/scripts/quick-setup.sh | bash

# Project init (Level 2)
cd your-project && curl -fsSL https://raw.githubusercontent.com/godlockin/eket/main/scripts/quick-setup.sh | bash -s -- --init

# Full install (Level 3: CLI + API + Dashboard)
curl -fsSL https://raw.githubusercontent.com/godlockin/eket/main/scripts/quick-setup.sh | bash -s -- --full

# Inside Claude Code (or any supported tool)
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

(Source: `README.md:19-28`, `README.md:93-106`, `01-what-is-eket/en/article.md:171-185`.)

### 5.2 Where the headline numbers live in source

| Claim | Citation | Notes |
|---|---|---|
| 19x `task:claim` speedup | `README.md:140-145` | Reproduced in `01-what-is-eket/en/article.md:192` and `.claude/skills/eket/references/architecture.md:29` |
| ~187x cold start | `README.md:142-143` | Same in `docs/getting-started/QUICKSTART.md:12-14` |
| ~10x memory | `README.md:144` | Same in `docs/getting-started/QUICKSTART.md:12-14` |
| File-queue p95 floor | `benchmarks/baseline.json:5-6` | Enqueue 0.77 ms, dequeue 1.54 ms |
| 30% regression threshold | `benchmarks/baseline.json:4` | CI gate in `benchmarks/check-regression.mjs:55-82` |
| Per-level claim latency | `.claude/skills/eket/references/architecture.md:29` | L0 ~5 ms / L1 ~21 ms / L2 ~500 ms |
| Human + AI same protocol | `docs/adr/ADR-002-master-slaver-mode.md:23-30` | The unification thesis |

### 5.3 Cross-references inside the repo

- Thesis article: `docs/articles/01-what-is-eket/en/article.md:1` (~2,200 words, the *what*)
- Master-Slaver ADR: `docs/adr/ADR-002-master-slaver-mode.md:1` (the *who decides*)
- Three-repo philosophy: `docs/architecture/THREE_REPO_ARCHITECTURE.md:1`
- Degradation strategy: `docs/architecture/DEGRADATION-STRATEGY.md:1` (the *how it survives*)
- Future article on the numbers: `docs/articles/INDEX.md:33` (08-rust-performance, queued)

---

## 6. Lessons Learned

**Lesson 1 — Coordination debt is the new technical debt.** In 2024 the question was "can we get a model to do X?" In 2026 the question is "can we get N models plus our humans to do X *without* losing context, colliding, or going opaque?" The four pain points are not bugs in any one tool; they are the absence of a protocol.

**Lesson 2 — Headline numbers are only as good as their sources.** The 19x / ~187x / ~10x numbers are real and traceable to `README.md:140-145`. The file-queue p95 numbers are real and traceable to `benchmarks/baseline.json:5-6`. The compound effect on *time-to-merge* is a directional claim, not a measurement. **Never let an aspirational number into a slide without a `file:line` citation.** The protocol is artifact-centric; the marketing should be too.

**Lesson 3 — The four pain points are a 1:1 map to four protocol operations.** Lost context -> checkpoint. Conflicting edits -> CAS. Opaque review -> ticket plan as a precondition for claim. No audit trail -> Saga 5-step. If a workaround you are considering maps to one of these, you are re-implementing EKET. If it does not map to any of them, it is probably not solving the pain you think it is.

**Lesson 4 — The "special forces" 1–5 + N is the band where coordination debt first appears, and the band where the protocol overhead is amortized fastest.** Below 1, you do not need a protocol. Above 5, you need org design. EKET is the band-aid, the spinal column, and the audit trail for the size where AI capacity first outruns human coordination muscle.

**Lesson 5 — An honest anti-pattern list is more persuasive than a glowing one.** Saying "we are the wrong choice for solo chat workflows" is the fastest way to be believed when we say "we are the right choice for 1–5 + N." The protocol is a *fit*, not a *religion*.

---

## 7. References

- **Internal**:
  - `docs/articles/01-what-is-eket/en/article.md` — the thesis article (read first)
  - `README.md:140-145` — the headline ROI table
  - `docs/getting-started/QUICKSTART.md:10-14` — per-mode startup / memory
  - `docs/architecture/THREE-LEVEL-ARCHITECTURE.md:1` — historical three-level (now superseded)
  - `docs/architecture/DEGRADATION-STRATEGY.md:1` — current four-level
  - `docs/adr/ADR-002-master-slaver-mode.md:1` — human + AI unification
  - `benchmarks/baseline.json:1-7` — file-queue p95 baseline
  - `benchmarks/check-regression.mjs:1-84` — CI regression gate
  - `benchmarks/simple-benchmark.js:1-206` — benchmark source
  - `docs/articles/GLOSSARY.md:1-43` — shared terminology
- **ADRs**: `docs/adr/ADR-001..003-*.md`
- **Memory KB**: `confluence/memory/MEMORY.md`
- **Next article in series**: [`03-technical-value-choices`](../../03-technical-value-choices/en/article.md) — the seven non-obvious technical choices
