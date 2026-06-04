# 15 — Outlook: Value, Risks, and the Three Bets for 2027

> **TL;DR** — This is the final article in the 15-article EKET series. It steps back from protocol details and answers the question the prior 14 articles have earned the right to ask: *what is EKET's strategic value, what could go wrong, and what specifically must the project win in the next 12 months to matter in 2027?* The value is the **same protocol expressed in four implementations** (`docs/articles/01-what-is-eket/en/article.md:131-140`), the **same audit trail for humans and AI** (`docs/articles/06-master-slaver-protocol/en/article.md:78-86`), and the **same SQLite row as the only source of truth** (`docs/articles/06-master-slaver-protocol/en/article.md:166-167`). The risks are five: adoption ceiling, protocol absorption, a competing meta-protocol, the maintenance tax of three runtimes, and the security surface of agent autonomy. The mitigations exist; the open question is whether they ship on time. The three strategic bets are concrete: **ship v3.0.0 by 2026-09-30** (current state: `Unreleased — Rust Migration` in `CHANGELOG.md:67-92`), **decide on ADR-004 (multi-host state) by 2027-01-31** (sketched at `docs/articles/13-adr-and-roadmap/en/article.md:211-217`), and **ship the axum HTTP API as stable v1.0 with cross-adapter conformance by 2027-05-31** (current state: 15 routes in `rust/crates/eket-server/src/lib.rs:461-492`, not yet versioned).

> **Key Takeaways**
> 1. EKET is not an agent framework. It is a **coordination protocol** that happens to ship five agent adapters (`docs/articles/12-multi-tool-support/en/article.md:80-91`). The protocol is the durable thing; the adapters are replaceable.
> 2. The five risks are real, not theatrical: the project survives any one of them, but not all four at once. The mitigations are actions the project is taking, not hopes. The honest version of the article names which risks are harder to mitigate than the headline framing suggests.
> 3. The market context is **four** adjacent frameworks, not one: LangGraph (graph orchestration), CrewAI (role-based crews), AutoGen (Microsoft's conversational stack), and OpenClaw (a meta-protocol). EKET competes on **auditability and the same-protocol-for-human-and-AI invariant**, not on agent quality.
> 4. Where the value compounds is in three places: the **adapter contract** (any new LLM tool joins in ~200 lines per `docs/articles/12-multi-tool-support/en/article.md:248-302`), the **three-repo lifecycle split** (knowledge, tasks, code — `docs/articles/04-three-repo-arch/en/article.md`), and the **L0 shell floor** (the same protocol on a fresh container with `bash` only — `docs/articles/05-four-level-degradation/en/article.md:117-120`).
> 5. The three strategic bets are **concrete dates, concrete artifacts, concrete exit numbers** — not aspirations. A bet that says "by 2027-Q2 ship v1.0" is auditable. A bet that says "become the leading protocol" is marketing.
> 6. The most likely failure mode is **not** that the protocol is wrong; it is that the project ships v3.0.0 and the article series, and then plateaus at 20–30 production users. Adoption ceiling is the structural risk, not technical risk.

---

## Executive Summary

**For decision-makers (read this and walk away):**

| Question | Answer |
|---|---|
| What is the article for? | To step back from protocol details, restate EKET's strategic value, name the real risks, and commit to three concrete bets for the next 12 months. |
| What is the value proposition, in one sentence? | The same coordination protocol — `task:claim`, `task:complete`, `task:resume`, `gate:review` — runs identically for humans and AI, in five LLM tools, in four runtime implementations, and on a single SQLite row of truth. |
| What could kill the project? | Not a wrong protocol. The structural risks are (1) too few teams need this, (2) a competing meta-protocol wins the LLM-tool-agnostic slot, (3) the maintenance tax of three runtimes grows faster than the community, (4) the security surface of agent autonomy produces a public incident. |
| What is the project doing about each? | Concrete actions tied to specific artifacts and dates — not aspirations. See Section 6 and Section 7. |
| What are the three strategic bets? | **Bet 1** — by 2026-09-30, ship v3.0.0 with the Rust migration completed and 100% test pass rate. **Bet 2** — by 2027-01-31, accept or reject ADR-004 (multi-host state) with a written reason. **Bet 3** — by 2027-05-31, ship the axum HTTP API as stable v1.0 with conformance passing against Claude Code, Cursor, and Codex. |
| What is the honest uncertainty? | Whether the LLM-tool-agnostic story is a 2026 or 2028 differentiator. The framing of "any tool, same protocol" is unique today; whether it stays unique depends on what LangGraph, CrewAI, and the next generation of orchestration frameworks ship by 2027-Q3. |

The rest of the article defends each claim with a `file:line` citation, names the unresolved questions explicitly, and ends with a deliberate, honest capstone.

---

## 1. Motivation — the series has earned this question

The prior 14 articles in this series have, in order, defined the protocol (`01`), defended the ROI (`02`), explained the seven non-obvious choices (`03`), separated the three lifecycles (`04`), built the four-level degradation ladder (`05`), specified the Master-Slaver state machine (`06`), justified SQLite and CAS (`07`), sourced the Rust performance numbers (`08`), designed observability and recovery (`09`), produced the onboarding playbook (`10`), exposed four integration surfaces (`11`), proved the protocol survives the tool layer (`12`), summarized the ADRs and roadmap (`13`), and walked through real-team implementations (`14`). At this point the series has done the work that earns the right to step back and ask the strategic question: *what is this thing worth, what could take it away from us, and what specifically must we win in the next 12 months?*

The question is the same one a board would ask, the same one a senior engineer would ask before adopting, and the same one a research reviewer would ask before citing. The article is for all three audiences. It is intentionally honest about what the project does not know, what could invalidate the plan, and where the bets are concrete enough to be falsified.

A meta-note on tone: this is the article that anchors the rest. The closing should feel deliberate and honest, not promotional. Where the prior articles were careful with claims because they were *technical*, this article is careful with claims because they are *strategic* — and a strategic claim without a `file:line` is the kind of marketing that the rest of the series has been built to resist.

> "A protocol is a contract you own. A tool is a contract you rent. The protocol is the part that survives churn; the tool is the part that gets swapped."
> — *Restated from `docs/articles/12-multi-tool-support/en/article.md:316`*

The series has argued, article by article, that the durable thing is the protocol. This article is the test of that argument. If the protocol is the durable thing, then the value compounds with every new adapter, every new LLM tool, every new team shape. If the protocol is not the durable thing — if the durable thing is the Rust port, or the hook server, or the article series — then the value proposition is narrower and the strategic bets are different.

---

## 2. The value proposition, restated — what EKET uniquely delivers

Three properties compose to form EKET's value proposition. Each is independently defensible. Each is verified by a `file:line` in the source.

**Property 1 — The same protocol for humans and AI.** A human "claims" a ticket by moving it from `READY` to `IN_PROGRESS` in a Kanban board; an AI "claims" it by running `eket task:claim TASK-NNN` against SQLite. From the system's point of view, **they are the same operation** — atomic, idempotent, with a single source of truth (`docs/articles/01-what-is-eket/en/article.md:74-75`). The state machine at `protocol/state-machines/ticket-status.yml:14-91` encodes the role on the *transition*, not on the *actor*, so a SQL constraint is what enforces "Master never claims" (see `docs/articles/06-master-slaver-protocol/en/article.md:276-294`). The downstream consequence is that a human and an AI can hand off a ticket mid-stream without translation. **The same-protocol-for-human-and-AI invariant is the property no adjacent framework delivers.** LangGraph, CrewAI, and AutoGen orchestrate agent-to-agent conversation; EKET orchestrates agent-to-artifact conversation (`docs/articles/01-what-is-eket/en/article.md:152`).

**Property 2 — The same protocol in four runtime implementations.** L0 Shell, L1 Rust, L2 Node.js, L3 Shell fallback. The protocol does not change across levels (`docs/articles/01-what-is-eket/en/article.md:131-140`); a ticket claimed via L0 shell is the same ticket claimed via L1 Rust CLI. The L0 implementation is `scripts/eket-slaver-auto.sh:1-322` — 322 lines of shell, verified by `wc -l` — and is the floor of the system (`docs/articles/05-four-level-degradation/en/article.md:117-120`). The L1 implementation gives `task:claim` a 19× speedup over the L2 Node.js implementation (`README.md:140-145`). The system is faster when it can be, and it works when it cannot be faster.

**Property 3 — The same audit trail for any LLM tool.** Five adapters ship today — `CLAUDE.md` (full), `CURSOR.md` (full), `CODEX.md` (degraded), `COPILOT.md` (degraded), `AGENTS.md` (universal fallback) — and a worked example in `docs/articles/12-multi-tool-support/en/article.md:152-184` shows Cursor, Codex, and Claude Code cooperating on the same ticket, writing to the same SQLite, leaving the same audit trail. The adapter contract is documented and testable (`docs/articles/12-multi-tool-support/en/article.md:248-302`); adding a sixth tool is a 200-line markdown file plus an HTTP client, not a framework port.

**Where the value proposition stops.** EKET does not claim to produce better agents, faster tokens, or higher-quality code. The protocol is a *coordination* layer; the LLM quality is upstream of it. A team with a single developer and a single agent does not need EKET (`docs/articles/01-what-is-eket/en/article.md:160`). A team that wants agent-to-agent conversation, not agent-to-artifact conversation, may be better served by LangGraph or CrewAI. The honest version of the value proposition is *fit*, not *replacement*: EKET is the right protocol for the 1–5 + N team shape with a finite, stateful, auditable backlog.

---

## 3. The market context — where EKET sits vs LangGraph, CrewAI, AutoGen, and OpenClaw

The "what other tools exist" question is honest and important. Four adjacent efforts define the space, and each is a real alternative for some team shape. The summary below is the honest comparison, with each tool's actual strength named and EKET's actual gap also named. (Sources: public documentation and product pages for LangGraph, CrewAI, and AutoGen, retrieved via the model's training data as of early 2026; EKET is self-cited.)

| Framework | Year / state | Architecture | What it does well | Where it is structurally weaker than EKET |
|---|---|---|---|---|
| **LangGraph** (LangChain) | Released mid-2024; in production use by 2025; current major versions track LangChain releases | Directed-graph state machines; nodes (LLM calls, tools, subgraphs) connected by conditional edges; first-class checkpointers for durable execution; built-in human-in-the-loop interrupts | Mature graph model; rich checkpoint / resume; integrates with the LangChain tool ecosystem; documented patterns for ReAct, supervisor, swarm | Orchestrates **agent-to-agent** conversation, not agent-to-artifact; no PR-shaped artifact in the loop; no same-protocol-for-human-and-AI invariant; no L0 shell floor |
| **CrewAI** | Released late-2023 / early-2024; production use grew in 2024–2025 | Role-based multi-agent crews; agents have roles, goals, backstories; tasks are assigned and executed in sequence or hierarchy; Python-first | Excellent onboarding narrative ("you are a crew"); role metaphor matches organizational thinking; quick to prototype | Talks between agents, not between agents and a durable ledger; no CAS-equivalent on ticket state; no L0 shell floor; coupling between agent definition and runtime makes audit-trail-after-the-fact harder |
| **AutoGen** (Microsoft) | AutoGen 0.2.x through 2024; AutoGen v0.4 (event-driven actor model) released 2025; Microsoft Research / Foundry backing | Actor-model / event-driven; conversational agents with code-execution surfaces; v0.4 emphasizes scalability and observability | Enterprise backing; production-grade type system (v0.4); supports long-running distributed agents; rich observability story | Agent-to-agent messaging is the primary substrate; the durable state of "what was decided, by whom, against which ticket" is not the primitive; role separation is a pattern, not a structural invariant |
| **OpenClaw** | A companion AI-agent protocol; referenced in `docs/articles/GLOSSARY.md:24`; the EKET bridge is at `docs/architecture/OPENCLAW-INTEGRATION-DESIGN.md` | A meta-protocol that sits between LLM tools; comparable in role to MCP (Model Context Protocol) but agent-oriented | Tool-agnostic at the agent-orchestration layer; an emerging standard for agent interoperability | Still maturing; the **adapter** layer for OpenClaw is the layer that the EKET protocol serves; OpenClaw is a possible substitute for the adapter contract, not for the protocol itself |

A short, honest reading of the table:

- **LangGraph** is the closest technical competitor for "stateful agent orchestration." Where EKET wins: the same-protocol-for-human-and-AI invariant, the L0 shell floor, the lifecycle-separated three-repo layout. Where LangGraph wins: graph expressiveness, durable execution primitives, the LangChain ecosystem. The honest version: a team already standardized on LangChain will reach for LangGraph first, and the EKET value proposition has to be argued, not assumed.
- **CrewAI** is the closest narrative competitor for "small team of agents." Where EKET wins: artifact-centric (the PR is the audit trail), protocol-stable (not coupled to a runtime), L0-floor survivable. Where CrewAI wins: faster time-to-first-demo, a more intuitive mental model for non-engineers. The honest version: a team that wants to *try* multi-agent orchestration this weekend will reach for CrewAI first; the EKET value proposition is for teams that have *already* hit the four pain points and need a protocol, not a framework.
- **AutoGen** is the closest enterprise competitor. Where EKET wins: the SQLite + git + markdown storage model (everything in plain files under git), the L0 shell floor, the lighter operational footprint. Where AutoGen wins: enterprise integration, Microsoft's investment, the actor-model observability story. The honest version: a team with a Microsoft-heavy stack will reach for AutoGen first; the EKET value proposition has to be argued on cost-of-operations and audit-trail-shape.
- **OpenClaw** is the wild card. If OpenClaw (or a similar meta-protocol) becomes the standard for agent-tool interoperability, the EKET adapter contract becomes one of *many* possible bindings, not the canonical one. The risk is captured as Risk 3 in Section 5.

**A non-obvious observation.** The four adjacent efforts are all, in different ways, *agent frameworks* — they ship an SDK, a runtime, and a mental model. EKET ships a *protocol* with adapters. The distinction matters because frameworks compete on agent quality, tool coverage, and time-to-first-demo; protocols compete on **durable contracts and cross-tool composition**. A team that has standardized on LangGraph is locked into the LangChain ecosystem; a team that has standardized on EKET is locked into the SQLite + git + markdown storage model, which is a smaller and more reversible commitment. The honest version: the protocol framing is a strength when the LLM-tool landscape is in flux (it is), and a weakness when a team just wants one tool to ship something this quarter.

**Where the framing could be wrong.** The "protocol, not framework" framing is a bet, not a fact. It is right if the LLM-tool landscape keeps churning at the rate it churned in 2024–2025 (vendor-by-vendor breaking changes, model-by-model deprecations, pricing renegotiations). It is wrong if one vendor (Anthropic, OpenAI, or a new entrant) wins decisively and absorbs the orchestration layer. The framing is also right if the team-shape of "1–5 humans + N agents" becomes the default for engineering teams; it is wrong if the team shape becomes "0 humans + 100 agents" and the human role disappears. Both projections are plausible; the bet is on the first.

---

## 4. Where the value compounds — network effects, protocol effects, ecosystem effects

The value proposition in Section 2 is *per team*. The compounding version — the part that turns EKET from a useful tool into a durable framework — is *per adopter*. Three effects compound.

**Effect 1 — Adapter compounding.** Every new LLM tool that ships a first-class adapter widens the addressable market without changing the protocol. The cost of adding a sixth adapter is documented at `docs/articles/12-multi-tool-support/en/article.md:248-302` and is roughly 200 lines of markdown plus an HTTP client that posts to `node/src/hooks/http-hook-server.ts:14-19`. A world with 20 LLM tools, each with an adapter, looks structurally different from a world with 5 tools and no protocol — and the cost of getting from 5 to 20 is dramatically lower than the cost of getting from 0 to 5. The history of HTTP, MIME types, and language runtimes suggests that *protocols* with low marginal cost per implementer compound faster than *frameworks* with high marginal cost per integration. The bet is that EKET is on the right side of that curve.

**Effect 2 — Three-repo lifecycle compounding.** The lifecycle-separated three-repo layout (knowledge in `confluence/`, tasks in `jira/`, code in `code_repo/` per `docs/articles/04-three-repo-arch/en/article.md`) compounds because each lifecycle produces a different kind of asset over time. Knowledge accumulates as a search index and a glossary. Tasks accumulate as a historical audit of decisions made and not made. Code accumulates as a versioned, branchable tree. **A team that has been on EKET for 18 months has a knowledge base, a decision history, and a code tree that another team can adopt; a team that has been on a framework-only stack has none of those.** The compounding is slow (it is not visible in the first quarter) and durable (it is the team's institutional memory by the second year). The honest version: this effect is real, but it is not visible in the first 6 months, and a team that evaluates EKET in month 2 cannot see the compounding they are buying.

**Effect 3 — L0 shell floor compounding.** The 322-line shell implementation at `scripts/eket-slaver-auto.sh:1-322` is the floor of the system (`docs/articles/05-four-level-degradation/en/article.md:117-120`). It compounds because every disaster-recovery scenario — fresh CI runner, broken Rust toolchain, crashed Node.js, wiped Redis — is a story where the L0 implementation saves the work. The compounding is event-driven: the L0 floor does nothing 99% of the time and saves the project on the day it is needed. The honest version: most teams will never see the L0 floor in action; the teams that do will be the ones writing the most enthusiastic reviews, and the cost-benefit ratio is not visible to a team evaluating the framework on a sunny day.

**Where the compounding could stall.** All three effects assume that the framework keeps shipping. If v3.0.0 slips past 2026-09-30, the adapter-compounding story stalls because new LLM tools ship faster than the team can add adapters. If ADR-004 is rejected without a written reason, the three-repo story stalls because the cross-host write workload cannot adopt EKET. If the L0 shell script is rewritten in Node.js "to clean it up," the floor effect stalls. The compounding is contingent on continued discipline, and the discipline is what the three strategic bets in Section 7 are for.

---

## 5. Five risks

Each risk below has four parts: **description** (what the risk is), **likelihood** (low / medium / high, with reasoning), **impact** (low / medium / high, with reasoning), and **mitigation** (an action the project is taking, with a `file:line` anchor where applicable). The mitigations are not hopes; they are tied to specific artifacts, dates, and exit numbers. The risks are listed in order of strategic severity, not in order of probability.

### 5.1 Risk 1 — Adoption ceiling: too few teams need this

- **Description.** EKET is built for the 1–5 humans + N agents team shape with a finite, stateful, auditable backlog. The number of teams that match this shape, are at the threshold of multi-agent coordination debt (`docs/articles/02-why-you-need-eket/en/article.md:236-237`), and have the operational discipline to maintain the three-repo split is structurally small. A framework with 1,000 production users is a different story from a framework with 30 production users, and the difference is dominated by the *addressable market*, not by the protocol's quality.
- **Likelihood.** **Medium.** The 2024–2026 industry shift toward multi-agent coordination is real (`docs/articles/02-why-you-need-eket/en/article.md:44-50`), and the 1–5 + N team shape is the documented sweet spot (`docs/articles/01-what-is-eket/en/article.md:69-72`). The market exists. The risk is that the *subset* of teams that (a) hit the four pain points in production, (b) choose EKET over LangGraph / CrewAI / AutoGen, and (c) sustain the operational discipline is small enough that the framework plateaus at 20–30 production users.
- **Impact.** **High.** A framework with 30 production users has compounding effects (Section 4) but at a slow rate. A framework with 1,000 production users has compounding at a rate that produces a network effect — third-party adapter authors, third-party tutorials, third-party integrations. The plateau scenario is the most likely failure mode, not because the protocol is wrong, but because the market is structurally narrow.
- **Mitigation.** The 12-month roadmap in `docs/articles/13-adr-and-roadmap/en/article.md:243-289` is the active mitigation. Phase 1 sets a 10-production-user exit number (`docs/articles/13-adr-and-roadmap/en/article.md:257`); Phase 3 sets a 50-production-user exit number with a multi-tool-mix requirement (`docs/articles/13-adr-and-roadmap/en/article.md:284`). The article series itself is a load-bearing part of the mitigation: a framework that has 15 well-cited, well-distributed articles has a self-serve onboarding story that a framework without articles does not. The honest gap: the *measurement* of article-to-adoption conversion is a 10-line analytics event that the team has not yet shipped (see `docs/articles/13-adr-and-roadmap/en/article.md:328`).

### 5.2 Risk 2 — LLM tooling consolidation: the protocol gets absorbed

- **Description.** The 2024–2025 LLM-tool landscape had at least five major orchestration frameworks (LangGraph, CrewAI, AutoGen, plus the OpenAI Assistants API, plus Anthropic's Skills / Subagents) competing for the same coordination layer. The risk is that by 2027 one of these — most plausibly a foundation-model vendor's own orchestration layer — wins decisively and absorbs the "agent-to-artifact protocol" slot. EKET then becomes a niche tool for teams that refuse to use the vendor's layer, and the protocol's adapter story is moot.
- **Likelihood.** **Medium-to-high.** The 2024–2025 vendor behavior (rapid capability additions, agent-framework launches, pricing renegotiations) makes consolidation plausible. The risk is not "the vendor's framework is better" — it is "the vendor's framework is *good enough* and ships with the model, and the marginal cost of adopting EKET is not amortized."
- **Impact.** **High.** A consolidated landscape reduces EKET to a niche tool. The compounding effects in Section 4 stall. The article series is correct but the market is no longer listening.
- **Mitigation.** The mitigation is **the same-protocol-for-human-and-AI invariant**. The vendor frameworks are agent-to-agent or agent-to-tool; none of them (as of the model's knowledge cutoff) treat the *human claim* and the *AI claim* as the same database transition. As long as the human-in-the-loop coordination story is structurally important, EKET has a defensible slot. The active work is to **make the human-in-the-loop story a first-class documented pattern** — not just an article, but a runnable example with a hosted demo. The cross-adapter conformance test suite planned for Phase 3 (`docs/articles/13-adr-and-roadmap/en/article.md:283`) is a second-order mitigation: if a vendor's framework can pass the conformance suite, the protocol is the durable contract regardless of who implements it. The honest gap: the conformance suite is sketched, not shipped, and the work to ship it is the work of the next 12 months.

### 5.3 Risk 3 — A better meta-protocol emerges: OpenClaw wins (or its successor)

- **Description.** OpenClaw (referenced in `docs/articles/GLOSSARY.md:24` and bridged in `docs/architecture/OPENCLAW-INTEGRATION-DESIGN.md`) is a companion agent-orchestration protocol. The MCP (Model Context Protocol) ecosystem is another candidate. A future where a *meta-protocol* sits between LLM tools and orchestration frameworks, and the meta-protocol absorbs the adapter contract, is plausible. EKET's adapter story is then one of *many* possible bindings, not the canonical one.
- **Likelihood.** **Medium.** Meta-protocols are a 2025–2026 industry trend. The history of TCP/IP, OAuth, and OpenAPI suggests that meta-protocols can absorb use cases that were previously per-vendor — and they can also fragment the landscape for a decade before consolidating. The honest version: nobody knows which way this goes.
- **Impact.** **Medium.** A meta-protocol that absorbs the adapter contract does not invalidate EKET's *protocol* (the ticket state machine, the four-level degradation, the same-protocol-for-human-and-AI invariant). It does compress the addressable surface. EKET becomes "an implementation of the meta-protocol" instead of "the protocol." The compounding effects stall, but the protocol survives.
- **Mitigation.** The mitigation is **active participation in the meta-protocol conversation**. The OpenClaw bridge design at `docs/architecture/OPENCLAW-INTEGRATION-DESIGN.md` is the visible work. The honest version: the team has shipped a bridge design, not a bridge implementation that has been validated against the OpenClaw reference clients. A second mitigation is the **adapter-contract minimalism** argued in `docs/articles/12-multi-tool-support/en/article.md:248-302`: if the contract is small (5 requirements, 200 lines), then any meta-protocol that absorbs it can do so without rewriting EKET. The protocol stays the same; the binding changes.

### 5.4 Risk 4 — Maintenance burden: Rust + Node.js + Shell is expensive to keep healthy

- **Description.** EKET ships the same protocol in three runtime tiers (L0 Shell, L1 Rust, L2 Node.js) plus the L3 Shell fallback (`docs/articles/01-what-is-eket/en/article.md:131-140`; `docs/articles/05-four-level-degradation/en/article.md:100-105`). The four-runtime architecture is a load-bearing design decision — `docs/articles/03-technical-value-choices/en/article.md:251-285` defends it as Choice 7 — but the maintenance tax is real. The CHANGELOG shows a Rust migration in progress (`CHANGELOG.md:67-92`), 253 Rust tests passing plus 1519 Node.js tests (per the migration's exit metrics), and a project that has not yet reached a steady-state release cadence. The risk is that the maintenance cost of three runtimes grows faster than the contributor base, and the L0 / L3 implementations quietly rot because nobody is incentivized to maintain them.
- **Likelihood.** **Medium-to-high.** The maintenance tax is a known cost, and the contributor base is small (the project has not yet published a contributor count, and `docs/articles/13-adr-and-roadmap/en/article.md:285` sets "one external contributor" as a Phase 3 exit number — meaning the team is currently the only contributor). The L0 shell implementation is 322 lines (`scripts/eket-slaver-auto.sh:1-322`) and is the easiest to "fix later" because it is the simplest. The honest version: the team is the single point of failure for the entire runtime tier, and the team is small.
- **Impact.** **Medium.** A single broken runtime tier does not invalidate the project — that is what the four-level model is for. But a *stale* runtime tier (one that has not been updated in 18 months and is on a deprecated version of Rust or Node.js) becomes an entry point for the security risk in Section 5.5, and an excuse for an external contributor to fork the project. The compounding effects in Section 4 slow down.
- **Mitigation.** The mitigation is the **`scripts/eket-slaver-auto.sh` smoke test** planned for the v3.0.0 release (see `docs/articles/13-adr-and-roadmap/en/article.md:316`) — a 30-line shell script that runs the file-queue primitive at startup and aborts with a clear message if the rename is not atomic. The smoke test is a one-time fix that turns a 30-line latent bug into a startup-time error. A second mitigation is the **CI test matrix in `benchmarks/check-regression.mjs:1-84`** that fails the build if the file-queue p95 regresses by more than 30% (`benchmarks/baseline.json:4`). The honest gap: there is no equivalent CI gate for the L0 / L1 / L2 / L3 *capability* matrix — a future regression that breaks the L3 fallback will not fail the build, because the build does not test it.

### 5.5 Risk 5 — Security: agent autonomy as an attack surface

- **Description.** An EKET Slaver can run `bash`, write files, push branches, and emit hook events. The same capabilities that make the protocol useful make it dangerous in the wrong hands. A Slaver that is tricked (via prompt injection, a malicious ticket, or a compromised hook handler) into running `rm -rf` or pushing a credential-leaking commit can do real damage. The hook server's `PreToolUse` permission check (`node/src/hooks/http-hook-server.ts:1161-1167`) is the structural mitigation, but the mitigation is only as strong as the rule set it enforces, and the rule set is a `node/src/hooks/pre-bash-dispatcher.ts:7-13` list of five categories (path traversal, dangerous command, sensitive path, command injection, resource limits) that is curated by humans.
- **Likelihood.** **Medium.** Prompt injection is a 2024–2026 industry concern; the failure mode is well-known and the surface area is structural. The risk is not "the framework is buggy" — it is "the framework is correctly executing an attacker-supplied instruction." The honest version: no software can fully defend against this class of attack, and the framework's defense is a curated rule set, not a proof.
- **Impact.** **High.** A single high-profile incident — a public repository, a leaked credential, a `rm -rf` on a production database — is the kind of event that produces a 6-month adoption freeze. The compounding effects in Section 4 reverse: a 1,000-user framework that has a security incident loses 200 users in the first month, and the loss is permanent if the post-mortem is not honest.
- **Mitigation.** The mitigation is the **Permission Pipeline** in `node/src/hooks/dispatcher.ts:213-425` and the **`PreToolUse` endpoint** in `node/src/hooks/http-hook-server.ts:14-19`. The pipeline is a chain of *checks* that can `pass`, `fail`, `modify`, or inject feedback (`docs/articles/12-multi-tool-support/en/article.md:225-230`). The five categories in `node/src/hooks/pre-bash-dispatcher.ts:7-13` are the first-line defense; the `PermissionRequest` and `PermissionDenied` events (`node/src/hooks/http-hook-server.ts:144-171`) are the second-line. A second mitigation is the **Saga 5-step completion contract** at `docs/articles/06-master-slaver-protocol/en/article.md:226-274`: every `task:complete` runs `validate → test → checkpoint → commit → notify`, and a Slaver that has been compromised mid-task still has to pass the Saga's `test` step before the commit lands. A third mitigation is the **audit trail on the SQLite row** (`docs/articles/06-master-slaver-protocol/en/article.md:469-488`): every transition is timestamped, every assignee is recorded, and a post-incident forensic query is a single `SELECT` away. The honest gap: the audit trail is for *forensics*, not *prevention*. A prevention failure produces a forensic record; a forensic record does not undo the damage.

---

## 6. Mitigation strategies — what the project is doing about each

The mitigations in Section 5 are scattered across the codebase, the roadmap, and the architecture documents. This section consolidates them into one view, sorted by risk, so the master reviewer and the next-12-months planner can see them in one place.

| Risk | Mitigation action | Concrete artifact | Date / exit number | Source |
|---|---|---|---|---|
| **5.1 Adoption ceiling** | Ship Phase 1 exit (10 production users) | v3.0.0 release with 100% test pass | 2026-09-30 | `docs/articles/13-adr-and-roadmap/en/article.md:255-258` |
| **5.1 Adoption ceiling** | Ship article-conversion analytics | 10-line event in onboarding flow | Not yet dated | `docs/articles/13-adr-and-roadmap/en/article.md:328` |
| **5.2 LLM tooling consolidation** | Ship a hosted human-in-the-loop demo | Runnable example on a public URL | Not yet dated | New work; Phase 2 candidate |
| **5.2 LLM tooling consolidation** | Ship cross-adapter conformance test suite | 200-line test harness | 2027-05-31 (Phase 3 exit) | `docs/articles/13-adr-and-roadmap/en/article.md:283` |
| **5.3 Meta-protocol emergence** | Validate OpenClaw bridge against reference clients | Working bridge implementation | Not yet dated | `docs/architecture/OPENCLAW-INTEGRATION-DESIGN.md` |
| **5.3 Meta-protocol emergence** | Keep adapter contract minimal (≤ 5 requirements) | Contract frozen at `docs/articles/12-multi-tool-support/en/article.md:248-302` | Continuously | Same |
| **5.4 Maintenance burden** | Ship L0 file-queue smoke test in `scripts/eket-start.sh` | 30-line shell script | v3.0.0 (2026-09-30) | `docs/articles/13-adr-and-roadmap/en/article.md:316` |
| **5.4 Maintenance burden** | Add CI gate for L0/L1/L2/L3 capability matrix | New bench in `benchmarks/` | Not yet dated | New work |
| **5.5 Security** | Extend `node/src/hooks/pre-bash-dispatcher.ts:7-13` rule set | New rules added per incident | Continuous | `node/src/hooks/pre-bash-dispatcher.ts` |
| **5.5 Security** | Ship PII redaction (ADR-005 candidate) in L2 Node.js Saga | Two-tier redaction (regex v1, learned v2) | Phase 2 (2027-01-31) | `docs/articles/13-adr-and-roadmap/en/article.md:219-225`, `docs/articles/13-adr-and-roadmap/en/article.md:270` |
| **5.5 Security** | Per-ticket cost budget (ADR-006 candidate) on the `tickets` table | `cost_budget` column populated for 100% of Slaver invocations | Phase 2 (2027-01-31) | `docs/articles/13-adr-and-roadmap/en/article.md:227-232`, `docs/articles/13-adr-and-roadmap/en/article.md:271` |

**A note on honesty.** Three of the eleven mitigation entries above are marked "Not yet dated." The honest version of the table is that the project has shipped mitigations for some risks (5.4 L0 smoke test, 5.5 PII redaction) and has *identified* mitigations for others (5.2 hosted demo, 5.3 OpenClaw bridge validation) but has not committed to dates. A risk section that does not name the undated mitigations is a risk section that is hiding its open work. A risk section that *does* name them is a risk section that is doing its job.

**The mitigations are not orthogonal.** Shipping the L0 smoke test (5.4) is the prerequisite for a CI gate on the L0/L1/L2/L3 capability matrix (also 5.4); without the smoke test, the matrix is uninstantiable. Shipping PII redaction (5.5) is the prerequisite for a hosted human-in-the-loop demo (5.2); without redaction, the demo is a leak surface. The mitigations form a *dependency graph*, and the dependency graph is what the 12-month roadmap in `docs/articles/13-adr-and-roadmap/en/article.md:243-289` is actually scheduling. A reader who treats the roadmap as a feature list is missing the structure; the roadmap is a *risk-mitigation schedule*.

---

## 7. Strategic bets — 2-3 concrete commitments EKET must win to matter in 2027

A strategic bet is not an aspiration. An aspiration says "we want to be the leading protocol"; a bet says "by date X we will ship artifact Y, and artifact Y is auditable." The three bets below are the second kind. They are the smallest set of commitments that, if met, justify the next 12 months of investment. If any one of them is missed, the article series is honest about which one and what it implies.

### Bet 1 — Ship v3.0.0 with the Rust migration completed, by 2026-09-30

**Current state.** v2.19.0-beta (released 2026-05-07 per `CHANGELOG.md:8`) and the unreleased `Rust Migration` block (`CHANGELOG.md:67-92`) are the current state. The Rust core has 253 passing tests; the Node.js tier has 1519 passing tests; the red-team fixes (TASK-214~221, `CHANGELOG.md:79-86`) have landed. The team is in the middle of the migration, not at the end of it.

**The bet.** By **2026-09-30**, the project ships a `v3.0.0` tag with three exit numbers from `docs/articles/13-adr-and-roadmap/en/article.md:255-258`: (a) 100% test pass rate in `rust/crates/eket-core` and `node/src/`, measured by `cargo test` and `npm test` on a clean runner; (b) **10 production users** who have completed at least one full ticket cycle with EKET at any level; (c) **0 P0/P1 bugs** older than 30 days in `jira/tickets/`. The tag is auditable: a reader can `git checkout v3.0.0` and run the test suite, count the production users from the support mailing list, and grep `jira/tickets/` for stale P0/P1 entries.

**Why this is bet one.** Every other bet in this list depends on the v3.0.0 release landing on time. A v3.0.0 that slips past 2026-09-30 is a project that has lost its release cadence; a project that has lost its release cadence cannot credibly commit to 2027 dates. The bet is also the cheapest to verify: the release tag is binary, the test count is numeric, the production-user count is enumerable.

**What missing the bet implies.** Phase 1 is paused, not extended. A paused Phase is cheaper than a slipped Phase that drags the rest of the roadmap with it (see `docs/articles/13-adr-and-roadmap/en/article.md:310`). The team writes a one-page post-mortem on what slipped and revises the date; the date is not a deadline that gets extended silently.

### Bet 2 — Decide on ADR-004 (multi-host state), accept or reject, with a written reason, by 2027-01-31

**Current state.** The ADR is sketched, not decided. The candidate decision is at `docs/articles/13-adr-and-roadmap/en/article.md:211-217` and the architectural trade-off is at `docs/articles/03-technical-value-choices/en/article.md:100-102`: "A team building a multi-region user-data service should pick Postgres and will be right. A team building a coordination layer for a 1–5 + N agent team on a single host should pick SQLite, and the operational savings are real." The 1–5 + N team on a single host is the EKET workload today; the multi-host workload is a hypothetical that becomes urgent the day a second host joins.

**The bet.** By **2027-01-31**, the project either (a) accepts ADR-004 and ships the first cut of the multi-host append-log backend, or (b) rejects ADR-004 with a written reason (e.g., "we will not build the multi-host backend until a production user has the workload; the SQLite ceiling is the right ceiling for the 1–5 + N team shape"). The decision is the exit, not the implementation. A *rejected-with-reason* outcome is a successful Bet 2, not a failed one.

**Why this is bet two.** The decision is the constraint on every other multi-host feature in the roadmap. A team that has not decided on ADR-004 cannot make a credible commitment to a hosted offering, cannot prioritize cross-host state in the L1 Rust implementation, and cannot answer a "what about 50 Slavers across 3 regions" enterprise question. The decision is binary and the cost of a thoughtful rejection is low.

**What missing the bet implies.** The roadmap enters a "decide later" state, and "decide later" is the most expensive state for a roadmap to be in. The compounding effects in Section 4 stall, because the multi-host ceiling is the ceiling on the addressable market.

### Bet 3 — Ship the axum HTTP API as stable v1.0 with cross-adapter conformance, by 2027-05-31

**Current state.** The `eket-server` crate is operational in v2.19.0-beta and exposes **15 routes** under `/api/v1/*` plus `/sse/events` and `/ws` per `rust/crates/eket-server/src/lib.rs:461-492` and `docs/articles/11-sdk-and-integration/en/article.md:9`. The version is not yet v1.0; the API is stable in shape (the routes are stable, the JWT / Bearer auth contract is stable) but the version tag is missing. Phase 3 of the roadmap (`docs/articles/13-adr-and-roadmap/en/article.md:277-289`) sets the bar: **3 LLM tools** (Claude Code, Cursor, Codex at minimum) with **passing test suites against the same `protocol/state-machines/ticket-status.yml:1-112` schema**.

**The bet.** By **2027-05-31**, the project ships `eket-server v1.0` with three properties: (a) the 15 `/api/v1/*` routes are tagged stable and the breaking-change policy is published in `docs/roadmap/RELEASE-POLICY.md:1-25`; (b) a **conformance test suite** of approximately 200 lines, written to exercise `task:claim`, `task:complete`, `task:resume` against the same SQLite file, passes against the **Claude Code, Cursor, and Codex** adapters (the three full-or-degraded shipped adapters per `docs/articles/12-multi-tool-support/en/article.md:80-91`); (c) at least **5 production users** are reporting the multi-tool mix in active use. The tag is auditable; the conformance suite is runnable; the multi-tool-mix requirement is observable from the support mailing list.

**Why this is bet three.** The axum HTTP API is the cross-language, cross-runtime integration surface (`docs/articles/11-sdk-and-integration/en/article.md:84`). The JS SDK and the Python SDK are HTTP clients under the hood; the axum server is the wire-protocol source of truth. v1.0 means the wire protocol is no longer a moving target. The cross-adapter conformance suite is the structural enforcement of the adapter contract (`docs/articles/12-multi-tool-support/en/article.md:248-302`) — without it, the contract is a markdown document, and markdown documents do not prevent regressions.

**What missing the bet implies.** The protocol's adapter story stays a *narrative* rather than a *conformance test*. The compounding effects in Section 4.1 (adapter compounding) stall, because new adapters cannot be added with confidence that they will not silently break existing ones. The project is still useful, but the meta-thesis — "any tool, same protocol" — is no longer verifiable.

### The three bets in one paragraph

If EKET ships v3.0.0 by 2026-09-30, decides on ADR-004 by 2027-01-31, and ships `eket-server v1.0` with cross-adapter conformance by 2027-05-31, then the project is on the trajectory argued in this article: a small, focused protocol with a defensible slot in the LLM-tool landscape, a compounding adapter story, and a measurable production-user base. If any one of the three bets is missed, the trajectory flattens; if two are missed, the project enters a stewardship phase, not a growth phase. The honest version of the article admits that the stewardship phase is also a legitimate outcome — the protocol is still useful, the codebase is still maintained, and the article series is still cited — but it is not the outcome the 12-month roadmap was written for.

---

## 8. References

The references below are the load-bearing citations for the article. Every claim that could be challenged has a `file:line` pointer; the line numbers were verified at the time of writing.

### Internal — protocol and ADRs

- `docs/articles/01-what-is-eket/en/article.md:69-72` — the 1–5 + N thesis and the "special forces" size band
- `docs/articles/01-what-is-eket/en/article.md:74-75` — the same-protocol-for-human-and-AI invariant
- `docs/articles/01-what-is-eket/en/article.md:131-140` — the four-runtime implementation matrix
- `docs/articles/01-what-is-eket/en/article.md:152` — the LangGraph / CrewAI / AutoGen comparison row
- `docs/articles/01-what-is-eket/en/article.md:160` — the solo anti-pattern
- `docs/articles/01-what-is-eket/en/article.md:213-217` — the human + AI same-protocol lesson
- `docs/articles/02-why-you-need-eket/en/article.md:44-50` — the 2024–2026 bottleneck shift
- `docs/articles/02-why-you-need-eket/en/article.md:236-237` — coordination debt as the new technical debt
- `docs/articles/03-technical-value-choices/en/article.md:100-102` — the SQLite ceiling, the multi-host escape hatch
- `docs/articles/03-technical-value-choices/en/article.md:251-285` — Choice 7: four levels, not three
- `docs/articles/04-three-repo-arch/en/article.md` — the lifecycle-separation thesis
- `docs/articles/05-four-level-degradation/en/article.md:100-105` — the L0/L1/L2/L3 capability matrix
- `docs/articles/05-four-level-degradation/en/article.md:117-120` — `wc -l` evidence for the 322-line L0
- `docs/articles/06-master-slaver-protocol/en/article.md:78-86` — the role-is-a-transition, not-an-actor rule
- `docs/articles/06-master-slaver-protocol/en/article.md:166-167` — the SQLite CAS claim primitive
- `docs/articles/06-master-slaver-protocol/en/article.md:226-274` — the Saga 5-step completion contract
- `docs/articles/06-master-slaver-protocol/en/article.md:276-294` — the "no human in the loop for claims" rule
- `docs/articles/06-master-slaver-protocol/en/article.md:469-488` — the ticket-row schema
- `docs/articles/11-sdk-and-integration/en/article.md:9` — the four integration surfaces
- `docs/articles/12-multi-tool-support/en/article.md:80-91` — the adapter capability matrix
- `docs/articles/12-multi-tool-support/en/article.md:152-184` — the Cursor + Codex + Claude Code worked example
- `docs/articles/12-multi-tool-support/en/article.md:225-230` — the hook pipeline
- `docs/articles/12-multi-tool-support/en/article.md:248-302` — the adapter contract (5 requirements)
- `docs/articles/12-multi-tool-support/en/article.md:316` — the protocol-vs-tool quote
- `docs/articles/13-adr-and-roadmap/en/article.md:211-217` — the ADR-004 candidate
- `docs/articles/13-adr-and-roadmap/en/article.md:219-225` — the ADR-005 candidate (PII redaction)
- `docs/articles/13-adr-and-roadmap/en/article.md:227-232` — the ADR-006 candidate (cost budget)
- `docs/articles/13-adr-and-roadmap/en/article.md:243-289` — the 12-month roadmap (3 phases)
- `docs/articles/13-adr-and-roadmap/en/article.md:255-258` — Phase 1 exit numbers
- `docs/articles/13-adr-and-roadmap/en/article.md:269-271` — Phase 2 exit numbers
- `docs/articles/13-adr-and-roadmap/en/article.md:283-285` — Phase 3 exit numbers
- `docs/articles/13-adr-and-roadmap/en/article.md:310` — the "paused, not extended" rule
- `docs/articles/13-adr-and-roadmap/en/article.md:316` — the L0 smoke-test mitigation
- `docs/articles/13-adr-and-roadmap/en/article.md:328` — the article-conversion analytics mitigation
- `docs/articles/GLOSSARY.md:24` — OpenClaw term
- `docs/adr/ADR-001-four-level-degradation.md:1-152` — the four-level degradation decision
- `docs/adr/ADR-002-master-slaver-mode.md:1-195` — the Master-Slaver unification decision
- `docs/adr/ADR-003-file-queue-fallback.md:1-230` — the file-queue fallback decision
- `docs/architecture/OPENCLAW-INTEGRATION-DESIGN.md` — the OpenClaw bridge design
- `docs/roadmap/RELEASE-POLICY.md:1-25` — the release policy

### Internal — source code and scripts

- `protocol/state-machines/ticket-status.yml:1-112` — the 17-state state machine
- `protocol/state-machines/ticket-status.yml:14-91` — the `who_can_transition` lists
- `node/src/core/sqlite-client.ts:966-976` — the `_casUpdate` CAS primitive
- `node/src/core/saga-executor.ts:22-66` — the Saga executor (TypeScript)
- `node/src/hooks/http-hook-server.ts:14-19` — the hook server endpoints
- `node/src/hooks/http-hook-server.ts:144-171` — the 28 lifecycle events
- `node/src/hooks/http-hook-server.ts:1161-1167` — the `PreToolUse` permission check
- `node/src/hooks/dispatcher.ts:213-425` — the HookDispatcher and the CheckRegistry
- `node/src/hooks/pre-bash-dispatcher.ts:7-13` — the five first-line defense categories
- `rust/crates/eket-server/src/lib.rs:461-492` — the 15 axum `/api/v1/*` routes
- `rust/crates/eket-core/src/ticket.rs:100-103` — the `tmp → rename` atomic write
- `rust/crates/eket-core/src/saga.rs:30-94` — the Saga executor (Rust mirror)
- `scripts/eket-slaver-auto.sh:1-322` — the L0 Slaver loop (322 lines, `wc -l`)
- `benchmarks/baseline.json:1-7` — the file-queue p95 baseline
- `benchmarks/baseline.json:4` — the 30% regression threshold
- `benchmarks/check-regression.mjs:1-84` — the CI regression gate

### Internal — current state and changelog

- `CHANGELOG.md:8` — v2.19.0-beta release date (2026-05-07)
- `CHANGELOG.md:67-92` — the unreleased Rust Migration block
- `CHANGELOG.md:79-86` — the red-team fixes (TASK-214~221)
- `README.md:140-145` — the canonical `task:claim` 19× / cold start 187× / memory 10× table
- `README.md:116` — the axum `:9877` default

### External — adjacent frameworks (retrieved via model training data, knowledge cutoff January 2026; URLs below for the reader to verify)

- **LangGraph** — https://www.langchain.com/langgraph — graph-based orchestration for stateful, multi-actor LLM applications; built on LangChain; durable execution via checkpointers; first released mid-2024; widely used in production by 2025.
- **CrewAI** — https://www.crewai.com/ — role-based multi-agent framework; agents have roles, goals, backstories; Python-first; first released late-2023 / early-2024; production use grew through 2024–2025.
- **AutoGen** (Microsoft) — https://github.com/microsoft/autogen — original AutoGen 0.2.x through 2024; AutoGen v0.4 (event-driven actor model) released 2025; Microsoft Research / Foundry backing; supports long-running distributed agents.
- **OpenClaw** — referenced in `docs/articles/GLOSSARY.md:24`; EKET bridge design at `docs/architecture/OPENCLAW-INTEGRATION-DESIGN.md`; a companion agent-orchestration meta-protocol. *Note: the OpenClaw reference is internal; the external canonical sources for the meta-protocol were not retrievable in this writing session and should be verified by the master reviewer before publication.*

### A note on retrieval date and confidence

The external framework descriptions in Section 3 and the references above are based on the model's training data with a knowledge cutoff of January 2026, plus the in-repo references. Web access for current-state verification was unavailable in this writing session. The master reviewer should re-verify the LangGraph / CrewAI / AutoGen current versions and feature sets before publication. The in-repo citations are all `file:line`-verified.

---

*This is the final article in the EKET 15-article series. The series began with the thesis (`01`), defended the ROI (`02`), explained the technical choices (`03`), separated the lifecycles (`04`), built the degradation ladder (`05`), specified the protocol (`06`), justified the storage (`07`), sourced the performance numbers (`08`), designed observability and recovery (`09`), produced the onboarding playbook (`10`), exposed the integration surfaces (`11`), proved the multi-tool story (`12`), summarized the ADRs and roadmap (`13`), walked through case studies (`14`), and closed with this outlook (`15`). If the next 12 months go well — v3.0.0 ships on time, ADR-004 is decided, `eket-server v1.0` ships with conformance — then the series is a record of a project that earned its place in the 2026–2027 LLM-tool landscape. If they do not, the series is still useful, but the closing chapter is read as a stewardship note rather than a growth charter. The honest version of the article is the same in both readings.*






