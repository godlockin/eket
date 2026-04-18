#!/usr/bin/env bash
# lib/state/atomic.sh — 原子写入工具
#
# 规范: protocol/conventions/atomic-write.md
# 用法: source 此文件后调用函数

# 防止重复 source
[[ "${_EKET_STATE_ATOMIC_LOADED:-}" == "1" ]] && return 0
_EKET_STATE_ATOMIC_LOADED=1

# ─── 原子写入 ─────────────────────────────────────────────────────────────
# 用法: atomic_write <target> <content>
# 保证: 读方要么看到完整旧内容，要么完整新内容，不会看到半写
atomic_write() {
  local target="$1"
  local content="$2"

  if [[ -z "$target" ]]; then
    echo "atomic_write: target path required" >&2
    return 1
  fi

  local dir
  dir=$(dirname "$target")
  [[ -d "$dir" ]] || mkdir -p "$dir"

  # tmp 文件必须在同一挂载点，保证 rename 原子
  local tmp="${target}.tmp.$$.$RANDOM"

  # 写入
  if ! printf '%s' "$content" > "$tmp"; then
    rm -f "$tmp"
    return 1
  fi

  # POSIX rename 原子
  if ! mv -f "$tmp" "$target"; then
    rm -f "$tmp"
    return 1
  fi

  return 0
}

# ─── 原子追加（日志类，按行） ──────────────────────────────────────────────
# 用法: atomic_append <target> <line>
# 依赖: OS 的 O_APPEND 保证单次 write(2) 原子（行长 < PIPE_BUF，通常 4096）
atomic_append() {
  local target="$1"
  local line="$2"

  local dir
  dir=$(dirname "$target")
  [[ -d "$dir" ]] || mkdir -p "$dir"

  printf '%s\n' "$line" >> "$target"
}
