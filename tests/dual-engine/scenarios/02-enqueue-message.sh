#!/usr/bin/env bash
# Scenario 02: Enqueue Message — real dual-engine equivalence
#
# Shell state_enqueue_message vs Node enqueueMessage:
#   - path: shared/message_queue/inbox/<id>.json
#   - field order: id → timestamp → from → to → type → priority → payload (P0-4)
#   - JSON indent: jq --indent 2  ==  JSON.stringify(_, null, 2) + '\n'
#   - msg ID normalized to <ID>/<MSG_ID> by framework snapshot

set -eo pipefail

_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../framework.sh
source "${_SCRIPT_DIR}/../framework.sh"

_PAYLOAD='{"ticket_id":"FEAT-001","role":"backend","status":"in_progress"}'

scenario_enqueue() {
  local engine="$1"
  export EKET_NODE_ID="test-slaver"

  case "$engine" in
    shell|mixed)
      (
        set -eo pipefail
        export EKET_ROOT="$WORK_DIR"
        # shellcheck disable=SC1091
        source "${EKET_REPO_ROOT}/lib/state/writer.sh"
        state_enqueue_message coordinator task_claimed "$_PAYLOAD" >/dev/null
      )
      ;;
    node)
      EKET_ROOT="$WORK_DIR" node "${EKET_REPO_ROOT}/tests/dual-engine/helpers/node-driver.mjs" \
        enqueue-message coordinator task_claimed "$_PAYLOAD" >/dev/null
      ;;
  esac
}

dual_engine_test "enqueue-message" scenario_enqueue
