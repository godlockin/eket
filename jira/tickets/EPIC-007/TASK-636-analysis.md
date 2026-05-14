# TASK-636 Analysis Report

**Slaver**: Slaver-003  
**Time**: 2026-05-13 15:00  
**Estimate**: 6h

## 1. Requirement Understanding

Port Node.js context monitor to Rust for:
- <10ms startup (vs Node 200ms)
- ±5% precision vs Node baseline
- Cross-platform (macOS + Linux)
- CLI backward compatibility

## 2. Technical Design

### Core Logic (from `context-estimator.ts`)

**Two-tier estimation**:
1. **Rough**: byte count × 0.3 → tokens (fast, ±30%)
2. **Precise**: tiktoken encoding (slow, ±10%)
3. **Smart**: rough < 40K → skip precise

**File patterns**:
```
jira/tickets/**/*.md
confluence/memory/**/*.md
.eket/ACTIVE_CONTEXT
CLAUDE.md
.claude/CLAUDE.md
```

**Cap**: 20 files/pattern (OOM protection)

### Rust Implementation

**Crate structure**:
```
rust/crates/context-mon/
├── Cargo.toml
├── src/
│   ├── main.rs          # CLI entry + thresholds
│   ├── estimator.rs     # ContextEstimator port
│   └── lib.rs           # Public API
├── benches/
│   └── startup.rs       # <10ms validation
└── tests/
    └── precision.rs     # ±5% vs Node
```

**Dependencies**:
- `tiktoken-rs` (precise tokenization)
- `glob` (pattern matching)
- `serde_json` (output compat)
- `criterion` (benchmarking)

### CLI Interface (unchanged)

```bash
# Input: none (CWD-based)
# Output: JSON to stdout
{"tokens": 65432, "method": "precise", "threshold": "safe"}

# Exit codes (preserved):
# 0 = safe (<70K)
# 1 = warn (70-85K)
# 2 = danger (≥85K)
# 3 = error
```

## 3. Impact Analysis

| Module | Impact | Note |
|--------|--------|------|
| node/dist/context-monitor.js | Replace | Rust binary takes over |
| logs/context-monitor.jsonl | Keep | Same format, append-only |
| CI scripts | Low | Update shebang if needed |

## 4. Task Breakdown

| Subtask | Est | Priority |
|---------|-----|----------|
| 1. Cargo.toml + project scaffolding | 0.5h | P0 |
| 2. Port roughEstimate (stat-based) | 1h | P0 |
| 3. Port preciseEstimate (tiktoken-rs) | 2h | P0 |
| 4. CLI output + exit codes | 0.5h | P0 |
| 5. Startup benchmark (<10ms) | 1h | P0 |
| 6. Precision test (±5% vs Node) | 1h | P0 |

**Total**: 6h

## 5. Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| tiktoken-rs API diff vs Node | Medium | High | Check tokenizer parity first |
| Cross-platform glob behavior | Low | Medium | Test macOS + Linux CI |
| Startup overhead from Rust stdlib | Low | Low | Use `--release` + strip binary |

## 6. Approval Request

**Ready to proceed**: Yes  
**Dependencies clear**: Yes (TASK-632 ✅)  
**Estimation confident**: High (all logic in baseline code)
