#!/usr/bin/env bash
# lib/state/preflight.sh — EKET Shell writer 的外部依赖检查
#
# 设计目标：在完全空白机器上（mac/ubuntu/alpine/rhel）也能准确诊断缺什么，
# 并给出该 OS 对应的安装命令。
#
# 依赖分级：
#   HARD_REQUIRED  — 无法降级，缺则 writer 禁用
#   SOFT_REQUIRED  — 有 shell 降级，缺只是性能/并发弱化
#   OPTIONAL       — 缺则特性关闭（不影响核心写入）

[[ "${_EKET_STATE_PREFLIGHT_LOADED:-}" == "1" ]] && return 0
_EKET_STATE_PREFLIGHT_LOADED=1

# ─── 分级清单 ───────────────────────────────────────────────────────────
# jq     — JSON 注入防御（无安全降级）
# 其余   — POSIX coreutils/findutils，blank Alpine/Debian/Mac 均自带
_EKET_HARD_REQUIRED=(jq awk sed grep date mv mkdir cat tr find)

# flock    — 文件锁；macOS 默认无；lock.sh 有 mkdir-lock 降级
# hostname — 主机名；heartbeat 用；可降级 uname -n
_EKET_SOFT_REQUIRED=(flock hostname)

# yq       — schema.sh 完整 YAML 校验；无则 grep 降级
_EKET_OPTIONAL=(yq)

# ─── OS 感知 ─────────────────────────────────────────────────────────────
_eket_detect_os() {
  case "$(uname -s)" in
    Darwin) echo "mac"; return ;;
    Linux)
      if   [[ -f /etc/alpine-release ]]; then echo "alpine"
      elif [[ -f /etc/debian_version ]]; then echo "debian"
      elif [[ -f /etc/redhat-release ]]; then echo "rhel"
      else echo "linux"
      fi
      ;;
    *) echo "unknown" ;;
  esac
}

_eket_install_cmd() {
  local tool="$1" os="$2"
  case "$tool" in
    jq)
      case "$os" in
        mac)    echo "brew install jq" ;;
        debian) echo "sudo apt-get update && sudo apt-get install -y jq" ;;
        rhel)   echo "sudo yum install -y jq   (or: sudo dnf install -y jq)" ;;
        alpine) echo "apk add --no-cache jq" ;;
        *)      echo "install jq via your package manager" ;;
      esac ;;
    flock)
      case "$os" in
        mac)    echo "brew install flock                  (macOS 无自带)" ;;
        debian) echo "sudo apt-get install -y util-linux  (通常已装)" ;;
        rhel)   echo "sudo yum install -y util-linux      (通常已装)" ;;
        alpine) echo "apk add --no-cache util-linux" ;;
        *)      echo "install util-linux for flock" ;;
      esac ;;
    hostname)
      case "$os" in
        alpine) echo "apk add --no-cache busybox          (通常已装)" ;;
        debian) echo "sudo apt-get install -y hostname" ;;
        *)      echo "系统自带；或 fallback: uname -n" ;;
      esac ;;
    yq)
      case "$os" in
        mac)    echo "brew install yq" ;;
        debian) echo "sudo snap install yq   或  pip install yq" ;;
        rhel)   echo "pip install yq" ;;
        alpine) echo "apk add --no-cache yq" ;;
        *)      echo "pip install yq  或  go install github.com/mikefarah/yq/v4@latest" ;;
      esac ;;
    awk|sed|grep|date|mv|mkdir|cat|tr|find)
      case "$os" in
        alpine) echo "apk add --no-cache coreutils findutils gawk" ;;
        debian) echo "sudo apt-get install -y coreutils findutils gawk" ;;
        *)      echo "系统自带 coreutils/findutils/gawk" ;;
      esac ;;
    *) echo "install via your package manager" ;;
  esac
}

# ─── 扫描缺失（供 install-deps.sh 等聚合脚本调用） ───────────────────────
# 输出每行: tier\ttool\tinstall_cmd
state_preflight_report() {
  local os; os="$(_eket_detect_os)"
  local tool tier
  for tier in HARD SOFT OPT; do
    case "$tier" in
      HARD) local -a list=("${_EKET_HARD_REQUIRED[@]}") ;;
      SOFT) local -a list=("${_EKET_SOFT_REQUIRED[@]}") ;;
      OPT)  local -a list=("${_EKET_OPTIONAL[@]}") ;;
    esac
    for tool in "${list[@]}"; do
      command -v "$tool" >/dev/null 2>&1 && continue
      printf '%s\t%s\t%s\n' "$tier" "$tool" "$(_eket_install_cmd "$tool" "$os")"
    done
  done
}

# ─── 依赖预检（writer 启动调用） ────────────────────────────────────────
# 返回 0: 所有 HARD 通过
# 返回 1: 有 HARD 缺失（stderr 打印清单 + OS-specific 安装命令 + 一键提示）
state_preflight_deps() {
  local -a missing_hard=() missing_soft=() missing_opt=()
  local tool os
  os="$(_eket_detect_os)"

  for tool in "${_EKET_HARD_REQUIRED[@]}"; do
    command -v "$tool" >/dev/null 2>&1 || missing_hard+=("$tool")
  done
  for tool in "${_EKET_SOFT_REQUIRED[@]}"; do
    command -v "$tool" >/dev/null 2>&1 || missing_soft+=("$tool")
  done
  for tool in "${_EKET_OPTIONAL[@]}"; do
    command -v "$tool" >/dev/null 2>&1 || missing_opt+=("$tool")
  done

  # SOFT / OPTIONAL 缺失只在 verbose 时提示，不阻塞
  if [[ "${EKET_VERBOSE:-0}" == "1" ]]; then
    (( ${#missing_soft[@]} > 0 )) && \
      printf 'eket: soft-required missing (fallback active): %s\n' \
        "${missing_soft[*]}" >&2
    (( ${#missing_opt[@]} > 0 )) && \
      printf 'eket: optional missing (feature disabled): %s\n' \
        "${missing_opt[*]}" >&2
  fi

  if (( ${#missing_hard[@]} > 0 )); then
    {
      printf '\neket: required tools missing — writer disabled (OS=%s)\n' "$os"
      for tool in "${missing_hard[@]}"; do
        printf '  ✗ %-8s  → %s\n' "$tool" "$(_eket_install_cmd "$tool" "$os")"
      done
      printf '\n一键安装:  bash scripts/install-deps.sh\n'
      printf '强制跳过:  export EKET_SKIP_PREFLIGHT=1  (不推荐，可能损坏状态)\n\n'
    } >&2
    [[ "${EKET_SKIP_PREFLIGHT:-0}" == "1" ]] && return 0
    return 1
  fi

  # 导出 SOFT 缺失状态供 lock.sh / writer.sh 选择降级路径
  export EKET_HAS_FLOCK=1
  export EKET_HAS_HOSTNAME=1
  for tool in "${missing_soft[@]}"; do
    case "$tool" in
      flock)    export EKET_HAS_FLOCK=0 ;;
      hostname) export EKET_HAS_HOSTNAME=0 ;;
    esac
  done

  return 0
}
