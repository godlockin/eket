#!/usr/bin/env bash
# tests/compat/run.sh — Main entry for Rust/Node JSON compat tests
#
# Usage:
#   ./tests/compat/run.sh              # run all cases
#   ./tests/compat/run.sh --check-keys # alias: same as default
#
# Exit: 0 = all pass (or all skipped), 1 = any failure
# Note: missing binaries = SKIP, not FAIL (best-effort, CI-safe)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

MODE="check-keys"
for arg in "$@"; do
    case "$arg" in
        --check-keys) MODE="check-keys" ;;
        *) echo "Unknown arg: $arg"; exit 1 ;;
    esac
done

echo "╔══════════════════════════════════════════════════════╗"
echo "║        EKET Rust/Node JSON Compat Test Suite         ║"
echo "║        mode: $MODE"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

chmod +x "$SCRIPT_DIR/lib/compare.sh"
chmod +x "$SCRIPT_DIR/cases/test_claim.sh"
chmod +x "$SCRIPT_DIR/cases/test_team_status.sh"

TOTAL_FAIL=0

run_case() {
    local case_script="$1"
    if bash "$case_script"; then
        : # pass
    else
        TOTAL_FAIL=$((TOTAL_FAIL + 1))
    fi
    echo ""
}

run_case "$SCRIPT_DIR/cases/test_claim.sh"
run_case "$SCRIPT_DIR/cases/test_team_status.sh"

echo "══════════════════════════════════════════════════════"
if [[ $TOTAL_FAIL -eq 0 ]]; then
    echo "✓ All compat checks passed (or skipped — binaries optional)"
    exit 0
else
    echo "✗ $TOTAL_FAIL case(s) failed"
    exit 1
fi
