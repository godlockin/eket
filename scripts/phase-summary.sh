#!/usr/bin/env bash
# scripts/phase-summary.sh <phase-name> [<from-ref>] [<to-ref>]
#
# 汇总一个 Phase（默认从最近一个 phase-* tag 到 HEAD）期间所有 retro，
# 输出到 confluence/memory/phases/<phase-name>-summary.md，并打印广播文案。
#
# 用法:
#   scripts/phase-summary.sh phase-0
#   scripts/phase-summary.sh phase-1 phase-0 HEAD

set -euo pipefail

PHASE="${1:-}"
if [[ -z "$PHASE" ]]; then
  echo "Usage: $0 <phase-name> [<from-ref>] [<to-ref>]" >&2
  exit 64
fi

FROM_REF="${2:-}"
TO_REF="${3:-HEAD}"

if [[ -z "$FROM_REF" ]]; then
  FROM_REF=$(git tag --list 'phase-*' --sort=-creatordate | sed -n '2p' || true)
  [[ -z "$FROM_REF" ]] && FROM_REF=$(git rev-list --max-parents=0 HEAD | head -1)
fi

REPO_ROOT=$(git rev-parse --show-toplevel)
OUT_DIR="$REPO_ROOT/confluence/memory/phases"
OUT_FILE="$OUT_DIR/${PHASE}-summary.md"
mkdir -p "$OUT_DIR"

TS=$(date -u +%Y-%m-%dT%H:%M:%SZ)
COMMIT_LOG=$(git -C "$REPO_ROOT" log --oneline --no-decorate "${FROM_REF}..${TO_REF}" 2>/dev/null || echo "(empty range)")
if [[ "$COMMIT_LOG" == "(empty range)" ]]; then
  COMMIT_COUNT=0
else
  COMMIT_COUNT=$(printf '%s\n' "$COMMIT_LOG" | grep -c .)
fi

# 收集 retros — 仅包含 from..to range 内新增的文件
RETRO_FILES=$(git -C "$REPO_ROOT" log --diff-filter=A --name-only \
  --pretty=format: "${FROM_REF}..${TO_REF}" -- \
  'confluence/memory/retrospectives/*.md' \
  'confluence/memory/retrospectives/**/*.md' 2>/dev/null \
  | grep -v '^$' | grep -v 'README\.md' | sort || true)

{
  echo "# Phase Summary — ${PHASE}"
  echo
  echo "- generated_at: ${TS}"
  echo "- range: ${FROM_REF}..${TO_REF}"
  echo "- commits: ${COMMIT_COUNT}"
  echo
  echo "## Commits"
  echo '```'
  printf '%s\n' "$COMMIT_LOG"
  echo '```'
  echo
  echo "## Retrospectives included"
  if [[ -z "$RETRO_FILES" ]]; then
    echo "_(none)_"
  else
    while IFS= read -r f; do
      rel="${f#$REPO_ROOT/}"
      title=$(grep -m1 '^# ' "$f" | sed 's/^# //' || basename "$f")
      echo "- [${title}](../../${rel})"
    done <<< "$RETRO_FILES"
  fi
  echo
  echo "## Aggregated lessons (manual fill)"
  echo
  echo "### What worked"
  echo "- "
  echo
  echo "### What hurt"
  echo "- "
  echo
  echo "### Carry-over actions for next phase"
  echo "- [ ] "
  echo
  echo "## Broadcast text (paste into inbox/human_input.md or Slaver banner)"
  echo
  echo '```'
  echo "📣 ${PHASE} 已收尾，覆盖 ${COMMIT_COUNT} commits。请所有 Slaver 阅读 confluence/memory/phases/${PHASE}-summary.md，把 carry-over actions 同步到下一阶段计划。"
  echo '```'
} > "$OUT_FILE"

echo "✓ Phase summary written: $OUT_FILE"
echo
echo "Next:"
echo "  1) 手动填 'Aggregated lessons' 三段"
echo "  2) git add $OUT_FILE && git commit -m 'docs(phase): ${PHASE} summary'"
echo "  3) 把 broadcast 段贴到 inbox/human_input.md 或 chat 频道"
