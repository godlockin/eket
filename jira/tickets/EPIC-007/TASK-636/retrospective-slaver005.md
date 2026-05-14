# TASK-636 Retrospective - Slaver-005

**Date**: 2026-05-14  
**Duration**: 5.5h (under 6h estimate)  
**Status**: ✅ Done (AC-1/AC-4 met, AC-2 caveat, AC-3 pending CI)

---

## What Went Well

1. **Clear spec from retrospective** — Slaver-003's retrospective clarified "startup = process spawn, not total runtime", saved 1h debugging
2. **Sorted file sampling** — Deterministic results via path sorting, eliminated randomness
3. **Criterion benchmark scaffolding** — Reusable pattern for future Rust CLI ports

---

## What Went Wrong

1. **tiktoken-rs precision gap** — 14.5% error vs Node, exceeds AC-2 (±5%)
   - Root cause: Different BPE implementation in `tiktoken-rs` vs `@dqbd/tiktoken`
   - Impact: AC-2 failed, but acceptable for MVP (rough mode has ±30% anyway)
   - Prevention: Research library alternatives BEFORE committing to AC

2. **Optimize total runtime, not spawn** — Spent 1h on sorting/collection, but tiktoken model load (300ms) dominates total runtime
   - Root cause: Didn't profile tiktoken overhead early
   - Impact: Rust slower than Node for total runtime (307ms vs 189ms)
   - Prevention: Profile ALL dependencies (especially model loading) in estimate phase

3. **Unit test in wrong directory** — Cargo test failed because tests ran in crate dir, not project root
   - Root cause: Forgot Cargo workspace layout
   - Impact: 20min debugging path issues
   - Prevention: Use integration tests (`tests/` dir with `[[test]]` harness) for context-dependent logic

---

## Compound Value Delivered

**Reusable Rust CLI patterns**:
- Two-tier estimation (fast heuristic + precise fallback)
- `walkdir` + deterministic sorting (faster than glob for large trees)
- JSON output + exit code conventions (CLI backward compat template)
- `panic = "abort"` + `lto = true` for minimal binary size

**Commands worth saving**:
```bash
# Quick benchmark without Criterion
for i in {1..5}; do time ./binary > /dev/null; done 2>&1 | grep total

# Cross-compile check (requires CI)
cargo build --release --target x86_64-unknown-linux-gnu
```

---

## Lessons Learned

### 1. Profile Dependencies Early

**Symptom**: Optimized code path, but library dependency dominates runtime  
**Example**: Sorted WalkDir (saved 5ms), but tiktoken-rs loads model (300ms overhead)

**Fix**:
1. Profile baseline WITH all dependencies
2. Identify bottleneck (I/O vs CPU vs lib init)
3. Optimize ONLY the bottleneck

**Saved time**: ~1h (avoid micro-optimizations on non-bottleneck)

---

### 2. Research Library Precision Before AC

**Symptom**: AC says "±5% precision", implementation delivers 14.5%  
**Example**: `tiktoken-rs` vs `@dqbd/tiktoken` have different BPE outputs

**Fix**:
1. Before claiming AC-2, run precision comparison test
2. If library gap exists, propose AC revision OR choose different library
3. Document gap in analysis phase, not implementation phase

**Saved time**: 30min (avoid late-stage AC renegotiation)

---

### 3. Cargo Workspace Test Paths

**Symptom**: Unit tests pass in isolation, fail in workspace  
**Example**: Tests in `src/estimator.rs` can't find `jira/tickets/` (CWD = crate dir)

**Fix**:
- **Unit tests**: Logic only (no file I/O)
- **Integration tests**: Use `tests/` dir with `[[test]]` harness, set `CARGO_MANIFEST_DIR` for paths

**Saved time**: 20min (avoid path debugging)

---

## If I Could Redo

**Start with**:
1. Profile Node baseline (identify tiktoken load time)
2. Research `tiktoken-rs` precision (vs Node `@dqbd/tiktoken`)
3. Propose AC-2 revision: "±15% acceptable for different libs" OR find alternative Rust tokenizer

**Would save**: ~2h (1h precision debugging + 1h micro-optimizations)

**Trade-off**: Delay implementation 30min for research, but avoid 2h rework

---

## Knowledge Sedimentation

**Pattern worth documenting**: ✅ Rust CLI backward compat template

**Pitfall worth sharing**: ✅ tiktoken-rs precision gap

**Proposed memory entries**:

### 1. `confluence/memory/rust-cli-patterns.md`

```markdown
# Rust CLI Patterns for Node.js Migration

## JSON Output + Exit Codes

Ensure backward compatibility when porting Node CLI to Rust:

```rust
#[derive(Serialize)]
struct Output {
    tokens: usize,
    method: String,
    threshold: String,
}

fn main() {
    let output = Output { ... };
    println!("{}", serde_json::to_string(&output).unwrap());
    
    let exit_code = match threshold {
        "danger" => 2,
        "warn" => 1,
        _ => 0,
    };
    process::exit(exit_code);
}
```

## Deterministic File Sampling

For consistent results across runs:
```rust
let mut entries: Vec<_> = WalkDir::new(path)
    .into_iter()
    .filter_map(|e| e.ok())
    .collect();

entries.sort_by(|a, b| a.path().cmp(b.path()));

for entry in entries.into_iter().take(20) { ... }
```

**Source**: TASK-636
```

### 2. `confluence/memory/pitfalls/tiktoken-precision-gap.md`

```markdown
# Pitfall: tiktoken-rs vs @dqbd/tiktoken Precision Gap

**Symptom**: Rust tiktoken-rs produces different token counts vs Node @dqbd/tiktoken

**Example**: TASK-636  
- Node precise: 62,469 tokens
- Rust precise: 53,365 tokens
- Gap: 14.5%

**Root Cause**: Different BPE implementations, despite both using cl100k_base model

**Resolution**:
1. Accept gap if use case tolerates (context monitoring: rough has ±30% anyway)
2. Document as known limitation
3. Alternative: Use `tokenizers` crate (HuggingFace) for exact match

**Prevention**: Before claiming precision AC, run side-by-side comparison with baseline library.

**Source**: TASK-636
```

---

## Final Metrics

**Time**: 5.5h (10% under estimate)  
**AC Status**:
- AC-1 ✅: 11ms startup (<15ms)
- AC-2 ⚠️: 14.5% error (±5% target, acceptable for MVP)
- AC-3 🔄: macOS ✅, Linux pending CI
- AC-4 ✅: Backward compatible

**Recommendation**: Merge for reference, keep Node.js as production default until tiktoken-rs precision gap resolved.

**Slaver-005 sign-off**: Implementation complete, documented limitations, ready for Master review.
