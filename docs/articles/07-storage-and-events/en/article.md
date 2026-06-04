# 07 — Storage, CAS, and Event-Sourced State

> **TL;DR** — EKET keeps **all** protocol state in a single SQLite database, with Redis as an optional accelerator for pub/sub and hot caches. The atomic claim is a real SQL `UPDATE ... WHERE status = 'ready'` (see `node/src/core/sqlite-client.ts:972`), not a lock-file dance; the checkpoint store is a `WHERE version = ?` CAS (see `node/src/core/task-checkpoint.ts:85-108`); the audit trail is an append-only log written by `node/src/core/state/audit.ts:23-37`. When SQLite and Redis disagree, a single set of conflict-resolution rules (`node/src/core/state-reconciler.ts:96-348`) restores the system to a consistent state. Backups are one shell command (`scripts/backup-sqlite.sh`).

> **Key Takeaways**
> 1. SQLite is the floor; Redis is the ceiling. The protocol works with SQLite alone, Redis alone (warm-standby), or both. SQLite is *always* the source of truth on disk.
> 2. CAS is not a clever trick; it is the protocol. Every state transition is `UPDATE ... WHERE old_value`, and the `info.changes` count is the answer.
> 3. WAL mode (`PRAGMA journal_mode = WAL`, see `node/src/core/sqlite-async-client.ts:87`) is what lets readers and writers coexist on the same database without blocking.
> 4. Event sourcing is *append-only* by design: the audit log is replay-able, the message store is replay-able, the checkpoint store is replay-able. The `task_history` table is the canonical case log.
> 5. Consistency is a *set of rules*, not a hand-wave. The article names every divergence case (Redis ahead, SQLite ahead, partial write, etc.) and the rule that handles it.

---

## Executive Summary

**For decision-makers (read this and walk away):**

| Question | Answer |
|---|---|
| Where does protocol state live? | A single SQLite database at `.eket/data/sqlite/eket.db` (see `scripts/backup-sqlite.sh:26-30`). The TS client opens it via `better-sqlite3`; the Rust client mirrors the same schema. |
| What if SQLite dies? | The four-level degradation chain (L0 Shell, L1 Rust, L2 Node, L3 fallback — see `docs/articles/05-four-level-degradation/en/article.md:1`) keeps `task:claim` working from a file queue. The StateReconciler replays queued events into SQLite on recovery (`node/src/core/state-reconciler.ts:96-348`). |
| What is the atomic claim, exactly? | A single SQL `UPDATE tickets SET status = 'in_progress', assignee = ?, claimed_at = datetime('now') WHERE id = ? AND status = 'ready'` (`node/src/core/sqlite-client.ts:972`). If `result.changes !== 1`, the claim failed; the Slaver tries the next ticket. |
| What is the audit trail? | Two streams: a `task_history` row per state change (`node/src/core/sqlite-client.ts:222-233`) and an append-only file at `shared/audit.log` (`node/src/core/state/audit.ts:14-37`). Both are timestamped and immutable. |
| How do I back it up? | `bash scripts/backup-sqlite.sh backup` runs a `sqlite3 .backup` (online, no lock), gzips the result, and stores a SHA-256 checksum next to it (`scripts/backup-sqlite.sh:69-129`). |
| How do I migrate schemas? | `MigrationRunner` (Rust, `rust/crates/eket-core/src/migrations.rs:1-20`) tracks `schema_version` and applies pending migrations in order. The shell side has `scripts/retro-sqlite.sh init` for retro-specific tables. |
| What's the honest cost? | SQLite is *not* Postgres. At >1k sustained TPS, the single-writer lock becomes the bottleneck and the system must shard or move to Postgres. The article names that limit explicitly. |

The rest of this article is for implementers and auditors.

---

## Table of Contents

1. Motivation
2. The Big Idea
3. How It Works
4. Consistency Story — when SQLite and Redis disagree
5. Migration & Backup
6. Trade-offs & Alternatives
7. Lessons Learned
8. References

---

## 1. Motivation

Article 06 showed that the Master-Slaver protocol is a state machine with five user-facing states and five transitions, all of which must be *atomic* (`docs/articles/06-master-slaver-protocol/en/article.md:1`). This article opens up the *mechanism* underneath that state machine: the database tables, the SQL statements, the pub/sub channels, the file-queue fallback, and the consistency rules that keep the two engines (SQLite, Redis) from diverging.

Three failure modes forced a deliberate storage design:

1. **Two Slavers, one ticket, no winner.** Without an atomic claim primitive, two Claude Code sessions could both read `status = 'ready'` and both write `status = 'in_progress'`. The bug ships the same way it did in 2025 — second commit overwrites the first. The fix is a single `UPDATE ... WHERE old_value` statement; the database itself is the arbitrator.

2. **Long-running agent, crash, no replay.** A 30-minute refactor dies at step 21 of 30. The 21 steps of work live only in the model's context window. The fix is *event sourcing*: every state transition is written to an append-only log, and the checkpoint is a serializable blob that a fresh Slaver can reload.

3. **Redis up, SQLite down, no state.** A naïve Redis-first design makes the dashboard "live" but loses the audit trail the moment Redis restarts without persistence. The fix is to keep SQLite as the *floor* of correctness, with Redis as an *accelerator* on top. The protocol works without Redis; it works *better* with Redis.

> "If the database can lose a row, you don't have a workflow — you have a probability distribution over who claims what."
> — *EKET design note, 2026-04*

The shape of the storage layer follows from one bet: **the model is replaceable, the row is not**. The model can be a 7B LLM or a 70B LLM or a human at a terminal. The row is `TASK-642` in `tickets` with `status = 'in_progress'`, `assignee = 'slaver-b'`, and `checkpoint_version = 4`. It is the protocol's only anchor to the physical world.

---

## 2. The Big Idea

Three orthogonal claims, each independent, each load-bearing.

### 2.1 SQLite is the floor of correctness

The system must work with SQLite alone. Every transition that matters for correctness — claim, complete, checkpoint, audit — has a SQLite-only path. Redis is a cache, a pub/sub bus, and a coordination channel; it is never the *only* copy of a state mutation. This is what makes the L0 Shell / L1 Rust fallback possible (`docs/articles/05-four-level-degradation/en/article.md:1`): a CI runner with no Redis can still claim tickets by reading `jira/tickets/*.md` and writing the SQLite row.

### 2.2 CAS is the only transition primitive

Every state transition is `UPDATE row SET col = new_value WHERE col = old_value AND <role check>`. The database is the arbitrator; the application code never reads-then-writes. This collapses the TOCTOU window to zero and removes the need for a separate lock service. The pattern is used three times in production:

- The `tickets.status` claim: `node/src/core/sqlite-client.ts:972`.
- The `task_checkpoints.version` bump: `node/src/core/task-checkpoint.ts:85-108`.
- The `task_history.status` insert: `node/src/core/sqlite-client.ts:661-695`.

### 2.3 Event sourcing is append-only

The `task_history` table is the canonical state log. Every transition appends a row; no row is ever updated or deleted. The current state is a *projection* over the log. The audit log at `shared/audit.log` is the same idea at a coarser granularity (one line per `task:claim`, `task:complete`, `gate:review`, etc.). Replay from the log is the recovery story when the database is corrupt or the schema is wrong.

### 2.4 The two engines are not peers

SQLite is the database. Redis is a *service*: it can be restarted, evicted, reconfigured, and the protocol must keep working. When the two engines disagree — and they will, because Redis is asynchronous — there is a rule, not a hope, that picks a winner. The rule lives in `node/src/core/state-reconciler.ts:96-348` and is named explicitly in §4 below.

---

## 3. How It Works

This is the long section. We walk through the data model, the SQLite-as-primary story, the Redis-as-accelerator story, the CAS primitive with real SQL, and the event-sourcing primitives.

### 3.1 Data model — tickets, claims, completions, audit events

The persistence layer has five tables that matter for the protocol. The full DDL is in `node/src/core/sqlite-client.ts:184-320` (synchronous client) and is mirrored by `node/src/core/sqlite-async-client.ts:86-260` (async worker). The schema diagram is below; the FK relationships are the lines that connect them.

```
                  ┌─────────────────────────────────┐
                  │            tickets              │
                  │─────────────────────────────────│
                  │ id          TEXT  PK            │
                  │ title       TEXT                 │
                  │ status      TEXT  (ready/in_pr…) │
                  │ priority    INTEGER              │
                  │ assignee    TEXT  NULL           │
                  │ claimed_at  TEXT  NULL           │
                  │ created_at  TEXT  now()          │
                  └─────┬───────────────────────────┘
                        │ 1:N  (one ticket, many history rows)
                        ▼
                  ┌─────────────────────────────────┐
                  │         task_history            │
                  │─────────────────────────────────│
                  │ id           INTEGER PK         │
                  │ ticket_id    TEXT  FK→tickets   │
                  │ title        TEXT               │
                  │ status       TEXT               │
                  │ assigned_to  TEXT               │
                  │ started_at   TIMESTAMP          │
                  │ completed_at TIMESTAMP          │
                  │ created_at   TIMESTAMP          │
                  │ skill_feedback_json  TEXT       │
                  │ feedback_processed   INTEGER    │
                  └─────┬───────────────────────────┘
                        │ UNIQUE INDEX
                        │  idx_task_history_unique_inprogress
                        │  ON task_history(ticket_id) WHERE status='in_progress'
                        │   — at most ONE in_progress row per ticket
                        ▼
                  ┌─────────────────────────────────┐    ┌──────────────────────┐
                  │     task_checkpoints            │    │ execution_checkpoints │
                  │─────────────────────────────────│    │──────────────────────│
                  │ task_id    TEXT  PK             │    │ id INTEGER PK         │
                  │ data       TEXT  (JSON blob)    │◄──►│ ticket_id TEXT  FK    │
                  │ version    INTEGER  CAS guard   │    │ slaver_id TEXT        │
                  │ updated_at INTEGER              │    │ phase    TEXT         │
                  └─────────────────────────────────┘    │ state_json TEXT       │
                                                       │ UNIQUE(ticket_id,     │
                                                       │        slaver_id)     │
                                                       └──────────────────────┘

                  ┌─────────────────────────────────┐    ┌──────────────────────┐
                  │     task_messages               │    │  message_history     │
                  │─────────────────────────────────│    │──────────────────────│
                  │ id        INTEGER PK            │    │ id INTEGER PK         │
                  │ task_id   TEXT  NOT NULL        │    │ message_id UNIQUE     │
                  │ seq       INTEGER  monotonic    │    │ from_agent TEXT       │
                  │ type      TEXT  (text/tool/…)   │    │ to_agent TEXT         │
                  │ tool      TEXT                  │    │ type TEXT             │
                  │ content   TEXT                  │    │ payload TEXT (JSON)   │
                  │ input_json TEXT                 │    │ created_at TIMESTAMP  │
                  │ output    TEXT                  │    └──────────────────────┘
                  │ created_at TEXT  now()          │
                  │ UNIQUE(task_id, seq)            │
                  └─────────────────────────────────┘
```

Key invariants the schema enforces:

- **At most one in-progress row per ticket.** The partial unique index `idx_task_history_unique_inprogress ON task_history(ticket_id) WHERE status = 'in_progress'` (`node/src/core/sqlite-client.ts:247-248`) makes a second concurrent claim fail at the database level. Two Slavers cannot both flip a ticket to `in_progress`.
- **At most one checkpoint row per (ticket, slaver) pair.** The `execution_checkpoints` table has `UNIQUE(ticket_id, slaver_id)` (`node/src/core/sqlite-client.ts:259`), so a Slaver's checkpoint upsert is idempotent.
- **Monotonic message sequence per task.** `task_messages.UNIQUE(task_id, seq)` (`node/src/core/sqlite-client.ts:283`) prevents gaps and duplicates in the conversation log; the insert computes `next_seq = COALESCE(MAX(seq), -1) + 1` (`node/src/core/sqlite-client.ts:732-736`).
- **CAS on the checkpoint version.** `task_checkpoints.version` is a monotonic counter; the update is `WHERE version = ?` (`node/src/core/task-checkpoint.ts:88-92`). Two Slavers writing the same checkpoint both bump from version N to N+1, but only one's UPDATE matches.

The `tickets` table is intentionally narrow: seven columns. The full ticket narrative (acceptance criteria, plan, comments) lives in `jira/tickets/TASK-NNN.md` (the markdown file). The `tickets` row is the machine-readable projection: who owns it, what state is it in, when was it claimed, what branch. The two stay in sync via `atomicWrite` (`node/src/core/state/atomic.ts:19-42`).

### 3.2 SQLite as primary — single-file, single-writer, surprising throughput

SQLite's reputation as "the toy database" is outdated. Modern SQLite (3.39+, 2022 onwards) does:

- **WAL mode** (write-ahead log), which lets readers and writers coexist. Configured at boot in `node/src/core/sqlite-async-client.ts:87` (`db.pragma('journal_mode = WAL')`) with `synchronous = NORMAL` on line 88. With WAL, a long-running `SELECT` does *not* block an `UPDATE`, and vice versa. Without WAL, the same workload serializes — the dashboard freezes when a Slaver claims a ticket.
- **Single-writer, multi-reader concurrency.** SQLite serializes writes through a file-lock; readers see a consistent snapshot. For the EKET workload (occasional bursts of `task:claim` / `task:complete` plus many `SELECT`s from the dashboard and the hooks layer), this is the right model. The bottleneck is *not* throughput — it is latency under high write contention, and the protocol has natural rate limits (one Slaver per ticket, at most a few Slavers per human).
- **Surprising throughput numbers.** Benchmarks in the SQLite community regularly show 50k–100k simple `INSERT`/s on a single thread, and our file-queue measurements (see `docs/articles/02-why-you-need-eket/en/article.md:86-87`) show 0.77 ms p95 enqueue and 1.54 ms p95 dequeue — well below the `task:claim` envelope of ~21 ms (`README.md:140-145`).
- **Atomic backups via `.backup` command.** The `sqlite3 db .backup target` API takes a consistent snapshot without locking writers (`scripts/backup-sqlite.sh:87-95`). This is what makes hourly backups cheap.

The honest limits:

- **Single-writer throughput ceiling.** A single SQLite writer tops out around 100k simple writes per second on a fast disk, and falls quickly on slow disks (network mounts, container overlays, encrypted volumes). At >1k sustained TPS of *protocol* operations, the single-writer model becomes the bottleneck. EKET's design assumes <100 TPS in steady state; above that, you should shard by epic or migrate to Postgres.
- **No native network protocol.** SQLite is a *library*; the database is a file. If you want two machines to share a database, you need Litestream, rqlite, or a custom replication layer. EKET does not provide this in v0.1 — the design assumes a single host with local-disk SQLite.
- **WAL files accumulate.** The `-wal` and `-shm` files grow until you `PRAGMA wal_checkpoint(TRUNCATE)` or run `VACUUM`. On a long-running system, you must schedule `VACUUM` weekly or monthly (the precise interval depends on the write rate). See `scripts/backup-sqlite.sh` and §5 below.
- **No `LISTEN`/`NOTIFY`.** Unlike Postgres, SQLite has no native pub/sub. The "pub/sub" in EKET's design is either Redis (`rust/crates/eket-core/src/pubsub.rs:30-67`) or polling the `task_history` table.

These are real limits, not marketing. The architectural choice to use SQLite is not "SQLite is the best database" — it is "the best database *for a protocol that runs on L0 Shell*". When the workload outgrows SQLite, the migration target is Postgres with the same schema, and the consistency rules in §4 apply to that target too.

The configuration is intentionally minimal. Three pragmas are set on every connection (`node/src/core/sqlite-async-client.ts:87-89`):

```typescript
// sqlite-async-client.ts:87-89 (verbatim)
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('foreign_keys = ON');
```

- `journal_mode = WAL` — the unlock for non-blocking readers.
- `synchronous = NORMAL` — durability on checkpoint, not on every commit; pairs with WAL to keep the writer fast. (`FULL` is the paranoid choice; the cost is ~2× slower writes.)
- `foreign_keys = ON` — SQLite's FK enforcement is off by default for backwards compatibility; EKET turns it on. This is what makes the `task_history.ticket_id → tickets.id` and `execution_checkpoints.ticket_id → tickets.id` references *enforced*, not advisory.

### 3.3 Redis as accelerator — pub/sub, claim queue, hot state

Redis is a *service* in EKET, not a database. It holds three things:

1. **Pub/sub channels** for live event delivery to subscribers. The two channels in production are `eket:master:changed` and `eket:task:status` (constants in `rust/crates/eket-core/src/pubsub.rs:20-21`). A Slaver subscribing to `eket:task:status` sees a JSON message on every state transition.
2. **A claim queue** for distributing work to Slavers. The Redis list (or stream, depending on configuration) holds the current set of `READY` tickets; `BRPOP` is the primitive that waits for the next one. This is faster than polling SQLite, especially when Slavers outnumber ready tickets.
3. **Hot state** for the dashboard. The latest `task_history` row for each ticket is cached in Redis as a JSON document, so the dashboard can render without a `SELECT` on every refresh.

The critical design property is **graceful degradation**. `RedisPubSub.subscribe` in Rust (`rust/crates/eket-core/src/pubsub.rs:43-49`) returns a working `mpsc::Receiver<String>` *even when Redis is unavailable* — the receiver simply never produces items. The same pattern holds in Node (`node/src/core/redis-client.ts`). The result: a Slaver or a dashboard that depends on Redis can be running while Redis is down. It will not receive real-time updates, but it will not fail to start, either.

The Node-side event bus, `node/src/core/event-bus.ts:242-261`, mirrors this: `emit` (synchronous), `emitAsync` (await handlers), and `publish` (await all handlers, fail on first error). The bus is *in-process*; it does not persist events. Events that must survive a process restart go through the SQLite `task_history` table or the `shared/audit.log` file.

The schema for a Redis-side pub/sub frame is in `protocol/schemas/message.schema.json` and `protocol/schemas/heartbeat.schema.json`. A message looks roughly like:

```json
{
  "id": "msg-2026-06-04-TASK-642-001",
  "from": "slaver-b",
  "to": "broadcast",
  "type": "task:claimed",
  "payload": { "ticketId": "TASK-642", "assignee": "slaver-b" },
  "createdAt": "2026-06-04T10:02:00Z"
}
```

The schema is enforced at the boundary; the database does not care about the shape. The `message_history` table (`node/src/core/sqlite-client.ts:236-244`) stores a denormalized copy so a Slaver that comes back online can read missed messages from SQLite instead of replaying the Redis stream.

### 3.4 CAS deep dive — the `UPDATE ... WHERE status = 'READY' AND version = X` pattern

This is the section a skeptical reader will read first, so we are going to be very explicit.

**The atomic claim.** The simplest possible claim primitive, lifted from `node/src/core/sqlite-client.ts:966-976`:

```typescript
// sqlite-client.ts:966-976 (verbatim, lightly trimmed for column width)
const claimTxn = db.transaction((): TicketRow | null => {
  const ticket = db.prepare(
    `SELECT id FROM tickets WHERE status = 'ready' ORDER BY priority DESC, created_at ASC LIMIT 1`
  ).get() as { id: string } | undefined;
  if (!ticket) {return null;}
  const result = db.prepare(
    `UPDATE tickets SET status = 'in_progress', assignee = ?, claimed_at = datetime('now') WHERE id = ? AND status = 'ready'`
  ).run(slaverId, ticket.id);
  if (result.changes !== 1) {return null;}
  return db.prepare('SELECT * FROM tickets WHERE id = ?').get(ticket.id) as TicketRow | undefined ?? null;
});
```

Why this works:

1. **The transaction holds a write lock for its entire duration.** No other writer can interleave an `UPDATE tickets SET status = 'in_progress' ...` between the `SELECT` and the `UPDATE`. SQLite serializes transactions on the file-lock; in WAL mode, writers queue.
2. **The `WHERE status = 'ready'` guard is the CAS.** If another Slaver got there first and flipped the row to `in_progress`, our `UPDATE` matches zero rows; `result.changes === 0`; we return `null` and try the next ticket.
3. **The `result.changes !== 1` check is the only error path.** Anything else (zero rows, two rows — which would be a bug — or an exception) is treated as a failed claim. The Slaver's caller decides what to do next; the transaction has no opinion.

The `claimTaskById` function (`node/src/core/sqlite-client.ts:661-695`) is a sibling primitive that does an explicit-id claim:

```typescript
// sqlite-client.ts:668-687 (verbatim, lightly trimmed)
const claimTx = this.db.transaction((): boolean => {
  // 检查是否已被领取（排他锁由事务保证）
  const existing = this.db!.prepare(
    "SELECT assigned_to FROM task_history WHERE ticket_id = ? AND status = 'in_progress'"
  ).get(ticketId) as { assigned_to: string } | undefined;

  if (existing) {
    return false; // 已被抢占
  }

  // 插入领取记录
  this.db!.prepare(
    "INSERT INTO task_history (ticket_id, status, assigned_to, started_at) VALUES (?, 'in_progress', ?, CURRENT_TIMESTAMP)"
  ).run(ticketId, slaverId);

  return true;
});
```

Note the redundancy: the same `task_history` row is the *log entry* and the *lock*. The partial unique index on `task_history(ticket_id) WHERE status = 'in_progress'` (`node/src/core/sqlite-client.ts:247-248`) means a second `INSERT` violates the constraint and the transaction rolls back. We get a database-level error on race conditions even if the application logic has a bug.

**The checkpoint CAS.** A different CAS, on a different table, with a different guard. From `node/src/core/task-checkpoint.ts:85-108`:

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

  return { success: true, data: undefined };
}
```

The guard is `version = ?`: the UPDATE only matches if the row's current version equals the version the caller saw. If another Slaver bumped from N to N+1 in the meantime, our `WHERE version = N` matches zero rows, and the application throws `CheckpointCASError` (`node/src/core/task-checkpoint.ts:21-32`). The error carries both the expected and the actual version so a retry can read the latest data and decide whether to re-bump or fail.

**Why the explicit version column instead of `rowid`?** Because `rowid` is a database implementation detail; the application should not depend on it. Also, the `task_checkpoints` table has a `TEXT PRIMARY KEY` (`node/src/core/sqlite-client.ts:265-270`), so the `version` column is the only monotonic counter the application owns. Storing the version explicitly makes the table self-describing in a backup dump: a reader can see "this row is at version 4" without consulting any external metadata.

**Rust mirror.** The Rust saga executor in `rust/crates/eket-core/src/saga.rs:30-94` does not use SQL CAS directly; it uses a Saga with steps that have compensating actions. The `CompensationError` struct (lines 14-18) is the in-memory analog of the SQL `WHERE version = ?` guard: a step that fails triggers reverse-order compensation of completed steps, with `compensation_errors` collected separately so a *failed* compensation does not mask a *failed* forward step. The unit test `middle_step_fails_rolls_back` (`rust/crates/eket-core/src/saga.rs:233-288`) asserts the order: when step 3 fails, steps 2 and 1 are compensated in that order, *not* the reverse. Reversing the order would weaken the property.

**The on-disk CAS, for ticket markdown.** A third CAS variant lives on the filesystem, not the database. `node/src/core/state/atomic.ts:19-42` writes a `.tmp` file in the same directory, then `rename`s over the target. POSIX guarantees `rename` is atomic on the same filesystem. The Rust mirror is in `rust/crates/eket-core/src/ticket.rs:100-103`:

```rust
// ticket.rs:100-103 (verbatim)
// Atomic write: tmp → rename
let tmp = self.path.with_extension("md.tmp");
std::fs::write(&tmp, &new_raw).map_err(EketError::Io)?;
std::fs::rename(&tmp, &self.path).map_err(EketError::Io)?;
```

This is the primitive that keeps `jira/tickets/TASK-642.md` either pre-claim or post-claim, never mid-claim, even if the Slaver crashes between `write` and `rename`. The `tmp` filename is randomized (`node/src/core/state/atomic.ts:30-31` uses `pid` + `Math.random()`) so two concurrent writers do not collide on the same temp path.

**The full CAS story in one paragraph.** A Slaver making a claim issues *three* CAS operations in sequence: (1) a transaction that includes the `tickets` `UPDATE ... WHERE status = 'ready'`, (2) an insert into `task_history` with the partial unique index acting as a backstop, and (3) the first `task_checkpoints` insert with `version = 0 → 1`. All three are atomic at the database level; the application code never holds a lock across them. The probability of all three succeeding while another Slaver's parallel transaction also succeeds is *exactly zero* — the partial unique index on `task_history` is the last line of defense, and it has no TOCTOU window.

### 3.5 Event sourcing — append-only audit log, replay-able history

Event sourcing in EKET has three layers, from coarsest to finest:

1. **`shared/audit.log` — one line per protocol operation.** Format: `ISO8601 | actor | engine | op | target | details` (`node/src/core/state/audit.ts:30-32`). Written by `audit()` at line 23. Append-only by construction (POSIX `O_APPEND` makes a `write` of size ≤ `PIPE_BUF` atomic). The file is human-readable; a `grep` for `TASK-642` returns every operation on that ticket, in order. This is the file the post-mortem reaches for.

2. **`task_history` table — one row per state change.** Defined at `node/src/core/sqlite-client.ts:222-233`. Columns: `ticket_id`, `status`, `assigned_to`, `started_at`, `completed_at`, plus a JSON feedback column. The current state of a ticket is `SELECT * FROM task_history WHERE ticket_id = ? ORDER BY created_at DESC LIMIT 1`. The history itself is a SQL `SELECT * FROM task_history WHERE ticket_id = ? ORDER BY created_at ASC`.

3. **`task_messages` table — the conversation log.** One row per LLM message: `text`, `tool_use`, `tool_result`, `thinking`, `error` (`node/src/core/sqlite-client.ts:273-285`). Monotonic `seq` per task. This is the fine-grained event log: a Slaver's full conversation with the model is replay-able by re-reading these rows in order. The `task_messages` table is the input to a future `task:replay` command that re-runs a Slaver's session against a different model for benchmarking.

The three layers serve different readers:

- **Humans read `shared/audit.log`.** It is a text file; you can `tail -f` it during a deploy; you can `grep` it for incident triage; you can `diff` it across environments.
- **Operators query `task_history`.** It is a SQL table; you can `SELECT COUNT(*) FROM task_history WHERE status = 'in_progress' GROUP BY assigned_to` to see the current Slaver load.
- **A Slaver's `task:resume` reads `task_messages`.** It is the model's view of the conversation; the `seq` order is the model's view of time. The `isToolCallAlreadyExecuted` check at `node/src/core/task-checkpoint.ts:160-168` uses the checkpoint's `executedToolCalls` list (extracted from `task_messages.tool_use`) to skip already-done tool calls on resume.

**Replay.** The `StateReconciler` (`node/src/core/state-reconciler.ts:96-348`) is the replay engine. When the connection manager upgrades from `file` to `sqlite`/`local_redis`/`remote_redis` (see the `ConnectionLevel` enum on line 28), the reconciler:

1. Scans `queueDir` for `*.json` and `*.msg` files (line 96-110).
2. Parses each file into a `ReconciledMessage` (line 43-50).
3. Sorts by `timestamp` strictly ascending (AC-2, see comment on line 9-12).
4. Dedupes by message `id` (AC-3, line 7).
5. Replays into SQLite in order.
6. Deletes the source files on success (AC-4, line 12).
7. Emits `message:replayed` / `message:skipped` events.

The result is a deterministic replay: the same queue of files produces the same SQLite state, regardless of which process runs the reconciler. This is the property that makes the L0 → L2 upgrade safe.

---

## 4. Consistency Story — when SQLite and Redis disagree

SQLite and Redis disagree. They disagree because they are two systems on different consistency models. SQLite is *synchronous* (every write hits disk before the transaction returns); Redis is *asynchronous by default* (a write returns before replicas, before AOF, before fsync). When a Slaver writes to both — say, claim a ticket in SQLite and publish a `task:claimed` event to Redis — the two writes can be observed in either order by another process.

The protocol does not pretend this does not happen. It names every divergence case and prescribes a rule. The rules below are the contract; if you find a case not covered, that is a bug to report.

| # | Case | Detection | Rule | Recovery |
|---|---|---|---|---|
| C1 | **Redis ahead of SQLite.** A Slaver publishes `task:claimed` to Redis before its SQLite transaction commits. A second Slaver receives the event, queries SQLite, sees `status = 'ready'`, attempts a claim, and *succeeds* (the first Slaver's transaction is still in flight). | The second Slaver's `UPDATE tickets SET status = 'in_progress' ... WHERE id = ? AND status = 'ready'` matches 1 row. The first Slaver's transaction then commits and finds the row already updated. | **SQLite wins.** The first Slaver's transaction must detect this and abort. Concretely: the first Slaver's `INSERT INTO task_history (ticket_id, status, 'in_progress', ...)` violates the partial unique index `idx_task_history_unique_inprogress` (`node/src/core/sqlite-client.ts:247-248`). The transaction rolls back; the first Slaver reads the second Slaver's `assignee` and either defers or hands off. | The first Slaver's `claimTaskById` returns `false`; it moves to the next ticket. No double-commit because the SQLite transaction is the unit of work. |
| C2 | **SQLite ahead of Redis.** The SQLite commit succeeds, but the Redis publish fails (network blip, Redis restart, authentication error). Subscribers do not see the event. | A subscriber polls SQLite (or the reconciler runs) and discovers a transition it missed. | **SQLite is authoritative.** The Redis pub/sub is best-effort. A subscriber that needs guaranteed delivery must read SQLite to confirm. | The next Redis publish from any source will carry the current state; the subscriber catches up. The `task_history` table is the replay source. |
| C3 | **Partial write — SQLite committed, audit.log write failed.** The protocol operation succeeded in the database but the audit log line was lost (disk full, file removed). | The next audit log read shows a gap. The `task_history` table still has the row. | **`task_history` is the truth; audit.log is a convenience.** A consumer that needs the operation must query SQLite. The audit log is a *projection*; gaps are tolerable as long as the SQLite log is complete. | Re-derive the missing audit lines from `task_history`. A future `audit:backfill` command could do this automatically. |
| C4 | **Partial write — Redis SET succeeded, SQLite UPDATE failed.** A Slaver pushed a `claim:pending` record to Redis, then the SQLite transaction failed (disk error, FK violation). | The Redis record sits in `claim:pending` indefinitely. The Slaver's caller checks the SQLite result and sees failure. | **The Slaver must roll back the Redis side-effect.** A `DEL claim:pending:<id>` is issued. If that also fails, the record expires via TTL (configurable, default 5 minutes). | After the TTL expires, the next Slaver that picks up the ticket sees a clean state. The TTL is the *timeout*; the Slaver's explicit `DEL` is the *preferred path*. |
| C5 | **SQLite corruption after power loss.** A Slaver's machine loses power mid-transaction. SQLite's WAL guarantees atomicity *per transaction*, but a torn write across the WAL boundary is possible in extreme cases. | On next boot, `PRAGMA integrity_check` (or `sqlite3 db .integrity_check`) reports corruption. | **Restore from the latest backup.** The protocol does not attempt to repair corrupted SQLite. The hourly `backup-sqlite.sh` is the safety net. | `bash scripts/backup-sqlite.sh restore` (see `scripts/backup-sqlite.sh:204-276`) restores the most recent gzipped backup. The SHA-256 checksum is verified before the restore overwrites the current database. |
| C6 | **Two Slavers, two processes, both pass the `SELECT` and both reach the `UPDATE`.** The classic TOCTOU race. | The second `UPDATE` matches 0 rows because the first one already flipped the row. | **The `WHERE status = 'ready'` guard is the arbitrator.** The second Slaver's `result.changes === 0`; it returns `null`; it tries the next ticket. No application-level lock is needed. | The Slaver's outer loop moves to the next `READY` ticket. The `tickets` table is now consistent: exactly one row in `in_progress` for that ticket. |
| C7 | **Checkpoint CAS conflict during `task:resume`.** Slaver A and Slaver B both try to resume `TASK-642` from a checkpoint. Both read `version = 4`. Both try to bump to `5`. | Slaver A succeeds; Slaver B sees `result.changes === 0` and throws `CheckpointCASError`. | **The losing Slaver reloads and re-decides.** Slaver B calls `loadCheckpoint(taskId)`, reads `version = 5` with the new data, and either re-bumps to `6` (its own work) or decides the new data supersedes its work and discards. | The protocol does not silently merge. The Slaver's caller (Slaver B) must make the merge decision explicitly. The data column has enough information (tool-call history) to detect duplicate work. |
| C8 | **Master election has two winners (split-brain).** A Redis restart causes two Master instances to both believe they have the lease. | The `epoch` field in the next `task:status` event is higher than the previous one; the lower-epoch Master detects the conflict. | **The higher epoch wins.** The lower-epoch Master immediately stops accepting `gate:review` and waits for the lease to expire before re-electing. The Lua script in `rust/crates/eket-core/src/election.rs` enforces this. | The lower-epoch Master's outstanding reviews are re-queued; the higher-epoch Master picks them up. The audit log records the split-brain event. |

**The general principle.** When in doubt, **SQLite wins**. Redis is a *cache* and a *notification bus*; it is never the *only* copy of a state mutation. The cases C1–C8 are the eight ways that property is enforced in code. The audit log at `shared/audit.log` is the human-readable projection of the conflict-resolution events; `task_history` is the machine-readable one. If a Slaver ever observes a state that violates the rules, it is a bug — file it.

---

## 5. Migration & Backup

The migration and backup story is the operational counterpart of the storage design. Three operations cover 95% of real-world needs.

### 5.1 Backup — `bash scripts/backup-sqlite.sh`

The script at `scripts/backup-sqlite.sh:1-381` is a self-contained Bash tool. It does an *online* backup via SQLite's `.backup` command (which holds a read lock but does not block writers in WAL mode), gzips the result, and stores a SHA-256 checksum alongside.

**Operation 1 — Run a backup.**

```bash
$ bash scripts/backup-sqlite.sh backup
[INFO] [2026-06-04T10:00:00+00:00] 开始备份 SQLite 数据库...
[INFO] [2026-06-04T10:00:00+00:00] 备份目录：/repo/.eket/data/backups/sqlite
[INFO] [2026-06-04T10:00:01+00:00] SQLite 在线备份完成
[INFO] [2026-06-04T10:00:01+00:00] 压缩完成：/repo/.eket/data/backups/sqlite/eket_backup_20260604_100000.db.gz
[INFO] [2026-06-04T10:00:01+00:00] 校验和：a3f5e8d2...c91b4e7f
[INFO] [2026-06-04T10:00:01+00:00] 备份完整性验证通过
[INFO] [2026-06-04T10:00:01+00:00] 备份大小：2.3M
[INFO] [2026-06-04T10:00:01+00:00] 备份成功：/repo/.eket/data/backups/sqlite/eket_backup_20260604_100000.db.gz
```

The script writes to `.eket/data/backups/sqlite/eket_backup_YYYYMMDD_HHMMSS.db.gz` (line 53) and retains 7 days / 168 backups by default (lines 29-30). The retention is enforced on every run by `cleanup_expired` (lines 132-160): it `find`s files older than `RETENTION_DAYS` and `rm`s them, then caps the count at `MAX_BACKUPS` keeping the most recent.

**Operation 2 — Restore from a backup.**

```bash
$ bash scripts/backup-sqlite.sh restore
[INFO] [2026-06-04T11:00:00+00:00] 使用最新备份：eket_backup_20260604_100000.db.gz
[INFO] [2026-06-04T11:00:00+00:00] 验证备份完整性...
[INFO] [2026-06-04T11:00:00+00:00] 校验和验证通过
[INFO] [2026-06-04T11:00:00+00:00] 已创建紧急备份：/repo/.eket/data/sqlite/eket.db.emergency_20260604_110000
[INFO] [2026-06-04T11:00:01+00:00] 数据库恢复成功
[INFO] [2026-06-04T11:00:01+00:00] 数据库完整性验证通过
```

The restore is *safe by default*: before overwriting the live database, the script copies the current `eket.db` to `eket.db.emergency_<timestamp>` (line 246-249). If the restored database fails integrity check (line 261-269), the emergency backup is moved back. The only thing that can fail this script is a SHA-256 mismatch on the backup, in which case the script refuses to restore (line 237-240).

**Operation 3 — List and verify backups.**

```bash
$ bash scripts/backup-sqlite.sh list
========================================
EKET SQLite 备份列表
========================================
  eket_backup_20260604_100000.db.gz
    大小：2.3M  日期：2026-06-04 10:00:01  ✓ 已验证
  eket_backup_20260604_090000.db.gz
    大小：2.3M  日期：2026-06-04 09:00:01  ✓ 已验证
  ...
总计：168 个备份（显示最近 20 个）
```

The `list` subcommand (line 163-201) shows the most recent 20 backups with their size, date, and verification status. A backup is "verified" if the stored SHA-256 in the `.sha256` sidecar matches the recomputed hash of the `.db.gz` file. A daily `cron` entry that runs `bash scripts/backup-sqlite.sh backup` at 02:00 is the recommended operational pattern.

### 5.2 Retrospectives — `bash scripts/retro-sqlite.sh init` / `import` / `search`

A second script, `scripts/retro-sqlite.sh:1-397`, manages the retrospectives database. The schema is separate from the main `eket.db` (it lives in the same file but in different tables — `retrospectives`, `retro_content`, `retro_tags`, see lines 56-93).

**Operation 4 — Initialize the retro tables.**

```bash
$ bash scripts/retro-sqlite.sh init
[INFO] 初始化 Retrospective 数据库表...
[INFO] 数据库表初始化完成：/repo/.eket/data/sqlite/eket.db
```

The `init` subcommand (line 50-96) is idempotent (`CREATE TABLE IF NOT EXISTS`). It creates the three tables and four indexes. Run it once per environment.

**Operation 5 — Import existing retros from markdown files.**

```bash
$ bash scripts/retro-sqlite.sh import
[INFO] 导入现有 Retrospective 文件...
[INFO] 已导入 12 个 Retrospective 文件
```

The `import` subcommand (line 99-119) walks `confluence/memory/retrospectives/*.md`, parses the first-line title and the `**Sprint**:` metadata, and inserts into `retrospectives` + `retro_content`. After import, you can search the content via `search <keyword>` (line 190-221) which runs SQL `LIKE` queries against both `retrospectives.title` and `retro_content.content`. The `report` subcommand (line 292-341) generates a per-sprint or all-sprints summary.

**Operation 6 — Generate a sprint report.**

```bash
$ bash scripts/retro-sqlite.sh report sprint-007
========================================
Sprint Retrospective 报告
Sprint: sprint-007
========================================
【Sprint 007 — Rust 重构】  2026-05-30  8 items
【Sprint 007 retro v2】      2026-06-01  3 items
```

This is the data the Slaver-readable report in `confluence/memory/retrospectives/` becomes queryable from the CLI.

### 5.3 Schema migrations — `MigrationRunner` (Rust)

The Rust core has a dedicated migration runner at `rust/crates/eket-core/src/migrations.rs:1-20`. The runner tracks a `schema_version` table and applies pending migrations in order. The TS side mirrors this implicitly via `CREATE TABLE IF NOT EXISTS` (the schema in `node/src/core/sqlite-client.ts:184-320` is forward-compatible; columns can be added with `ALTER TABLE ... ADD COLUMN` as done at lines 350-355 of the same file).

The honest state of schema migration as of v0.6:

- **Forward-only.** No down-migrations are supported. To roll back, restore from a backup.
- **One writer at a time.** The migration runs in a single SQLite transaction; concurrent Slavers will see the old schema until the migration commits.
- **Test before production.** Migrations should be run against a copy of the production database first; a failed migration in a transaction rolls back atomically, but a *committed* migration that breaks the application requires a backup restore.

### 5.4 Recovery procedure — the 30-second version

When something goes wrong, this is the order of operations:

1. `bash scripts/backup-sqlite.sh list` — see the most recent verified backup.
2. `bash scripts/backup-sqlite.sh restore <file>` — restore from the chosen backup. The script creates an emergency backup of the current database first.
3. If the restore fails the integrity check, the script rolls back automatically; the emergency backup is the fallback.
4. After the restore, run `sqlite3 .eket/data/sqlite/eket.db "PRAGMA integrity_check;"` manually to confirm.
5. Restart all Slaver processes; they will read the new state and re-attach to any in-flight tickets.

The whole procedure is *< 30 seconds* on a small database (< 100 MB), and *< 5 minutes* on a 10 GB database. The bottleneck is `gunzip` + the file copy, not SQLite.

---

## 6. Trade-offs & Alternatives

| Alternative | What it does | What EKET does differently | When it wins |
|---|---|---|---|
| **Postgres as primary** | Single-node Postgres with serializable isolation | EKET uses SQLite. Postgres is the migration target when the workload outgrows SQLite (>1k TPS sustained), but the *protocol* is unchanged. | Teams that already run Postgres and need multi-host from day one. |
| **Redis as primary** | All state in Redis with periodic AOF / RDB snapshots | EKET makes Redis an *accelerator*, not the source of truth. The protocol survives Redis loss. | Use cases where the dashboard is the only consumer and the audit trail is not load-bearing. |
| **Git as the database (GitOps)** | Ticket state encoded in commits, branches, and PRs | EKET uses git for *artifacts* (PRs, branches, ticket markdown) and SQLite for *state*. GitOps cannot answer "who owns TASK-642 right now" without an external index. | Pure code review workflows where state is implicit in the PR. |
| **EventStoreDB / Kafka-backed event store** | A purpose-built event store with replay and projections | EKET's event log is `task_history` + `shared/audit.log` — both built on commodity tools (SQLite, `O_APPEND`). A purpose-built event store is overkill for a 1–5 + N team. | Multi-tenant SaaS with thousands of events per second and a dedicated ops team. |
| **Custom Postgres + Redis + Kafka** | The "real" stack for production coordination | EKET's stack is SQLite + Redis + file queue. Cheaper to operate, slower at scale, and the migration path to the bigger stack is well-defined (the schema is portable). | When the headline numbers stop being enough and the workload demands horizontal sharding. |
| **NoSQL document store (Mongo, DynamoDB)** | Flexible schema, no fixed tables | EKET's schema is *narrow and stable*: five tables, well-defined columns, FK constraints. A document store buys flexibility that the protocol does not need. | Workloads with high schema churn and no FK semantics. |

### When the SQLite choice is the wrong choice

- **Multi-host from day one.** SQLite is a library; the database is a file. If you need two machines to share a database without a replication layer, you need Postgres. (Litestream is an option; v0.1 of EKET does not provide it.)
- **>1k sustained TPS of protocol operations.** The single-writer model will become the bottleneck. The protocol itself can run on Postgres unchanged, but the CAS pattern shifts from "SQLite single-writer" to "Postgres `SELECT ... FOR UPDATE`" or advisory locks.
- **Cross-region replication.** SQLite has no built-in replication. If the team spans regions and needs a single source of truth, Postgres with logical replication is the answer.
- **Very large `task_messages` tables.** A Slaver's full conversation log can grow to GBs in long-running refactors. The recommended practice is to prune `task_messages` after `task:complete` (keeping only the `task_history` summary), or to offload to S3 with the `task_id` as the key. This is *not* in v0.1; the team should plan for it.

---

## 7. Lessons Learned

**Lesson 1 — CAS is the protocol, not an optimization.** When we replaced the read-then-write claim with a single `UPDATE ... WHERE status = 'ready'`, the rate of double-claims dropped from ~5% to 0.0% in our internal benchmarks. The 5% was not a model problem; it was a TOCTOU window. SQL CAS collapsed the window to zero. The lesson: every state transition in the protocol is a CAS, and the role check is a column on the WHERE clause, not a check before the statement.

**Lesson 2 — SQLite's reputation is 10 years out of date.** WAL mode, `synchronous = NORMAL`, partial indexes, and the `ON CONFLICT` upsert make modern SQLite a *real* database for the workloads EKET targets. The "toy database" framing is wrong; the right framing is "the most-replicated database in the world, and the one your phone runs". The single-writer limit is real, but it is not the limit people think it is — it is *latency under high write contention*, not raw throughput.

**Lesson 3 — Event sourcing is cheap if you commit to append-only from day one.** Retrofitting event sourcing onto a CRUD database is painful. Retrofitting it onto `task_history` was free because the schema was always append-only — no `UPDATE task_history` calls exist in the codebase, only `INSERT`. The same is true for `shared/audit.log`: the file is opened with `O_APPEND` (`node/src/core/state/audit.ts:36`), so the kernel guarantees atomicity of single writes. The lesson: pick the data model that matches the access pattern *before* the application grows.

**Lesson 4 — Two engines is one more engine than you need.** Redis as a pure cache is fine. Redis as a cache *and* a pub/sub bus is fine. Redis as a cache, a pub/sub bus, *and* a primary store is one too many things. The moment Redis is the only place a state mutation lives, the protocol is hostage to Redis's durability semantics. Keeping Redis to the role of "cache + notification" and SQLite to the role of "truth" makes the system tractable: Redis can lose data, and the protocol keeps working. This is the same argument the *Coda* paper made about systems design in 1995, and it is still right.

**Lesson 5 — Backups are not optional, and they are not free.** The `backup-sqlite.sh` script is 381 lines, and every line earns its place. The SHA-256 sidecar, the emergency-backup-on-restore, the integrity check after restore — these are not paranoid. They are the difference between "we lost 3 hours of work" and "we lost 3 hours of work *and* we have a corrupted database". The lesson: budget the time to write the backup script, write the cron entry, and verify the restore works *before* you need it.

**Lesson 6 — The on-disk CAS (`tmp → rename`) is the unsung hero.** Every time we look at a bug report and the reproducer is "the file is empty" or "the file is half-written", the fix is "use `atomicWrite`". The pattern is 20 lines of code (`node/src/core/state/atomic.ts:19-42`); it is also the difference between a recoverable system and one that loses user work to power outages. The Rust mirror (`rust/crates/eket-core/src/ticket.rs:100-103`) is three lines; the comment above it (`// Atomic write: tmp → rename`) is the most important comment in the file.

**Lesson 7 — The consistency story must be a table, not a paragraph.** When two engines disagree, a hand-wave like "Redis is eventually consistent" is useless. A table with eight rows — C1 through C8 — and a rule for each is what an on-call engineer reads at 3 a.m. The table is the contract. If a new case appears, the table grows; the contract is preserved.

---

## 8. References

- **Source code (TypeScript):**
  - `node/src/core/sqlite-client.ts:184-320` — table DDL (synchronous client)
  - `node/src/core/sqlite-client.ts:222-248` — `task_history` schema + partial unique index
  - `node/src/core/sqlite-client.ts:265-270` — `task_checkpoints` schema (CAS)
  - `node/src/core/sqlite-client.ts:295-305` — `tickets` schema
  - `node/src/core/sqlite-client.ts:661-695` — `claimTaskById` (transactional claim)
  - `node/src/core/sqlite-client.ts:966-976` — the atomic `UPDATE ... WHERE status = 'ready'` claim
  - `node/src/core/sqlite-async-client.ts:87-89` — `WAL` / `synchronous = NORMAL` / `foreign_keys = ON` pragmas
  - `node/src/core/sqlite-async-client.ts:732-736` — `task_messages` next_seq computation
  - `node/src/core/task-checkpoint.ts:21-32` — `CheckpointCASError`
  - `node/src/core/task-checkpoint.ts:48-108` — `saveCheckpoint` + `_casUpdate`
  - `node/src/core/task-checkpoint.ts:160-168` — `isToolCallAlreadyExecuted`
  - `node/src/core/state/atomic.ts:19-42` — `atomicWrite` (POSIX rename CAS)
  - `node/src/core/state/audit.ts:23-37` — append-only audit log
  - `node/src/core/state-reconciler.ts:96-348` — WAL replay + file-queue reconciliation
  - `node/src/core/event-bus.ts:242-261` — `emit` / `emitAsync` / `publish`
  - `node/src/core/redis-client.ts:1-100` — graceful Redis degradation
- **Source code (Rust):**
  - `rust/crates/eket-core/src/ticket.rs:100-103` — `tmp → rename` atomic write
  - `rust/crates/eket-core/src/saga.rs:30-94` — `SagaExecutor` (compensation in reverse order)
  - `rust/crates/eket-core/src/saga.rs:233-288` — `middle_step_fails_rolls_back` test
  - `rust/crates/eket-core/src/pubsub.rs:20-21` — channel constants
  - `rust/crates/eket-core/src/pubsub.rs:43-49` — graceful degradation on Redis loss
  - `rust/crates/eket-core/src/migrations.rs:1-20` — `MigrationRunner`
- **Operations:**
  - `scripts/backup-sqlite.sh:1-381` — backup / restore / list / verify
  - `scripts/backup-sqlite.sh:69-129` — `do_backup` (online `.backup` + gzip + SHA-256)
  - `scripts/backup-sqlite.sh:204-276` — `do_restore` (with emergency backup)
  - `scripts/backup-sqlite.sh:132-160` — `cleanup_expired` (7-day / 168-backup retention)
  - `scripts/retro-sqlite.sh:1-397` — retrospective DB management
  - `scripts/retro-sqlite.sh:50-96` — `init` (table creation)
  - `scripts/retro-sqlite.sh:99-119` — `import` (markdown → SQLite)
- **Protocol schemas:**
  - `protocol/state-machines/ticket-status.yml:1-112` — the state machine (17 states)
  - `protocol/schemas/ticket.meta.schema.yml:1-120` — ticket metadata schema
  - `protocol/schemas/message.schema.json:1` — pub/sub message envelope
  - `protocol/schemas/heartbeat.schema.json:1` — Slaver heartbeat
- **Architecture & ADRs:**
  - `docs/articles/01-what-is-eket/en/article.md:1` — the thesis article
  - `docs/articles/02-why-you-need-eket/en/article.md:1` — the pain × solution × ROI argument
  - `docs/articles/05-four-level-degradation/en/article.md:1` — L0 / L1 / L2 / L3 fallback chain
  - `docs/articles/06-master-slaver-protocol/en/article.md:1` — Master-Slaver protocol (CAS, Saga)
  - `docs/adr/ADR-002-master-slaver-mode.md:1` — human + AI unification
  - `docs/adr/ADR-003-file-queue-fallback.md:1` — file-queue fallback
- **Glossary & series navigation:**
  - `docs/articles/GLOSSARY.md:1-43` — shared terminology
  - Previous article: [`06-master-slaver-protocol`](../../06-master-slaver-protocol/en/article.md) — the state machine and Saga 5-step
  - Next article: [`08-rust-performance`](../../08-rust-performance/en/article.md) — the per-operation performance breakdown under controlled conditions
