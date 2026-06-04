# 00 — Foreword: Why This Series Exists

> **Who this is for:** anyone who has heard "EKET" and wants to understand whether it is worth 2 hours of their life.
> **What you'll get out of it:** a working mental model of the framework, plus the right pointer for the question that brought you here.

## Why I wrote this

The EKET repository has been growing for over a year. It now spans:

- ~6,400 lines of architecture documentation
- 5 Rust crates (core, cli, server, engine, context-mon)
- 11 Node.js module families
- 100+ bash scripts
- 3 ADRs
- A full SDK (JavaScript + Python)
- A web dashboard
- A multi-evaluator benchmark suite

That's a lot of surface. A new reader — be they an engineer, a manager, or a researcher — faces the same problem: **where do I start, and what should I trust?**

This series is the answer. It is not the documentation (the docs are the docs). It is the **commentary** — the layer that explains *why* the code looks the way it does, *which* trade-offs matter, and *what* you should take away.

## Two audiences in one document

Every article follows the same shape:

| Section | Audience | Time |
|---|---|---|
| TL;DR + Key Takeaways | Anyone | 30 seconds |
| Executive Summary | Decision-makers | 1 minute |
| Motivation + The Big Idea | Anyone | 5 minutes |
| How It Works | Engineers | 10–20 minutes |
| Trade-offs & Alternatives | Architects | 5 minutes |
| Implementation Notes | Engineers | 5 minutes |
| Lessons Learned | Anyone | 3 minutes |
| References | Anyone | skip if rushed |

The executive summary is **always** the first thing in the article. If you read nothing else, read that.

## How to use this series

- **For evaluation:** read 01, 02, and 15. You will know whether EKET belongs in your stack.
- **For adoption:** read 00, 01, 10, 12. You will know how to install and onboard.
- **For contribution:** read 01, 03, 06, 09. You will know which design decisions are settled and which are still open.
- **For research:** read 01, 04, 06, 07, 13, 15. You will have the full conceptual map.

## Conventions

- All file references use `path/to/file.ext:line` and are clickable on GitHub.
- Diagrams in `assets/diagrams/` are shared across articles; the article that introduces a diagram is cited in its filename.
- The same term, used in two articles, links to `GLOSSARY.md`.
- The series is updated when the framework changes. Look at the per-article `Last verified` field in `INDEX.md` to see how recent a given claim is.

## Acknowledgements

The framework itself is the work of the EKET community. The series is one person's distillation of that work — necessarily partial, occasionally wrong, always open to correction. If a claim in this series disagrees with the source code, **trust the code**. The series is a map, not the territory.

— *Series editor, 2026-06*

---

> **Next:** [`01 — What is EKET`](../01-what-is-eket/en/article.md)
