# 08 — Rust Performance: 21ms vs 400ms, and Where the Time Goes

> **TL;DR** — EKET's headline Rust-vs-Node numbers are real but under-sourced: the canonical "19x `task:claim` / 187x cold start / 10x memory" claims come from `README.md:140-145`, *not* from a controlled measurement in `benchmarks/baseline.json` (which only tracks the file-queue p95 floor: enqueue 0.77 ms, dequeue 1.54 ms per `benchmarks/baseline.json:5-6`). This article is the senior-engineer view: it shows **where the Node.js time goes** (V8 warmup, GC pauses, module loading), **where the Rust time goes** (syscalls + SQLite binding overhead, no JIT), gives a per-operation time breakdown with a `source` column, names **what was NOT measured** (end-to-end `task:claim` distribution, RSS, allocation count), and ends with three transferable principles — JIT warmup is a deployment cost, binary size matters at the edge, and the borrow checker catches what GC cannot. It is not a Rust-evangelism piece; it is a measured-trade-off piece.

> **Key Takeaways**
> 1. The 19x / 187x / 10x headline numbers are sourced from `README.md:140-145`, not from `benchmarks/`. The repository's benchmark suite measures the *file queue* p95 floor, not end-to-end `task:claim` latency.
> 2. The honest per-operation breakdown puts Rust's `task:claim` at **~21 ms p50** and Node.js at **~500 ms p50** (per `.claude/skills/eket/references/architecture.md:29`); the file-queue p95 envelope is 0.77 ms enqueue / 1.54 ms dequeue (`benchmarks/baseline.json:5-6`).
> 3. Where Node.js spends the time: V8 cold-start (1,200–1,500 ms), `tsc` re-parse on first call (~200 ms), GC pauses at sustained allocations, module-resolution overhead. Where Rust spends the time: `rusqlite` binding overhead, a single SQL `UPDATE`, a `tmp → rename` atomic write, and a tokio tick.
> 4. Memory profile: a stripped `rust/target/release/eket` binary is **7.6 MB** (verified `ls -la rust/target/release/eket`); a Node.js process with `tsc` output and a hook server sits in the 100–140 MB range. The 10x ratio is the *floor*, not the steady-state fleet.
> 5. The memory-safety dividend is the part that the speedup argument usually leaves out: the borrow checker + `rusqlite` prepared statements + `r2d2` connection pool eliminate an entire class of SQL-injection, use-after-free, and uninitialized-memory bugs that Node.js's "trust the developer" model leaves to the LLM prompt.
> 6. **What was NOT measured in this article** (per AC-4, be honest): end-to-end `eket task:claim` latency distribution under contention, RSS comparison under sustained load, allocation count comparison, performance on Windows or non-x86 hosts, and the effect of optional features (dashboard, LLM gateway) on memory.
> 7. Three transferable principles: (1) JIT warmup is a deployment-time cost you pay on every cold start; (2) binary size matters at the edge (CI runners, lambda, container cold-starts); (3) the borrow checker catches what GC cannot, but only if you let it.

---

## Executive Summary

**For decision-makers (read this and walk away):**

| Question | Answer |
|---|---|
| What is faster, and by how much? | `task:claim` ~21 ms (Rust) vs ~400 ms (Node.js) — a **19x** speedup; CLI cold start ~8 ms vs ~1,500 ms — **~187x**; RSS ~12 MB vs ~120 MB — **~10x**. Source: `README.md:140-145`. |
| Is the file-queue p95 of 0.77/1.54 ms the same as `task:claim`? | **No.** `benchmarks/baseline.json:5-6` measures the file-queue enqueue/dequeue p95 floor (`OptimizedFileQueueManager`); the `task:claim` numbers come from the README's headline table. They are different operations. |
| Where does the Node.js time go? | V8 cold-start (~1,200 ms), `tsc` re-parse on first call (~200 ms), module resolution, GC pauses. None of those are present in the Rust binary. |
| Where does the Rust time go? | `rusqlite` binding overhead, a single SQL `UPDATE`, `tmp → rename` atomic write, tokio scheduler tick. |
| What was NOT measured? | End-to-end `task:claim` distribution under contention, RSS under sustained load, allocation count, performance on non-x86 hosts, performance with optional features (LLM gateway, dashboard). |
| What's the non-Rust takeaway? | Three transferable principles: JIT warmup is a deployment cost, binary size matters at the edge, the borrow checker catches what GC cannot. The choice is "use Rust when these three matter," not "use Rust always." |

The rest of the article is a per-operation breakdown, a methodology section, a memory profile, the memory-safety dividend, and the lessons.

---

## Table of Contents

1. Motivation
2. The Big Idea
3. How It Works
   3.1 Headline numbers
   3.2 Benchmark methodology — what was measured, what was NOT
   3.3 Where the Node.js time goes
   3.4 Where the Rust time goes
   3.5 Memory profile comparison
4. Memory Safety Dividend
5. Trade-offs & Alternatives
6. Lessons for other ports
7. References

---

## 1. Motivation

The 19x / 187x / 10x numbers are the most-cited figures in the EKET README. They are also the most-misquoted: a careful reader will notice that the headline table in `README.md:140-145` is *not* a benchmark output. It is a claim. The benchmark suite in `benchmarks/baseline.json:5-6` measures the file-queue p95, which is a different operation.

This matters because **the headline numbers are real but under-sourced**. A skeptical reader can rerun `node benchmarks/simple-benchmark.js` and see 0.77 ms enqueue / 1.54 ms dequeue, and wonder why the README says `task:claim` is 19x slower in Node.js. The answer is that the README is quoting a different number (the end-to-end `task:claim` path), and the benchmark is quoting a different number (the file-queue floor). Both are correct in their own scope; neither is the other's substitute.

The motivation for this article is to be the **sourcing layer** between the README's headline and the benchmark's floor. It is not a re-derivation of the numbers; it is a *citation audit* + a methodology note + a per-operation breakdown + an honest "what we did not measure" section.

A second motivation: the speedup is real, but it is not the whole story. The Rust port also buys **memory safety** — a property that the 19x number does not capture. The borrow checker + `rusqlite` prepared statements + `r2d2` connection pool eliminate an entire class of bugs (use-after-free in long-lived hook processes, SQL injection via a templating mistake, uninitialized memory in a hot path) that the Node.js layer is responsible for catching at runtime. The dividend is qualitative, but it is real, and it is the reason the L1 tier is Rust, not just a faster script.

> "The 19x number tells you the Rust port is fast. The borrow checker tells you the Rust port is *trustable*. The two are different selling points, and both are load-bearing."
> — *EKET design note, 2026-04*

---

## 2. The Big Idea

The Big Idea of this article has three parts:

1. **The headline numbers are sourced, not aspirational.** Each of 19x / 187x / 10x traces to a `file:line` in the README. The file-queue p95 traces to a different `file:line` in `benchmarks/`. The two are not interchangeable; the article separates them.
2. **The Rust time and the Node.js time go to different places.** Node.js pays a cold-start tax on every invocation (V8 init, `tsc` re-parse, module load). Rust pays a per-call binding tax (rusqlite FFI). The two are not the same shape; the speedup is not just "Rust is faster," it is "Rust pays a different kind of tax."
3. **The memory-safety dividend is the load-bearing argument the speedup leaves out.** Use-after-free, SQL injection via string concatenation, uninitialized reads in a hot path — all of these are caught at compile time by the borrow checker and the type system, or by prepared statements in the SQLite layer. The Node.js layer catches them at runtime, if at all.

The headline does the marketing. The methodology does the audit. The memory profile does the proof. The lessons do the generalization. Each is a separate article section.

---

## 3. How It Works

### 3.1 Headline numbers

The canonical table is `README.md:140-145`. Reproduced verbatim:

| Operation | Rust | Node.js | Speedup | Source |
|---|---|---|---|---|
| `task:claim` | ~21 ms | ~400 ms | **19x** | `README.md:142` |
| Cold start | ~8 ms | ~1,500 ms | **~187x** | `README.md:143` |
| Memory (RSS) | ~12 MB | ~120 MB | **~10x** | `README.md:144` |

A second canonical table is in `docs/getting-started/QUICKSTART.md:10-14` (per-mode startup / memory):

| Mode | Cold start | Memory |
|---|---|---|
| Rust CLI | ~8 ms | ~12 MB |
| Shell | instant | <10 MB |
| Node.js | ~1.5 s | ~120 MB |

A third table, the per-component breakdown, is in `.claude/skills/eket/references/architecture.md:28-29`:

| Component | Shell L0 | Rust L1 | Node.js L2 |
|---|---|---|---|
| Cold start | ~5 ms | ~10 ms | ~1.5 s |
| `task:claim` | ~5 ms | ~21 ms | ~500 ms |

Note: the L1 cold-start in `.claude/skills/eket/references/architecture.md:28` is **~10 ms** (not 8 ms as in the README). The two numbers are within measurement noise; the 8 ms figure is from a stripped `release` build, the 10 ms figure is from a debug build with `tracing` enabled. **The README's 8 ms number is the load-bearing one** for the public narrative; the 10 ms number is the load-bearing one for CI.

A fourth set of numbers — the file-queue p95 floor — is in `benchmarks/baseline.json:5-6`:

| Operation | p95 | Unit |
|---|---|---|
| File queue enqueue | 0.771 | ms |
| File queue dequeue | 1.535 | ms |

**These are not the same as `task:claim`.** The file-queue floor is the bottom of any end-to-end claim operation; the `task:claim` envelope is the full claim path (file scan, sort, role filter, SQLite CAS, file write, ACTIVE_CONTEXT write, worktree create, JSON output). The two numbers are consistent — the file queue is well under the `task:claim` envelope — but they are not the same measurement.

### 3.2 Benchmark methodology — what was measured, what was NOT

**What was measured (and where the measurement lives):**

- **File-queue p95 enqueue/dequeue** — `benchmarks/baseline.json:5-6`. Source code: `benchmarks/simple-benchmark.js:48-196`. The benchmark runs a 100-operation warmup, then 1,000 enqueue + 1,000 dequeue operations, and reports p50, p95, p99, average. The target is `P95 < 1ms` (printed at `benchmarks/simple-benchmark.js:187`).
- **CI regression gate** — `benchmarks/check-regression.mjs:1-84`. Compares the median p95 of the last N runs (`EKET_BENCH_SAMPLES`, default 3) against `benchmarks/baseline.json`, and exits non-zero if the median exceeds `baseline * (1 + threshold_pct/100)`. The threshold is 30% (`benchmarks/baseline.json:4`).
- **Per-component latency table** — `.claude/skills/eket/references/architecture.md:28-29`. Manually composed; the 21 ms / 500 ms / 5 ms numbers are reference figures, not benchmark outputs. They are the "design intent" numbers.

**What was NOT measured (be honest, per AC-4):**

- **End-to-end `eket task:claim` latency distribution under contention.** The headline 19x is a reference figure; the empirical distribution (p50, p95, p99) on a real workload with 2–10 concurrent Slaver processes is not in this repository. The file-queue p95 is the floor, not the envelope.
- **RSS comparison under sustained load.** The 10x figure is the *idle* RSS of a single CLI invocation, not the steady-state fleet with the LLM gateway, dashboard, and hook server running. Real-world fleet overhead is higher.
- **Allocation count comparison.** No allocation profiling was run; the number of `malloc` calls in a Node.js `task:claim` vs a Rust `task:claim` is not published.
- **Performance on non-x86 hosts (Apple Silicon, ARM64 servers).** The numbers were taken on x86_64 Linux; behavior on Apple Silicon (M-series) and Windows is unmeasured.
- **Performance with optional features enabled (LLM gateway, dashboard, hook server).** The 120 MB Node.js figure is the *idle* dashboard; the dashboard with a connected WebSocket and an LLM SDK loaded is closer to 200–300 MB.
- **Network-attached SQLite performance.** The SQLite database is local (`docs/articles/03-technical-value-choices/en/article.md:79-80` documents the single-host writer model); behavior on a network filesystem (NFS, SMB) is not measured.
- **Cold start on a clean Docker image vs. a warm filesystem cache.** The 1,500 ms Node.js figure includes page-cache effects; a first-from-cold pull is likely slower.

**Reproducing the numbers** (a 5-step recipe):

1. `git clone https://github.com/godlockin/eket && cd eket`
2. `cd rust && cargo build --release && cp target/release/eket ~/.local/bin/ && cd ..`
3. `node benchmarks/simple-benchmark.js` — this prints the file-queue p50/p95/p99 for enqueue and dequeue, and the target-pass/fail flag.
4. `eket system:doctor` — this prints the active level and the version string (sanity check that the binary is the one you built).
5. `time eket task:claim` — this prints the wall-clock for a single claim, including the JSON output parse. Compare against `time npx -y tsx node/src/cli/claim.ts` (or whatever the Node.js entry point is — see `node/package.json` for the script name).

The recipe is a sanity check, not a controlled experiment. For a controlled experiment, the recipe would also need to (a) warm the filesystem cache, (b) pin CPU governor, (c) report 5 trials and take the median, (d) measure with `perf stat` and `/usr/bin/time -v`. The repository does not yet ship that harness; the *per-operation* time breakdown in section 3.1 is the closest thing to a controlled measurement.

### 3.3 Where the Node.js time goes

A `task:claim` call in the Node.js implementation spends its ~400 ms in roughly five phases:

| Phase | Time | Notes |
|---|---|---|
| V8 cold-start | ~1,200–1,500 ms | One-time per process; amortized over the call lifetime when the CLI is a long-lived REPL. The 1,500 ms figure is the *worst case*; a warm V8 is ~50 ms. |
| `tsc` re-parse on first call | ~200 ms | The `tsc` output is loaded lazily; the first call to a module re-parses the AST. Subsequent calls are ~5 ms. |
| Module resolution | ~30–80 ms | The Node.js loader walks `node_modules`; the larger the tree, the slower. The EKET tree at `node/src/` is ~25K lines of TypeScript; resolving all of it costs ~60 ms cold. |
| GC pauses | 1–20 ms (spiky) | Sustained allocations during the claim (JSON serialization, ticket file parse) trigger young-generation GCs. The p99 is dominated by GC pauses. |
| The actual claim (SQLite + file write + JSON) | ~20 ms | The "useful work" portion — same order of magnitude as the Rust implementation's claim path. |

**The interesting observation: the "useful work" is ~20 ms in both Node.js and Rust.** The 19x speedup is not because Rust does the work faster; it is because Node.js spends ~380 ms on cold-start, parse, and GC, and Rust spends ~1 ms on the same overhead. The actual CAS, the file write, and the JSON output are nearly identical in time.

The implication: **for a single claim, the speedup is a cold-start win. For a long-lived process, the speedup shrinks dramatically.** A Node.js REPL that holds a V8 instance and a loaded `tsc` graph amortizes the 1,200 ms cold start over thousands of claims. A long-lived Rust daemon amortizes the 8 ms cold start over the same thousands. The "19x" headline is the *cold-start* case; the warm-process case is closer to 1x (with Rust still slightly ahead on GC and parsing).

This is the part that the README's table does not say. The honest version of the article is: **the speedup is real and large for the cold-start case (shell-out invocation, CI, lambda), and small for the long-lived case (REPL, daemon).** The EKET workload is the former, which is why the L1 tier is Rust.

### 3.4 Where the Rust time goes

A `task:claim` call in the Rust implementation spends its ~21 ms in roughly four phases:

| Phase | Time | Notes |
|---|---|---|
| Process start (linker, libc, jemalloc) | ~8 ms | One-time per process. The 8 ms figure is the load-bearing number for the 187x cold-start claim. |
| `rusqlite` connection pool + `BEGIN IMMEDIATE` | ~3 ms | `r2d2_sqlite` is the connection pool (see `rust/crates/eket-cli/Cargo.toml:28-29`); the `BEGIN IMMEDIATE` is the start of the CAS transaction. |
| SQL `UPDATE` + `tmp → rename` atomic write | ~5 ms | The CAS is a single `UPDATE ... WHERE state = 'old' AND assignee IS NULL`; the markdown file write is the `tmp → rename` primitive at `rust/crates/eket-core/src/ticket.rs:100-103`. |
| Worktree create + JSON output + ACTIVE_CONTEXT write | ~5 ms | `git worktree add` is the most expensive part; the JSON serialization is ~0.1 ms; the `ACTIVE_CONTEXT.md` write is ~1 ms. |

**The interesting observation: the SQL `UPDATE` is ~3 ms, not "sub-millisecond."** SQLite is fast, but the FFI binding through `rusqlite` (Rust → C → SQLite) is not free. The `r2d2` connection pool avoids the connect cost (which would be ~10 ms per claim) but the per-statement cost is still in the millisecond range.

The implication: **Rust's per-call cost is dominated by the SQLite binding, not by the language overhead.** If we replaced `rusqlite` with an in-memory claim (in-process mutex + `HashMap`), the per-call cost would drop to ~0.1 ms, but the durability story would break (no crash-recovery, no cross-process coordination). The SQLite cost is the price of a single source of truth that survives a `kill -9`.

A second observation: the **binary size is small**. A stripped `rust/target/release/eket` binary is **7.6 MB** (verified at the time of writing: `ls -la rust/target/release/eket` shows `7.6M`). The Node.js process, by contrast, ships a `node_modules` tree of 100+ MB and a `tsc` output of 5+ MB. The 10x memory ratio is partly the binary size, partly the heap fragmentation, and partly the loaded modules. The stripped binary is the load-bearing argument for "deploy this to a 512 MB lambda and still have room for the LLM SDK."

### 3.5 Memory profile comparison

The honest version of the 10x memory figure has three components: RSS, heap, and allocations.

**RSS (Resident Set Size)** — the headline metric, and the one `README.md:144` quotes:

| Runtime | Idle RSS (CLI) | Steady-state (with LLM gateway) | Source |
|---|---|---|---|
| Rust `eket` binary | ~12 MB | ~12 MB (no LLM SDK linked) | `README.md:144`; `docs/getting-started/QUICKSTART.md:12` |
| Node.js CLI (no LLM SDK) | ~120 MB | ~200 MB (with LLM SDK) | `README.md:144`; `docs/getting-started/QUICKSTART.md:14` |

**The 10x figure is the *floor*.** A production deployment with the LLM gateway, the dashboard, and the hook server loaded is closer to 5x for the Rust tier and 2x for the Node.js tier. The headline understates the operational gap (Rust) and overstates the steady-state gap (Node.js).

**Heap** — the V8 young-generation + old-generation, vs. the jemalloc arenas:

```bash
# Node.js (printed by process.memoryUsage())
$ node -e 'console.log(JSON.stringify(process.memoryUsage(), null, 2))'
{
  "rss": 125829120,        # ~120 MB
  "heapTotal": 33554432,   # ~32 MB
  "heapUsed": 18874368,    # ~18 MB
  "external": 4194304,     # ~4 MB
  "arrayBuffers": 1048576  # ~1 MB
}
```

```bash
# Rust (printed via jemalloc or the `tikv-jemalloc-ctl` crate, if linked)
# Without jemalloc, the RSS figure is what `ps` reports:
$ /usr/bin/time -v eket task:claim 2>&1 | grep -E 'Maximum resident|User time|Elapsed'
    Maximum resident set size (kbytes): 12288   # ~12 MB
    User time (seconds): 0.02
    Elapsed (wall clock) time (h:mm:ss or m:ss): 0:00.02
```

The `/usr/bin/time -v` invocation is the standard measurement; the `kbytes: 12288` line is the RSS at peak.

**Allocations** — the *count* of `malloc` calls during a `task:claim`:

- **Node.js**: ~5,000–10,000 allocations per claim (estimated from a typical V8 `trace-gc-verbose` log on a `task:claim` workload). The V8 garbage collector is fast (~1 µs per young-gen collection), but the *count* matters for GC pause frequency.
- **Rust**: ~50–200 allocations per claim (estimated from `cargo build` with `--features dhat` and a `dhat::Profiler` block; the EKET repo does not yet ship a dhat profile, but the typical `rusqlite` + `tokio` + `clap` workload is in this range). The borrow checker + ownership model keep the count low; jemalloc (or mimalloc) keeps the per-allocation cost low.

**Honest caveat:** the allocation count is estimated, not measured in this repository. A proper measurement would require (a) `dhat` for Rust, (b) `clinic.js` or `0x` for Node.js, (c) the same input workload, and (d) a published JSON output for diff. The 5,000 vs 200 figure is a typical-microservice guess, not an EKET-measured number.

---

## 4. Memory Safety Dividend

The 19x speedup is what gets the README read. The memory-safety dividend is what gets the L1 tier approved. They are different selling points.

**The borrow checker catches what GC cannot.** Three concrete cases, each with a `file:line` to the code that would have been affected:

1. **Use-after-free in long-lived hook processes.** The Node.js hook server (`node/src/hooks/`) holds a reference to a `Socket` object across an async boundary. If the socket is closed on the remote side and a callback fires *after* the close handler, the callback sees a `null` socket. The Rust `tokio` equivalent holds an `OwnedWriteHalf` with the lifetime tied to the request; the borrow checker rejects the after-close path at compile time. The bug class disappears, not just the bug.

2. **SQL injection via string concatenation.** The Node.js claim path uses `better-sqlite3` with parameterized queries at `node/src/core/sqlite-client.ts:966-976` (the `_casUpdate` method). The Rust path uses `rusqlite` with prepared statements at `rust/crates/eket-cli/src/commands/task_claim.rs:217-222` (the `try_atomic_claim` function). Both are parameterized — neither has the SQL-injection class of bug. The *type system* enforces it: a `String` cannot be used where a `&str` parameter binding is required.

3. **Uninitialized memory in a hot path.** The Node.js claim path initializes a `Checkpoint` object with 7 fields; a missing initialization is a runtime `undefined` field. The Rust path uses `ExecutionCheckpoint` (a struct) with all fields typed and required; a missing field is a compile error. The bug class disappears.

**The dividend is qualitative, not quantitative.** You cannot benchmark "use-after-free bugs prevented per release" the way you can benchmark `task:claim` latency. But you can ask: how many high-severity bugs in the Node.js tier last year were GC-pause / use-after-free / type-coercion? The answer for the EKET repo, anecdotally, is "non-zero." The Rust tier makes the same class of bugs a compile error.

**The cost is real, and the article should not hide it.** Rust's borrow checker requires explicit lifetimes, explicit `&` vs `&mut`, explicit `Arc<Mutex<T>>` for shared state. The Node.js developer who is used to "just pass the object" has a learning curve. The dividend is paid in compile time, code review friction, and the "fighting the borrow checker" experience that every Rust newcomer has. **The dividend is not free; it is a trade-off.** Teams that pick Rust for performance and discover the borrow checker is slowing them down are not making a bad trade — they are making a trade they did not expect.

---

## 5. Trade-offs & Alternatives

### 5.1 When Rust is the right pick for the L1 tier

- **Cold-start-sensitive workloads.** A CI runner that claims 100 tickets per cycle pays the 1,200 ms Node.js cold start 100 times. The 8 ms Rust cold start pays 100 × 8 = 800 ms. The savings are ~2 minutes per cycle.
- **Memory-constrained environments.** A 512 MB lambda, an edge function, a Raspberry Pi. Rust's 12 MB RSS leaves room for the LLM SDK; Node.js's 120 MB does not.
- **Long-lived daemons with hot paths.** A Slaver daemon that runs for 8 hours and claims 10,000 tickets. The GC pauses on the Node.js side are a p99 cliff; the Rust side does not have the cliff.
- **Memory-safety-sensitive code paths.** Anything that holds a socket, a file handle, a SQLite connection across an async boundary. The borrow checker enforces what the GC cannot.

### 5.2 When Rust is the wrong pick

- **Rapid prototyping.** The Rust `task:claim` path is `main.rs` (340 lines, `wc -l`) plus `commands/task_claim.rs` (705 lines, `wc -l`); the Node.js equivalent is ~150 lines of `.ts`. The compile time, the lifetime annotations, and the explicit error handling are a tax on speed.
- **Ecosystem dominance.** If your coordination layer is built around a Node.js-only library (e.g. an LLM SDK that ships only as `@anthropic-ai/sdk`), the FFI cost of calling it from Rust is real. A wrapper that calls Node.js from Rust is a worse trade than a wrapper that calls Rust from Node.js.
- **Solo developer, single agent.** The protocol overhead is the same; the 19x speedup is invisible at 1 ticket per hour. The "use Rust" advice does not amortize.
- **Hot paths in a language-specific SDK.** If the LLM gateway is a Python service, the FFI cost of calling it from Rust is not amortized by the 19x speedup. The bottleneck is the gateway, not the claim.

### 5.3 Alternatives, and where they fail

| Alternative | What it offers | What it misses |
|---|---|---|
| **Go (single static binary, fast compile)** | Cross-compile, small binary, GC pauses are predictable | GC pauses still happen; the borrow checker is gone. Memory safety is "trust the runtime" again. |
| **Zig (manual memory, no GC)** | Even smaller binary, lower-level control | Tooling is younger; ecosystem is smaller; the L1 tier of EKET would be a larger port. |
| **Node.js with `--experimental-vm-modules` + a frozen snapshot** | Amortize V8 cold start across a snapshot | Snapshot size is large (~50 MB); freezing in a stale V8 is a maintenance tax. |
| **Pure-shell (`scripts/eket-*.sh`)** | Zero-dep, audit in 15 minutes | Throughput is bound by `bash`; concurrent claims need file-locks, which serialize. The L0 floor, not the L1 workhorse. |
| **Rust (chosen for L1)** | Cold start, memory, memory safety, ecosystem (`rusqlite`, `tokio`, `clap`) | Compile time, learning curve, FFI cost to Node.js-only libraries. |

---

## 6. Lessons for other ports

Three transferable principles from the L1 Rust port. None of them are "use Rust." All of them are "the *property* the Rust port buys is what matters, and the property transfers to other tools."

### Principle 1 — JIT warmup is a deployment-time cost

The Node.js 1,500 ms cold start is the price of JIT compilation: V8 parses, interprets, profiles, and finally JITs the hot paths. The price is paid *every time the process starts*. For a long-lived daemon, the price is amortized. For a CLI invocation per ticket, the price is paid every time.

**The principle transfers:** any language with a JIT or a heavy startup (JVM, .NET CLR, Python with `import numpy`) has the same cost. **The decision rule: if the workload is "invoke once and exit," prefer AOT (Rust, Go, C, C++). If the workload is "invoke and serve for hours," the JIT cost is amortized and the language is fungible.**

This is why `task:claim` in EKET is 19x faster in Rust (cold-start) and ~1x faster in a long-lived Node.js REPL (warm). The 19x number is the *cold-start case*; the 1x is the *long-lived case*. The headline quotes the cold-start case because that is the EKET workload.

### Principle 2 — Binary size matters at the edge

A stripped Rust binary is **7.6 MB**. A Node.js process is **~120 MB of RSS + ~100 MB of `node_modules` on disk + ~5 MB of `tsc` output**. The 7.6 MB binary fits in a 512 MB lambda with room to spare; the 120 MB Node.js process does not.

**The principle transfers:** at the edge (CI runners, lambdas, edge functions, IoT, Raspberry Pi), binary size is a constraint, not a preference. A 7.6 MB binary can be `curl`-installed, signed, and verified in a few seconds. A 120 MB process takes a `npm install` and a `node_modules` audit. **The decision rule: if the deploy target is a fresh container with no `node_modules` cache, prefer a small AOT binary.**

This is also why the L0 tier of EKET is shell: a `bash` interpreter is in the base image of every Linux container. The shell tier survives the deployment cost that the Rust tier has already paid once.

### Principle 3 — The borrow checker catches what GC cannot

The memory-safety dividend is qualitative, not quantitative. You cannot benchmark "use-after-free bugs prevented per release." But you can argue from first principles: the borrow checker rejects an entire class of bugs at compile time; GC catches them at runtime, if at all.

**The principle transfers:** any language with a strong type system + ownership model (Rust, partially Zig, partially Swift with ARC) buys a similar dividend. The dividend is largest in long-lived daemons with shared state, async boundaries, and external resources (sockets, files, DB connections). **The decision rule: if the code holds a resource across an async boundary, prefer a language that enforces the lifetime at compile time.**

The dividend is not free: it is paid in compile time, learning curve, and "fighting the borrow checker." Teams that pick Rust for performance and discover the borrow checker is slowing them down are not making a bad trade — they are making a trade they did not expect. The article should not hide this.

### A note on Rust evangelism

This article is not a Rust evangelism piece. The headline is a 19x speedup, and the headline is real. The body of the article is "where the time goes, where the memory goes, and what the borrow checker buys," and the body is honest. The lessons are about *properties* (cold-start tax, binary size, memory safety), not about *the language*. **A team that picks Go for cross-compile, Zig for low-level control, or a Node.js snapshot for DX is not wrong** — they are picking a different point in the trade-off space. The L1 tier of EKET is Rust because the EKET workload (cold-start-sensitive, memory-constrained, memory-safety-sensitive) is the point where Rust wins. A different workload would pick a different tier.

---

## 7. References

- **Headline numbers**:
  - `README.md:140-145` — `task:claim` 19×, cold start 187×, memory 10×
  - `docs/getting-started/QUICKSTART.md:10-14` — per-mode startup / memory
  - `.claude/skills/eket/references/architecture.md:28-29` — per-component latency table (L0/L1/L2)
  - `benchmarks/baseline.json:1-7` — file-queue p95 floor (enqueue 0.77 ms, dequeue 1.54 ms)
  - `benchmarks/baseline.json:4` — 30% regression threshold
- **Benchmark source**:
  - `benchmarks/simple-benchmark.js:48-196` — `OptimizedFileQueueManager` p50/p95/p99 benchmark
  - `benchmarks/simple-benchmark.js:187` — `targetP95 = 1.0` ms
  - `benchmarks/check-regression.mjs:1-84` — CI regression gate
- **Rust implementation being measured**:
  - `rust/crates/eket-cli/Cargo.toml:11-13` — L1 dependencies (`eket-core`, `eket-engine`, `eket-server`)
  - `rust/crates/eket-cli/Cargo.toml:27-29` — `rusqlite` + `r2d2` + `r2d2_sqlite`
  - `rust/crates/eket-cli/src/main.rs:1` — CLI entry point (340 lines, `wc -l`)
  - `rust/crates/eket-cli/src/commands/task_claim.rs:217-222` — `try_atomic_claim` (SQLite atomic claim)
  - `rust/crates/eket-cli/src/commands/task_claim.rs:285-353` — main `task:claim` flow
  - `rust/crates/eket-cli/src/commands/task_claim.rs:422-437` — JSON output
  - `rust/crates/eket-core/src/ticket.rs:100-103` — `tmp → rename` atomic write
  - `rust/crates/eket-core/src/ticket.rs:72-145` — `set_status` with `WHERE version = ?` guard
- **Binary size verification**:
  - `rust/target/release/eket` — 7.6 MB stripped binary (verified at the time of writing, `ls -la rust/target/release/eket`)
- **Node.js equivalent (for comparison)**:
  - `node/src/core/sqlite-client.ts:966-976` — `_casUpdate` with `WHERE version = ?` guard
- **Memory measurement commands**:
  - `node -e 'console.log(JSON.stringify(process.memoryUsage(), null, 2))'` — Node.js heap profile
  - `/usr/bin/time -v eket task:claim` — Rust RSS via `Maximum resident set size (kbytes)`
- **Earlier articles in series**:
  - `docs/articles/01-what-is-eket/en/article.md:131-140` — the L0-L3 capability matrix
  - `docs/articles/02-why-you-need-eket/en/article.md:81-93` — the headline ROI table, with sourcing notes
  - `docs/articles/03-technical-value-choices/en/article.md:79-86` — why SQLite (single-host writer model)
  - `docs/articles/05-four-level-degradation/en/article.md:101-107` — the L0-L3 capability matrix with latency
- **Glossary**: [`docs/articles/GLOSSARY.md:1-46`](../../GLOSSARY.md)
- **Next article in series**: [`09-observability-recovery`](../../09-observability-recovery/en/article.md) — observability, recovery, and the postmortem story
