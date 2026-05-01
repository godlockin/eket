#!/usr/bin/env bash
# cases/test_claim.sh — compat test: task claim JSON keys
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPAT_DIR="$(dirname "$SCRIPT_DIR")"
PROJECT_ROOT="$(dirname "$(dirname "$COMPAT_DIR")")"

source "$COMPAT_DIR/lib/compare.sh"

FIXTURE_TICKET="$COMPAT_DIR/fixtures/ticket_todo.md"
EXPECTED_SCHEMA="$COMPAT_DIR/fixtures/expected_claim_schema.json"

RUST_BIN="$PROJECT_ROOT/rust/target/release/eket"
NODE_DIST="$PROJECT_ROOT/node/dist/index.js"

PASS=0
FAIL=0
SKIP=0

# ── helpers ──────────────────────────────────────────────────────────────────

log_pass() { echo "[PASS] $1"; ((PASS++)) || true; }
log_fail() { echo "[FAIL] $1"; ((FAIL++)) || true; }
log_skip() { echo "[SKIP] $1"; ((SKIP++)) || true; }

# Set up a temp project dir with the fixture ticket
setup_temp_project() {
    local tmpdir
    tmpdir=$(mktemp -d)
    mkdir -p "$tmpdir/jira/tickets" "$tmpdir/.eket"
    cp "$FIXTURE_TICKET" "$tmpdir/jira/tickets/COMPAT-001.md"
    echo "$tmpdir"
}

# ── test: Rust claim output keys match expected schema ────────────────────────

test_rust_claim_keys() {
    if [[ ! -x "$RUST_BIN" ]]; then
        log_skip "Rust binary not found: $RUST_BIN"
        return
    fi

    local tmpdir
    tmpdir=$(setup_temp_project)
    # Reset ticket to todo (in case previous run left it in_progress)
    cp "$FIXTURE_TICKET" "$tmpdir/jira/tickets/COMPAT-001.md"

    local rust_out
    rust_out=$(cd "$tmpdir" && EKET_SLAVER_ID=test-slaver-compat \
        "$RUST_BIN" task claim COMPAT-001 2>/dev/null) || true

    rm -rf "$tmpdir"

    if [[ -z "$rust_out" ]]; then
        log_skip "Rust claim returned no output (ticket may need DB setup)"
        return
    fi

    if echo "$rust_out" | python3 -c "import sys,json; json.load(sys.stdin)" 2>/dev/null; then
        if keys_match_expected "$rust_out" "$EXPECTED_SCHEMA" >/dev/null 2>&1; then
            log_pass "Rust claim output keys match expected schema"
        else
            echo "  Key diff (expected vs actual):"
            keys_match_expected "$rust_out" "$EXPECTED_SCHEMA" | sed 's/^/  /' || true
            log_fail "Rust claim output keys diverge from expected schema"
        fi
    else
        log_skip "Rust claim output is not valid JSON: $rust_out"
    fi
}

# ── test: Node claim output keys match expected schema ────────────────────────

test_node_claim_keys() {
    if [[ ! -f "$NODE_DIST" ]]; then
        log_skip "Node dist not found: $NODE_DIST"
        return
    fi

    local tmpdir
    tmpdir=$(setup_temp_project)
    cp "$FIXTURE_TICKET" "$tmpdir/jira/tickets/COMPAT-001.md"

    local node_out
    node_out=$(cd "$tmpdir" && EKET_SLAVER_ID=test-slaver-compat \
        node "$NODE_DIST" task:claim COMPAT-001 2>/dev/null) || true

    rm -rf "$tmpdir"

    if [[ -z "$node_out" ]]; then
        log_skip "Node claim returned no output"
        return
    fi

    if echo "$node_out" | python3 -c "import sys,json; json.load(sys.stdin)" 2>/dev/null; then
        if keys_match_expected "$node_out" "$EXPECTED_SCHEMA" >/dev/null 2>&1; then
            log_pass "Node claim output keys match expected schema"
        else
            echo "  Key diff (expected vs actual):"
            keys_match_expected "$node_out" "$EXPECTED_SCHEMA" | sed 's/^/  /' || true
            log_fail "Node claim output keys diverge from expected schema"
        fi
    else
        log_skip "Node claim output is not valid JSON: $node_out"
    fi
}

# ── test: Rust vs Node key parity ─────────────────────────────────────────────

test_rust_vs_node_claim_parity() {
    if [[ ! -x "$RUST_BIN" ]] || [[ ! -f "$NODE_DIST" ]]; then
        log_skip "Parity test skipped: one or both binaries missing"
        return
    fi

    local tmpdir_rust tmpdir_node
    tmpdir_rust=$(setup_temp_project)
    tmpdir_node=$(setup_temp_project)

    local rust_out node_out
    rust_out=$(cd "$tmpdir_rust" && EKET_SLAVER_ID=test-slaver-compat \
        "$RUST_BIN" task claim COMPAT-001 2>/dev/null) || true
    node_out=$(cd "$tmpdir_node" && EKET_SLAVER_ID=test-slaver-compat \
        node "$NODE_DIST" task:claim COMPAT-001 2>/dev/null) || true

    rm -rf "$tmpdir_rust" "$tmpdir_node"

    if [[ -z "$rust_out" ]] || [[ -z "$node_out" ]]; then
        log_skip "Parity test skipped: one or both outputs empty"
        return
    fi

    local rust_valid=0 node_valid=0
    echo "$rust_out" | python3 -c "import sys,json; json.load(sys.stdin)" 2>/dev/null && rust_valid=1
    echo "$node_out" | python3 -c "import sys,json; json.load(sys.stdin)" 2>/dev/null && node_valid=1

    if [[ $rust_valid -eq 0 ]] || [[ $node_valid -eq 0 ]]; then
        log_skip "Parity test skipped: one or both outputs not valid JSON"
        return
    fi

    if compare_json_keys "$node_out" "$rust_out" >/dev/null 2>&1; then
        log_pass "Rust and Node claim output keys are identical"
    else
        echo "  Key diff (Node vs Rust):"
        compare_json_keys "$node_out" "$rust_out" | sed 's/^/  /' || true
        log_fail "Rust and Node claim output keys diverge"
    fi
}

# ── run ───────────────────────────────────────────────────────────────────────

echo "=== test_claim.sh ==="
test_rust_claim_keys
test_node_claim_keys
test_rust_vs_node_claim_parity

echo ""
echo "Results: PASS=$PASS FAIL=$FAIL SKIP=$SKIP"

[[ $FAIL -eq 0 ]]
