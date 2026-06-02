#!/bin/bash
#
# EKET Shell DAG Runner (L0 Fallback)
#
# Pure bash DAG executor - works on any POSIX system
# Dependencies: bash 3.2+, coreutils (awk/sed/grep), flock (optional)
#
# Usage:
#   dag-runner.sh <dag.yml>                    # Execute DAG
#   dag-runner.sh --dry-run <dag.yml>          # Show execution order only
#   dag-runner.sh --resume <run_dir>           # Resume from failed node
#   dag-runner.sh --validate <dag.yml>         # Validate DAG only
#
# Author: EKET Team
# License: MIT

set -euo pipefail

# ============================================================================
# Configuration
# ============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="${SCRIPT_DIR}/.."
DATA_DIR="${DATA_DIR:-${PROJECT_ROOT}/.eket/data/dag_runs}"
LOCK_FILE="${LOCK_FILE:-${PROJECT_ROOT}/.eket/data/dag-runner.lock}"

# Colors (disable if not tty)
if [[ -t 1 ]]; then
  RED='\033[0;31m'
  GREEN='\033[0;32m'
  YELLOW='\033[0;33m'
  BLUE='\033[0;34m'
  CYAN='\033[0;36m'
  NC='\033[0m' # No Color
  BOLD='\033[1m'
else
  RED='' GREEN='' YELLOW='' BLUE='' CYAN='' NC='' BOLD=''
fi

# ============================================================================
# Global Variables (bash 3.2 compatible - no associative arrays)
# ============================================================================

# We'll use indexed arrays and file-based storage for compatibility
# NODES_FILE: one node per line
# SCRIPTS_FILE: node:script pairs
# DEPS_FILE: node:dep1,dep2,... pairs

NODES_FILE=""
SCRIPTS_FILE=""
DEPS_FILE=""
SORTED_NODES_FILE=""

DAG_VERSION=""
DAG_EPIC=""
DAG_FILE=""
RUN_DIR=""
SETTING_RETRY=""
SETTING_TIMEOUT=""
SETTING_ON_FAILURE=""

# ============================================================================
# Logging
# ============================================================================

log_info()  { echo -e "${BLUE}[INFO]${NC} $*"; }
log_ok()    { echo -e "${GREEN}[OK]${NC} $*"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
log_error() { echo -e "${RED}[ERROR]${NC} $*" >&2; }
log_debug() { [[ "${DEBUG:-}" == "1" ]] && echo -e "${CYAN}[DEBUG]${NC} $*" || true; }

# ============================================================================
# YAML Parser (minimal, supports dag.yml format)
# ============================================================================

parse_dag_yaml() {
  local yaml_file="$1"

  if [[ ! -f "$yaml_file" ]]; then
    log_error "DAG file not found: $yaml_file"
    return 1
  fi

  # Create temp files for data storage
  NODES_FILE=$(mktemp)
  SCRIPTS_FILE=$(mktemp)
  DEPS_FILE=$(mktemp)
  SORTED_NODES_FILE=$(mktemp)

  # Extract version
  DAG_VERSION=$(grep -E '^version:' "$yaml_file" | sed 's/version:[[:space:]]*["'\'']\{0,1\}\([^"'\'']*\)["'\'']\{0,1\}/\1/' | tr -d '[:space:]')

  # Extract epic
  DAG_EPIC=$(grep -E '^epic:' "$yaml_file" | sed 's/epic:[[:space:]]*//' | tr -d '[:space:]' || true)

  # Extract settings (strip trailing comments)
  SETTING_RETRY=$(grep -E '^[[:space:]]*retry_count:' "$yaml_file" 2>/dev/null | sed 's/.*retry_count:[[:space:]]*//' | sed 's/#.*//' | tr -d '[:space:]' || true)
  SETTING_TIMEOUT=$(grep -E '^[[:space:]]*timeout_seconds:' "$yaml_file" 2>/dev/null | sed 's/.*timeout_seconds:[[:space:]]*//' | sed 's/#.*//' | tr -d '[:space:]' || true)
  SETTING_ON_FAILURE=$(grep -E '^[[:space:]]*on_failure:' "$yaml_file" 2>/dev/null | sed 's/.*on_failure:[[:space:]]*["'\'']\{0,1\}\([^"'\''#]*\)["'\'']\{0,1\}.*/\1/' | tr -d '[:space:]' || true)

  # Defaults
  SETTING_RETRY="${SETTING_RETRY:-2}"
  SETTING_TIMEOUT="${SETTING_TIMEOUT:-3600}"
  SETTING_ON_FAILURE="${SETTING_ON_FAILURE:-stop}"

  # Parse nodes using awk - collect all data in memory, output at END
  awk '
    BEGIN {
      in_nodes = 0
      current_id = ""
      node_count = 0
    }

    /^nodes:/ { in_nodes = 1; next }
    /^settings:/ { in_nodes = 0; next }
    /^[a-z]+:/ && !/^[[:space:]]/ { in_nodes = 0 }

    in_nodes && /^[[:space:]]*- id:/ {
      gsub(/^[[:space:]]*- id:[[:space:]]*/, "")
      gsub(/["'\''"]/, "")
      gsub(/[[:space:]]*$/, "")
      current_id = $0
      nodes[node_count] = current_id
      deps[current_id] = ""
      scripts[current_id] = ""
      node_count++
      next
    }

    in_nodes && current_id != "" && /^[[:space:]]+script:/ {
      gsub(/^[[:space:]]+script:[[:space:]]*/, "")
      gsub(/^["'\''"]/, "")
      gsub(/["'\''"]$/, "")
      scripts[current_id] = $0
      next
    }

    in_nodes && current_id != "" && /^[[:space:]]+deps:/ {
      gsub(/^[[:space:]]+deps:[[:space:]]*/, "")
      gsub(/[\[\]]/, "")
      gsub(/["'\''"]/, "")
      gsub(/[[:space:]]/, "")
      deps[current_id] = $0
      next
    }

    END {
      for (i = 0; i < node_count; i++) {
        id = nodes[i]
        print id >> "'"$NODES_FILE"'"
        print id ":" scripts[id] >> "'"$SCRIPTS_FILE"'"
        print id ":" deps[id] >> "'"$DEPS_FILE"'"
      }
    }
  ' "$yaml_file"

  local node_count
  node_count=$(wc -l < "$NODES_FILE" | tr -d ' ')
  log_debug "Parsed $node_count nodes from $yaml_file"
  log_debug "EPIC: $DAG_EPIC, Version: $DAG_VERSION"
}

# Get script for a node
get_script() {
  local node="$1"
  grep "^${node}:" "$SCRIPTS_FILE" 2>/dev/null | sed "s/^${node}://" || true
}

# Get deps for a node
get_deps() {
  local node="$1"
  grep "^${node}:" "$DEPS_FILE" 2>/dev/null | sed "s/^${node}://" || true
}

# Check if node exists
node_exists() {
  local node="$1"
  grep -q "^${node}$" "$NODES_FILE" 2>/dev/null
}

# Get all nodes as array
get_all_nodes() {
  cat "$NODES_FILE"
}

# Get sorted nodes as array
get_sorted_nodes() {
  cat "$SORTED_NODES_FILE"
}

# ============================================================================
# Topological Sort (Kahn's Algorithm)
# ============================================================================

topological_sort() {
  local in_degree_file
  in_degree_file=$(mktemp)
  local adj_file
  adj_file=$(mktemp)
  local queue_file
  queue_file=$(mktemp)

  # Initialize in-degree for all nodes
  while IFS= read -r node; do
    echo "${node}:0" >> "$in_degree_file"
  done < "$NODES_FILE"

  # Build adjacency list and compute in-degrees
  while IFS= read -r node; do
    local deps
    deps=$(get_deps "$node")
    if [[ -n "$deps" ]]; then
      # Split by comma
      echo "$deps" | tr ',' '\n' | while IFS= read -r dep; do
        dep=$(echo "$dep" | tr -d '[:space:]')
        [[ -z "$dep" ]] && continue

        # Validate dependency exists
        if ! node_exists "$dep"; then
          log_error "Unknown dependency '$dep' in node '$node'"
          rm -f "$in_degree_file" "$adj_file" "$queue_file"
          return 1
        fi

        # Add edge: dep -> node
        echo "${dep}:${node}" >> "$adj_file"

        # Increment in-degree
        local current_degree
        current_degree=$(grep "^${node}:" "$in_degree_file" | cut -d: -f2)
        local new_degree=$((current_degree + 1))
        if [[ "$(uname)" == "Darwin" ]]; then
          sed -i '' "s/^${node}:[0-9]*$/${node}:${new_degree}/" "$in_degree_file"
        else
          sed -i "s/^${node}:[0-9]*$/${node}:${new_degree}/" "$in_degree_file"
        fi
      done
    fi
  done < "$NODES_FILE"

  # Find all nodes with in-degree 0
  grep ':0$' "$in_degree_file" | cut -d: -f1 > "$queue_file"

  # Process queue
  local processed=0
  while [[ -s "$queue_file" ]]; do
    # Dequeue (first line)
    local current
    current=$(head -1 "$queue_file")
    if [[ "$(uname)" == "Darwin" ]]; then
      sed -i '' '1d' "$queue_file"
    else
      sed -i '1d' "$queue_file"
    fi

    echo "$current" >> "$SORTED_NODES_FILE"
    ((processed++)) || true

    # Reduce in-degree of neighbors
    local neighbors
    neighbors=$(grep "^${current}:" "$adj_file" 2>/dev/null | cut -d: -f2 || true)

    for neighbor in $neighbors; do
      [[ -z "$neighbor" ]] && continue

      local current_degree
      current_degree=$(grep "^${neighbor}:" "$in_degree_file" | cut -d: -f2)
      local new_degree=$((current_degree - 1))

      if [[ "$(uname)" == "Darwin" ]]; then
        sed -i '' "s/^${neighbor}:[0-9]*$/${neighbor}:${new_degree}/" "$in_degree_file"
      else
        sed -i "s/^${neighbor}:[0-9]*$/${neighbor}:${new_degree}/" "$in_degree_file"
      fi

      if [[ $new_degree -eq 0 ]]; then
        echo "$neighbor" >> "$queue_file"
      fi
    done
  done

  # Check for cycle
  local total_nodes
  total_nodes=$(wc -l < "$NODES_FILE" | tr -d ' ')
  local sorted_count
  sorted_count=$(wc -l < "$SORTED_NODES_FILE" | tr -d ' ')

  if [[ $sorted_count -ne $total_nodes ]]; then
    log_error "Cycle detected in DAG! Processed $sorted_count of $total_nodes nodes."

    # Find nodes in cycle
    local cycle_nodes=""
    while IFS= read -r node; do
      if ! grep -q "^${node}$" "$SORTED_NODES_FILE"; then
        cycle_nodes="${cycle_nodes} ${node}"
      fi
    done < "$NODES_FILE"

    log_error "Nodes involved in cycle:${cycle_nodes}"
    rm -f "$in_degree_file" "$adj_file" "$queue_file"
    return 1
  fi

  rm -f "$in_degree_file" "$adj_file" "$queue_file"
  log_debug "Topological order: $(cat "$SORTED_NODES_FILE" | tr '\n' ' ')"
}

# ============================================================================
# Run Directory Management
# ============================================================================

create_run_dir() {
  local epic="$1"
  local timestamp
  timestamp=$(date +%Y%m%d-%H%M%S)

  RUN_DIR="${DATA_DIR}/${epic}-${timestamp}"
  mkdir -p "$RUN_DIR"

  # Create meta.json
  cat > "${RUN_DIR}/meta.json" <<EOF
{
  "epic": "$epic",
  "started_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "status": "running",
  "dag_file": "$DAG_FILE",
  "settings": {
    "retry_count": $SETTING_RETRY,
    "timeout_seconds": $SETTING_TIMEOUT,
    "on_failure": "$SETTING_ON_FAILURE"
  }
}
EOF

  # Initialize node status files
  while IFS= read -r node; do
    echo "pending" > "${RUN_DIR}/${node}.status"
  done < "$NODES_FILE"

  # Create output log
  touch "${RUN_DIR}/output.log"

  log_info "Run directory created: $RUN_DIR"
}

load_run_dir() {
  local run_dir="$1"

  if [[ ! -d "$run_dir" ]]; then
    log_error "Run directory not found: $run_dir"
    return 1
  fi

  if [[ ! -f "${run_dir}/meta.json" ]]; then
    log_error "Invalid run directory (missing meta.json): $run_dir"
    return 1
  fi

  RUN_DIR="$run_dir"

  # Extract DAG file from meta
  DAG_FILE=$(grep -o '"dag_file":[[:space:]]*"[^"]*"' "${RUN_DIR}/meta.json" | sed 's/.*"dag_file":[[:space:]]*"\([^"]*\)".*/\1/')

  if [[ ! -f "$DAG_FILE" ]]; then
    log_error "Original DAG file not found: $DAG_FILE"
    return 1
  fi

  log_info "Loaded run directory: $RUN_DIR"
}

get_node_status() {
  local node="$1"
  local status_file="${RUN_DIR}/${node}.status"

  if [[ -f "$status_file" ]]; then
    cat "$status_file"
  else
    echo "pending"
  fi
}

set_node_status() {
  local node="$1"
  local status="$2"

  echo "$status" > "${RUN_DIR}/${node}.status"
}

update_meta_status() {
  local status="$1"
  local meta_file="${RUN_DIR}/meta.json"
  local tmp_file="${meta_file}.tmp"

  # Update status in meta.json
  sed "s/\"status\":[[:space:]]*\"[^\"]*\"/\"status\": \"$status\"/" "$meta_file" > "$tmp_file"
  mv "$tmp_file" "$meta_file"
}

# ============================================================================
# Node Execution
# ============================================================================

execute_node() {
  local node="$1"
  local script
  script=$(get_script "$node")
  local retry_count="${SETTING_RETRY:-2}"
  local timeout_secs="${SETTING_TIMEOUT:-3600}"
  local attempt=0
  local success=0

  log_debug "Executing node: $node"
  log_debug "Script: $script"

  while [[ $attempt -le $retry_count ]]; do
    ((attempt++)) || true

    if [[ $attempt -gt 1 ]]; then
      log_warn "Retry $((attempt-1))/$retry_count for $node"
    fi

    set_node_status "$node" "running"

    # Execute with timeout (use gtimeout on macOS if available)
    local timeout_cmd="timeout"
    if [[ "$(uname)" == "Darwin" ]]; then
      if command -v gtimeout &>/dev/null; then
        timeout_cmd="gtimeout"
      else
        # Fallback: no timeout on macOS without coreutils
        timeout_cmd=""
      fi
    fi

    local start_time
    start_time=$(date +%s)

    # Run script and capture output
    local output_file="${RUN_DIR}/${node}.output"
    local exit_code=0

    if [[ -n "$timeout_cmd" ]]; then
      if $timeout_cmd "$timeout_secs" bash -c "$script" > "$output_file" 2>&1; then
        exit_code=0
      else
        exit_code=$?
      fi
    else
      # No timeout available
      if bash -c "$script" > "$output_file" 2>&1; then
        exit_code=0
      else
        exit_code=$?
      fi
    fi

    local end_time
    end_time=$(date +%s)
    local duration=$((end_time - start_time))

    # Append to main log
    {
      echo "=== $node (attempt $attempt) ==="
      echo "Started: $(date)"
      echo "Duration: ${duration}s"
      echo "Exit code: $exit_code"
      echo "--- Output ---"
      cat "$output_file"
      echo ""
    } >> "${RUN_DIR}/output.log"

    if [[ $exit_code -eq 0 ]]; then
      success=1
      break
    elif [[ $exit_code -eq 124 ]]; then
      log_warn "$node timed out after ${timeout_secs}s"
    else
      log_warn "$node failed with exit code $exit_code"
    fi
  done

  if [[ $success -eq 1 ]]; then
    set_node_status "$node" "done"
    return 0
  else
    set_node_status "$node" "failed"
    return 1
  fi
}

# ============================================================================
# Progress Display
# ============================================================================

print_progress() {
  local current="$1"
  local total="$2"
  local node="$3"
  local status="$4"

  local icon
  case "$status" in
    running)  icon="..." ;;
    done)     icon="[OK]" ;;
    failed)   icon="[FAIL]" ;;
    skipped)  icon="[SKIP]" ;;
    pending)  icon="[WAIT]" ;;
    *)        icon="[?]" ;;
  esac

  echo -e "${BOLD}[$current/$total]${NC} ${node} ${icon} ${status}"
}

print_summary() {
  local total
  total=$(wc -l < "$SORTED_NODES_FILE" | tr -d ' ')
  local done_count=0
  local failed_count=0
  local skipped_count=0

  echo ""
  echo -e "${BOLD}=======================================${NC}"
  echo -e "${BOLD}       DAG Execution Summary          ${NC}"
  echo -e "${BOLD}=======================================${NC}"
  echo ""

  while IFS= read -r node; do
    local status
    status=$(get_node_status "$node")
    case "$status" in
      done)    ((done_count++)) || true ;;
      failed)  ((failed_count++)) || true ;;
      skipped) ((skipped_count++)) || true ;;
    esac

    local icon
    case "$status" in
      done)    icon="${GREEN}[OK]${NC}" ;;
      failed)  icon="${RED}[FAIL]${NC}" ;;
      skipped) icon="${YELLOW}[SKIP]${NC}" ;;
      pending) icon="[WAIT]" ;;
      *)       icon="[?]" ;;
    esac

    local script
    script=$(get_script "$node")
    printf "  %b %-12s %s\n" "$icon" "$node" "${script:0:40}"
  done < "$SORTED_NODES_FILE"

  echo ""
  echo -e "${BOLD}Results:${NC}"
  echo -e "  Total:   $total"
  echo -e "  ${GREEN}Done:${NC}    $done_count"
  echo -e "  ${RED}Failed:${NC}  $failed_count"
  echo -e "  ${YELLOW}Skipped:${NC} $skipped_count"
  echo ""

  if [[ -n "${RUN_DIR:-}" ]]; then
    echo -e "${BOLD}Run directory:${NC} $RUN_DIR"
    echo ""
  fi

  if [[ $failed_count -gt 0 ]]; then
    return 1
  fi
  return 0
}

# ============================================================================
# Main Execution Flow
# ============================================================================

run_dag() {
  local dry_run="${1:-0}"
  local total
  total=$(wc -l < "$SORTED_NODES_FILE" | tr -d ' ')
  local current=0
  local failed=0

  echo ""
  echo -e "${BOLD}=======================================${NC}"
  echo -e "${BOLD}   EKET Shell DAG Runner (L0)         ${NC}"
  echo -e "${BOLD}=======================================${NC}"
  echo ""
  echo -e "${BOLD}EPIC:${NC}       $DAG_EPIC"
  echo -e "${BOLD}Nodes:${NC}      $total"
  echo -e "${BOLD}On Failure:${NC} $SETTING_ON_FAILURE"

  if [[ $dry_run -eq 1 ]]; then
    echo -e "${BOLD}Mode:${NC}       ${YELLOW}DRY RUN${NC}"
  fi

  echo ""
  echo -e "${BOLD}Execution Order:${NC}"
  echo ""

  while IFS= read -r node; do
    ((current++)) || true

    # Dry run - just show what would run
    if [[ $dry_run -eq 1 ]]; then
      local script
      script=$(get_script "$node")
      local deps
      deps=$(get_deps "$node")
      echo -e "  ${CYAN}[$current/$total]${NC} $node"
      echo -e "           Script: $script"
      if [[ -n "$deps" ]]; then
        echo -e "           Deps:   $deps"
      fi
      continue
    fi

    # Check if node should be skipped (resume mode)
    local status
    status=$(get_node_status "$node")

    if [[ "$status" == "done" ]]; then
      print_progress "$current" "$total" "$node" "done"
      continue
    fi

    # Check dependencies
    local deps
    deps=$(get_deps "$node")
    local deps_ok=1

    if [[ -n "$deps" ]]; then
      echo "$deps" | tr ',' '\n' | while IFS= read -r dep; do
        dep=$(echo "$dep" | tr -d '[:space:]')
        [[ -z "$dep" ]] && continue

        local dep_status
        dep_status=$(get_node_status "$dep")
        if [[ "$dep_status" != "done" ]]; then
          # Write to a temp file to communicate with parent shell
          echo "1" > "${SORTED_NODES_FILE}.deps_failed"
          break
        fi
      done

      if [[ -f "${SORTED_NODES_FILE}.deps_failed" ]]; then
        rm -f "${SORTED_NODES_FILE}.deps_failed"
        deps_ok=0
        log_warn "Dependencies not completed for $node"
      fi
    fi

    if [[ $deps_ok -eq 0 ]]; then
      set_node_status "$node" "skipped"
      print_progress "$current" "$total" "$node" "skipped"
      continue
    fi

    # Execute node
    print_progress "$current" "$total" "$node" "running"

    if execute_node "$node"; then
      print_progress "$current" "$total" "$node" "done"
    else
      print_progress "$current" "$total" "$node" "failed"
      ((failed++)) || true

      case "$SETTING_ON_FAILURE" in
        stop)
          log_error "Stopping due to failure (on_failure=stop)"
          break
          ;;
        continue)
          log_warn "Continuing despite failure (on_failure=continue)"
          ;;
        rollback)
          log_error "Rollback not implemented in Shell runner"
          break
          ;;
      esac
    fi
  done < "$SORTED_NODES_FILE"

  # Update meta status
  if [[ $dry_run -eq 0 ]]; then
    if [[ $failed -gt 0 ]]; then
      update_meta_status "failed"
    else
      update_meta_status "completed"
    fi
    print_summary
  else
    # Dry run summary
    echo ""
    echo -e "${GREEN}Dry run complete.${NC} ${total} nodes would be executed."
    return 0
  fi
}

validate_dag() {
  echo -e "${BOLD}Validating DAG: $DAG_FILE${NC}"
  echo ""

  # Check required fields
  local errors=0

  if [[ -z "${DAG_VERSION:-}" ]]; then
    log_error "Missing required field: version"
    ((errors++)) || true
  fi

  if [[ -z "${DAG_EPIC:-}" ]]; then
    log_error "Missing required field: epic"
    ((errors++)) || true
  fi

  local node_count
  node_count=$(wc -l < "$NODES_FILE" | tr -d ' ')
  if [[ $node_count -eq 0 ]]; then
    log_error "No nodes defined"
    ((errors++)) || true
  fi

  # Check each node has a script
  while IFS= read -r node; do
    local script
    script=$(get_script "$node")
    if [[ -z "$script" ]]; then
      log_error "Node $node missing script"
      ((errors++)) || true
    fi
  done < "$NODES_FILE"

  # Check SORTED_NODES_FILE (topological sort already ran before validate_dag)
  local sorted_count
  sorted_count=$(wc -l < "$SORTED_NODES_FILE" 2>/dev/null | tr -d ' ')
  if [[ ${sorted_count:-0} -eq 0 ]]; then
    log_error "Topological sort failed (cycle detected or empty)"
    ((errors++)) || true
  fi

  if [[ $errors -eq 0 ]]; then
    log_ok "DAG is valid"
    echo ""
    echo -e "${BOLD}Nodes ($node_count):${NC}"
    while IFS= read -r node; do
      local deps
      deps=$(get_deps "$node")
      if [[ -n "$deps" ]]; then
        echo "  $node (deps: $deps)"
      else
        echo "  $node"
      fi
    done < "$SORTED_NODES_FILE"
    return 0
  else
    log_error "Found $errors error(s)"
    return 1
  fi
}

# Cleanup temp files
cleanup() {
  [[ -n "${NODES_FILE:-}" && -f "$NODES_FILE" ]] && rm -f "$NODES_FILE"
  [[ -n "${SCRIPTS_FILE:-}" && -f "$SCRIPTS_FILE" ]] && rm -f "$SCRIPTS_FILE"
  [[ -n "${DEPS_FILE:-}" && -f "$DEPS_FILE" ]] && rm -f "$DEPS_FILE"
  [[ -n "${SORTED_NODES_FILE:-}" && -f "$SORTED_NODES_FILE" ]] && rm -f "$SORTED_NODES_FILE"
  return 0
}

trap cleanup EXIT

# ============================================================================
# CLI
# ============================================================================

usage() {
  cat <<EOF
EKET Shell DAG Runner (L0 Fallback)

Usage:
  $(basename "$0") [options] <dag.yml>
  $(basename "$0") --resume <run_dir>

Options:
  --dry-run       Show execution order without running
  --validate      Validate DAG only
  --resume        Resume from a previous run directory
  --debug         Enable debug output
  -h, --help      Show this help

Examples:
  # Execute a DAG
  $(basename "$0") jira/epics/EPIC-017/dag.yml

  # Dry run (show execution order)
  $(basename "$0") --dry-run jira/epics/EPIC-017/dag.yml

  # Validate DAG structure
  $(basename "$0") --validate jira/epics/EPIC-017/dag.yml

  # Resume from failed run
  $(basename "$0") --resume .eket/data/dag_runs/EPIC-017-20260601-143022/

Environment:
  DEBUG=1         Enable debug output
EOF
}

main() {
  local dry_run=0
  local validate_only=0
  local resume_mode=0
  local dag_file=""
  local run_dir=""

  # Parse arguments
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --dry-run)
        dry_run=1
        shift
        ;;
      --validate)
        validate_only=1
        shift
        ;;
      --resume)
        resume_mode=1
        shift
        if [[ $# -gt 0 ]]; then
          run_dir="$1"
          shift
        else
          log_error "--resume requires a run directory"
          exit 1
        fi
        ;;
      --debug)
        DEBUG=1
        shift
        ;;
      -h|--help)
        usage
        cleanup 2>/dev/null || true
        exit 0
        ;;
      -*)
        log_error "Unknown option: $1"
        usage
        exit 1
        ;;
      *)
        dag_file="$1"
        shift
        ;;
    esac
  done

  # Resume mode
  if [[ $resume_mode -eq 1 ]]; then
    load_run_dir "$run_dir"
    parse_dag_yaml "$DAG_FILE"
    topological_sort
    run_dag "$dry_run"
    exit $?
  fi

  # Normal mode - require dag file
  if [[ -z "$dag_file" ]]; then
    log_error "DAG file required"
    usage
    exit 1
  fi

  DAG_FILE="$dag_file"

  # Ensure data directory exists
  mkdir -p "$DATA_DIR"

  # Acquire lock (prevent concurrent runs) - skip if flock not available
  if [[ $dry_run -eq 0 && $validate_only -eq 0 ]]; then
    mkdir -p "$(dirname "$LOCK_FILE")"
    if command -v flock &>/dev/null; then
      exec 200>"$LOCK_FILE"
      if ! flock -n 200; then
        log_error "Another DAG runner is already running"
        log_error "Lock file: $LOCK_FILE"
        exit 1
      fi
    fi
  fi

  # Parse DAG
  parse_dag_yaml "$DAG_FILE"

  # Topological sort
  if ! topological_sort; then
    exit 1
  fi

  # Validate only
  if [[ $validate_only -eq 1 ]]; then
    validate_dag
    exit $?
  fi

  # Create run directory (unless dry run)
  if [[ $dry_run -eq 0 ]]; then
    create_run_dir "$DAG_EPIC"
  fi

  # Execute
  run_dag "$dry_run"
}

# Run if executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
