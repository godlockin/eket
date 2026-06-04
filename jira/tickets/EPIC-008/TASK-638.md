# TASK-638: Article 02 — Why You Need EKET

**Epic**: EPIC-008-articles-series
**Priority**: P1
**Status**: ⚪ Queued
**Estimate**: 6h
**Agent Type**: tech-writer
**Category**: 📝 Documentation
**Languages**: EN + ZH-CN

---

## Goal

Write article **02 — Why You Need EKET: Pain × Solution × ROI** in both English and Chinese.

This is the **business-value article**. Decision-makers read 01 and 02 and either commit to evaluation or walk away. It must convert.

## Outline (5-7 sections)

1. **The 4 pain points** — lost context, conflicting edits, opaque review, no audit trail
2. **Before EKET** — what teams do today, why each workaround fails at scale
3. **After EKET** — what the protocol changes (concrete before/after table)
4. **ROI numbers** — Rust 19× speedup, ~187× faster startup, 10× less memory, time-to-merge delta
5. **Decision matrix** — which team sizes and use cases benefit most
6. **Anti-patterns** — teams that should *not* adopt EKET (and why)

## Required reading

- `docs/articles/01-what-is-eket/{en,zh-CN}/article.md` — sample benchmark (must follow same shape)
- `README.md` — claims about performance (verify against actual benchmarks)
- `benchmarks/` — Rust vs Node numbers
- `docs/architecture/THREE-LEVEL-ARCHITECTURE.md` — for performance claims
- `docs/adr/ADR-002-master-slaver-mode.md` — for the human-AI unification story

## Acceptance Criteria

- **AC-1**: Both `en/article.md` and `zh-CN/article.md` exist, ≥ 1,800 words / ≥ 1,800 字 each
- **AC-2**: 7-section template: Exec Summary / Motivation / Big Idea / How / Trade-offs / Implementation / Lessons
- **AC-3**: ≥ 5 source files cited with `file:line` format
- **AC-4**: Includes a concrete before/after table (workaround vs protocol)
- **AC-5**: ROI section has numbers (cite benchmark source, don't fabricate)
- **AC-6**: Anti-pattern section lists ≥ 3 cases where EKET is the wrong choice
- **AC-7**: Updates `docs/articles/INDEX.md` status to 🟡 Drafted

## Output paths

- `docs/articles/02-why-you-need-eket/en/article.md`
- `docs/articles/02-why-you-need-eket/zh-CN/article.md`
- `docs/articles/INDEX.md` (status update)

## Review criteria (Master will check)

- Does the TL;DR answer "what's the win" in 1 sentence?
- Are all 4 pain points illustrated with a concrete scenario, not abstract bullets?
- Is the ROI section conservative (no aspirational numbers)?
- Does the anti-pattern section have the courage to say "don't use this"?

## Observability

- Word count in `INDEX.md`
- Status field transitions: ⚪ → 🔵 → 🟡 → 🟢

## Test strategy

- Master manually reads both versions
- Verify every cited `file:line` exists and matches
- Check terminology consistency against `GLOSSARY.md`

---

**Blocked by**: 01 (shipped ✅)
**Created**: 2026-06-04
**Series**: EKET Article Series
