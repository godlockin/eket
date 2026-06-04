# TASK-639: Article 03 — Technical Value: 7 Non-Obvious Choices

**Epic**: EPIC-008-articles-series
**Priority**: P2
**Status**: ⚪ Queued
**Estimate**: 7h
**Agent Type**: tech-writer (architect-track)
**Category**: 📝 Documentation
**Languages**: EN + ZH-CN

---

## Goal

Write article **03 — Technical Value: 7 Non-Obvious Choices** in both languages.

This is the article for senior engineers and architects who want to understand **what design decisions actually mattered**. Not the surface API; the trade-off layer.

## Outline (7 sections, one per choice)

1. **SQLite over Postgres** — when the "right" RDBMS is the wrong one
2. **CAS over distributed locks** — atomicity without coordination
3. **Three repositories over monorepo** — lifecycle separation
4. **Shell L0 over pure-Rust-only** — degradation as a feature
5. **Same protocol for human + AI** — eliminating the translation layer
6. **State machine over CRDT/event-sourcing-only** — choosing the right primitive
7. **Four levels not three** — redundancy has a sweet spot

## Required reading

- `docs/articles/01-what-is-eket/{en,zh-CN}/article.md` — sample benchmark
- `docs/architecture/FRAMEWORK.md` — full white paper
- `docs/architecture/THREE_REPO_ARCHITECTURE.md`
- `docs/architecture/DEGRADATION-STRATEGY.md`
- `docs/adr/ADR-001..003-*.md`
- `rust/crates/eket-core/src/claim.rs` (if exists) — CAS implementation

## Acceptance Criteria

- **AC-1**: Both languages shipped, ≥ 2,500 words / ≥ 2,500 字
- **AC-2**: 7 distinct choices, each with: what was chosen, what was rejected, why
- **AC-3**: ≥ 8 source citations with `file:line`
- **AC-4**: At least 3 choices include a comparison table (X vs Y)
- **AC-5**: Each choice names the "default alternative" most teams would have picked
- **AC-6**: New terms added to `GLOSSARY.md` (if any)
- **AC-7**: `INDEX.md` updated to 🟡

## Output paths

- `docs/articles/03-technical-value-choices/en/article.md`
- `docs/articles/03-technical-value-choices/zh-CN/article.md`
- `docs/articles/INDEX.md`

## Review criteria

- Does each section honestly represent the rejected alternative's strengths?
- Is there a "lesson" at the end that generalizes beyond EKET?
- Does the article avoid the trap of sounding like marketing?

---

**Blocked by**: 01 ✅
**Created**: 2026-06-04
**Series**: EKET Article Series
