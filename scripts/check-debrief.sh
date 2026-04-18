#!/usr/bin/env bash
# scripts/check-debrief.sh
#
# Slaver debrief gate: whenever a ticket transitions to `done` in a commit
# range, require a corresponding update under `confluence/memory/` (same
# range). Enforces the MASTER-HEARTBEAT-CHECKLIST / retrospective policy.
#
# Usage:
#   scripts/check-debrief.sh [BASE_REF] [HEAD_REF]
#   scripts/check-debrief.sh origin/main HEAD           # PR-style
#   scripts/check-debrief.sh HEAD~1 HEAD                # post-merge hook
#
# Exit codes:
#   0  OK (no done-transitions, or all have debrief files)
#   1  one or more done-transitions lack a debrief entry
#   2  usage / git error

set -euo pipefail

BASE="${1:-HEAD~1}"
HEAD="${2:-HEAD}"

if ! git rev-parse --verify "$BASE" >/dev/null 2>&1; then
  echo "check-debrief: invalid base ref: $BASE" >&2
  exit 2
fi
if ! git rev-parse --verify "$HEAD" >/dev/null 2>&1; then
  echo "check-debrief: invalid head ref: $HEAD" >&2
  exit 2
fi

# Collect tickets whose **状态** / **Status** line transitioned to done in the diff.
# A transition = any ticket file where the diff adds a line matching
# "**状态**: done" (or "Status: done" / "completed").
done_tickets=$(
  git diff "$BASE" "$HEAD" -- 'jira/tickets/' \
    | awk '
        /^\+\+\+ b\/jira\/tickets\// { sub(/^\+\+\+ b\//, ""); file=$0; next }
        /^\+[*]{2}(状态|Status)[*]{2}:[[:space:]]*(done|completed|merged)/ { print file }
      ' \
    | sort -u
)

if [[ -z "$done_tickets" ]]; then
  echo "check-debrief: no ticket transitioned to done in $BASE..$HEAD — OK"
  exit 0
fi

# Collect memory files touched in the same range.
memory_touched=$(
  git diff --name-only "$BASE" "$HEAD" -- 'confluence/memory/' \
    | grep -v '/\.gitkeep$' \
    | sort -u || true
)

echo "check-debrief: tickets transitioned to done in $BASE..$HEAD:"
echo "$done_tickets" | sed 's/^/  - /'
echo ""

if [[ -z "$memory_touched" ]]; then
  echo "check-debrief: NO files under confluence/memory/ were updated in this range."
  echo "Policy: every completed ticket requires a debrief note."
  echo "  -> create or extend a file under confluence/memory/ summarising what was learned."
  exit 1
fi

echo "check-debrief: memory files updated in same range:"
echo "$memory_touched" | sed 's/^/  + /'
echo ""

# Per-ticket match: each done ticket must have at least one memory file whose
# path contains the ticket id (TASK-123 / FEAT-007 / BUG-42 style, letters+digits
# separated by a dash). Catches the "3 tickets done, only 1 retro" loophole.
unmatched=()
while IFS= read -r ticket_path; do
  ticket_file="${ticket_path##*/}"          # TASK-045.md
  ticket_id="${ticket_file%.md}"            # TASK-045
  # Strip trailing -* suffixes (e.g. TASK-008-COMPLETION-REPORT -> TASK-008)
  ticket_id="$(echo "$ticket_id" | sed -E 's/^([A-Z]+-[0-9]+).*$/\1/')"
  if ! echo "$memory_touched" | grep -q -- "$ticket_id"; then
    unmatched+=("$ticket_id")
  fi
done <<< "$done_tickets"

if [[ ${#unmatched[@]} -gt 0 ]]; then
  echo "check-debrief: done tickets WITHOUT a matching memory file (filename must contain ticket id):"
  printf '  - %s\n' "${unmatched[@]}"
  echo ""
  echo "Fix: add confluence/memory/<TICKET-ID>-*.md (or append to an existing file whose name contains the id)."
  exit 1
fi

echo "check-debrief: OK"
exit 0
