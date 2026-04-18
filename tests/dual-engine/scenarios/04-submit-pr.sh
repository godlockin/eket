#!/usr/bin/env bash
# Scenario 04: Submit PR / Review Request — real dual-engine equivalence
#
# Shell state_submit_review_request vs Node submitReviewRequest:
#   - path: outbox/review_requests/pr-<ticket>-<ts>.md
#   - ts format: date -u +%Y%m%dT%H%M%SZ (framework normalizes to <TS>)
#   - body preserved + trailing newline guaranteed

set -eo pipefail

_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../framework.sh
source "${_SCRIPT_DIR}/../framework.sh"

_TICKET_ID="FEAT-001"
_SUBMITTER="agent-test"
_BRANCH="feature/FEAT-001"

scenario_submit_pr() {
  local engine="$1"
  local body_file="${WORK_DIR}/_pr_body.md"
  printf '# PR Body\n\n- change 1\n- change 2\n' > "$body_file"

  case "$engine" in
    shell|mixed)
      (
        set -eo pipefail
        export EKET_ROOT="$WORK_DIR"
        # shellcheck disable=SC1091
        source "${EKET_REPO_ROOT}/lib/state/writer.sh"
        local body
        body=$(cat "$body_file")
        state_submit_review_request "$_TICKET_ID" "$_SUBMITTER" "$_BRANCH" "$body" >/dev/null
      )
      ;;
    node)
      EKET_ROOT="$WORK_DIR" node "${EKET_REPO_ROOT}/tests/dual-engine/helpers/node-driver.mjs" \
        submit-pr "$_TICKET_ID" "$_SUBMITTER" "$_BRANCH" "$body_file" >/dev/null
      ;;
  esac
}

dual_engine_test "submit-pr" scenario_submit_pr
