# TASK-645: Article 09 — Observability and Recovery

**Epic**: EPIC-008-articles-series
**Priority**: P3
**Status**: ⚪ Queued
**Estimate**: 5h
**Agent Type**: tech-writer (engineer-track)
**Category**: 📝 Documentation
**Languages**: EN + ZH-CN

---

## Goal

Write article **09 — Observability and Recovery: tracing / checkpoint / Saga** in both languages.

This article explains how EKET makes AI agents **non-black-box**: every action is traced, every state is checkpoint-able, every failure has a recovery flow.

## Outline

1. **The black-box problem** — AI agents that produce output but no audit trail
2. **Structured logging** — fields, correlation IDs, rotation policy
3. **Tracing** — `tracing` crate in Rust, hooks in Node, what gets instrumented
4. **Checkpoints** — when, what, how often
5. **Saga recovery** — 5 steps that are individually idempotent
6. **Audit trail as a product surface** — who can see what
7. **Dashboard** — `web/` directory, what it shows

## Required reading

- `docs/articles/01-what-is-eket/{en,zh-CN}/article.md` — sample
- `web/README.md`, `web/app.js`
- `node/src/context-monitor.ts`
- `node/src/health-check.ts`
- `rust/crates/context-mon/`
- `scripts/log-rotate.sh`
- `scripts/check-debrief.sh`

## Acceptance Criteria

- **AC-1**: Both languages, ≥ 2,000 words / ≥ 2,000 字
- **AC-2**: Tracing example shows the actual structured fields used
- **AC-3**: Checkpoint section names frequency vs size trade-off
- **AC-4**: ≥ 6 source citations
- **AC-5**: Recovery flow includes a "Slaver crashed mid-task" worked example
- **AC-6**: Dashboard section references actual files / screenshots
- **AC-7**: `INDEX.md` updated

## Review criteria

- Does the article distinguish tracing from logging from metrics (they are not the same)?
- Is the recovery flow testable (a reader can simulate a crash and follow the steps)?
- Does the audit-trail discussion respect privacy / compliance constraints?

---

**Blocked by**: 01 ✅
**Created**: 2026-06-04
**Series**: EKET Article Series
