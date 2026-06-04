# TASK-648: Article 12 — Multi-Tool Support

**Epic**: EPIC-008-articles-series
**Priority**: P3
**Status**: ⚪ Queued
**Estimate**: 5h
**Agent Type**: tech-writer (integrator-track)
**Category**: 📝 Documentation
**Languages**: EN + ZH-CN

---

## Goal

Write article **12 — Multi-Tool Support: 1 Protocol, 5 Clients** in both languages.

EKET ships adapters for Claude Code, Cursor, Codex, Copilot, and Gemini. This article explains the adapter layer and how a team can mix tools in the same workflow.

## Outline

1. **The thesis** — the LLM is an implementation detail
2. **Adapter matrix** — Claude Code / Cursor / Codex / Copilot / Gemini
3. **Per-tool capabilities** — full / degraded / single-agent
4. **Cross-tool workflows** — Cursor writes code, Claude Code reviews
5. **The hook server** — `node/src/hooks/`, the cross-tool event bridge
6. **Adding a new tool** — what an adapter must implement
7. **Why tool-agnostic matters** — vendor lock-in as a long-term risk

## Required reading

- `docs/articles/01-what-is-eket/{en,zh-CN}/article.md` — sample
- `README.md` (the multi-tool table at line 49)
- `CLAUDE.md`, `CURSOR.md`, `CODEX.md`, `COPILOT.md`, `AGENTS.md`
- `node/src/hooks/`
- `template/CLAUDE-TEMPLATE.md` (the adapter template)

## Acceptance Criteria

- **AC-1**: Both languages, ≥ 1,800 words / ≥ 1,800 字
- **AC-2**: Capability matrix for all 5 tools
- **AC-3**: ≥ 6 source citations
- **AC-4**: "Adding a new tool" section names the 3-5 things an adapter must implement
- **AC-5**: Includes a worked cross-tool example
- **AC-6**: `INDEX.md` updated

## Review criteria

- Does the article respect each tool's strengths (no tool-shaming)?
- Is the adapter specification testable?
- Does the "vendor lock-in" argument hold up?

---

**Blocked by**: 01 ✅
**Created**: 2026-06-04
**Series**: EKET Article Series
