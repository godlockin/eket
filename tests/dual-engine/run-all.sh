#!/usr/bin/env bash
# tests/dual-engine/run-all.sh — 运行所有等价性测试
#
# 用法:
#   ./run-all.sh                # 本地
#   ./run-all.sh --ci           # CI 模式（skeleton 阶段仅 skip）

set -eo pipefail

_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCENARIOS_DIR="${_SCRIPT_DIR}/scenarios"

mode="${1:-local}"
extra_args=()
[[ "$mode" == "--ci" ]] && extra_args+=("--skeleton-ok")

total=0
passed=0
failed=0
skipped=0

shopt -s nullglob
for scenario in "$SCENARIOS_DIR"/*.sh; do
  total=$((total + 1))
  name=$(basename "$scenario")
  echo ""
  echo "▶ $name"

  # 单次执行，捕获 rc + 输出（禁用 errexit 以继续汇总）
  set +e
  out=$(bash "$scenario" "${extra_args[@]}" 2>&1)
  rc=$?
  set -e
  printf '%s\n' "$out"

  if (( rc != 0 )); then
    failed=$((failed + 1))
  elif printf '%s' "$out" | grep -q '^SKIP:'; then
    skipped=$((skipped + 1))
  else
    passed=$((passed + 1))
  fi
done

echo ""
echo "═══════════════════════════════════════════════════════════════════"
echo "  Dual-Engine Summary"
echo "═══════════════════════════════════════════════════════════════════"
echo "  Total:   $total"
echo "  Passed:  $passed"
echo "  Skipped: $skipped"
echo "  Failed:  $failed"

[[ $failed -eq 0 ]] || exit 1
