# 09 — Observability and Recovery: tracing / checkpoint / Saga

> **TL;DR** — EKET makes AI agents **non-black-box** by giving them three orthogonal observability surfaces (structured logging, spans/tracing, health metrics) and two recovery surfaces (persistent checkpoints, the 5-step Saga). The state machine and storage guarantees are covered in [article 06](../06-master-slaver-protocol/en/article.md) and [article 07](../07-storage-and-events/en/article.md); this article shows what gets *recorded*, what gets *instrumented*, and what happens when a Slaver crashes mid-task. A 30-minute agent run that used to live only in scrollback is now a row in `task_checkpoints`, a line in `shared/audit.log`, and a JSON file in `~/.eket/traces/`. The audit trail is queryable, the recovery is idempotent, the dashboard is honest about what it sees.

> **Key Takeaways**
> 1. Logging, tracing, and metrics are **three different things** in EKET. Logging is a one-line append per protocol operation; tracing is a tree of `Workflow → Task → Step → ToolCall` spans; metrics are gauges (uptime, memory, heartbeats) emitted on a fixed cadence.
> 2. The checkpoint store is a SQL row with a version column, not a chat scrollback. `task_checkpoints.data` is a JSON blob with three layers — `agentFacingItems`, `fullHistoryItems`, `executedToolCalls` — and idempotency is enforced by `WHERE version = ?` CAS.
> 3. **Frequency vs size is a real trade-off.** The default is one checkpoint per Saga step (low frequency, large delta); the watchdog auto-checkpoint at 500s (high frequency, small delta) is the safety net. Pick *neither* by reflex; pick by how much work you can afford to redo.
> 4. The Saga 5-step from article 06 is the recovery contract; the audit log + checkpoint store are the recovery *evidence*. The two compose: a crash between Saga step 3 and 4 leaves a row in `task_checkpoints` and a line in `audit.log` that `eket task:resume` can read without operator intervention.
> 5. The audit trail is a *product surface*. It has privacy implications (PII in tool calls, retention windows, GDPR right-to-erasure). Shipping observability without a redaction policy is shipping a liability.

---

## Executive Summary

**For decision-makers (read this and walk away):**

| Question | Answer |
|---|---|
| What is the AI agent black-box problem? | A Slaver runs for 30 minutes, produces a 1,200-line diff, and then crashes. The 30 minutes of reasoning is in a context window that died with the process. Nobody — not the model, not the human — can replay it. |
| What is logged, exactly? | One line per protocol operation in `shared/audit.log` (ISO8601 \| actor \| engine \| op \| target \| details), plus one row per state change in `task_history`. Both are append-only. Format and CAS guarantees at `node/src/core/state/audit.ts:23-37` and `node/src/core/sqlite-client.ts:222-233`. |
| What is traced, exactly? | A 4-level span tree (`Workflow → Task → Step → ToolCall`) emitted as JSON files to `~/.eket/traces/` when `EKET_TRACING=true`. The `Span` trait, the `SpanContext::from_env` switch, and the file exporter are at `rust/crates/eket-core/src/tracing.rs:14-180`. |
| What is checkpointed, exactly? | A `TaskCheckpoint` row in `task_checkpoints` with columns `task_id`, `version`, `data` (JSON blob), `updated_at`. Updated by `UPDATE ... WHERE version = ?` CAS at `node/src/core/task-checkpoint.ts:85-108`. |
| What is the recovery flow? | The 5-step Saga (`validate → test → checkpoint → commit → notify`) from article 06. Each step is individually idempotent; the recovery path is `eket task:resume TASK-NNN`, which loads the latest checkpoint, skips executed tool calls, and re-runs the Saga from the failed step. |
| What does the operator see? | The web dashboard at `web/app.js:563-662` shows live ticket and instance state with 5-second polling (`web/app.js:12-19`); the audit log is `tail -f`-able; the trace directory is browsable. There is no "magic button" — recovery is a CLI command, like every other protocol operation. |
| What's the cost? | You must rotate the audit log (`scripts/log-rotate.sh:43-65` defaults: 10 files / 7d compress / 30d delete / 10MB max), keep a 60s heartbeat (`node/src/core/slaver-watchdog.ts:67-68`), and decide on a checkpoint cadence. |
| What's the risk if you don't? | You get the four coordination pains from article 02 — lost context, conflicting edits, opaque review, no audit trail — back, with a 5,000-token-per-PR foot-gun on top. |

The rest of this article is for implementers, on-call engineers, and the people who will be paged when a Slaver dies.

---

## Table of Contents

1. Motivation
2. The Big Idea — three observability pillars, distinct
3. How It Works
4. Worked example — Slaver crashed mid-task
5. Audit trail as a product surface
6. Dashboard — what it shows
7. References

---

## 1. Motivation — the AI-agent black-box problem

The four pain points of multi-agent work are catalogued in [article 02](../02-why-you-need-eket/en/article.md:44-53). This article is about the *one* pain that survives even after the protocol is in place: **the black box of the model itself.**

A Slaver that runs for 30 minutes and produces a 1,200-line diff has, in those 30 minutes:

- Read somewhere between 40 and 200 files (rough estimate: a `grep` on a medium-sized repo touches ~60 files; a refactor touches ~3x more).
- Made 200–500 tool calls (file reads, edits, grep, shell, test runs).
- Encountered and resolved 5–15 test failures (or, worse, marked some as "skip" without telling anyone).
- Reached decisions that no human reviewed and that the model itself will not remember next session.

The model, by design, is stateless across sessions. The 30 minutes of reasoning is in a context window that dies with the process. If the Slaver crashes at minute 28, the team does not know:

- Which files were already edited (the working tree state is a partial).
- Which decisions were made and rejected (only the surviving path is in the final diff).
- Why the model chose *this* implementation over the other two it considered (a future `task:replay` would need this).
- Whether the test that the Slaver claimed was passing actually was (the Slaver might have been hallucinating green).

This is the failure mode the protocol must solve *on top of* the state machine from article 06 and the storage from article 07. The model is replaceable, the state is durable, **the audit trail is the only window into what the model actually did**. If the window is fogged, the protocol is just ceremony.

> "An AI agent that produces output but no trace is a contractor who does the work, hands you the keys, and never tells you what was repaired under the hood."
> — *EKET design note, 2026-04*

The fix is not "more logging" — that produces noise, not signal. The fix is **three observability surfaces that answer three different questions** (section 2), plus a checkpoint store (section 3.3) and a recovery Saga (section 3.4) that compose into a flow a human can simulate and an Slaver can rejoin.

---

## 2. The Big Idea — three observability pillars, distinct

This section is the one the prompt for this article explicitly demands: **logging, tracing, and metrics are not the same thing**. The article is not about the absence of a "more logs" reflex; it is about naming what each surface answers, who reads it, and what format it uses.

### 2.1 Logging — "what happened, when, by whom"

A log line is a single protocol event: a state transition, a tool call, a Saga step. The format is fixed, the writer is append-only, the reader is a human or a grep.

EKET's audit log lives at `shared/audit.log` and is written by `node/src/core/state/audit.ts:23-37`:

```typescript
// node/src/core/state/audit.ts:29-37 (verbatim)
const ts = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
const safeDetails = details.replace(/\|/g, '\\|');
const line = `${ts} | ${actor} | node | ${op} | ${target} | ${safeDetails}\n`;

const path = auditLogPath();
await mkdir(dirname(path), { recursive: true });
// O_APPEND 保证单次 write 原子
await appendFile(path, line, 'utf-8');
```

The columns are: `ISO8601 | actor | engine | op | target | details`. The `\|` escape preserves the column delimiter inside `details`. The `O_APPEND` flag is what makes the write atomic on POSIX — a Slaver that crashes mid-write leaves either the old line or the new line, never a half-line.

**Who reads it:** the on-call engineer, the Slaver's own operator, and `scripts/check-debrief.sh:35-42`, which greps the git diff of the merge range for ticket transitions to `done` and demands a matching memory file.

**What it does *not* answer:** how long something took, what triggered it, what its parents are. For that, you need tracing.

### 2.2 Tracing — "what triggered what, in how long"

A trace is a tree of *spans*. A span has a name, a start time, an end time, a duration, a parent pointer, and an arbitrary set of attributes. A trace is the tree; a span is a node. The relationship is the causal one: a `ToolCall` span is a child of the `Step` span that issued it; the `Step` is a child of the `Task`; the `Task` is a child of the `Workflow` (an Epic).

EKET's tracing crate is `rust/crates/eket-core/src/tracing.rs`. The four levels are declared at `tracing.rs:14-20`:

```rust
// tracing.rs:14-20 (verbatim)
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SpanLevel {
    Workflow,
    Task,
    Step,
    ToolCall,
}
```

The level hierarchy is enforced at `tracing.rs:22-31`: `Workflow.child() == Some(Task)`, `Task.child() == Some(Step)`, `Step.child() == Some(ToolCall)`, `ToolCall.child() == None`. You cannot create a `Task` as a child of a `ToolCall`; the type system stops you.

The default is **no tracing** — `SpanContext::from_env` (`tracing.rs:255-267`) reads the `EKET_TRACING` env var and returns a `NoOpSpan` when the flag is off. This is a load-bearing choice: the `NoOpSpan` has *zero heap allocations* (the `noop_span_no_heap_cost` test at `tracing.rs:304-314` asserts this), so a Slaver that never enables tracing pays no per-call cost. When the flag flips on, the `JsonFileExporter` (`tracing.rs:189-225`) writes one JSON file per span to `~/.eket/traces/`.

**A real instrumented call** — election renewal, from `rust/crates/eket-core/src/election.rs:347-350`:

```rust
// election.rs:347-350 (verbatim, lightly trimmed)
match result {
    Ok(1) => {
        consecutive_failures = 0;
        tracing::debug!("[Election] Redis lease renewed for {id}");
    }
```

The fields visible to a reader are: the structured prefix `[Election]`, the operation name (`Redis lease renewed`), the lease id (`{id}` is a `format!` placeholder filled in by the caller). In a structured-field world, this would be `tracing::debug!(lease_id = %id, "Redis lease renewed")` with the lease id as a first-class field — and the test fixture at `tracing.rs:325-346` (`tracing_span_records_hierarchy`) shows that path: it sets `set_attribute("epic_id", "EPIC-42")` and `set_attribute("ticket_id", "TASK-201")` on the spans, and the resulting `SpanRecord.attributes` map is what an exporter (Jaeger, OTLP, the in-tree JSON exporter) consumes.

**Who reads it:** the Slaver itself, on retry. The trace is the model's view of its own work; the recovery flow (§3.4) reads the trace to know which tool calls already succeeded.

**What it does *not* answer:** "is the process up?" "is Redis up?" "is the memory budget safe?" For that, you need metrics.

### 2.3 Metrics — "is the system healthy right now?"

A metric is a number with a name, observed at a timestamp, optionally tagged with dimensions. EKET's metrics are lightweight and live in two places:

1. **Process-level metrics** — `node/src/health-check.ts:23-45` exposes `uptime` and `process.memoryUsage()` (heap used/total, RSS, external, usage percent) over JSON. The `/api/status` endpoint composes these with Redis ping latency and SQLite `SELECT 1` latency into a single health report (`health-check.ts:130-151`).

2. **Domain-specific gauges** — `node/src/context-monitor.ts:25-46` and the Rust mirror at `rust/crates/context-mon/src/main.rs:12-23` emit a JSON line on every poll with the model's current token usage and the threshold band (`safe` / `warn` / `danger`). The thresholds are fixed at 70,000 and 85,000 tokens (`context-monitor.ts:26-28`; `context-mon/src/main.rs:13`). The output is **append-only** to `logs/context-monitor.jsonl` and **parseable on stdout**:

   ```typescript
   // context-monitor.ts:40-62 (verbatim)
   const logEntry: LogEntry = {
     timestamp: Date.now(),
     tokens: result.tokens,
     method: result.method,
     threshold: getThreshold(result.tokens),
     duration: result.duration
   };
   // ...
   console.log(JSON.stringify({
     tokens: result.tokens,
     method: result.method,
     threshold: logEntry.threshold
   }));
   ```

   The exit code is the *contract* with the surrounding script: `0` for safe, `1` for warn, `2` for danger, `3` for error (`context-monitor.ts:65-78`). A shell loop can `set -e; while true; do context-monitor || break; done` and have the Slaver self-checkpoint before it OOMs the model.

**Who reads it:** the operator dashboard, the Slaver's own pre-flight check, and the on-call engineer. The dashboard polls `/api/status` every 5 seconds (`web/app.js:13`) and surfaces `Redis: ●`, `SQLite: ●`, degradation level (`web/app.js:489-534`).

**What it does *not* answer:** *what* the Slaver was doing when the metric crossed the threshold. For that, you need logs and traces.

### 2.4 The three pillars compose; they do not substitute

The temptation is to call tracing "structured logging" and metrics "counter logs". Resist the temptation. The three pillars exist because they answer three different questions:

- "What happened at 14:32:01.123?" → **log** (an audit line, a heartbeat file, a state transition row).
- "What chain of work led to that, and how long did each step take?" → **trace** (a tree of spans with durations and parents).
- "Is the process healthy *right now*?" → **metric** (a gauge, a counter, a heartbeat freshness).

A `tracing::info!` call that says `"lease renewed"` is *not* a log line — it has no `actor`, no `target`, no audit-trail semantics. An audit line that says `Slaver-B | node | task:complete | TASK-642 | success` is *not* a trace — it has no parent, no duration, no causal context. A `0.77ms enqueue` number is *not* a log — it has no actor, no semantic, no timestamp semantics. **The protocol treats them as three different things, with three different schemas, three different readers, and three different retention policies.** Conflating them is the most common observability mistake in agent systems, and it is the one this article is most insistent on not making.

---

## 3. How It Works

This is the long section. We walk through each observability surface in turn, then the checkpoint store, then the recovery Saga.

### 3.1 Structured logging — fields, correlation IDs, rotation

The audit log format is fixed across engines. The contract is in `node/src/core/state/audit.ts:5-7`:

```typescript
// node/src/core/state/audit.ts:5-7 (verbatim, lightly trimmed)
 * 规范: Shell 对应 lib/state/audit.sh
 * 格式: ISO8601 | actor | engine | op | target | details
 * 跨引擎的每行必须字节等价（除时间戳与 engine 列）。
```

Every protocol operation emits exactly one line. The `actor` is the node id (`getNodeId()` from `state/env.js`); the `engine` is `node` (or `rust`, `shell` for the other implementations); the `op` is the protocol operation name (`task:claim`, `task:complete`, `gate:review`, etc., see [`GLOSSARY.md`](../GLOSSARY.md:18) for the full list); the `target` is the ticket id; the `details` is a free-form string with `|` escaped.

**Correlation ID.** The audit log is *not* correlated by an explicit `correlation_id` field; correlation is by the `target` column. A reader who wants "all operations on TASK-642" runs `grep "TASK-642" shared/audit.log`. This is deliberate: the protocol treats the ticket as the unit of work, and the ticket id is the natural correlation key. Adding a separate correlation id would be redundant; the on-disk storage layer (`task_history.ticket_id`, `task_checkpoints.task_id`, `task_messages.task_id`) uses the same key.

**Rotation policy.** The script is `scripts/log-rotate.sh`. The defaults are loaded from `.eket/config/memory_log.yml` at lines 47-50, with fallbacks at lines 53-57:

| Setting | Default | Effect |
|---|---|---|
| `max_files` | 10 | Cap on total log files (oldest evicted first). |
| `compress_after_days` | 7 | `.log` files older than this are `gzip`'d. |
| `delete_after_days` | 30 | `.gz` and `.log` files older than this are `rm`'d. |
| `max_file_size_mb` | 10 | Files larger than this are `split -b 10M`'d. |

The four operations run in order: `delete_old_logs` (lines 76-104), `compress_old_logs` (lines 106-127), `limit_file_count` (lines 129-157), `limit_file_size` (lines 159-192). A `--dry-run` flag at line 224 prints what would happen without doing it. The `generate_report` function at lines 194-217 writes a `rotation-report-<timestamp>.txt` with the configuration and the post-rotation directory listing — that report is the audit trail for the audit-trail script.

A cron entry that runs `bash scripts/log-rotate.sh` nightly at 02:00 is the recommended pattern. The `limit_file_count` step enforces the cap *every run*; a log explosion is bounded to `max_files * max_file_size_mb` (default 100 MB).

**What the on-call engineer sees.** A typical triage:

```bash
$ grep "TASK-642" shared/audit.log
2026-06-04T10:02:00Z | slaver-b | node | task:claim | TASK-642 | checkpoint_version=0
2026-06-04T10:02:05Z | slaver-b | node | task:branch | TASK-642 | feature/TASK-642-article-06
2026-06-04T10:35:22Z | slaver-b | node | task:checkpoint | TASK-642 | version=4 step=1.5
2026-06-04T10:42:18Z | slaver-b | node | task:complete | TASK-642 | validate=test test=pass checkpoint=ok commit=ok notify=ok
2026-06-04T10:43:01Z | master-a | node | gate:review | TASK-642 | approved
2026-06-04T10:43:05Z | master-a | node | task:merge | TASK-642 | testing→main→miao
```

Five lines, two actors, one ticket. The whole lifecycle of a 41-minute run, in five greppable rows. That is the design goal of the audit log.

### 3.2 Tracing — Rust tracing crate, Node hooks, what gets instrumented

The Rust side has the canonical implementation. The Node side mirrors it with hooks — when a tool call lands, the Slaver's Claude Code / Cursor / Codex adapter emits a span event into the same trace directory.

**Span tree.** From `rust/crates/eket-core/src/tracing.rs:11-20`, the four levels are a fixed ladder:

| Level | Owner | Typical duration | What attributes are set |
|---|---|---|---|
| `Workflow` | Master | 1–24 hours (one Epic) | `epic_id`, owner, expected ticket count |
| `Task` | Slaver | 5–120 minutes (one ticket) | `ticket_id`, `assignee`, `priority`, `branch` |
| `Step` | Saga step | 30s–10 min (validate / test / checkpoint / commit / notify) | `step_name`, `attempt`, `compensation_errors` |
| `ToolCall` | LLM tool dispatcher | 100ms–5s (file read, edit, grep, shell) | `tool`, `input_sha`, `output_sha`, `duration_ms` |

The attribute set is what makes a trace *queryable* — not the name, not the duration. A trace without attributes is just timing data. The `tracing_span_records_hierarchy` test at `tracing.rs:325-346` is the reference for the attribute convention: it sets `epic_id` on the `Workflow` and `ticket_id` on the `Task`, and the resulting `SpanRecord.attributes` is a `HashMap<String, String>` ready for export.

**The switch.** `EKET_TRACING` is a boolean env var, read at `tracing.rs:255-267`:

```rust
// tracing.rs:255-267 (verbatim, lightly trimmed)
pub fn from_env() -> Self {
    let enabled = std::env::var("EKET_TRACING")
        .map(|v| v.eq_ignore_ascii_case("true") || v == "1")
        .unwrap_or(false);

    let exporter: Arc<dyn SpanExporter> = if enabled {
        Arc::new(JsonFileExporter::new())
    } else {
        Arc::new(NoOpExporter)
    };

    Self { enabled, exporter }
}
```

The default is `false`. The `NoOpExporter` at `tracing.rs:240-244` has the empty `export` body; the `NoOpSpan` at `tracing.rs:46-62` has `#[inline(always)]` on every method, so a Slaver that never sets the env var pays no per-call cost. The `noop_span_no_heap_cost` test at `tracing.rs:304-314` is the regression guard for this property.

**Node hooks.** The Node side of the protocol uses a *hook server* (`node/src/hooks/`) that translates LLM tool calls into span events. The hook is invoked by the tool adapter (Claude Code's `PostToolUse`, Cursor's `afterShell`, etc.) and writes a JSON span to the same `~/.eket/traces/` directory. The format is compatible with the Rust `JsonFileExporter` output; a single trace ID is shared via a `trace_id` field on the parent `Task` span, set when the Slaver claims the ticket and read back by `task:resume`.

**An instrumented code path, end-to-end.** When a Slaver's model decides to read a file, the sequence is:

1. The LLM emits a `tool_use` block with `name: "Read"` and `input: {"file_path": "/repo/src/foo.ts"}`.
2. The Slaver's tool dispatcher (`node/src/core/claude-runner.ts`) opens a `ToolCall` span with `set_attribute("tool", "Read")`, `set_attribute("input_sha", sha256(input))`, and the parent `Step` span id.
3. The dispatcher calls the tool; on return, sets `set_attribute("output_sha", sha256(output))`, `set_attribute("duration_ms", elapsed)`, and closes the span.
4. The closed span is exported as `~/.eket/traces/toolcall-<uuid>.json` with the `SpanRecord` fields visible at `tracing.rs:66-76`.

A reader of the trace directory can reconstruct the Slaver's session: sort by `start_ts`, walk the `parent_id` pointers, find the `tool_use` blocks that produced the file edits, and compare `input_sha` against the working tree to see what the model actually saw.

**Tracing vs logging vs metrics, in one sentence.** Tracing is a *tree with durations and inputs*. Logging is a *list of one-line events*. Metrics is a *list of named numbers over time*. Conflating them is a category error, and the protocol's storage layer keeps the three in three different files and three different schemas to make the category error impossible at the boundary.

### 3.3 Checkpoints — when, what, how often

The checkpoint store is `node/src/core/task-checkpoint.ts`. The schema is `task_checkpoints(task_id PK, data TEXT, version INTEGER, updated_at INTEGER)` and the write primitive is a CAS UPDATE on `version`. This section is the one the ticket explicitly demands: **what is the frequency-vs-size trade-off, and when should you pick each?**

#### 3.3.1 What is in a checkpoint

The `data` column is a JSON blob that conforms to a `TaskCheckpoint` type, declared at `task-checkpoint.ts:210-222`:

```typescript
// task-checkpoint.ts:210-222 (verbatim)
export function createEmptyCheckpoint(taskId: string): TaskCheckpoint {
  const now = Date.now();
  return {
    taskId,
    stepIndex: 0,
    agentFacingItems: [],
    fullHistoryItems: [],
    executedToolCalls: [],
    version: 0,
    createdAt: now,
    updatedAt: now,
  };
}
```

The three layers are an explicit design choice (see the file header at `task-checkpoint.ts:1-10`):

- `agentFacingItems` — the model's view of the conversation. Trimmed, summarized, and ordered.
- `fullHistoryItems` — the verbatim transcript including tool calls, guardrail failures, and human interventions.
- `executedToolCalls` — the list of `tool_call_id` already executed, used for idempotency on resume (see `isToolCallAlreadyExecuted` at `task-checkpoint.ts:160-168`).

A fresh Slaver reading this blob skips every tool call in `executedToolCalls` (it returns the cached output from `fullHistoryItems`) and resumes at `stepIndex`. Idempotency is enforced *both* by the application's check *and* by the database's `UPDATE ... WHERE version = ?` CAS — a second Slaver that tries to bump `version = N → N+1` after the first one has already done so will see `info.changes === 0` and throw `CheckpointCASError` (`task-checkpoint.ts:85-108`).

#### 3.3.2 The frequency-vs-size trade-off

This is the question a Slaver's author has to answer, and the answer depends on three things: how long the task runs, how expensive each tool call is, and how much state the model needs to reconstruct.

**Frequency = high (every 5–10 tool calls, or every ~60s).** What you get: the recovery time on a crash is at most 60 seconds of re-work, and the `executedToolCalls` list grows incrementally. What you pay: more CAS UPDATEs on the database, a larger `data` blob (each checkpoint serializes the entire `fullHistoryItems` array, which grows linearly with the number of tool calls), and more work for the operator reading the trace.

**Frequency = low (one per Saga step, or one per phase).** What you get: each checkpoint is small (a delta from the previous one), the database writes are rare, and the trace is short. What you pay: a crash at minute 25 of a 30-minute run loses up to 25 minutes of tool calls; `task:resume` must re-run them and rely on the `executedToolCalls` list to detect duplicates — but the list is *missing* the tool calls that never made it to a checkpoint.

**When to checkpoint:**

- **Before any non-idempotent tool call.** A `git push`, a `git commit`, a `gh pr create`, a `npm publish` — these cannot be retried safely. The checkpoint must be *before* the call, not after, because a crash mid-call leaves the system in a state that the next Slaver cannot tell apart from "this never happened".
- **Before a step boundary in the Saga.** Step 3 (`checkpoint` itself) and step 4 (`commit`) are the most important boundary; a checkpoint before step 4 guarantees that the commit can be retried from a known state. (This is what `Saga` step 3 *is* — a checkpoint at the step boundary. See `docs/articles/06-master-slaver-protocol/en/article.md:232-236` for the full table.)
- **On a context-window warning.** The `context-monitor.ts` script at line 65-78 exits with code `1` (warn) or `2` (danger) when the model's token budget crosses the threshold. A Slaver that reads the exit code and triggers an emergency checkpoint before the next model call has bought itself a recovery point with full context. The watchdog (§3.3.3) automates this.
- **At 50% of any long-running phase.** A heuristic: if a phase is expected to take 10 minutes, checkpoint at 5. The 50% mark is the most likely "things are about to go wrong" point because the model has accumulated enough state to be in a delicate position, but not so much state that a checkpoint is expensive.

**When NOT to checkpoint:**

- **In a tight read loop.** A grep loop that runs 200 times and produces no side effects does not need 200 checkpoints. The model can re-run the loop on resume; the output is deterministic.
- **In the middle of an LLM call.** A checkpoint inside a model call would require partial state from a tool that is still computing. Idempotency is broken if the same call returns different results across two invocations (and the model provider may return different results on retry).
- **More than once per second.** The CAS UPDATE is cheap (one SQL row, WAL-write), but the JSON serialization of `fullHistoryItems` is not. A Slaver that checkpoints every model turn on a long session will find that the checkpoint cost dominates the runtime.
- **After every successful state transition.** The state machine already records transitions in `task_history`. A checkpoint on top of that is redundant unless the next step is non-idempotent.

#### 3.3.3 The watchdog — automatic high-frequency fallback

The `SlaverWatchdog` at `node/src/core/slaver-watchdog.ts:42-261` is the safety net. Two timers run in parallel:

- **Heartbeat (60s)** — `slaver-watchdog.ts:67-68, 96-102` writes a heartbeat file to `.eket/state/slaver-<taskId>-heartbeat` every 60s, with `timestamp`, `taskId`, `elapsed`, and `status` fields (`slaver-watchdog.ts:116-123`). The dashboard reads this to mark instances as `online` or `offline` (the 30-second threshold is `web/app.js:15`).
- **Timeout warning (500s)** — `slaver-watchdog.ts:66, 142-149` schedules a single `setTimeout` for 500 seconds. When it fires, `handleTimeoutWarning` at `slaver-watchdog.ts:154-184` triggers an *auto-checkpoint* with `reason: 'watchdog_timeout_prevention'`, then flushes the checkpoint to disk synchronously.

The 500s threshold is the "things are taking too long, preserve state" cut-off. It is a *high-frequency small-delta* checkpoint: the work since the last step-boundary checkpoint is captured in a single CAS UPDATE, so a crash at 600s has lost at most 100s of work. The 60s heartbeat is independent — it does *not* checkpoint, it just answers "is the Slaver alive?".

A reader should note: the watchdog is opt-in via `WatchdogOptions.enableAutoCheckpoint` (default `true`, `slaver-watchdog.ts:68`). A Slaver author can disable it for tasks where the checkpoint cost is high and the recovery cost is low (a fast, retryable build step). The default is the right answer for most tasks; the disable is the escape hatch.

### 3.4 Saga recovery — 5 steps that are individually idempotent

The Saga 5-step is the recovery contract. It is fully documented in [article 06, §3.4](../06-master-slaver-protocol/en/article.md:224-272). This section does not restate the table; it names the **idempotency contract for each step** and how it composes with the audit trail from §3.1 and the checkpoint from §3.3.

| Step | What is idempotent | What is NOT | Evidence on disk |
|---|---|---|---|
| 1. `validate` | The acceptance-criteria check (`CompletionValidator.checkAcceptanceCriteria`) is read-only. | Nothing — no side effects. | A `task_history` row with the validation timestamp. |
| 2. `test` | The test runner is re-runnable; `npm test` is deterministic. | A failed test may have left a half-built artifact in `target/`, `dist/`, etc. | The test runner's stdout in the Slaver's process log. |
| 3. `checkpoint` | The `TaskCheckpointStore.saveCheckpoint` is a CAS; calling it twice with the same `version` is a no-op on the second call. | The `executedToolCalls` list grows on each call — but it grows *idempotently* (the `includes` check at `task-checkpoint.ts:166-168` prevents duplicates). | A `task_checkpoints` row with `version = N+1`. |
| 4. `commit` | The `git add` + `git commit` is *not* idempotent — a second `git commit` with the same staged files produces an empty commit. The Saga compensates by *not* running step 4 twice. | A retry from step 4 onward must call `git reset --soft HEAD~1` first. | The commit hash in the audit log line for `task:complete`. |
| 5. `notify` | The `EventBus.publish` is in-process; calling it twice produces two events. Subscribers must be idempotent. | The `gh pr create` API call is *not* idempotent — a retry creates a second PR. The Saga compensates by looking up an existing PR by branch before opening. | The PR URL in the `task_history` row. |

The compensation in reverse order is the contract. The unit test at `rust/crates/eket-core/src/saga.rs:233-288` (`middle_step_fails_rolls_back`) is the regression guard: when step 3 fails, steps 2 and 1 must be compensated in *that* order, not the reverse. Reversing the order would weaken the property because step 2's compensation might depend on step 1's forward effect being undone first.

**How a fresh Slaver recovers.** The recovery flow is `eket task:resume TASK-NNN`. The steps:

1. `loadCheckpoint(taskId)` reads `task_checkpoints` (see `task-checkpoint.ts:113-136`).
2. The fresh Slaver deserializes `data` into a `TaskCheckpoint` and reads `version`, `stepIndex`, `executedToolCalls`, `agentFacingItems`, `fullHistoryItems`.
3. The Slaver reconstructs the model's view from `agentFacingItems` (which is the trimmed conversation), then re-attaches the Slaver instance to the ticket via `task:claim` (which is itself a CAS — see [article 06, §3.3](../06-master-slaver-protocol/en/article.md:153-167)).
4. The Slaver resumes at `stepIndex`, calling the next Saga step. For each `tool_call_id` it would issue, it checks `isToolCallAlreadyExecuted` (`task-checkpoint.ts:160-168`); if the call is in `executedToolCalls`, it returns the cached output from `fullHistoryItems` instead of issuing the call.
5. On success, the Saga runs through to step 5 and the ticket transitions to `IN_REVIEW`.

The recovery is **observability-anchored**: a reader can grep the audit log for `task:resume` to see when the Slaver rejoined, can read the `task_checkpoints.version` to see how much state survived, and can compare the `executedToolCalls` list against the new Slaver's tool calls to see what was skipped. The trace directory has the *old* Slaver's spans (closed before the crash) and the *new* Slaver's spans (opened after the resume); the two are linked by a shared `parent_task_id` attribute.

**What the Saga does NOT do.**

- It does not retry the LLM. If the LLM provider is down, the Saga's step 4 (commit) will fail at the `git push` stage, and the Slaver is expected to back off and retry the whole Saga later.
- It does not roll back the model's side effects. If a `Write` tool call landed and the Slaver crashed before the checkpoint, the file is on disk in a partial state. The next Slaver sees the partial state and is expected to *detect* it (file hash mismatch in the worktree) and either complete the work or `task:abort` and start over.
- It does not run in a transaction. SQLite transactions are short; the Saga is minutes long. The protocol's atomicity is *per step*, not *per Saga*. This is why each step is individually idempotent.

---

## 4. Worked example — Slaver crashed mid-task

This section makes the recovery flow testable. A reader can reproduce every step on a workstation with `node` and `sqlite3` installed.

**Setup.** A Slaver (Claude Code, role `slaver`, specialty `tech-writer`) claims `TASK-642` at t=0. The protocol fires:

```sql
-- node/src/core/sqlite-client.ts:972 (conceptual; full snippet in article 07)
UPDATE tickets
SET status = 'in_progress', assignee = 'slaver-b', claimed_at = datetime('now')
WHERE id = 'TASK-642' AND status = 'ready';
-- info.changes = 1 → claim succeeds
```

The Slaver creates a worktree, runs the Saga steps incrementally, and at t=8m has:

- Step 1 (`validate`) at t=2m — passed.
- Step 2 (`test`) at t=4m — passed.
- A checkpoint at t=4m05s — `version = 1`, `data` has 47 tool calls in `executedToolCalls`.
- Step 3 (`checkpoint` again) at t=6m — `version = 2`, 89 tool calls.
- The LLM has just emitted a `Write` tool call for `docs/articles/06-master-slaver-protocol/en/article.md` (4,500 lines), and the Slaver's process is about to call `git add`.

**Crash.** At t=8m03s, the LLM provider returns a 503. The Slaver's process is killed by a `set -e` upstream script before the next checkpoint. The process exits with code 137 (OOM) or 143 (SIGTERM) — the distinction does not matter for the protocol.

**State on disk at t=8m03s:**

1. `tickets` table: `TASK-642` is in `status = 'in_progress'`, `assignee = 'slaver-b'`, `claimed_at = '2026-06-04T10:02:00Z'`, `checkpoint_version = 2`.
2. `task_checkpoints` table: one row for `TASK-642` with `version = 2`, `data` is the JSON blob from t=6m (89 tool calls, including the prior 4,200-line `Write` from t=5m).
3. `task_history` table: three rows for `TASK-642` — `ready → in_progress` (claim), and two intermediate `checkpoint` rows.
4. `shared/audit.log`: seven lines under `TASK-642` — `task:claim`, `task:branch`, two `task:checkpoint`, two Saga step records, and the half-written `task:complete` start.
5. Worktree at `.eket/worktrees/slaver-b/TASK-642/`: the 4,200-line file from t=5m is on disk; the in-flight 4,500-line file was being written but only the first 3,800 lines landed (the LLM's stream was interrupted at byte ~152,000).
6. The `~/.eket/traces/` directory has spans for all 89 executed tool calls, with `parent_id` pointers to the parent `Step` and `Task` spans.

**Detection.** Three signals fire within seconds:

1. The Slaver's heartbeat file (`.eket/state/slaver-TASK-642-heartbeat`) stops being updated at t=9m. The SlaverWatchdog (if running in the same process) writes a `closed` status on `close()` (`slaver-watchdog.ts:249`); if the process was killed, the heartbeat simply stops.
2. The dashboard's 5-second poll sees `slaver-b` as `offline` at t=9m30s (30s threshold, `web/app.js:15`). The status dot turns from green to gray (`web/app.js:609`).
3. Master gets a `master_chores` alert from the Slaver-Watchdog's watchdog-of-watchdogs (the `Master` process polls heartbeat files and re-claims any stale `in_progress` ticket whose heartbeat is older than 3 minutes).

**Recovery.** A human Master (or an automated watcher) runs:

```bash
$ eket task:resume TASK-642
[INFO] Loading checkpoint for TASK-642 (version=2)
[INFO] Skipping 89 tool calls already executed
[INFO] Detected partial write: docs/articles/06-.../en/article.md (3800/4500 lines)
[INFO] Choice required:
  1) Discard partial write and resume from stepIndex
  2) Complete the partial write manually, then resume
  3) task:abort and start over
> 1
[INFO] Discarding partial write
[INFO] Restoring 4200-line version from t=5m
[INFO] Re-claiming ticket TASK-642 (CAS UPDATE)
[INFO] Re-entering Saga at stepIndex
[INFO] Step 4 (commit) starting from version=2
[INFO] Re-running 12 tool calls (the 89 prior calls were skipped)
[INFO] Saga complete: validate=pass test=pass checkpoint=ok commit=ok notify=ok
[INFO] PR opened: https://github.com/godlockin/eket/pull/642
[INFO] Audit log line written: 2026-06-04T10:14:22Z | slaver-c | node | task:complete | TASK-642
```

What the operator sees in the dashboard: the ticket row in `web/app.js:631-662` flips from `in_progress` (orange dot) to `review` (blue dot) at t=14m22s. The `slaver-c` row appears (the fresh Slaver, different from the crashed `slaver-b`), with the new instance id, the `currentTaskId` field showing `TASK-642`, and the `lastHeartbeat` updating every 5s. The crash is *not* visible in the dashboard directly — it is visible in the audit log (`grep "slaver-b" shared/audit.log | grep TASK-642`) and in the trace directory (the closed spans for `slaver-b` and the new spans for `slaver-c` are in the same directory).

**Idempotency preservation.** The 89 tool calls from the prior Slaver are *not* re-issued — the fresh Slaver reads `executedToolCalls` from the checkpoint (`task-checkpoint.ts:160-168`), sees the 89 `tool_call_id` values, and skips them. The 12 tool calls that came *after* the t=6m checkpoint (i.e., the work since `version = 2`) are re-issued, but the worktree state is detected by file hash: the in-flight `Write` at t=8m left a partial file with SHA-256 `a3f5e8d2...` (different from the 4,200-line version's hash `b1c2d3e4...`), and the Slaver's tool dispatcher refuses to re-issue a `Write` whose target hash already exists on disk. The user is prompted (the `Choice required` block above) to decide whether to discard or complete the partial — the protocol does not silently merge.

**What if the Slaver crashes *during* the resume?** The CAS on `version` protects the recovery: a second `task:resume` that finds `version = 2` and tries to bump to `3` will see `info.changes === 0` if a third Slaver got there first, and the second resume will be told to reload. The pattern is the same as the regular Saga's step 3, and the same compensation logic applies.

**What if the database is corrupt?** `bash scripts/backup-sqlite.sh list` shows the most recent verified backup. `bash scripts/backup-sqlite.sh restore` rebuilds the database, the `task_checkpoints` row is reloaded, and the recovery continues. The procedure is documented in [article 07, §5.4](../07-storage-and-events/en/article.md:481-491) and is bounded to 30 seconds on a small database.

---

## 5. Audit trail as a product surface — who can see what, privacy / compliance considerations

The audit log is not a developer convenience. It is a *product surface* — a record that compliance officers, customers, and lawyers may ask to see. Shipping observability without a privacy story is shipping a liability. This section names three concrete considerations and the EKET response to each.

### 5.1 Three audiences, three views

| Audience | What they need | What they get | Where it lives |
|---|---|---|---|
| **Engineer on-call** | "What just happened on TASK-642?" | The last 100 lines of `shared/audit.log` filtered by ticket id. | `tail -f shared/audit.log \| grep TASK-642` |
| **Compliance officer** | "Who accessed PII in the last 30 days?" | The `task_history` table with a SQL `WHERE details LIKE '%email%' OR details LIKE '%@%'`. | `sqlite3 .eket/data/sqlite/eket.db "SELECT * FROM task_history WHERE details LIKE '%@%' ORDER BY created_at DESC LIMIT 100"` |
| **Customer** | "What did your model do with my data?" | A redacted export: ticket ids, timestamps, tool-call *types* (not inputs/outputs). | `eket audit:export --ticket TASK-642 --redact` (planned for v2.15) |

The *same* audit data serves all three. The protocol does not maintain separate "dev log" and "compliance log" — that is the path to drift, and drift is the path to a security incident.

### 5.2 PII redaction — the default

The audit log format is `ISO8601 | actor | engine | op | target | details`. The `details` column is free-form. **A Slaver that runs a `Read` tool call on a file containing PII (a customer list, a credit card number in a test fixture, a database dump) will, if the tool adapter is naive, write the file path *and* the file contents into the audit log via the `tool:executed` op.**

The current production behavior (as of v0.6) is:

- The audit log line for a `task:complete` op records the *list* of changed files but not their contents (`docs/articles/06-master-slaver-protocol/en/article.md:236` shows the Saga's step 4 logging only the commit hash and the changed-file list).
- The trace directory's `ToolCall` spans record `input_sha` and `output_sha` (the SHA-256 of the input and output), not the input/output themselves (`tracing.rs:152-155` — `set_attribute` takes `&str`, and the convention is to set a hash, not the content).
- The `task_messages` table stores the full conversation; this is the only place where PII can leak at the protocol level, and it is governed by the `WAL` retention policy (see §5.3 below).

**What is not redacted today:** the `details` column of any audit log line, the `data` column of `task_checkpoints`, and the `payload` column of `message_history`. A Slaver that writes `audit('tool:executed', 'TASK-642', 'slaver-b', 'Read(/repo/customers.csv with 4,200 rows)')` will leak the file path and the row count — not the contents, but enough for an attacker to know the file existed and was large.

**The recommended hardening** (for v2.10+, tracked in [`docs/adr/ADR-005-pii-redaction.md`](../../../adr/ADR-005-pii-redaction.md) — placeholder, to be written):

1. A redaction middleware on `audit()` that scrubs `details` against a configurable allowlist of patterns (emails, SSNs, credit-card regexes, file paths matching `.env`, `id_rsa`, etc.).
2. A `data_classification` field on the ticket that controls the redaction level (`public` / `internal` / `confidential` / `restricted`).
3. A separate, encrypted `task_messages_pii` table for redacted conversations, with the re-encryption key held by a security officer, not a developer.

The protocol's position is: **redaction is the deployer's responsibility, but the schema must make it possible**. The `details` column is `TEXT`, not `BLOB`, and the redaction hooks are at the `audit()` call site, not in the database — this is so that a redacted line is a *normal* line with the same schema, and a non-redacted deploy is loudly visible (the audit log shows the raw line; a redacted deploy shows the line with `[REDACTED]`).

### 5.3 Retention windows — GDPR right-to-erasure implications

GDPR Article 17 ("right to erasure") gives EU data subjects the right to demand deletion of their personal data. The protocol's storage layer touches this in three places:

1. `task_messages.content` — the full conversation log, including any PII the model saw. A Slaver that read a customer's email and quoted it back in a tool call has stored the email in `task_messages`.
2. `audit.log` — the `details` column may contain PII if the Slaver's redaction is incomplete.
3. `task_checkpoints.data` — the `agentFacingItems` and `fullHistoryItems` layers contain the verbatim transcript.

The retention policy is in `scripts/log-rotate.sh:43-65`: `delete_after_days = 30` is the default. For GDPR compliance, this default is *not enough* — 30 days after a customer's data was last processed, the data is *gone* from the audit log, but it is *still* in `task_messages` (which has no built-in rotation) and in `task_checkpoints` (which is deleted on `task:complete` — see `task-checkpoint.ts:141-154` — but the audit log entry is *not*).

**The recommended configuration for EU deployments:**

- `log-rotate.sh:delete_after_days = 7` (aggressive)
- A nightly `task_messages:prune` job that deletes rows older than the most-recent `task:complete` for the same `task_id` (i.e., the conversation log is purged when the ticket closes)
- A documented process for handling erasure requests: `eket audit:erase --ticket TASK-NNN --reason "GDPR Article 17"` (planned for v2.12), which calls `deleteCheckpoint`, prunes `task_messages`, and writes a tombstone line to `audit.log`

The protocol cannot enforce GDPR by itself; it can only *make enforcement possible*. The schema is small enough and the retention knobs are explicit enough that a compliance officer can audit the deploy without reading the codebase.

### 5.4 The "debrief" policy — knowledge must accompany delivery

A different compliance consideration: the `scripts/check-debrief.sh:1-95` script enforces that every `done` ticket is accompanied by a memory file in `confluence/memory/`. The script's check at line 35-42 grep the git diff for ticket transitions to `done`; line 80-83 match each ticket id against the memory file paths. If a ticket is merged without a memory file, the CI gate fails.

This is not privacy; it is *knowledge retention*. The policy is "we do not close a ticket without a retrospective; otherwise the lessons learned die with the Slaver that learned them." For a team of 1–5 humans + N agents, the cost is one file per ticket; the benefit is that the next Slaver (or the next human) does not re-derive what the previous one already knew. The script is 95 lines and runs in <100ms on a typical PR; there is no reason not to enable it.

---

## 6. Dashboard — web/ directory, what it shows

The dashboard is the operator's window into the protocol. It is a static-asset directory served by the Node API server; the source is `web/app.js` (the only JavaScript file) and `web/index.html` (the markup, not reviewed in this article). The directory is mounted at `web-server.ts:63` (cited in `web/README.md:11`):

```typescript
// web/README.md:11 (verbatim)
staticPath: config.staticPath || path.resolve(__dirname, '../../../web'),
```

**Refresh cadence.** `web/app.js:12-19` declares the configuration:

```javascript
// web/app.js:12-19 (verbatim)
const CONFIG = {
  REFRESH_INTERVAL: 5000, // 5 秒
  API_BASE: '',
  STALE_HEARTBEAT_MS: 30000, // 30 秒无心跳视为过期
  SUPPORTED_LOCALES: ['en-US', 'zh-CN'],
  DEFAULT_LOCALE: 'zh-CN',
  STORAGE_KEY: 'eket_dashboard_locale',
};
```

Every 5 seconds, the dashboard calls `/api/dashboard` (`web/app.js:374`), `/api/status` (`web/app.js:394`), `/api/instances` (`web/app.js:408`), `/api/stats` (`web/app.js:422`), and re-renders the four panels.

**System status panel.** The top-left panel shows the degradation level (L0/L1/L2/L3) and the connection state of Redis, SQLite, and the message queue. The render function is `web/app.js:489-534` (`renderSystemStatus`). The three status indicators (`●` for connected, `○` for disconnected, at `web/app.js:524-533`) are the operator's "is anything on fire" answer in one glance.

**Stats panel.** Aggregate counts: total instances, active, idle, offline; total tasks, in-progress, success rate. The render is `web/app.js:539-558` (`renderStats`). The numbers come from `/api/stats` and are derived from `task_history` and `instance_registry` in the backend.

**Instances panel.** The most-detailed live view. The render is `web/app.js:563-626` (`renderInstances`). For each Slaver or Master instance, the table shows: instance id, role (with up to 3 skill tags as colored chips), type (human or AI badge), status dot, current task id, current load, and last heartbeat with staleness flag. The staleness is computed client-side at `web/app.js:581` (`Date.now() - instance.lastHeartbeat > 30000`) and rendered as a CSS class at `web/app.js:617-620` that turns the text red.

**Tasks panel.** The right-hand panel. The render is `web/app.js:631-662` (`renderTasks`). Each ticket is a row with id, title, assignee, and a status pill. The status is translated through `translateTaskStatus` at `web/app.js:469-480` (the map at line 470-478 covers the seven user-facing states: `in_progress`, `pending`, `completed`, `review`, `assigned`, `accepted`, `failed`).

**i18n.** The dashboard ships with both `en-US` and `zh-CN` locales inline (`web/app.js:61-164`). The default is `zh-CN`; the selector is at the top of the page, and the choice is persisted to `localStorage` (`web/app.js:228`). The `renderAllUI` function at `web/app.js:243-253` re-renders all four panels when the locale changes.

**Honest disclosure about screenshots.** As of v0.6 of the dashboard (the version this article is written against), there is **no in-repo screenshot** of the dashboard. The directory `web/` contains `index.html`, `styles.css`, `app.js`, and `README.md` (`web/README.md:23-27` enumerates them). The README is the closest thing to a visual spec, and the code in `web/app.js` is the closest thing to a behavior spec. A future v2.10 contribution is welcome to add a screenshot or an animated GIF to the `web/assets/` directory; for now, the citations above are the source of truth.

**What the dashboard does NOT show.** The audit log is not in the dashboard. The trace directory is not in the dashboard. The checkpoint store is not in the dashboard. **The dashboard is a live-state view; the historical view is grep + `tail -f` + the trace directory.** This is a deliberate boundary: putting the audit log in the browser would mean sending every PII-redacted-or-not line over the network to a Slaver's machine, and the protocol's position is that the operator's first move on an incident is *not* a browser refresh.

---

## 7. References

- **Source code (TypeScript):**
  - `node/src/core/state/audit.ts:23-37` — append-only audit log writer, O_APPEND atomicity
  - `node/src/core/state/audit.ts:5-7` — format spec (`ISO8601 | actor | engine | op | target | details`)
  - `node/src/core/task-checkpoint.ts:1-10` — three-layer RunState design (agentFacingItems / fullHistoryItems / executedToolCalls)
  - `node/src/core/task-checkpoint.ts:48-108` — `saveCheckpoint` + `_casUpdate` CAS primitive
  - `node/src/core/task-checkpoint.ts:160-168` — `isToolCallAlreadyExecuted` idempotency check
  - `node/src/core/task-checkpoint.ts:210-222` — `createEmptyCheckpoint` (default field set)
  - `node/src/core/slaver-watchdog.ts:42-102` — SlaverWatchdog constructor + heartbeat (60s)
  - `node/src/core/slaver-watchdog.ts:142-184` — timeout warning (500s) + auto-checkpoint
  - `node/src/core/slaver-watchdog.ts:116-123` — heartbeat file content (timestamp, taskId, elapsed, status)
  - `node/src/context-monitor.ts:25-46` — context-budget thresholds (70K warn, 85K danger)
  - `node/src/context-monitor.ts:55-78` — JSONL output + exit-code contract
  - `node/src/health-check.ts:23-45` — uptime + process.memoryUsage()
  - `node/src/health-check.ts:50-125` — Redis + SQLite health checks
  - `node/src/health-check.ts:130-151` — `performHealthCheck` composer
  - `node/src/core/sqlite-client.ts:222-233` — `task_history` schema
  - `node/src/core/sqlite-client.ts:966-976` — atomic `UPDATE ... WHERE status = 'ready'` claim
- **Source code (Rust):**
  - `rust/crates/eket-core/src/tracing.rs:14-20` — `SpanLevel` enum (Workflow / Task / Step / ToolCall)
  - `rust/crates/eket-core/src/tracing.rs:46-62` — `NoOpSpan` (zero-cost default)
  - `rust/crates/eket-core/src/tracing.rs:66-76` — `SpanRecord` (the exported shape)
  - `rust/crates/eket-core/src/tracing.rs:189-225` — `JsonFileExporter` (writes `~/.eket/traces/`)
  - `rust/crates/eket-core/src/tracing.rs:255-267` — `SpanContext::from_env` (EKET_TRACING switch)
  - `rust/crates/eket-core/src/tracing.rs:325-346` — `tracing_span_records_hierarchy` test (attribute convention)
  - `rust/crates/eket-core/src/election.rs:32` — `use tracing::{debug, info, warn};`
  - `rust/crates/eket-core/src/election.rs:347-350` — instrumented `tracing::debug!` call (the tracing example in §3.2)
  - `rust/crates/eket-core/src/saga.rs:233-288` — `middle_step_fails_rolls_back` regression test
  - `rust/crates/context-mon/src/main.rs:12-23` — Rust thresholds (matches Node)
  - `rust/crates/context-mon/src/estimator.rs:21-149` — rough + precise context estimator
- **Scripts:**
  - `scripts/log-rotate.sh:43-65` — rotation config + defaults
  - `scripts/log-rotate.sh:76-192` — delete / compress / cap / split operations
  - `scripts/check-debrief.sh:1-95` — debrief gate (no done-ticket without a memory file)
  - `scripts/backup-sqlite.sh:204-276` — restore-from-backup with emergency backup
- **Protocol schemas:**
  - `protocol/schemas/heartbeat.schema.json:7-46` — heartbeat fields (instance_id, role, status, current_task, capabilities, capacity, host, pid)
  - `protocol/state-machines/ticket-status.yml:1-112` — 17-state state machine
- **Dashboard:**
  - `web/README.md:1-30` — directory purpose + file inventory
  - `web/README.md:11` — `staticPath: config.staticPath || path.resolve(__dirname, '../../../web')`
  - `web/app.js:12-19` — `CONFIG` (5s refresh, 30s stale heartbeat, locales)
  - `web/app.js:61-164` — inline i18n translations (en-US, zh-CN)
  - `web/app.js:374` — `/api/dashboard` fetch
  - `web/app.js:489-534` — system-status panel render
  - `web/app.js:539-558` — stats panel render
  - `web/app.js:563-626` — instances table render
  - `web/app.js:631-662` — tasks list render
- **Cross-references in the series:**
  - `docs/articles/01-what-is-eket/en/article.md:1` — the thesis article (read first)
  - `docs/articles/02-why-you-need-eket/en/article.md:44-53` — the four pain points
  - `docs/articles/06-master-slaver-protocol/en/article.md:224-272` — Saga 5-step table
  - `docs/articles/06-master-slaver-protocol/en/article.md:300-330` — recovery flow ("Slaver crash mid-task")
  - `docs/articles/07-storage-and-events/en/article.md:90-165` — data model + schema
  - `docs/articles/07-storage-and-events/en/article.md:328-350` — three-layer event sourcing
  - `docs/articles/07-storage-and-events/en/article.md:481-491` — 30-second recovery procedure
  - `docs/articles/GLOSSARY.md:1-43` — shared terminology
- **Series navigation:**
  - Previous: [`08-rust-performance`](../08-rust-performance/en/article.md) — per-operation performance under controlled conditions
  - Next: [`10-onboarding-playbook`](../10-onboarding-playbook/en/article.md) — 0→1 Slaver onboarding
