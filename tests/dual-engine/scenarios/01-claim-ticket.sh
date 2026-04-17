#!/usr/bin/env bash
# Scenario 01: Claim Ticket — real dual-engine equivalence
#
# Flow: ticket starts status=ready → claim = transition(ready→in_progress)
#       + writeTicket(assignee=<node>).
#
# Engines:
#   shell: source lib/state/writer.sh in subshell → state_transition_ticket +
#          state_write_ticket
#   node:  node-driver.mjs claim-ticket <id> <assignee>
#   mixed: Shell transition + Node writeTicket (partial engine handoff)

set -eo pipefail

_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../framework.sh
source "${_SCRIPT_DIR}/../framework.sh"

_TICKET="FEAT-001"

scenario_claim() {
  local engine="$1"
  export EKET_NODE_ID="test-slaver"

  case "$engine" in
    shell)
      (
        set -eo pipefail
        export EKET_ROOT="$WORK_DIR"
        # shellcheck disable=SC1091
        source "${EKET_REPO_ROOT}/lib/state/writer.sh"
        state_transition_ticket "$_TICKET" "in_progress"
        state_write_ticket "$_TICKET" "assignee" "$EKET_NODE_ID"
      )
      ;;
    node)
      EKET_ROOT="$WORK_DIR" node "${EKET_REPO_ROOT}/tests/dual-engine/helpers/node-driver.mjs" \
        claim-ticket "$_TICKET" "$EKET_NODE_ID"
      ;;
    mixed)
      (
        set -eo pipefail
        export EKET_ROOT="$WORK_DIR"
        # shellcheck disable=SC1091
        source "${EKET_REPO_ROOT}/lib/state/writer.sh"
        state_transition_ticket "$_TICKET" "in_progress"
      )
      EKET_ROOT="$WORK_DIR" node "${EKET_REPO_ROOT}/tests/dual-engine/helpers/node-driver.mjs" \
        write-ticket "$_TICKET" "assignee" "$EKET_NODE_ID"
      ;;
  esac
}

dual_engine_test "claim-ticket" scenario_claim
