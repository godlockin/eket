#!/usr/bin/env bash
# lib/state/lock.sh — 文件锁工具
#
# 规范: protocol/conventions/file-locking.md
# 用法: source 此文件后调用 state_with_lock

[[ "${_EKET_STATE_LOCK_LOADED:-}" == "1" ]] && return 0
_EKET_STATE_LOCK_LOADED=1

EKET_ROOT="${EKET_ROOT:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
EKET_LOCK_DIR="${EKET_ROOT}/.eket/locks"
EKET_LOCK_TIMEOUT="${EKET_LOCK_TIMEOUT:-5}"

# ─── 获取资源对应的锁文件路径 ─────────────────────────────────────────────
_lock_path() {
  local resource="$1"
  # 将 : / 等字符替换为 _
  local safe
  safe=$(echo "$resource" | tr ':/' '__')
  echo "${EKET_LOCK_DIR}/${safe}.lock"
}

# ─── 执行加锁操作 ─────────────────────────────────────────────────────────
# 用法: state_with_lock <resource> <command...>
# 示例: state_with_lock "ticket:FEAT-001" atomic_write "$file" "$content"
#
# 实现：flock（优先）→ mkdir 锁（降级；POSIX 保证 mkdir 原子性）
# 由 preflight 设置的 EKET_HAS_FLOCK=0/1 决定路径。
state_with_lock() {
  local resource="$1"
  shift

  if [[ $# -eq 0 ]]; then
    echo "state_with_lock: command required" >&2
    return 1
  fi

  local lockfile
  lockfile=$(_lock_path "$resource")
  mkdir -p "$(dirname "$lockfile")"

  # ─── flock 路径（Linux 默认；macOS 需 brew install flock） ───
  if [[ "${EKET_HAS_FLOCK:-1}" == "1" ]] && command -v flock >/dev/null 2>&1; then
    (
      exec 200>"$lockfile"
      if ! flock -w "$EKET_LOCK_TIMEOUT" 200; then
        echo "LOCK_TIMEOUT: $resource (after ${EKET_LOCK_TIMEOUT}s)" >&2
        return 1
      fi
      trap 'rm -f "${lockfile}.holder"' EXIT
      printf 'pid=%s\nengine=shell\nts=%s\nresource=%s\n' \
        "$$" "$(date -u +%FT%TZ)" "$resource" > "${lockfile}.holder"
      local rc=0
      set +e
      "$@"
      rc=$?
      set -e
      return $rc
    )
    return $?
  fi

  # ─── mkdir 锁降级（macOS 无 flock 时用） ───
  # mkdir(2) 在所有 POSIX 文件系统上原子，不会并发创建两次成功。
  # 注意：进程 crash 留下的 stale lock 需超时清理。
  local lockdir="${lockfile}.d"
  local deadline=$(( $(date +%s) + EKET_LOCK_TIMEOUT ))
  local holder="${lockdir}/holder"
  while ! mkdir "$lockdir" 2>/dev/null; do
    # stale 检测：锁目录存在 > 2*TIMEOUT 且 holder pid 已死 → 强制接管
    if [[ -f "$holder" ]]; then
      local stale_pid
      stale_pid=$(grep -m1 '^pid=' "$holder" 2>/dev/null | sed 's/^pid=//')
      if [[ -n "$stale_pid" ]] && ! kill -0 "$stale_pid" 2>/dev/null; then
        rm -rf "$lockdir" 2>/dev/null
        continue
      fi
    fi
    if (( $(date +%s) >= deadline )); then
      echo "LOCK_TIMEOUT: $resource (after ${EKET_LOCK_TIMEOUT}s, mkdir-lock)" >&2
      return 1
    fi
    sleep 0.1
  done

  # 锁获取成功 — 注册清理 + 写 holder
  trap 'rm -rf "$lockdir" 2>/dev/null' RETURN
  printf 'pid=%s\nengine=shell\nts=%s\nresource=%s\n' \
    "$$" "$(date -u +%FT%TZ)" "$resource" > "$holder"

  local rc=0
  set +e
  "$@"
  rc=$?
  set -e
  rm -rf "$lockdir" 2>/dev/null
  trap - RETURN
  return $rc
}

# ─── 检查锁是否被持有（非阻塞） ───────────────────────────────────────────
state_lock_held() {
  local resource="$1"
  local lockfile
  lockfile=$(_lock_path "$resource")

  # mkdir-lock 路径
  if [[ "${EKET_HAS_FLOCK:-1}" != "1" ]] || ! command -v flock >/dev/null 2>&1; then
    [[ -d "${lockfile}.d" ]]
    return $?
  fi

  [[ -f "$lockfile" ]] || return 1
  (
    exec 200>"$lockfile"
    if flock -n 200; then
      return 1  # 能拿到 = 无人持有
    else
      return 0  # 拿不到 = 有人持有
    fi
  )
}
