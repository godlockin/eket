#!/usr/bin/env bash
# tests/dual-engine/framework.sh — 等价性测试工具
#
# 用法: source 此文件到各 scenario 中

[[ "${_EKET_DUAL_ENGINE_FW_LOADED:-}" == "1" ]] && return 0
_EKET_DUAL_ENGINE_FW_LOADED=1

set -eo pipefail

EKET_ROOT="${EKET_ROOT:-$(git rev-parse --show-toplevel)}"
# Save repo root so scenarios can source lib/state/writer.sh from the real repo
# while EKET_ROOT is redirected to the fixture WORK_DIR.
EKET_REPO_ROOT="$EKET_ROOT"
FIXTURES_DIR="${EKET_ROOT}/tests/dual-engine/fixtures"
WORK_DIR=""

# ─── 颜色输出 ─────────────────────────────────────────────────────────────
_c_red()   { printf '\033[31m%s\033[0m' "$*"; }
_c_green() { printf '\033[32m%s\033[0m' "$*"; }
_c_yellow(){ printf '\033[33m%s\033[0m' "$*"; }

# ─── 选择可用的 sha256 工具（Linux sha256sum / macOS shasum） ──────────────
if command -v sha256sum >/dev/null 2>&1; then
  _HASH_CMD=(sha256sum)
elif command -v shasum >/dev/null 2>&1; then
  _HASH_CMD=(shasum -a 256)
else
  echo "dual-engine: need sha256sum or shasum" >&2
  return 1
fi

# ─── 初始化测试工作区 ───────────────────────────────────────
# 用法: setup_fixture <fixture-name>
# 返回: 0 成功，非 0 失败
setup_fixture() {
  local fixture="$1"
  local src="${FIXTURES_DIR}/${fixture}"

  [[ -d "$src" ]] || { echo "fixture not found: $fixture" >&2; return 1; }

  WORK_DIR=$(mktemp -d -t eket-dual-engine-XXXXXX)
  cp -R "$src/." "$WORK_DIR/"

  # fixture 内只有 seed 文件；protocol 由真实仓库软链接给引擎读取
  ln -sfn "$EKET_ROOT/protocol" "$WORK_DIR/protocol"

  cd "$WORK_DIR"
  return 0
}

# ─── 清理 ─────────────────────────────────────────────────────────────────
cleanup_fixture() {
  [[ -n "$WORK_DIR" && -d "$WORK_DIR" ]] && rm -rf "$WORK_DIR"
}

# ─── 快照 FS 状态 ─────────────────────────────────────────────────────────
# 用法: snapshot_fs <out-file>
# 产出: 排序后的 "normalized_path <sha256>" 列表
#   - path 归一化：msg_YYYYMMDD_HHMMSS_NNN → msg_<ID>；pr-<ticket>-<ts> → pr-<ticket>-<TS>
#   - content 归一化：时间戳 / pid / tmp 后缀（见 _content_normalized）
snapshot_fs() {
  local out="$1"
  (
    cd "$WORK_DIR"
    find jira inbox outbox shared .eket/state -type f 2>/dev/null \
      | sort \
      | while read -r f; do
          local norm_path
          norm_path=$(printf '%s' "$f" \
            | sed -E \
                -e 's|msg_[0-9]{8}_[0-9]{6}_[0-9]{3}|msg_<ID>|g' \
                -e 's|pr-([A-Z]+-[0-9]+)-[0-9]{8}T[0-9]{6}Z|pr-\1-<TS>|g')
          local hash
          hash=$(_content_normalized "$f" | "${_HASH_CMD[@]}" | awk '{print $1}')
          echo "$norm_path $hash"
        done
  ) > "$out"
}

# ─── 归一化文件内容（去除时间戳等 volatile 字段） ─────────────────────────
_content_normalized() {
  local f="$1"
  sed -E \
    -e 's/(timestamp|created_at|updated_at|last_heartbeat|joined_at|registered_at):[[:space:]].+/\1: <TS>/' \
    -e 's/"(timestamp|created_at|updated_at|registered_at)":[[:space:]]*"[^"]+"/"\1": "<TS>"/g' \
    -e 's/(pid):[[:space:]][0-9]+/\1: <PID>/' \
    -e 's/(host):[[:space:]][^[:space:]]+/\1: <HOST>/' \
    -e 's/"id":[[:space:]]*"msg_[0-9]{8}_[0-9]{6}_[0-9]{3}"/"id": "<MSG_ID>"/g' \
    -e 's/msg_[0-9]{8}_[0-9]{6}_[0-9]{3}/<MSG_ID>/g' \
    -e 's/pr-([A-Z]+-[0-9]+)-[0-9]{8}T[0-9]{6}Z/pr-\1-<TS>/g' \
    -e 's/\.tmp\.[0-9]+(\.[0-9]+)?/.tmp.<X>/' \
    -e 's/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:]+Z \|/<TS> |/' \
    -e 's/\| (shell|node) \|/| <ENGINE> |/' \
    "$f"
}

# ─── 对比两个快照 ─────────────────────────────────────────────────────────
assert_equal_snapshots() {
  local a="$1"
  local b="$2"
  local label="${3:-snapshot diff}"

  if diff -u "$a" "$b" > /dev/null; then
    _c_green "  ✓ $label: EQUAL"
    echo
    return 0
  else
    _c_red "  ✗ $label: DIFFER"
    echo
    diff -u "$a" "$b" | head -50
    # P0-9 debug: show normalized content of divergent files
    if [[ "${DUAL_ENGINE_DEBUG:-}" == "1" ]]; then
      echo "--- normalized content diff ---"
      diff -u <(cd "$WORK_DIR" 2>/dev/null; true) <(true) || true
    fi
    return 1
  fi
}

# ─── 执行 Shell 引擎命令 ──────────────────────────────────────────────────
run_shell() {
  EKET_ROOT="$WORK_DIR" bash "$@"
}

# ─── 执行 Node 引擎命令 ──────────────────────────────────────────────────
run_node() {
  EKET_ROOT="$WORK_DIR" node "${EKET_ROOT}/node/dist/index.js" "$@"
}

# ─── 断言文件存在 ────────────────────────────────────────────────────────
assert_file_exists() {
  local path="$1"
  if [[ -f "$WORK_DIR/$path" ]]; then
    _c_green "  ✓ file exists: $path"
    echo
  else
    _c_red "  ✗ file missing: $path"
    echo
    return 1
  fi
}

# ─── 断言 fixture 有实际变化（避免空 scenario 假 PASS） ─────────────────
assert_fs_changed() {
  local pre="$1"
  local post="$2"
  local label="${3:-scenario mutated fs}"

  if diff -q "$pre" "$post" >/dev/null 2>&1; then
    _c_red "  ✗ $label: NO CHANGES (vacuous test)"
    echo
    return 1
  fi
  _c_green "  ✓ $label: mutations detected"
  echo
}

# ─── 测试入口 ────────────────────────────────────────────────────────────
# 用法: dual_engine_test <name> <scenario-fn>
# scenario-fn: 接受参数 $1 = engine ("shell"|"node"|"mixed")，执行相应流程
dual_engine_test() {
  local name="$1"
  local scenario_fn="$2"

  echo "═══════════════════════════════════════════════════════════════════"
  echo "  Dual-Engine Test: $name"
  echo "═══════════════════════════════════════════════════════════════════"

  local pre_shell pre_node pre_mixed
  local snap_shell snap_node snap_mixed
  pre_shell=$(mktemp);  pre_node=$(mktemp);  pre_mixed=$(mktemp)
  snap_shell=$(mktemp); snap_node=$(mktemp); snap_mixed=$(mktemp)

  local failed=0
  for engine in shell node mixed; do
    echo "--- engine=$engine ---"
    if ! setup_fixture "basic"; then failed=1; continue; fi
    case "$engine" in
      shell) snapshot_fs "$pre_shell" ;;
      node)  snapshot_fs "$pre_node"  ;;
      mixed) snapshot_fs "$pre_mixed" ;;
    esac
    $scenario_fn "$engine" || failed=1
    case "$engine" in
      shell) snapshot_fs "$snap_shell"; assert_fs_changed "$pre_shell"  "$snap_shell" "shell mutated fs" || failed=1 ;;
      node)  snapshot_fs "$snap_node";  assert_fs_changed "$pre_node"   "$snap_node"  "node mutated fs"  || failed=1 ;;
      mixed) snapshot_fs "$snap_mixed"; assert_fs_changed "$pre_mixed"  "$snap_mixed" "mixed mutated fs" || failed=1 ;;
    esac
    cleanup_fixture
  done

  assert_equal_snapshots "$snap_shell" "$snap_node"  "Shell vs Node"  || failed=1
  assert_equal_snapshots "$snap_node"  "$snap_mixed" "Node vs Mixed"  || failed=1

  rm -f "$pre_shell" "$pre_node" "$pre_mixed" "$snap_shell" "$snap_node" "$snap_mixed"

  if [[ $failed -eq 0 ]]; then
    _c_green "  ALL PASS: $name"
    echo
  else
    _c_red "  FAILED: $name"
    echo
    return 1
  fi
}
