#!/usr/bin/env bash
# Scenario 05: Heartbeat Write — real dual-engine equivalence
#
# Shell state_update_heartbeat vs Node updateHeartbeat:
#   - path: .eket/state/<role>_<instance_id>_heartbeat.yml
#   - field order: instance_id/role/status/current_task/timestamp/host/pid
#   - trailing newline aligned (P0-9 fix)
#   - timestamp/host/pid normalized by framework

set -eo pipefail

_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../framework.sh
source "${_SCRIPT_DIR}/../framework.sh"

_ROLE="slaver"
_INSTANCE_ID="test001"
_STATUS="idle"

scenario_heartbeat() {
  local engine="$1"

  case "$engine" in
    shell|mixed)
      (
        set -eo pipefail
        export EKET_ROOT="$WORK_DIR"
        # shellcheck disable=SC1091
        source "${EKET_REPO_ROOT}/lib/state/writer.sh"
        state_update_heartbeat "$_ROLE" "$_INSTANCE_ID" "$_STATUS" ""
      )
      ;;
    node)
      EKET_ROOT="$WORK_DIR" node "${EKET_REPO_ROOT}/tests/dual-engine/helpers/node-driver.mjs" \
        heartbeat "$_ROLE" "$_INSTANCE_ID" "$_STATUS"
      ;;
  esac
}

dual_engine_test "heartbeat" scenario_heartbeat
