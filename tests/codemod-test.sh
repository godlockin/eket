#!/usr/bin/env bash
# tests/codemod-test.sh — runs codemod on fixtures, diffs vs expected/, PASS/FAIL per case.
set -euo pipefail
DIR="$(dirname "$0")"
SCRIPT="$DIR/../scripts/codemod-inject-3sections.sh"
BEFORE="$DIR/fixtures/codemod/before"
EXPECTED="$DIR/fixtures/codemod/expected"
PASS=0; FAIL=0

check() {
  local id="$1" tmp
  tmp=$(mktemp -t codemod-test).md
  cp "$BEFORE/${id}.md" "$tmp"
  bash "$SCRIPT" "$tmp" >/dev/null 2>&1
  if [[ "$id" == "b" ]]; then          # idempotence: must be unchanged
    local ref="$BEFORE/${id}.md"
  else
    local ref="$EXPECTED/${id}.md"
  fi
  if diff -q "$ref" "$tmp" >/dev/null 2>&1; then
    echo "PASS case-${id}"; PASS=$((PASS+1))
  else
    echo "FAIL case-${id}"; diff "$ref" "$tmp" || true; FAIL=$((FAIL+1))
  fi
  rm -f "$tmp"
}

check a; check b; check c
echo ""; echo "Results: ${PASS} PASS, ${FAIL} FAIL"
[[ $FAIL -eq 0 ]]
