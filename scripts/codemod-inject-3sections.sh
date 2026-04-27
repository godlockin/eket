#!/usr/bin/env bash
# codemod-inject-3sections.sh
# Injects 3-section TODO skeleton (Common Rationalizations / Red Flags / Verification)
# after the LAST ``` in each target .md file.
#
# Usage: ./scripts/codemod-inject-3sections.sh [--dry-run] <dir-or-file> [<dir-or-file> ...]
#
# --dry-run   List files that would be modified; do not write.
# Idempotent: files already containing "## Common Rationalizations" are skipped.

set -euo pipefail

DRY_RUN=false
TARGETS=()

for arg in "$@"; do
  if [[ "$arg" == "--dry-run" ]]; then
    DRY_RUN=true
  else
    TARGETS+=("$arg")
  fi
done

if [[ ${#TARGETS[@]} -eq 0 ]]; then
  echo "Usage: $0 [--dry-run] <dir-or-file> [...]" >&2
  exit 1
fi

# ── Write skeleton to a temp file (avoids awk -v multiline issue) ─────────────
SKELETON_FILE=$(mktemp -t codemod-skeleton)
cat > "$SKELETON_FILE" << 'SKELETON_EOF'

## Common Rationalizations

> ⚠️ 非穷举清单 — 待该领域专家补充具体借口（TODO: TASK-225-followup）。

| 借口 | 反驳 |
|------|------|
| <!-- TODO: domain-specific rationalization #1 --> | <!-- TODO: rebuttal --> |
| <!-- TODO: domain-specific rationalization #2 --> | <!-- TODO: rebuttal --> |
| <!-- TODO: domain-specific rationalization #3 --> | <!-- TODO: rebuttal --> |

## Red Flags

<!-- TODO: 替换为该领域 ≥3 条客观可观测的警示信号 -->

- [ ] TODO: red flag #1
- [ ] TODO: red flag #2
- [ ] TODO: red flag #3

## Verification

<!-- TODO: 替换为该领域 ≥3 条可执行自查项 -->

- [ ] TODO: verification #1
- [ ] TODO: verification #2
- [ ] TODO: verification #3
SKELETON_EOF

trap 'rm -f "$SKELETON_FILE"' EXIT

# ── Collect target files ──────────────────────────────────────────────────────
collect_files() {
  local target="$1"
  if [[ -f "$target" ]]; then
    echo "$target"
  elif [[ -d "$target" ]]; then
    find "$target" -name "*.md" -type f | sort
  else
    echo "WARN: target not found: $target" >&2
  fi
}

FILES=()
for t in "${TARGETS[@]}"; do
  while IFS= read -r f; do
    FILES+=("$f")
  done < <(collect_files "$t")
done

# ── Process each file ─────────────────────────────────────────────────────────
injected_count=0
todo_total=0

for file in "${FILES[@]}"; do
  # Idempotence check
  if grep -q "^## Common Rationalizations" "$file" 2>/dev/null; then
    echo "[SKIP] already has section: $file"
    continue
  fi

  if $DRY_RUN; then
    echo "[DRY-RUN] would inject: $file"
    injected_count=$((injected_count + 1))
    continue
  fi

  # Find last ``` line number using awk
  last_backtick=$(awk '/^```/{n=NR} END{print n+0}' "$file")
  if [[ "$last_backtick" -eq 0 ]]; then
    echo "[SKIP] no closing \`\`\` found: $file"
    continue
  fi

  # Inject skeleton after the last ``` using awk (reads skeleton from file)
  tmpfile=$(mktemp -t codemod-out)
  awk -v insert_after="$last_backtick" -v skel="$SKELETON_FILE" '
    {
      print
      if (NR == insert_after) {
        while ((getline line < skel) > 0) print line
      }
    }
  ' "$file" > "$tmpfile"

  mv "$tmpfile" "$file"

  todo_count=$(grep -c "TODO:" "$file" || true)
  todo_total=$((todo_total + todo_count))
  injected_count=$((injected_count + 1))
  echo "[INJECTED] $file (TODOs in file: $todo_count)"
done

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
if $DRY_RUN; then
  echo "dry-run summary: would inject: $injected_count files"
else
  echo "injected: $injected_count files, $todo_total TODOs total"
fi
