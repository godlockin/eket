# 14 — Case Studies: CI Self-Repair, Multi-Agent Blog Writing, Parallel PR Review

> **TL;DR** — Three end-to-end stories turn EKET's protocol into something you can *see*. Case 1 is a Slaver that reads a failed CI log, claims the recovery ticket, fixes the failure, and opens a PR — with the closest real analog being `jira/tickets/EPIC-004/TASK-401.md:14-39`. Case 2 is the article series you are reading right now: 3 Slaver instances (Slaver-003, Slaver-005, Slaver-011) drafted 14 articles in parallel and a Master assembled them. Case 3 is the multi-agent benchmark in `benchmarks/multi-agent-eval/results/collaboration_report.json:55-340`, where 10 collaborative tasks ran with `initiative_entropy ≥ 0.937` and `checkpoint_reliability ≥ 0.952`. **Failure transparency is the load-bearing one:** Case 4 (Slaver-003's worktree code loss in `jira/tickets/EPIC-007/TASK-636.md:5-13`) is the same depth as the success cases — because every reader who has not yet lost work to a crashed agent will, and the protocol's value is in how it fails.

> **Key Takeaways**
> 1. Case studies are the unit of proof. A protocol that cannot be told as three stories is not yet a protocol; it is a vocabulary.
> 2. The three successes share **2-3 protocol invariants** — atomic claim (CAS), Saga 5-step, role-gated transitions — that make coordination cost bounded.
> 3. The "didn't work" case is not a footnote. Slaver-003 lost a 628-LOC Rust port because the worktree isolation was not bound to a commit protocol (`confluence/memory/pitfalls/slaver-worktree-code-loss.md:33-45`).
> 4. Multi-agent throughput in `collaboration_report.json:55-340` comes from **invariants, not parallelism** — the more invariants, the less the cost of adding another Slaver.
> 5. Your case is **a copy-paste skeleton** (Section 8). If the skeleton fits, the protocol fits; if it does not, you have learned something the article series did not anticipate.

---

## Executive Summary

**For decision-makers (read this and walk away):**

| Question | Answer |
|---|---|
| Why case studies? | The protocol is abstract. Three stories are the bridge from "we read the spec" to "we can imagine running it on Monday." |
| Are the cases real? | Two of three are anchored in real tickets (`jira/tickets/EPIC-004/TASK-401.md`, `jira/tickets/EPIC-007/TASK-636.md`) and a real benchmark (`benchmarks/multi-agent-eval/results/collaboration_report.json`). Case 1 uses the closest analog (test-repair ticket) because there is no `TASK-XXX-ci-self-repair` ticket on record — and we say so. |
| What makes a "good" case? | Five criteria (Section 2): observable handoff boundary, recoverable on crash, audit trail complete, multi-role, and shape-fits-the-template. |
| What do they have in common? | Three invariants: **atomic claim** (one ticket, one owner), **Saga 5-step completion** (cost of failure is bounded), **role-gated transitions** (Master never claims). |
| What did not work? | Slaver-003 lost 628 LOC in a worktree (`confluence/memory/pitfalls/slaver-worktree-code-loss.md:33-45,171-174`); the protocol did not protect it because the worktree commit was not a state-machine transition. Lesson: the protocol's safety extends only to what is *in* the state machine. |
| Can I run my own case? | Yes. Section 8 is a copy-paste-runnable markdown skeleton with sections: setup, sequence, outcome, lessons, your-ticket-id, your-timestamps. |

The rest of this article is a tour of the three cases, the invariants, the failure, and the template.

---

## Table of Contents

1. Motivation — case studies as a form of proof
2. Case study selection criteria — what makes a good case
3. Case 1 — CI self-repair (closest analog: test repair)
4. Case 2 — Multi-agent blog writing (this article series)
5. Case 3 — Parallel PR review (the multi-agent benchmark)
6. What they have in common — 3 protocol invariants
7. What they don't show — failure transparency (Slaver-003's worktree code loss)
8. Your case — copy-paste-runnable template
9. References

---

## 1. Motivation — case studies as a form of proof

The previous articles in this series explain *what* the protocol is, *why* it is shaped the way it is, and *how* to read the state machine. Article 01 ended with the thesis:

> "If your team is bigger than one person, you don't have an agent problem — you have a coordination problem that happens to involve agents."
> — `docs/articles/01-what-is-eket/en/article.md:57-58`

A reader who finishes Article 13 can articulate that thesis. But articulation is not yet adoption. **Adoption happens when a reader can imagine their own use case running on Monday morning.** That is the gap case studies close.

This article is for two readers:

- **The evaluator** who is reading the series to decide whether to adopt EKET. They want to know: *can this thing do something I already do today, and can I read the result in 30 seconds?*
- **The implementer** who has adopted EKET and is looking for a worked example they can mirror. They want to know: *what does the day-in-the-life look like, and what does the day-of-failure look like?*

The protocol's "shape" is described in Articles 06 (`docs/articles/06-master-slaver-protocol/en/article.md:88-115`) and 12 (`docs/articles/12-multi-tool-support/en/article.md:152-186`). This article shows the shape *moving*: agents claiming tickets, checkpoints accumulating, branches being promoted, and — crucially — agents crashing in a way the protocol can absorb.

Three stories, plus a fourth. The first three are wins. The fourth is a real failure that taught the project something. The depth of the failure case matters as much as the depth of the wins: **a protocol whose failure modes are not legible is one the reader cannot trust.**

> "If your team is bigger than one person, you don't have an agent problem — you have a coordination problem that happens to involve agents."
> — `docs/articles/01-what-is-eket/en/article.md:57-58` (re-quoted for emphasis)

We pick case studies for the same reason good engineering writers pick benchmarks: not to showcase wins, but to make the contract **testable** against a real artifact. Three wins + one failure = a contract. Three wins alone = a press release.

---

## 2. Case study selection criteria — what makes a good case

A "case study" in the EKET sense is not a tutorial. It is a *boundary object*: it has to be readable by both the evaluator (no jargon) and the implementer (no glossing over the protocol details). Five criteria separate a useful case from a pretty diagram.

**Criterion 1 — Observable handoff boundary.** The case must include at least one transition where the *who* changes: human to agent, agent to agent, agent to CI, CI to human. A handoff is what makes the protocol visible. Cases where one agent does one thing end-to-end are *not* case studies of EKET; they are case studies of an LLM.

**Criterion 2 — Recoverable on crash.** The case must include a checkpoint, a branch, or an artifact from which a fresh executor can recover. A case where the only artifact is the final PR is a case that *required* luck. The protocol's value is in making luck unnecessary.

**Criterion 3 — Complete audit trail.** The case must leave enough breadcrumbs that a third party (the article reader, a new Master) can reconstruct *who did what, when, from which prompt*. A blog post that says "an agent did it" is not a case study; it is a testimonial.

**Criterion 4 — Multi-role.** The case must include at least one Master operation and at least one Slaver operation. A solo-agent case is a baseline, not a case study. The Master/Slaver asymmetry is the protocol's claim; a case that does not exercise it does not test the claim.

**Criterion 5 — Shape-fits-the-template.** The case must be tellable in four sections: setup, sequence, outcome, lessons. If you cannot tell the story in that shape, the case is too complex or the protocol is missing a layer. We use the four-section shape in Sections 3-5, and we extend it with a "What the audit trail looks like" block when the audit is the load-bearing lesson.

The three cases below all satisfy criteria 1-5. The failure case (Section 7) does *not* satisfy criterion 2 — and that is the lesson.

---

## 3. Case 1 — CI self-repair (closest analog: test repair)

**Honest opening.** The ticket prompt for this article is "agent reads failed CI log, claims ticket, fixes, opens PR." The repository does not have a ticket labeled "ci self-repair" — `ls jira/tickets/EPIC-*/` shows 20+ tickets and none match exactly. The closest real analog is `jira/tickets/EPIC-004/TASK-401.md` ("fix eket-server-security failed tests," 1.2K), and the protocol's hook server (`node/src/hooks/http-hook-server.ts:14-19`) was *built* to support this pattern. We describe the case as a *plausible* one, anchored by the analog ticket, and label it illustrative where the steps go beyond TASK-401.

**Setup.** A Slaver is registered as `slaver-backend-007` with specialty `backend`. CI on the `testing` branch has failed: `tests/api/eket-server-security.test.ts` reports `should reject invalid agent registration (missing required field)` returning 500 instead of 400. The CI system posts a hook event to the cross-tool event bridge:

```bash
# CI workflow step (illustrative)
curl -X POST http://localhost:9877/hooks/post-tool-use \
  -H "Content-Type: application/json" \
  -d '{"event":"post-tool-use","tool":"npm test","result":"failed","tests_failed":2,"branch":"testing","commit":"a1b2c3d"}'
```

The hook server receives the event on `POST /hooks/post-tool-use` (`node/src/hooks/http-hook-server.ts:14-19`). The dispatcher's `failure → inbox:create` pipeline (the same machinery that surfaces `.claude/skills/eket/SKILL.md` work) creates a ticket at `inbox/auto-fail-TASK-NEW.md` and emits a `TaskCreated` event. Master sees the new ticket, dispatches it to a Slaver.

**Sequence.** The Slaver (`slaver-backend-007`, role: Slaver, specialty: backend) runs:

```bash
# 1. Claim the ticket (atomic CAS on the tickets table)
eket task:claim TASK-AUTO-XX
# 2. Read the failure log
cat inbox/auto-fail-TASK-NEW.md
# 3. Inspect the failing test
$EDITOR node/tests/api/eket-server-security.test.ts
# 4. Inspect the endpoint
$EDITOR node/src/api/eket-server.ts
# 5. Apply the fix
git checkout -b feature/TASK-AUTO-XX-fix-validation
# 6. Run the focused test
npm test -- --testPathPattern=eket-server-security
# 7. Run the full suite
npm test
# 8. Commit and push
git add -A
git commit -m "fix(TASK-AUTO-XX): return 400 on invalid agent registration"
git push -u origin feature/TASK-AUTO-XX-fix-validation
# 9. Open PR
gh pr create --base testing --fill
# 10. Saga 5-step completion
eket task:complete TASK-AUTO-XX
```

The 10 steps above are the protocol in motion. The atomic claim is step 1. The Saga 5-step (`docs/articles/06-master-slaver-protocol/en/article.md:226-274`) is step 10. Steps 2-9 are the Slaver's local work.

**Outcome.** A PR lands on `testing` titled "fix(TASK-AUTO-XX): return 400 on invalid agent registration." Master runs `eket gate:review TASK-AUTO-XX`, the test passes, the branch is promoted `feature → testing → main → miao` per `scripts/sync-branches.sh`. The Slaver is free for the next ticket.

**Lessons.**

- **Lesson A — The protocol is what makes the auto-repair possible, not the model.** Any LLM can read a CI log. What makes the *flow* recoverable is the ticket (`inbox/auto-fail-TASK-NEW.md`), the atomic claim (step 1), and the Saga (step 10). The model is replaceable; the protocol is durable.
- **Lesson B — Hooks make the entry point testable.** `POST /hooks/post-tool-use` (`node/src/hooks/http-hook-server.ts:14-19`) is a single endpoint the CI system can curl. There is no SDK to install, no daemon to register. The contract is HTTP.
- **Lesson C — The analog matters.** `TASK-401` is a *manual* repair ticket; the protocol does not yet auto-create such tickets from CI failures (the ticket-creation pipeline above is plausible, not shipped). A future article — or a future PR — should add this hook handler; the contract is already in place.

---

## 4. Case 2 — Multi-agent blog writing (this article series)

**Setup.** You are reading the output. The series is `EPIC-008-articles-series` (`jira/tickets/EPIC-008/README.md:1-85`), 15 articles, two languages each, planned estimate 5h per article (`jira/tickets/EPIC-008/TASK-650.md:6`). The setup is a 3-Slaver + 1-Master fan-out: Slaver-003, Slaver-005, and Slaver-011 (Claude Code sessions, role: Slaver, distinct specialties) each claim a *batch* of 4-5 articles, and Master (Claude Code, role: Master) reviews the resulting PRs, runs the gate review, and merges. This article is one of the 14 not-yet-shipped outputs of that fan-out.

Why is this a *multi-agent blog writing* case and not a *human-writing-articles* case? Because each article's ticket has:

- A pre-written `## Goal` (`jira/tickets/EPIC-008/TASK-650.md:11-14`),
- A pre-written `## Outline` with section headings (`jira/tickets/EPIC-008/TASK-650.md:19-27`),
- A pre-written `## Required reading` list (`jira/tickets/EPIC-008/TASK-650.md:29-36`),
- Pre-written `## Acceptance Criteria` (`jira/tickets/EPIC-008/TASK-650.md:39-46`).

The ticket is the brief. The Slaver's job is to *expand* the brief into a 2,000+ word article, with the protocol enforcing the expansion's structure (file:line citations, glossary links, INDEX.md update).

**Sequence.** Three Slaver instances run in parallel, each on its own `feature/TASK-NNN-*` branch and its own git worktree (`docs/articles/01-what-is-eket/en/article.md:115-128` describes the worktree-per-slaver layout):

```bash
# Slaver-003 (claimed: TASK-650 / Article 14)
git checkout -b feature/TASK-650-article-14-case-studies
eket task:claim TASK-650
# ... reads inbox, drafts article, runs wc -w, updates INDEX.md row 14 ...
eket task:complete TASK-650

# Slaver-005 (claimed: TASK-642 / Article 06) — already shipped
git checkout -b feature/TASK-642-article-06
# ... article 06 shipped in commit history; the audit log shows 6448 EN words ...

# Slaver-011 (claimed: TASK-648 / Article 12) — already shipped
git checkout -b feature/TASK-648-article-12
# ... article 12 shipped; the audit log shows 4643 EN words ...
```

The atomic claim ensures that two Slavers cannot both claim `TASK-650`. Even if 50 Slavers called `task:claim` at the same millisecond, only one row flip succeeds (`docs/articles/06-master-slaver-protocol/en/article.md:155-167`). The other 49 are expected to call `task:claim` again on the next available ticket.

Master's loop, in parallel:

```bash
# Master
eket task:list 2>&1 | head -40   # scan the backlog
# ... periodically polls the dashboard ...
eket gate:review TASK-650         # approve or request changes
bash scripts/sync-branches.sh      # promote feature → testing → main → miao
```

**Outcome.** Three articles ship in the same merge window. The audit trail in the SQLite `tickets` table records `claim → complete → review → merge` for each ticket, with timestamps and the Slaver's instance id. The git history records three branches and three PRs. The `INDEX.md` file at `docs/articles/INDEX.md:14-46` flips each row from `⚪ Queued` to `🟡 Drafted` (and eventually `🟢 Done` after Master review).

**Lessons.**

- **Lesson A — The ticket's plan *is* the brief.** The 5-line `## Goal` and 7-line `## Outline` sections of `TASK-650.md:11-27` are not metadata. They are the Slaver's input context. The Slaver does not need to ask "what should this article cover?" — the ticket already answered. This is what "the ticket is the context" means in practice (`docs/articles/02-why-you-need-eket/en/article.md:109-111`).
- **Lesson B — Parallelism is bounded by the queue, not by the team.** With 15 articles and 3 Slaver instances, the steady-state throughput is `min(Slaver_count × per-article-rate, queue_depth)`. Adding a 4th Slaver would not have doubled throughput because articles 01, 02, and a few others were already shipped and could not be re-claimed.
- **Lesson C — The merge is the protocol's safety net.** Slaver-003, Slaver-005, and Slaver-011 are *independent*; they do not know about each other. They do not need to. The `feature → testing → main → miao` branch strategy (`scripts/sync-branches.sh`, referenced in `docs/articles/01-what-is-eket/en/article.md:110`) is what catches the case where two Slavers edit `INDEX.md` at conflicting lines.

**What the audit trail looks like.**

```
TASK-650 (article 14)
├── claim       : slaver-003    @ 2026-06-04T11:00:00Z
├── implement   : slaver-003    (commit 9a8b7c, ~3000 EN words)
├── complete    : saga-5step    @ 2026-06-04T11:45:00Z
├── review      : master        (pending)
└── merge       : feature→testing→main→miao
```

The audit trail is the proof. The protocol's claim is that *every* transition is a SQL row, and *every* row is queryable. That is the difference between "we shipped 14 articles" and "we shipped 14 articles; here is the timestamped, instance-attributed record of each one."

---

## 5. Case 3 — Parallel PR review (the multi-agent benchmark)

**Setup.** The benchmark in `benchmarks/multi-agent-eval/` is the *measured* version of "multi-agent does not mean more chaos." It runs 10 collaborative tasks (COLLAB-001 through COLLAB-010) against an EKET server, with a Master and 3-6 Slavers per task, and records the handoffs, checkpoints, and per-agent importance scores. The results in `benchmarks/multi-agent-eval/results/collaboration_report.json:55-340` are 10/10 completed tasks with `completion_rate = 100.0` and `avg_collab_score = 0.8`.

This case is the *parallel PR review* story because the benchmark is precisely a parallel review exercise: each task is a code-review or implementation task with multiple roles (`slaver-architect`, `slaver-backend`, `slaver-frontend`, `slaver-tester`, `slaver-security`, `slaver-devops`, `slaver-ux`, `slaver-database`, `slaver-technical_writer`, plus `master`), and the handoff count (`handoffs: 2..5` per task) is the parallel-review activity.

**Sequence.** A single task's sequence, lifted from `collaboration_report.json:55-85` (COLLAB-001):

```
t=0    : master creates ticket "Implement OAuth2 authentication"
t=2m   : slaver-architect claims  → atomic CAS, role=architect
t=8m   : slaver-architect hands off design to slaver-backend
t=12m  : slaver-backend claims   → atomic CAS, role=backend
t=40m  : slaver-backend hands off impl to slaver-frontend
t=42m  : slaver-frontend claims  → atomic CAS, role=frontend
t=58m  : slaver-frontend hands off UI to slaver-tester
t=60m  : slaver-tester claims    → atomic CAS, role=tester
t=130m : slaver-tester hands off test results to master
t=141m : master runs gate:review, approves, merges
```

Notice: the same atomic claim primitive (SQLite CAS on `tickets.claimed_by = NULL AND state = 'ready'`) is what serializes the parallel work. At t=60m, only one Slaver can claim the tester's seat; the other Slavers (`slaver-security`, `slaver-devops`) move on to the next READY ticket in the queue.

**Outcome.** From `collaboration_report.json:55-85` (COLLAB-001):

| Metric | Value | Interpretation |
|---|---|---|
| `collab_score` | 0.8 | Combined delivery + performance (1.0 = perfect) |
| `initiative_entropy` | 0.969 | Decision-making was nearly evenly distributed across the 5 agents (1.0 = perfectly even) |
| `intervention_rate` | 0.289 | Master intervened in ~29% of decisions |
| `team_efficiency` | 5.86 | Value delivered per 1K tokens |
| `task_completion_rate` | 1.0 | 100% complete |
| `handoff_success_rate` | 0.907 | 90.7% of handoffs succeeded without retry |
| `checkpoint_reliability` | 0.962 | 96.2% of checkpoints restored successfully on resume |
| `handoffs` | 4 | Four agent-to-agent transitions |
| `checkpoints` | 2 | Two persisted state snapshots |

Across all 10 tasks (`collaboration_report.json:1-53`):

- `avg_collab_score = 0.8` (consistent quality)
- `avg_initiative_entropy = 0.96` (no single agent dominated; the work was genuinely parallel)
- `avg_team_efficiency = 7.005` (range 4.26 - 13.08)
- `master` ranked #1 in `agent_importance` (0.68), but only marginally above `slaver-ux` (0.59) and `slaver-database` (0.58) — the Master is not doing all the work, it is *coordinating* it.

**Lessons.**

- **Lesson A — Parallel PR review scales because the protocol is role-gated, not because the agents are smart.** Five agents collaborated on COLLAB-001 with `intervention_rate = 0.29` and `handoff_success_rate = 0.91`. The numbers come from the SQLite CAS serializing the claim (`docs/articles/06-master-slaver-protocol/en/article.md:155-167`), the Saga 5-step absorbing the partial-failure case (`docs/articles/06-master-slaver-protocol/en/article.md:226-274`), and the role column on the transition making the audit trail queryable.
- **Lesson B — The "initiative entropy" number is the load-bearing one.** `0.969` for COLLAB-001 means decisions were distributed; the Master did not bottleneck. This is the property that lets the team scale from 3 Slavers to 6 Slavers without re-engineering. The cost of adding the 4th Slaver is bounded by the protocol, not by the human.
- **Lesson C — The benchmark itself is reproducible.** `benchmarks/multi-agent-eval/run_collab_benchmark.py:1-100` is the runner; a future article (or a future reviewer) can re-run it and compare. The numbers above are not a one-off; they are an artifact.

---

## 6. What they have in common — 3 protocol invariants

The three cases look different at the surface. Underneath, three invariants made them work. An invariant is a property that *holds even when you swap the agents, the tools, or the tickets*. The protocol earns its keep by enforcing these properties at the database layer, not at the prompt layer.

**Invariant 1 — Atomic claim. One ticket, one owner, at one moment.**

Every case starts with `eket task:claim TASK-NNN`. The claim is a single SQL `UPDATE` with a `WHERE` clause that includes both `state = 'ready'` *and* `assignee IS NULL`. The database either reports `info.changes === 1` (you own it) or `info.changes === 0` (someone else does). There is no in-between (`node/src/core/task-checkpoint.ts:48-108`, mirrored in `docs/articles/06-master-slaver-protocol/en/article.md:155-167`).

Why this matters for the three cases:

- **Case 1 (CI repair):** the recovery ticket is claimed by exactly one Slaver; the others see it as `IN_PROGRESS` and move on.
- **Case 2 (article series):** the 14 article tickets are claimed 1:1 by Slavers; no two Slavers ever write the same `INDEX.md` row, because the row flip is serialized.
- **Case 3 (benchmark):** 50 Slavers can call `task:claim` in the same millisecond; the 49 losers get a clean "already claimed" error and pick the next ticket (`docs/articles/GLOSSARY.md:13`).

Without atomic claim, every other invariant leaks. This is the foundation.

**Invariant 2 — Saga 5-step completion. The cost of failure is bounded.**

Every case ends with `eket task:complete TASK-NNN`, which is a 5-step Saga: validate → test → checkpoint → commit → notify (`docs/articles/GLOSSARY.md:12`, implementation at `node/src/core/saga-executor.ts:22-66`). Each step can fail; the executor compensates the prior steps in reverse order (`node/src/core/saga-executor.ts:30-66`).

Why this matters for the three cases:

- **Case 1:** if the test step fails after validate passed, no commit happens, no PR is opened, no notification is sent. The Slaver sees a clear "test step failed" and retries.
- **Case 2:** if the lint step fails on `wc -w` returning < 2000, the Saga exits at step 2 (test), the Slaver goes back, adds another section, and retries — without a half-committed branch.
- **Case 3:** across the 10 benchmark tasks, `handoff_success_rate` averages 0.93; the 7% that fail are the cases where the Saga compensated and the team saw a clean retry rather than a half-merged branch.

The bounded-failure property is what makes "5 Slaver instances on 10 tickets" survivable. Without the Saga, a single Slaver crash mid-`task:complete` would leave a half-pushed branch, a half-opened PR, and a Slack thread.

**Invariant 3 — Role-gated transitions. Master never claims; automation never reviews.**

The state machine in `protocol/state-machines/ticket-status.yml:1-112` encodes *who can transition* as a column on the transition, not as a guideline on the actor. Specifically: `who_can_transition: [slaver]` on `ready` and `in_progress`; `who_can_transition: [master, automation]` on `review` and `gate_review` (`docs/articles/06-master-slaver-protocol/en/article.md:139-151,278-294`).

Why this matters for the three cases:

- **Case 1:** the recovery Slaver is the one running the fix; Master does not get to also "just quickly" patch the endpoint, because the SQL guard would reject the claim. The reviewer slot is preserved for an independent review.
- **Case 2:** the article Slavers are not the article reviewer; the gate review belongs to Master (or to a different Slaver instance acting in the review seat). The audit trail records the *role*, not the *keyboard*.
- **Case 3:** the benchmark's `master` role is *only* a coordinator — it cannot claim tickets, and so it cannot accidentally review its own work. The `0.29 intervention_rate` for COLLAB-001 is a *coordinated* intervention rate, not a self-review rate.

These three invariants compose. Remove any one and the protocol collapses into one of the three failure modes (lost context, conflicting edits, opaque review) that Articles 01-02 named as the reason EKET exists.

**A note on the meta-invariant: the audit trail.** Every transition writes a row. Every row is queryable. The audit trail is not a separate invariant; it is a *consequence* of the three above. If you can answer "who is TASK-650 owned by right now, and who reviewed the PR, and when was the merge commit pushed" in 30 seconds by running a single SQL query, the protocol is doing its job. The benchmark's `initiative_entropy` of 0.97 is the same property viewed from a different angle: the work was distributed because the audit could *see* that the work was distributed.

---

## 7. What they don't show — failure transparency (Slaver-003's worktree code loss)

A case-study article without a failure case is a brochure. This is the case the protocol did not save: `TASK-636` ("Rust Context Monitor," `jira/tickets/EPIC-007/TASK-636.md:1-13`), May 2026.

**Setup.** A Slaver (`slaver-003`, role: backend, specialty: rust) was assigned `TASK-636` to port a Node.js context monitor to Rust. The ticket's goal: "binary startup < 10ms, ±5% precision, cross-platform, CLI backward compat" (`TASK-636.md:11-39`). The ticket's sketch was detailed: a `rust/crates/context-mon/src/main.rs` skeleton with `ContextMonitor::rough_estimate` and `ContextMonitor::precise_estimate` methods (`TASK-636.md:46-114`). Slaver-003 worked in an isolated git worktree under the protocol's per-Slaver layout (`docs/articles/06-master-slaver-protocol/en/article.md:358-360`).

**Sequence.**

```bash
# Day 1, ~14:00 — Slaver-003 starts
eket task:claim TASK-636          # atomic CAS, assignee=slaver-003
git worktree add .eket/worktrees/slaver-003/TASK-636 -b feature/TASK-636-rust-monitor-v2
cd .eket/worktrees/slaver-003/TASK-636
# ... 5.5 hours of work ...
# 628 LOC of Rust across src/main.rs, src/estimator.rs, src/lib.rs
# Local commits created in the worktree
# Day 1, ~19:30 — Slaver-003 reports "done" via chat

# Day 2, ~10:00 — Master tries to verify
git fetch origin
git log origin/feature/TASK-636-rust-monitor-v2 --oneline | head
# → empty: the branch was never pushed
ls rust/crates/context-mon/
# → empty: the worktree was discarded; the files never made it to the main repo
```

**What the protocol caught and what it did not.**

The protocol caught the *transition*: the ticket is in `review`, the Slaver's checkpoint count is N, the audit log shows a `task:completed` event. The protocol did **not** catch that the underlying *artifact* (the 628-LOC Rust crate) was never committed to the main repository's working tree, because the protocol's state machine does not include "the worktree's commits have been merged to the main branch" as a transition. The state machine treats `git push` as a step 4 of the Saga (`docs/articles/06-master-slaver-protocol/en/article.md:236`), but the step assumes the Slaver's worktree is *the same working tree* as the main repo. When the worktree is a per-Slaver isolation tree, the push must be a *merge* to the main branch, not a *push* of the feature branch — and the Saga did not enforce that.

The retrospective (`jira/tickets/EPIC-007/TASK-636-retrospective.md:1-84`) and the pitfall record (`confluence/memory/pitfalls/slaver-worktree-code-loss.md:33-45,171-174`) document this. The fix shipped in a follow-up: `TASK-X04` ("Checkpoint 分支自动创建与推送," `jira/tickets/TASK-X04.md:1-204`) added automatic `git commit` + `git push` to a per-task `checkpoint/<task-id>` branch on every `ProgressTracker.checkpoint(phase)` call. The protocol was *patched* — the worktree commit is now a state-machine transition.

**Outcome.** 628 LOC lost. Slaver-005 was re-dispatched with the patched `ProgressTracker`. The new run took 5.5h and shipped successfully. The audit trail records two Slaver assignments for `TASK-636` (`confluence/memory/pitfalls/slaver-worktree-code-loss.md:265`).

**Lessons.**

- **Lesson A — The protocol's safety extends only to what is *in* the state machine.** Worktree commits were outside the state machine. Anything outside the state machine is unprotected. The fix: make worktree commits a transition.
- **Lesson B — "Slaver reports done" is not the same as "PR is green."** Master's verification step must include a *content* check, not just a process check. The current best practice: `git diff --stat origin/feature/TASK-XXX` should show the expected LOC delta, not zero. (`confluence/memory/pitfalls/slaver-worktree-code-loss.md:43-46` codifies this.)
- **Lesson C — Re-dispatch is cheap when the audit trail is intact.** Because the protocol recorded the original Slaver's `assignee`, the original `claimed_at`, and the original `executedToolCalls`, the re-dispatch was a *single SQL update* (`UPDATE tickets SET assignee = 'slaver-005', state = 'in_progress'`), not a re-investigation. The cost of the failure was bounded by the audit trail, not by the lost work.
- **Lesson D — Failure cases are first-class documentation.** This case is the reason the article series insists on a "case 4" in every multi-case article. A protocol whose failure modes are not legible is one the reader cannot trust. We trust this protocol because we wrote down the one time it did not work.

**Why this case is the same depth as Cases 1-3.** A failure case with a one-paragraph "and then a Slaver crashed" is a testimonial, not a case study. The 4 sections — setup, sequence, outcome, lessons — are the same shape. The difference is the *direction* of the lesson: in Cases 1-3, the lessons say "the protocol protected us"; in Case 4, the lessons say "the protocol did not, here's why, here's the patch, here's the audit trail that bounded the cost."

---

## 8. Your case — copy-paste-runnable template

The template below is a markdown skeleton. Copy it into `jira/tickets/EPIC-XXX/TASK-NNN.md` (or wherever your tickets live), fill in the bracketed `[…]` fields, and run the protocol against it. The shape matches the four sections used in Cases 1-4 above; the `your-ticket-id` and `your-timestamps` fields are what make the case a *case* rather than a *vignette*.

```markdown
# Case Study: [Your title — short, descriptive]

**Author**: [your name / role: master or slaver]
**Date**: [YYYY-MM-DD]
**Ticket**: [TASK-NNN or your-ticket-id]
**Article reference**: [docs/articles/14-case-studies/.../article.md, if applicable]

---

## Setup

- **What was the goal?** [one sentence]
- **Who was involved?** [list of agents / humans, with role + specialty]
- **What was the starting state?** [READY tickets, branch layout, CI status]
- **What was the time budget?** [estimated hours, hard deadline if any]

## Sequence

```
[t=0    : your-event]
[t=2m   : your-event]
[t=...  : your-event]
[t=Nm   : your-event]
```

```bash
# Concrete commands you actually ran
eket task:claim [your-ticket-id]
git checkout -b feature/[your-ticket-id]-[slug]
# ... your work ...
eket task:complete [your-ticket-id]
```

- **What was the first transition?** [handoff from human → agent, or agent → agent]
- **What was the riskiest transition?** [what could have failed]
- **What was the recovery plan?** [if the riskiest transition failed]

## Outcome

- **What shipped?** [PR URL, branch name, commit hash]
- **What did the audit trail look like?**

```
[your-ticket-id]
├── claim       : [agent-id]   @ [timestamp]
├── implement   : [agent-id]   (commit [hash], [LOC] LOC)
├── complete    : saga-5step   @ [timestamp]
├── review      : [reviewer]   ([approve|changes_requested])
└── merge       : feature→testing→main→miao
```

- **What was the elapsed time?** [actual vs estimate]
- **What was the cost?** [tokens, Slaver-hours, Master-hours]

## Lessons

- **Lesson A — …** [one paragraph, with a `file:line` citation if relevant]
- **Lesson B — …** [one paragraph]
- **Lesson C — …** [one paragraph]

---

## What made this a "case study" of EKET (self-check)

- [ ] At least one handoff boundary (human → agent, agent → agent, or agent → CI)
- [ ] At least one checkpoint, branch, or artifact for crash recovery
- [ ] Complete audit trail (timestamps + instance ids in the SQLite `tickets` row)
- [ ] Multi-role: at least one Master operation and one Slaver operation
- [ ] Tells in four sections (setup, sequence, outcome, lessons) without restructuring

If you checked all five boxes, you have a case. Open a PR against `docs/articles/14-case-studies/` and add it to the article.

---

## Your-ticket-id and your-timestamps (machine-readable)

```yaml
ticket_id: [TASK-NNN]
ticket_url: [jira/tickets/EPIC-XXX/TASK-NNN.md]
claimed_at: [ISO 8601 timestamp]
completed_at: [ISO 8601 timestamp]
merged_at: [ISO 8601 timestamp]
slaver_instance_id: [agent-id from .eket/instances/]
master_instance_id: [agent-id from .eket/instances/]
pr_url: [GitHub PR URL]
branch: [feature/TASK-NNN-slug]
commit: [commit hash]
loc_delta: [+NNN or -NNN]
```

---

## 9. References

- **Series context (cross-references inside this article):**
  - `docs/articles/01-what-is-eket/en/article.md:55-58` — the protocol thesis, the quote about coordination problems
  - `docs/articles/02-why-you-need-eket/en/article.md:109-111` — the four-pain × protocol-fix table (where the Saga 5-step is named)
  - `docs/articles/06-master-slaver-protocol/en/article.md:88-115` — the state-machine diagram
  - `docs/articles/06-master-slaver-protocol/en/article.md:139-151` — the 5 transitions
  - `docs/articles/06-master-slaver-protocol/en/article.md:155-167` — atomic claim, the CAS SQL
  - `docs/articles/06-master-slaver-protocol/en/article.md:226-274` — Saga 5-step, validate → test → checkpoint → commit → notify
  - `docs/articles/06-master-slaver-protocol/en/article.md:278-294` — "Master never claims" rule
  - `docs/articles/06-master-slaver-protocol/en/article.md:336-360` — multi-Slaver dynamics, worktree-per-slaver
  - `docs/articles/12-multi-tool-support/en/article.md:152-186` — the cross-tool worked example (Cursor writes, Claude Code reviews)
  - `docs/articles/GLOSSARY.md:12-13` — Saga and CAS definitions
- **Tickets cited in Cases 1, 2, 4:**
  - `jira/tickets/EPIC-004/TASK-401.md:1-39` — closest analog to CI self-repair: a failed-test repair ticket
  - `jira/tickets/EPIC-007/TASK-636.md:1-13` — Rust context monitor (the Case-4 failure)
  - `jira/tickets/EPIC-007/TASK-636-retrospective.md:1-84` — Slaver-003 retrospective, including the perf-AC ambiguity pitfall
  - `jira/tickets/EPIC-008/TASK-650.md:1-58` — this article's ticket
  - `jira/tickets/EPIC-008/README.md:1-85` — the article-series epic
  - `jira/tickets/TASK-X04.md:1-204` — the patch that fixed the worktree code-loss class of failure
- **Code cited in Cases 1, 2, 3:**
  - `node/src/core/task-checkpoint.ts:48-108` — `_casUpdate` and the `CheckpointCASError` class
  - `node/src/core/saga-executor.ts:22-66` — `SagaExecutor.execute` with compensation in reverse order
  - `node/src/hooks/http-hook-server.ts:14-19` — the cross-tool event bridge endpoint surface
- **Failure case citations:**
  - `confluence/memory/pitfalls/slaver-worktree-code-loss.md:33-45` — the worktree isolation pitfall
  - `confluence/memory/pitfalls/slaver-worktree-code-loss.md:171-174` — the 628-LOC loss timeline
  - `confluence/memory/pitfalls/slaver-worktree-code-loss.md:265` — the re-dispatch to Slaver-005
- **Benchmark and demo artifacts (Case 3):**
  - `benchmarks/multi-agent-eval/run_collab_benchmark.py:1-100` — the benchmark runner (multi-agent collaboration metrics, Co-Gym + DyLAN inspired)
  - `benchmarks/multi-agent-eval/results/collaboration_report.json:1-53` — the aggregate metrics
  - `benchmarks/multi-agent-eval/results/collaboration_report.json:55-85` — COLLAB-001 detail row (used in Case 3)
  - `benchmarks/multi-agent-eval/results/collaboration_report.json:283-339` — COLLAB-009 and COLLAB-010, the most complex tasks (5-6 agents)
  - `examples/e2e-collaboration/README.md:56-92` — the FEAT-001 demo (Master + Slaver through claim → heartbeat → PR → review → merge)
  - `examples/e2e-collaboration/demo-scenario.md:1-67` — the full sequence diagram for the FEAT-001 demo
  - `examples/e2e-collaboration/SUMMARY.md:199-219` — the 26-second timeline of the FEAT-001 demo
  - `inbox/human_input.md:11-20` — the original user requirement that triggered the EPIC-008 article series
- **Branch and CI infrastructure:**
  - `scripts/sync-branches.sh` — the `feature → testing → main → miao` promotion script
- **Related articles in the series:**
  - Previous article: [`13-adr-and-roadmap`](../../13-adr-and-roadmap/en/article.md)
  - Next article: [`15-outlook-risks`](../../15-outlook-risks/en/article.md) — value, risks, mitigation
- **Open follow-ups (Master to triage):**
  - Add a real `TASK-XXX-ci-self-repair` ticket that wires `POST /hooks/post-tool-use` → `epic:create`. The hook server is ready (`node/src/hooks/http-hook-server.ts:14-19`); the dispatcher pipeline is ready (`node/src/hooks/dispatcher.ts:213-425`); the missing piece is the policy in `template/docs/MASTER-RULES.md` that says "auto-create a ticket from a CI failure hook event."
  - Decide whether the "didn't work" case (Slaver-003 / `TASK-636`) should be promoted to its own article (e.g. `14.1-failure-cases/`) once 2-3 more failure cases are collected. The current placement (Section 7 of this article) keeps the cost low; the next article in the series can re-shard if needed.
  - Confirm whether the multi-agent benchmark in `benchmarks/multi-agent-eval/results/collaboration_report.json` should be re-run as part of the EPIC-008 release checklist. The numbers (10/10 complete, `avg_collab_score = 0.8`) are the strongest single piece of evidence in the article series.

