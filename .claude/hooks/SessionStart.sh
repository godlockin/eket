#!/bin/bash
# SessionStart Hook - TASK-AUTO-02
# Detects pending compact triggers and auto-starts watcher
# Version: 2.0.0

set +e  # Continue on error

TRIGGER_FILE=".eket/triggers/compact.trigger"
WATCHER_BIN="node/dist/bin/compact-watcher.js"

# AC-4: Detect pending compact trigger from previous session
if [[ -f "$TRIGGER_FILE" ]]; then
  TRIGGER_DATA=$(<"$TRIGGER_FILE")

  # Parse trigger file: AUTO_COMPACT_REQUEST|125000|2026-05-14T18:30:00
  if [[ "$TRIGGER_DATA" == AUTO_COMPACT_REQUEST* ]]; then
    TOKENS=$(echo "$TRIGGER_DATA" | cut -d'|' -f2)
    TIMESTAMP=$(echo "$TRIGGER_DATA" | cut -d'|' -f3)

    echo "" >&2
    echo "🔴 URGENT: Auto-Compact Pending" >&2
    echo "📊 Context: ~${TOKENS} tokens" >&2
    echo "⏰ Triggered: ${TIMESTAMP}" >&2
    echo "" >&2
    echo "💡 Run immediately:" >&2
    echo "   /compact" >&2
    echo "" >&2
    echo "📝 Clear trigger after compact:" >&2
    echo "   rm $TRIGGER_FILE" >&2
    echo "" >&2
  fi
fi

# Auto-start compact watcher if not running (optional)
if [[ "$ENABLE_COMPACT_WATCHER" != "false" ]] && [[ -f "$WATCHER_BIN" ]]; then
  # Check if watcher already running
  if ! pgrep -f "compact-watcher.js" >/dev/null 2>&1; then
    nohup node "$WATCHER_BIN" >/dev/null 2>&1 &
    WATCHER_PID=$!
    echo "✅ Compact watcher started (PID: $WATCHER_PID)" >&2
  fi
fi

exit 0
