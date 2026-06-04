# TASK-646: Article 10 — Onboarding Playbook: 0→1 Slaver

**Epic**: EPIC-008-articles-series
**Priority**: P3
**Status**: ⚪ Queued
**Estimate**: 4h
**Agent Type**: tech-writer (DX-track)
**Category**: 📝 Documentation
**Languages**: EN + ZH-CN

---

## Goal

Write article **10 — Onboarding Playbook: 0→1 Slaver in 5 Steps** in both languages.

This is the **practical onboarding** article. A new Slaver (human or AI) reads it and can install, register, claim, develop, and submit a PR — in one sitting.

## Outline

1. **Step 0 — Prerequisites** — what's already on the machine, what to install
2. **Step 1 — Install** — `quick-setup.sh`, what each level does
3. **Step 2 — Register** — `eket slaver:register --role <X>`, what gets created
4. **Step 3 — Claim** — `eket task:claim`, finding the right ticket
5. **Step 4 — Develop** — branch, work, checkpoint, test
6. **Step 5 — Submit PR** — `task:complete`, gate review, merge
7. **What can go wrong** — 3 common first-day mistakes

## Required reading

- `docs/articles/01-what-is-eket/{en,zh-CN}/article.md` — sample
- `README.md` — install + quick start
- `CONTRIBUTING.md`
- `template/docs/SLAVER-RULES.md`
- `scripts/quick-setup.sh` (18.1K)
- `scripts/eket-start.sh` (38.6K)

## Acceptance Criteria

- **AC-1**: Both languages, ≥ 1,800 words / ≥ 1,800 字
- **AC-2**: All 5 steps runnable by a reader (verified commands, not pseudocode)
- **AC-3**: ≥ 5 source citations
- **AC-4**: Includes a "first day" timeline (~30 min for install + claim)
- **AC-5**: "What can go wrong" section has 3 scenarios with fixes
- **AC-6**: `INDEX.md` updated

## Review criteria

- Can a new Slaver actually follow this without external help?
- Are the commands tested / verified, not copy-pasted from memory?
- Does the article respect the new Slaver's time (no ceremony)?

---

**Blocked by**: 01 ✅
**Created**: 2026-06-04
**Series**: EKET Article Series
