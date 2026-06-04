# 04 — Three-Repo Architecture: confluence / jira / code

> **TL;DR** — EKET stores knowledge, tasks, and code in three sibling directories — `confluence/`, `jira/`, and `code_repo/` — that look like one tree but behave like three independent concerns. Each directory has a different mutability profile, a different version model, a different write pattern, and a different reader population. The split is not about git: it is about lifecycle. Forcing the three lifecycles into a single tool produces a tool that is bad at all three; separating them lets each side be excellent at one. This article is the lifecycle-separation thesis, with a real ticket (`TASK-637`) traced end-to-end to show how the cross-references actually work.

> **Key Takeaways**
> 1. **Three repos, not three git repos.** The split is first a *directory* split (lifecycle, access, write pattern); the *git* split is downstream of that. Conflating the two is the most common misread.
> 2. **Each repo has a different mutability profile.** Knowledge is append-mostly; tasks are stateful and finite (immutable fields enforced by `scripts/check-ticket-immutability.sh`); code is the only repo that branches and merges in the usual git sense.
> 3. **The "no ticket without a cross-reference" rule is enforced, not aspirational.** `scripts/validate-ticket-pr.sh:1-79` rejects PRs whose ticket file is missing a PR/branch reference, a test-output section, or whose test output is a placeholder.
> 4. **A real ticket traces cleanly across all three.** `jira/tickets/EPIC-007/TASK-637.md:148-203` ships code (`.github/workflows/rust-build.yml`), references the lesson at `confluence/memory/pitfalls/slaver-worktree-code-loss.md:5`, and points at the runtime at `.claude/hooks/UserPromptSubmit.sh`.
> 5. **Migration is mechanical, not ideological.** Three concrete steps (init the three submodules, run `validate-ticket-pr.sh`, gate Slaver write permissions by directory) take a team from "monorepo with everything mixed" to "lifecycle-separated" in a week.

---

## Executive Summary

**For decision-makers (read this and walk away):**

| Question | Answer |
|---|---|
| What is the "three-repo architecture"? | Knowledge in `confluence/`, tasks in `jira/`, code in `code_repo/`. Three lifecycles, three access profiles, three write patterns. |
| Is it three git repos or three directories? | Three *directories* first. The git split is optional — submodule pointers, sibling clones, or even `../` relative paths all work, because the protocol is path-based (`docs/architecture/three-repo-deployment.md:301-304`). |
| What does it cost? | A migration week, a `validate-ticket-pr.sh` hook in CI, and a `check-ticket-immutability.sh` pre-commit gate. No new servers, no new vendor product. |
| What does it unlock? | Different access controls for different roles (`docs/architecture/three-repo-deployment.md:242-249`): humans and AI agents get *different* write permissions in each repo, and the cross-references survive crashes. |
| What's the risk? | If you try to keep a single "knowledge + tasks + code" wiki, the lifecycles drift apart and the cross-references break within a quarter. |
| When should we *not* do this? | A solo developer with a single agent, a one-month prototype, or a team that needs Jira-the-product for compliance reasons. See "When to violate" in Section 4. |

The rest of the article explains the lifecycle thesis, walks through `TASK-637` end-to-end, and ends with a migration playbook a team can execute this week.

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

Most teams that adopt EKET have a monorepo. They have a `docs/` directory. They have a `tickets/` or `issues/` directory next to the code. They have a wiki, or a Notion, or a Confluence-the-product. **They have the same three concerns, all in different places, with no enforced cross-reference.** When the model crashes mid-ticket, the human has to reconstruct the story from chat scrollback, commit messages, and whatever the wiki last said. That is the failure mode the three-repo split is designed to prevent.

The deeper diagnosis: **knowledge, tasks, and code are three different lifecycles that happen to live near each other**. They have different write frequencies (knowledge is rare; tasks are steady; code is daily), different readers (knowledge is everyone; tasks are the assignee and reviewer; code is the build system), and different failure modes (knowledge rots; tasks go stale; code breaks). The mistake is to assume that "they are all just files" implies "they can share a tool." They can share a filesystem; they cannot share a *workflow*.

EKET's bet is that **lifecycle separation beats tool unification**. We do not give the team one mega-tool that handles all three. We give the team three directories with different access patterns, and we make cross-references between them *enforceable* rather than aspirational. The audit trail is then a path graph: every ticket carries pointers into `confluence/` and into the code repo, and every memory note carries pointers back to the ticket that produced it.

> "If your tickets, your knowledge base, and your code all live in the same tree, your CI will eventually clobber a lesson with a build artifact. If they live in three sibling trees, that cannot happen, and the cross-references tell you who did what, when, and from which context."
> — *EKET design note, drawn from `confluence/memory/pitfalls/slaver-worktree-code-loss.md:5-46`*

The pitfall file at `confluence/memory/pitfalls/slaver-worktree-code-loss.md:1-46` is the cleanest witness. Two real Slaver incidents (TASK-636, TASK-X04) lost work because the work lived in a single tree where the build system, the agent's worktree, and the agent's chat scrollback all collided. The lesson the file records is not "use git better"; it is **"separate the lifecycles so the failure modes do not compound."**

---

## 2. The Big Idea

The thesis has three claims, each load-bearing. None of them is novel in distributed systems. What is novel is applying all three to a human-AI engineering team.

### 2.1 Three lifecycles, three repositories

Knowledge has the slowest write frequency and the widest read population. It is updated when a *realization* happens (post-mortem, retrospective, after-action review), and it is read by every future contributor who picks up a similar ticket. The natural tool is a knowledge base that is append-mostly: edits are allowed when something is wrong, but the *default operation is append* (a new note), not overwrite. `confluence/memory/lessons/` and `confluence/memory/patterns/` are append-only in practice, even if git technically allows rewrite.

Tasks have a medium write frequency and a narrow read population (assignee + reviewer). They are *stateful* (a ticket moves from `READY` to `IN_PROGRESS` to `IN_REVIEW` to `DONE`) and *finite* (a ticket has a defined end state, after which it is archived). The natural tool is a state machine. The natural storage is a database row or a Markdown file with state markers, where the *default operation is transition*, not free-text rewrite. `jira/tickets/TASK-NNN.md` is exactly this.

Code has the highest write frequency and the widest read population (every developer, every CI run, every deploy). It is *versioned* and *branchy* in the way git is. The natural tool is git, and the natural operation is `commit + branch + merge`. `code_repo/` (or `rust/`, `node/`) is exactly this.

Forcing the three into one tool means one tool has to be excellent at three different defaults: append, transition, and branch. In practice this means the tool is excellent at none of them — git is bad at state transitions, a Kanban board is bad at append-mostly, a wiki is bad at versioned branches. **EKET's answer is to use the right tool for each repo, and to enforce the cross-references between them.**

### 2.2 Three directories, not three git repos — but git-friendly

A common misread: "Three repos" = "three git remotes." That is *one* valid implementation, but it is not the only one, and conflating the two creates real confusion. The primary axis is *lifecycle*, and the secondary axis is *storage*. EKET supports all four storage variants:

| Storage variant | When it fits |
|---|---|
| Three git remotes, accessed as submodules | Multi-org settings; strict access isolation; CI needs to clone each independently. |
| Three git remotes, accessed as sibling directories (`../confluence`, `../jira`, `../code`) | Multi-org settings where the team prefers plain `cd` to submodule pointer management. |
| Three directories in a single monorepo | Single-org teams; the lifecycle split is enforced by `validate-ticket-pr.sh` and `check-ticket-immutability.sh`, not by git. |
| Three directories in a single non-git tree | Throwaway prototypes; rare. |

The EKET runtime does not depend on git submodules. `docs/architecture/three-repo-deployment.md:301-304` is explicit: "可以 [纯平级目录]。在 `config.yml` 中用相对路径 `../sibling` 访问即可，EKET 运行时不依赖 git submodule 机制。" The submodule model is the *recommended* layout because it pins versions and lets a single `git clone --recurse-submodules` bring everything online, but the protocol is path-based. **If you remember nothing else from this section, remember: the lifecycle split is mandatory; the git split is optional.**

### 2.3 Cross-references are the contract

The thing that makes three repos navigable is not git — it is *cross-references*. A ticket in `jira/` points at one or more notes in `confluence/` (the rationale) and one or more commits in `code_repo/` (the implementation). A note in `confluence/` points back at the ticket that produced it. A commit message includes the ticket id. The result is a directed graph that is queryable in 30 seconds, even when one of the three repos is down.

The cross-reference rule is the part that turns the layout from "three directories" into "a protocol." `scripts/validate-ticket-pr.sh:1-79` enforces it: a ticket file must contain either `^PR:`, `pr_link:`, `branch:`, or a `feature/` reference (lines 38-46); a `## Test` section, a `Tests:` line, or a `npm test` line (lines 48-56); and it must not contain a pure-placeholder test line (lines 58-74). **The script's existence is what makes the cross-references survive lazy Slaver behavior.** Without it, the rule degrades to a Slack post that nobody reads.

---

## 3. How It Works

### 3.1 The lifecycle-comparison table

| Lifecycle | Directory | Mutability | Version model | Default write pattern | Primary readers | Cited at |
|---|---|---|---|---|---|---|
| Knowledge | `confluence/memory/` (lessons, patterns, pitfalls, retrospectives) | Append-mostly; edits allowed but discouraged | Append-only in practice; rewrites rare and require a note in the file | Append a new note file; edit only to correct | All future contributors; the memory KB is the most-read repo | `confluence/memory/MEMORY.md:17-46` |
| Tasks | `jira/tickets/EPIC-NNN/TASK-NNN.md` | Stateful, finite; *immutable fields* (priority, acceptance_criteria, blocked_by, parent_epic, agent_type, estimate_hours) enforced by `scripts/check-ticket-immutability.sh:30-87` | Lifecycle states (READY → IN_PROGRESS → IN_REVIEW → DONE); ticket file is append-only after `IN_REVIEW` | Transition a state field; append an `Implementation Notes` block at the end | Assignee, reviewer, Master audit | `scripts/check-ticket-immutability.sh:30`; `docs/articles/GLOSSARY.md:10-12` |
| Code | `code_repo/` (or `rust/`, `node/`) | Mutable, with branch protection on `main` and `testing` | Git; four-branch model `miao` → `main` → `testing` → `feature/*` (also `hotfix/*` as a fast lane) | Commit + branch + PR | Build system, CI, every developer | `docs/architecture/THREE_REPO_ARCHITECTURE.md:240-247` |

A few things the table is trying to make obvious:

- **Only the code repo branches in the git sense.** Tasks do not "branch"; they transition. Knowledge does not "branch"; it appends. The git feature set is wildly over-applied when it is the only tool in the box.
- **The audit trail lives in the right place for each lifecycle.** For code, the audit trail is git log. For tasks, the audit trail is the ticket's `## Implementation Notes` block + the `check-ticket-immutability.sh` exit history. For knowledge, the audit trail is the append-only file plus the cross-references back to the ticket that produced the note.
- **Readers differ.** A `feature/*` branch is read by CI and by the next developer. A ticket is read by the assignee, the reviewer, and Master. A memory note is read by *every future contributor who hits the same shape of problem*. Putting all three in the same place forces the same access model on all three readers, and that is always wrong for at least one of them.

### 3.2 Why submodule integration is the recommended path

For teams that want the strongest isolation — multi-org, strict access control, CI clones each repo independently — the recommended path is git submodules. `docs/architecture/THREE_REPO_ARCHITECTURE.md:158-168` shows the canonical `.gitmodules`:

```ini
[submodule "confluence"]
    path = confluence
    url = https://github.com/{org}/{project}-confluence.git
    branch = main

[submodule "jira"]
    path = jira
    url = https://github.com/{org}/{project}-jira.git
    branch = main
```

The submodule model has three properties that the protocol needs:

1. **A single `git clone --recurse-submodules` brings the whole system online.** New Slavers do not need a runbook; the clone is the runbook. See `docs/architecture/three-repo-deployment.md:147-154`.
2. **Each submodule has its own remote, branch, and CI.** The code repo's CI does not need access to the jira repo's secrets. The jira repo can be cloned by an AI Slaver with no write access to code at all (see the permission matrix in `docs/architecture/three-repo-deployment.md:242-249`).
3. **A submodule pointer is a single commit hash.** When the Master bumps the jira pointer, the audit log is one line: `chore: 更新 jira submodule 指针到最新`. When a Slaver updates the jira repo independently, the same line is the only artifact the main repo sees (`docs/architecture/three-repo-deployment.md:174-185`).

For teams that do not want submodules — typically single-org, single CI — the sibling-directory model is equivalent. `docs/architecture/three-repo-deployment.md:301-304` documents the trade-off in one paragraph; the practical difference is "you manage three `git remote` URLs and run `git pull` in each, instead of running `git submodule update`."

### 3.3 The permission matrix — why three repos unlocks per-role access

`docs/architecture/three-repo-deployment.md:242-249` publishes a permission matrix that is one of the cleanest arguments for the three-repo split. Reproduced:

| 角色 | `myproject` (主) | `-confluence` | `-jira` | `-code` |
|------|:---:|:---:|:---:|:---:|
| Human Master | read/write | read/write | read/write | read/write |
| Human Slaver | read | read/write | read/write | read/write |
| AI Master | read | read/write | read/write | review only |
| AI Slaver | read | read | read/write | feature/* only |
| CI/CD Bot | - | - | read | read/write |

The matrix says something important that a monorepo cannot say: **an AI Slaver can write to `jira/` (to claim and complete tickets) but cannot write to `confluence/` (cannot invent knowledge) and cannot write to `code_repo/` outside its assigned branch.** That last column is what makes the audit trail survivable. A Slaver that misbehaves is constrained to its `feature/TASK-NNN-*` namespace; the blast radius is one branch, not the whole tree.

In a monorepo, you would have to enforce this with a path-based pre-commit hook that every Slaver could (and does, eventually) bypass. With three repos, the constraint is enforced by git itself: the Slaver does not have push access to the main repo's `main` branch, and the pre-receive hook on the code repo rejects pushes outside the Slaver's allowed prefix.

### 3.4 A real ticket, traced end-to-end: TASK-637

The lifecycle split is easy to assert and hard to demonstrate. The cleanest demonstration is a ticket that actually shipped, with its cross-references visible. **`jira/tickets/EPIC-007/TASK-637.md`** is the example. TASK-637 is "Rust CI Pipeline — cross-platform auto-build" (lines 1-10). It was completed by Slaver-009 on 2026-05-14 (`TASK-637.md:148-158`) and produced `.github/workflows/rust-build.yml` plus `.github/workflows/rust-test.yml` (`TASK-637.md:163-175`). The ticket traces cleanly through all three repos:

| Layer | Artifact | Where it lives | Cross-reference |
|---|---|---|---|
| Task | `jira/tickets/EPIC-007/TASK-637.md` | `jira/tickets/EPIC-007/TASK-637.md:1-258` | `Blocked By: TASK-636` (line 148), `Created: 2026-05-14` (line 148) |
| Knowledge (lesson that preceded it) | `confluence/memory/pitfalls/slaver-worktree-code-loss.md` | `confluence/memory/pitfalls/slaver-worktree-code-loss.md:5` | The file's `source:` field lists `TASK-636, TASK-X04`; line 70 records `E2E tests 先行 (TASK-635) → 发现 3 个集成问题` |
| Knowledge (specific lesson) | `confluence/memory/pitfalls/perf-ac-ambiguity.md` | `confluence/memory/pitfalls/perf-ac-ambiguity.md:5,25,33` | The file's `source:` is `TASK-636`; it captures the 14.5% precision deviation lesson that informed TASK-637's benchmark design |
| Code (deliverable) | `.github/workflows/rust-build.yml` (4.3 KB) | The code repo, written by Slaver-009 | `TASK-637.md:163-167` records the LOC, the 4-platform matrix, and the SHA256SUMS auto-generation |
| Code (integration with shell hook) | `.claude/hooks/UserPromptSubmit.sh` | The code repo | The hook's first comment line is `# UserPromptSubmit Hook - TASK-631` (verified in this repository; the `UserPromptSubmit.sh` script is the runtime call site for the whole context-monitoring pipeline that TASK-637 ships) |
| Implementation trace (in the ticket) | `TASK-637.md:148-203` | The ticket file itself | The `实施记录` block records the actual time, the `AC 验证状态`, the `技术亮点`, and the `已知限制` — all written by the Slaver that did the work |

**The cross-references are not aspirational.** The lesson file names the ticket that produced the lesson; the ticket names the code that satisfied the ACs; the code's runtime hook (UserPromptSubmit.sh) is the system that the Slaver's work will be exercised through. If you delete any one of the three, the other two can still answer the question "what was the rationale?" and "what was the implementation?" — because the cross-reference is in the file content, not in a third-party indexer that went down with the wiki.

A second witness, in the inbox, is even more direct: `inbox/human_input.md:18-25` records that "TASK-636 Slaver-003 声称完成，但 `rust/crates/context-mon/` 从未入 git" and "TASK-635 Slaver-004 超时后需重新派遣（虽然测试文件幸存）." The user's requirement text at line 11 — "eket 团队做事的时候要有经常更新 ticket/文档的机制" — is the *human-authored origin* of the lifecycle-separated recovery design. The inbox note says "restore from ticket/文档," not "restore from chat." The architecture is downstream of that sentence.

### 3.5 What "enforced" means: the two scripts

Two shell scripts make the lifecycle split survive a lazy Slaver:

1. **`scripts/validate-ticket-pr.sh:1-79`** — runs in CI before a PR is merged. It enforces four rules (lines 7-12): the ticket file must exist; the ticket must contain a PR URL or branch reference; the ticket must contain a test-output section; the test output must not be a placeholder (`截图` / `手动` / `todo` / `tbd`). Exit 0 = the ticket is honest; exit 1 = the PR is rejected. The script is small, has no dependencies, and is the same shape as `scripts/check-ticket-immutability.sh:1-94` — a deliberate design choice (the validation chain is itself L0-shell, see the four-level degradation article).
2. **`scripts/check-ticket-immutability.sh:1-94`** — runs as a pre-commit hook. It enforces that *immutable ticket fields* are not modified by anyone who is not a Master. The list of immutable fields is at `scripts/check-ticket-immutability.sh:30`: `priority, acceptance_criteria, blocked_by, parent_epic, agent_type, estimate_hours, estimated_hours`. Two exemption paths exist (lines 52-68): a `[master-override]` marker in the commit message, or a `master_emails` entry in `.eket/config.yml` matching the author's email. The script is what makes "the ticket was supposed to be 4h and someone changed it to 1h before merge" an auditable event, not a silent drift.

Without these two scripts, the lifecycle split is *described* in `THREE_REPO_ARCHITECTURE.md` but not *enforced*. With them, the split is mechanically protected. The protocol is the scripts, not the architecture document.

---

## 4. Trade-offs & Alternatives

### 4.1 Alternatives, and where each one fails

| Alternative | What it does | What EKET does differently |
|---|---|---|
| **Single monorepo with `docs/`, `tickets/`, `code/`** | All three lifecycles in one tree, one git history, one CI | EKET keeps three lifecycles in three access-controlled repos. The monorepo cannot express "AI Slaver may write to jira but not to confluence." |
| **GitHub Projects + Actions** | Kanban + CI on a single repo; tickets live in GitHub Issues | EKET keeps tickets as files in `jira/tickets/`, with `validate-ticket-pr.sh` enforcing the cross-reference rules. GitHub Issues is a black box to git and to the agent — the audit trail is queryable only through the GitHub UI. |
| **Confluence-the-product + Jira-the-product + GitHub** | Three vendor systems, one for each concern | EKET replaces three vendors with three plain-text trees under git. No vendor lock-in; the audit trail is a `git log`; cross-references are `file:line`. |
| **A single "everything" wiki (Notion, Slab, etc.)** | All three lifecycles in one vendor product | EKET rejects the wiki because (a) it is not under git, (b) it is not under the team's access control, (c) cross-references cannot be enforced by a pre-commit hook. |
| **One repo with strict path-based access controls** | Path-based pre-commit hooks reject writes outside allowed paths | Possible, but the enforcement is one missed hook away from a full breach. Three git repos make the access boundary *physical*, not policy. |

### 4.2 When to violate the rule

The three-repo split is a strong default, not a religion. Here are the situations where a single repo is the right call, and the reason is structural rather than aesthetic.

1. **Solo developer, single agent, throwaway prototype.** The lifecycle separation overhead exceeds the coordination benefit. The audit trail is one human's `git log`; the access control is "I trust myself." Wait until the second human or the second agent arrives.
2. **One-month prototype with no intent to maintain.** Three repos, three CIs, three permission matrices — none of that survives a prototype that is rewritten in week five. Stay in one tree until the rewrite-or-promote decision.
3. **Compliance environment that mandates Jira-the-product.** Some regulated environments require vendor-managed ticketing for audit. EKET can still run the *protocol* (state machine, Saga 5-step, ticket file), but the storage will be Jira-the-product + a `code_repo/` + a `confluence/`. The three-repo *protocol* survives; the three-repo *file layout* does not.
4. **Team of 6+ humans, no agents.** Coordination debt here is dominated by human org design (per `docs/articles/02-why-you-need-eket/en/article.md:168`). The lifecycle split still helps (audit trail, ticket plan as review precondition), but the headline ROI is not in the three-repo split; it is in the master-slaver protocol. A 6-person team that adopts EKET should expect the three-repo split to be useful, not load-bearing.
5. **Greenfield project with no prior `jira/` or `confluence/` content.** A migration week for a tree that has no legacy content is overkill. Start in one tree; promote to three the first time you have a memory note that a future ticket needs to reference. The promotion is mechanical (Section 5.3 below).

A useful self-test: if your team can answer the audit question "who did what, when, on which ticket, citing which memory note, with which PR?" in under 30 seconds from a single `git grep` — your layout is fine. If the answer requires opening three vendor UIs and chasing a Slack thread, you have outgrown the layout and the three-repo split will pay for itself in a quarter.

### 4.3 Anti-patterns

- **Putting ticket state in a Notion database and a `jira/tickets/` file at the same time.** The two will drift within a sprint. Pick one source of truth; if you need a Notion view of `jira/tickets/`, build a *read-only* sync, not a write-both.
- **Letting an AI Slaver write to `confluence/memory/lessons/`.** Knowledge is human-authored by default; the Slaver can *propose* a note (in `inbox/`), but a human must promote it. `docs/architecture/three-repo-deployment.md:242-249` makes this concrete: AI Slaver has read access to confluence, not write. The same rule keeps the memory KB honest.
- **Treating the jira repo as a personal scratchpad.** If every Slaver writes free-form notes to its ticket file, the `check-ticket-immutability.sh` enforcement breaks. Tickets are *artifacts*; their fields are protected; their `## Implementation Notes` block is the only free-form section.
- **Skipping `validate-ticket-pr.sh` in CI "to ship faster."** Every documented excuse to skip the validator is a future post-mortem about an unreviewed PR. The script is 79 lines (`scripts/validate-ticket-pr.sh:1-79`); adding it to CI is a 5-line workflow change.
- **Promoting to three repos before the team has ≥ 1 human + ≥ 2 agents working a shared backlog.** Below that threshold, the protocol overhead exceeds the benefit (per `docs/articles/02-why-you-need-eket/en/article.md:160-181`).

---

## 5. Implementation Notes

### 5.1 What you actually run

The minimum viable three-repo layout, taken from `docs/architecture/three-repo-deployment.md:120-140` and `docs/architecture/three-repo-deployment.md:38-69`:

```bash
# 1. Create the main project and three submodule repos on the remote
mkdir myproject && cd myproject
git init -b main

# 2. Clone the three sibling repos (or create them locally first)
git clone git@github.com:my-org/myproject-confluence.git myproject-confluence
git clone git@github.com:my-org/myproject-jira.git       myproject-jira
git clone git@github.com:my-org/myproject-code.git       myproject-code

# 3. Register as submodules
git submodule add git@github.com:my-org/myproject-confluence.git myproject-confluence
git submodule add git@github.com:my-org/myproject-jira.git       myproject-jira
git submodule add git@github.com:my-org/myproject-code.git       myproject-code

# 4. Commit and push
git add .gitmodules myproject-confluence myproject-jira myproject-code
git commit -m "feat: register three submodules"
git remote add origin git@github.com:my-org/myproject.git
git push -u origin main
```

After this, every new Slaver does a single `git clone --recurse-submodules` and has the full layout. The runtime paths are then `myproject-confluence/`, `myproject-jira/`, `myproject-code/` — sibling directories that the Slaver's `config.yml` references as `../myproject-confluence`, `../myproject-jira`, `../myproject-code` (see `docs/architecture/three-repo-deployment.md:191-217`).

### 5.2 Where the headline numbers and citations live in source

| Claim | Citation |
|---|---|
| Submodule `.gitmodules` template | `docs/architecture/THREE_REPO_ARCHITECTURE.md:158-168` |
| Four-branch model table | `docs/architecture/THREE_REPO_ARCHITECTURE.md:240-247` |
| Task-state × repo-interaction diagram | `docs/architecture/THREE_REPO_ARCHITECTURE.md:265-296` |
| Why three repos (the access-control argument) | `docs/architecture/three-repo-deployment.md:9-17` |
| Permission matrix (5 roles × 4 repos) | `docs/architecture/three-repo-deployment.md:242-249` |
| Submodule-or-sibling escape hatch | `docs/architecture/three-repo-deployment.md:301-304` |
| Ticket-validation rules (4 rules, 79 lines) | `scripts/validate-ticket-pr.sh:1-79` |
| Ticket-immutability field list | `scripts/check-ticket-immutability.sh:30` |
| Memory KB structure (lessons, patterns, pitfalls) | `confluence/memory/MEMORY.md:17-46` |
| Cross-references: TASK-637 → lesson → code | `jira/tickets/EPIC-007/TASK-637.md:148-203`; `confluence/memory/pitfalls/slaver-worktree-code-loss.md:5` |
| Pitfall source for the original design | `inbox/human_input.md:11,18-25` |

### 5.3 Three concrete migration steps for this week

These are not aspirations. They are the minimum a team can ship in five working days, with the existing EKET scripts and a single CI change.

1. **Day 1–2 — Initialize the three sibling directories in place.** Move the existing `docs/` (knowledge) into a new top-level `confluence/`; move the existing `tickets/` or `issues/` Markdown into a new `jira/`; leave the code where it is (or move it to `code_repo/` if you want the symmetry). Commit each move as a separate commit so the history is queryable. No git remote change required for a single-org team. Time cost: half a day if the directories are already named `docs/` and `tickets/`; a full day if you have to disentangle mixed content.

2. **Day 3 — Wire `scripts/validate-ticket-pr.sh` into CI.** Add one workflow step that runs `bash scripts/validate-ticket-pr.sh jira/tickets/<id>.md` for every changed ticket file. The script is 79 lines, has no dependencies, and exits non-zero on the four documented violations (`scripts/validate-ticket-pr.sh:7-12`). Time cost: an hour, including the CI workflow edit and a test PR that intentionally fails the validator to confirm the gate is live.

3. **Day 4–5 — Gate Slaver write permissions by directory.** Add a pre-commit hook that runs `scripts/check-ticket-immutability.sh --staged` on every commit that touches `jira/tickets/*.md` or `jira/epics/**/*.md`. Pair it with a `[master-override]` exemption for the rare cases where a Slaver legitimately needs to amend a ticket (e.g., refining an AC after a Master review). If your Slaver runs in a CI container with scoped tokens, restrict the `code_repo/` token to `refs/heads/feature/TASK-*` and the `jira/` token to the entire repo. Time cost: a day, mostly the access-control audit and one round of token-rotation testing.

After Day 5, the layout is three lifecycles, the cross-references are CI-enforced, and the access matrix is real. Everything beyond that — submodule pointers, the four-branch model, the inbox bridge — is a refinement, not a prerequisite.

### 5.4 Cross-references inside the repo

- Lifecycle separation thesis (this article): `docs/articles/04-three-repo-arch/en/article.md:1`
- Architectural spec: `docs/architecture/THREE_REPO_ARCHITECTURE.md:1` (338 lines, the source of truth for the layout)
- Deployment playbook: `docs/architecture/three-repo-deployment.md:1` (312 lines, the "how to set it up" companion)
- Three-lifecycle context (for the protocol layer): `docs/articles/01-what-is-eket/en/article.md:121-127`
- Why-the-split-pays-for-itself ROI: `docs/articles/02-why-you-need-eket/en/article.md:107-114`
- Glossary entries: `docs/articles/GLOSSARY.md:16-21` (Three-Repo Architecture, Memory KB, Ticket, Epic)
- Memory KB top-level index: `confluence/memory/MEMORY.md:1-91`

---

## 6. Lessons Learned

**Lesson 1 — "Three repos" and "three git repos" are not the same sentence.** The lifecycle split is mandatory; the git split is one valid storage variant among four. A team that hears "three git repos" and balks at the operational overhead has missed the actual recommendation. The right way to read EKET's advice is: *three directories, each with its own access model, and git submodules if you want the strongest isolation*. `docs/architecture/three-repo-deployment.md:301-304` is the explicit escape hatch.

**Lesson 2 — The cross-references are the protocol, not the directories.** Three directories with no cross-references is just three folders. Three directories where every ticket points at a memory note and every memory note points back at the ticket — that is a queryable audit graph. The cross-reference rule is what `scripts/validate-ticket-pr.sh:38-46` enforces; the rule is what makes the layout survivable across crashes, role changes, and team turnover. The architecture document is a description; the script is the contract.

**Lesson 3 — Pitfalls are the source of the design, not a footnote.** The pitfalls file at `confluence/memory/pitfalls/slaver-worktree-code-loss.md:1-46` is what motivated the lifecycle split in the first place. Two real Slaver incidents (TASK-636, TASK-X04) lost work because the lifecycles were entangled. The lesson is recorded in `confluence/`, the lesson is referenced from the inbox at `inbox/human_input.md:11,18-25`, and the lesson informed TASK-637's design. **The audit trail works because the lessons file is itself a cross-reference target.** A wiki that does not let you `grep` for the ticket id is not part of the protocol; it is decoration.

**Lesson 4 — Permission matrices are the load-bearing argument.** The most underrated table in the entire repo is `docs/architecture/three-repo-deployment.md:242-249`. A team that adopts EKET's three-repo split can answer "what is this AI Slaver allowed to do?" with one row of a table. A team that does not adopt the split cannot answer that question without auditing every pre-commit hook in their CI. The lifecycle split is what makes per-role access control *physical* (different git repos, different tokens) rather than *policy* (one big repo, one path-based hook that someone will eventually bypass). This is the strongest reason to prefer submodule isolation over a single monorepo with strict path policies, even when the operational overhead is higher.

**Lesson 5 — A migration week is cheaper than a quarter of debugging.** The five-day migration in Section 5.3 is mechanical. The cost of *not* doing it is a slow accumulation of "we lost the context" incidents, each of which costs a day to reconstruct and a quarter of trust to repair. The ROI is asymmetric: migration is bounded, drift is not. Teams that have lived through a TASK-636-style loss (work claimed but not committed) do not need to be sold on the lifecycle split; teams that have not should run the migration anyway, because the prevention is cheaper than the recovery.

---

## 7. References

- **Internal architecture**:
  - `docs/architecture/THREE_REPO_ARCHITECTURE.md:1-338` — the authoritative spec (Chinese, 338 lines)
  - `docs/architecture/three-repo-deployment.md:1-312` — the deployment playbook (English, 312 lines)
  - `docs/architecture/DEGRADATION-STRATEGY.md:1` — companion article on four-level degradation
- **Ticket protocol**:
  - `scripts/validate-ticket-pr.sh:1-79` — 4-rule CI gate
  - `scripts/check-ticket-immutability.sh:1-94` — 7-field pre-commit gate
  - `docs/adr/ADR-001..003-*.md:1` — the three ADRs that anchor the protocol
- **Memory KB**:
  - `confluence/memory/MEMORY.md:1-91` — top-level index
  - `confluence/memory/pitfalls/slaver-worktree-code-loss.md:1-275` — the lesson that motivated the split
  - `confluence/memory/pitfalls/perf-ac-ambiguity.md:1-33` — the lesson on precision-deviation ACs
- **Real example ticket**:
  - `jira/tickets/EPIC-007/TASK-637.md:1-258` — Rust CI Pipeline (Done, Slaver-009, 2026-05-14)
  - `inbox/human_input.md:1-105` — the human-authored requirement that triggered the recovery design
- **Companion articles in this series**:
  - [`01-what-is-eket`](../../01-what-is-eket/en/article.md) — the thesis, including the three-repo one-liner
  - [`02-why-you-need-eket`](../../02-why-you-need-eket/en/article.md) — the pain × solution × ROI argument
  - [`03-technical-value-choices`](../../03-technical-value-choices/en/article.md) — the seven non-obvious choices
  - **Next**: [`05-four-level-degradation`](../../05-four-level-degradation/en/article.md) — why the same protocol in four implementations is the floor of the system
- **Glossary**: [`docs/articles/GLOSSARY.md:1-46`](../../GLOSSARY.md) — shared terminology (Three-Repo Architecture, Memory KB, Ticket, Epic, Saga, CAS, Checkpoint)
