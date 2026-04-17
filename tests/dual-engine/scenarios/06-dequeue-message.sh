#!/usr/bin/env bash
# Scenario 06: Dequeue Message — covers P0-5 rename-first + dead-letter equivalence
#
# Pre-seed (both engines): shell enqueues the same message (byte-equal by P0-4/P0-8).
# Action: each engine dequeues → inbox empty, processing has msg, audit.log has
#         dequeue_message line.
#
# NOTE: this does NOT exercise the dead-letter path (parse error); that lives in
# unit tests on Node side. Here we prove the happy-path FS state is byte-equal.

set -eo pipefail

_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../framework.sh
source "${_SCRIPT_DIR}/../framework.sh"

_PAYLOAD='{"ticket_id":"FEAT-001","role":"backend","status":"in_progress"}'

scenario_dequeue() {
  local engine="$1"
  export EKET_NODE_ID="test-slaver"

  # Step 1 — seed inbox with one message via Shell (kept identical across engines)
  (
    set -eo pipefail
    export EKET_ROOT="$WORK_DIR"
    # shellcheck disable=SC1091
    source "${EKET_REPO_ROOT}/lib/state/writer.sh"
    state_enqueue_message coordinator task_claimed "$_PAYLOAD" >/dev/null
  )

  # Step 2 — dequeue under the requested engine
  case "$engine" in
    shell|mixed)
      (
        set -eo pipefail
        export EKET_ROOT="$WORK_DIR"
        # shellcheck disable=SC1091
        source "${EKET_REPO_ROOT}/lib/state/writer.sh"
        state_dequeue_message >/dev/null
      )
      ;;
    node)
      EKET_ROOT="$WORK_DIR" node "${EKET_REPO_ROOT}/tests/dual-engine/helpers/node-driver.mjs" \
        dequeue-message >/dev/null
      ;;
  esac
}

dual_engine_test "dequeue-message" scenario_dequeue
