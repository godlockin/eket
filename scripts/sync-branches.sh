#!/usr/bin/env bash
# sync-branches.sh — One-click branch synchronization: main → testing → miao
set -euo pipefail

RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m'

REMOTE_URL="git@github.com:godlockin/eket.git"
DRY_RUN=false
PRUNE=false
ORIGINAL_BRANCH=""

usage() {
  echo "Usage: $0 [--dry-run] [--prune]"
  echo "  --dry-run  Check what would happen without executing"
  echo "  --prune    Clean up merged feature branches after sync"
  exit 0
}

# Parse args
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=true; shift ;;
    --prune)   PRUNE=true; shift ;;
    --help|-h) usage ;;
    *) echo -e "${RED}Unknown option: $1${NC}"; exit 1 ;;
  esac
done

# Remember current branch
ORIGINAL_BRANCH=$(git rev-parse --abbrev-ref HEAD)

cleanup() {
  echo ""
  echo -e "${YELLOW}Switching back to original branch: $ORIGINAL_BRANCH${NC}"
  git checkout "$ORIGINAL_BRANCH" --quiet
}
trap cleanup EXIT

echo "=== Branch Sync ==="
echo "Date: $(date -Iseconds)"
echo "Mode: $( $DRY_RUN && echo 'DRY-RUN' || echo 'LIVE' )"
echo ""

# Step 1: Fetch
echo -e "${GREEN}[1/4]${NC} Fetching from origin..."
git fetch origin --quiet

# Step 2: Sync testing ← main
echo -e "${GREEN}[2/4]${NC} Merging main → testing..."
if $DRY_RUN; then
  echo "  (dry-run) would: git checkout testing && git merge origin/main"
else
  git checkout testing --quiet
  git merge origin/main -m "sync: main → testing" --quiet
fi

# Step 3: Sync miao ← main
echo -e "${GREEN}[3/4]${NC} Merging main → miao (ours strategy)..."
if $DRY_RUN; then
  echo "  (dry-run) would: git checkout miao && git merge origin/main -X ours"
else
  git checkout miao --quiet
  git merge origin/main -X ours -m "sync: main → miao" --quiet
fi

# Step 4: Push
echo -e "${GREEN}[4/4]${NC} Pushing branches..."
if $DRY_RUN; then
  echo "  (dry-run) would push: main, testing, miao to $REMOTE_URL"
else
  git push "$REMOTE_URL" main testing miao
fi

# Verification
echo ""
echo "=== Verification ==="
for pair in "main:testing" "main:miao" "testing:miao"; do
  a="${pair%%:*}"
  b="${pair##*:}"
  diff_lines=$(git diff "origin/$a" "origin/$b" | wc -l | tr -d ' ')
  if [[ "$diff_lines" -eq 0 ]]; then
    echo -e "${GREEN}OK${NC}: origin/$a ↔ origin/$b — no diff"
  else
    echo -e "${YELLOW}DRIFT${NC}: origin/$a ↔ origin/$b — $diff_lines lines differ"
  fi
done

# Optional: prune merged feature branches
if $PRUNE; then
  echo ""
  echo "=== Pruning merged feature branches ==="
  merged_branches=$(git branch --merged origin/main | grep -E '^\s*feature/' || true)
  if [[ -z "$merged_branches" ]]; then
    echo -e "${GREEN}No merged feature branches to prune.${NC}"
  else
    echo "Merged branches:"
    echo "$merged_branches"
    if $DRY_RUN; then
      echo "  (dry-run) would delete the above branches"
    else
      echo "$merged_branches" | xargs -r git branch -d
      echo -e "${GREEN}Pruned.${NC}"
    fi
  fi
fi

echo ""
echo -e "${GREEN}Sync complete.${NC}"
