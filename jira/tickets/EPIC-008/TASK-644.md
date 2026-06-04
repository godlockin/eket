# TASK-644: Article 08 — Rust Performance: 21ms vs 400ms

**Epic**: EPIC-008-articles-series
**Priority**: P2
**Status**: ⚪ Queued
**Estimate**: 6h
**Agent Type**: tech-writer (engineer-track)
**Category**: 📝 Documentation
**Languages**: EN + ZH-CN

---

## Goal

Write article **08 — Rust Performance: 21ms vs 400ms** in both languages.

This is the **performance engineering** article. It uses the headline Rust-vs-Node numbers as a case study to walk through *where the time goes* and *what the memory safety dividend buys you*.

## Outline

1. **The headline numbers** — 19× `task:claim`, 187× startup, 10× memory (cite source)
2. **Benchmark methodology** — what was measured, what was not
3. **Where the Node time goes** — JIT warmup, GC pauses, module loading
4. **Where the Rust time goes** — syscalls, SQLite binding overhead
5. **Memory profile comparison** — RSS, heap fragmentation, allocations
6. **Memory safety dividend** — what Rust's borrow checker catches that Node can't
7. **Lessons for other ports** — when to reach for Rust, when not to

## Required reading

- `docs/articles/01-what-is-eket/{en,zh-CN}/article.md` — sample
- `README.md` (the perf table at line 140)
- `benchmarks/` (3 subdirs: `eket-eval`, `multi-agent-eval`, `swe-bench-eval`)
- `benchmarks/baseline.json`
- `benchmarks/simple-benchmark.js`
- `k6/` — load test scripts
- `rust/crates/eket-cli/` — the implementation being measured

## Acceptance Criteria

- **AC-1**: Both languages, ≥ 2,000 words / ≥ 2,000 字
- **AC-2**: Includes a per-operation time breakdown (not just headline)
- **AC-3**: ≥ 6 source citations, including benchmark files
- **AC-4**: Methodology section names what was *not* measured (honesty)
- **AC-5**: Memory profile includes RSS + heap + allocations
- **AC-6**: Lesson section names 2-3 transferable principles
- **AC-7**: `INDEX.md` updated

## Review criteria

- Are the numbers verifiable (link to actual benchmark files)?
- Does the "lessons for other ports" section avoid Rust-evangelism?
- Is the memory-safety argument technically correct, not vibes-based?

---

**Blocked by**: 01 ✅
**Created**: 2026-06-04
**Series**: EKET Article Series
