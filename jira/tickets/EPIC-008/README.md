# EPIC-008: EKET Article Series (15 Articles, Bilingual)

**Status**: 🔵 In progress (1/15 done — sample shipped)
**Owner**: Master (Claude Code)
**Started**: 2026-06-04
**Target**: 15 articles × 2 languages = 30 markdown files + supporting docs

---

## Goal

Produce a 15-article, dual-language deep-dive series explaining the EKET framework to both decision-makers and developers. The series is the public-facing commentary layer on top of the existing architecture documentation in `docs/architecture/`.

## Output

```
docs/articles/
├── README.md                 ✅ Shipped
├── INDEX.md                  ✅ Shipped
├── GLOSSARY.md               ✅ Shipped
├── 00-foreword/{en,zh-CN}/   ✅ Shipped
├── 01-what-is-eket/{en,zh-CN}/  ✅ Shipped (sample / quality benchmark)
├── 02-…15…/{en,zh-CN}/       ⚪ Queued (14 articles)
└── assets/diagrams/          ⚪ To be populated as articles land
```

## Series map (15 articles, 4 volumes)

| Vol | Theme | Articles |
|---|---|---|
| 1 | Foundation & Vision | 01 (done), 02 |
| 2 | Architecture Deep Dive | 03, 04, 05, 06, 07 |
| 3 | Engineering in Practice | 08, 09, 10, 11 |
| 4 | Ecosystem & Future | 12, 13, 14, 15 |

## Quality benchmark

`01-what-is-eket/{en,zh-CN}/article.md` is the reference for:
- Voice (informative, evidence-based, dual-audience)
- Structure (7-section template: Exec Summary / Motivation / Big Idea / How / Trade-offs / Implementation / Lessons)
- Citation style (`path/to/file.ext:line` references, GitHub-clickable)
- Length (~2,200 words EN / ~2,400 字 ZH)
- Bilingual parity (independent, not machine-translated)

## Production rules

1. Every article must ship in both EN and ZH-CN.
2. Every claim must cite a source file with `file:line` format.
3. Every new term must be added to `GLOSSARY.md`.
4. `INDEX.md` status field must be updated as each article lands.
5. Master reviews every article before status moves to 🟢 Done.

## Tickets

| Ticket | Article | Priority | Estimate |
|---|---|---|---|
| TASK-638 | 02-why-you-need-eket | P1 | 6h |
| TASK-639 | 03-technical-value-choices | P2 | 7h |
| TASK-640 | 04-three-repo-arch | P2 | 6h |
| TASK-641 | 05-four-level-degradation | P1 | 7h |
| TASK-642 | 06-master-slaver-protocol | P1 | 8h |
| TASK-643 | 07-storage-and-events | P2 | 7h |
| TASK-644 | 08-rust-performance | P2 | 6h |
| TASK-645 | 09-observability-recovery | P3 | 5h |
| TASK-646 | 10-onboarding-playbook | P3 | 4h |
| TASK-647 | 11-sdk-and-integration | P3 | 5h |
| TASK-648 | 12-multi-tool-support | P3 | 5h |
| TASK-649 | 13-adr-and-roadmap | P2 | 6h |
| TASK-650 | 14-case-studies | P3 | 5h |
| TASK-651 | 15-outlook-risks | P1 | 7h |

## Dependencies

- All tickets depend on `01-what-is-eket` (sample benchmark) ✅
- Articles cross-reference each other; writers should update `INDEX.md` "Status" field as they land

## Definition of done

- All 14 articles 🟢 Done in `INDEX.md`
- All `file:line` references in every article validated against current source
- A final read-through by Master; "Definition of done" section in `README.md` updated

---

**Master sign-off target:** when all 14 articles reach 🟢 Done.
