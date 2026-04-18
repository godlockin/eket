#!/usr/bin/env bash
# Scenario 07: Concurrent Enqueue — stress equivalence
#
# Fires N parallel enqueue ops (half shell / half node) against a single inbox,
# then asserts:
#   1. Exactly N message files land in shared/message_queue/inbox/
#   2. All message IDs are unique (validates P0-8 counter monotonicity under race)
#   3. No orphan .tmp.* files left behind (validates atomic_write crash safety)
#   4. audit.log has exactly N enqueue entries
#
# Not a byte-equivalence test — outputs are inherently non-deterministic because
# IDs depend on arrival order. This is a *safety* test: under real concurrency,
# both engines must preserve the queue invariants.
#
# Configurable stress levels:
#   EKET_STRESS_SHELL=N   shell-engine worker count (default 5)
#   EKET_STRESS_NODE=N    node-engine worker count  (default 5)
#   EKET_STRESS_SHELL=0   pure node-only stress
#   EKET_STRESS_NODE=0    pure shell-only stress
#
# TODO(fuzz): kill a subset of workers mid-write and assert writer either
# cleans orphan .tmp.* or surfaces them via a recovery hook. Currently no such
# cleanup exists, so enabling kill-injection would expose an unfixed issue.
# Track as a separate P2 ticket before enabling.

set -eo pipefail

_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../framework.sh
source "${_SCRIPT_DIR}/../framework.sh"

N_SHELL="${EKET_STRESS_SHELL:-5}"
N_NODE="${EKET_STRESS_NODE:-5}"
TOTAL=$((N_SHELL + N_NODE))

_stress_run() {
  setup_fixture basic
  trap cleanup_fixture EXIT
  cd "$WORK_DIR"

  echo "═══════════════════════════════════════════════════════════════════"
  echo "  Concurrent Stress: $N_SHELL shell + $N_NODE node enqueues"
  echo "═══════════════════════════════════════════════════════════════════"

  local pids=()
  local i

  # Fire shell enqueuers
  for ((i=0; i<N_SHELL; i++)); do
    (
      export EKET_NODE_ID="stress-shell-$i"
      export EKET_ROOT="$WORK_DIR"
      # shellcheck disable=SC1091
      source "${EKET_REPO_ROOT}/lib/state/writer.sh"
      state_enqueue_message coordinator task_claimed \
        "{\"from_engine\":\"shell\",\"i\":${i}}" >/dev/null
    ) &
    pids+=($!)
  done

  # Fire node enqueuers
  for ((i=0; i<N_NODE; i++)); do
    (
      export EKET_NODE_ID="stress-node-$i"
      export EKET_ROOT="$WORK_DIR"
      node "${EKET_REPO_ROOT}/tests/dual-engine/helpers/node-driver.mjs" \
        enqueue-message coordinator task_claimed \
        "{\"from_engine\":\"node\",\"i\":${i}}" >/dev/null
    ) &
    pids+=($!)
  done

  # Wait — fail fast on any non-zero exit
  local fail=0
  for pid in "${pids[@]}"; do
    wait "$pid" || fail=$((fail + 1))
  done

  if (( fail > 0 )); then
    echo "  $(_c_red "✗ ${fail}/${TOTAL} enqueue workers exited non-zero")"
    return 1
  fi

  # Invariant 1: exactly N message files
  local inbox="${WORK_DIR}/shared/message_queue/inbox"
  local count
  count=$(find "$inbox" -maxdepth 1 -name 'msg_*.json' -type f 2>/dev/null | wc -l | tr -d ' ')
  if [[ "$count" -ne "$TOTAL" ]]; then
    echo "  $(_c_red "✗ expected ${TOTAL} messages, got ${count}")"
    ls -la "$inbox" >&2
    return 1
  fi
  echo "  $(_c_green "✓ ${count}/${TOTAL} messages landed in inbox")"

  # Invariant 2: all IDs unique (P0-8 collision check)
  local uniq
  uniq=$(find "$inbox" -maxdepth 1 -name 'msg_*.json' -type f -exec basename {} .json \; \
    | sort -u | wc -l | tr -d ' ')
  if [[ "$uniq" -ne "$TOTAL" ]]; then
    echo "  $(_c_red "✗ ID collision: ${uniq} unique IDs for ${TOTAL} messages")"
    find "$inbox" -maxdepth 1 -name 'msg_*.json' -type f -exec basename {} .json \; \
      | sort | uniq -c | awk '$1 > 1' >&2
    return 1
  fi
  echo "  $(_c_green "✓ ${uniq} IDs all unique (no P0-8 counter collision)")"

  # Invariant 3: no orphan .tmp.* files (atomic_write crash safety)
  local orphans
  orphans=$(find "$WORK_DIR" -name '*.tmp.*' -type f 2>/dev/null | wc -l | tr -d ' ')
  if [[ "$orphans" -gt 0 ]]; then
    echo "  $(_c_red "✗ ${orphans} orphan .tmp.* files left behind")"
    find "$WORK_DIR" -name '*.tmp.*' -type f >&2
    return 1
  fi
  echo "  $(_c_green "✓ no orphan .tmp.* files")"

  # Invariant 4: audit.log has exactly N enqueue_message entries
  local audit_count
  audit_count=$(grep -c '| enqueue_message |' "${WORK_DIR}/shared/audit.log" 2>/dev/null || echo 0)
  if [[ "$audit_count" -ne "$TOTAL" ]]; then
    echo "  $(_c_red "✗ audit.log has ${audit_count} enqueue entries, expected ${TOTAL}")"
    return 1
  fi
  echo "  $(_c_green "✓ audit.log has all ${TOTAL} enqueue entries")"

  echo "  $(_c_green "ALL PASS: concurrent-enqueue")"
}

_stress_run
