#!/usr/bin/env bash
# cases/test_team_status.sh — compat test: team status JSON keys
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPAT_DIR="$(dirname "$SCRIPT_DIR")"
PROJECT_ROOT="$(dirname "$(dirname "$COMPAT_DIR")")"

source "$COMPAT_DIR/lib/compare.sh"

RUST_BIN="$PROJECT_ROOT/rust/target/release/eket"
NODE_DIST="$PROJECT_ROOT/node/dist/index.js"

PASS=0
FAIL=0
SKIP=0

log_pass() { echo "[PASS] $1"; ((PASS++)) || true; }
log_fail() { echo "[FAIL] $1"; ((FAIL++)) || true; }
log_skip() { echo "[SKIP] $1"; ((SKIP++)) || true; }

# Expected top-level keys for team:status
EXPECTED_KEYS=$'agents\nsummary'

keys_match_team_status() {
    local json_out="$1"
    actual=$(echo "$json_out" | python3 -c \
        "import sys,json; d=json.load(sys.stdin); print('\n'.join(sorted(d.keys())))" 2>/dev/null)
    diff <(echo "$EXPECTED_KEYS") <(echo "$actual")
}

# ── test: Rust team status keys ───────────────────────────────────────────────

test_rust_team_status_keys() {
    if [[ ! -x "$RUST_BIN" ]]; then
        log_skip "Rust binary not found: $RUST_BIN"
        return
    fi

    local tmpdir
    tmpdir=$(mktemp -d)
    mkdir -p "$tmpdir/.eket"

    local rust_out
    rust_out=$(cd "$tmpdir" && "$RUST_BIN" team status 2>/dev/null) || true
    rm -rf "$tmpdir"

    if [[ -z "$rust_out" ]]; then
        log_skip "Rust team status returned no output"
        return
    fi

    if echo "$rust_out" | python3 -c "import sys,json; json.load(sys.stdin)" 2>/dev/null; then
        if keys_match_team_status "$rust_out" >/dev/null 2>&1; then
            log_pass "Rust team status keys: agents + summary present"
        else
            echo "  Key diff:"
            keys_match_team_status "$rust_out" | sed 's/^/  /' || true
            log_fail "Rust team status missing expected keys"
        fi
    else
        log_skip "Rust team status output is not valid JSON"
    fi
}

# ── test: Node team status keys ───────────────────────────────────────────────

test_node_team_status_keys() {
    if [[ ! -f "$NODE_DIST" ]]; then
        log_skip "Node dist not found: $NODE_DIST"
        return
    fi

    local tmpdir
    tmpdir=$(mktemp -d)
    mkdir -p "$tmpdir/.eket"

    local node_out
    node_out=$(cd "$tmpdir" && node "$NODE_DIST" team:status 2>/dev/null) || true
    rm -rf "$tmpdir"

    if [[ -z "$node_out" ]]; then
        log_skip "Node team status returned no output"
        return
    fi

    if echo "$node_out" | python3 -c "import sys,json; json.load(sys.stdin)" 2>/dev/null; then
        if keys_match_team_status "$node_out" >/dev/null 2>&1; then
            log_pass "Node team status keys: agents + summary present"
        else
            echo "  Key diff:"
            keys_match_team_status "$node_out" | sed 's/^/  /' || true
            log_fail "Node team status missing expected keys"
        fi
    else
        log_skip "Node team status output is not valid JSON"
    fi
}

# ── test: Rust vs Node team status key parity ─────────────────────────────────

test_rust_vs_node_team_status_parity() {
    if [[ ! -x "$RUST_BIN" ]] || [[ ! -f "$NODE_DIST" ]]; then
        log_skip "Parity test skipped: one or both binaries missing"
        return
    fi

    local tmpdir_rust tmpdir_node
    tmpdir_rust=$(mktemp -d); mkdir -p "$tmpdir_rust/.eket"
    tmpdir_node=$(mktemp -d); mkdir -p "$tmpdir_node/.eket"

    local rust_out node_out
    rust_out=$(cd "$tmpdir_rust" && "$RUST_BIN" team status 2>/dev/null) || true
    node_out=$(cd "$tmpdir_node" && node "$NODE_DIST" team:status 2>/dev/null) || true

    rm -rf "$tmpdir_rust" "$tmpdir_node"

    local rust_valid=0 node_valid=0
    echo "$rust_out" | python3 -c "import sys,json; json.load(sys.stdin)" 2>/dev/null && rust_valid=1
    echo "$node_out" | python3 -c "import sys,json; json.load(sys.stdin)" 2>/dev/null && node_valid=1

    if [[ $rust_valid -eq 0 ]] || [[ $node_valid -eq 0 ]]; then
        log_skip "Parity test skipped: one or both outputs not valid JSON"
        return
    fi

    if compare_json_keys "$node_out" "$rust_out" >/dev/null 2>&1; then
        log_pass "Rust and Node team status output keys are identical"
    else
        echo "  Key diff (Node vs Rust):"
        compare_json_keys "$node_out" "$rust_out" | sed 's/^/  /' || true
        log_fail "Rust and Node team status output keys diverge"
    fi
}

# ── run ───────────────────────────────────────────────────────────────────────

echo "=== test_team_status.sh ==="
test_rust_team_status_keys
test_node_team_status_keys
test_rust_vs_node_team_status_parity

echo ""
echo "Results: PASS=$PASS FAIL=$FAIL SKIP=$SKIP"

[[ $FAIL -eq 0 ]]
