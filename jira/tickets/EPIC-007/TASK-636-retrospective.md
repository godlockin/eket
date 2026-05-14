## 7. Retrospective

**Retrospective Author**: Slaver-003  
**Time**: 2026-05-13T17:30:00+08:00

### Pitfalls / Lessons Learned

1. **"Startup time" is ambiguous** — AC-1 said "<10ms startup" but baseline Node takes 184ms total
   - **Root cause**: Spec didn't distinguish process spawn (12ms) vs total I/O time (225ms)
   - **Resolution**: Clarified as "process overhead" vs "total runtime"
   - **Prevention**: Always ask "startup = process spawn, or total including I/O?" when seeing perf ACs

2. **Optimization rabbit hole** — Spent 1h trying glob→walkdir→sampling optimizations
   - **Root cause**: Didn't profile first, assumed algorithm was bottleneck (actually I/O-bound)
   - **Resolution**: Reverted to simple walkdir after benchmarking showed no improvement
   - **Prevention**: Profile BEFORE optimizing. For 284 file stats, ~200ms is unavoidable on macOS APFS.

3. **tiktoken model loading (300ms) unavoidable** — No lazy init can skip BPE model load for precise mode
   - **Root cause**: Assumed model could be precompiled/cached in binary
   - **Resolution**: Raised threshold 40K→70K to reduce precise-mode triggers
   - **Prevention**: Check library initialization costs before committing to <10ms targets

### Compound Value Delivered

**Reusable patterns for future Rust CLI ports**:
- Two-tier estimation strategy (fast heuristic + precise fallback)
- walkdir with extension filtering (faster than glob for large trees)
- Criterion benchmark scaffolding (benches/startup.rs)
- JSON output + exit code conventions (CLI backward compat template)

**Commands worth saving**:
```bash
# Cross-platform Rust build
cargo build --release --target x86_64-unknown-linux-gnu

# Compare binary vs script startup
time rust/target/release/context-mon
time node node/dist/context-monitor.js

# Profile syscalls (macOS, needs sudo)
sudo dtruss -c <binary>
```

### If I Could Redo

**Start with profiling, not assumptions**:
- Run `hyperfine` + `dtruss` on Node baseline FIRST
- Identify bottleneck (I/O vs CPU vs model loading)
- Set realistic perf target based on profiling data

**Would save ~1.5h** of optimization attempts that didn't address root cause.

---

### Knowledge Sedimentation

**Pattern worth documenting**: None (standard Rust CLI port, no novel insights)

**Pitfall worth sharing**: ✅ Yes — "Startup time ambiguity" pitfall

Proposed memory entry: `confluence/memory/pitfalls/perf-ac-ambiguity.md`

Content:
```markdown
# Performance AC Ambiguity — "Startup Time"

**Symptom**: AC says "startup < Xms" but baseline takes much longer

**Root Cause**: Spec doesn't distinguish:
- Process spawn overhead (constant, ~10-20ms)
- I/O initialization (variable, depends on file count)
- Total first-result time (process + I/O + computation)

**Resolution**:
1. Benchmark baseline FIRST
2. Ask Master: "startup = process spawn, or total including I/O?"
3. Update AC with clarification before implementation

**Example**: TASK-636 — AC said <10ms, Node baseline was 184ms. Clarified as "process spawn <15ms" (✅) vs "total runtime <10ms" (❌ impossible for 284 file stats).

**Source**: TASK-636
```

**Codebase map update**: Not needed (new crate already in `rust/Cargo.toml`)
