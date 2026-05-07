#!/usr/bin/env bash
# count-tokens.sh — 估算 EKET agent session 加载的 token 数
# Usage:
#   bash scripts/count-tokens.sh --role master
#   bash scripts/count-tokens.sh --role slaver
#   bash scripts/count-tokens.sh --compare

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

CLAUDE_MD="${REPO_ROOT}/CLAUDE.md"
MASTER_RULES="${REPO_ROOT}/template/docs/MASTER-RULES.md"
SLAVER_RULES="${REPO_ROOT}/template/docs/SLAVER-RULES.md"
CLAUDE_MD_BAK="${REPO_ROOT}/CLAUDE.md.bak"

# count_chars <file> [file ...] → total byte count across all files
count_chars() {
  local total=0
  for f in "$@"; do
    if [[ ! -f "$f" ]]; then
      echo "ERROR: file not found: $f" >&2
      exit 1
    fi
    local size
    size=$(wc -c < "$f")
    total=$(( total + size ))
  done
  echo "$total"
}

# tokens_from_chars <chars> → estimated token count (1 token ≈ 4 chars)
tokens_from_chars() {
  echo $(( $1 / 4 ))
}

# reduction_pct <old_chars> <new_chars> → reduction percentage (integer)
reduction_pct() {
  local old=$1 new=$2
  if [[ "$old" -eq 0 ]]; then
    echo 0
    return
  fi
  echo $(( (old - new) * 100 / old ))
}

usage() {
  cat <<EOF
Usage: $(basename "$0") [--role master|slaver] [--compare]

  --role master   Show estimated token count for Master session
  --role slaver   Show estimated token count for Slaver session
  --compare       Show before/after comparison report (requires CLAUDE.md.bak)
EOF
  exit 1
}

if [[ $# -eq 0 ]]; then
  usage
fi

case "$1" in
  --role)
    if [[ $# -lt 2 ]]; then
      echo "ERROR: --role requires an argument (master|slaver)" >&2
      exit 1
    fi
    case "$2" in
      master)
        chars=$(count_chars "$CLAUDE_MD" "$MASTER_RULES")
        tokens=$(tokens_from_chars "$chars")
        echo "Master session: ~${tokens} tokens (${chars} chars)"
        ;;
      slaver)
        chars=$(count_chars "$CLAUDE_MD" "$SLAVER_RULES")
        tokens=$(tokens_from_chars "$chars")
        echo "Slaver session: ~${tokens} tokens (${chars} chars)"
        ;;
      *)
        echo "ERROR: unknown role '$2'. Use master or slaver." >&2
        exit 1
        ;;
    esac
    ;;

  --compare)
    if [[ ! -f "$CLAUDE_MD_BAK" ]]; then
      echo "No CLAUDE.md.bak found."
      echo "To generate a baseline, run before the split:"
      echo "  cp CLAUDE.md CLAUDE.md.bak"
      exit 0
    fi

    old_chars=$(count_chars "$CLAUDE_MD_BAK")
    old_tokens=$(tokens_from_chars "$old_chars")

    master_chars=$(count_chars "$CLAUDE_MD" "$MASTER_RULES")
    master_tokens=$(tokens_from_chars "$master_chars")
    master_reduction=$(reduction_pct "$old_chars" "$master_chars")

    slaver_chars=$(count_chars "$CLAUDE_MD" "$SLAVER_RULES")
    slaver_tokens=$(tokens_from_chars "$slaver_chars")
    slaver_reduction=$(reduction_pct "$old_chars" "$slaver_chars")

    echo "=== Token Compression Report ==="
    echo ""
    echo "Before (CLAUDE.md.bak):  ~${old_tokens} tokens (${old_chars} chars)"
    echo ""
    echo "After split:"
    echo "  Master session: ~${master_tokens} tokens (${master_chars} chars)  reduction: ${master_reduction}%"
    echo "  Slaver session: ~${slaver_tokens} tokens (${slaver_chars} chars)  reduction: ${slaver_reduction}%"
    echo ""

    # Acceptance check: ≤ 85% of original (≥ 15% reduction)
    threshold=$(( old_chars * 85 / 100 ))
    echo "--- Acceptance Check (target: ≤ 85% of original = ~$(tokens_from_chars "$threshold") tokens) ---"

    if [[ "$master_chars" -le "$threshold" ]]; then
      echo "  Master: PASS (${master_reduction}% reduction)"
    else
      echo "  Master: FAIL (only ${master_reduction}% reduction, need ≥ 15%)"
    fi

    if [[ "$slaver_chars" -le "$threshold" ]]; then
      echo "  Slaver: PASS (${slaver_reduction}% reduction)"
    else
      echo "  Slaver: FAIL (only ${slaver_reduction}% reduction, need ≥ 15%)"
    fi
    ;;

  *)
    echo "ERROR: unknown option '$1'" >&2
    usage
    ;;
esac
