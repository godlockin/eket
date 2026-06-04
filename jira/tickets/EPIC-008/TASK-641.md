# TASK-641: Article 05 — Four-Level Degradation

**Epic**: EPIC-008-articles-series
**Priority**: P1
**Status**: ⚪ Queued
**Estimate**: 7h
**Agent Type**: tech-writer (architect-track)
**Category**: 📝 Documentation
**Languages**: EN + ZH-CN

---

## Goal

Write article **05 — Four-Level Degradation: Shell → Rust → Node → Shell** in both languages.

This is one of the most distinctive technical decisions in EKET. Most "AI orchestration" tools die the day Redis or Node goes down. EKET survives because the protocol can be expressed in 300 lines of shell.

## Outline

1. **The pyramid** — L0 Shell (zero-dep) / L1 Rust (fast core) / L2 Node (web + LLM gateway) / L3 Shell (Node-down fallback)
2. **Per-level capability matrix** — what each level can and cannot do
3. **The "300 lines of shell" claim** — verified, with line count
4. **When degradation triggers** — auto-detection vs manual fallback
5. **The same-protocol invariant** — `eket task:claim` works at L0, L1, L2, L3 with identical semantics
6. **Recovery story** — degraded mode → restored mode without state loss
7. **Lessons for other systems** — when to add a degradation layer

## Required reading

- `docs/articles/01-what-is-eket/{en,zh-CN}/article.md` — sample
- `docs/architecture/DEGRADATION-STRATEGY.md` (591 lines — the authoritative spec)
- `docs/architecture/THREE-LEVEL-ARCHITECTURE.md` (566 lines)
- `docs/adr/ADR-001-four-level-degradation.md`
- `docs/adr/ADR-003-file-queue-fallback.md`
- `scripts/eket-slaver-auto.sh` — concrete L0 example

## Acceptance Criteria

- **AC-1**: Both languages, ≥ 2,200 words / ≥ 2,200 字
- **AC-2**: Includes the L0→L1→L2→L3 capability matrix
- **AC-3**: Counts and cites actual lines in shell scripts (not "about 300")
- **AC-4**: ≥ 6 source citations
- **AC-5**: Includes a "degradation in action" worked example (a Redis-down scenario)
- **AC-6**: Lesson section names 1-2 transferable principles
- **AC-7**: `INDEX.md` updated

## Review criteria

- Does the article respect that degradation is a **feature**, not a fallback to be ashamed of?
- Is the L0 implementation presented as a load-bearing design, not a legacy artifact?
- Are the trigger conditions and recovery flows testable?

---

**Blocked by**: 01 ✅
**Created**: 2026-06-04
**Series**: EKET Article Series
