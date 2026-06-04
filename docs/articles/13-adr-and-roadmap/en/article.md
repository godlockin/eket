# 13 — ADR and Roadmap: Three Decisions, Twelve Months

> **TL;DR** — This article does two things and does them on the same page. First, it walks through the three Architecture Decision Records EKET has already accepted: ADR-001 (four-level degradation, the L0 investment), ADR-002 (Master-Slaver mode, the human-AI unification), and ADR-003 (file-queue fallback, the L0 implementation). Each ADR is summarized as **context / decision / consequences**, with the same wording the original decision-makers used. Second, it lays out a 12-month roadmap built from those decisions, with **3 phases, exit criteria stated as numbers, and at least 4 risks that name a mitigation action, not a hope**. The meta-thesis: an ADR is a contract between the team and its future self; a roadmap is a contract between the framework and its users. Both contracts are kept or broken at the moment of the next incident, not at the moment of the next blog post.

> **Key Takeaways**
> 1. EKET has **3 accepted ADRs** as of v2.19.0-beta (`docs/adr/ADR-001-four-level-degradation.md:1`, `docs/adr/ADR-002-master-slaver-mode.md:1`, `docs/adr/ADR-003-file-queue-fallback.md:1`); the next 3 are sketched as candidate ADRs in the Open Questions section.
> 2. An ADR is for a **load-bearing decision** — one whose reversal would force a rewrite. ADR-001, 002, 003 all clear that bar. ADR for "we picked library X over Y" usually does not.
> 3. The Master-Slaver unification (ADR-002) is the **only** decision in this set whose reversal would change the entire protocol, not just the implementation. Everything else degrades gracefully; this one doesn't.
> 4. The 12-month roadmap is **deliberately not a feature wishlist**. Each phase has one exit number; the whole plan assumes the L0 floor keeps working when nothing else does (`docs/adr/ADR-003-file-queue-fallback.md:111-117`).
> 5. The "risks to the roadmap" section names **what could invalidate the plan** — not what could be inconvenient. Each risk carries a concrete mitigation action that the team can take before the next quarter.

---

## Executive Summary

**For decision-makers (read this and walk away):**

| Question | Answer |
|---|---|
| What's the article for? | To summarize the 3 ADRs EKET has accepted and the 3 it is likely to accept next, and to publish a 12-month roadmap whose phases have numeric exit criteria. |
| Why read it? | Because the cost of an LLM-based framework in 2026 is **not** model quality — it is the cost of keeping a coherent shape when the underlying LLM tool, the host, and the team all change. The ADRs are that shape; the roadmap is how it evolves. |
| What is the headline? | The 3 ADRs are stable, the L0 floor is load-bearing, and the next 12 months are about **durability and observability** — not about adding LLM tools. |
| What is the cost of the roadmap? | 3 phases of 4 months each, with 3 explicit exit numbers per phase. Failing an exit number is a trigger to revise the plan, not to revise the ADRs. |
| What is the risk if the ADRs are reversed? | ADR-001 reversed: the L0 floor disappears, and the day Redis flaps, the team reverts to Slack threads. ADR-002 reversed: the protocol splits into "human mode" and "AI mode," and the bug class that EKET exists to prevent re-appears. ADR-003 reversed: the bottom of the four-level ladder collapses, and "four levels" becomes "three levels" with the same gap the historical three-level model had (`docs/architecture/THREE-LEVEL-ARCHITECTURE.md:1-3`). |

The rest of this article explains what an ADR is for, summarizes the three existing ones, sketches the next three, lays out the phases, and ends with the four risks that could invalidate the plan.

---

## Table of Contents

1. Motivation — why ADR + roadmap in one article
2. What is an ADR — when to write one, when not to
3. ADR-001 — Four-level degradation (the L0 investment)
4. ADR-002 — Master-Slaver mode (the human-AI unification)
5. ADR-003 — File-queue fallback (the L0 implementation)
6. Open questions — 3 candidate ADRs for the next 12 months
7. 12-month roadmap — 3 phases with exit criteria
8. Risks to the roadmap — what could invalidate the plan
9. References

---

## 1. Motivation — why ADR + roadmap in one article

Two documents are usually written by different people at different times: the ADR, which encodes **why a decision was made**, and the roadmap, which encodes **what gets built next**. They are linked, but they are usually written as if they were not. The decision-makers sign the ADR; the project managers sign the roadmap; the two audiences rarely read each other's documents.

This article puts them on the same page, in this order: **decision-makers first, planners second, risk-namers third.** The argument is that the ADRs *are* the constraint set for the roadmap. A roadmap that contradicts an accepted ADR is either wrong or trying to reverse the ADR. A roadmap that ignores an ADR is wishful thinking.

Three things make this article non-redundant with the existing docs:

- **`docs/articles/05-four-level-degradation/en/article.md:1-314`** explains the four-level model in detail. Article 13 treats it as a decision, not as a description.
- **`docs/articles/06-master-slaver-protocol/en/article.md:1-535`** explains the state machine in detail. Article 13 treats it as a decision.
- **`docs/roadmap/README.md:1-46`** is the existing short-form roadmap. Article 13 is a long-form, evidence-anchored version that an architect or a new contributor can read without spelunking through `docs/archive/roadmap-history/`.

The structure of the article follows the ticket: ADR primer, three existing ADRs, three candidate ADRs, three phases, four risks, references. Each ADR section is shaped the same way (context / decision / consequences) so the reader can compare them. The risk section names a mitigation action for every risk, because a risk without a mitigation is a worry, not a risk.

> "An ADR is the contract a team signs with its future self. A roadmap is the contract the framework signs with its users. Both contracts are tested at the moment of the next incident, not at the moment of the next review."
> — *EKET design note, 2026-04*

---

## 2. What is an ADR — when to write one, when not to

An Architecture Decision Record (ADR) is a short document that captures **one decision, the context that forced it, and the consequences of taking it.** The format popularized by Michael Nygard and used by ThoughtWorks, AWS, and the CNCF has the same skeleton: title, status, context, decision, consequences. EKET's ADRs follow the same skeleton (`docs/adr/ADR-001-four-level-degradation.md:1-6`, `docs/adr/ADR-002-master-slaver-mode.md:1-6`, `docs/adr/ADR-003-file-queue-fallback.md:1-6`).

A useful self-test for "should this be an ADR?" is the **reversal-cost test.** If a future engineer reversed the decision tomorrow, would they have to rewrite the protocol, or would they have to rewrite a library? The first case is an ADR candidate; the second case is a config change.

| Decision | Reversal cost | ADR-worthy? |
|---|---|---|
| "Use SQLite, not Postgres, for ticket state" | Rewrite the storage layer, the migration path, the `tmp → rename` mirror in `rust/crates/eket-core/src/ticket.rs:100-103` | **Yes** — embedded in the architecture but documented in `docs/articles/03-technical-value-choices/en/article.md:71-105` rather than as a standalone ADR |
| "Use SQLite, not Postgres" for ticket state when you have a *cross-host write* workload | Rewrite the state machine, the master election, the L4 ladder in `docs/adr/ADR-001-four-level-degradation.md:32-42` | **Yes — and not yet decided** (see Open Questions §6.1) |
| "Use the `axum` crate, not `warp`" for the HTTP server | Swap one Cargo dependency | **No** — belongs in a `rust/crates/eket-server/Cargo.toml` comment, not in an ADR |
| "Use the `serde_json::json!` macro in tests" | Delete the line, use a different macro | **No** — a code review comment |
| "Master never claims tickets" | Change the role check in `protocol/state-machines/ticket-status.yml:14-91`; audit every past claim | **Yes — and already encoded** in ADR-002's consequences (`docs/adr/ADR-002-master-slaver-mode.md:127-146`) |

The pattern: ADRs are for decisions whose **reversal cost is protocol-level**, not code-level. Library choices, macro choices, dependency choices are below the ADR line. Cross-cutting constraints that touch the state machine, the role rules, the recovery story, or the deployment topology are above the line.

A second self-test: **would a senior engineer joining the team in six months re-derive this decision correctly from the code alone?** If yes, the ADR is documentation, not decision-making. If no, the ADR is decision-making. The three ADRs in `docs/adr/ADR-001..003-*.md` all pass the second test — a future engineer could not re-derive "why four levels and not three" or "why Master/Slaver and not flat" from the code alone. They would re-derive a *different* decision, and arrive at a different protocol.

A third self-test, more delicate: **does the decision constrain a *future* choice?** ADR-001 constrains the future choice "where does the file queue live?" by committing to "L0 is shell, L3 is the same shell under a different trigger." ADR-002 constrains the future choice "do we add a 'reviewer' role?" by committing to "Master is the only role that can transition `review → gate_review`." ADR-003 constrains the future choice "can we drop the file queue in v4?" by committing to "the file queue is the only zero-dependency option in the four-level ladder." Constraints on future choices are the load-bearing test of an ADR.

The converse is also useful: **do not write an ADR for** a decision that has no future. "We chose to use JSON for the wire format" is a decision whose reversal would touch every endpoint; it is protocol-level; but if the team plans to keep JSON until the project ends, the decision is stable and the ADR is paperwork. ADRs earn their keep when the decision is **load-bearing and revisitable**.

---

## 3. ADR-001 — Four-level degradation (the L0 investment)

**Status:** Accepted (`docs/adr/ADR-001-four-level-degradation.md:3`).
**Date:** 2026-03-26.
**Deciders:** EKET Framework Team.
**Why it is in this article:** It is the decision that makes "the L0 floor" a thing.

### Context

The framework has to run on heterogeneous infrastructure. Some projects ship to enterprise environments with a remote Redis cluster. Some run on developer laptops with a local Redis. Some run on CI runners with Redis forbidden by policy. The first attempt — a "Redis-or-bust" design — failed the moment a CI runner rejected the connection: the agent loop stopped, the ticket state went stale, the human on call got paged. The team needed a connection strategy that **degraded gracefully** rather than halted (`docs/adr/ADR-001-four-level-degradation.md:9-27`).

### Decision

Ship **four** connection backends, ranked by capability: remote Redis (Level 1) → local Redis (Level 2) → local SQLite (Level 3) → local filesystem (Level 4) (`docs/adr/ADR-001-four-level-degradation.md:32-42`). Detect at startup; fall back automatically; **support upgrade** when the higher backend comes back (`docs/adr/ADR-001-four-level-degradation.md:58-61`). The driver is a `ConnectionManager` whose public surface is a single `initialize()` call; the level that succeeds first becomes the active level, and the rest are wired in for fallback.

The four-level ladder is not the same as the four-runtime ladder (L0/L1/L2/L3) published in `docs/articles/05-four-level-degradation/en/article.md:100-105`. The first is the *connection* ladder inside the L1/L2 runtime; the second is the *runtime* ladder visible to operators. They compose (`docs/articles/05-four-level-degradation/en/article.md:151-152`).

### Consequences

**Positive** (`docs/adr/ADR-001-four-level-degradation.md:90-96`):

- High availability across the deployment spectrum: enterprise, dev, CI, edge.
- Transparent fallback: upper-layer code does not change between Level 1 and Level 4.
- Automatic upgrade when the higher backend recovers.

**Negative** (`docs/adr/ADR-001-four-level-degradation.md:97-102`):

- Four implementations to test; the per-level test matrix is non-trivial.
- Performance variance: remote Redis ~1 ms, file queue ~20 ms (`docs/adr/ADR-003-file-queue-fallback.md:127-131`).
- Maintenance tax: every backend has its own bug surface.

**Mitigations adopted in the ADR** (`docs/adr/ADR-001-four-level-degradation.md:103-107`): unified interface abstraction; automated test coverage of all degradation paths; runtime stats and alerts on fallback events.

**What the reversal would cost:** the L4 file-queue floor disappears, and the system's claim that "a fresh container with `bash` can keep the protocol alive" (`docs/articles/01-what-is-eket/en/article.md:135-140`) becomes false. The "operational cost of the floor" trade-off is the price of availability, and the ADR is the record that the team agreed to pay it (`docs/articles/05-four-level-degradation/en/article.md:204-211`).

---

## 4. ADR-002 — Master-Slaver mode (the human-AI unification)

**Status:** Accepted (`docs/adr/ADR-002-master-slaver-mode.md:3`).
**Date:** 2026-03-26.
**Deciders:** EKET Framework Team.
**Why it is in this article:** It is the decision that makes the protocol the same for humans and AI.

### Context

Multiple agent instances (human or AI) need to coordinate on a shared backlog without colliding, without a single point of failure, and with a single audit trail. The four questions the team had to answer: how is work assigned, how are conflicts avoided, who makes final decisions, how is state synchronized (`docs/adr/ADR-002-master-slaver-mode.md:13-19`).

### Decision

Adopt a **Master/Slaver** architecture: one Master per project coordinates, breaks down requirements, creates tickets, reviews PRs, and resolves conflicts; N Slavers (humans or AI) claim, execute, and report. Roles are encoded on the **transition**, not on the actor (`docs/adr/ADR-002-master-slaver-mode.md:24-39`, `protocol/state-machines/ticket-status.yml:14-91`). Master election uses a three-step ladder (Redis SETNX → SQLite row lock → `mkdir` lock) with a 30 s lease and 15 s renewal (`docs/adr/ADR-002-master-slaver-mode.md:77-89`).

The unification thesis — a human claim and an AI claim are the **same operation** from the database's point of view — is the part that the rest of the protocol depends on. It is the reason a human and an AI can hand off a ticket mid-stream without translation (`docs/articles/01-what-is-eket/en/article.md:74-75`).

### Consequences

**Positive** (`docs/adr/ADR-002-master-slaver-mode.md:129-135`):

- Clear role boundaries: each instance knows its job.
- No conflict on ticket claims: a single SQL `UPDATE` with a `WHERE state = 'ready' AND assignee IS NULL` clause decides.
- Traceability: every transition records the role on the row.
- Efficient division of labor: Slaver executes, Master decides.

**Negative** (`docs/adr/ADR-002-master-slaver-mode.md:136-141`):

- Master is a single point of failure for *decisions*; if the Master is down, no new tickets are created and no reviews happen.
- Election overhead, especially at scale.
- All instances must support role switching.

**Mitigations adopted in the ADR** (`docs/adr/ADR-002-master-slaver-mode.md:142-146`): automatic re-election on lease expiry; declaration period (2 s) to prevent split-brain; degraded election to SQLite and file-system locks when Redis is down.

**What the reversal would cost:** the protocol would split into a "human mode" and an "AI mode," and the bug class that the unification is designed to prevent — "the AI did something the human could not have done" — would reappear. The same-protocol invariant in `docs/articles/01-what-is-eket/en/article.md:131-140` would no longer hold. **This is the only ADR in the set whose reversal would change the protocol, not just the implementation.**

The Master/Slaver terminology has historical baggage (`docs/adr/ADR-002-master-slaver-mode.md:190-195`); the team has acknowledged the question and noted that "Coordinator/Worker" is a candidate replacement. The terminology is not load-bearing; the role separation is.

---

## 5. ADR-003 — File-queue fallback (the L0 implementation)

**Status:** Accepted (`docs/adr/ADR-003-file-queue-fallback.md:3`).
**Date:** 2026-03-26.
**Deciders:** EKET Framework Team.
**Why it is in this article:** It is the decision that makes the L0 floor *concrete*, not aspirational.

### Context

The four-level degradation model needs a Level 4 backend. The constraint is hard: the Level 4 backend must run with **zero external dependencies** and must be **safe under concurrent writers** from multiple Slaver processes. The candidates the team considered: in-memory queue, SQLite-only, message middleware, and a file-based queue. The first three fail the "zero deps" or "recoverable after crash" property (`docs/adr/ADR-003-file-queue-fallback.md:13-21`).

### Decision

Ship a **file-based message queue** with three structural properties:

1. **Atomic write** via the `tmp → rename` pattern (`docs/adr/ADR-003-file-queue-fallback.md:42-53`). A message is first written to a temporary file, then renamed to its final name in a single `fs.renameSync` call. The rename is atomic on POSIX filesystems, so the message is either fully written or not written.
2. **File lock** via `mkdir` (`docs/adr/ADR-003-file-queue-fallback.md:55-66`). `fs.mkdirSync(lockFile, { recursive: false })` is atomic on POSIX; only one process can hold the lock at a time.
3. **CRC32 checksum** on every message (`docs/adr/ADR-003-file-queue-fallback.md:68-85`). On read, the checksum is verified before the message is processed; a corrupted message is quarantined.

The directory layout is `pending/` → `processed/YYYY-MM-DD/` → `archive/` (`docs/adr/ADR-003-file-queue-fallback.md:28-40`); the layout is human-readable, so the queue is also the audit trail.

### Consequences

**Positive** (`docs/adr/ADR-003-file-queue-fallback.md:113-117`):

- Final-reliability property: the queue works when no other service is available.
- Debuggable: every message is a file on disk that an operator can `cat`.
- Simple deployment: no extra service, no extra port.

**Negative** (`docs/adr/ADR-003-file-queue-fallback.md:119-123`):

- File I/O is 10-100× slower than memory.
- File lock can become a bottleneck under high contention.
- `processed/` accumulates and needs periodic cleanup.

**Performance floor** (`docs/adr/ADR-003-file-queue-fallback.md:125-131`): file write ~20 ms, file read ~10 ms, file delete ~5 ms. This is the floor of the system's end-to-end claim latency when the file queue is active; the rest of the system is bounded below by it.

**Mitigations adopted in the ADR** (`docs/adr/ADR-003-file-queue-fallback.md:133-137`): batch operations to amortize I/O; async writes to avoid blocking; periodic archival of `processed/` to prevent disk fill.

**What the reversal would cost:** the L4 backend disappears; the four-level model in ADR-001 becomes a three-level model with the same gap the historical three-level model had — no L3 fallback to absorb a L2 Node.js crash (`docs/articles/03-technical-value-choices/en/article.md:255-285`). The "recovery is `git clone`" property at `docs/articles/01-what-is-eket/en/article.md:217-218` depends on the file queue being there.

---

## 6. Open questions — 3 candidate ADRs for the next 12 months

The next 12 months will likely force 3 more decisions to the ADR bar. They are listed below in roughly the order they are likely to be needed. Each is sketched as **context / candidate decision / open question**, not as a finalized ADR.

### 6.1 ADR-004 candidate — Multi-host ticket state (the SQLite ceiling)

**Context.** The current state lives in a single SQLite file on a single host (`docs/articles/03-technical-value-choices/en/article.md:73-105`). The Master election uses Redis `SETNX` for cross-host coordination (`rust/crates/eket-core/src/election.rs:294`), but the **ticket claims do not cross hosts**. The ceiling is well-known: a team running 50 Slavers across 3 regions cannot use a single SQLite file.

**Candidate decision.** Adopt an event-sourced append-log on the file queue (the L4 backend in ADR-003) as the **authoritative cross-host state**, and treat each host's SQLite as a local cache. The ticket row is materialized from the append-log; the append-log is the source of truth.

**Open question.** Is the operational cost of running and reconciling the append-log lower than the cost of just running a single Postgres instance? The honest version of the answer is "we don't know yet, and the 1–5 + N on a single host workload does not need cross-host state, so the ADR can wait." It becomes urgent when the second host joins.

### 6.2 ADR-005 candidate — PII redaction policy (the audit-trail tax)

**Context.** The Saga 5-step completion writes 5 atomic artifacts (`docs/articles/GLOSSARY.md:12`). One of them is the `notify` step, which can include the diff, the test output, and the prompt. If a Slaver accidentally pulls a customer email address into a prompt, the prompt is now in the audit log forever. This is a compliance problem the day a regulated industry (finance, healthcare, defense) tries EKET.

**Candidate decision.** Adopt a **two-tier redaction policy**: redacted content goes into the audit log, full content goes into a separately-keyed, ACL-gated store. The default is "redact at the Slaver, not at the storage layer." The candidate redaction library is regex-based for the first cut, with a learned model as a v2.

**Open question.** Is regex-redaction good enough for the v1 cut, or do we need a learned model from day one? The honest answer depends on what kind of PII the Slaver is likely to see; for a Slaver that only reads code, regex is probably enough. For a Slaver that reads customer support tickets, it is not.

### 6.3 ADR-006 candidate — LLM cost budget controls (the spend is a state)

**Context.** Each Slaver invocation can spend between $0.01 and $5 in API tokens, depending on the model and the prompt size. A Slaver loop that runs for 8 hours on a 50-Slaver fleet can spend more in a day than the rest of the infrastructure costs in a month. The "cost" is currently invisible to the protocol — it is a number on an OpenAI or Anthropic dashboard, not a column on the ticket row.

**Candidate decision.** Encode the **per-ticket cost budget** as a first-class field on the ticket, with hard and soft limits. The hard limit aborts the Slaver; the soft limit emits a warning and requires Master approval for the next step. The cost is recorded on the audit row, the same as `claimed_at` and `merged_at`.

**Open question.** Is the cost budget a per-ticket property, a per-Slaver property, or a per-day property? The first is simplest; the third matches how finance teams budget. The candidate decision defaults to per-ticket with a per-day override.

### 6.4 Other questions we are tracking, not yet at the ADR bar

- **Naming.** Replace "Master/Slaver" with "Coordinator/Worker" (`docs/adr/ADR-002-master-slaver-mode.md:195`). The terminology is a one-line rename; the role rules are unaffected. Not yet an ADR.
- **Dashboard ownership.** Should the dashboard live in the L2 Node.js process or in a separate L2-D process? Currently in-process; the separation question is open but not load-bearing.
- **Plugin model.** Should EKET ship a plugin API, or is "fork and PR" the right extension model? The plugin API is a maintenance tax; the fork model is a discoverability problem. Not yet an ADR.

---

## 7. 12-month roadmap — 3 phases with exit criteria

The roadmap is structured as **3 phases of 4 months each**, starting from the current state (v2.19.0-beta, post-Rust-migration, May 2026). Each phase has one *outcome*, three *exit numbers*, and an *explicit non-goal* to keep the scope honest. The phases are not a wishlist; they are the smallest set of work that, if shipped, justifies the next 12 months of investment.

The phases assume that the L0 floor (ADR-003) keeps working — that is the load-bearing assumption. If the file queue breaks, the roadmap is paused, not the ADRs.

### Phase 1 — Stabilize (2026-06 → 2026-09, 4 months)

**Outcome.** v3.0.0 ships. The Rust migration lands in `main`; the L0/L1/L2/L3 runtimes are all green; the article series (1–15) is in the README.

**Exit numbers.**

1. **100% test pass rate** in `rust/crates/eket-core` and `node/src/`, measured by `cargo test` and `npm test` on a clean runner.
2. **10 production users** (teams that have completed at least one full ticket cycle with EKET, regardless of level).
3. **0 P0/P1 bugs** older than 30 days in `jira/tickets/`.

**Explicit non-goal.** No new LLM tool support. Phase 1 is about hardening what exists, not adding to the matrix.

**Why this is the first phase.** The v2.19.0-beta changelog (`CHANGELOG.md:8-66`) shows that the team is in the middle of a Rust migration; the changelog calls it out as "Unreleased — Rust Migration" (`CHANGELOG.md:67-92`). The migration is the rate-limiter on every other piece of work; Phase 1 finishes it.

### Phase 2 — Durability (2026-10 → 2027-01, 4 months)

**Outcome.** The protocol survives 72 hours of continuous operation across a multi-host deployment. The audit log is queryable for any past ticket. The cost of running EKET is visible per-ticket.

**Exit numbers.**

1. **ADR-004 (multi-host state) accepted or rejected with a written reason.** The decision is the exit, not the implementation.
2. **PII redaction (ADR-005) implemented in the L2 Node.js Saga**, with at least one customer-style use case in the test suite.
3. **Per-ticket cost field** on the `tickets` table, populated for 100% of Slaver invocations.

**Explicit non-goal.** No community-scale adoption work. The team is still building for the 1–5 + N team shape (`docs/articles/01-what-is-eket/en/article.md:69-72`); the 50-Slaver shape is the next-next step.

**Why this is the second phase.** Durability is what teams that already use EKET will demand first. The path from "10 production users" to "100 production users" is a path of audit-trail and cost-visibility questions, not a path of new features.

### Phase 3 — Multi-tool parity (2027-02 → 2027-05, 4 months)

**Outcome.** The protocol is implemented in at least 3 LLM tools with **identical** protocol behavior. A team can mix Cursor, Claude Code, and Codex agents on the same backlog with no audit-trail drift.

**Exit numbers.**

1. **3 LLM tools** (Claude Code, Cursor, Codex at minimum) with passing test suites against the same `protocol/state-machines/ticket-status.yml:1-112` schema.
2. **50 production users**, with at least 5 reporting the multi-tool mix in active use.
3. **One external contributor** who has shipped a PR that the EKET team would not have written.

**Explicit non-goal.** No SaaS / cloud offering. Phase 3 is a framework, not a hosted product.

**Why this is the third phase.** The multi-tool story is the EKET thesis (`docs/articles/01-what-is-eket/en/article.md:144`); a framework that does not deliver it on at least 3 tools is not yet a framework. The exit numbers are chosen to fail honestly: if only the EKET team uses it on 3 tools, the multi-tool story is not validated; the third exit number is the test.

### What happens after Phase 3

The roadmap stops at Phase 3 because the post-Phase-3 decision depends on the data. Two plausible continuations:

- **Path A — SaaS.** If 50 production users ask for hosted EKET, the next 12 months are a hosted product on top of the framework.
- **Path B — Specification.** If 50 production users are happy to self-host, the next 12 months are a formal EKET Protocol V2 spec, a CNCF-style governance model, and an interoperable-implementer track.

Both are reasonable. The choice is data-driven, not roadmap-driven. **Writing a 24-month roadmap before the 12-month exits are met is the most common way a roadmap lies to its own team.**

---

## 8. Risks to the roadmap — what could invalidate the plan

A roadmap without risks is marketing. The four risks below are the ones that, if they materialize, would force a Phase to be paused or an ADR to be reversed. Each risk has a **likelihood**, an **impact**, and a **mitigation action** that the team can take *before* the next quarter starts. The mitigations are actions, not hopes.

### Risk 1 — The Rust migration slips past Phase 1's exit numbers

- **Likelihood:** Medium. The v2.19.0-beta changelog (`CHANGELOG.md:8-66`) shows a clean migration in progress, with red-team fixes already in `main` (`CHANGELOG.md:79-86`). The risk is not "the migration fails" — it is "the migration takes 6 months, not 4."
- **Impact:** Phase 1's exit numbers slip. Phase 2's start date slips with them. The roadmap is not invalidated, but the dates are.
- **Mitigation action:** **Appoint a single migration owner with a weekly written status report** published to `confluence/memory/`. If the owner does not ship the v3.0.0 tag by 2026-09-30, Phase 1 is paused, not extended. A paused Phase is cheaper than a slipped Phase that drags the rest of the roadmap with it.

### Risk 2 — The L0 file-queue floor breaks in production

- **Likelihood:** Low-to-medium. The L0 surface is small (`scripts/eket-slaver-auto.sh` is 322 lines, verified by `wc -l` per `docs/articles/05-four-level-degradation/en/article.md:117-120`), and the file-queue primitives are well-tested (`docs/adr/ADR-003-file-queue-fallback.md:11-21`). The risk is not "the floor breaks" — it is "a CI runner with a non-POSIX filesystem (Windows, NFSv3) misuses the `tmp → rename` primitive and corrupts the queue."
- **Impact:** ADR-003 is reversed in practice. The four-level model becomes a three-level model with a documented gap. The "recovery is `git clone`" property at `docs/articles/01-what-is-eket/en/article.md:217-218` is no longer universally true.
- **Mitigation action:** **Ship a "host OS smoke test" in `scripts/eket-start.sh`** that runs the file-queue primitive on the host filesystem at startup and aborts with a clear message if the rename is not atomic. The smoke test is 30 lines of shell; the absence of it is a 30-line bug that takes a quarter to diagnose after the fact.

### Risk 3 — ADR-002 (Master-Slaver unification) is the wrong unification

- **Likelihood:** Low. The unification has shipped, has 2 rounds of validation in production (`CHANGELOG.md:67-92` references the Rust migration as Round 20+), and the protocol is designed around it (`docs/articles/06-master-slaver-protocol/en/article.md:70-86`). The risk is not "the unification is wrong" — it is "a future LLM tool refuses to participate in the same protocol because the AI provider sees the Slaver role as a liability."
- **Impact:** The protocol splits into a "human mode" and an "AI mode." The bug class the unification prevents re-appears. The other ADRs (001, 003) are unaffected; the protocol is.
- **Mitigation action:** **Write a "Conformance Test Suite" for any LLM tool that claims EKET compatibility** — a 200-line test harness that exercises `task:claim`, `task:complete`, `task:resume` against the same SQLite file. If a tool does not pass the suite, it does not get the "EKET-compatible" label. The suite is the boundary that protects the unification from erosion.

### Risk 4 — The article series ships but no one reads it

- **Likelihood:** Medium. Article series in the open-source world have a long tail of 90% of readers reading the first 3 articles and 1% reading the last 12. The risk is not "the series is bad" — it is "the series is well-written and has no measurable impact on adoption."
- **Impact:** Phase 3's "50 production users" exit number is harder to hit. The framework's adoption curve flattens. The ADRs and the roadmap are correct, but the team has not translated them into a self-serve onboarding story.
- **Mitigation action:** **Tie each article to a specific onboarding step** and measure the conversion: which article is the last one a new user reads before they open their first ticket? `docs/articles/01-what-is-eket/en/article.md:171-185` is the install path; the next article that converts readers to users is the one whose number goes into Phase 3's exit criterion. The measurement is a 10-line analytics event, not a research project.

### What these risks are not

They are not "we don't ship in time" (operational, not strategic), "we pick the wrong feature" (recoverable), or "a competitor launches first" (out of scope — see `docs/articles/15-outlook-risks/en/article.md` for the external landscape). The four risks above are the ones whose materialization would force the team to **revise an ADR, not a calendar**.

---

## 9. References

- **ADRs (the three decisions this article summarizes)**:
  - `docs/adr/ADR-001-four-level-degradation.md:1` — the four-level degradation decision
  - `docs/adr/ADR-001-four-level-degradation.md:32-42` — the L1/L2/L3/L4 connection ladder
  - `docs/adr/ADR-001-four-level-degradation.md:88-107` — positive / negative consequences + mitigations
  - `docs/adr/ADR-002-master-slaver-mode.md:1` — the Master-Slaver unification decision
  - `docs/adr/ADR-002-master-slaver-mode.md:24-39` — the role architecture diagram
  - `docs/adr/ADR-002-master-slaver-mode.md:77-89` — the master election three-step ladder
  - `docs/adr/ADR-002-master-slaver-mode.md:127-146` — positive / negative consequences + mitigations
  - `docs/adr/ADR-002-master-slaver-mode.md:190-195` — naming question (Master/Slaver → Coordinator/Worker)
  - `docs/adr/ADR-003-file-queue-fallback.md:1` — the file-queue floor decision
  - `docs/adr/ADR-003-file-queue-fallback.md:42-85` — atomic write, file lock, CRC32
  - `docs/adr/ADR-003-file-queue-fallback.md:111-137` — consequences, performance floor, mitigations
- **Earlier articles in the series (for context)**:
  - `docs/articles/01-what-is-eket/en/article.md:69-78` — the 1–5 + N thesis
  - `docs/articles/01-what-is-eket/en/article.md:131-140` — the four-implementation matrix
  - `docs/articles/01-what-is-eket/en/article.md:213-217` — the human + AI same protocol lesson
  - `docs/articles/03-technical-value-choices/en/article.md:71-105` — Choice 1: SQLite over Postgres
  - `docs/articles/03-technical-value-choices/en/article.md:107-136` — Choice 2: CAS over distributed locks
  - `docs/articles/03-technical-value-choices/en/article.md:255-285` — Choice 7: four levels not three
  - `docs/articles/05-four-level-degradation/en/article.md:100-105` — the L0/L1/L2/L3 capability matrix
  - `docs/articles/05-four-level-degradation/en/article.md:117-120` — `wc -l` evidence for the 322-line L0
  - `docs/articles/05-four-level-degradation/en/article.md:204-211` — the cost table for four levels
  - `docs/articles/06-master-slaver-protocol/en/article.md:70-86` — the three bets of the state machine
  - `docs/articles/06-master-slaver-protocol/en/article.md:226-274` — the Saga 5-step completion contract
- **Architecture and protocol specs**:
  - `docs/architecture/DEGRADATION-STRATEGY.md:1` — 591 lines, the four-level authoritative spec
  - `docs/architecture/DEGRADATION-STRATEGY.md:18-46` — the runtime L1/L2/L3 ladder
  - `docs/architecture/DEGRADATION-STRATEGY.md:114-124` — the ConnectionManager L3-A/B/C/D ladder
  - `docs/architecture/DEGRADATION-STRATEGY.md:228-246` — the circuit breaker
  - `docs/architecture/DEGRADATION-STRATEGY.md:583` — the priority order (availability > performance > feature completeness)
  - `docs/architecture/THREE-LEVEL-ARCHITECTURE.md:1-3` — the historical three-level (frozen, superseded)
  - `protocol/state-machines/ticket-status.yml:1-112` — the 17-state state machine
  - `protocol/state-machines/ticket-status.yml:14-91` — the `ready → in_progress` transition with `who_can_transition: [slaver]`
  - `rust/crates/eket-core/src/election.rs:294` — Redis SETNX for master election
  - `rust/crates/eket-core/src/ticket.rs:100-103` — the `tmp → rename` atomic write
- **Roadmap inputs**:
  - `docs/roadmap/README.md:1-46` — the current short-form roadmap
  - `docs/roadmap/EKET-ROADMAP-2026-Q2-Q4.md:1-556` — the historical 2026-Q2/Q3/Q4 plan (Rust-migration pre)
  - `CHANGELOG.md:8-66` — v2.19.0-beta (the current state)
  - `CHANGELOG.md:67-92` — the "Unreleased — Rust Migration" block
  - `CHANGELOG.md:79-86` — the red-team fixes from TASK-214~221
- **Source code (verification anchors)**:
  - `scripts/eket-slaver-auto.sh:1-322` — the L0 Slaver loop
  - `scripts/eket-start.sh:1-883` — the L0 Master startup
  - `scripts/heartbeat-monitor.sh:1-390` — the L0 heartbeat
  - `scripts/ticket-board.sh:1-328` — the L0 board view
  - `node/src/core/saga-executor.ts:22-66` — the Saga executor (TypeScript)
  - `rust/crates/eket-core/src/saga.rs:30-94` — the Saga executor (Rust mirror)
  - `rust/crates/eket-core/src/saga.rs:233-288` — `middle_step_fails_rolls_back` unit test
- **Glossary** (terms used in this article): [`docs/articles/GLOSSARY.md:1-45`](../../GLOSSARY.md) — Master, Slaver, Ticket, Saga, CAS, ADR, Four-Level Degradation.
- **Series navigation**:
  - Previous: [`12-multi-tool-support`](../../12-multi-tool-support/en/article.md) — the same protocol across Claude Code, Cursor, Codex
  - Next: [`14-case-studies`](../../14-case-studies/en/article.md) — real-team implementations and lessons
