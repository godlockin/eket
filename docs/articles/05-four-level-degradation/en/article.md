# 05 — Four-Level Degradation: Shell -> Rust -> Node -> Shell

> **TL;DR** — EKET ships the *same* coordination protocol in **four** implementations, ranked by capability: L0 Shell, L1 Rust, L2 Node.js, L3 Shell fallback. The protocol never changes across levels; only the implementation underneath does. This is why most "AI orchestration" tools become unavailable the day Redis or Node.js becomes unavailable, while EKET keeps the coordination loop alive on a CI runner with no Node, no Redis, no SQLite — just a `bash` interpreter and `scripts/eket-slaver-auto.sh` (**322 lines**, verified by `wc -l`). Degradation is not a fallback to be ashamed of; it is the load-bearing design that makes the rest of the system load-bearing.

> **Key Takeaways**
> 1. The same protocol, four implementations: L0 Shell (zero deps), L1 Rust (fast), L2 Node.js (full), L3 Shell (L2-down fallback). L0 is the floor, not a stub.
> 2. The **same-protocol invariant** is the load-bearing constraint: `eket task:claim` at L0, L1, L2, L3 is the *same* operation against the *same* SQLite file, with *identical* semantics.
> 3. The L0 implementation is **322 lines of bash** in `scripts/eket-slaver-auto.sh` (cited below). It is complete, not a placeholder.
> 4. Trigger and recovery are automatic: `eket system:doctor` reports the active level; circuit breakers reopen Redis after 30 seconds of cooldown (`docs/architecture/DEGRADATION-STRATEGY.md:228-246`).
> 5. The principle transfers: every production system should have a **shell floor** that survives the loss of its fastest runtime.

---

## Executive Summary

**For decision-makers (read this and walk away):**

| Question | Answer |
|---|---|
| What is it? | Four implementations (L0/L1/L2/L3) of one protocol, picked automatically by what is alive in the environment. |
| Why care? | Your other tools stop working when Redis or Node dies. EKET keeps coordinating on `bash` alone. |
| What does it cost? | Maintain one set of shell scripts that mirror the protocol operations. The L0 implementation in `scripts/eket-slaver-auto.sh` is **322 lines**; it is the smallest bill you will ever pay for availability. |
| What's the risk if we don't? | The day Redis flaps, your "AI orchestration" tool becomes a dead dashboard. The team reverts to Slack threads and Notion docs — and coordination debt compounds. |
| When is it overkill? | Solo developer, single agent, no concurrency. If you never have two executors, the floor is unnecessary. |

The rest of this article unpacks the four levels, the capability matrix, the trigger and recovery flow, and a worked Redis-down example end to end.

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

Between late 2024 and mid-2026, "AI orchestration" became a category. Most products in that category share a hidden assumption: **Redis is up, Node.js is up, the dashboard is up**. The moment any of those fails, the product fails — not because the LLM stops working, but because the *coordination layer* stops working.

The standard recovery story at most teams is, candidly, embarrassing:

1. Redis flaps at 14:00.
2. The agent dashboard shows a red banner: "Service degraded."
3. Every running agent that was halfway through a ticket loses its state. The 25 minutes it spent reading the codebase is gone.
4. Humans in Slack ask "is it just me?"
5. An on-call engineer restarts Redis.
6. At 14:18, the agents come back. They re-read the codebase from scratch.
7. The team writes a postmortem titled "Coordination Layer Outage" and decides to add a second Redis.

The postmortem misses the point. **The coordination layer was not the wrong design; it was the right design for a single tier.** The mistake was thinking one tier was enough.

EKET's bet: ship the protocol in **four** tiers, so that when one tier fails, the next one below it is *already there*, doing the same job, with the same state. The L0 implementation is the floor. It is not a stub. It is a complete, working version of the protocol that runs on a fresh Linux container with nothing installed.

> "If your coordination layer dies when Redis dies, you do not have a coordination layer — you have a Redis client with extra steps."
> — *EKET design note, 2026-04, paraphrased from `docs/articles/01-what-is-eket/en/article.md:57-58`*

The four-level model is the answer to the question every other orchestration tool refuses to ask: *what happens to the protocol when the runtime that implements it is the thing that broke?*

---

## 2. The Big Idea

The four-level model rests on a single thesis with three components.

### 2.1 The protocol is the floor, not the implementation

Most stacks treat the protocol as a *feature of* a runtime (Redis Pub/Sub, Node event loop, etc.). EKET inverts this: the **protocol** is the floor; the runtimes are interchangeable implementations stacked on top of it. The runtimes can fail individually. The protocol cannot.

This is exactly the relationship between TCP and any specific TCP stack: TCP is a protocol; Linux's `tcp_impl` and FreeBSD's `tcp_impl` are interchangeable implementations. If you wrote a distributed system that only worked on Linux, you would not say "TCP failed" when it failed on FreeBSD. You would say "we forgot the protocol layer."

### 2.2 The same-protocol invariant

`docs/articles/01-what-is-eket/en/article.md:131-140` publishes the canonical capability matrix. The table at section 3.1 below is a slightly richer version. The invariant is captured in this sentence: a ticket claimed via L0 shell is the same ticket claimed via L1 Rust CLI. Same row in `tickets`, same CAS primitive, same `task:complete` Saga downstream.

The invariant is what makes degradation cheap. If the L0 implementation used a *different* data model from L1, falling back would mean migrating state. With the invariant, falling back is just "use the other binary." The state is on disk in the same SQLite file. The L0 shell implementation reads the same `tickets` table that the L1 Rust implementation writes to.

### 2.3 Recovery is part of the design, not an afterthought

A common failure mode in self-described "resilient" systems: the fallback is a one-way door. Once you fall back, you stay there until a human restarts the higher tier. EKET's design rejects this. **The L2->L3 transition and the L3->L2 recovery are both automatic**, on a 30-second cooldown, governed by a circuit breaker (`docs/architecture/DEGRADATION-STRATEGY.md:228-246`). The system is not "degraded until rebooted." It is "degraded until the higher tier is healthy again."

> "The protocol's promise is that the loop does not stop, not that the loop is always at its fastest."
> — *EKET design note, 2026-04*

The priority order, made explicit in the architecture spec, is **availability > performance > feature completeness** (`docs/architecture/DEGRADATION-STRATEGY.md:583`). A system that runs at half speed is better than a system that does not run at all.

---

## 3. How It Works

### 3.1 The capability matrix

The four levels are best read as a capability ladder. Each level *contains* the level above it in semantic terms; each level *loses* one capability compared to the level above it.

| Level | Implementation | Dependencies | Latency (p95) | What it can do | What it cannot do |
|---|---|---|---|---|---|
| **L0** | `scripts/eket-*.sh` (zero-dep) | `bash` 4.0+, `git`, filesystem | ~5 ms (`task:claim`) | Read tickets, claim via file-lock, write state, heartbeat, branch, commit | Concurrent multi-host claim, distributed pub/sub, LLM gateway, webhooks, dashboard |
| **L1** | `rust/crates/eket-cli/` | L0 + `cargo` build, SQLite | ~21 ms (`task:claim`) | Full CAS on SQLite, axum HTTP API (`:9877`), fast claim loops, crash-safe `task:resume` | Real-time multi-host pub/sub, dashboard UI, hook server |
| **L2** | `node/src/` (TypeScript) | L1 + Node.js 18+, `npm` | ~500 ms (`task:claim`) | Full Saga 5-step, dashboard, LLM gateway, hook server, webhooks, multi-tool bridge | Survive a Node.js process crash; recover without operator intervention |
| **L3** | Shell fallback | Same as L0 | ~5 ms (`task:claim`) | Read tickets, claim via file-lock, heartbeat, write state | Anything L0 cannot do (concurrent multi-host, distributed pub/sub, LLM gateway) |

> Source for latency column: `.claude/skills/eket/references/architecture.md:29` (L0 ~5 ms, L1 ~21 ms, L2 ~500 ms). Source for "what it cannot do": `docs/articles/01-what-is-eket/en/article.md:131-140` and `docs/architecture/DEGRADATION-STRATEGY.md:18-46` (the runtime degradation ladder).

The non-obvious property of the matrix: **L0 and L3 have the same implementation surface** (`scripts/eket-*.sh`) but are activated under different conditions. L0 is the entry point when nothing else is installed (a fresh CI runner, a disaster-recovery host). L3 is the fallback when L1 Rust is up but L2 Node.js has just crashed. Same code path; different trigger.

### 3.2 The "322 lines of shell" claim — verified

The claim that the L0 implementation is small is not a slogan; it is a `wc -l` measurement.

```
$ wc -l scripts/eket-slaver-auto.sh
     322 scripts/eket-slaver-auto.sh
```

`scripts/eket-slaver-auto.sh` is **322 lines of bash** (verified at the time of writing, `wc -l scripts/eket-slaver-auto.sh`). The file performs the full slaver protocol: scan `jira/tickets/` for `READY` tickets (`scripts/eket-slaver-auto.sh:75-100`), sort by priority (`scripts/eket-slaver-auto.sh:103-118`), select the highest-priority ticket (`scripts/eket-slaver-auto.sh:128-145`), update the state machine to `in_progress` (`scripts/eket-slaver-auto.sh:150-178`), create a worktree and a `feature/TASK-NNN` branch (`scripts/eket-slaver-auto.sh:183-207`), load the agent profile (`scripts/eket-slaver-auto.sh:212-225`), and emit the next-action instructions (`scripts/eket-slaver-auto.sh:230-301`). It is not a stub.

For context, the other core shell scripts are similarly compact: `scripts/heartbeat-monitor.sh` is **390 lines** (`wc -l scripts/heartbeat-monitor.sh`), `scripts/ticket-board.sh` is **328 lines** (`wc -l scripts/ticket-board.sh`), and `scripts/quick-setup.sh` is **533 lines** (`wc -l scripts/quick-setup.sh`) including install paths. The point is not the exact number; the point is that **the entire L0 surface fits in a few hundred lines of shell per concern**, which is a reviewable, auditable, port-able artifact.

The deep lesson is structural: when the L0 implementation is a few hundred lines, **a human can read it in 15 minutes and verify it does what the docs say**. When the L0 implementation is 8,000 lines of TypeScript, no one ever will.

### 3.3 The runtime degradation ladder

The L0/L1/L2/L3 labels are a *user-facing* view. Internally, the same architecture doc uses Level 1/2/3 labels for the *runtime* ladder, where the numbering is inverted (Level 3 = full, Level 1 = shell). `docs/architecture/DEGRADATION-STRATEGY.md:18-46` publishes the runtime ladder:

```
Level 3: Redis + SQLite (full)
  ↓ Redis unavailable or unreachable
Level 2: Node.js + file queue (enhanced)
  ↓ Node.js unavailable or crashed
Level 1: Shell + file queue (basic)
  ↓ all paths fail
Graceful exit + error log
```

A second ladder lives *inside* the L1/L2 runtime, the **ConnectionManager four-level ladder** (`docs/architecture/DEGRADATION-STRATEGY.md:114-124`):

```
Level 3-A: Remote Redis (distributed)
  ↓ remote Redis unavailable
Level 3-B: Local Redis
  ↓ local Redis unavailable
Level 3-C: SQLite (persistent)
  ↓ SQLite unavailable
Level 3-D: File queue (offline)
```

The two ladders compose: when the outer ladder is at L2 (Node.js) and the inner ladder is at L3-D (file queue), the system is *still* running — on shell, on file queue, with no Redis, no SQLite, no Node.

### 3.4 Trigger conditions

Triggers are explicit, testable, and one of the audit-trail wins of the design. `docs/architecture/DEGRADATION-STRATEGY.md:52-90` publishes the trigger table verbatim:

| Transition | Trigger |
|---|---|
| L3 -> L2 (Redis-down) | Redis connection timeout (default 5 s), connection refused, auth failure, command error 3x in a row, SQLite corruption/unwritable (`docs/architecture/DEGRADATION-STRATEGY.md:54-59`) |
| L2 -> L1 (Node-down) | Node.js process crash, `dist/index.js` missing, key Node module missing (`ioredis`, `better-sqlite3`), Node < 18.0.0, memory > 90% (`docs/architecture/DEGRADATION-STRATEGY.md:86-90`) |
| Recovery (L_n -> L_(n+1)) | Health check `ping()` succeeds 3 consecutive times during 30 s cooldown (`docs/architecture/DEGRADATION-STRATEGY.md:208-222`) |

The recovery is governed by a circuit breaker (`docs/architecture/DEGRADATION-STRATEGY.md:228-246`) with a 5-failure threshold, 30 s cooldown, and 3 half-open probes. When the half-open probes succeed, the breaker closes and the runtime is upgraded to the higher tier. The agent or human never has to think about it.

### 3.5 "Degradation in action" — a worked example

Pick a scenario the team will hit in production: **Redis is restarted during a routine config change at 14:00, and the restart takes 90 seconds. Meanwhile, three Slaver agents are mid-ticket.**

**Step 1 — 14:00:00, Redis is stopped.**

The `MessageQueue` adapter (`docs/architecture/DEGRADATION-STRATEGY.md:62-72`) attempts `redis.publish('tasks', message)`. The call returns `ECONNREFUSED 127.0.0.1:6379`. The internal `useRedis: true, fallbackToFile: true` configuration routes the call to the file-queue implementation transparently. **The calling code does not change.**

**Step 2 — 14:00:01, the circuit breaker opens.**

After 5 failed `redis.ping()` probes (one per health-check tick, every 10 s, `docs/architecture/DEGRADATION-STRATEGY.md:208-222`), the Redis circuit breaker enters the `Open` state (`docs/architecture/DEGRADATION-STRATEGY.md:250-266`). All subsequent Redis calls are short-circuited and routed to the file queue. **No requests block on a dead Redis.**

**Step 3 — 14:00:02, agents continue working.**

The three Slavers, none the wiser, complete their `task:claim` operations through the L1 Rust CLI. CAS on the SQLite `tickets` table works as before (`docs/architecture/DEGRADATION-STRATEGY.md:155-188`); the CAS primitive is independent of Redis. Tickets transition from `READY` to `IN_PROGRESS` exactly as they would in the full-bore runtime. The 25-minute mental model of the codebase is preserved. The protocol does not change.

**Step 4 — 14:00:30, alert fires.**

The alerting hook (`docs/architecture/DEGRADATION-STRATEGY.md:341-353`) emits a `WARN: System degraded from Redis to File Queue` event. The on-call channel sees it. **The team is informed; the system is not stopped.** This is the design intent captured at `docs/architecture/DEGRADATION-STRATEGY.md:583`: availability first, performance second, feature completeness third.

**Step 5 — 14:01:30, Redis comes back.**

The half-open probe at 14:01:00 (`docs/architecture/DEGRADATION-STRATEGY.md:228-246`) issued a `redis.ping()` and got `PONG`. The breaker transitions to `Closed`. New operations route back to Redis. **Inflight file-queue messages complete normally; the file queue does not "lose" its in-flight items.**

**Step 6 — 14:01:31, system is back at full speed.**

The `eket system:doctor` command (`docs/articles/01-what-is-eket/en/article.md:140`) reports the new active level. The `task:complete` Saga runs against Redis again. Latency returns to the ~21 ms L1 floor.

The 90-second degradation window was visible to the operator as a warning. It was invisible to the agents and to the ticket state machine. **The protocol survived because the protocol is not the runtime that implements it.** This is the practical difference between "we have a coordination layer" and "we have a Redis client with extra steps."

### 3.6 The ADR anchor

`docs/adr/ADR-001-four-level-degradation.md:32-42` codifies the design decision: four levels, ranked remote Redis -> local Redis -> SQLite -> file queue. `docs/adr/ADR-003-file-queue-fallback.md:127-131` publishes the performance floor for the bottom level (file write ~20 ms, file read ~10 ms) and explicitly chooses it as "the best fallback" because it is the *only* zero-dependency option in the table at `docs/adr/ADR-003-file-queue-fallback.md:96-100`.

---

## 4. Trade-offs & Alternatives

### 4.1 What four levels cost

| Cost | Why it is real | Why it is worth it |
|---|---|---|
| Maintenance of two implementation surfaces (shell + Rust + Node) | Every protocol operation has at least two implementations. A bug fix in one does not auto-propagate. | The day Redis dies, the team is still shipping. The maintenance cost is the *price of availability*; the alternative is the Slack-thread fallback (`section 1`). |
| Performance variance | L0/L3 file-queue p95 is ~2 ms (`docs/architecture/DEGRADATION-STRATEGY.md:278`); L2 Redis Pub/Sub p95 is ~0.5 ms (`docs/architecture/DEGRADATION-STRATEGY.md:276`). | A 4x p95 difference is invisible compared to a 30-minute outage. |
| Test surface | Every transition path (L3->L2, L2->L1, L1->L2, L2->L3) needs a test. `docs/architecture/DEGRADATION-STRATEGY.md:524-570` publishes the manual test recipe. | The test is the audit trail. It is also the documentation for the next on-call. |
| Documentation drift | The architecture doc is **591 lines** (`wc -l docs/architecture/DEGRADATION-STRATEGY.md`); keeping it in sync with code is a tax. | A 591-line authoritative spec, plus this article series, is the smallest documentation surface that survives a year of refactors. |

### 4.2 What four levels buy

1. **Coordination continuity.** A Slaver at 2 a.m. on a CI runner with no Redis and no Node can still claim a ticket via `bash scripts/eket-slaver-auto.sh`. The protocol is the same; the dashboard is the part that is gone.
2. **Survivable upgrades.** When the team ships L2.4, the rollout can fail at the Node level without bringing the system down — the agents fall back to L0/L3, claim work via shell, and complete tickets while the Node upgrade rolls forward.
3. **Disaster recovery in source control.** A new region can come up by `git clone` and `bash scripts/eket-slaver-auto.sh`. No package install, no Redis seed, no migrations. **The recovery procedure is `git clone`.**
4. **Auditable behavior.** The `eket system:doctor` output (`docs/architecture/DEGRADATION-STRATEGY.md:434-446`) is a single command that reports which level is active, why, and what was lost (usually nothing). The on-call does not have to guess.

### 4.3 Alternatives, and where they fail

| Alternative | What it offers | What it misses |
|---|---|---|
| **Redis-only** (LangGraph, CrewAI, AutoGen default) | Speed, pub/sub semantics, mature ecosystem | Coordination dies when Redis dies. No same-protocol invariant. |
| **Node.js-only** (OpenAI Swarm, most LLM frameworks) | TypeScript DX, web ecosystem | Coordination dies when Node dies. No shell floor. |
| **SQLite-only** (lightweight tools) | ACID, single file | Coordination dies when the host dies. No cross-host fallback. |
| **GitHub Projects + Actions** | Branch protection, PR templates | Knowledge, tasks, and code are conflated (`docs/articles/02-why-you-need-eket/en/article.md:155`); no protocol-level fallback. |
| **EKET four-level** | Same protocol, four runtimes, automatic recovery | The maintenance cost in `4.1`. The only option that ships a shell floor. |

### 4.4 When the four levels are not for you

- A single human, no agents, no CI. The coordination load is too low to amortize the maintenance tax.
- A team that will not commit to keeping two implementations in sync. The design fails loudly if the L0 implementation drifts from the L1 implementation.
- A regulatory environment that requires a single audited runtime. EKET's audit surface is wider because the protocol is the audit unit, not the runtime.

---

## 5. Implementation Notes

### 5.1 What you actually run

```bash
# Inspect the current active level
eket system:doctor

# Force a level transition (operator only)
node node/dist/index.js system:set-level --level 1

# Run the L0 slaver loop directly
bash scripts/eket-slaver-auto.sh

# Watch the file queue when Redis is down
ls -la .eket/data/queue/pending/ .eket/data/queue/processed/
```

(Source: `docs/articles/01-what-is-eket/en/article.md:171-185`; `docs/architecture/DEGRADATION-STRATEGY.md:424-446`.)

### 5.2 Where to look in the source

| Concern | Path | Line count | Notes |
|---|---|---|---|
| L0 Slaver loop (slaver side, end-to-end) | `scripts/eket-slaver-auto.sh` | **322 lines** (`wc -l`) | The full ticket claim + branch + commit surface in shell. |
| L0 Master startup | `scripts/eket-start.sh` | 883 lines (`wc -l`) | Includes install paths, not all in the hot path. |
| L0 Heartbeat | `scripts/heartbeat-monitor.sh` | 390 lines (`wc -l`) | Independent liveness signal. |
| L0 Board view | `scripts/ticket-board.sh` | 328 lines (`wc -l`) | Human-readable ticket board. |
| L1 Rust CLI | `rust/crates/eket-cli/` | (per source) | Full CAS, axum HTTP API. |
| L2 Node.js core | `node/src/` | (per source) | Dashboard, LLM gateway, hook server. |
| Runtime degradation ladder | `docs/architecture/DEGRADATION-STRATEGY.md:18-46` | (591-line doc) | The outer L1/L2/L3 ladder. |
| ConnectionManager 4-level | `docs/architecture/DEGRADATION-STRATEGY.md:114-124` | — | The inner L3-A/B/C/D ladder. |
| Circuit breaker | `docs/architecture/DEGRADATION-STRATEGY.md:228-266` | — | 5-failure threshold, 30 s cooldown. |
| Master election 3-step | `docs/architecture/DEGRADATION-STRATEGY.md:155-188` | — | Redis SETNX -> SQLite row lock -> `mkdir` lock. |
| Worked scenarios | `docs/architecture/DEGRADATION-STRATEGY.md:464-517` | — | Redis maintenance, Node crash, network partition. |
| ADR: why four levels | `docs/adr/ADR-001-four-level-degradation.md:32-42` | — | The decision record. |
| ADR: why file queue | `docs/adr/ADR-003-file-queue-fallback.md:96-131` | — | The bottom-level ADR. |

### 5.3 Cross-references inside the repo

- Thesis article: `docs/articles/01-what-is-eket/en/article.md:131-140` (the L0-L3 matrix, shorter version)
- Pain x solution article: `docs/articles/02-why-you-need-eket/en/article.md:128-135` (why the protocol, not the language)
- Authoritative spec: `docs/architecture/DEGRADATION-STRATEGY.md:1` (**591 lines**, the *how it survives*)
- Three-level (historical): `docs/architecture/THREE-LEVEL-ARCHITECTURE.md:1-3` (566-line doc, frozen; superseded by the four-level model)
- Glossary: `docs/articles/GLOSSARY.md:15` (Four-Level Degradation entry)

---

## 6. Lessons Learned

**Lesson 1 — Every production system should have a shell floor.** Most "high-availability" stacks have a hidden single point of failure: the *runtime that hosts the high-availability machinery*. If the runtime fails, the machinery that was supposed to handle the failure is gone. The fix is structural: **the L0 implementation must be a complete, working version of the protocol that runs on `bash` alone.** Not a stub, not a "minimal subset," not a placeholder. A complete slaver loop in 322 lines of shell (`scripts/eket-slaver-auto.sh:1-322`) is the smallest bill you will ever pay for this property. The principle transfers: any system that depends on a heavy runtime (Java, .NET, Node, Elixir) should be able to name its shell floor and prove it works.

**Lesson 2 — The same-protocol invariant is the load-bearing constraint.** It is tempting to think of degradation as "fall back to a simpler version." That is the wrong frame. The right frame is: **the protocol is fixed; the runtimes that implement it are interchangeable.** When the L0 implementation is a thin shell over the same SQLite file that the L1 Rust CLI writes to, the L0->L1 transition is a binary swap, not a data migration. When the protocol is a separate layer from the runtime, recovery is automatic and state-preserving. When the protocol is *not* a separate layer — when the protocol is just "what the Node app happens to do" — there is nothing to fall back to. The principle transfers: any system that claims to "gracefully degrade" should be able to point at the protocol layer that survives the runtime change.

**Lesson 3 — Degradation is a feature, not a fallback to be ashamed of.** The L0 implementation in `scripts/eket-slaver-auto.sh` is the most carefully reviewed part of the codebase, because it is the most important. If the shell is broken, nothing else matters. The architectural doc calls this out explicitly: availability > performance > feature completeness (`docs/architecture/DEGRADATION-STRATEGY.md:583`). A slow, ugly, working system beats a fast, polished, dead one. The principle transfers: design priorities in order, and put the floor first.

---

## 7. References

- **Authoritative spec**: `docs/architecture/DEGRADATION-STRATEGY.md:1` — **591 lines**, the source of truth for the four-level model.
- **Historical three-level** (frozen, superseded): `docs/architecture/THREE-LEVEL-ARCHITECTURE.md:1` — **566 lines**, kept for archaeology.
- **ADRs**:
  - `docs/adr/ADR-001-four-level-degradation.md:32-42` — the why-four-levels decision
  - `docs/adr/ADR-003-file-queue-fallback.md:96-131` — the why-file-queue decision
- **Code**:
  - `scripts/eket-slaver-auto.sh:1-322` — **322 lines** (`wc -l`), the L0 Slaver loop
  - `scripts/eket-start.sh:1-883` — **883 lines** (`wc -l`), the L0 Master startup
  - `scripts/heartbeat-monitor.sh:1-390` — **390 lines** (`wc -l`), the L0 heartbeat
  - `scripts/ticket-board.sh:1-328` — **328 lines** (`wc -l`), the L0 board view
  - `rust/crates/eket-cli/` — L1 Rust core
  - `node/src/` — L2 Node.js core
- **Earlier articles in series**:
  - `docs/articles/01-what-is-eket/en/article.md:131-140` — the L0-L3 matrix (shorter)
  - `docs/articles/02-why-you-need-eket/en/article.md:128-135` — the protocol-not-language argument
- **Glossary**: `docs/articles/GLOSSARY.md:15` (Four-Level Degradation entry)
- **Next article in series**: [`06-master-slaver-protocol`](../../06-master-slaver-protocol/en/article.md) — the Master-Slaver state machine in depth
