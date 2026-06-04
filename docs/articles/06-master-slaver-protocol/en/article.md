# 06 — Master-Slaver Protocol: claim → work → review → merge → resume

> **TL;DR** — The Master-Slaver protocol is the **state machine** that turns an inbox of requirements into a stream of merged pull requests. It has **5 user-facing states** (READY / IN_PROGRESS / IN_REVIEW / DONE / RESUME), **5 transitions** (claim / complete / review / merge / resume), an **atomic claim** primitive (SQLite CAS, see `node/src/core/task-checkpoint.ts:48-108`), and a **Saga 5-step completion** (validate → test → checkpoint → commit → notify). The protocol is **the same** for humans and AI: a human claiming a ticket is the same database transition as `eket task:claim TASK-642` invoked by an agent. The state lives in SQLite (`protocol/state-machines/ticket-status.yml:1`); the model does not.

> **Key Takeaways**
> 1. The state machine is the protocol; everything else is policy.
> 2. CAS turns a race-prone multi-Slaver environment into a serializable single-writer story.
> 3. The Saga pattern makes `task:complete` recoverable: any step can fail and the system compensates.
> 4. Master never claims tickets — that is not a stylistic choice, it is a safety property.
> 5. Multi-Master and multi-Slaver are not edge cases; they are the steady state at >2 humans.

---

## Executive Summary

**For decision-makers (read this and walk away):**

| Question | Answer |
|---|---|
| What is the protocol? | A 5-state finite-state machine implemented once, in SQLite, and consumed by humans, AI agents, and CI alike. |
| What is a "claim"? | An atomic CAS on a ticket row; whoever flips it from `READY` to `IN_PROGRESS` owns the work, full stop. |
| What if the Slaver crashes mid-task? | A checkpointed RunState (see `node/src/core/task-checkpoint.ts:38-193`) lets a fresh Slaver `eket task:resume` from the last persisted step. |
| What is the "no human in the loop for claims" rule? | Master is **forbidden** from claiming tickets it creates. If Master self-claims, the audit trail collapses and the protocol's separation of concerns is destroyed. |
| What is the win? | Predictable throughput: ticket → branch → PR → review → merge, with every step recoverable and every transition auditable. |
| What is the cost? | You must run a SQLite database (or a state-file fallback) and respect the transition table. |

The rest of this article is for implementers.

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

Article 01 introduced EKET as a coordination protocol. Article 03 will defend the seven non-obvious technical choices. This article opens up the **mechanism** — the state machine that every other piece of EKET depends on, and the only piece that *must* be implemented in every degraded level (L0 Shell, L1 Rust, L2 Node, L3 fallback).

Why does this state machine deserve a 2,500-word article?

Because **it is the protocol.** The three-repo split, the four-level degradation, the expert panel, the dashboard — every one of those is policy *on top of* the state machine. Get the state machine wrong, and no amount of dashboard polish will save the throughput. Get it right, and the rest of EKET composes for free.

Three failure modes forced the state machine into existence:

1. **Two agents, one ticket.** In early 2025, an internal team ran two Claude Code sessions against the same Linear board. Both "claimed" the same ticket. Both opened PRs. The second PR rebased on top of the first and silently overwrote 200 lines of test code. The bug shipped. This is the failure that CAS exists to prevent.

2. **A 30-minute agent run, then a crash.** Another team watched an agent run a 30-step refactor across 18 files. The agent died at step 21. The 21 steps of work lived only in the model's context window — which died with it. The team had to redo the entire 30 minutes by hand. This is the failure that checkpoints exist to prevent.

3. **A PR that nobody could review.** A third team let agents open PRs with no narrative, no test report, no link to the ticket that authorized the work. Reviewers stared at 1,200-line diffs and rubber-stamped them. The protocol needed a place to put the *why* before the *what* landed. That place is the Saga's `validate` step.

The state machine in `protocol/state-machines/ticket-status.yml:1` is the v0.1.0 answer to all three.

> "If two writers can flip a row at the same time, you don't have a workflow — you have a coin flip that ships to production."
> — *EKET design note, 2026-03*

---

## 2. The Big Idea

The protocol is one bet, repeated three times.

**Bet 1 — state lives in one place.** Not in the model's context. Not in the agent's memory. Not in the comment thread on a PR. The state of a ticket — who owns it, what stage it is in, when it last checkpointed — lives in one row of one SQLite table. The model is replaceable; the row persists.

**Bet 2 — every transition is a CAS.** Not a "read then write" — that has a TOCTOU window. Not a "check the lock file" — that has a crash window. A *compare-and-swap*: the transition is encoded as `UPDATE ... WHERE state = 'OLD_STATE' AND assignee IS NULL`, and the database tells you whether the row matched. Either you flipped the row, or someone else did. There is no in-between.

**Bet 3 — completion is a Saga, not a step.** "I'm done" is not one event. It is five events, all of which can fail, and the protocol must compensate for any that fail. The SagaExecutor in `node/src/core/saga-executor.ts:22-66` and its Rust mirror in `rust/crates/eket-core/src/saga.rs:30-94` are not abstract CS exercises — they are how `eket task:complete` is wired in production.

These three bets compose: a single state, guarded by CAS, advanced by a Saga. Remove any one of them and the protocol collapses into one of the three failure modes above.

### 2.1 The actors are roles, not processes

Article 01 introduced the 1–5 humans + N agents model. The state machine encodes the model as **role labels**: `master`, `slaver`, `automation`. These are not user accounts; they are *transitions* in the `who_can_transition` list of each state (see `protocol/state-machines/ticket-status.yml:14-91`). A single human can be Master in one project and Slaver in another; the same Claude Code session can be Slaver in two projects simultaneously. The protocol doesn't care about *who* — it cares about *which role asserted this transition*.

### 2.2 The state machine is the contract

There is no "Master said yes" event in the protocol. There is a transition from `review` to `gate_review` and then to `merged` (`protocol/state-machines/ticket-status.yml:67-86`), and that transition is `who_can_transition: [master]`. The model behind "Master said yes" is irrelevant; the row flip is what counts.

This is what makes the protocol *tool-agnostic*. Claude Code, Cursor, Codex, and Gemini all flip the same rows.

---

## 3. How It Works

This is the long section. We will cover the state machine itself, the atomic claim, the Saga 5-step, the failure modes, the worked example, and finally the multi-Master / multi-Slaver dynamics.

### 3.1 The 5 user-facing states

The state machine defined in `protocol/state-machines/ticket-status.yml:1` is granular (17 states) because it must encode every legitimate interaction. But 17 states are too many for an article or a dashboard. We project them onto **5 user-facing states** that the dashboard, the CLI, and the hooks layer all expose:

| User-facing state | Granular states aggregated | Description | Who can advance it |
|---|---|---|---|
| `READY` | `ready` | Ticket is claimed by no one, branch is uncreated, AC is fixed. | Slaver (via `claim`) |
| `IN_PROGRESS` | `in_progress`, `testing`, `dev_complete`, `blocked`, `changes_requested` | Slaver owns it, branch exists, work is happening. | Slaver (via `complete`) |
| `IN_REVIEW` | `review`, `gate_review` | PR is open, Master is reading, automation is checking. | Master (via `review`) or automation (via `gate_review`) |
| `DONE` | `merged`, `done` | PR merged, ticket archived, branch promoted through `feature → testing → main → miao`. | Master (via `merge`) |
| `RESUME` | (a transient marker, not a granular state) | A Slaver crashed or a PR was rejected. The ticket re-enters `IN_PROGRESS` with a checkpoint pointer. | Slaver (via `resume`) |

`RESUME` is special. It is not a state in the YAML because **the state machine has no "paused" state**: a crashed Slaver leaves the row in `in_progress` until either `task:resume` advances it or `task:reassign` (a Master-only operation) hands it to a different Slaver. `RESUME` is the *name of the operation* that re-enters the state machine at `in_progress` with a non-null `checkpoint_version`.

```
                    ┌──────────────┐
                    │   INBOX      │  ← humans post requirements
                    └──────┬───────┘
                           │ epic:create
                           ▼
                    ┌──────────────┐
            ┌───────│    READY     │  ← ticket in jira/tickets/
            │       └──────┬───────┘
            │              │ claim  (atomic CAS on SQLite)
            │              ▼
            │       ┌──────────────┐
            │       │ IN_PROGRESS  │  ← checkpoint, branch, work
            │       └──────┬───────┘
            │              │ complete (Saga 5-step)
            │              ▼
            │       ┌──────────────┐
            │       │ IN_REVIEW    │  ← PR open, Master + automation
            │       └──────┬───────┘
            │              │ review (pass) | changes_requested
            │              ▼
            │       ┌──────────────┐
            │       │    DONE      │  ← merged: feature → testing → main → miao
            │       └──────┬───────┘
            │              │
            │              │ resume (from last checkpoint)
            └──────────────┴─► IN_PROGRESS  (state unchanged, Slaver changed)
```

The diagram collapses RESUME into a back-edge — the state does not change, but the operator and the checkpoint pointer do. That is intentional: from the database's perspective, RESUME is just another `in_progress` row, owned by a different `assignee` (or the same one) with a different `checkpoint_version`. The dashboard labels it RESUME because the *operator* is recovering, not starting.

### 3.2 The 5 transitions

Each transition is a single SQL statement (or a Saga, in the case of `complete`) wrapped by a role check. The transition table below is lifted directly from the YAML.

| Transition | User-facing name | From state(s) | To state | Implementation | Role check |
|---|---|---|---|---|---|
| `claim` | READY → IN_PROGRESS | `ready` | `in_progress` | `UPDATE tickets SET assignee = ?, state = 'in_progress', checkpoint_version = 0 WHERE id = ? AND state = 'ready' AND assignee IS NULL` | `who_can_transition: [slaver]` |
| `complete` | IN_PROGRESS → IN_REVIEW | `in_progress` (also `testing`, `dev_complete`, `changes_requested`) | `review` | `SagaExecutor.execute(state)` with steps `validate → test → checkpoint → commit → notify` | `who_can_transition: [slaver]` |
| `review` | IN_REVIEW → DONE | `review` | `gate_review` → `merged` → `done` | `UPDATE tickets SET state = 'merged' WHERE id = ? AND state IN ('review','gate_review')` plus `git merge` to `testing` | `who_can_transition: [master, automation]` |
| `merge` | DONE (final promotion) | `merged` | `done` | `git push testing → main → miao` via `scripts/sync-branches.sh` | `who_can_transition: [master]` |
| `resume` | RESUME → IN_PROGRESS | `in_progress` (stale) | `in_progress` (fresh) | `loadCheckpoint(task_id)` + re-attach to ticket | `who_can_transition: [slaver]` |

`claim` and `resume` are the two CAS operations. `complete` is the only Saga. `review` and `merge` are role-gated git operations, not state mutations.

### 3.3 Atomic claim — why CAS, why SQLite

A Slaver calling `eket task:claim TASK-642` is asking the database to do exactly one thing: *if this row is still in `ready` and unowned, give it to me*. In SQLite, the primitive is the `WHERE` clause of an `UPDATE`:

```sql
-- claim.ts (conceptual; actual implementation in task-checkpoint.ts:55-65)
UPDATE tickets
SET assignee = ?, state = 'in_progress', claimed_at = ?
WHERE id = 'TASK-642'
  AND state = 'ready'
  AND assignee IS NULL;
```

If the row matches, the Slaver owns it. If `info.changes === 0`, somebody else got there first (or the ticket was cancelled while the Slaver was reading), and the Slaver moves on to the next `READY` ticket. There is no `SELECT` followed by an `UPDATE` — that two-statement pattern has a TOCTOU window where two Slavers can both see `assignee IS NULL` and both try to UPDATE. The single `UPDATE` collapses the read and the write into one atomic operation.

The same pattern is used in `node/src/core/task-checkpoint.ts:85-108` for checkpoint updates:

```typescript
// task-checkpoint.ts:85-108 (verbatim)
private _casUpdate(checkpoint: TaskCheckpoint, data: string, now: number): Result<void> {
  const newVersion = checkpoint.version + 1;
  const stmt = this.db.prepare(`
    UPDATE task_checkpoints
    SET data = ?, version = ?, updated_at = ?
    WHERE task_id = ? AND version = ?
  `);
  const info = stmt.run(data, newVersion, now, checkpoint.taskId, checkpoint.version);

  if (info.changes === 0) {
    // CAS conflict — fetch current version for better error message
    const current = this.db
      .prepare('SELECT version FROM task_checkpoints WHERE task_id = ?')
      .get(checkpoint.taskId) as { version: number } | undefined;

    throw new CheckpointCASError(
      checkpoint.taskId,
      checkpoint.version,
      current?.version ?? -1
    );
  }
  // ...
}
```

The `WHERE version = ?` clause is the CAS guard. Two Slavers trying to checkpoint the same `task_id` will both read `version = 4`, both prepare an UPDATE setting `version = 5`, but only one's UPDATE will affect a row — the other will see `info.changes === 0` and throw `CheckpointCASError`. The losing Slaver is expected to re-load the checkpoint and retry from the latest version.

#### 3.3.1 Why SQLite and not Redis

The protocol defines three election levels (`rust/crates/eket-core/src/election.rs:79-84`): `File < Sqlite < Redis`. SQLite is the floor of correctness for the *ticket* state machine even when Redis is available, because:

1. **SQLite gives us serializable writes by default.** A single writer holds the database lock during the `UPDATE`; concurrent writers queue. This is the simplest possible CAS implementation — we don't need a Lua script or a `WATCH`/`MULTI` dance.
2. **WAL mode (`PRAGMA journal_mode=WAL`) gives readers non-blocking access.** Multiple Slavers can `SELECT` the ticket board while one Slaver is doing the CAS `UPDATE`. Without WAL, a long-running query would block the claim; with WAL, readers see the pre-CAS snapshot.
3. **SQLite is durable in a way Redis is not by default.** A `BUSY` timeout of 5 seconds is a contract; a Redis AOF rewrite is a configuration. When a Slaver crashes mid-checkpoint, the checkpoint row on disk is the source of truth.
4. **The fallback chain is local-first.** `node/src/core/state-reconciler.ts:96-348` reads `.json` and `.msg` files from `queueDir` and replays them into SQLite in timestamp order. This means a Slaver can keep claiming tickets even when Redis is down — and once Redis comes back, the StateReconciler publishes the queued messages to the Redis channel.

The Lua script in `rust/crates/eket-core/src/election.rs:43-49` is reserved for *master election* (where Redis is the right tool — see the ADR), not for ticket claims. The protocol deliberately separates the two concerns: **master election uses Redis SETNX, ticket state uses SQLite CAS.** This is a load-bearing choice — using Redis for ticket state would make tickets invisible during a Redis restart; using SQLite for master election would make the master lock fragile under high write contention.

#### 3.3.2 The atomic write primitive

A second CAS-flavored primitive lives in `node/src/core/state/atomic.ts:19-42`. The function `atomicWrite` is the on-disk companion to the SQL CAS: it writes a temp file in the same directory as the target, then `rename`s over the target. POSIX guarantees `rename` is atomic on the same filesystem, so a reader of the target will see either the old content or the new content — never a half-written file. This is the primitive that `rust/crates/eket-core/src/ticket.rs:100-103` mirrors in Rust:

```rust
// ticket.rs:100-103 (verbatim)
// Atomic write: tmp → rename
let tmp = self.path.with_extension("md.tmp");
std::fs::write(&tmp, &new_raw).map_err(EketError::Io)?;
std::fs::rename(&tmp, &self.path).map_err(EketError::Io)?;
```

Why mention it in a state-machine article? Because the state machine is reflected in the markdown ticket files in `jira/tickets/`, and a corrupted markdown file is just as fatal as a corrupted SQLite row. The `tmp → rename` pattern is what guarantees that `jira/tickets/TASK-642.md` is always either pre-claim or post-claim — never mid-claim.

### 3.4 The Saga 5-step completion

`eket task:complete TASK-642` is not one operation. It is a Saga with five steps, each of which can fail and trigger compensation of the steps that came before.

The 5 steps, lifted from the production wiring:

| Step | What it does | Failure mode | Compensation |
|---|---|---|---|
| 1. **validate** | Run `CompletionValidator.validateCompletion(ticketId, changedFiles)` (see `node/src/core/completion-validator.ts:17-35`). Checks that all `- [ ]` boxes in the ticket's Acceptance Criteria are checked, that the architecture dimension has no conflicting patterns in `confluence/memory/lessons/`, and that the code style dimension is at least consistent. | ACs unchecked; architecture conflict flagged. | If validate fails, no other step has run. There is nothing to compensate. The Saga exits with `failedStep: "validate"`. |
| 2. **test** | Run the test suite (`npm test` for the `node/` package, `cd rust && cargo test` for the Rust package). The branch must be green before completion. | Test failure, lint failure, type error. | The previous step (validate) is read-only. Compensation is a no-op. |
| 3. **checkpoint** | Persist the final `TaskCheckpoint` via `TaskCheckpointStore.saveCheckpoint` (`node/src/core/task-checkpoint.ts:48-83`). The checkpoint includes `agentFacingItems`, `fullHistoryItems`, and `executedToolCalls` so a future `task:resume` can skip already-executed tool calls. | CAS conflict (another Slaver bumped the version), SQLite write error. | The previous step (test) is reversible: re-running it is safe because the Slaver can `git checkout` the working tree. Saga records compensation error if the revert fails. |
| 4. **commit** | `git add` the changed files, `git commit` with a message that includes the ticket ID, and push the branch to the remote. | Push rejected (remote ahead), pre-commit hook failure, branch protection violation. | `git reset --soft HEAD~1` to undo the commit; the test step is unaffected. |
| 5. **notify** | Emit a `task:completed` event to the EventBus (`node/src/core/event-bus.ts`), open the PR via the Git provider, and write a summary to the ticket's `## 交付记录` section. | GitHub API down, EventBus subscriber failure. | Compensation here is "leave a paper trail of the failure in the ticket file" — the protocol never silently drops a notification. |

The reference implementation lives in `node/src/core/saga-executor.ts:22-66`:

```typescript
// saga-executor.ts:30-66 (verbatim)
async execute(initialState: T): Promise<SagaResult<T>> {
  let state = initialState;
  const completed: Array<SagaStep<T>> = [];
  const compensationErrors: Array<{ step: string; error: Error }> = [];

  for (const step of this.steps) {
    try {
      state = await step.forward(state);
      completed.push(step);
    } catch (err) {
      // Rollback completed steps in reverse order
      for (const done of [...completed].reverse()) {
        try {
          await done.compensate(state);
        } catch (compErr) {
          compensationErrors.push({ step: done.name, error: compErr as Error });
        }
      }
      return {
        success: false,
        state,
        completedSteps: completed.map((s) => s.name),
        failedStep: step.name,
        error: err as Error,
        compensationErrors,
      };
    }
  }
  // ...
}
```

The Rust mirror is in `rust/crates/eket-core/src/saga.rs:44-93` and has the same compensation-in-reverse-order contract. The unit test in `rust/crates/eket-core/src/saga.rs:233-288` (`middle_step_fails_rolls_back`) asserts that when step 3 fails, steps 2 and 1 are compensated in that order — and the test fails if the order is reversed. This is not a nice-to-have; it is the protocol.

### 3.5 The "no human in the loop for claims" rule

This rule is the most under-documented part of the protocol and the most-violated. Let us state it clearly:

> **Master never claims a ticket.**

Why?

**1. Audit trail symmetry.** Every `READY → IN_PROGRESS` transition is an event in the audit log. If Master and Slaver can both claim, the log is no longer "who is doing the work" — it is "who decided to do the work and who is doing it". The two questions collapse into one, and the answer to "who is accountable for the merge?" becomes "whoever flipped the row first", which is not accountability.

**2. Role inversion destroys the gate.** The state `review` is gated by `who_can_transition: [master]` (`protocol/state-machines/ticket-status.yml:67-69`). If Master is also a Slaver, Master can self-approve. The "independent reviewer" property vanishes, and the entire `gate_review` step becomes a formality that the agent can rubber-stamp.

**3. Conflict-of-interest is enforced by the protocol, not by trust.** In a human-only team, the rule "the reviewer is not the author" is social. In EKET, the rule is *structural*: the row that Master would claim is the row that Master would have to review. The state machine makes this impossible by encoding role as a column on the transition, not as a label on the actor.

**4. Operational debugging.** When a Slaver run fails at step 3, the operator of `task:resume` must be a different role than the author of the original run. If Master and Slaver are the same person/agent, the operator has no fresh perspective on the failure — they are debugging their own checkpoint.

**What if Master really wants to do the work?** The protocol has the answer: Master writes the ticket, dispatches a Slaver, and observes. If no Slaver is available, the ticket stays in `READY` (or moves to `blocked` if blocked-by-resource). The work is still done by a Slaver, even if Master types the keystrokes — the role label is set explicitly to `slaver` for the duration of the run, and the audit log records both the keystroker (the human) and the role (the protocol assignment).

**Violation example.** In a v0.1 internal test, a Master Claude instance was given a ticket it had authored. It claimed the ticket, did the work, opened the PR, and approved the PR — all four transitions went through a single role. The PR was correctly merged. The audit log correctly recorded the sequence. The bug shipped anyway, because the *intent* of the protocol — that an independent role review the work — was not enforced; only its *form* was. The protocol cannot fix this for you, but it can refuse to be the tool that enabled it: `who_can_transition: [slaver]` on the `ready` state is a SQL constraint, not a guideline.

### 3.6 Failure modes and recovery

The protocol is designed so that **any failure is recoverable without losing the work done so far**. The three failure modes we care about:

#### Failure mode 1 — Slaver crash mid-task

**Symptom.** A Slaver's process dies (OOM, network partition, model provider timeout) after `task:claim` but before `task:complete`. The ticket row is stuck in `in_progress`, the branch exists, the checkpoints are persisted.

**Detection.** The `SlaverWatchdog` (`node/src/core/slaver-watchdog.ts:7.0K`) pings each registered Slaver every 30s. A Slaver that misses 3 heartbeats is declared `stale`.

**Recovery.** A fresh Slaver (or a human running `eket task:resume TASK-642`) calls `loadCheckpoint(taskId)`, which reads the `task_checkpoints` table:

```sql
SELECT * FROM task_checkpoints WHERE task_id = 'TASK-642';
```

The `data` column is a JSON blob with the three-layer RunState (`agentFacingItems`, `fullHistoryItems`, `executedToolCalls`). The fresh Slaver reconstructs the model's view, skips the already-executed tool calls (idempotency via `isToolCallAlreadyExecuted` at `node/src/core/task-checkpoint.ts:160-168`), and continues from `stepIndex`.

**Why it works.** The checkpoint is a SQL row, not a model context. The model is replaceable; the row is durable. The cost is that the fresh Slaver must re-read the codebase to rebuild its context, which is why the arena index (`index_arena.json` mentioned in the recent perf commit) is load-bearing for recovery speed.

#### Failure mode 2 — PR rejected at review

**Symptom.** Master runs `eket gate:review TASK-642` (or an automation runs the same command) and returns `changes_requested`. The transition is `review → changes_requested` (`protocol/state-machines/ticket-status.yml:80-81`), which is `who_can_transition: [master]`.

**Detection.** The transition is logged in the audit table. The PR is closed (or marked "Changes Requested" by the Git provider).

**Recovery.** The Slaver reads the review comments, fixes the issues, and calls `task:complete` again. The transition `changes_requested → in_progress` is allowed (`who_can_transition: [slaver]`), and the Saga runs again from step 1. Note that `validate` will re-read the ticket file — if the ACs were unchecked, the Slaver is forced to check them *as part of the comment resolution*, not after. The protocol encodes the lesson "review feedback must be visible in the ticket".

**Why it works.** The state machine has a back-edge: `changes_requested` is a *real* state, not a comment. The Slaver cannot pretend the review never happened; the row records the round-trip.

#### Failure mode 3 — Checkpoint stale after dependency change

**Symptom.** A Slaver claimed `TASK-642` at v1, made 3 checkpoints (v2, v3, v4), paused for a day, and resumed. The ticket's dependency on `TASK-641` was merged during the pause, which changed the file `TASK-642` was supposed to modify. The fresh re-read of the file shows the Slaver that its previous work was based on stale assumptions.

**Detection.** `task:resume` runs the Slaver's `validate` step on the *new* state of the file. If the previous tool calls would have produced different output on the new file, the Slaver is expected to call `task:abort` (a Master-gated rollback) and start over.

**Recovery.** The Slaver's `executedToolCalls` list in the checkpoint is now an *anti-checklist*: the Slaver knows which calls are stale and must re-run. The protocol does not silently merge partial work; it forces the Slaver to make the staleness visible. In practice, this means the Slaver opens a fresh PR referencing the original ticket and the dependency that caused the staleness, and Master closes the old PR.

**Why it works.** The checkpoint includes the file hashes of the inputs the Slaver saw when it ran the tool calls. If a hash has changed, the tool call is stale. The protocol's "executed tool calls are a list, not a transaction log" model means staleness is detectable, not hidden.

### 3.7 Multi-Master and multi-Slaver

The protocol assumes a single Master and multiple Slavers, but it does not *require* it. Two important variants:

#### Variant 1 — multi-Slaver, single Master (the steady state at >2 humans)

In `docs/architecture/MULTI_INSTANCE_DESIGN.md:42-70` we see the per-PID instance directory layout:

```
.eket/
├── instances/
│   ├── master_20260407_143045_12345/
│   └── slaver_frontend_20260407_143102_12346/
├── session_ids/
│   ├── pid_12345.id → "master_..."
│   └── pid_12346.id → "slaver_frontend_..."
└── alive_instances.txt
```

Each Slaver has its own PID-scoped session file, so two terminals running `eket task:claim` simultaneously do not collide on identity (`docs/architecture/MULTI_INSTANCE_DESIGN.md:75-90`). The ticket claim itself is the SQLite CAS — even if 50 Slavers call `task:claim` in the same millisecond, only one will succeed. The 49 losers are expected to call `task:claim` again on the next available ticket.

**Specialty routing.** A Slaver can declare a specialty (`frontend`, `backend`, `rust`, `node`) and the claim will skip tickets whose `specialty_required` field does not match. This is a soft filter, not an authorization — a Slaver can claim a `backend` ticket even if it declared `frontend`, but the dashboard surfaces the mismatch. The protocol trusts Slaver judgment, not the filter.

**Worktree isolation.** When a Slaver claims a ticket, `WorktreeManager` (`node/src/core/worktree-manager.ts`) creates a git worktree under `.eket/worktrees/<slaver-id>/<task-id>` so that two Slavers working on the same repo do not step on each other's working tree. This is a git-level concern, not a state-machine concern, but it is part of the "multi-Slaver" guarantee.

#### Variant 2 — multi-Master (rare, but supported)

The `MasterElection` class (`node/src/core/master-election.ts:99-121`, mirrored in `rust/crates/eket-core/src/election.rs:141-`) supports **warm standby**: a primary Master, up to N backup Masters, and automatic promotion of a backup when the primary's lease expires. The `epoch` field in `ElectionResult` (`rust/crates/eket-core/src/election.rs:87-93`) is a monotonic counter incremented via `INCR eket:master:epoch`; if two Masters both believe they are primary, the higher epoch wins.

When does multi-Master make sense?

- **High-availability deployments** where Master downtime blocks the team. The warm-standby loop in `node/src/core/master-election.ts:79-85` runs the failover in <30s.
- **Time-zone bridging** where a human Master in Tokyo signs off while a human Master in San Francisco is asleep. Two human Masters can co-exist if they agree on a primary (the one with the lowest epoch is the tie-breaker).

When does it *not* make sense?

- **Single-team projects** where the ceremony of warm-standby outweighs the benefit. In that case, run one Master and let the Slaver fleet do the parallelism.

**Caveat — Master can never claim tickets, even in multi-Master.** The "no human in the loop for claims" rule applies to *every* Master instance. If Master A and Master B both sign in, neither can claim; both can review, merge, and reassign. The protocol's safety properties scale horizontally without modification.

### 3.8 Worked example — TASK-642 from claim to merge

A full lifecycle, drawn from the ticket this article is filed under (`jira/tickets/EPIC-008/TASK-642.md`):

**t=0 — Master creates the ticket.** A human Master writes `jira/tickets/EPIC-008/TASK-642.md` with status `READY`, specialty `tech-writer`, ACs checked. The Slaver-Subscribers hook (`notify_slavers` side-effect in `protocol/state-machines/ticket-status.yml:46`) wakes any Slaver whose specialty matches.

**t=2m — Slaver claims the ticket.** Slaver-B (Claude Code, role: slaver, specialty: tech-writer) calls `eket task:claim TASK-642`. The protocol executes:

```sql
UPDATE tickets
SET assignee = 'slaver-b', state = 'in_progress', claimed_at = '2026-06-04T10:02:00Z', checkpoint_version = 0
WHERE id = 'TASK-642' AND state = 'ready' AND assignee IS NULL;
-- info.changes = 1 → claim succeeds
```

Slaver-B writes a `claimed_tasks.txt` to its instance directory (`docs/architecture/MULTI_INSTANCE_DESIGN.md:53-59`).

**t=2m — Slaver creates branch and worktree.** Slaver-B runs `git worktree add .eket/worktrees/slaver-b/TASK-642 -b feature/TASK-642 article/06` and `git checkout -b feature/TASK-642 article/06`. The branch name is part of the protocol (`scripts/sync-branches.sh`); Master will scan for branches matching `feature/TASK-*` when reviewing.

**t=2m–t=120m — Slaver works, checkpoints every ~10 minutes.** Each checkpoint is a CAS UPDATE on `task_checkpoints` with `version` incrementing from 0 to N. The Slaver's `executedToolCalls` list grows with each tool invocation. The `stepIndex` tracks progress through the article outline (1. Motivation, 2. Big Idea, 3. How It Works, 4. Trade-offs, 5. Implementation, 6. Lessons, 7. References).

**t=120m — Slaver runs `task:complete TASK-642`.** The SagaExecutor runs the 5 steps:

1. **validate** — `CompletionValidator.checkAcceptanceCriteria` reads `TASK-642.md`, finds all ACs checked. Pass.
2. **test** — `npm run lint` passes, `npm test` passes for the article-specific tests. Pass.
3. **checkpoint** — `TaskCheckpointStore.saveCheckpoint` with `version = N+1`. The CAS UPDATE matches; no conflict. Pass.
4. **commit** — `git add docs/articles/06-*`, `git commit -m "feat(articles): publish 06 — master-slaver protocol"`, `git push -u origin feature/TASK-642 article/06`. Pass.
5. **notify** — The `task:completed` event fires; the Git provider opens a PR with title and body populated from the ticket; the ticket file gets a `## 交付记录` section with the PR URL.

The Saga returns `success: true`, the executor transitions the ticket to `review`, and the Slaver awaits feedback.

**t=125m — Master reviews the PR.** Master reads the diff, runs `eket gate:review TASK-642`, finds no issues, and the transition `review → gate_review → merged` runs. The promotion script `scripts/sync-branches.sh` syncs `feature/TASK-642 article/06 → testing → main → miao`. The ticket row flips to `done`.

**t=126m — Slaver is free for the next ticket.** Slaver-B's claimed-tasks list shrinks; it can call `eket task:claim` again on the next READY ticket.

**What if step 3 (checkpoint) fails at t=120m?** The CAS conflict means another Slaver bumped `task_checkpoints.version` (a network glitch, a re-claim after a watchdog eviction). The SagaExecutor compensates by reverting step 4 (no commit happened yet) and step 2 (no test changes happened). The Slaver reloads the checkpoint at the new version, replays any unexecuted tool calls, and retries the Saga from step 3. The user sees a "retry" log entry and the ticket stays in `in_progress` — no data loss, no double-commit.

---

## 4. Trade-offs & Alternatives

| Alternative | What it does | What EKET does differently |
|---|---|---|
| **GitHub branch protection + required reviewers** | GitHub-native review gating | EKET gates by *role* encoded in the state machine; GitHub gates by *account* on a branch. EKET survives a reviewer vacation by reassigning; GitHub requires manual unblock. |
| **Linear / Jira workflows with automation rules** | Configurable state transitions with side effects | The same idea, but EKET's state machine is in code (`protocol/state-machines/ticket-status.yml`) and in SQLite; Linear's is in a vendor DB you cannot inspect. |
| **GitOps PR pipelines (ArgoCD, Flux)** | State lives in git, promotions are git operations | EKET uses git for *artifacts* (branches, PRs) but the *state* lives in SQLite. GitOps cannot answer "who owns TASK-642 right now" without an external index. |
| **Temporal / Cadence durable workflows** | Workflow engines with built-in Saga support | EKET's Saga is 5 steps; Temporal supports arbitrary DAGs. EKET wins on simplicity and on the ability to run on L0 shell without a workflow server. |
| **Custom Slack-based claiming ("first to react owns it")** | Ad-hoc, low-ceremony | Ad-hoc claiming scales to ~3 humans, then collapses under the audit problem. EKET's CAS makes the claim auditable and idempotent. |

### When the Master-Slaver protocol is the wrong tool

- **Single-developer, single-agent projects.** The CAS and Saga overhead is dead weight.
- **Workflows that need branching logic (a ticket can take two paths).** EKET's state machine is a DAG, but the edges are fixed in YAML. If your workflow has conditional edges, you need a workflow engine (Temporal) or you encode the conditional in the ticket's ACs.
- **Teams that cannot run SQLite.** EKET can fall back to file-queue mode (`docs/adr/ADR-003-file-queue-fallback.md`), but file-queue mode is L0, not the steady state. If your hosting environment cannot run any of L0/L1/L2, EKET is not the right tool.

---

## 5. Implementation Notes

### 5.1 What you actually run

```bash
# As a Slaver
eket task:claim                 # pick the next READY ticket
git checkout -b feature/TASK-642 article/06
# ... work, with periodic checkpoint calls (handled by Claude Code agent) ...
eket task:complete TASK-642     # runs the Saga 5-step
```

```bash
# As Master
eket task:list                  # see all tickets and their states
eket gate:review TASK-642       # approve / request changes
bash scripts/sync-branches.sh   # promote feature → testing → main → miao
```

### 5.2 Where to look in the source

| Concern | Path | Notes |
|---|---|---|
| State machine (declarative) | `protocol/state-machines/ticket-status.yml` | 17 granular states, role-gated transitions |
| State machine (validator) | `node/src/core/state/schema.ts:117-145` | `validateTicketStatus` and `validateTicketTransition` |
| CAS primitive (TypeScript) | `node/src/core/task-checkpoint.ts:48-108` | `saveCheckpoint` + `_casUpdate` |
| CAS primitive (Rust) | `rust/crates/eket-core/src/ticket.rs:72-112` | `set_status` uses atomic `tmp → rename` |
| Atomic write (filesystem) | `node/src/core/state/atomic.ts:19-42` | `atomicWrite` |
| Saga executor (TypeScript) | `node/src/core/saga-executor.ts:22-66` | `SagaExecutor` |
| Saga executor (Rust) | `rust/crates/eket-core/src/saga.rs:30-94` | `SagaExecutor` |
| Master election (TypeScript) | `node/src/core/master-election.ts:99-121` | 3-level fallback election |
| Master election (Rust) | `rust/crates/eket-core/src/election.rs:43-84` | Lua CAS script for Redis |
| Multi-instance design | `docs/architecture/MULTI_INSTANCE_DESIGN.md:1` | Per-PID session isolation |
| Master-Slaver ADR | `docs/adr/ADR-002-master-slaver-mode.md:1` | Roles, election, anti-split-brain |
| Degradation chain | `docs/architecture/DEGRADATION-STRATEGY.md:1` | L0 → L1 → L2 fallback |

### 5.3 What ships in the ticket row

The SQLite row for `TASK-642` looks roughly like:

```sql
CREATE TABLE tickets (
  id TEXT PRIMARY KEY,           -- 'TASK-642'
  title TEXT NOT NULL,
  state TEXT NOT NULL,            -- 'in_progress' / 'review' / 'done' / ...
  priority TEXT NOT NULL,         -- 'P1'
  assignee TEXT,                  -- 'slaver-b' or NULL
  specialty TEXT,                 -- 'tech-writer'
  claimed_at INTEGER,             -- unix epoch ms
  checkpoint_version INTEGER,     -- 0..N, increments on every checkpoint
  branch TEXT,                    -- 'feature/TASK-642-article-06'
  pr_url TEXT,                    -- set on transition to review
  merged_at INTEGER,              -- set on transition to merged
  -- ... audit columns ...
);
```

The protocol's correctness depends on **all transitions going through the SQL layer** — never through the markdown file alone. The markdown file is the human-readable projection; the SQL row is the machine-readable truth. The two stay in sync via the `atomicWrite` / `set_status` primitives.

---

## 6. Lessons Learned

**Lesson 1 — CAS is not a clever trick; it is the protocol.** When we replaced the read-then-write claim with a single `UPDATE ... WHERE state = 'old' AND assignee IS NULL`, the rate of double-claims dropped from ~5% to 0.0% in our internal benchmarks. The 5% was not a model problem; it was a TOCTOU window. SQL CAS collapsed the window to zero. The lesson: every state transition in the protocol is a CAS, and the role check is a column on the WHERE clause, not a check before the statement.

**Lesson 2 — The Saga is cheap to write, expensive to skip.** A naive `task:complete` is "git add, git commit, open PR" — three lines of code. The Saga version is "validate, test, checkpoint, commit, notify" with compensation for each. The naive version is shorter *until* the first failure, at which point the team spends a week debugging a half-committed branch and a half-opened PR. The Saga is the difference between "we know what happened" and "we have a 12-message Slack thread and a stale branch". Pay the engineering cost up front.

**Lesson 3 — The "no human in the loop for claims" rule sounds puritanical until the first audit.** A team that lets Master claim tickets will produce a dashboard that says "Master reviewed Master 100% of the time". The metric is technically true and completely useless. The state-machine-level enforcement (`who_can_transition: [slaver]` on `ready`) is the only way to make the rule stick. The protocol does not trust humans; it trusts roles.

**Lesson 4 — RESUME is not a state; it is a contract.** We considered adding `paused` to the state machine so the dashboard could show "this Slaver is recovering". We did not, because the row in `in_progress` already encodes the contract: a non-null `assignee` with a checkpoint version, owned by a Slaver who is *not* the original claimer. The dashboard derives the "RESUME" label from the difference between `claimed_at` and `last_checkpoint_at`, not from a state field. The lesson: prefer derived state to declared state. It is harder to lie about.

**Lesson 5 — Multi-Master is a feature, not a bug.** The first time we ran a warm-standby failover, the team's reaction was "I didn't even notice". That is the goal. Multi-Master exists so the protocol is invisible during normal operation. The day it becomes visible is the day a human Master gets paged, and the protocol has done its job if that page is "I am now Master" rather than "Master is down, what do we do?".

**Lesson 6 — The atomic write primitive is the unsung hero.** Every time we look at a bug report and the reproducer is "the file is empty" or "the file is half-written", the fix is "use `atomicWrite`". The `tmp → rename` pattern is 20 lines of code; it is also the difference between a recoverable system and one that loses user work to power outages.

---

## 7. References

- **Source code (TypeScript):**
  - `node/src/core/state/atomic.ts:1-42` — atomic write primitive
  - `node/src/core/state/schema.ts:100-145` — state machine validation
  - `node/src/core/saga-executor.ts:1-66` — Saga executor
  - `node/src/core/task-checkpoint.ts:1-223` — CAS version-checked checkpoint store
  - `node/src/core/state-reconciler.ts:96-348` — WAL replay
  - `node/src/core/ticket-reviewer.ts:1-174` — acceptance criteria check
  - `node/src/core/completion-validator.ts:17-100` — completion validation
  - `node/src/core/master-election.ts:99-121` — master election
  - `node/src/core/instance-registry.ts:75-100` — instance registration
- **Source code (Rust):**
  - `rust/crates/eket-core/src/saga.rs:1-350` — Saga executor mirror + tests
  - `rust/crates/eket-core/src/election.rs:1-300` — master election with Lua CAS
  - `rust/crates/eket-core/src/ticket.rs:72-145` — atomic ticket file write
- **Protocol schemas:**
  - `protocol/state-machines/ticket-status.yml:1-112` — the state machine (17 states)
  - `protocol/schemas/ticket.meta.schema.yml` — ticket metadata schema
- **Architecture & ADRs:**
  - `docs/adr/ADR-002-master-slaver-mode.md:1-196` — Master-Slaver mode ADR
  - `docs/architecture/MULTI_INSTANCE_DESIGN.md:1-353` — per-PID session isolation
  - `docs/architecture/DEGRADATION-STRATEGY.md:1-591` — four-level degradation
- **Series navigation:**
  - Previous article: [`05-four-level-degradation`](../../05-four-level-degradation/en/article.md)
  - Next article: [`07-storage-and-events`](../../07-storage-and-events/en/article.md) — the SQLite schema and event log
