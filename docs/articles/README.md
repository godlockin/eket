# EKET Article Series

> A 15-article, dual-language deep dive into the EKET framework — written for both decision-makers and developers.

**Repository:** [`git.build.ingka.ikea.com/china-digital-hub/eket`](https://git.build.ingka.ikea.com/china-digital-hub/eket) (internal, Ingka China Digital Hub)

## What this is

This is **not** documentation. Documentation tells you *how* to use EKET (see `docs/architecture/` for that).

This is a **series of essays** explaining *why* EKET exists, *how* its pieces fit together, and *what* you can learn from it. Each article targets **two audiences in one document**: a one-page executive summary for decision-makers, followed by technical depth for engineers.

## How to read

| If you are a... | Read in this order | Time budget |
|---|---|---|
| **Engineering manager / decision-maker** | 00 → 01 → 02 → 13 → 15 | ~45 min for the headlines |
| **Senior engineer / architect** | 01 → 03 → 05 → 06 → 07 → 08 → 09 | ~2 hours for the deep cuts |
| **New Slaver onboarding** | 00 → 01 → 10 → 12 | ~1 hour, then start `eket task:claim` |
| **Researcher studying AI orchestration** | 01 → 04 → 06 → 07 → 13 → 15 | ~2.5 hours, full thesis |

## Series map

| Volume | Theme | Articles |
|---|---|---|
| **Vol. 1 — Foundation & Vision** | The thesis, the value, the worldview | 01, 02 |
| **Vol. 2 — Architecture Deep Dive** | The pillars that make the protocol work | 03, 04, 05, 06, 07 |
| **Vol. 3 — Engineering in Practice** | The day-to-day, the performance, the recovery | 08, 09, 10, 11 |
| **Vol. 4 — Ecosystem & Future** | Where it connects, where it's going, where it might break | 12, 13, 14, 15 |

See [`INDEX.md`](./INDEX.md) for the full table of contents, status, and word counts.

## Languages

Each article ships in two independent files:

- `en/article.md` — English original
- `zh-CN/article.md` — Chinese version (written, not machine-translated)

Both are first-class deliverables.

## Conventions

- All file-path references use the form `path/to/file.ext:line` so they are clickable in GitHub.
- Every article has the same seven-section structure. See `00-foreword/` for the template.
- Shared terms live in [`GLOSSARY.md`](./GLOSSARY.md).
- Diagrams live in `assets/diagrams/` and are referenced from multiple articles.

## How this series is produced

- Master (`Claude Code`, role: master) designs the outline and writes the sample.
- Slavers (specialized agents) draft articles in parallel; the same agent handles the EN and ZH versions to keep voice consistent.
- Master reviews, merges, and updates the `INDEX.md` status field.
- See `template/docs/MASTER-RULES.md` and `template/docs/SLAVER-RULES.md` for the production protocol.

---

> **Status:** Sample article (`01-what-is-eket`) complete. The other 14 are queued in the EPIC.
