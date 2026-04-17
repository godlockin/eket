#!/usr/bin/env bash
# Scenario 03: Register Node — real dual-engine equivalence
#
# Shell state_register_node vs Node registerNode:
#   - path: .eket/state/nodes/<node_id>.yml (stable, direct snapshot diff)
#   - fields: node_id / registered_at / role / specialty (whitelist, P0-3)
#   - trailing newline: Shell printf + $'\n' aligns with Node (P0-9 fix)

set -eo pipefail

_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../framework.sh
source "${_SCRIPT_DIR}/../framework.sh"

_NODE_ID="slaver-001"
_ROLE="slaver"
_SPECIALTY="backend"

scenario_register() {
  local engine="$1"

  case "$engine" in
    shell|mixed)
      (
        set -eo pipefail
        export EKET_ROOT="$WORK_DIR"
        # shellcheck disable=SC1091
        source "${EKET_REPO_ROOT}/lib/state/writer.sh"
        state_register_node "$_NODE_ID" "$_ROLE" "$_SPECIALTY"
      )
      ;;
    node)
      EKET_ROOT="$WORK_DIR" node "${EKET_REPO_ROOT}/tests/dual-engine/helpers/node-driver.mjs" \
        register-node "$_NODE_ID" "$_ROLE" "$_SPECIALTY"
      ;;
  esac
}

dual_engine_test "register-node" scenario_register
