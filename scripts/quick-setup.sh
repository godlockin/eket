#!/bin/bash
#
# EKET Quick Setup - 30 秒一键安装
#
# 用法:
#   curl -fsSL https://raw.githubusercontent.com/godlockin/eket/main/scripts/quick-setup.sh | bash
#
# 或本地运行:
#   bash scripts/quick-setup.sh
#
# 环境变量:
#   EKET_INSTALL_DIR    安装目录 (默认: ~/.local/bin)
#   EKET_SKILLS_DIR     Skills 目录 (默认: ~/.claude/skills/eket)
#   EKET_VERSION        指定版本 (默认: latest)
#   EKET_SKIP_SKILLS    跳过 skills 安装 (设为 1)
#

set -euo pipefail

# ─────────────────────────────────────────────
# 颜色和图标
# ─────────────────────────────────────────────
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'
BOLD='\033[1m'

print_banner() {
  echo ""
  echo -e "${CYAN}╔═══════════════════════════════════════════╗${NC}"
  echo -e "${CYAN}║${NC}     ${BOLD}EKET Quick Setup${NC}                      ${CYAN}║${NC}"
  echo -e "${CYAN}║${NC}     Master-Slaver 协作框架               ${CYAN}║${NC}"
  echo -e "${CYAN}╚═══════════════════════════════════════════╝${NC}"
  echo ""
}

log_step() { echo -e "${BLUE}→${NC} $1"; }
log_ok()   { echo -e "${GREEN}✓${NC} $1"; }
log_warn() { echo -e "${YELLOW}⚠${NC} $1"; }
log_err()  { echo -e "${RED}✗${NC} $1"; }

# ─────────────────────────────────────────────
# 配置
# ─────────────────────────────────────────────
INSTALL_DIR="${EKET_INSTALL_DIR:-$HOME/.local/bin}"
SKILLS_DIR="${EKET_SKILLS_DIR:-$HOME/.claude/skills/eket}"
VERSION="${EKET_VERSION:-latest}"
REPO_URL="https://github.com/godlockin/eket"
SKILLS_REPO="https://github.com/godlockin/eket.git"

# ─────────────────────────────────────────────
# 平台检测
# ─────────────────────────────────────────────
detect_platform() {
  local os arch

  case "$(uname -s)" in
    Linux*)  os="linux" ;;
    Darwin*) os="macos" ;;
    MINGW*|MSYS*|CYGWIN*) os="windows" ;;
    *)       log_err "不支持的操作系统: $(uname -s)"; exit 1 ;;
  esac

  case "$(uname -m)" in
    x86_64|amd64)  arch="x64" ;;
    arm64|aarch64) arch="arm64" ;;
    *)             log_err "不支持的架构: $(uname -m)"; exit 1 ;;
  esac

  echo "${os}-${arch}"
}

# ─────────────────────────────────────────────
# 依赖检查
# ─────────────────────────────────────────────
check_deps() {
  log_step "检查依赖..."

  local missing=()
  for cmd in curl git; do
    if ! command -v "$cmd" &>/dev/null; then
      missing+=("$cmd")
    fi
  done

  if [ ${#missing[@]} -gt 0 ]; then
    log_err "缺少依赖: ${missing[*]}"
    echo ""
    echo "安装方式:"
    if [[ "$(uname -s)" == "Darwin"* ]]; then
      echo "  brew install ${missing[*]}"
    else
      echo "  sudo apt install ${missing[*]}  # Ubuntu/Debian"
      echo "  sudo yum install ${missing[*]}  # RHEL/CentOS"
    fi
    exit 1
  fi

  log_ok "依赖检查通过 (curl, git)"
}

# ─────────────────────────────────────────────
# 下载预编译 binary
# ─────────────────────────────────────────────
download_binary() {
  local platform
  platform=$(detect_platform)

  log_step "检测平台: $platform"

  local artifact="eket-${platform}"
  local download_url

  if [ "$VERSION" = "latest" ]; then
    download_url="${REPO_URL}/releases/latest/download/${artifact}"
  else
    download_url="${REPO_URL}/releases/download/${VERSION}/${artifact}"
  fi

  log_step "下载 EKET binary..."

  mkdir -p "$INSTALL_DIR"
  local tmp_file
  tmp_file=$(mktemp)

  if curl -fsSL "$download_url" -o "$tmp_file" 2>/dev/null; then
    chmod +x "$tmp_file"
    mv "$tmp_file" "$INSTALL_DIR/eket"
    log_ok "Binary 已安装到 $INSTALL_DIR/eket"
    return 0
  else
    rm -f "$tmp_file"
    log_warn "预编译 binary 下载失败 (可能尚无 release)"
    log_step "尝试 Node.js fallback..."
    return 1
  fi
}

# ─────────────────────────────────────────────
# Node.js fallback
# ─────────────────────────────────────────────
setup_node_fallback() {
  if ! command -v node &>/dev/null; then
    log_warn "Node.js 未安装，跳过 fallback"
    log_warn "请手动安装 Node.js >= 18: https://nodejs.org"
    return 1
  fi

  local node_major
  node_major=$(node -e "process.stdout.write(process.version.slice(1).split('.')[0])")

  if [ "$node_major" -lt 18 ]; then
    log_warn "Node.js 版本 $(node --version) < 18，跳过 fallback"
    return 1
  fi

  log_ok "Node.js $(node --version) 可用作 fallback"

  # 创建 wrapper 脚本
  cat > "$INSTALL_DIR/eket" << 'WRAPPER'
#!/bin/bash
# EKET Node.js wrapper
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EKET_ROOT="${EKET_ROOT:-$HOME/.eket/node}"

if [ -f "$EKET_ROOT/dist/index.js" ]; then
  node "$EKET_ROOT/dist/index.js" "$@"
else
  echo "Error: EKET Node.js 版本未安装"
  echo "请运行完整安装: bash scripts/setup.sh --level=2"
  exit 1
fi
WRAPPER
  chmod +x "$INSTALL_DIR/eket"
  log_ok "Node.js wrapper 已创建"
  return 0
}

# ─────────────────────────────────────────────
# 安装 Skills
# ─────────────────────────────────────────────
install_skills() {
  if [ "${EKET_SKIP_SKILLS:-}" = "1" ]; then
    log_warn "跳过 skills 安装 (EKET_SKIP_SKILLS=1)"
    return
  fi

  log_step "安装 EKET Skills..."

  # 创建目录
  mkdir -p "$(dirname "$SKILLS_DIR")"

  # 如果已存在，更新；否则克隆
  if [ -d "$SKILLS_DIR/.git" ]; then
    log_step "更新现有 skills..."
    (cd "$SKILLS_DIR" && git pull --quiet origin main 2>/dev/null) || true
  elif [ -d "$SKILLS_DIR" ]; then
    # 目录存在但不是 git 仓库，使用 rsync 更新
    log_step "从远程同步 skills..."
    local tmp_dir
    tmp_dir=$(mktemp -d)
    if git clone --depth 1 --filter=blob:none --sparse "$SKILLS_REPO" "$tmp_dir" 2>/dev/null; then
      (cd "$tmp_dir" && git sparse-checkout set .claude/skills/eket)
      rsync -a --delete "$tmp_dir/.claude/skills/eket/" "$SKILLS_DIR/"
      rm -rf "$tmp_dir"
    fi
  else
    # 全新安装 - 只克隆 skills 目录
    log_step "克隆 skills..."
    local tmp_dir
    tmp_dir=$(mktemp -d)
    if git clone --depth 1 --filter=blob:none --sparse "$SKILLS_REPO" "$tmp_dir" 2>/dev/null; then
      (cd "$tmp_dir" && git sparse-checkout set .claude/skills/eket)
      mv "$tmp_dir/.claude/skills/eket" "$SKILLS_DIR"
      rm -rf "$tmp_dir"
    else
      # fallback: 直接下载 tarball
      log_warn "Git sparse checkout 失败，尝试下载 tarball..."
      curl -fsSL "${REPO_URL}/archive/main.tar.gz" | tar -xz -C "$tmp_dir"
      if [ -d "$tmp_dir/eket-main/.claude/skills/eket" ]; then
        mv "$tmp_dir/eket-main/.claude/skills/eket" "$SKILLS_DIR"
      fi
      rm -rf "$tmp_dir"
    fi
  fi

  # 初始化 submodule (如果存在)
  if [ -f "$SKILLS_DIR/.gitmodules" ]; then
    log_step "初始化 skills submodule..."
    (cd "$SKILLS_DIR" && git submodule update --init --recursive 2>/dev/null) || true
  fi

  if [ -f "$SKILLS_DIR/SKILL.md" ]; then
    log_ok "Skills 已安装到 $SKILLS_DIR"
  else
    log_warn "Skills 安装可能不完整"
  fi
}

# ─────────────────────────────────────────────
# 配置 PATH
# ─────────────────────────────────────────────
setup_path() {
  if [[ ":$PATH:" == *":$INSTALL_DIR:"* ]]; then
    log_ok "PATH 已包含 $INSTALL_DIR"
    return
  fi

  log_step "配置 PATH..."

  local shell_rc=""
  case "$SHELL" in
    */zsh)  shell_rc="$HOME/.zshrc" ;;
    */bash) shell_rc="$HOME/.bashrc" ;;
    *)      shell_rc="" ;;
  esac

  if [ -n "$shell_rc" ] && [ -f "$shell_rc" ]; then
    if ! grep -q "$INSTALL_DIR" "$shell_rc" 2>/dev/null; then
      echo '' >> "$shell_rc"
      echo '# Added by EKET quick-setup' >> "$shell_rc"
      echo "export PATH=\"$INSTALL_DIR:\$PATH\"" >> "$shell_rc"
      log_ok "已添加到 $shell_rc"
    fi
  fi

  export PATH="$INSTALL_DIR:$PATH"
  log_ok "当前会话 PATH 已更新"
}

# ─────────────────────────────────────────────
# 验证安装
# ─────────────────────────────────────────────
verify_install() {
  log_step "验证安装..."

  local success=true

  # 检查 binary
  if [ -x "$INSTALL_DIR/eket" ]; then
    log_ok "Binary: $INSTALL_DIR/eket"
  else
    log_warn "Binary 未找到"
    success=false
  fi

  # 检查 skills
  if [ -f "$SKILLS_DIR/SKILL.md" ]; then
    log_ok "Skills: $SKILLS_DIR"
  else
    log_warn "Skills 未完整安装"
    success=false
  fi

  # 检查 Claude Code
  if [ -d "$HOME/.claude" ]; then
    log_ok "Claude Code 配置目录存在"
  else
    log_warn "Claude Code 配置目录不存在 (~/.claude)"
    log_warn "请先安装 Claude Code: https://claude.ai/code"
  fi

  if [ "$success" = true ]; then
    return 0
  else
    return 1
  fi
}

# ─────────────────────────────────────────────
# 打印使用说明
# ─────────────────────────────────────────────
print_usage() {
  echo ""
  echo -e "${GREEN}═══════════════════════════════════════════${NC}"
  echo -e "${GREEN}  ✓ EKET 安装完成！${NC}"
  echo -e "${GREEN}═══════════════════════════════════════════${NC}"
  echo ""
  echo -e "${BOLD}下一步：${NC}"
  echo ""
  echo "  1. 新开终端或运行: source ~/.zshrc (或 ~/.bashrc)"
  echo ""
  echo "  2. 在项目中初始化 EKET:"
  echo "     cd your-project"
  echo "     eket init"
  echo ""
  echo "  3. 或在 Claude Code 中使用:"
  echo "     /eket           # 召唤 EKET 团队"
  echo "     /eket-start     # 启动 Master/Slaver"
  echo ""
  echo -e "${BOLD}帮助命令：${NC}"
  echo "  eket --help        # CLI 帮助"
  echo "  eket doctor        # 环境诊断"
  echo ""
  echo -e "${CYAN}文档: https://github.com/godlockin/eket#readme${NC}"
  echo ""
}

# ─────────────────────────────────────────────
# 主流程
# ─────────────────────────────────────────────
main() {
  print_banner

  local start_time
  start_time=$(date +%s)

  check_deps

  # 尝试下载 binary，失败则使用 Node.js fallback
  if ! download_binary; then
    setup_node_fallback || true
  fi

  install_skills
  setup_path

  echo ""
  if verify_install; then
    local end_time elapsed
    end_time=$(date +%s)
    elapsed=$((end_time - start_time))
    echo ""
    echo -e "${GREEN}安装耗时: ${elapsed} 秒${NC}"
    print_usage
  else
    echo ""
    log_warn "安装未完全成功，请检查上述警告"
    echo ""
    echo "如需完整安装，请运行:"
    echo "  git clone https://github.com/godlockin/eket.git"
    echo "  cd eket && bash scripts/setup.sh"
  fi
}

main "$@"
