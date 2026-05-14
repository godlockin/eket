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
CONTEXT_THRESHOLD=8

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
    TOTAL_TOKENS=$((FILE_SIZE * 4 / 10))  # 0.4 tokens per char
  fi
fi

# AC-3: Warn if turn count exceeds threshold
if [[ "${NEW_COUNT}" -ge "${CONTEXT_THRESHOLD}" ]]; then
  echo "⚠️  Context Warning: Turn #${NEW_COUNT} (threshold: ${CONTEXT_THRESHOLD})" >&2
  echo "📊 Estimated tokens: ~${TOTAL_TOKENS}" >&2
  echo "💡 Consider: /compact or branch completion" >&2
fi

# TODO: AC-4 - Integrate with rtk gain (blocked by TASK-632)
# Planned: Call rtk gain to fetch actual token usage from Claude API
# Reference: jira/tickets/EPIC-007/TASK-632/TASK-632.md

# Always exit successfully
exit 0
