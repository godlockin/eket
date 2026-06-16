# 12 — Multi-Tool Support: One Protocol, Five Clients

> **TL;DR** — EKET is **tool-agnostic by construction**. The protocol — `task:claim`, `task:complete`, `task:resume`, `gate:review` — is a contract; each LLM tool (Claude Code, Cursor, Codex, Copilot, Gemini) is an **adapter** that reads the same state and emits the same operations. Two of the five adapters are *full* (Claude Code, Cursor); three are *degraded single-agent* (Codex, Copilot, AGENTS.md / Gemini) — and that distinction is honest, not punitive. The cross-tool event bridge lives in `node/src/hooks/` and exposes 28 hook events on a single HTTP surface. A new tool can be added with roughly 200 lines of markdown and a single HTTP client, because the protocol does the work.

> **Key Takeaways**
> 1. The LLM is an **implementation detail**. The contract is `eket task:claim TASK-NNN` plus a ticket-shaped artifact, not "ask Claude" or "ask Cursor."
> 2. The five shipped adapters split into **two full** (Claude Code, Cursor) and **three single-agent** (Codex, Copilot, AGENTS.md / Gemini) — both groups are first-class; the gap is capability, not legitimacy.
> 3. The cross-tool event bridge in `node/src/hooks/` is a single HTTP server exposing 28 hook events (`PreToolUse`, `PostToolUse`, `TeammateIdle`, `TaskCompleted`, …) that any adapter can call.
> 4. A worked workflow — Cursor writes, Claude Code reviews, Codex writes tests, GitHub Actions merges — runs on **the same SQLite tickets table** with **the same audit trail**, regardless of which tool touched which step.
> 5. Adding a new tool is a *contract test*, not a *framework port*: an adapter must (a) confirm identity via `.eket/IDENTITY.md`, (b) use the ticket YAML frontmatter, (c) follow the branch + Conventional Commits rules, (d) emit hook events to the HTTP server, and (e) write a status report. The `check-skill-anatomy.sh` CI gate enforces the shape.

---

## Executive Summary

**For decision-makers (read this and walk away):**

| Question | Answer |
|---|---|
| Does EKET lock us into one LLM vendor? | **No.** Five adapters ship today; the adapter contract is documented and testable. |
| What changes between full and degraded adapters? | Full adapters use Skills + Subagents + Hooks; degraded adapters use a single agent that plays a simplified Master + Slaver. **Same protocol, different surface.** |
| How do tools share state? | Every adapter reads and writes the same SQLite `tickets` table through `eket task:*` commands. There is no per-tool database, no per-tool schema. |
| How do tools share events? | The HTTP Hook Server in `node/src/hooks/http-hook-server.ts` exposes 28 lifecycle events on `/hooks/<event>`. Any adapter that can speak HTTP can participate. |
| What is the cost of adding a sixth tool? | Roughly 200 lines of adapter markdown (per `template/CLAUDE-TEMPLATE.md`) plus an HTTP client that posts to the hook server. No protocol change. No schema change. |
| What is the long-term risk if we *don't* go tool-agnostic? | Vendor lock-in compounds. If the underlying model API changes, the protocol survives; if the protocol is welded to one tool, the team re-derives the protocol every time the tool changes. |

The rest of this article maps the adapter contract, the capability matrix, the cross-tool event bridge, the worked workflow, and the new-tool onboarding checklist.

---

## 1. Motivation — the LLM is an implementation detail

In 2024 the question was "can a model do this task?" In 2026 the question is "can **any one of N models**, supervised by a small human command staff, do this task *without us re-engineering the protocol every time the vendor ships a breaking change*?"

Three things forced the question open:

1. **Model churn.** Between January 2025 and June 2026, every major LLM tool shipped at least two breaking CLI changes, one auth-rotation incident, and one deprecation of an agent framework. Teams that had welded their workflow to a single tool re-derived the integration each time. Teams that had treated the tool as an adapter of a stable protocol re-pointed the adapter and moved on.
2. **Specialization.** Different models are better at different things. Cursor's IDE integration makes it strong at surgical edits with high in-file context. Codex's CLI is strong at scaffolding boilerplate from a spec. Claude Code's Skills + Subagents make it strong at multi-step review and dispatch. A team that *could* mix them is leaving throughput on the table if it does not.
3. **Heterogeneous procurement.** Many engineering organizations buy seats from more than one vendor, partly for cost, partly for resilience, partly because the procurement process is faster than the model release cycle. A tool-locked protocol forces a single procurement decision; a tool-agnostic protocol lets the team pick the best tool per task.

EKET's bet, restated: **the model is the executor; the protocol decides what gets executed, by whom, in what order, with what recovery story** (`docs/articles/01-what-is-eket/en/article.md:55`). When the model layer changes, only the adapter changes.

> "If your team is bigger than one person, you don't have an agent problem — you have a coordination problem that happens to involve agents."
> — *EKET design note, 2025-08, quoted in `01-what-is-eket/en/article.md:57-58`*

The corollary this article is about: if your team is using more than one LLM tool, you don't have a *tool* problem — you have an *adapter contract* problem. EKET's answer is to make that contract explicit, minimal, and testable.

---

## 2. The thesis — one protocol, many clients

The protocol is the same shape for every tool:

```
ticket (YAML frontmatter + body)
    │
    ├──> task:claim  (atomic CAS on SQLite)
    ├──> <implement>
    ├──> task:complete  (Saga 5-step)
    ├──> gate:review  (PR + narrative)
    └──> merge  (feature → testing → main → miao)
```

Five things in this contract are not negotiable, and they are independent of which LLM executes them:

1. **Tickets live in `jira/tickets/`.** The ticket is the unit of work. The state machine is `INBOX → READY → IN_PROGRESS → IN_REVIEW → DONE` (`docs/articles/01-what-is-eket/en/article.md:88-115`).
2. **`task:claim` is a Compare-And-Swap on the SQLite `tickets` table.** Defined in `rust/crates/eket-core/src/ticket.rs` and exposed via `eket task:claim TASK-NNN`. Two agents calling it on the same ticket: one wins, one gets a clear "already claimed" error (`docs/articles/GLOSSARY.md:13`).
3. **The Saga is five atomic steps.** Validate → test → checkpoint → commit → notify (`docs/articles/GLOSSARY.md:12`). Each step writes an artifact. Crashes are recoverable via `task:resume`.
4. **Branches are `feature/<id>-<slug>` and commits follow Conventional Commits.** Enforced by `template/CLAUDE-TEMPLATE.md:218-230` and reproduced in every per-tool adapter file.
5. **Review produces a PR with a narrative.** The ticket plan and acceptance criteria are the narrative's source of truth (`docs/articles/02-why-you-need-eket/en/article.md:111`).

What changes between adapters is **how** an agent reads the ticket, runs the loop, and writes the PR — not **what** the protocol operations are.

---

## 3. Adapter matrix — Claude Code / Cursor / Codex / Copilot / Gemini

The matrix below is the *honest* one. It is not a leaderboard. Full support means the tool's native primitives (Skills, Subagents, Hooks) cover all five EKET capabilities; degraded means the tool runs in single-agent mode and one executor plays a simplified Master + Slaver role; both modes participate in the same SQLite state.

| Capability | Claude Code | Cursor | Codex CLI | Copilot CLI | Gemini / AGENTS.md |
|---|---|---|---|---|---|
| Identity on startup (`.eket/IDENTITY.md`) | ✅ | ✅ | ✅ | ✅ | ✅ |
| Ticket YAML frontmatter read/write | ✅ | ✅ | ✅ | ✅ | ✅ |
| `task:claim` via `eket` CLI | ✅ (Subagent) | ✅ (bash block) | ✅ (bash) | ✅ (bash) | ✅ (bash) |
| `task:complete` Saga 5-step | ✅ (full Saga) | ✅ (full Saga) | ⚠️ (manual 5 steps) | ⚠️ (manual 5 steps) | ⚠️ (manual 5 steps) |
| Skills (`.claude/skills/eket/`) | ✅ | ❌ (read `AGENTS.md` bootstrap + `docs/agents/AGENTS.md` on demand) | ❌ (same as Cursor) | ❌ (same as Cursor) | ❌ (same as Cursor) |
| Subagent dispatch (multi-agent in one process) | ✅ | ❌ | ❌ | ❌ | ❌ |
| Hook events to HTTP server | ✅ (native) | ⚠️ (via shell shim) | ⚠️ (via shell shim) | ❌ (out-of-band) | ❌ (out-of-band) |
| Multi-instance same backlog (CAS-safe) | ✅ | ✅ | ✅ | ✅ | ✅ |
| Single-agent mode (one session = Master + Slaver) | n/a (full) | n/a (full) | ✅ | ✅ | ✅ |
| Adapter file | `CLAUDE.md` (Claude-Code-specific) | `CURSOR.md` (Cursor-specific) | `CODEX.md` (Codex-specific) | `COPILOT.md` (Copilot-specific) | `AGENTS.md` (root bootstrap) → `docs/agents/AGENTS.md` (full guide, on demand) |

**How to read this:** Full adapters (Claude Code, Cursor) get the *entire* protocol surface — Skills, Subagents, and Hooks — out of the box. Degraded adapters (Codex, Copilot, AGENTS.md / Gemini) cover the same **protocol** but not the same **surface**: they run one agent at a time, follow the same ticket flow, and write to the same SQLite, but they cannot dispatch subagents to themselves and must register hook events by shelling out to `curl` rather than via a native hook subsystem.

This is the right place to be honest about strengths and limits:

- **Claude Code** is the only adapter with a *native* hook subsystem that fires before/after every tool call, plus a built-in Subagent dispatch mechanism. The hook server is essentially a wrapper around its native event surface (`node/src/hooks/http-hook-server.ts:1-22`).
- **Cursor** is excellent at in-file refactors and at working in a `.cursorrules` + `CURSOR.md` pair, but it has no Skills system, so all behavior is markdown-driven. Its adapter file is correspondingly short — 32 lines — because most of the work is delegated to the EKET CLI (`CURSOR.md:1-32`).
- **Codex CLI** has no Hooks, no Subagents, no Slash Commands (`CODEX.md:82-88`); its strength is code generation from a tight spec, and its adapter is built around a "find a `status: ready` ticket, edit the file, commit, push" loop (`CODEX.md:50-65`).
- **Copilot CLI** has the same limitations as Codex and ships with the same single-agent mode (`COPILOT.md:17-28`); its adapter is a strict subset of the Codex one.
- **AGENTS.md** is the universal fallback for any LLM tool that can read a markdown file (Gemini, Aider, custom agents). It is intentionally generic — no vendor-specific extensions, no skills, no hooks. The root `AGENTS.md` is a slim ~95-line bootstrap; the full ~668-line universal guide lives at `docs/agents/AGENTS.md` and is loaded on demand (see `AGENTS.md` §2 "On-demand loading").

None of these gaps are tool-shaming. They are descriptions of what each tool's native primitives can do, and the adapter file is the *bridge* that lets each one speak EKET.

---

## 4. Per-tool capabilities and limits

### 4.1 Claude Code — full support

- **Adapter file**: `CLAUDE.md:1-84` (84 lines).
- **Strengths**: Skills (`.claude/skills/eket/SKILL.md`), Subagents, native Hooks. The Skills system is the *only* one of the five that can call `/eket-start`, `/eket-claim`, `/eket-submit-pr` as named commands (see `template/CLAUDE-TEMPLATE.md:113-124` for the full set).
- **Limits**: The hook subsystem is the most expressive of the five, but it is also the most fragile: a misconfigured `settings.json` silences every hook, and the failure mode is "nothing happens" rather than "an error fires." Pair the hook server with `system:doctor` for early warning.
- **Best fit**: the *Master* role, the *reviewer* role, and any multi-agent workflow where one Claude Code instance dispatches Subagents (`docs/articles/01-what-is-eket/en/article.md:144`).

### 4.2 Cursor — full support, IDE-anchored

- **Adapter file**: `CURSOR.md:1-32` (32 lines, intentionally minimal).
- **Strengths**: surgical, file-local edits; rich in-IDE context; the `CURSOR.md` + `.cursorrules` pair is the leanest of the five. Cursor reads `CURSOR.md` for project-specific rules and falls back to `.cursorrules` for cursor-wide behavior.
- **Limits**: no Skills, no Subagents, no native Hook subsystem. Cursor can still post to the hook server via a bash shim (e.g. an `on-save` rule in `.cursorrules` that calls `curl` to `localhost:9877/hooks/file-changed`).
- **Best fit**: ticket-typed, file-anchored work — "fix this lint," "extract this function," "rewrite this component." Cursor's "Think Before Coding / Simplicity First / Surgical Changes / Goal-Driven" rules (`CURSOR.md:18-23`) line up with the Slaver's "implement + test" loop almost by accident.

### 4.3 Codex CLI — degraded, single-agent

- **Adapter file**: `CODEX.md:1-104` (104 lines).
- **Strengths**: code generation from a tight spec; fast scaffolding; strong at "given this ticket, produce a PR." The adapter is built around a strict "Slaver" pattern (`CODEX.md:15-25`).
- **Limits (explicit table at `CODEX.md:82-88`)**: ❌ Skills, ❌ Subagent, ❌ Slash Commands, ❌ Hooks, ❌ auto task dispatch. Every protocol operation is a manual bash invocation. Multi-instance coordination is via the ticket's `assigned_to` field plus branch isolation (`CODEX.md:92-97`).
- **Best fit**: bulk implementation work — "build the 12 endpoints in this OpenAPI spec," "scaffold the test suite for this module." Codex's degradation is honest, not punitive: the protocol works the same; the agent's hands are just more tied.

### 4.4 Copilot CLI — degraded, single-agent, strict subset of Codex

- **Adapter file**: `COPILOT.md:1-80` (80 lines).
- **Strengths**: same as Codex (code generation from a spec). The adapter is a strict subset — it explicitly recommends a single-agent mode where one Copilot session plays a simplified Master + Slaver (`COPILOT.md:17-28`).
- **Limits (explicit table at `COPILOT.md:56-62`)**: same five ❌ as Codex. Hooks in particular have **no replacement** in the Copilot adapter — the table literally reads "无替代，依赖人工检查" (`COPILOT.md:62`).
- **Best fit**: environments where Copilot is the only available tool. The adapter's emphasis on "先读后改 / 小步提交 / 分支隔离 / 测试驱动" (`COPILOT.md:48-52`) is the discipline the protocol enforces in lieu of automation.

### 4.5 Gemini / AGENTS.md — universal fallback

- **Adapter file**: root `AGENTS.md` is the ~95-line slim bootstrap auto-loaded by every tool that supports it; the full ~668-line universal guide is at `docs/agents/AGENTS.md` and is loaded on demand. Identity, structure, and Master/Slaver roles are covered in `docs/agents/AGENTS.md` §1–§5.
- **Strengths**: works with any LLM that can read a markdown file — Gemini, Aider, custom agents, future tools. The adapter is intentionally generic; the README's "其他 LLM Agent" row (`README.md:57`) maps to this entry.
- **Limits**: no native extensions of any kind. Every protocol operation is a markdown instruction that the agent has to read and execute. The Master role section (`docs/agents/AGENTS.md` §4 "Master Role") explicitly forbids the Master role from writing code — a rule that is enforced by markdown trust, not by tooling.
- **Best fit**: the *long tail*. When the next LLM tool ships, its adapter is `AGENTS.md` (bootstrap) plus a thin shim file, and the protocol survives.

### 4.6 Honest gap

`.cursorrules` is referenced in the README's adapter row (`README.md:53`) but does not exist as a separate file in the repository root at the time of writing. Cursor's adapter is `CURSOR.md` alone (32 lines). The hook-server integration for Cursor is therefore routed through a shim, not through a native `.cursorrules` "on-save" rule. This is noted here so that a future patch to add `.cursorrules` is on the record.

---

## 5. Cross-tool workflows — worked example

A real workflow that uses **three different tools in one ticket's lifetime**. The names are the actual adapters; the steps are real protocol operations.

**Scenario.** The team needs to add an OpenTelemetry span around the `eket task:claim` hot path. The ticket is `TASK-642`. Three executors, three tools, one ticket.

**Step 1 — Cursor (implementer).** A Cursor session reads `jira/tickets/TASK-642.md`, sees the acceptance criteria, and checks out `feature/TASK-642-otel-claim-span`. Cursor's `CURSOR.md:18-23` rules push it toward "surgical changes" and "goal-driven" — the right shape for a 30-line patch. Cursor edits `rust/crates/eket-core/src/ticket.rs`, adds the span, runs `cargo test --release` inside the IDE, commits with `feat(TASK-642): wrap claim path in otel span`. The commit lands on the feature branch. No PR yet.

**Step 2 — Codex (test writer).** A separate Codex CLI instance, on a different `feature/TASK-642-otel-tests` branch, reads the same `TASK-642.md` ticket and the diff from step 1 (Codex is good at "given a spec, produce tests"). It writes `rust/crates/eket-core/tests/otel_claim.rs`, runs `cargo test otel_claim --release`, and pushes. Codex's `CODEX.md:50-65` "find ready, edit, commit, push" loop runs verbatim. The push hits `testing`, which runs the full test matrix and discovers a span-id collision — a *useful* failure, not a tooling failure.

**Step 3 — Claude Code (reviewer).** A Claude Code session, on `main`, opens the PR for `TASK-642`. The PR description is auto-populated from the ticket's `## Acceptance Criteria` section (the protocol requires plan + AC *before* claim, per `docs/articles/02-why-you-need-eket/en/article.md:111`). Claude Code's Skills system calls `gate:review`, which:

1. Re-runs `cargo test` against the merge commit.
2. Reads the PR diff and the ticket's AC.
3. Produces a structured review ("approve with comments: rename `span_id` to avoid the collision, see line 47").
4. Posts the review back to the ticket.

**Step 4 — Cursor (reviser).** A second Cursor session reads the review, applies the rename, runs tests again, pushes an amended commit. The feature branch is now clean.

**Step 5 — Master (any tool, any human).** A human — or an AI Master running on any of the five adapters — runs `eket task:complete TASK-642`. The Saga 5-step (`docs/articles/GLOSSARY.md:12`) writes five artifacts in one transaction: the test report, the checkpoint, the merge commit, the Slack/email notification, and the audit log. The ticket transitions `IN_REVIEW → DONE`. The branch is promoted `feature → testing → main → miao` per `scripts/sync-branches.sh` (referenced in `docs/articles/01-what-is-eket/en/article.md:110`).

**What the audit trail looks like.**

```
TASK-642
├── claim       : cursor-agent-1    @ 2026-06-04T10:01:12Z
├── implement   : cursor-agent-1    (commit a1b2c3d, 30 LOC)
├── test-write  : codex-agent-1     (commit e4f5g6h, 80 LOC)
├── review      : claude-code-M1    (approve+comments)
├── revise      : cursor-agent-1    (commit i7j8k9l)
├── complete    : saga-5step        @ 2026-06-04T10:42:55Z
└── merge       : feature→testing→main→miao
```

Three different tools touched four different steps. The audit trail is a single per-ticket log. No adapter had to know which other adapter was on the other step. The SQLite `tickets` table did not change; the CLI did not change; the protocol did not change.

This is the cross-tool story in one paragraph: **the contract is the SQLite row and the PR description; the tools are interchangeable readers and writers of that contract.**

---

## 6. The hook server (`node/src/hooks/`) — cross-tool event bridge

The hook server is the cross-tool event bridge. It is a single Node.js HTTP server that exposes 28 lifecycle events on uniform endpoints. Its job is to make it possible for *any* adapter — Claude Code's native hook subsystem, Cursor's shell shim, Codex's bash-on-save, or a cron in a CI pipeline — to participate in protocol-level event handling.

### 6.1 Surface area

The server exposes one endpoint per event. The headline endpoints (`node/src/hooks/http-hook-server.ts:14-19`):

```
POST /hooks/pre-tool-use
POST /hooks/post-tool-use
POST /hooks/teammate-idle
POST /hooks/task-completed
POST /hooks/permission-request
GET  /health
```

The complete event taxonomy has 28 entries (`node/src/hooks/http-hook-server.ts:144-171`):

```
PreToolUse, PostToolUse, PostToolUseFailure, Notification, UserPromptSubmit,
SessionStart, SessionEnd, Stop, StopFailure,
SubagentStart, SubagentStop,
PreCompact, PostCompact,
PermissionRequest, PermissionDenied,
Setup, TeammateIdle, TaskCreated, TaskCompleted,
Elicitation, ElicitationResult,
ConfigChange, WorktreeCreate, WorktreeRemove,
InstructionsLoaded, CwdChanged, FileChanged
```

### 6.2 What the server actually does

For each incoming POST, the server (`node/src/hooks/http-hook-server.ts:889-913`):

1. Resolves the event name from the URL path.
2. Looks up the registered handlers.
3. Routes the payload through a *pipeline* — the pipeline machinery lives in `node/src/hooks/pipelines/` and is composed by `dispatcher.ts:213-225` and `pre-bash-dispatcher.ts:14-23`. Each pipeline is a chain of *checks* (security, quality, performance, audit) that can `pass`, `fail`, `modify` the input, or inject `feedback` into the LLM context.
4. Returns a JSON response that the calling tool can act on (e.g. deny a `PreToolUse` request, mark a `TaskCompleted` event as accepted, or steer a `TeammateIdle` agent to claim a new ticket).

A `TeammateIdle` handler can call `assignTask(agentName)` (`node/src/hooks/http-hook-server.ts:1123-1136`) to give a newly-idle agent its next ticket. A `PreToolUse` handler can call `checkPermission(toolName, toolInput)` (`node/src/hooks/http-hook-server.ts:1161-1167`) to block a destructive command before it runs. The dispatcher architecture is in `dispatcher.ts:213-395`; the bash-specific pre-checks (path traversal, dangerous command, sensitive path, command injection, resource limits) are in `pre-bash-dispatcher.ts:7-13`.

### 6.3 Why it is the cross-tool bridge

- **Claude Code** fires native hooks; the server consumes them directly.
- **Cursor** posts via a `.cursorrules`-driven shell shim (or, once `.cursorrules` is added, via the rule's `on-save` callback).
- **Codex / Copilot** post via a `git commit` post-hook script.
- **Gemini / AGENTS.md** posts via a scheduled `curl` against `localhost:9877/hooks/file-changed` driven by `inotify` or a cron.

All four write to the *same* server, on the *same* port, with the *same* event names. The server does not care which tool fired the event. This is what "cross-tool event bridge" means in EKET: not a special protocol per tool, but one HTTP server and a markdown contract.

### 6.4 The dispatcher pattern

`dispatcher.ts` is a small, well-typed registry (see `dispatcher.ts:120-200` for `CheckRegistry` and `dispatcher.ts:213-425` for `HookDispatcher`). The `Check` interface (`dispatcher.ts:61-74`) is the **adapter contract for checks** — the same shape regardless of which tool's event triggered the check. This is the part of the codebase that a new tool author should study before writing a custom check; the `register` / `loadFromRegistry` / `dispatch` triad is small enough to read in one sitting.

---

## 7. Adding a new tool — what an adapter must implement

The adapter contract is intentionally small. The following five requirements are testable; a new tool that satisfies them can participate in the protocol end-to-end.

### Requirement 1 — Identity file (`.eket/IDENTITY.md`)

The adapter must read `.eket/IDENTITY.md` on every startup and refuse to act if the file is missing or unreadable. The identity file declares role (Master / Slaver), agent id, and a list of forbidden actions. This is required by `template/CLAUDE-TEMPLATE.md` §"身份确认" and reproduced, in the universal agent guide, at `docs/agents/AGENTS.md` §2 "First Thing: Read Your Identity".

**Testability**: launch the adapter without `.eket/IDENTITY.md`; the adapter must exit with a clear error before reading any ticket.

### Requirement 2 — Ticket YAML frontmatter

The adapter must read tickets in the format declared at `CODEX.md:30-48` and used by every shipped adapter:

```yaml
---
id: TASK-NNN
title: <string>
status: ready | in_progress | review | done
assigned_to: <agent-id>
priority: P0 | P1 | P2 | P3
---
```

The adapter must update `status` and `assigned_to` as it works the ticket. The atomicity guarantee on `status: in_progress` is provided by the EKET CLI (`eket task:claim`), not by the adapter; the adapter's job is to call the CLI, not to roll its own.

**Testability**: open a ticket in `jira/tickets/`, run the adapter, observe that the adapter moves the ticket through `READY → IN_PROGRESS → IN_REVIEW` via the CLI, not by direct file edits.

### Requirement 3 — Branch naming and Conventional Commits

The adapter must (a) create a branch named `feature/<task-id>-<slug>`, (b) commit with a Conventional Commits message of the form `<type>(<scope>): <description>`, and (c) push the branch and open a PR whose description references the ticket id. This is specified at `template/CLAUDE-TEMPLATE.md:218-230` and reproduced at `CLAUDE.md:30-32` and `CODEX.md:60-65`.

**Testability**: claim a ticket, run the adapter, verify the branch name matches the pattern and the commit message passes `commitlint` (or the project's equivalent). The `template/CLAUDE-TEMPLATE.md:217-230` table is the source of truth for the type / scope / description grammar.

### Requirement 4 — Hook events to the HTTP server

The adapter must emit hook events to the cross-tool event bridge for at least the four "load-bearing" events: `PreToolUse`, `PostToolUse`, `TaskCreated`, `TaskCompleted`. The endpoint contract is `node/src/hooks/http-hook-server.ts:14-19`. The adapter may emit more, but it must not silently skip the four.

**Testability**: run the adapter against a mocked `localhost:9877/hooks/pre-tool-use` and verify that a destructive bash command is intercepted with a `403`. The dispatcher contract (`dispatcher.ts:61-74`) is the type the adapter must satisfy.

### Requirement 5 — Status report on phase boundary

The adapter must write a status report at every phase boundary (claim complete, analysis complete, implementation complete, review requested, review responded-to). The format is at `template/CLAUDE-TEMPLATE.md:382-414` ("反馈机制") and reproduced in the template's table at `template/CLAUDE-TEMPLATE.md:418-422`. The location is `inbox/human_feedback/<phase>-<task-id>-<timestamp>.md`.

**Testability**: run the adapter, then `ls inbox/human_feedback/` and confirm a status report for each phase the adapter completed.

### What the adapter does *not* have to do

The adapter does *not* have to:

- Implement the EKET state machine. The CLI does that.
- Implement CAS. The SQLite client does that (`node/src/core/sqlite-client.ts:966-976`).
- Implement the Saga 5-step. The `task:complete` command does that.
- Implement the hook pipelines. The hook server does that.

The adapter is a *thin* client. The five requirements above describe the entire surface area a new tool must cover to be a first-class participant in the protocol.

---

## 8. Why tool-agnostic matters — vendor lock-in as a long-term risk

Vendor lock-in is the tax a team pays *every quarter* for having welded its workflow to a single vendor's API, CLI, or pricing model. The tax compounds.

Three concrete risks, drawn from 2024–2026 industry events rather than from any one vendor's roadmap:

1. **Pricing renegotiation.** Seat-based AI vendors have repriced at least once per year since 2024. A team that has built its workflow around a single vendor pays the new price; a team whose workflow is tool-agnostic can move 20% of its work to a cheaper tool within a week.
2. **Deprecation of features.** Every shipped adapter list above has at least one "✅ today, ❌ tomorrow" risk: native hook subsystems can be deprecated (and have been, more than once, in 2025). A team whose audit trail runs through the *tool's* native hooks loses the trail; a team whose audit trail runs through the *protocol's* hook server keeps it.
3. **Model deprecation.** When a model is deprecated, the tool that wraps it often follows. A tool-locked protocol means re-engineering the integration; a tool-agnostic protocol means rewriting one adapter file.

The deeper argument is structural. A *protocol* is a contract you own. A *tool* is a contract you rent. The protocol is the part that survives churn; the tool is the part that gets swapped. The five adapters shipped today are not a "compatibility matrix" — they are *evidence* that the protocol is the durable thing.

> "If your team is bigger than one person, you don't have an agent problem — you have a coordination problem that happens to involve agents."
> — *EKET design note, 2025-08, quoted in `01-what-is-eket/en/article.md:57-58`*

Restated for the multi-tool case: **if your team is using more than one LLM tool, you don't have a tool problem — you have an adapter contract problem, and the right answer is to make the contract explicit, minimal, and testable.** The five requirements in Section 7 are the explicit, minimal, testable answer.

---

## 9. References

- **Adapter files** (the contract surface for each shipped tool):
  - `CLAUDE.md:1-84` — Claude Code (full support, Skills + Subagents + Hooks)
  - `CURSOR.md:1-32` — Cursor IDE (full support, IDE-anchored, no Skills/Subagents)
  - `CODEX.md:1-104` — Codex CLI (degraded, single-agent, Slaver pattern)
  - `COPILOT.md:1-80` — Copilot CLI (degraded, single-agent, strict subset of Codex)
  - `AGENTS.md` (root bootstrap) + `docs/agents/AGENTS.md` (full guide, on-demand) — universal fallback (Gemini, Aider, future tools)
- **Template** (the contract every adapter is a specialization of):
  - `template/CLAUDE-TEMPLATE.md:30-38` — identity confirmation
  - `template/CLAUDE-TEMPLATE.md:82-94` — core workflow
  - `template/CLAUDE-TEMPLATE.md:113-124` — commands
  - `template/CLAUDE-TEMPLATE.md:218-230` — branch + Conventional Commits
  - `template/CLAUDE-TEMPLATE.md:233-250` — ticket numbering
  - `template/CLAUDE-TEMPLATE.md:382-414` — status report / feedback mechanism
- **Hook server** (the cross-tool event bridge):
  - `node/src/hooks/http-hook-server.ts:1-22` — purpose and endpoints
  - `node/src/hooks/http-hook-server.ts:14-19` — endpoint surface
  - `node/src/hooks/http-hook-server.ts:144-171` — 28 hook event types
  - `node/src/hooks/http-hook-server.ts:1119-1136` — `TeammateIdle` task assignment
  - `node/src/hooks/http-hook-server.ts:1157-1167` — `PreToolUse` permission check
  - `node/src/hooks/dispatcher.ts:61-74` — `Check` interface (the adapter contract for checks)
  - `node/src/hooks/dispatcher.ts:120-200` — `CheckRegistry`
  - `node/src/hooks/dispatcher.ts:213-425` — `HookDispatcher`
  - `node/src/hooks/pre-bash-dispatcher.ts:7-13` — bash pre-checks (path traversal, dangerous command, sensitive path, command injection, resource limits)
- **Protocol machinery** (the parts that do not change between adapters):
  - `node/src/core/sqlite-client.ts:966-976` — CAS primitive
  - `rust/crates/eket-core/src/ticket.rs` — Rust mirror of the ticket state machine
  - `scripts/sync-branches.sh` — `feature → testing → main → miao` promotion
  - `docs/articles/GLOSSARY.md:12-13` — Saga 5-step + CAS definitions
- **Related articles in the series**:
  - `docs/articles/01-what-is-eket/en/article.md:1` — the thesis
  - `docs/articles/02-why-you-need-eket/en/article.md:1` — pain × solution × ROI
  - `docs/articles/06-master-slaver-protocol/en/article.md:1` — Master-Slaver protocol
  - `docs/articles/GLOSSARY.md:1-43` — shared terminology
- **Tickets**:
  - `jira/tickets/EPIC-008/TASK-648.md` — this article's ticket
  - `jira/tickets/EPIC-008/INDEX.md` — series index (Master updates production tracking)
- **Open follow-ups** (Master to triage):
  - Add `.cursorrules` to the repo root so Cursor's adapter has the same shape as the others.
  - Decide whether `COPILOT.md`'s "no replacement for Hooks" line (`COPILOT.md:62`) should be updated to recommend a `git commit` post-hook shim, the same pattern as Codex.
  - Confirm whether the next article in the series (13-adr-and-roadmap) will publish the per-adapter latency budget (L0 / L1 / L2 / L3 per `docs/articles/01-what-is-eket/en/article.md:131-140`).
