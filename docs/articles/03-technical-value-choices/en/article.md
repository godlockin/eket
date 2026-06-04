# 03 — Technical Value: 7 Non-Obvious Choices

> **TL;DR** — EKET makes seven technical decisions that look unusual on first contact but turn out to be load-bearing once you see the full trade-off space. This article is the senior-engineer view: not the surface API, the trade-off layer. We defend SQLite over Postgres, CAS over distributed locks, three repos over monorepo, an L0 shell floor over a pure-Rust stack, a single human+AI protocol over per-role protocols, a state machine over CRDT/event-sourcing-only, and four degradation levels over three. Each choice is paired with the **default alternative most teams would have picked**, given honest credit for that alternative's real strengths. The throughline is the same: **EKET optimizes for the day a Slaver crashes, the day Redis flaps, the day two agents race for the same ticket — not for the happy path on a single machine.**

> **Key Takeaways**
> 1. The seven choices are not a list of "EKET is better." They are a list of "the default tool X looks right, but X fails property Y under the load that EKET specifically faces."
> 2. SQLite is the right RDBMS for the *ticket-state* workload because the workload is single-host, ACID-on-one-file, with WAL readers; Postgres would add an entire process to manage for no protocol-level win.
> 3. CAS on SQLite collapses the multi-agent claim race into a single SQL `UPDATE`; distributed locks add latency, a Redis dependency, and a failure mode that SQLite CAS does not have.
> 4. Three repositories (knowledge / tasks / code) is mandatory because the three lifecycles have different write patterns; the git split is optional.
> 5. The L0 shell floor (`scripts/eket-slaver-auto.sh`, 322 lines per `wc -l`) is not a legacy stub; it is the same protocol as L1 Rust, and it is what keeps the system alive on a fresh CI runner.
> 6. The "same protocol for human + AI" rule is what eliminates the entire class of bugs that arise from translation layers between role types.
> 7. A state machine is the right primitive because tickets are *finite* and *stateful*; CRDTs and pure event-sourcing are the right primitives for *eventually-consistent collaborative documents*, which a ticket is not.
> 8. Four levels (L0/L1/L2/L3) is the smallest count that has both a shell floor and a Node.js tier; three levels was tried and rejected because the recovery story was incomplete.

---

## Executive Summary

**For decision-makers (read this and walk away):**

| Question | Answer |
|---|---|
| What is the article for? | To defend the seven EKET technical choices that look "non-obvious" on first contact, with the rejected alternatives given honest credit. |
| Why does EKET use SQLite instead of Postgres? | Because the ticket-state workload is single-host, ACID-on-one-file, and the protocol does not need cross-host writes. SQLite gives serializable writes by default and a `tmp → rename` atomic-write mirror for the markdown files (`rust/crates/eket-core/src/ticket.rs:100-103`). |
| Why CAS instead of Redis distributed locks? | Because the claim is a single-row `UPDATE ... WHERE state = 'old' AND assignee IS NULL`; a Redis lock would add a network round-trip, a Redis dependency, and a failure mode that the SQLite primitive does not have. |
| Why three repositories instead of a monorepo? | Because knowledge, tasks, and code are three different lifecycles with different write patterns; the git split is downstream and optional. See `docs/architecture/THREE_REPO_ARCHITECTURE.md:1-338`. |
| Why ship an L0 shell implementation? | Because the day Redis flaps, the day Node.js crashes, the day Rust will not compile on a CI runner — the protocol must keep working. `scripts/eket-slaver-auto.sh:1-322` is 322 lines of shell and is the L0 floor. |
| Why the same protocol for human and AI? | Because a human "claim" and an AI "claim" must produce the same audit row. The role is encoded on the transition, not on the actor. |
| Why a state machine and not CRDTs? | Because tickets are finite and stateful, not eventually-consistent documents. The state machine gives a single-writer primitive; CRDTs solve a different problem. |
| Why four levels and not three? | Because three levels had no L3 fallback; when L2 Node.js crashed, there was no shell tier to absorb. The fourth level closes the loop. |
| What's the meta-lesson? | The seven choices are not independent. They are seven expressions of a single thesis: **the protocol is the floor, the runtimes are interchangeable.** |

The rest of the article is for architects and senior engineers. Each choice has its own section with a comparison table where useful, and the closing section draws the cross-cutting lessons.

---

## Table of Contents

1. Motivation — why "non-obvious choices"
2. Choice 1: SQLite over Postgres
3. Choice 2: CAS over distributed locks
4. Choice 3: Three repositories over monorepo
5. Choice 4: Shell L0 over pure-Rust-only
6. Choice 5: Same protocol for human + AI
7. Choice 6: State machine over CRDT/event-sourcing-only
8. Choice 7: Four levels not three
9. Cross-cutting lessons
10. References

---

## 1. Motivation — why "non-obvious choices"

Most "AI orchestration" frameworks lead with their surface API: the dashboard, the SDK, the LLM gateway. The reader walks away with a mental model of "what does it do" but not "what did the team reject, and why." This article is the other half of the story. The seven choices below are the ones most often asked about in design reviews, and the ones that, if misunderstood, lead to the wrong fork in the road.

A note on framing: when a team picks an unusual tool (SQLite, shell, three repos), the natural pushback is "but the standard tool does X, and the standard tool has been tested in production by thousands of teams." That pushback is correct as far as it goes. The point of this article is not to argue that the standard tools are bad. The point is to argue that **the workload EKET optimizes for is not the workload the standard tools are optimized for.** The EKET workload is "N agents + M humans working a finite, stateful backlog with auditable handoffs and crash-safe recovery." The standard tools are optimized for "many concurrent clients reading and writing a shared dataset, with eventual consistency acceptable." When you make the workload explicit, the unusual choices start to look inevitable.

Each of the seven sections below has the same shape:

- **What was chosen.** One sentence.
- **What was rejected.** The default alternative most teams would have picked, with the rejected alternative's *real* strengths acknowledged.
- **Why.** The property the chosen option preserves that the rejected option violates, with a `file:line` citation to the load-bearing code or doc.

A useful self-test: if a section reads as "the rejected option is bad and ours is good," it is wrong. The rejected options are good. They are rejected because they fail a property the EKET workload specifically requires. The honesty is the article.

> "Most of the unusual choices in EKET are unusual because they optimize for the failure modes that show up at the third agent, not the first. The first agent does not need CAS. The third agent does."
> — *EKET design note, 2026-04*

---

## 2. Choice 1: SQLite over Postgres

**What was chosen.** EKET stores ticket state in SQLite. The same SQLite file is read by the L0 shell, the L1 Rust CLI, and the L2 Node.js core. The database is the single source of truth; the markdown ticket file in `jira/tickets/` is a human-readable projection kept in sync via the `tmp → rename` atomic-write primitive in `rust/crates/eket-core/src/ticket.rs:100-103`.

**What was rejected.** Postgres. Postgres is the default choice for "I need a real RDBMS," and the default is not unreasonable: Postgres gives you MVCC, row-level locking, replication, JSONB, and a query planner that has been battle-tested for two decades. A team that reaches for "a database to back our state machine" reaches for Postgres nine times out of ten. The fact that EKET does not is the surprise.

**Why.** The ticket-state workload has three properties that Postgres is over-provisioned for, and one property that Postgres is *worse* for than SQLite.

1. **Single-host write contention.** Every `task:claim` is a write to one row of one table. The contention is between two to ten concurrent Slaver processes on the same machine, not between a thousand clients across a network. SQLite's writer-locking model — one writer holds the database lock for the duration of the `UPDATE` — is exactly the right granularity. Postgres would give you row-level locking, but the row-level lock is acquired over a network connection, which adds the round-trip cost without adding useful concurrency at this scale.

2. **ACID-on-one-file.** The audit trail is durable when the database is a single file that is `fsync`'d on commit. SQLite gives this by default. Postgres requires a separate process, a separate `pg_wal` directory, and a separate backup story. The "disaster recovery is `git clone`" property of the L0 shell floor (`docs/articles/05-four-level-degradation/en/article.md:217-218`) depends on the database being a file in the worktree, not a service on a different host.

3. **WAL readers don't block writers.** SQLite's `PRAGMA journal_mode=WAL` lets one Slaver do a `SELECT` on the ticket board while another Slaver is in the middle of a claim `UPDATE`. The dashboard does not freeze during a claim; the read snapshot is pre-CAS. This is the property that makes the "atomic claim, non-blocking read" pattern work in the L2 Node.js core.

4. **The cost of "real RDBMS" is operational.** A Postgres deployment is a process to install, a port to expose, a user to create, a backup to schedule, a connection pool to size, and a migration tool to run. A SQLite deployment is `better-sqlite3.open('./eket.db')` and a `git commit`. The protocol's stance is that the operational footprint of the coordination layer should be proportional to the coordination work it does, and the coordination work for a 1–5 + N team is small enough that SQLite is the right-sized tool.

The comparison table is the honest way to present the trade-off.

| Property | SQLite (chosen) | Postgres (rejected) |
|---|---|---|
| Writer model | Single-writer; one process holds the database lock for the duration of an `UPDATE` | MVCC; row-level locks; concurrent writers |
| Read-during-write | WAL mode; readers see pre-CAS snapshot without blocking | MVCC; readers see pre-transaction snapshot |
| Durability | Single file; `fsync` on commit; survives `kill -9` of the host | `pg_wal` + checkpoint; survives most host failures; requires separate backup |
| Concurrency at our scale (≤10 Slaver processes) | Plenty | Plenty, but the headroom is unused |
| Operational footprint | One file, no process, no port | One process, one port, one user, one backup story |
| Cross-host writes | Not supported — but the protocol does not need them | Supported, with replication topology |
| Failure mode under load | "database is locked" error after 5 s `BUSY` timeout; Slaver retries | Connection-pool exhaustion; long-running transaction blocks |
| When it loses | Cross-host state, write-heavy OLTP, >100 concurrent writers | Single-host, low-contention, audit-trail-first workloads (i.e., the EKET workload) |

The point is not "Postgres is bad." The point is "Postgres is solving a workload that is not the EKET workload." A team building a multi-region user-data service should pick Postgres and will be right. A team building a coordination layer for a 1–5 + N agent team on a single host should pick SQLite, and the operational savings are real.

The "rejected alternative's real strength" paragraph: Postgres's replication is the strongest argument for it, and a team that is running 50 Slavers across three regions will eventually outgrow SQLite. EKET's design accommodates that growth — the `node/src/core/state-reconciler.ts:96-348` file-queue replay is the escape hatch — but acknowledges that the escape hatch is the L0 fallback, not the steady state. For 1–5 + N on a single host, SQLite is the right tool. The honest version of the article acknowledges that the right tool changes with scale.

The line-by-line evidence: the atomic-claim primitive lives at `node/src/core/task-checkpoint.ts:85-108` (the `_casUpdate` method) for the TypeScript path and at `rust/crates/eket-core/src/ticket.rs:72-145` for the Rust path. The `tmp → rename` atomic-write mirror for the markdown ticket files is at `rust/crates/eket-core/src/ticket.rs:100-103`. Both implementations assume SQLite. Both would change shape (not disappear, but change) if the backing store were Postgres.

---

## 3. Choice 2: CAS over distributed locks

**What was chosen.** An atomic `UPDATE ... WHERE state = 'old' AND assignee IS NULL` against the `tickets` table. The single SQL statement is the claim. If `info.changes === 1`, the Slaver owns the ticket. If `info.changes === 0`, somebody else got there first. There is no `SELECT` followed by an `UPDATE`; there is no lock service; there is no `WATCH`/`MULTI` dance. The state machine is the lock.

**What was rejected.** Distributed locks — typically Redis `SETNX` with a TTL, or ZooKeeper sequential nodes, or etcd `lease` operations. These are the default tool for "I have N processes that need to agree on ownership of a resource." The fact that EKET does not use a distributed lock service for ticket claims is the second surprise.

**Why.** The claim workload has two properties that make a distributed lock the wrong tool.

1. **The "lock" and the "resource" are the same row.** A Redis lock on a synthetic key like `eket:claim:TASK-642` is a separate record from the ticket row in Postgres (or wherever the ticket lives). The lock service and the resource are two sources of truth that must be kept in sync. A claim that acquires the lock but fails to update the resource leaves the resource unowned and the lock held. A claim that updates the resource but fails to acquire the lock leaves the resource owned and no audit trail. SQLite CAS collapses the two: the row in the `tickets` table *is* the lock, and the same `UPDATE` that flips the lock also flips the state.

2. **The lock service is a separate failure domain.** Redis is up 99.95% of the time. The 0.05% is the moment the claim race turns into a deadlock. A Slaver that loses its Redis connection mid-claim has to make a decision: retry the Redis call, or fail the claim. The retry path is the source of the "ticket claimed twice" bug. SQLite CAS does not have this failure mode because the database is a local file; the Slaver's "connection" to SQLite is a file descriptor, and the worst-case failure is "the file is on a different host," which is a config error, not a runtime error.

The honest comparison:

| Property | SQLite CAS (chosen) | Redis SETNX + TTL (rejected) |
|---|---|---|
| Network round-trips per claim | 0 (local file) | 1 (Redis call) + 1 (release) |
| Atomicity guarantee | Single `UPDATE` is the atomicity boundary | `SETNX` is atomic; release is best-effort |
| Failure mode when the service is down | The Slaver still works; the L0 shell can claim via file-lock | The Slaver cannot claim; protocol halts |
| Failure mode when the network is partitioned | Same as above; no network involved | Lock is held; resource is unowned; Slaver must wait for partition to heal |
| Lease / TTL semantics | None needed; the row's `claimed_at` timestamp is the audit record | Required; a Slaver that crashes mid-claim must wait for TTL expiry |
| Audit trail | The `tickets` row records `assignee`, `claimed_at`, `state` | The Redis lock is a separate record; the audit is a join |
| When it loses | Cross-host claims (the protocol does not need them) | Per-host claims under sustained high contention (>1000 claims/sec) |

The "rejected alternative's real strength" paragraph: Redis SETNX is faster than SQLite CAS for *single-process* claims, because the network round-trip to local Redis is sub-millisecond. For the workload EKET faces (≤10 Slaver processes on a single host), the latency advantage is below the noise floor, and the operational advantage of "no Redis required" dominates. A team building a 100-host deployment with 10,000 claims/sec will eventually reach for Redis. The same `node/src/core/state-reconciler.ts:96-348` file-queue replay is the escape hatch.

The line-by-line evidence: the SQLite CAS pattern is documented in `node/src/core/task-checkpoint.ts:85-108` (the `_casUpdate` method, with the `WHERE version = ?` guard). The Rust mirror is at `rust/crates/eket-core/src/ticket.rs:72-145` (the `set_status` method, with the same guard pattern). The Redis SETNX that the protocol *does* use — for **master election**, not ticket claims — is at `rust/crates/eket-core/src/election.rs:294` (`.setnx(REDIS_LOCK_KEY, &self.instance_id, REDIS_LEASE_TTL_SECS)`). The choice is *not* "SQLite or Redis." The choice is "SQLite for ticket state, Redis for master election," and the reason is that the two workloads have different consistency and latency requirements.

The deeper reason this works: the protocol's "claim" is a single-row mutation, the database is a local file, and the audit trail is the row. The lock service is removed; the property the lock service was supposed to provide is provided by the SQL `UPDATE`. This is the same trick that `git status` plays on distributed version control: the working tree is the lock, and the working tree is also the file. The protocol is exploiting the fact that "the resource" and "the lock on the resource" can be the same object.

---

## 4. Choice 3: Three repositories over monorepo

**What was chosen.** EKET stores knowledge, tasks, and code in three sibling directories — `confluence/memory/`, `jira/tickets/`, and `code_repo/` (or `rust/`, `node/`) — that look like one tree but behave like three independent concerns. Each directory has a different mutability profile, a different version model, a different write pattern, and a different reader population. The split is not about git: it is about lifecycle. Forcing the three lifecycles into a single tool produces a tool that is bad at all three; separating them lets each side be excellent at one.

**What was rejected.** A monorepo where `docs/`, `tickets/`, and `code/` all live in one tree, one git history, one CI. This is the most common layout in the wild and the most common starting point for a team adopting EKET. The fact that EKET actively recommends against it is the third surprise.

**Why.** The lifecycle-separation thesis is the longest of the seven, and the one that is most often misread as "three git remotes" instead of "three lifecycles." The honest version of the argument is in `docs/articles/04-three-repo-arch/en/article.md:1-318`; the summary is:

1. **The three lifecycles have different write patterns.** Knowledge is append-mostly; a new realization is a new note, not a rewrite of an old one. Tasks are stateful and finite; a ticket moves through READY → IN_PROGRESS → IN_REVIEW → DONE and is archived. Code is branchy and versioned; commits are the unit of change. A single tool that is excellent at all three write patterns does not exist; git is bad at state transitions, a Kanban board is bad at append-mostly, a wiki is bad at versioned branches.

2. **The three lifecycles have different access profiles.** An AI Slaver should be allowed to write to `jira/tickets/` (to claim and complete tickets) but not to `confluence/memory/lessons/` (to invent knowledge) and not to `code_repo/` outside its assigned branch. This matrix is impossible to express in a monorepo without a path-based pre-commit hook that every Slaver could (and does, eventually) bypass. With three repos, the constraint is enforced by git itself: the Slaver does not have push access to the main repo's `main` branch, and the pre-receive hook on the code repo rejects pushes outside the Slaver's allowed prefix. `docs/architecture/three-repo-deployment.md:242-249` publishes the canonical permission matrix (5 roles × 4 repos) and the matrix is the load-bearing argument.

3. **The three lifecycles have different failure modes.** Knowledge rots; tasks go stale; code breaks. A monorepo's CI cannot tell which lifecycle a failing test belongs to, so it treats them all the same. A three-repo layout lets the CI on each repo be specialized: the code repo runs `cargo test` and `npm test`; the jira repo runs `scripts/validate-ticket-pr.sh`; the confluence repo runs a "no Slaver wrote here" check. The failures are localized, and the audit trail is per-repo.

The "rejected alternative's real strength" paragraph: a monorepo is *operationally simpler*. One `git clone`, one `git pull`, one CI. A team that is two humans and one agent, working on a one-month prototype, should stay in a monorepo. The lifecycle separation pays for itself when the team has ≥2 humans, ≥2 agents, and a backlog that survives a quarter. Below that threshold, the migration cost is not amortized. This is the honest version of "three repos is not for everyone"; it is the version that respects the operator.

The line-by-line evidence: the lifecycle-separation thesis is at `docs/architecture/THREE_REPO_ARCHITECTURE.md:1-338` (the authoritative spec, 338 lines, the *what*); the deployment playbook is at `docs/architecture/three-repo-deployment.md:1-312` (the *how*); the permission matrix that makes the split load-bearing is at `docs/architecture/three-repo-deployment.md:242-249`. The "no ticket without a cross-reference" rule is enforced by `scripts/validate-ticket-pr.sh:1-78` and the "immutable ticket fields" rule is enforced by `scripts/check-ticket-immutability.sh:1-94` (verified by `wc -l` to be 78 and 94 lines respectively). The two scripts are the protocol; the architecture document is the description.

A subtle but important point: **the git split is optional**. Three directories in a single git repo, with `validate-ticket-pr.sh` enforcing the cross-reference rule and `check-ticket-immutability.sh` enforcing the immutability rule, is a valid EKET layout. The submodule pointers, the sibling clones, the per-repo CI — those are *refinements*, not prerequisites. `docs/architecture/three-repo-deployment.md:301-304` is the explicit escape hatch: "可以 [纯平级目录]。在 `config.yml` 中用相对路径 `../sibling` 访问即可，EKET 运行时不依赖 git submodule 机制." The lifecycle split is mandatory; the git split is one valid storage variant among four.

---

## 5. Choice 4: Shell L0 over pure-Rust-only

**What was chosen.** EKET ships the same coordination protocol in **four** implementations, ranked by capability: L0 Shell, L1 Rust, L2 Node.js, L3 Shell fallback. The L0 implementation — `scripts/eket-slaver-auto.sh:1-322`, verified to be 322 lines of bash by `wc -l` — performs the full Slaver loop: scan tickets, sort by priority, claim via file-lock, create a worktree and branch, load the agent profile, emit the next-action instructions. It is not a stub.

**What was rejected.** A pure-Rust (or pure-Go, or pure-Node.js) stack with no shell floor. The default assumption in 2024–2026 is "if you need performance, write it in Rust; if you need DX, write it in Node.js; if you need both, write two implementations and keep them in sync." EKET does both, plus a third: shell. The shell implementation is the surprise.

**Why.** The argument is structural, not performance.

1. **The runtime that implements the protocol is the thing that can fail.** A system whose protocol layer is "what the Node.js process happens to do" has no fallback when the Node.js process dies. A system whose protocol layer is "a sequence of bash statements in `scripts/eket-slaver-auto.sh`" has a fallback that runs on a fresh Linux container with nothing installed. The principle: **the protocol's correctness should not depend on the availability of the runtime that implements it.**

2. **A 322-line shell script is auditable in 15 minutes.** A 8,000-line TypeScript file is not audited by anyone. The L0 implementation is short enough that a human can read it end-to-end and verify it does what the docs say. The L1 Rust implementation is shorter than the L2 Node.js implementation, and the L0 implementation is shorter still. The short file is the audit trail.

3. **The L0 implementation is the test fixture.** When the L1 Rust implementation is being developed, the L0 implementation is the reference. When the L2 Node.js implementation is being benchmarked, the L0 implementation is the floor. The L0 is not the "legacy version"; it is the *ground truth* against which the other implementations are measured.

The comparison table:

| Property | Shell L0 (chosen) | Pure-Rust stack (rejected) |
|---|---|---|
| Cold-start latency | ~5 ms (`task:claim`) | ~21 ms (Rust) / ~500 ms (Node.js) |
| Dependencies | `bash` 4.0+, `git`, filesystem | Rust toolchain + `cargo` (Rust) or Node.js 18+ + `npm` (Node) |
| Install footprint | `git clone` and run | Build step or `npm install` |
| Recovery procedure | `git clone` | Backup + restore + migration |
| Code size to read | 322 lines (verified) | Thousands of lines |
| When the runtime is gone | Shell keeps working; protocol survives | Protocol halts until runtime is restored |
| When the host is gone | New host needs `bash` | New host needs the toolchain |
| When it loses | Throughput, type safety, observability | Survivability, auditability, installability |

The "rejected alternative's real strength" paragraph: a pure-Rust stack is faster and more type-safe. The L1 Rust CLI is the right tool for hot loops and CI; the L2 Node.js core is the right tool for the dashboard and the LLM gateway. The pure-Rust-only team will get a faster `task:claim` (the headline `19x` number from `README.md:140-145` is from the Rust implementation, not the shell). The shell implementation does not replace the Rust implementation; it sits *under* it as the floor. The team that picks Rust-only is optimizing for the happy path. EKET is optimizing for the day the happy path ends.

The line-by-line evidence: the L0 Slaver loop is at `scripts/eket-slaver-auto.sh:1-322` (322 lines, `wc -l`). The companion L0 scripts are `scripts/heartbeat-monitor.sh:1-390` (390 lines), `scripts/ticket-board.sh:1-328` (328 lines), and `scripts/eket-start.sh:1-883` (883 lines including install paths). The authoritative spec for the four-level model is `docs/architecture/DEGRADATION-STRATEGY.md:1-591` (591 lines). The decision record for "why four levels" is `docs/adr/ADR-001-four-level-degradation.md:32-42` (the ladder, ranked remote Redis → local Redis → SQLite → file queue). The decision record for "why file queue at the bottom" is `docs/adr/ADR-003-file-queue-fallback.md:96-131` (the file-write ~20 ms, file-read ~10 ms performance floor, with file queue chosen as the *only* zero-dependency option in the table at `docs/adr/ADR-003-file-queue-fallback.md:96-100`).

The subtle point: the L0 and L3 implementations are the *same code*, activated under different conditions. L0 is the entry point when nothing else is installed (a fresh CI runner, a disaster-recovery host). L3 is the fallback when L1 Rust is up but L2 Node.js has just crashed. The same `scripts/eket-slaver-auto.sh` runs in both modes. This is what makes the maintenance cost bearable: there is *one* shell implementation, not two.

---

## 6. Choice 5: Same protocol for human + AI

**What was chosen.** A human "claims" a ticket by moving it from `READY` to `IN_PROGRESS` in the dashboard (or by running `eket task:claim TASK-642` at the L1 Rust CLI). An AI agent "claims" it by running `eket task:claim TASK-642` at the L0 shell, the L1 Rust CLI, or the L2 Node.js core. **The two operations are the same operation from the database's point of view**: a single `UPDATE` against the `tickets` table with the role encoded on the transition, not on the actor.

**What was rejected.** Per-role protocols. The default assumption in 2024–2026 is "humans and AI are different, and a system that pretends they are the same is naive." The instinct is to ship a "human mode" with a Kanban-board-style claim and an "AI mode" with a CLI-style claim, and to keep the two in sync by convention. EKET actively rejects this. The fifth surprise.

**Why.** The argument is about *class of bugs*, not about ergonomics.

1. **The protocol is a safety rail.** When a human can hand off a ticket to an AI mid-stream, the AI cannot do something the human could not have done — because the state machine does not allow it. If the AI's claim and the human's claim were different operations, there would be a category of transitions the human can do that the AI cannot (or vice versa), and the handoff would lose information. The same-protocol rule makes the handoff a no-op: the ticket row is the contract, and the contract is the same for both roles.

2. **The role check is encoded on the transition, not on the actor.** The state machine at `protocol/state-machines/ticket-status.yml:14-91` has a `who_can_transition: [slaver]` field on the `ready → in_progress` transition. The actor's role is a column on the row flip, not a label on the user. A human Master who tries to claim a ticket is rejected by the same SQL constraint that rejects a misbehaving AI Slaver. The rule "Master never claims" is a SQL constraint, not a guideline.

3. **The audit trail is the same for both roles.** Every `READY → IN_PROGRESS` transition is an event in the audit log. If the human and AI claims were different events, the audit log would have to merge two event types, and the merge is the place where bugs hide. With one event type, the merge is not needed.

The "rejected alternative's real strength" paragraph: per-role protocols can be more ergonomic. A Kanban board is a friendlier claim UI for a human than a CLI; an LLM-friendly JSON-RPC API is a friendlier claim surface for an AI than a board. The "human mode" can lean into the UI affordances that humans want, and the "AI mode" can lean into the schema affordances that models want. The cost is that the two surfaces must be kept in sync, and the moment they drift, the handoff fails. The protocol's stance is that the handoff is the load-bearing property, and the UI affordances are downstream. A team that needs a more ergonomic human UI can build one *on top* of the same protocol; the protocol stays the same.

The line-by-line evidence: the unification thesis is in `docs/articles/01-what-is-eket/en/article.md:74-75` (the canonical statement). The state machine with role-gated transitions is at `protocol/state-machines/ticket-status.yml:1-112` (17 granular states, each with a `who_can_transition` list). The decision record for "why Master/Slaver" is at `docs/adr/ADR-002-master-slaver-mode.md:23-30` (the explicit unification statement: "a human Master writes the ticket, dispatches a Slaver, and observes. If no Slaver is available, the ticket stays in `READY`"). The "no human in the loop for claims" rule is the most-violated part of the protocol; the structural enforcement is at `protocol/state-machines/ticket-status.yml:14-91` (the `who_can_transition: [slaver]` field on the `ready` state).

A subtle but important property: the rule also works the other way. An AI Slaver is forbidden from doing operations reserved for Master (the `review` and `merge` transitions at `protocol/state-machines/ticket-status.yml:67-86`). The asymmetry is intentional: Slavers execute, Masters decide. The asymmetry is enforced by the same SQL constraint mechanism, so the AI Slaver's misbehavior is a database error, not a Slack postmortem.

---

## 7. Choice 6: State machine over CRDT/event-sourcing-only

**What was chosen.** A finite-state machine with 5 user-facing states (READY, IN_PROGRESS, IN_REVIEW, DONE, RESUME), 17 granular states in the YAML schema, and 5 transitions (claim, complete, review, merge, resume). The state lives in SQLite; the transitions are SQL `UPDATE`s with role checks; the completion is a Saga with 5 steps and compensation in reverse order. The model is `UPDATE ... WHERE state = 'old'` and the database is the source of truth.

**What was rejected.** CRDTs (Conflict-free Replicated Data Types) and pure event-sourcing. CRDTs are the right primitive for *eventually-consistent collaborative documents* (Google Docs, Figma, Linear's text editor). Pure event-sourcing is the right primitive for *append-only audit logs with arbitrary replay* (financial ledgers, event-store databases). A team that reaches for "I have a stateful workflow" in 2026 reaches for one of these two by reflex. EKET reaches for neither. The sixth surprise.

**Why.** Tickets are not documents, and the audit log is not the workflow. Three properties of the ticket workload rule out CRDTs and event-sourcing as the *primary* primitive:

1. **Tickets are finite and stateful, not eventually-consistent.** A ticket has a defined end state (`DONE`) and a defined set of legal transitions. There is no "merge two tickets" operation that produces a new consistent state; there is no "last-writer-wins" rule; there is no need for a `Vector` clock. CRDTs solve a problem that tickets do not have: how to merge concurrent edits to a shared document. The EKET workload is the *opposite* of that: concurrent edits to a ticket row are not merged — they are *rejected* by the CAS, and the loser is asked to retry. The primitive is "single writer per row," not "merge two writers."

2. **The audit trail is downstream of the state, not upstream.** Pure event-sourcing says: store the events, derive the state by replay. EKET says: store the state, record the events as audit metadata. The reason is operational: the dashboard, the CLI, and the hooks layer all want to query "what is the current state of TASK-642?" in a single `SELECT`. An event-sourced system would require a fold or a snapshot. The state-in-SQLite design lets the dashboard do `SELECT state FROM tickets WHERE id = 'TASK-642'` and get the answer in a single read. The events are there for audit (the `task_checkpoints` table, the `claimed_at` timestamp, the `merged_at` timestamp), but the *state* is the row.

3. **The Saga pattern is the right primitive for completion, not the event log.** `eket task:complete TASK-642` is a Saga with 5 steps: validate → test → checkpoint → commit → notify. Each step can fail; the Saga compensates in reverse order. The Saga is a *control-flow* primitive, not a *data* primitive. Event-sourcing gives you the data primitive (the events are there forever), but the Saga is a separate concern: how to coordinate the steps and recover from partial completion. EKET implements the Saga in `node/src/core/saga-executor.ts:22-66` (TypeScript) and `rust/crates/eket-core/src/saga.rs:30-94` (Rust mirror), with the unit test in `rust/crates/eket-core/src/saga.rs:233-288` (`middle_step_fails_rolls_back`) asserting that when step 3 fails, steps 2 and 1 are compensated in that order.

The comparison table:

| Property | State machine + Saga (chosen) | CRDTs (rejected) | Pure event-sourcing (rejected) |
|---|---|---|---|
| Concurrency model | Single writer per row; CAS rejects losers | Multi-writer; merge two states | Append-only; replay derives state |
| Conflict resolution | Reject the loser; ask to retry | Last-writer-wins or merge function | "All events are true"; no conflict |
| Audit trail | `tickets` row + `task_checkpoints` table | The CRDT itself (with vector clocks) | The event log |
| Query "what is the current state?" | Single `SELECT` | Materialize the CRDT; read | Replay events; materialize |
| Step-level failure recovery | Saga compensation in reverse order | CRDT-specific rollback | Replay-from-snapshot; no in-flight compensation |
| When it wins | Finite, stateful, single-writer-per-resource workflows | Eventually-consistent documents; collaborative editing | Append-only audit; arbitrary replay |
| When it loses | Multi-master workflows; offline-first collaboration | Finite-state workflows with strong consistency | Workflows that need single-row state queries |

The "rejected alternative's real strength" paragraph: CRDTs are the right tool for a Google-Docs-style collaborative editor where two users can edit the same paragraph and the system merges the edits. Pure event-sourcing is the right tool for a financial ledger where every transaction is recorded forever and the balance is the sum of the transactions. EKET is *not* building either of those systems. EKET is building a coordination layer for a finite backlog of stateful tickets, and the right primitive is a state machine. The right tool for the workload, not the right tool for the buzzword.

The line-by-line evidence: the state machine is at `protocol/state-machines/ticket-status.yml:1-112` (17 granular states, role-gated transitions, the declarative source of truth). The Saga executor in TypeScript is at `node/src/core/saga-executor.ts:22-66` (the `execute` method with compensation in reverse order). The Rust mirror is at `rust/crates/eket-core/src/saga.rs:30-94` with the unit test at `rust/crates/eket-core/src/saga.rs:233-288`. The atomic claim primitive is at `node/src/core/task-checkpoint.ts:85-108` (the `_casUpdate` method with the `WHERE version = ?` guard). The "why state machine, not event-sourcing" argument is implicit in the existence of the `tickets` table as the state-of-record; the "why Saga, not just one `git commit`" argument is in the 5-step completion contract at `docs/articles/06-master-slaver-protocol/en/article.md:226-274`.

A subtle point: the protocol *does* keep an event log. The `task_checkpoints` table, the `claimed_at` and `merged_at` timestamps, the `claimed_tasks.txt` per-instance files, the `EventBus` in `node/src/core/event-bus.ts` — all of these are event-sourced primitives. The difference is that they are *audit* and *recovery* primitives, not the *state* primitive. The state is the SQL row; the events are the recovery story. This is the load-bearing distinction: "we have a state machine, and we have an event log" is a stronger claim than "we are event-sourced."

---

## 8. Choice 7: Four levels not three

**What was chosen.** Four implementations of the same protocol, ranked by capability: L0 Shell, L1 Rust, L2 Node.js, L3 Shell fallback. The numbering looks like a duplicate (L0 and L3 are both shell), but they activate under different conditions and that is the point: L0 is the entry point when nothing else is installed; L3 is the fallback when L2 Node.js crashes but L1 Rust is still up. The two shell implementations are the same code; the two *activation contexts* are different.

**What was rejected.** A three-level model. The historical EKET architecture (`docs/architecture/THREE-LEVEL-ARCHITECTURE.md:1-3`, frozen and superseded) had three levels: L1 Shell, L2 Node.js, L3 Redis. The three-level model was simpler in the diagram, but the recovery story had a gap: when L2 Node.js crashed and L1 Shell was active, there was no Node.js tier to "recover to" if the L2 process could not be restarted. The four-level model closes the gap: the L3 Shell fallback is a permanent tier, not a transient one.

**Why.** The argument is about *recovery*, not capability.

1. **Recovery is a tier, not a state.** A system that "recovers" by waiting for an operator to restart a process is not recovering; it is waiting. A system that "recovers" by automatically falling back to a lower tier, and then automatically upgrading when the higher tier is healthy, is recovering. The four-level model is the smallest number of tiers that has both an automatic fallback and an automatic upgrade. Three tiers had the fallback but not the upgrade; five tiers would be over-engineered for the EKET workload.

2. **The fourth level is the same as the first, but the activation is different.** L0 and L3 are both `scripts/eket-slaver-auto.sh`. The difference is the trigger: L0 is the entry point when nothing else is installed (a fresh CI runner); L3 is the fallback when L2 crashes. The same code, two activation paths. This is what makes the maintenance cost bearable: there is *one* shell implementation, not two.

3. **The four-level model maps to the `ConnectionManager` 4-level ladder.** Inside the L1/L2 runtime, the `ConnectionManager` (`docs/architecture/DEGRADATION-STRATEGY.md:114-124`) has its own 4-level ladder: remote Redis → local Redis → SQLite → file queue. The two ladders compose: when the outer ladder is at L2 (Node.js) and the inner ladder is at L3-D (file queue), the system is *still* running — on shell, on file queue, with no Redis, no SQLite, no Node. The composition is the property.

The comparison table:

| Property | Four levels (chosen) | Three levels (rejected) | Two levels (rejected) |
|---|---|---|---|
| L0 Shell floor | Yes | Yes | No |
| L1 Rust | Yes | (folded into L2) | No |
| L2 Node.js | Yes | Yes | Yes |
| L3 Shell fallback | Yes (automatic when L2 down) | No | No |
| Automatic recovery to higher tier | Yes (circuit breaker + 30 s cooldown) | Partial (manual restart required) | No |
| Cold-start latency floor | ~5 ms (L0 shell) | ~5 ms (L1 shell) | ~500 ms (L2 Node) |
| Recovery procedure when host is gone | `git clone` | `git clone` + Node.js install | `git clone` + Node.js install + dependencies |
| Code surface to maintain | L0 shell + L1 Rust + L2 Node | L1 shell + L2 Node | L2 Node only |
| When it loses | Maintenance cost (three runtimes to keep in sync) | Recovery story (no automatic upgrade) | Survivability (no shell floor) |

The "rejected alternative's real strength" paragraph: a two-level model (Node.js + Redis) is the most common starting point in 2024–2026, and the most common failure mode is "Redis flaps, system halts." A three-level model adds a shell floor, which is the right next step. A four-level model adds an automatic L3 fallback, which is what closes the loop. Each level is a *refinement*, not a rewrite. A team that ships L2-only today and is happy with the throughput should not jump to four levels; the migration path is "add L1 Rust for performance, then add L0 Shell for survivability, then add L3 for automatic recovery." The honest version of the article acknowledges that the right number of levels depends on the workload.

The line-by-line evidence: the four-level decision is at `docs/adr/ADR-001-four-level-degradation.md:32-42` (the ladder, ranked remote Redis → local Redis → SQLite → file queue). The runtime degradation ladder is at `docs/architecture/DEGRADATION-STRATEGY.md:18-46` (the outer L1/L2/L3 ladder). The ConnectionManager 4-level ladder is at `docs/architecture/DEGRADATION-STRATEGY.md:114-124` (the inner L3-A/B/C/D ladder). The circuit breaker that governs the automatic recovery is at `docs/architecture/DEGRADATION-STRATEGY.md:228-246` (5-failure threshold, 30 s cooldown, 3 half-open probes). The L0 Slaver loop is at `scripts/eket-slaver-auto.sh:1-322` (322 lines, `wc -l`). The historical three-level model is at `docs/architecture/THREE-LEVEL-ARCHITECTURE.md:1-3` (566 lines, frozen and superseded).

A subtle point: the four-level model is *not* "shell, Rust, Node, shell." It is "shell, Rust, Node, shell-fallback." The L0 and L3 are the same code; the L1 and L2 are the runtime tiers. The numbering is "L0 = shell, L1 = Rust, L2 = Node, L3 = shell-fallback" and the asymmetry is intentional: the shell is at the bottom (L0) and the fallback (L3), and the runtime tiers are in the middle. A team that maps the levels to "shell, Rust, Node, shell" is missing the point: the fourth level is a *trigger context*, not a *capability* level.

---

## 9. Cross-cutting lessons

The seven choices above are not independent. They are seven expressions of a single thesis: **the protocol is the floor, the runtimes are interchangeable.** When that thesis holds, the unusual choices become inevitable. When it does not, the choices look arbitrary.

Three lessons generalize beyond EKET.

**Lesson 1 — Optimize for the failure mode, not the happy path.** The first agent does not need CAS. The first Slaver does not need a Saga. The first host does not need four degradation levels. But the *second* agent does, the *second* Slaver does, the *second* host does. The seven choices are optimized for the second agent / second Slaver / second host, not the first. Teams that adopt EKET at the first-agent stage are over-provisioned; teams that adopt it at the second-agent stage are correctly provisioned; teams that wait for the third-agent incident are under-provisioned. The right adoption moment is "the first time you have two concurrent executors," not "the first time you have one executor."

**Lesson 2 — The protocol is the contract; the runtimes are interchangeable.** The same `eket task:claim` operation works in L0 shell, L1 Rust, and L2 Node.js. The same `tickets` table is the source of truth. The same Saga compensates the same five steps. When the L2 Node.js process dies, the L3 Shell fallback picks up the same state and the same operations. The principle generalizes: any system that claims "graceful degradation" should be able to point at the protocol layer that survives the runtime change. If the protocol and the runtime are the same thing, there is nothing to degrade to.

**Lesson 3 — The state machine is the right primitive for finite, stateful workflows.** CRDTs are the right primitive for eventually-consistent documents. Pure event-sourcing is the right primitive for append-only audit logs. A state machine is the right primitive for "a finite set of resources that move through a defined set of states, with a defined set of transitions, and a defined recovery story." Most coordination layers fall into the third category. The mistake is to reach for the first two because they are fashionable, and to discover too late that they do not match the workload. The right primitive is the one that matches the workload, not the one that matches the trend.

A meta-lesson, candid and short: **the seven choices are the ones that, in our experience, are the most often asked about in design reviews.** They are not the only choices. They are not even necessarily the most important choices. They are the ones where the *default alternative* (Postgres, distributed locks, monorepo, pure-Rust, per-role protocols, CRDTs, three levels) is what most teams would pick, and the *load-bearing reason* for the unusual pick is not obvious from the surface. The article exists so that the next design review does not have to re-derive the reasoning from scratch.

---

## 10. References

- **Internal — protocol layer**:
  - `docs/articles/01-what-is-eket/en/article.md:1-225` — the thesis article, including the protocol layer summary
  - `docs/articles/02-why-you-need-eket/en/article.md:1-265` — the pain × solution × ROI argument
  - `docs/articles/04-three-repo-arch/en/article.md:1-318` — the lifecycle-separation thesis (Choice 3 deep-dive)
  - `docs/articles/05-four-level-degradation/en/article.md:1-314` — the four-level model (Choice 4 and Choice 7 deep-dive)
  - `docs/articles/06-master-slaver-protocol/en/article.md:1-536` — the state machine and CAS primitive (Choice 2 and Choice 6 deep-dive)
- **Internal — ADRs**:
  - `docs/adr/ADR-001-four-level-degradation.md:32-42` — the four-level decision
  - `docs/adr/ADR-002-master-slaver-mode.md:23-30` — the Master/Slaver unification decision
  - `docs/adr/ADR-003-file-queue-fallback.md:96-131` — the file-queue floor decision
- **Internal — architecture**:
  - `docs/architecture/THREE_REPO_ARCHITECTURE.md:1-338` — the three-repo spec
  - `docs/architecture/three-repo-deployment.md:242-249` — the permission matrix
  - `docs/architecture/three-repo-deployment.md:301-304` — the submodule-or-sibling escape hatch
  - `docs/architecture/DEGRADATION-STRATEGY.md:1-591` — the four-level authoritative spec
  - `docs/architecture/DEGRADATION-STRATEGY.md:18-46` — the runtime degradation ladder
  - `docs/architecture/DEGRADATION-STRATEGY.md:114-124` — the ConnectionManager 4-level ladder
  - `docs/architecture/DEGRADATION-STRATEGY.md:228-246` — the circuit breaker
  - `docs/architecture/THREE-LEVEL-ARCHITECTURE.md:1-3` — the historical (frozen) three-level
- **Internal — source code**:
  - `node/src/core/task-checkpoint.ts:85-108` — `_casUpdate` with `WHERE version = ?` guard
  - `node/src/core/saga-executor.ts:22-66` — SagaExecutor with reverse-order compensation
  - `node/src/core/state-reconciler.ts:96-348` — file-queue WAL replay
  - `rust/crates/eket-core/src/ticket.rs:100-103` — atomic write `tmp → rename`
  - `rust/crates/eket-core/src/ticket.rs:72-145` — `set_status` with `tmp → rename`
  - `rust/crates/eket-core/src/election.rs:79-84` — `ElectionLevel { File, Sqlite, Redis }`
  - `rust/crates/eket-core/src/election.rs:294` — `SETNX` for master election (not ticket claim)
  - `rust/crates/eket-core/src/saga.rs:30-94` — SagaExecutor Rust mirror
  - `rust/crates/eket-core/src/saga.rs:233-288` — `middle_step_fails_rolls_back` unit test
- **Internal — protocol schemas**:
  - `protocol/state-machines/ticket-status.yml:1-111` — 17 granular states with `who_can_transition` lists
  - `protocol/state-machines/ticket-status.yml:14-91` — the `ready → in_progress` transition with `who_can_transition: [slaver]`
  - `protocol/state-machines/ticket-status.yml:67-86` — the `review → gate_review → merged` transitions
- **Internal — scripts**:
  - `scripts/eket-slaver-auto.sh:1-322` — L0 Slaver loop, 322 lines (`wc -l`)
  - `scripts/heartbeat-monitor.sh:1-390` — L0 heartbeat, 390 lines (`wc -l`)
  - `scripts/ticket-board.sh:1-328` — L0 board view, 328 lines (`wc -l`)
  - `scripts/eket-start.sh:1-883` — L0 Master startup, 883 lines (`wc -l`)
  - `scripts/validate-ticket-pr.sh:1-78` — 4-rule CI gate for ticket PRs (78 lines, `wc -l`)
  - `scripts/check-ticket-immutability.sh:1-94` — 7-field pre-commit gate for ticket immutability (94 lines, `wc -l`)
- **Internal — headline numbers**:
  - `README.md:140-145` — `task:claim` 19× faster, cold start 187×, memory 10×
  - `docs/getting-started/QUICKSTART.md:10-14` — per-mode startup / memory table
  - `benchmarks/baseline.json:5-6` — file-queue p95 floor (enqueue 0.77 ms, dequeue 1.54 ms)
- **Memory KB**:
  - `confluence/memory/MEMORY.md:1-91` — top-level index
  - `confluence/memory/pitfalls/slaver-worktree-code-loss.md:1-46` — the lesson that motivated the lifecycle split
- **Glossary**: [`docs/articles/GLOSSARY.md:1-46`](../../GLOSSARY.md)
- **Series navigation**:
  - Previous: [`02-why-you-need-eket`](../../02-why-you-need-eket/en/article.md) — the pain × solution × ROI argument
  - Next: [`04-three-repo-arch`](../../04-three-repo-arch/en/article.md) — the lifecycle-separation deep dive
