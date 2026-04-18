#!/usr/bin/env bash
# lib/state/schema.sh — 从 protocol/schemas/ 做数据校验
#
# 完整校验依赖 ajv-cli 或 yq。未安装时降级为基本字段存在性检查。

[[ "${_EKET_STATE_SCHEMA_LOADED:-}" == "1" ]] && return 0
_EKET_STATE_SCHEMA_LOADED=1

EKET_ROOT="${EKET_ROOT:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
EKET_PROTOCOL_DIR="${EKET_ROOT}/protocol"

# ─── 协议版本检查（启动时调用） ───────────────────────────────────────────
schema_check_protocol_version() {
  local version_file="${EKET_PROTOCOL_DIR}/VERSION"
  if [[ ! -f "$version_file" ]]; then
    echo "schema: protocol/VERSION missing" >&2
    return 1
  fi
  local version
  version=$(head -n1 "$version_file" | tr -d '[:space:]')
  export EKET_PROTOCOL_VERSION="$version"
}

# ─── 校验 ticket 状态值 ───────────────────────────────────────────────────
schema_validate_ticket_status() {
  local status="$1"
  local machine_file="${EKET_PROTOCOL_DIR}/state-machines/ticket-status.yml"

  [[ -f "$machine_file" ]] || { echo "schema: missing $machine_file" >&2; return 1; }

  # 使用 yq 或基本 grep
  if command -v yq &>/dev/null; then
    if yq eval ".states | has(\"$status\")" "$machine_file" | grep -q true; then
      return 0
    fi
  else
    # 降级：在 yaml 中 grep "  <status>:"
    if grep -qE "^  ${status}:\$" "$machine_file"; then
      return 0
    fi
  fi

  echo "schema: invalid ticket status '$status'" >&2
  return 1
}

# ─── 校验状态转移是否合法 ────────────────────────────────────────────────
schema_validate_ticket_transition() {
  local current="$1"
  local next="$2"
  local machine_file="${EKET_PROTOCOL_DIR}/state-machines/ticket-status.yml"

  if command -v yq >/dev/null 2>&1; then
    local allowed
    allowed=$(yq eval ".states.\"$current\".allowed_transitions[]" "$machine_file" 2>/dev/null || echo "")
    if echo "$allowed" | grep -qx "$next"; then
      return 0
    fi
    echo "schema: invalid transition $current -> $next" >&2
    return 1
  fi

  # Pure-bash 降级 parser：在 states.<current>.allowed_transitions 行中查 next
  local in_state=0
  local line
  while IFS= read -r line; do
    if [[ "$line" =~ ^[[:space:]]{2}${current}:[[:space:]]*$ ]]; then
      in_state=1
      continue
    fi
    if (( in_state )); then
      # 碰到下一个二级 key 就退出
      if [[ "$line" =~ ^[[:space:]]{2}[a-z_]+:[[:space:]]*$ ]]; then
        break
      fi
      if [[ "$line" =~ allowed_transitions:[[:space:]]*\[([^]]*)\] ]]; then
        local list="${BASH_REMATCH[1]//[[:space:]]/}"
        IFS=',' read -ra arr <<< "$list"
        for t in "${arr[@]}"; do
          [[ "$t" == "$next" ]] && return 0
        done
        echo "schema: invalid transition $current -> $next" >&2
        return 1
      fi
    fi
  done < "$machine_file"

  echo "schema: state '$current' not found in $machine_file" >&2
  return 1
}

# ─── 校验 ticket ID 格式 ─────────────────────────────────────────────────
schema_validate_ticket_id() {
  local id="$1"
  if [[ "$id" =~ ^(FEAT|TASK|FIX|TEST|DEPL|T-DESIGN)-[0-9]{3,6}$ ]]; then
    return 0
  fi
  echo "schema: invalid ticket id '$id'" >&2
  return 1
}

# ─── 校验 node_id 格式 ───────────────────────────────────────────────────
schema_validate_node_id() {
  local id="$1"
  if [[ "$id" =~ ^[a-z][a-z0-9_-]{2,63}$ ]]; then
    return 0
  fi
  echo "schema: invalid node_id '$id'" >&2
  return 1
}

# ─── 校验 priority / importance ──────────────────────────────────────────
schema_validate_priority() {
  case "$1" in
    P0|P1|P2|P3) return 0 ;;
    *) echo "schema: invalid priority '$1'" >&2; return 1 ;;
  esac
}

schema_validate_importance() {
  case "$1" in
    critical|high|medium|low) return 0 ;;
    *) echo "schema: invalid importance '$1'" >&2; return 1 ;;
  esac
}

schema_validate_heartbeat_status() {
  case "$1" in
    idle|busy|working|blocked|offline|draining) return 0 ;;
    *) echo "schema: invalid heartbeat status '$1' (expected idle/busy/working/blocked/offline/draining)" >&2; return 1 ;;
  esac
}
