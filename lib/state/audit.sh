#!/usr/bin/env bash
# lib/state/audit.sh — 审计日志
#
# 所有 state_write_* 调用必须通过 state_audit 记录
# 审计文件: shared/audit.log

[[ "${_EKET_STATE_AUDIT_LOADED:-}" == "1" ]] && return 0
_EKET_STATE_AUDIT_LOADED=1

EKET_ROOT="${EKET_ROOT:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
EKET_AUDIT_LOG="${EKET_AUDIT_LOG:-${EKET_ROOT}/shared/audit.log}"

# ─── 追加审计记录 ─────────────────────────────────────────────────────────
# 用法: state_audit <op> <target> <actor> [field=value...]
# 格式: ISO8601 | actor | engine | op | target | details
state_audit() {
  local op="$1"
  local target="$2"
  local actor="${3:-${EKET_NODE_ID:-unknown}}"
  shift 3 || true
  local details="$*"

  # 转义 | 以保留列分隔 (对齐 node/src/core/state/audit.ts)
  details="${details//|/\\|}"

  local ts
  ts=$(date -u +%FT%TZ)

  local dir
  dir=$(dirname "$EKET_AUDIT_LOG")
  [[ -d "$dir" ]] || mkdir -p "$dir"

  # 单行 | 分隔，O_APPEND 保证原子
  printf '%s | %s | shell | %s | %s | %s\n' \
    "$ts" "$actor" "$op" "$target" "$details" \
    >> "$EKET_AUDIT_LOG"
}

# ─── 查询最近 N 条审计 ────────────────────────────────────────────────────
state_audit_tail() {
  local n="${1:-20}"
  tail -n "$n" "$EKET_AUDIT_LOG" 2>/dev/null || echo "(no audit records)"
}
