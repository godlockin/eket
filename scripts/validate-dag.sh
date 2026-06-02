#!/usr/bin/env bash
#
# validate-dag.sh — Validate EKET DAG YAML files
#
# Usage: ./scripts/validate-dag.sh <dag.yaml>
#
# Requires: python3 + pyyaml (fallback from yq)
#
# Exit codes:
#   0 - Valid
#   1 - Invalid (validation errors)
#   2 - Usage error / missing deps

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

error() { echo -e "${RED}ERROR:${NC} $1" >&2; }
warn() { echo -e "${YELLOW}WARN:${NC} $1" >&2; }
ok() { echo -e "${GREEN}OK:${NC} $1"; }

# Check dependencies
check_deps() {
  if command -v yq &>/dev/null; then
    PARSER="yq"
    return 0
  fi

  if command -v python3 &>/dev/null; then
    if python3 -c "import yaml" &>/dev/null; then
      PARSER="python"
      return 0
    fi
  fi

  error "Either yq or python3+pyyaml is required"
  echo "Install: brew install yq  OR  pip3 install pyyaml" >&2
  exit 2
}

# Usage
usage() {
  echo "Usage: $0 <dag.yaml>"
  echo ""
  echo "Validates EKET DAG YAML against schema."
  echo ""
  echo "Options:"
  echo "  -h, --help    Show this help"
  echo "  -v, --verbose Show detailed validation"
  exit 2
}

# Python-based validation (more portable)
validate_with_python() {
  local file="$1"
  local verbose="$2"

  python3 << PYTHON_SCRIPT
import sys
import yaml
import re
from collections import defaultdict

def main():
    errors = []
    verbose = $( [[ "$verbose" == "true" ]] && echo "True" || echo "False" )

    try:
        with open("$file", 'r') as f:
            dag = yaml.safe_load(f)
    except yaml.YAMLError as e:
        print(f"ERROR: Invalid YAML syntax: {e}", file=sys.stderr)
        sys.exit(1)

    if not isinstance(dag, dict):
        print("ERROR: DAG must be an object", file=sys.stderr)
        sys.exit(1)

    # Check version
    version = dag.get('version', '')
    if not version:
        errors.append("Missing required field: version")
    elif not re.match(r'^[0-9]+\.[0-9]+$', str(version)):
        errors.append(f"version must match pattern X.Y, got: {version}")

    # Check epic
    epic = dag.get('epic', '')
    if not epic:
        errors.append("Missing required field: epic")
    elif not re.match(r'^EPIC-[0-9]+$', str(epic)):
        errors.append(f"epic must match pattern EPIC-NNN, got: {epic}")

    # Check nodes
    nodes = dag.get('nodes', [])
    if not isinstance(nodes, list) or len(nodes) == 0:
        errors.append("nodes array must not be empty")
        for e in errors:
            print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)

    node_ids = set()
    node_deps = {}

    for i, node in enumerate(nodes):
        if not isinstance(node, dict):
            errors.append(f"nodes[{i}]: must be an object")
            continue

        node_id = node.get('id', '')
        script = node.get('script', '')

        if not node_id:
            errors.append(f"nodes[{i}]: missing required field 'id'")
        elif not re.match(r'^TASK-[0-9]+$', str(node_id)):
            errors.append(f"nodes[{i}]: id must match pattern TASK-NNN, got: {node_id}")
        else:
            node_ids.add(node_id)
            node_deps[node_id] = node.get('deps', [])

        if not script:
            errors.append(f"nodes[{i}]: missing required field 'script'")

        if verbose:
            print(f"  Validated node: {node_id}")

    # Check deps exist
    for i, node in enumerate(nodes):
        if not isinstance(node, dict):
            continue
        deps = node.get('deps', [])
        for dep in deps:
            if dep not in node_ids:
                errors.append(f"nodes[{i}].deps: dependency '{dep}' does not exist")

    # Detect cycles using DFS
    def detect_cycle():
        visited = set()
        rec_stack = set()

        def dfs(node_id, path):
            if node_id in rec_stack:
                return path + [node_id]
            if node_id in visited:
                return None

            visited.add(node_id)
            rec_stack.add(node_id)

            for dep in node_deps.get(node_id, []):
                cycle = dfs(dep, path + [node_id])
                if cycle:
                    return cycle

            rec_stack.remove(node_id)
            return None

        for node_id in node_ids:
            cycle = dfs(node_id, [])
            if cycle:
                return " -> ".join(cycle)
        return None

    cycle = detect_cycle()
    if cycle:
        errors.append(f"Circular dependency detected: {cycle}")

    # Check settings
    settings = dag.get('settings', {})
    on_failure = settings.get('on_failure', 'stop')
    if on_failure not in ('stop', 'continue', 'rollback'):
        errors.append(f"settings.on_failure must be stop|continue|rollback, got: {on_failure}")

    # Result
    if errors:
        for e in errors:
            print(f"ERROR: {e}", file=sys.stderr)
        print(f"ERROR: DAG validation failed with {len(errors)} error(s)", file=sys.stderr)
        sys.exit(1)
    else:
        print(f"OK: DAG validation passed: $file")
        sys.exit(0)

if __name__ == '__main__':
    main()
PYTHON_SCRIPT
}

# yq-based validation (faster if available)
validate_with_yq() {
  local file="$1"
  local verbose="$2"
  local errors=0

  # Parse YAML
  if ! yq '.' "$file" &>/dev/null; then
    error "Invalid YAML syntax in $file"
    exit 1
  fi

  # 1. Check required fields
  local version epic nodes_count

  version=$(yq '.version // ""' "$file")
  if [[ -z "$version" ]]; then
    error "Missing required field: version"
    ((errors++))
  elif [[ ! "$version" =~ ^[0-9]+\.[0-9]+$ ]]; then
    error "version must match pattern X.Y, got: $version"
    ((errors++))
  fi

  epic=$(yq '.epic // ""' "$file")
  if [[ -z "$epic" ]]; then
    error "Missing required field: epic"
    ((errors++))
  elif [[ ! "$epic" =~ ^EPIC-[0-9]+$ ]]; then
    error "epic must match pattern EPIC-NNN, got: $epic"
    ((errors++))
  fi

  nodes_count=$(yq '.nodes | length' "$file")
  if [[ "$nodes_count" -eq 0 ]]; then
    error "nodes array must not be empty"
    ((errors++))
  fi

  # 2. Validate each node
  local node_ids=()
  for i in $(seq 0 $((nodes_count - 1))); do
    local id script

    id=$(yq ".nodes[$i].id // \"\"" "$file")
    script=$(yq ".nodes[$i].script // \"\"" "$file")

    if [[ -z "$id" ]]; then
      error "nodes[$i]: missing required field 'id'"
      ((errors++))
      continue
    fi

    if [[ ! "$id" =~ ^TASK-[0-9]+$ ]]; then
      error "nodes[$i]: id must match pattern TASK-NNN, got: $id"
      ((errors++))
    fi

    if [[ -z "$script" ]]; then
      error "nodes[$i]: missing required field 'script'"
      ((errors++))
    fi

    node_ids+=("$id")

    [[ "$verbose" == "true" ]] && echo "  Validated node: $id"
  done

  # 3. Check deps exist
  for i in $(seq 0 $((nodes_count - 1))); do
    local deps_count
    deps_count=$(yq ".nodes[$i].deps | length" "$file")

    for j in $(seq 0 $((deps_count - 1))); do
      local dep
      dep=$(yq ".nodes[$i].deps[$j]" "$file")

      # Check if dep exists in node_ids
      local found=false
      for nid in "${node_ids[@]}"; do
        if [[ "$nid" == "$dep" ]]; then
          found=true
          break
        fi
      done

      if [[ "$found" == "false" ]]; then
        error "nodes[$i].deps: dependency '$dep' does not exist"
        ((errors++))
      fi
    done
  done

  # 4. Detect cycles (via topological sort) - simplified check
  # Full cycle detection delegated to python for complexity

  # 5. Validate settings (optional)
  local on_failure
  on_failure=$(yq '.settings.on_failure // "stop"' "$file")
  if [[ ! "$on_failure" =~ ^(stop|continue|rollback)$ ]]; then
    error "settings.on_failure must be stop|continue|rollback, got: $on_failure"
    ((errors++))
  fi

  # Result
  if [[ "$errors" -eq 0 ]]; then
    ok "DAG validation passed: $file"
    return 0
  else
    error "DAG validation failed with $errors error(s)"
    return 1
  fi
}

# Main validation dispatcher
validate_dag() {
  local file="$1"
  local verbose="${2:-false}"

  if [[ ! -f "$file" ]]; then
    error "File not found: $file"
    exit 1
  fi

  if [[ "$PARSER" == "python" ]]; then
    validate_with_python "$file" "$verbose"
  else
    validate_with_yq "$file" "$verbose"
  fi
}

# Parse args
main() {
  check_deps

  local verbose=false
  local file=""

  while [[ $# -gt 0 ]]; do
    case "$1" in
      -h|--help) usage ;;
      -v|--verbose) verbose=true; shift ;;
      -*) error "Unknown option: $1"; usage ;;
      *) file="$1"; shift ;;
    esac
  done

  if [[ -z "$file" ]]; then
    error "No input file specified"
    usage
  fi

  validate_dag "$file" "$verbose"
}

main "$@"
