# TASK-640: Article 04 — Three-Repo Architecture

**Epic**: EPIC-008-articles-series
**Priority**: P2
**Status**: ⚪ Queued
**Estimate**: 6h
**Agent Type**: tech-writer (architect-track)
**Category**: 📝 Documentation
**Languages**: EN + ZH-CN

---

## Goal

Write article **04 — Three-Repo Architecture: confluence / jira / code** in both languages.

This article explains the **lifecycle separation** thesis. Why knowledge, tasks, and code are three concerns with three different write patterns, and why forcing them to share a tool creates a tool that is bad at all three.

## Outline

1. **The thesis** — three lifecycles, three repositories
2. **Knowledge in `confluence/`** — append-mostly, edit-allowed-but-discouraged
3. **Tasks in `jira/`** — stateful, finite, immutable
4. **Code in `code_repo/`** — versioned, branchy, standard git
5. **Cross-references** — the rule that no ticket exists without a cross-reference
6. **When to violate the rule** — small teams, single-concern projects
7. **Migration story** — moving an existing project to three-repo

## Required reading

- `docs/articles/01-what-is-eket/{en,zh-CN}/article.md` — sample
- `docs/architecture/THREE_REPO_ARCHITECTURE.md` (338 lines)
- `docs/architecture/three-repo-deployment.md` (312 lines)
- `confluence/memory/MEMORY.md`
- `jira/tickets/EPIC-007/` — concrete example of cross-references
- `scripts/validate-ticket-pr.sh` — the enforcement mechanism

## Acceptance Criteria

- **AC-1**: Both languages, ≥ 2,000 words / ≥ 2,000 字
- **AC-2**: Includes a lifecycle-comparison table (mutability, version, write pattern, readers)
- **AC-3**: ≥ 6 source citations
- **AC-4**: At least 1 real example ticket from `jira/tickets/` with cross-references traced
- **AC-5**: Migration section names 3 concrete steps a team can take this week
- **AC-6**: `INDEX.md` updated

## Review criteria

- Does the article distinguish "three repos" from "three git repos" (they are not the same)?
- Is the "when to violate" section honest?
- Are the cross-reference rules enforceable, or just nice-to-have?

---

**Blocked by**: 01 ✅
**Created**: 2026-06-04
**Series**: EKET Article Series
