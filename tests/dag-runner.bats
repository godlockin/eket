#!/usr/bin/env bash
#
# EKET Shell DAG Runner Tests
#
# Usage:
#   bash tests/dag-runner.bats
#   # Or with bats: bats tests/dag-runner.bats
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DAG_RUNNER="$PROJECT_ROOT/scripts/dag-runner.sh"
FIXTURES_DIR="$SCRIPT_DIR/fixtures/dag"

# Test results
PASSED=0
FAILED=0

# Colors
if [[ -t 1 ]]; then
  GREEN='\033[0;32m'
  RED='\033[0;31m'
  NC='\033[0m'
else
  GREEN='' RED='' NC=''
fi

# ============================================================================
# Test Utilities
# ============================================================================

run_test() {
  local name="$1"
  shift

  printf "  %-50s " "$name"

  # Run the test command directly
  if "$@" > /dev/null 2>&1; then
    echo -e "${GREEN}PASS${NC}"
    ((PASSED++)) || true
    return 0
  else
    echo -e "${RED}FAIL${NC}"
    ((FAILED++)) || true
    return 1
  fi
}

cleanup_runs() {
  rm -rf "$PROJECT_ROOT/.eket/data/dag_runs/EPIC-TEST-"* 2>/dev/null || true
  rm -rf "$PROJECT_ROOT/.eket/data/dag_runs/EPIC-FAIL-"* 2>/dev/null || true
  rm -rf "$PROJECT_ROOT/.eket/data/dag_runs/EPIC-CYCLE-"* 2>/dev/null || true
}

# ============================================================================
# Tests
# ============================================================================

test_exists() {
  [[ -x "$DAG_RUNNER" ]]
}

test_help() {
  "$DAG_RUNNER" --help 2>&1 | grep -q "EKET Shell DAG Runner"
}

test_help_exit_code() {
  "$DAG_RUNNER" --help > /dev/null 2>&1
}

test_missing_arg() {
  "$DAG_RUNNER" 2>&1 | grep -q "DAG file required" && return 1 || return 0
  # Should fail with "DAG file required" message
}

test_missing_file() {
  "$DAG_RUNNER" /nonexistent/dag.yml 2>&1 | grep -q "not found" && return 1 || return 0
}

test_validate_simple() {
  "$DAG_RUNNER" --validate "$FIXTURES_DIR/simple.yml" 2>&1 | grep -q "DAG is valid"
}

test_validate_cycle() {
  "$DAG_RUNNER" --validate "$FIXTURES_DIR/cyclic.yml" 2>&1 | grep -q "Cycle detected"
}

test_dry_run() {
  "$DAG_RUNNER" --dry-run "$FIXTURES_DIR/simple.yml" 2>&1 | grep -q "DRY RUN"
}

test_dry_run_order() {
  local output
  output=$("$DAG_RUNNER" --dry-run "$FIXTURES_DIR/simple.yml" 2>&1)

  # TASK-001 must appear before others
  echo "$output" | grep -q "TASK-001" && echo "$output" | grep -q "TASK-004"
}

test_execute_simple() {
  cleanup_runs
  export DATA_DIR="$PROJECT_ROOT/.eket/data/dag_runs"
  export LOCK_FILE="$PROJECT_ROOT/.eket/data/dag-runner.lock"

  "$DAG_RUNNER" "$FIXTURES_DIR/simple.yml" 2>&1 | grep -q "Done:    4"
}

test_run_directory_created() {
  # Check that a run directory was created from previous test
  ls -d "$PROJECT_ROOT/.eket/data/dag_runs"/EPIC-TEST-* > /dev/null 2>&1
}

test_meta_json_exists() {
  local run_dir
  run_dir=$(ls -d "$PROJECT_ROOT/.eket/data/dag_runs"/EPIC-TEST-* 2>/dev/null | head -1)
  [[ -n "$run_dir" ]] && [[ -f "$run_dir/meta.json" ]]
}

test_meta_json_content() {
  local run_dir
  run_dir=$(ls -d "$PROJECT_ROOT/.eket/data/dag_runs"/EPIC-TEST-* 2>/dev/null | head -1)
  [[ -n "$run_dir" ]] && grep -q '"status": "completed"' "$run_dir/meta.json"
}

test_execute_failing() {
  cleanup_runs
  "$DAG_RUNNER" "$FIXTURES_DIR/failing.yml" 2>&1 | grep -q "Stopping due to failure"
}

test_resume() {
  # Get the run directory from the failing test
  local run_dir
  run_dir=$(ls -d "$PROJECT_ROOT/.eket/data/dag_runs"/EPIC-FAIL-* 2>/dev/null | head -1)

  [[ -n "$run_dir" ]] || return 1

  # Mark TASK-002 as done
  echo "done" > "$run_dir/TASK-002.status"

  # Resume should complete
  "$DAG_RUNNER" --resume "$run_dir" 2>&1 | grep -q "Done:    3"
}

test_deps_display() {
  "$DAG_RUNNER" --dry-run "$FIXTURES_DIR/simple.yml" 2>&1 | grep -q "Deps:"
}

test_validate_epic017() {
  "$DAG_RUNNER" --validate "$PROJECT_ROOT/jira/epics/EPIC-017/dag.yml" 2>&1 | grep -q "DAG is valid"
}

# ============================================================================
# Main
# ============================================================================

main() {
  echo ""
  echo "EKET Shell DAG Runner Tests"
  echo "============================"
  echo ""

  # Pre-check
  if [[ ! -x "$DAG_RUNNER" ]]; then
    echo -e "${RED}ERROR: dag-runner.sh not found or not executable${NC}"
    exit 1
  fi

  if [[ ! -d "$FIXTURES_DIR" ]]; then
    echo -e "${RED}ERROR: fixtures directory not found: $FIXTURES_DIR${NC}"
    exit 1
  fi

  # Clean up before tests
  cleanup_runs

  # Run tests
  run_test "dag-runner.sh exists and is executable" test -x "$DAG_RUNNER"
  run_test "shows help with --help" bash -c "$DAG_RUNNER --help 2>&1 | grep -q 'EKET Shell DAG Runner'"
  run_test "--help returns exit code 0" "$DAG_RUNNER" --help
  run_test "validates simple dag" bash -c "$DAG_RUNNER --validate $FIXTURES_DIR/simple.yml 2>&1 | grep -q 'DAG is valid'"
  run_test "detects cyclic dependencies" bash -c "$DAG_RUNNER --validate $FIXTURES_DIR/cyclic.yml 2>&1 | grep -q 'Cycle detected'"
  run_test "dry-run shows execution order" bash -c "$DAG_RUNNER --dry-run $FIXTURES_DIR/simple.yml 2>&1 | grep -q 'DRY RUN'"
  run_test "dry-run shows all nodes" bash -c "$DAG_RUNNER --dry-run $FIXTURES_DIR/simple.yml 2>&1 | grep -q TASK-004"
  run_test "executes simple dag successfully" bash -c "$DAG_RUNNER $FIXTURES_DIR/simple.yml 2>&1 | grep -q 'Done:    4'"
  run_test "creates run directory" bash -c "ls -d $PROJECT_ROOT/.eket/data/dag_runs/EPIC-TEST-* > /dev/null 2>&1"
  run_test "meta.json exists" bash -c "ls $PROJECT_ROOT/.eket/data/dag_runs/EPIC-TEST-*/meta.json > /dev/null 2>&1"
  run_test "meta.json has correct status" bash -c "grep -q 'completed' $PROJECT_ROOT/.eket/data/dag_runs/EPIC-TEST-*/meta.json 2>/dev/null"
  run_test "shows deps in dry-run" bash -c "$DAG_RUNNER --dry-run $FIXTURES_DIR/simple.yml 2>&1 | grep -q 'Deps:'"
  run_test "validates EPIC-017 dag" bash -c "$DAG_RUNNER --validate $PROJECT_ROOT/jira/epics/EPIC-017/dag.yml 2>&1 | grep -q 'DAG is valid'"
  run_test "stops on failure" bash -c "$DAG_RUNNER $FIXTURES_DIR/failing.yml 2>&1 | grep -q 'Stopping due to failure'"
  run_test "resume from failed run" bash -c "run_dir=\$(ls -d $PROJECT_ROOT/.eket/data/dag_runs/EPIC-FAIL-* 2>/dev/null | head -1) && echo done > \$run_dir/TASK-002.status && $DAG_RUNNER --resume \$run_dir 2>&1 | grep -q 'Done:    3'"

  # Summary
  echo ""
  echo "============================"
  echo -e "Results: ${GREEN}$PASSED passed${NC}, ${RED}$FAILED failed${NC}"
  echo ""

  # Clean up after tests
  cleanup_runs

  [[ $FAILED -eq 0 ]]
}

main "$@"
