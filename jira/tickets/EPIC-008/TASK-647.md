# TASK-647: Article 11 — SDK and Integration

**Epic**: EPIC-008-articles-series
**Priority**: P3
**Status**: ⚪ Queued
**Estimate**: 5h
**Agent Type**: tech-writer (integrator-track)
**Category**: 📝 Documentation
**Languages**: EN + ZH-CN

---

## Goal

Write article **11 — SDK and Integration: JS / Python / axum / OpenClaw** in both languages.

This article is for **teams building on top of EKET** — either via the official SDKs, the HTTP API, or the OpenClaw bridge.

## Outline

1. **Integration surface** — what an external system can call
2. **JavaScript SDK** — `sdk/javascript/`, install + first call
3. **Python SDK** — `sdk/python/`, install + first call
4. **axum HTTP API** — `rust/crates/eket-server/`, REST endpoints, auth
5. **OpenClaw bridge** — `docs/architecture/OPENCLAW-INTEGRATION-DESIGN.md`
6. **Webhook events** — what gets emitted, how to subscribe
7. **Building a custom integration** — when to use SDK vs raw HTTP

## Required reading

- `docs/articles/01-what-is-eket/{en,zh-CN}/article.md` — sample
- `sdk/javascript/`, `sdk/python/` (source code)
- `sdk/VERSIONING.md`
- `rust/crates/eket-server/`
- `docs/architecture/OPENCLAW-INTEGRATION-DESIGN.md` (517 lines)
- `docs/architecture/OPENCLAW-DATAFLOW-DESIGN.md` (777 lines)
- `web/` — dashboard as an integration example

## Acceptance Criteria

- **AC-1**: Both languages, ≥ 2,000 words / ≥ 2,000 字
- **AC-2**: All 4 integration surfaces (JS SDK, Python SDK, HTTP API, OpenClaw) covered
- **AC-3**: ≥ 7 source citations
- **AC-4**: Includes at least 1 working code snippet per surface
- **AC-5**: Versioning section explains the SDK semantic-versioning policy
- **AC-6**: `INDEX.md` updated

## Review criteria

- Are the SDK snippets copy-paste-runnable?
- Is the auth model clearly explained (tokens, scopes, expiry)?
- Does the article respect the integrator's time (no 50-page setup)?

---

**Blocked by**: 01 ✅
**Created**: 2026-06-04
**Series**: EKET Article Series
