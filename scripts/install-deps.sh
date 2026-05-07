#!/usr/bin/env bash
# scripts/install-deps.sh — 为当前机器一键安装 EKET 所需外部工具
#
# 用法:
#   bash scripts/install-deps.sh          # 只装 HARD_REQUIRED (jq)
#   bash scripts/install-deps.sh --all    # HARD + SOFT + OPTIONAL (推荐)
#   bash scripts/install-deps.sh --dry    # 只打印命令不执行
#
# 支持: macOS (brew), Debian/Ubuntu (apt), RHEL/CentOS (yum/dnf), Alpine (apk)

set -eo pipefail

_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=../lib/state/preflight.sh
source "${_root}/lib/state/preflight.sh"

MODE="hard"       # hard | all
DRY=0
for arg in "$@"; do
  case "$arg" in
    --all) MODE="all" ;;
    --dry) DRY=1 ;;
    -h|--help)
      sed -n '2,10p' "${BASH_SOURCE[0]}"; exit 0 ;;
  esac
done

os="$(_eket_detect_os)"
echo "eket install-deps: OS=${os}, mode=${MODE}"

# 聚合缺失工具（按 tier 过滤）
declare -a to_install=()
while IFS=$'\t' read -r tier tool _cmd; do
  case "$MODE:$tier" in
    hard:HARD) to_install+=("$tool") ;;
    all:*)     to_install+=("$tool") ;;
  esac
done < <(state_preflight_report)

if (( ${#to_install[@]} == 0 )); then
  echo "✓ All required tools already installed."
  exit 0
fi

echo "Will install: ${to_install[*]}"

# 按 OS 聚合成单条命令
case "$os" in
  mac)
    if ! command -v brew >/dev/null 2>&1; then
      echo "✗ Homebrew not found. Install from https://brew.sh first." >&2
      exit 1
    fi
    cmd=(brew install "${to_install[@]}") ;;
  debian)
    cmd=(sudo apt-get update "&&" sudo apt-get install -y "${to_install[@]}") ;;
  rhel)
    if command -v dnf >/dev/null 2>&1; then
      cmd=(sudo dnf install -y "${to_install[@]}")
    else
      cmd=(sudo yum install -y "${to_install[@]}")
    fi ;;
  alpine)
    cmd=(apk add --no-cache "${to_install[@]}") ;;
  *)
    echo "✗ Unsupported OS — please install manually:" >&2
    state_preflight_report | awk -F'\t' '{printf "  %-4s %-10s %s\n", $1, $2, $3}' >&2
    exit 1 ;;
esac

printf '+ %s\n' "${cmd[*]}"
(( DRY == 1 )) && exit 0

# debian 用 && 链接，需 bash -c
if [[ "$os" == "debian" ]]; then
  bash -c "sudo apt-get update && sudo apt-get install -y ${to_install[*]}"
else
  "${cmd[@]}"
fi

echo ""
echo "✓ Install done. Verify:  bash -c 'source lib/state/preflight.sh && state_preflight_deps && echo OK'"
