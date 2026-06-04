# TASK-643: Article 07 — Storage, CAS, and Event-Sourced State

**Epic**: EPIC-008-articles-series
**Priority**: P2
**Status**: ⚪ Queued
**Estimate**: 7h
**Agent Type**: tech-writer (architect-track)
**Category**: 📝 Documentation
**Languages**: EN + ZH-CN

---

## Goal

Write article **07 — Storage, CAS, and Event-Sourced State** in both languages.

This article goes deep on the **persistence layer**: why SQLite is the primary store, where Redis fits, how CAS guarantees atomicity, and how event sourcing gives the audit trail.

## Outline

1. **The data model** — tickets, claims, completions, audit events
2. **SQLite as primary** — single-file, single-writer, surprising throughput
3. **Redis as accelerator** — pub/sub, claim queue, hot state
4. **CAS deep dive** — the `UPDATE ... WHERE status = 'READY' AND version = X` pattern
5. **Event sourcing** — append-only audit log, replay-able history
6. **Consistency story** — what happens when SQLite and Redis disagree
7. **Migration / backup** — `backup-sqlite.sh`, `retro-sqlite.sh`

## Required reading

- `docs/articles/01-what-is-eket/{en,zh-CN}/article.md` — sample
- `docs/architecture/schema.md` (320 lines)
- `node/src/core/` — TypeScript data access
- `rust/crates/eket-core/src/` — Rust data access
- `scripts/backup-sqlite.sh` (11.8K)
- `scripts/retro-sqlite.sh` (11.0K)
- `protocol/schemas/` — wire schemas

## Acceptance Criteria

- **AC-1**: Both languages, ≥ 2,200 words / ≥ 2,200 字
- **AC-2**: Schema diagram (text or visual)
- **AC-3**: CAS example with actual SQL (not pseudocode)
- **AC-4**: ≥ 7 source citations
- **AC-5**: Consistency section names the conflict-resolution rules
- **AC-6**: Migration section names 2-3 concrete operations a team can run
- **AC-7**: `INDEX.md` updated

## Review criteria

- Is the SQLite-vs-Postgres argument honest about SQLite's limits?
- Does the CAS explanation hold up to a skeptical reader?
- Are the consistency rules complete (every divergence case handled)?

---

**Blocked by**: 01 ✅
**Created**: 2026-06-04
**Series**: EKET Article Series
