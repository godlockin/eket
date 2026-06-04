# TASK-649: Article 13 — ADR and Roadmap

**Epic**: EPIC-008-articles-series
**Priority**: P2
**Status**: ⚪ Queued
**Estimate**: 6h
**Agent Type**: tech-writer (architect-track)
**Category**: 📝 Documentation
**Languages**: EN + ZH-CN

---

## Goal

Write article **13 — ADR and Roadmap** in both languages.

This article does two things: (1) walks through the 3 existing ADRs (ADR-001, 002, 003) and the decision they encode; (2) lays out the 12-month roadmap based on the framework's current state.

## Outline

1. **What is an ADR** — when to write one, when not to
2. **ADR-001 — Four-level degradation** — the choice to invest in L0
3. **ADR-002 — Master-Slaver mode** — the human-AI unification
4. **ADR-003 — File-queue fallback** — the L0 implementation
5. **Open questions** — what the next 3 ADRs will likely cover
6. **12-month roadmap** — phases, milestones, exit criteria
7. **Risks to the roadmap** — what could invalidate the plan

## Required reading

- `docs/articles/01-what-is-eket/{en,zh-CN}/article.md` — sample
- `docs/adr/ADR-001-four-level-degradation.md` (3.9K)
- `docs/adr/ADR-002-master-slaver-mode.md` (5.3K)
- `docs/adr/ADR-003-file-queue-fallback.md` (5.2K)
- `CHANGELOG.md` (29.8K — read selectively)
- `docs/roadmap/` (if exists)

## Acceptance Criteria

- **AC-1**: Both languages, ≥ 2,200 words / ≥ 2,200 字
- **AC-2**: All 3 ADRs summarized with: context, decision, consequences
- **AC-3**: ≥ 6 source citations
- **AC-4**: Roadmap has 3-4 phases with clear exit criteria
- **AC-5**: "Open questions" section names at least 3 future ADRs
- **AC-6**: "Risks" section is honest, not performative
- **AC-7**: `INDEX.md` updated

## Review criteria

- Does the ADR summary respect the original decision-makers' intent?
- Is the roadmap ambitious but not delusional?
- Are the risks named with mitigation, not just listed?

---

**Blocked by**: 01 ✅
**Created**: 2026-06-04
**Series**: EKET Article Series
