# TASK-642: Article 06 — Master-Slaver Protocol

**Epic**: EPIC-008-articles-series
**Priority**: P1
**Status**: ⚪ Queued
**Estimate**: 8h
**Agent Type**: tech-writer (architect-track)
**Category**: 📝 Documentation
**Languages**: EN + ZH-CN

---

## Goal

Write article **06 — Master-Slaver Protocol: claim → deliver → review** in both languages.

This is the **core mechanism** article. It explains the state machine that every operation in EKET implements, and the Saga 5-step completion that makes the protocol recoverable.

## Outline

1. **The 5 states** — READY / IN_PROGRESS / IN_REVIEW / DONE / RESUME
2. **The 5 transitions** — `claim` / `complete` / `review` / `merge` / `resume`
3. **Atomic claim** — CAS on SQLite, why it must be atomic
4. **Saga 5-step** — validate → test → checkpoint → commit → notify
5. **Failure modes** — Slaver crash, PR rejected, checkpoint stale
6. **The "no human in the loop for claims" rule** — why Master cannot claim
7. **Multi-Master / multi-Slaver** — when more than one of each makes sense

## Required reading

- `docs/articles/01-what-is-eket/{en,zh-CN}/article.md` — sample
- `node/src/core/` — state machine implementation
- `rust/crates/eket-core/` — Rust mirror
- `node/src/core/checkpoint.ts` — checkpoint mechanism
- `docs/adr/ADR-002-master-slaver-mode.md`
- `docs/architecture/MULTI_INSTANCE_DESIGN.md` (353 lines)

## Acceptance Criteria

- **AC-1**: Both languages, ≥ 2,500 words / ≥ 2,500 字
- **AC-2**: Full state-machine diagram (text or reference to `assets/diagrams/`)
- **AC-3**: Saga 5-step documented with concrete code references
- **AC-4**: ≥ 8 source citations
- **AC-5**: Failure modes section covers at least 3 scenarios with recovery flow
- **AC-6**: Includes a worked example: claim → work → complete → review → merge
- **AC-7**: `INDEX.md` updated

## Review criteria

- Does the state machine handle every operation in the protocol?
- Is the CAS argument technical and accurate (not hand-wavy)?
- Does the article make the human-AI unification concrete, not just asserted?

---

**Blocked by**: 01 ✅
**Created**: 2026-06-04
**Series**: EKET Article Series
