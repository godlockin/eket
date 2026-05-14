#!/bin/bash
# UserPromptSubmit Hook - TASK-631
# Tracks conversation turns and estimates context usage
# Version: 1.0.0
# AC: AC-1 (counter), AC-2 (estimate), AC-3 (warning), AC-4 TODO

# Error tolerance: continue on error, always succeed
set +e

# Initialize variables
STATE_DIR=".eket/state"
COUNTER_FILE="${STATE_DIR}/context-turn-count"
CONTEXT_THRESHOLD=10  # AC-3: 10 turns threshold

# Ensure state directory exists
mkdir -p "${STATE_DIR}"

# AC-1: Increment turn counter
if [[ -f "${COUNTER_FILE}" ]]; then
  CURRENT_COUNT=$(<"${COUNTER_FILE}")
  # Validate it's a number
  if ! [[ "${CURRENT_COUNT}" =~ ^[0-9]+$ ]]; then
    CURRENT_COUNT=0
  fi
else
  CURRENT_COUNT=0
fi

NEW_COUNT=$((CURRENT_COUNT + 1))
echo "${NEW_COUNT}" > "${COUNTER_FILE}"

# AC-2: Estimate context usage (tokens)
# Scan relevant files, excluding .gitignore patterns and large JSON files
TOTAL_TOKENS=0

if command -v find &>/dev/null; then
  # Count markdown/code files (rough estimate: 1 char ≈ 0.4 tokens)
  FILE_SIZE=$(find . \
    -path "./node_modules" -prune -o \
    -path "./.git" -prune -o \
    -path "./dist" -prune -o \
    \( -name "*.md" -o -name "*.ts" -o -name "*.js" \) \
    -type f -print0 2>/dev/null | \
    xargs -0 wc -c 2>/dev/null | \
    tail -1 | \
    awk '{print $1}')

  if [[ -n "${FILE_SIZE}" ]] && [[ "${FILE_SIZE}" =~ ^[0-9]+$ ]]; then
    TOTAL_TOKENS=$((FILE_SIZE * 3 / 10))  # 0.3 tokens per char (from analysis)
  fi
fi

# AC-3: Warn if turn count OR token count exceeds threshold
TOKEN_THRESHOLD=50000  # AC-3: 50K tokens threshold

if [[ "${NEW_COUNT}" -ge "${CONTEXT_THRESHOLD}" ]] || [[ "${TOTAL_TOKENS}" -ge "${TOKEN_THRESHOLD}" ]]; then
  echo "⚠️  Context Warning: Turn #${NEW_COUNT} (threshold: ${CONTEXT_THRESHOLD})" >&2
  echo "📊 Estimated tokens: ~${TOTAL_TOKENS}" >&2
  echo "💡 Consider: /compact or branch completion" >&2
fi

# AC-4: Auto-compact on 120K threshold (TASK-AUTO-01)
COMPACT_THRESHOLD=120000
COOLDOWN_FILE="${STATE_DIR}/last-compact-time"
TRIGGER_FILE=".eket/triggers/compact.trigger"

if [[ "${TOTAL_TOKENS}" -ge "${COMPACT_THRESHOLD}" ]]; then
  # Check cooldown (5min = 300s)
  NOW=$(date +%s)
  LAST_COMPACT=$(cat "$COOLDOWN_FILE" 2>/dev/null || echo 0)
  ELAPSED=$((NOW - LAST_COMPACT))

  if [[ "$ELAPSED" -gt 300 ]]; then
    echo "🔄 Auto-compact triggered at ${TOTAL_TOKENS} tokens (turn ${NEW_COUNT})" >&2

    # Create trigger file (to be consumed by watcher or manual /compact)
    mkdir -p .eket/triggers
    echo "AUTO_COMPACT_REQUEST|${TOTAL_TOKENS}|$(date -Iseconds)" > "$TRIGGER_FILE"
    echo "$NOW" > "$COOLDOWN_FILE"

    # Alert: Suggest user run /compact manually
    echo "💡 Run: /compact (or wait for auto-compact if watcher enabled)" >&2
  else
    echo "⏳ Compact cooldown active (${ELAPSED}s since last)" >&2
  fi
fi

# Always exit successfully
exit 0
