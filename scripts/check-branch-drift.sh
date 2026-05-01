#!/usr/bin/env bash
# check-branch-drift.sh — Monitor commit drift between protected branches
# Thresholds: main↔miao > 5 → exit 1; testing↔miao > 20 → exit 1; testing↔main > 50 → warn
set -euo pipefail

RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m'

EXIT_CODE=0

check_drift() {
  local branch_a="$1" branch_b="$2" threshold="$3" severity="$4"

  git fetch origin "$branch_a" "$branch_b" --quiet 2>/dev/null || true

  local a_to_b b_to_a
  a_to_b=$(git rev-list --count "origin/$branch_a..origin/$branch_b" 2>/dev/null || echo "?")
  b_to_a=$(git rev-list --count "origin/$branch_b..origin/$branch_a" 2>/dev/null || echo "?")

  local max_drift
  if [[ "$a_to_b" == "?" || "$b_to_a" == "?" ]]; then
    echo -e "${RED}ERROR${NC}: Cannot compute drift for $branch_a ↔ $branch_b"
    return 1
  fi

  max_drift=$(( a_to_b > b_to_a ? a_to_b : b_to_a ))

  # Check content drift (actual file differences)
  local file_diff
  file_diff=$(git diff --shortstat "origin/$branch_a" "origin/$branch_b" 2>/dev/null || echo "")

  if [[ $max_drift -gt $threshold ]]; then
    if [[ "$severity" == "error" ]]; then
      echo -e "${RED}FAIL${NC}: $branch_a ↔ $branch_b drift = $max_drift commits (threshold: $threshold)"
      echo "  → $branch_a..$branch_b: $a_to_b | $branch_b..$branch_a: $b_to_a"
      [[ -n "$file_diff" ]] && echo "  → Content: $file_diff"
      EXIT_CODE=1
    else
      echo -e "${YELLOW}WARN${NC}: $branch_a ↔ $branch_b drift = $max_drift commits (threshold: $threshold)"
      echo "  → $branch_a..$branch_b: $a_to_b | $branch_b..$branch_a: $b_to_a"
      [[ -n "$file_diff" ]] && echo "  → Content: $file_diff"
    fi
  else
    echo -e "${GREEN}OK${NC}: $branch_a ↔ $branch_b drift = $max_drift commits (threshold: $threshold)"
    [[ -n "$file_diff" ]] && echo "  → Content: $file_diff" || echo "  → Content: identical"
  fi
}

echo "=== Branch Drift Report ==="
echo "Date: $(date -Iseconds)"
echo ""

check_drift "main" "miao" 5 "error"
check_drift "testing" "miao" 20 "error"
check_drift "testing" "main" 50 "warn"

echo ""
if [[ $EXIT_CODE -eq 0 ]]; then
  echo -e "${GREEN}All branch drift within acceptable thresholds.${NC}"
else
  echo -e "${RED}Branch drift exceeds thresholds! Action required.${NC}"
fi

exit $EXIT_CODE
