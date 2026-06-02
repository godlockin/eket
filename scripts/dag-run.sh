#!/bin/bash
#
# EKET Unified DAG Entry Point (TASK-635)
#
# Auto-detects best available execution engine and routes accordingly:
#   L1 Rust  → High-performance, SQLite checkpointing, parallel execution
#   L2 Node  → TypeScript, EventBus integration, semaphore concurrency
#   L0 Shell → POSIX fallback, works anywhere
#
# Usage:
#   dag-run.sh <dag.yml>                    # Auto-detect engine
#   dag-run.sh --engine=rust <dag.yml>      # Force Rust engine
#   dag-run.sh --engine=node <dag.yml>      # Force Node engine
#   dag-run.sh --engine=shell <dag.yml>     # Force Shell engine
#   dag-run.sh --health                     # Show engine availability
#   dag-run.sh --dry-run <dag.yml>          # Dry run mode
#
# Environment:
#   EKET_DAG_ENGINE    - Force specific engine (rust|node|shell)
#   EKET_DAG_FALLBACK  - Enable/disable fallback chain (default: true)
#
# Author: EKET Team (TASK-635)
# License: MIT

set -euo pipefail

# ============================================================================
# Configuration
# ============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="${SCRIPT_DIR}/.."
NODE_DIR="${PROJECT_ROOT}/node"
RUST_DIR="${PROJECT_ROOT}/rust"

# Engine levels
ENGINE_RUST="rust"
ENGINE_NODE="node"
ENGINE_SHELL="shell"

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
# Logging
# ============================================================================

log_dag() {
  echo -e "${BLUE}[DAG]${NC} $*"
}

log_ok() {
  echo -e "${GREEN}[DAG]${NC} $*"
}

log_warn() {
  echo -e "${YELLOW}[DAG]${NC} $*"
}

log_error() {
  echo -e "${RED}[DAG]${NC} $*" >&2
}

# ============================================================================
# Engine Detection
# ============================================================================

# Check if Rust DAG engine is available
check_rust_available() {
  local reason=""

  # Check if eket binary exists
  if ! command -v eket &>/dev/null; then
    reason="eket binary not found"
    echo "$reason"
    return 1
  fi

  # Check if eket has dag:health command
  if ! eket dag:health &>/dev/null 2>&1; then
    reason="eket dag:health failed"
    echo "$reason"
    return 1
  fi

  # Check SQLite writability (optional, non-blocking)
  local sqlite_path="${PROJECT_ROOT}/.eket/data/eket.db"
  if [[ -f "$sqlite_path" && ! -w "$sqlite_path" ]]; then
    reason="SQLite not writable"
    echo "$reason"
    return 1
  fi

  echo "available"
  return 0
}

# Check if Node.js DAG executor is available
check_node_available() {
  local reason=""

  # Check if node exists
  if ! command -v node &>/dev/null; then
    reason="node binary not found"
    echo "$reason"
    return 1
  fi

  # Check node version (require >=20)
  local node_version
  node_version=$(node -v 2>/dev/null | sed 's/v//' | cut -d. -f1)
  if [[ "${node_version:-0}" -lt 20 ]]; then
    reason="node version < 20 (got v${node_version})"
    echo "$reason"
    return 1
  fi

  # Check if dist/index.js exists
  if [[ ! -f "${NODE_DIR}/dist/index.js" ]]; then
    reason="dist/index.js not found (run npm run build)"
    echo "$reason"
    return 1
  fi

  # Check if dag module can be loaded
  if ! node -e "import('${NODE_DIR}/dist/core/dag-executor.js')" &>/dev/null 2>&1; then
    reason="dag-executor module not loadable"
    echo "$reason"
    return 1
  fi

  echo "available"
  return 0
}

# Check if Shell runner is available (always true for POSIX)
check_shell_available() {
  if [[ ! -f "${SCRIPT_DIR}/dag-runner.sh" ]]; then
    echo "dag-runner.sh not found"
    return 1
  fi

  if [[ ! -x "${SCRIPT_DIR}/dag-runner.sh" ]]; then
    echo "dag-runner.sh not executable"
    return 1
  fi

  echo "available"
  return 0
}

# Detect best available engine
detect_best_engine() {
  local rust_status node_status shell_status

  rust_status=$(check_rust_available 2>/dev/null || true)
  if [[ "$rust_status" == "available" ]]; then
    echo "$ENGINE_RUST"
    return 0
  fi

  node_status=$(check_node_available 2>/dev/null || true)
  if [[ "$node_status" == "available" ]]; then
    echo "$ENGINE_NODE"
    return 0
  fi

  shell_status=$(check_shell_available 2>/dev/null || true)
  if [[ "$shell_status" == "available" ]]; then
    echo "$ENGINE_SHELL"
    return 0
  fi

  # Should never reach here, but fallback to shell
  echo "$ENGINE_SHELL"
  return 0
}

# ============================================================================
# Health Check
# ============================================================================

print_health() {
  local rust_status node_status shell_status
  local rust_reason node_reason shell_reason
  local recommended=""

  echo ""
  echo -e "${BOLD}[DAG] Engine Availability${NC}"
  echo ""

  # Rust check
  rust_status=$(check_rust_available 2>/dev/null || echo "unavailable")
  if [[ "$rust_status" == "available" ]]; then
    local rust_version
    rust_version=$(eket --version 2>/dev/null | head -1 || echo "unknown")
    echo -e "  ${GREEN}L1 Rust:${NC}  available (${rust_version})"
    [[ -z "$recommended" ]] && recommended="L1 Rust"
  else
    echo -e "  ${RED}L1 Rust:${NC}  unavailable (${rust_status})"
  fi

  # Node check
  node_status=$(check_node_available 2>/dev/null || echo "unavailable")
  if [[ "$node_status" == "available" ]]; then
    local node_version
    node_version=$(node -v 2>/dev/null || echo "unknown")
    echo -e "  ${GREEN}L2 Node:${NC}  available (node ${node_version})"
    [[ -z "$recommended" ]] && recommended="L2 Node"
  else
    echo -e "  ${RED}L2 Node:${NC}  unavailable (${node_status})"
  fi

  # Shell check
  shell_status=$(check_shell_available 2>/dev/null || echo "unavailable")
  if [[ "$shell_status" == "available" ]]; then
    local bash_version
    bash_version=$(bash --version 2>/dev/null | head -1 | sed 's/.*version \([0-9.]*\).*/\1/' || echo "unknown")
    echo -e "  ${GREEN}L0 Shell:${NC} available (bash ${bash_version})"
    [[ -z "$recommended" ]] && recommended="L0 Shell"
  else
    echo -e "  ${RED}L0 Shell:${NC} unavailable (${shell_status})"
  fi

  echo ""
  if [[ -n "$recommended" ]]; then
    echo -e "${BOLD}[DAG] Recommended:${NC} ${recommended}"
  else
    echo -e "${RED}[DAG] No engines available!${NC}"
  fi
  echo ""
}

# ============================================================================
# Engine Execution
# ============================================================================

run_rust_engine() {
  local dag_file="$1"
  shift
  log_ok "Using L1 Rust engine"
  exec eket dag:run "$dag_file" "$@"
}

run_node_engine() {
  local dag_file="$1"
  shift
  log_ok "Using L2 Node engine"
  exec node "${NODE_DIR}/dist/index.js" dag:run "$dag_file" "$@"
}

run_shell_engine() {
  local dag_file="$1"
  shift
  log_ok "Using L0 Shell engine"
  exec "${SCRIPT_DIR}/dag-runner.sh" "$dag_file" "$@"
}

# Run with fallback chain
run_with_fallback() {
  local dag_file="$1"
  shift
  local fallback_enabled="${EKET_DAG_FALLBACK:-true}"

  # Try Rust first
  local rust_status
  rust_status=$(check_rust_available 2>/dev/null || true)
  if [[ "$rust_status" == "available" ]]; then
    run_rust_engine "$dag_file" "$@"
    return $?
  fi

  if [[ "$fallback_enabled" != "true" ]]; then
    log_error "Rust engine unavailable and fallback disabled"
    log_error "Reason: ${rust_status}"
    exit 1
  fi

  log_warn "Fallback to L2 Node (Rust unavailable: ${rust_status})"

  # Try Node
  local node_status
  node_status=$(check_node_available 2>/dev/null || true)
  if [[ "$node_status" == "available" ]]; then
    run_node_engine "$dag_file" "$@"
    return $?
  fi

  log_warn "Fallback to L0 Shell (Node unavailable: ${node_status})"

  # Try Shell (always available)
  local shell_status
  shell_status=$(check_shell_available 2>/dev/null || true)
  if [[ "$shell_status" == "available" ]]; then
    run_shell_engine "$dag_file" "$@"
    return $?
  fi

  log_error "No DAG execution engine available!"
  log_error "Please ensure dag-runner.sh exists and is executable"
  exit 1
}

# ============================================================================
# CLI
# ============================================================================

usage() {
  cat <<EOF
EKET Unified DAG Entry Point (TASK-635)

Usage:
  $(basename "$0") [options] <dag.yml>
  $(basename "$0") --health

Options:
  --engine=<type>   Force specific engine: rust, node, or shell
  --dry-run         Show execution order without running
  --health          Display engine availability status
  -h, --help        Show this help

Environment Variables:
  EKET_DAG_ENGINE    Force specific engine (rust|node|shell)
  EKET_DAG_FALLBACK  Enable fallback chain (default: true)

Examples:
  # Auto-detect best engine
  $(basename "$0") jira/epics/EPIC-017/dag.yml

  # Force Node.js engine
  $(basename "$0") --engine=node jira/epics/EPIC-017/dag.yml

  # Dry run with Shell engine
  $(basename "$0") --engine=shell --dry-run jira/epics/EPIC-017/dag.yml

  # Check engine availability
  $(basename "$0") --health

Engines:
  L1 Rust   High-performance, SQLite checkpointing, parallel execution
  L2 Node   TypeScript, EventBus integration, semaphore concurrency
  L0 Shell  POSIX fallback, works anywhere
EOF
}

main() {
  local engine=""
  local dag_file=""
  local show_health=0
  local extra_args=()

  # Parse arguments
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --engine=*)
        engine="${1#--engine=}"
        shift
        ;;
      --health)
        show_health=1
        shift
        ;;
      -h|--help)
        usage
        exit 0
        ;;
      --dry-run|--validate|--resume|--debug)
        extra_args+=("$1")
        shift
        ;;
      -*)
        log_error "Unknown option: $1"
        usage
        exit 1
        ;;
      *)
        if [[ -z "$dag_file" ]]; then
          dag_file="$1"
        else
          extra_args+=("$1")
        fi
        shift
        ;;
    esac
  done

  # Health check mode
  if [[ $show_health -eq 1 ]]; then
    print_health
    exit 0
  fi

  # Require dag file
  if [[ -z "$dag_file" ]]; then
    log_error "DAG file required"
    usage
    exit 1
  fi

  # Validate dag file exists
  if [[ ! -f "$dag_file" ]]; then
    log_error "DAG file not found: $dag_file"
    exit 1
  fi

  # Use environment variable if engine not specified
  engine="${engine:-${EKET_DAG_ENGINE:-}}"

  # Execute with specified engine or auto-detect
  if [[ -n "$engine" ]]; then
    case "$engine" in
      rust)
        local rust_status
        rust_status=$(check_rust_available 2>/dev/null || true)
        if [[ "$rust_status" != "available" ]]; then
          log_error "Rust engine not available: ${rust_status}"
          exit 1
        fi
        run_rust_engine "$dag_file" "${extra_args[@]}"
        ;;
      node)
        local node_status
        node_status=$(check_node_available 2>/dev/null || true)
        if [[ "$node_status" != "available" ]]; then
          log_error "Node engine not available: ${node_status}"
          exit 1
        fi
        run_node_engine "$dag_file" "${extra_args[@]}"
        ;;
      shell)
        local shell_status
        shell_status=$(check_shell_available 2>/dev/null || true)
        if [[ "$shell_status" != "available" ]]; then
          log_error "Shell engine not available: ${shell_status}"
          exit 1
        fi
        run_shell_engine "$dag_file" "${extra_args[@]}"
        ;;
      *)
        log_error "Unknown engine: $engine"
        log_error "Valid engines: rust, node, shell"
        exit 1
        ;;
    esac
  else
    # Auto-detect and run with fallback
    run_with_fallback "$dag_file" "${extra_args[@]}"
  fi
}

# Run if executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
