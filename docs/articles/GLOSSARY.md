# Glossary — Shared Terminology

> **Use this as the single source of truth for terms used across the 15-article series.**
> When an article introduces a new term, link it back here.

| Term | Definition | Where it lives |
|---|---|---|
| **Master** | The coordinator role (human or AI). Sets direction, breaks down requirements into tickets, reviews PRs, merges to `main`. | `template/docs/MASTER-RULES.md` |
| **Slaver** | The executor role. Claims READY tickets, implements, opens PRs, responds to review feedback. | `template/docs/SLAVER-RULES.md` |
| **Ticket** | An atomic, stateful unit of work. Lives in `jira/tickets/TASK-NNN/`. | `jira/tickets/` |
| **Epic** | A grouping of related tickets. Lives in `jira/tickets/EPIC-NNN/`. | `jira/tickets/EPIC-*/` |
| **Saga** | A 5-step atomic completion: validate → test → checkpoint → commit → notify. | `eket task:complete` |
| **CAS** | Compare-And-Swap. The atomic claim primitive on SQLite. Prevents double-claim. | `node/src/core/sqlite-client.ts:966-976` |
| **Checkpoint** | A persisted snapshot of Slaver state, recoverable via `eket task:resume`. | `node/src/core/task-checkpoint.ts:48-108` |
| **Four-Level Degradation** | L0 Shell → L1 Rust → L2 Node.js → L3 Shell fallback. Same protocol, different implementations. | `docs/architecture/DEGRADATION-STRATEGY.md` |
| **Three-Repo Architecture** | Knowledge in `confluence/`, tasks in `jira/`, code in `code_repo/` (or `rust/`, `node/`). | `docs/architecture/THREE_REPO_ARCHITECTURE.md` |
| **Branch Strategy** | `feature/*` → `testing` → `main` → `miao`. Four-stage promotion. | `scripts/sync-branches.sh` |
| **Protocol Operation** | A state transition: `task:claim`, `task:complete`, `task:resume`, `gate:review`, etc. | `.claude/skills/eket/SKILL.md` |
| **Inbox** | Human-authored input. Where requirements arrive. | `inbox/` |
| **Outbox** | Human-facing output. Where deliverables are surfaced. | `outbox/` |
| **Memory KB** | The knowledge base. Append-mostly. Cross-referenced by tickets. | `confluence/memory/` |
| **Expert Panel** | A multi-perspective review board summoned for non-trivial decisions. | `eket expert:compose` |
| **Hook Server** | The cross-tool event bridge. Lets non-Claude tools participate in the protocol. | `node/src/hooks/` |
| **OpenClaw** | A companion AI agent protocol. EKET bridges to it. | `docs/architecture/OPENCLAW-INTEGRATION-DESIGN.md` |
| **ADR** | Architecture Decision Record. Three exist as of v2.14. | `docs/adr/ADR-001..003-*.md` |
| **Gate Review** | A pre-completion quality gate. Must pass before `task:complete` succeeds. | `eket gate:review` |
| **Coordination Debt** | The hidden tax that compounds as N agents + humans work on the same source of truth without a protocol. Distinct from *technical debt*; arises only at multi-executor scale. Solved by the EKET protocol, not by better tools. | `docs/articles/02-why-you-need-eket/en/article.md:44,243` |
| **Headline Number** | A single, traceable, source-cited performance figure used to anchor an ROI argument (e.g. "19× faster `task:claim`"). The article series insists every headline number carry a `file:line` reference to its source — no aspirational numbers. | `docs/articles/02-why-you-need-eket/en/article.md:21,80` |
| **Pain × Solution Map** | The 1:1 mapping from coordination pain (lost context, conflicting edits, opaque review, no audit) to protocol mechanism (checkpoint, CAS, ticket-plan-precondition, Saga 5-step). Used as a diagnostic: if your workaround does not map to one of these, it is probably not solving the pain you think. | `docs/articles/02-why-you-need-eket/en/article.md:241` |

---

## Acronyms

- **CAS** — Compare-And-Swap
- **KB** — Knowledge Base
- **DX** — Developer Experience
- **ADR** — Architecture Decision Record
- **CLI** — Command Line Interface
- **LLM** — Large Language Model
- **CI** — Continuous Integration
- **SLA** — Service Level Agreement
- **PR** — Pull Request
- **FTS** — Full-Text Search
- **TF-IDF** — Term Frequency–Inverse Document Frequency
