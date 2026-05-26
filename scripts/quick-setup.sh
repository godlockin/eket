#!/bin/bash
#
# EKET Quick Setup - 一键安装 & 项目初始化
#
# 用法:
#   # 全局安装（skills + commands）
#   curl -fsSL https://raw.githubusercontent.com/godlockin/eket/main/scripts/quick-setup.sh | bash
#
#   # 初始化当前项目（完整框架）
#   curl -fsSL https://raw.githubusercontent.com/godlockin/eket/main/scripts/quick-setup.sh | bash -s -- --init
#
#   # 本地运行
#   bash scripts/quick-setup.sh [--init]
#
# 模式:
#   (无参数)   全局安装: skills + commands → ~/.claude/
#   --init     项目初始化: 在当前目录创建完整 EKET 框架
#   --upgrade  升级已有安装
#
# 环境变量:
#   EKET_SKILLS_DIR     Skills 目录 (默认: ~/.claude/skills/eket)
#   EKET_COMMANDS_DIR   Commands 目录 (默认: ~/.claude/commands)
#   EKET_VERSION        指定版本 (默认: latest)
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
MAGENTA='\033[0;35m'
NC='\033[0m'
BOLD='\033[1m'

print_banner() {
  echo ""
  echo -e "${CYAN}╔═══════════════════════════════════════════════════════════════╗${NC}"
  echo -e "${CYAN}║${NC}                                                               ${CYAN}║${NC}"
  echo -e "${CYAN}║${NC}   ${BOLD}EKET Quick Setup${NC}                                          ${CYAN}║${NC}"
  echo -e "${CYAN}║${NC}   ${MAGENTA}Master-Slaver 协作框架 | 一键安装${NC}                        ${CYAN}║${NC}"
  echo -e "${CYAN}║${NC}                                                               ${CYAN}║${NC}"
  echo -e "${CYAN}╚═══════════════════════════════════════════════════════════════╝${NC}"
  echo ""
}

log_step() { echo -e "${BLUE}→${NC} $1"; }
log_ok()   { echo -e "${GREEN}✓${NC} $1"; }
log_warn() { echo -e "${YELLOW}⚠${NC} $1"; }
log_err()  { echo -e "${RED}✗${NC} $1"; }

# ─────────────────────────────────────────────
# 配置
# ─────────────────────────────────────────────
SKILLS_DIR="${EKET_SKILLS_DIR:-$HOME/.claude/skills/eket}"
COMMANDS_DIR="${EKET_COMMANDS_DIR:-$HOME/.claude/commands}"
HOOKS_DIR="$HOME/.claude/hooks"
VERSION="${EKET_VERSION:-latest}"
REPO_URL="https://github.com/godlockin/eket"
MODE="${1:-global}"  # global | --init | --upgrade

# 临时目录
TMP_DIR=""

cleanup() {
  if [ -n "$TMP_DIR" ] && [ -d "$TMP_DIR" ]; then
    rm -rf "$TMP_DIR"
  fi
}
trap cleanup EXIT

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
    fi
    exit 1
  fi

  log_ok "依赖检查通过"
}

# ─────────────────────────────────────────────
# 下载仓库（shallow clone）
# ─────────────────────────────────────────────
download_repo() {
  log_step "下载 EKET 仓库 (shallow clone)..."

  TMP_DIR=$(mktemp -d)

  if git clone --depth 1 "$REPO_URL.git" "$TMP_DIR/eket" 2>/dev/null; then
    log_ok "仓库下载完成"
    return 0
  else
    log_err "下载失败"
    return 1
  fi
}

# ─────────────────────────────────────────────
# 安装全局 Skills
# ─────────────────────────────────────────────
install_skills() {
  log_step "安装 Skills → $SKILLS_DIR"

  mkdir -p "$(dirname "$SKILLS_DIR")"

  # 复制 skills
  if [ -d "$TMP_DIR/eket/.claude/skills/eket" ]; then
    rm -rf "$SKILLS_DIR"
    cp -r "$TMP_DIR/eket/.claude/skills/eket" "$SKILLS_DIR"

    # 初始化 submodule（如果需要）
    if [ -f "$SKILLS_DIR/.gitmodules" ]; then
      log_step "初始化 experts submodule..."
      (cd "$TMP_DIR/eket" && git submodule update --init --recursive .claude/skills/eket 2>/dev/null) || true
      if [ -d "$TMP_DIR/eket/.claude/skills/eket/experts" ]; then
        cp -r "$TMP_DIR/eket/.claude/skills/eket/experts" "$SKILLS_DIR/"
      fi
    fi

    log_ok "Skills 安装完成 ($(ls "$SKILLS_DIR"/*.md 2>/dev/null | wc -l | tr -d ' ') 个文件)"
  else
    log_warn "Skills 目录不存在"
  fi
}

# ─────────────────────────────────────────────
# 安装全局 Commands（slash 命令）
# ─────────────────────────────────────────────
install_commands() {
  log_step "安装 Commands → $COMMANDS_DIR"

  mkdir -p "$COMMANDS_DIR"

  # 复制 commands
  if [ -d "$TMP_DIR/eket/template/.claude/commands" ]; then
    local count=0
    for cmd in "$TMP_DIR/eket/template/.claude/commands"/eket-*.sh; do
      if [ -f "$cmd" ]; then
        cp "$cmd" "$COMMANDS_DIR/"
        ((count++)) || true
      fi
    done

    # 复制通用库
    if [ -f "$TMP_DIR/eket/template/.claude/commands/_eket_common.sh" ]; then
      cp "$TMP_DIR/eket/template/.claude/commands/_eket_common.sh" "$COMMANDS_DIR/"
    fi

    log_ok "Commands 安装完成 ($count 个命令)"
  else
    log_warn "Commands 目录不存在"
  fi
}

# ─────────────────────────────────────────────
# 安装全局 Hooks
# ─────────────────────────────────────────────
install_hooks() {
  log_step "安装 Hooks → $HOOKS_DIR"

  mkdir -p "$HOOKS_DIR"

  # 复制 hooks
  if [ -d "$TMP_DIR/eket/template/hooks" ]; then
    local count=0
    for hook in "$TMP_DIR/eket/template/hooks"/*.js; do
      if [ -f "$hook" ]; then
        cp "$hook" "$HOOKS_DIR/"
        ((count++)) || true
      fi
    done
    log_ok "Hooks 安装完成 ($count 个钩子)"

    echo ""
    log_warn "Hooks 需要在 ~/.claude/settings.json 中配置才能生效"
    echo "  示例配置:"
    echo '  {'
    echo '    "hooks": {'
    echo '      "PostToolUse": ["node ~/.claude/hooks/context-monitor.js"],'
    echo '      "PreToolUse": ["node ~/.claude/hooks/read-guard.js"]'
    echo '    }'
    echo '  }'
  else
    log_warn "Hooks 目录不存在"
  fi
}

# ─────────────────────────────────────────────
# 初始化当前项目
# ─────────────────────────────────────────────
init_project() {
  log_step "初始化项目框架..."

  local project_dir="$PWD"

  # 检查是否已初始化
  if [ -f "$project_dir/.eket/IDENTITY.md" ]; then
    log_warn "项目已初始化，跳过"
    return 0
  fi

  # 创建目录结构
  log_step "创建目录结构..."
  mkdir -p "$project_dir/.claude/commands"
  mkdir -p "$project_dir/.eket/state"
  mkdir -p "$project_dir/.eket/sessions"
  mkdir -p "$project_dir/.eket/logs"
  mkdir -p "$project_dir/confluence/memory/lessons"
  mkdir -p "$project_dir/confluence/architecture"
  mkdir -p "$project_dir/jira/tickets"
  mkdir -p "$project_dir/jira/epics"

  # 复制模板文件
  log_step "复制模板文件..."

  # CLAUDE.md
  if [ -f "$TMP_DIR/eket/template/CLAUDE.md" ]; then
    cp "$TMP_DIR/eket/template/CLAUDE.md" "$project_dir/"
    log_ok "CLAUDE.md"
  fi

  # AGENTS.md
  if [ -f "$TMP_DIR/eket/template/AGENTS.md" ]; then
    cp "$TMP_DIR/eket/template/AGENTS.md" "$project_dir/"
    log_ok "AGENTS.md"
  fi

  # .claude/settings.json
  if [ -f "$TMP_DIR/eket/template/.claude/settings.json" ]; then
    cp "$TMP_DIR/eket/template/.claude/settings.json" "$project_dir/.claude/"
    log_ok ".claude/settings.json"
  fi

  # 项目级 commands（链接到全局或复制）
  if [ -d "$COMMANDS_DIR" ]; then
    for cmd in "$COMMANDS_DIR"/eket-*.sh; do
      if [ -f "$cmd" ]; then
        ln -sf "$cmd" "$project_dir/.claude/commands/" 2>/dev/null || cp "$cmd" "$project_dir/.claude/commands/"
      fi
    done
    log_ok "Commands 链接完成"
  fi

  # IDENTITY.md
  cat > "$project_dir/.eket/IDENTITY.md" << 'EOF'
# EKET Identity

**角色**: 未设置
**初始化时间**: $(date -Iseconds)

## 角色选择

启动时请选择角色：

- **Master**: 需求分析、任务拆解、PR 审核、团队协调
- **Slaver**: 任务执行、代码实现、测试编写、PR 提交

运行 `/eket-start` 选择角色并开始工作。
EOF
  # 替换日期
  sed -i '' "s/\$(date -Iseconds)/$(date -Iseconds)/" "$project_dir/.eket/IDENTITY.md" 2>/dev/null || true

  log_ok "IDENTITY.md"

  # confluence 模板
  if [ -d "$TMP_DIR/eket/template/confluence" ]; then
    cp -r "$TMP_DIR/eket/template/confluence"/* "$project_dir/confluence/" 2>/dev/null || true
    log_ok "Confluence 模板"
  fi

  # jira 模板
  if [ -d "$TMP_DIR/eket/template/jira" ]; then
    cp -r "$TMP_DIR/eket/template/jira"/* "$project_dir/jira/" 2>/dev/null || true
    log_ok "Jira 模板"
  fi

  # .gitignore 追加
  if [ -f "$project_dir/.gitignore" ]; then
    if ! grep -q ".eket/state" "$project_dir/.gitignore" 2>/dev/null; then
      echo "" >> "$project_dir/.gitignore"
      echo "# EKET" >> "$project_dir/.gitignore"
      echo ".eket/state/" >> "$project_dir/.gitignore"
      echo ".eket/logs/" >> "$project_dir/.gitignore"
      echo ".eket/sessions/" >> "$project_dir/.gitignore"
      log_ok ".gitignore 已更新"
    fi
  fi

  log_ok "项目初始化完成"
}

# ─────────────────────────────────────────────
# 打印已安装的命令
# ─────────────────────────────────────────────
print_commands() {
  echo ""
  echo -e "${BOLD}已安装的 Slash 命令:${NC}"
  echo ""

  local cmds=(
    "/eket-start        启动 Master/Slaver 角色"
    "/eket-claim        领取任务"
    "/eket-status       查看当前状态"
    "/eket-save         保存会话状态"
    "/eket-resume       恢复会话"
    "/eket-office-hours 需求分析六问"
    "/eket-submit-pr    提交 PR"
    "/eket-review-pr    审核 PR"
    "/eket-merge        合并 PR"
    "/eket-help         查看所有命令"
  )

  for cmd in "${cmds[@]}"; do
    echo -e "  ${GREEN}${cmd%% *}${NC}${cmd#* }"
  done

  echo ""
  echo -e "  运行 ${CYAN}/eket-help${NC} 查看完整命令列表"
}

# ─────────────────────────────────────────────
# 验证安装
# ─────────────────────────────────────────────
verify_install() {
  log_step "验证安装..."

  local success=true

  # 检查 skills
  if [ -f "$SKILLS_DIR/SKILL.md" ]; then
    log_ok "Skills: $SKILLS_DIR"
  else
    log_warn "Skills 未完整安装"
    success=false
  fi

  # 检查 commands
  local cmd_count
  cmd_count=$(ls "$COMMANDS_DIR"/eket-*.sh 2>/dev/null | wc -l | tr -d ' ')
  if [ "$cmd_count" -gt 0 ]; then
    log_ok "Commands: $COMMANDS_DIR ($cmd_count 个)"
  else
    log_warn "Commands 未安装"
    success=false
  fi

  # 检查 hooks
  local hook_count
  hook_count=$(ls "$HOOKS_DIR"/*.js 2>/dev/null | wc -l | tr -d ' ')
  if [ "$hook_count" -gt 0 ]; then
    log_ok "Hooks: $HOOKS_DIR ($hook_count 个)"
  else
    log_warn "Hooks 未安装"
  fi

  # 检查 Claude Code
  if [ -d "$HOME/.claude" ]; then
    log_ok "Claude目录存在"
  else
    log_warn "Claude Code 未安装"
    log_warn "请先安装: https://claude.ai/code"
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
print_usage_global() {
  echo ""
  echo -e "${GREEN}═════════════════════════════════════════════════════════════${NC}"
  echo -e "${GREEN}  ✓ EKET 全局安装完成！${NC}"
  echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"

  print_commands

  echo -e "${BOLD}下一步:${NC}"
  echo ""
  echo "  1. 在项目中初始化 EKET 框架:"
  echo ""
  echo -e "     ${CYAN}cd your-project${NC}"
  echo -e "     ${CYAN}curl -fsSL $REPO_URL/raw/main/scripts/quick-setup.sh | bash -s -- --init${NC}"
  echo ""
  echo "  2. 或在 Claude Code 中直接使用:"
  echo ""
  echo -e "     ${CYAN}/eket-start${NC}    # 启动角色选择"
  echo -e "     ${CYAN}/eket-help${NC}     # 查看所有命令"
  echo ""
  echo -e "${CYAN}文档: $REPO_URL#readme${NC}"
  echo ""
}

print_usage_init() {
  echo ""
  echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
  echo -e "${GREEN}  ✓ EKET 项目初始化完成！${NC}"
  echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
  echo ""
  echo -e "${BOLD}已创建:${NC}"
  echo ""
  echo "  CLAUDE.md              # Claude Code 项目指令"
  echo "  AGENTS.md              # 多 Agent 协作规范"
  echo "  .claude/               # Claude Code 配置"
  echo "  .eket/                 # EKET 运行时状态"
  echo "  confluence/            # 知识库"
  echo "  jira/                  # 任务管理"
  echo ""

  print_commands

  echo -e "${BOLD}开始使用:${NC}"
  echo ""
  echo "  在 Claude Code 中运行:"
  echo ""
  echo -e "     ${CYAN}/eket-start${NC}    # 选择 Master 或 Slaver 角色"
  echo ""
  echo -e "${CYAN}文档: $REPO_URL#readme${NC}"
  echo ""
}

# ─────────────────────────────────────────────
# 主流程
# ─────────────────────────────────────────────
main() {
  print_banner

  local start_time
  start_time=$(date +%s)

  # 解析参数
  case "$MODE" in
    --init)
      echo -e "${MAGENTA}模式: 项目初始化${NC}"
      echo ""
      ;;
    --upgrade)
      echo -e "${MAGENTA}模式: 升级${NC}"
      echo ""
      ;;
    *)
      echo -e "${MAGENTA}模式: 全局安装${NC}"
      echo ""
      MODE="global"
      ;;
  esac

  check_deps
  download_repo

  # 全局安装（始终执行）
  install_skills
  install_commands
  install_hooks

  # 项目初始化（仅 --init 模式）
  if [ "$MODE" = "--init" ]; then
    echo ""
    init_project
  fi

  echo ""
  if verify_install; then
    local end_time elapsed
    end_time=$(date +%s)
    elapsed=$((end_time - start_time))
    echo ""
    echo -e "${GREEN}安装耗时: ${elapsed} 秒${NC}"

    if [ "$MODE" = "--init" ]; then
      print_usage_init
    else
      print_usage_global
    fi
  else
    echo ""
    log_warn "安装未完全成功，请检查上述警告"
    echo ""
    echo "如需帮助，请访问: $REPO_URL/issues"
  fi
}

main "$@"
