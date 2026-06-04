# TASK-650: Article 14 — Case Studies

**Epic**: EPIC-008-articles-series
**Priority**: P3
**Status**: ⚪ Queued
**Estimate**: 5h
**Agent Type**: tech-writer (narrative-track)
**Category**: 📝 Documentation
**Languages**: EN + ZH-CN

---

## Goal

Write article **14 — Case Studies: CI Self-Repair, Multi-Agent Blog, Parallel PR Review** in both languages.

This article turns abstract protocol descriptions into **3 concrete end-to-end stories**. The reader should be able to imagine their own use case after reading.

## Outline

1. **Case study selection criteria** — what makes a good case
2. **Case 1 — CI self-repair** — agent reads failed CI log, claims ticket, fixes, opens PR
3. **Case 2 — Multi-agent blog writing** — 3 agents parallel-draft 3 sections, Master assembles
4. **Case 3 — Parallel PR review** — N reviewers on N PRs with conflict-free merging
5. **What they have in common** — the protocol invariants that made them work
6. **What they don't show** — failure cases (a "case 4" that didn't work)
7. **Your case** — template for writing up your own

## Required reading

- `docs/articles/01-what-is-eket/{en,zh-CN}/article.md` — sample
- `examples/e2e-collaboration/`
- `examples/workflows/`
- `inbox/human_input.md` (3.8K)
- `benchmarks/multi-agent-eval/`
- Real tickets from `jira/tickets/` (pick 2-3 illustrative ones)

## Acceptance Criteria

- **AC-1**: Both languages, ≥ 2,000 words / ≥ 2,000 字
- **AC-2**: All 3 case studies include: setup, sequence, outcome, lessons
- **AC-3**: ≥ 5 source citations
- **AC-4**: "What they have in common" section extracts 2-3 invariants
- **AC-5**: Includes a "case that didn't work" — failure transparency
- **AC-6**: "Your case" template is copy-paste-runnable
- **AC-7**: `INDEX.md` updated

## Review criteria

- Are the cases concrete (named tickets, real commands, real outcomes)?
- Does the "didn't work" case have the same depth as the successful ones?
- Is the template general enough to fit the reader's use case?

---

**Blocked by**: 01 ✅
**Created**: 2026-06-04
**Series**: EKET Article Series
