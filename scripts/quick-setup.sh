#!/bin/bash
#
# EKET Quick Setup - 分级安装 & 项目初始化
#
# ═══════════════════════════════════════════════════════════════════════════
# 安装级别:
#
#   Level 1 - 最简安装（仅 Claude Code 增强）
#     curl -fsSL https://eket.dev/install | bash
#     安装: skills + commands + hooks → ~/.claude/
#     适合: 只想在 Claude Code 中使用 EKET 命令
#
#   Level 2 - 项目初始化
#     curl -fsSL https://eket.dev/install | bash -s -- --init
#     额外: 在当前目录创建 CLAUDE.md, confluence/, jira/ 等
#     适合: 想在某个项目中使用完整 EKET 框架
#
#   Level 3 - 完整安装（含 CLI）
#     curl -fsSL https://eket.dev/install | bash -s -- --full
#     额外: 下载预编译的 eket CLI 到 ~/.local/bin/
#     适合: 需要命令行工具、HTTP API、Dashboard
#
# ═══════════════════════════════════════════════════════════════════════════
#
# 环境变量:
#   EKET_INSTALL_DIR    CLI 安装目录 (默认: ~/.local/bin)
#   EKET_SKILLS_DIR     Skills 目录 (默认: ~/.claude/skills/eket)
#   EKET_COMMANDS_DIR   Commands 目录 (默认: ~/.claude/commands)
#   EKET_VERSION        指定版本 (默认: latest)
#

set -euo pipefail

# ─────────────────────────────────────────────
# 颜色
# ─────────────────────────────────────────────
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m'
BOLD='\033[1m'
DIM='\033[2m'

print_banner() {
  echo ""
  echo -e "${CYAN}╔═══════════════════════════════════════════════════════════════╗${NC}"
  echo -e "${CYAN}║${NC}                                                               ${CYAN}║${NC}"
  echo -e "${CYAN}║${NC}   ${BOLD}EKET Quick Setup${NC}                                          ${CYAN}║${NC}"
  echo -e "${CYAN}║${NC}   ${DIM}Human-AI Special Forces Team Coordination${NC}                 ${CYAN}║${NC}"
  echo -e "${CYAN}║${NC}                                                               ${CYAN}║${NC}"
  echo -e "${CYAN}╚═══════════════════════════════════════════════════════════════╝${NC}"
  echo ""
}

log_step() { echo -e "${BLUE}→${NC} $1"; }
log_ok()   { echo -e "${GREEN}✓${NC} $1"; }
log_warn() { echo -e "${YELLOW}⚠${NC} $1"; }
log_err()  { echo -e "${RED}✗${NC} $1"; }
log_dim()  { echo -e "${DIM}  $1${NC}"; }

# ─────────────────────────────────────────────
# 配置
# ─────────────────────────────────────────────
INSTALL_DIR="${EKET_INSTALL_DIR:-$HOME/.local/bin}"
SKILLS_DIR="${EKET_SKILLS_DIR:-$HOME/.claude/skills/eket}"
COMMANDS_DIR="${EKET_COMMANDS_DIR:-$HOME/.claude/commands}"
HOOKS_DIR="$HOME/.claude/hooks"
VERSION="${EKET_VERSION:-latest}"
REPO_URL="https://github.com/godlockin/eket"
REPO_RAW="https://raw.githubusercontent.com/godlockin/eket/main"

# 解析安装级别
LEVEL=1
INIT_PROJECT=false
for arg in "$@"; do
  case "$arg" in
    --init)     LEVEL=2; INIT_PROJECT=true ;;
    --full)     LEVEL=3 ;;
    --upgrade)  LEVEL=1 ;;
    --help|-h)  show_help; exit 0 ;;
  esac
done

# 临时目录
TMP_DIR=""
cleanup() {
  [ -n "$TMP_DIR" ] && [ -d "$TMP_DIR" ] && rm -rf "$TMP_DIR"
}
trap cleanup EXIT

# ─────────────────────────────────────────────
# 帮助
# ─────────────────────────────────────────────
show_help() {
  cat << 'EOF'
EKET Quick Setup - 分级安装

用法:
  curl -fsSL https://eket.dev/install | bash [-- OPTIONS]
  bash scripts/quick-setup.sh [OPTIONS]

安装级别:
  (默认)      Level 1: skills + commands + hooks → ~/.claude/
  --init      Level 2: + 在当前目录初始化项目框架
  --full      Level 3: + 下载 eket CLI 到 ~/.local/bin/

选项:
  --upgrade   升级已有安装（等同于默认）
  --help      显示此帮助

环境变量:
  EKET_INSTALL_DIR    CLI 安装目录 (默认: ~/.local/bin)
  EKET_SKILLS_DIR     Skills 目录 (默认: ~/.claude/skills/eket)
  EKET_VERSION        指定版本 (默认: latest)

示例:
  # 最简安装
  curl -fsSL https://eket.dev/install | bash

  # 初始化项目
  cd my-project && curl -fsSL https://eket.dev/install | bash -s -- --init

  # 完整安装（含 CLI）
  curl -fsSL https://eket.dev/install | bash -s -- --full
EOF
}

# ─────────────────────────────────────────────
# 平台检测
# ─────────────────────────────────────────────
detect_platform() {
  local os arch
  case "$(uname -s)" in
    Linux*)  os="linux" ;;
    Darwin*) os="darwin" ;;
    *)       os="unknown" ;;
  esac
  case "$(uname -m)" in
    x86_64|amd64)  arch="amd64" ;;
    arm64|aarch64) arch="arm64" ;;
    *)             arch="unknown" ;;
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
    command -v "$cmd" &>/dev/null || missing+=("$cmd")
  done

  if [ ${#missing[@]} -gt 0 ]; then
    log_err "缺少: ${missing[*]}"
    if [[ "$(uname -s)" == "Darwin"* ]]; then
      echo "  brew install ${missing[*]}"
    else
      echo "  sudo apt install ${missing[*]}"
    fi
    exit 1
  fi
  log_ok "依赖检查通过"
}

# ─────────────────────────────────────────────
# 下载仓库（shallow clone，排除大目录）
# ─────────────────────────────────────────────
download_repo() {
  log_step "下载 EKET (shallow clone, ~50MB)..."
  TMP_DIR=$(mktemp -d)

  # 使用 sparse checkout 只下载必要文件
  if git clone --depth 1 --filter=blob:none --sparse "$REPO_URL.git" "$TMP_DIR/eket" 2>/dev/null; then
    cd "$TMP_DIR/eket"
    git sparse-checkout set \
      .claude/skills/eket \
      template/.claude \
      template/hooks \
      template/CLAUDE-TEMPLATE.md \
      template/AGENTS.md \
      template/confluence \
      template/jira \
      template/docs \
      scripts 2>/dev/null || true
    # 初始化 submodule
    git submodule update --init --recursive .claude/skills/eket 2>/dev/null || true
    cd - >/dev/null
    log_ok "下载完成"
  else
    log_err "下载失败，尝试完整 clone..."
    git clone --depth 1 "$REPO_URL.git" "$TMP_DIR/eket" 2>/dev/null || {
      log_err "无法下载仓库"
      exit 1
    }
  fi
}

# ─────────────────────────────────────────────
# Level 1: 安装 Skills
# ─────────────────────────────────────────────
install_skills() {
  log_step "安装 Skills → $SKILLS_DIR"
  mkdir -p "$(dirname "$SKILLS_DIR")"

  if [ -d "$TMP_DIR/eket/.claude/skills/eket" ]; then
    rm -rf "$SKILLS_DIR"
    cp -r "$TMP_DIR/eket/.claude/skills/eket" "$SKILLS_DIR"

    # experts submodule
    if [ -d "$TMP_DIR/eket/.claude/skills/eket/experts" ]; then
      cp -r "$TMP_DIR/eket/.claude/skills/eket/experts" "$SKILLS_DIR/" 2>/dev/null || true
    fi

    local count
    count=$(find "$SKILLS_DIR" -name "*.md" -type f 2>/dev/null | wc -l | tr -d ' ')
    log_ok "Skills ($count 个文件)"
  else
    log_warn "Skills 目录未找到"
  fi
}

# ─────────────────────────────────────────────
# Level 1: 安装 Commands
# ─────────────────────────────────────────────
install_commands() {
  log_step "安装 Commands → $COMMANDS_DIR"
  mkdir -p "$COMMANDS_DIR"

  local src="$TMP_DIR/eket/template/.claude/commands"
  if [ -d "$src" ]; then
    local count=0
    for f in "$src"/eket-*.sh "$src"/_eket_common.sh "$src"/*.md; do
      [ -f "$f" ] && cp "$f" "$COMMANDS_DIR/" && ((count++)) || true
    done
    log_ok "Commands ($count 个)"
  else
    log_warn "Commands 目录未找到"
  fi
}

# ─────────────────────────────────────────────
# Level 1: 安装 Hooks
# ─────────────────────────────────────────────
install_hooks() {
  log_step "安装 Hooks → $HOOKS_DIR"
  mkdir -p "$HOOKS_DIR"

  local src="$TMP_DIR/eket/template/hooks"
  if [ -d "$src" ]; then
    local count=0
    for f in "$src"/*.js; do
      [ -f "$f" ] && cp "$f" "$HOOKS_DIR/" && ((count++)) || true
    done
    log_ok "Hooks ($count 个)"
    log_dim "提示: 需在 ~/.claude/settings.json 中配置才能生效"
  else
    log_warn "Hooks 目录未找到"
  fi
}

# ─────────────────────────────────────────────
# Level 2: 初始化项目
# ─────────────────────────────────────────────
init_project() {
  local dir="$PWD"
  log_step "初始化项目 → $dir"

  # 检查是否已初始化
  if [ -f "$dir/CLAUDE.md" ] && [ -d "$dir/.eket" ]; then
    log_warn "项目已初始化，跳过 (删除 .eket/ 可重新初始化)"
    return 0
  fi

  # 创建目录结构
  mkdir -p "$dir/.claude/commands"
  mkdir -p "$dir/.eket/state"
  mkdir -p "$dir/.eket/sessions"
  mkdir -p "$dir/.eket/logs"
  mkdir -p "$dir/confluence/memory/lessons"
  mkdir -p "$dir/confluence/architecture"
  mkdir -p "$dir/jira/tickets"
  mkdir -p "$dir/jira/epics"

  # 复制模板
  local tpl="$TMP_DIR/eket/template"

  [ -f "$tpl/CLAUDE.md" ] && cp "$tpl/CLAUDE.md" "$dir/" && log_ok "CLAUDE.md"
  [ -f "$tpl/AGENTS.md" ] && cp "$tpl/AGENTS.md" "$dir/" && log_ok "AGENTS.md"
  [ -f "$tpl/.claude/settings.json" ] && cp "$tpl/.claude/settings.json" "$dir/.claude/" && log_ok ".claude/settings.json"

  # 链接全局 commands
  for cmd in "$COMMANDS_DIR"/eket-*.sh; do
    [ -f "$cmd" ] && ln -sf "$cmd" "$dir/.claude/commands/" 2>/dev/null || true
  done

  # confluence/jira 模板
  [ -d "$tpl/confluence" ] && cp -r "$tpl/confluence"/* "$dir/confluence/" 2>/dev/null && log_ok "confluence/"
  [ -d "$tpl/jira" ] && cp -r "$tpl/jira"/* "$dir/jira/" 2>/dev/null && log_ok "jira/"

  # IDENTITY.md
  cat > "$dir/.eket/IDENTITY.md" << EOF
# EKET Identity

**角色**: 未设置
**初始化时间**: $(date -Iseconds)

运行 \`/eket-start\` 选择 Master 或 Slaver 角色。
EOF
  log_ok ".eket/IDENTITY.md"

  # .gitignore
  if [ -f "$dir/.gitignore" ]; then
    grep -q ".eket/state" "$dir/.gitignore" 2>/dev/null || {
      echo -e "\n# EKET\n.eket/state/\n.eket/logs/\n.eket/sessions/" >> "$dir/.gitignore"
      log_ok ".gitignore 已更新"
    }
  else
    echo -e "# EKET\n.eket/state/\n.eket/logs/\n.eket/sessions/" > "$dir/.gitignore"
    log_ok ".gitignore 已创建"
  fi

  log_ok "项目初始化完成"
}

# ─────────────────────────────────────────────
# Level 3: 安装 CLI
# ─────────────────────────────────────────────
install_cli() {
  log_step "下载 EKET CLI → $INSTALL_DIR"

  local platform
  platform=$(detect_platform)

  if [[ "$platform" == *"unknown"* ]]; then
    log_warn "不支持的平台: $platform，跳过 CLI 安装"
    return 1
  fi

  mkdir -p "$INSTALL_DIR"

  # 尝试从 releases 下载
  local artifact="eket-${platform}"
  local url="$REPO_URL/releases/latest/download/$artifact"
  local tmp_bin
  tmp_bin=$(mktemp)

  if curl -fsSL "$url" -o "$tmp_bin" 2>/dev/null; then
    chmod +x "$tmp_bin"
    mv "$tmp_bin" "$INSTALL_DIR/eket"
    log_ok "CLI 已安装 ($INSTALL_DIR/eket)"

    # 配置 PATH
    if [[ ":$PATH:" != *":$INSTALL_DIR:"* ]]; then
      local rc=""
      case "$SHELL" in
        */zsh)  rc="$HOME/.zshrc" ;;
        */bash) rc="$HOME/.bashrc" ;;
      esac
      if [ -n "$rc" ] && [ -f "$rc" ]; then
        grep -q "$INSTALL_DIR" "$rc" 2>/dev/null || {
          echo -e "\n# EKET CLI\nexport PATH=\"$INSTALL_DIR:\$PATH\"" >> "$rc"
          log_dim "已添加到 $rc，重启终端生效"
        }
      fi
    fi
    return 0
  else
    rm -f "$tmp_bin"
    log_warn "预编译 CLI 下载失败 (可能尚无 release)"
    log_dim "可以手动编译: cd eket/rust && cargo build --release"
    return 1
  fi
}

# ─────────────────────────────────────────────
# 验证安装
# ─────────────────────────────────────────────
verify_install() {
  echo ""
  log_step "验证安装..."

  local ok=true

  # Skills
  if [ -f "$SKILLS_DIR/SKILL.md" ]; then
    log_ok "Skills: $SKILLS_DIR"
  else
    log_warn "Skills 未完整"
    ok=false
  fi

  # Commands
  local cmd_count
  cmd_count=$(ls "$COMMANDS_DIR"/eket-*.sh 2>/dev/null | wc -l | tr -d ' ')
  if [ "$cmd_count" -gt 0 ]; then
    log_ok "Commands: $cmd_count 个"
  else
    log_warn "Commands 未安装"
    ok=false
  fi

  # Hooks
  local hook_count
  hook_count=$(ls "$HOOKS_DIR"/*.js 2>/dev/null | wc -l | tr -d ' ')
  [ "$hook_count" -gt 0 ] && log_ok "Hooks: $hook_count 个"

  # CLI (Level 3)
  if [ "$LEVEL" -ge 3 ]; then
    if [ -x "$INSTALL_DIR/eket" ]; then
      log_ok "CLI: $INSTALL_DIR/eket"
    else
      log_warn "CLI 未安装"
    fi
  fi

  # Project (Level 2)
  if [ "$INIT_PROJECT" = true ]; then
    if [ -f "$PWD/CLAUDE.md" ] && [ -d "$PWD/.eket" ]; then
      log_ok "项目: $PWD"
    else
      log_warn "项目初始化不完整"
      ok=false
    fi
  fi

  $ok
}

# ─────────────────────────────────────────────
# 打印结果
# ─────────────────────────────────────────────
print_success() {
  echo ""
  echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
  echo -e "${GREEN}  ✓ EKET 安装完成！ (Level $LEVEL)${NC}"
  echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
  echo ""

  echo -e "${BOLD}已安装组件:${NC}"
  echo ""
  echo "  Skills     → $SKILLS_DIR"
  echo "  Commands   → $COMMANDS_DIR"
  echo "  Hooks      → $HOOKS_DIR"
  [ "$LEVEL" -ge 3 ] && [ -x "$INSTALL_DIR/eket" ] && echo "  CLI        → $INSTALL_DIR/eket"
  [ "$INIT_PROJECT" = true ] && echo "  项目框架   → $PWD"
  echo ""

  echo -e "${BOLD}常用命令 (在 Claude Code 中):${NC}"
  echo ""
  echo -e "  ${GREEN}/eket-start${NC}        启动 Master/Slaver"
  echo -e "  ${GREEN}/eket-claim${NC}        领取任务"
  echo -e "  ${GREEN}/eket-status${NC}       查看状态"
  echo -e "  ${GREEN}/eket-save${NC}         保存会话"
  echo -e "  ${GREEN}/eket-help${NC}         所有命令"
  echo ""

  if [ "$LEVEL" -lt 2 ]; then
    echo -e "${BOLD}下一步:${NC}"
    echo ""
    echo "  初始化项目:"
    echo -e "    ${CYAN}cd your-project${NC}"
    echo -e "    ${CYAN}curl -fsSL $REPO_RAW/scripts/quick-setup.sh | bash -s -- --init${NC}"
    echo ""
  fi

  if [ "$LEVEL" -lt 3 ]; then
    echo -e "${DIM}完整安装 (含 CLI): bash -s -- --full${NC}"
  fi

  echo -e "${CYAN}文档: $REPO_URL#readme${NC}"
  echo ""
}

# ─────────────────────────────────────────────
# 主流程
# ─────────────────────────────────────────────
main() {
  print_banner

  local level_name
  case "$LEVEL" in
    1) level_name="最简安装 (Skills + Commands + Hooks)" ;;
    2) level_name="项目初始化" ;;
    3) level_name="完整安装 (含 CLI)" ;;
  esac
  echo -e "${MAGENTA}安装级别: Level $LEVEL - $level_name${NC}"
  echo ""

  local start_time
  start_time=$(date +%s)

  check_deps
  download_repo

  # Level 1: 基础组件
  install_skills
  install_commands
  install_hooks

  # Level 2: 项目初始化
  if [ "$INIT_PROJECT" = true ]; then
    echo ""
    init_project
  fi

  # Level 3: CLI
  if [ "$LEVEL" -ge 3 ]; then
    echo ""
    install_cli || true
  fi

  if verify_install; then
    local elapsed
    elapsed=$(($(date +%s) - start_time))
    echo ""
    echo -e "${GREEN}耗时: ${elapsed} 秒${NC}"
    print_success
  else
    echo ""
    log_warn "安装未完全成功，请检查上述警告"
    echo ""
    echo "帮助: $REPO_URL/issues"
    exit 1
  fi
}

main "$@"
