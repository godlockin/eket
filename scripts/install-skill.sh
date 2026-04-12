#!/bin/bash
#
# EKET Skill 安装脚本 v1.0.0
# 用途：将 .claude/skills/eket/ 安装到 ~/.claude/skills/eket/
#       让团队成员在任意项目中使用 /eket skill
#
# 用法：
#   ./scripts/install-skill.sh           # 安装（已存在时询问是否覆盖）
#   ./scripts/install-skill.sh --update  # 强制更新（覆盖已有版本）
#   ./scripts/install-skill.sh --remove  # 卸载
#   ./scripts/install-skill.sh --status  # 查看安装状态
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SKILL_SRC="$PROJECT_ROOT/.claude/skills/eket"
SKILL_DEST="$HOME/.claude/skills/eket"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

# ─────────────────────────────────────────────
# 安装
# ─────────────────────────────────────────────
do_install() {
  local force="${1:-false}"

  # 检查源文件存在
  if [ ! -f "$SKILL_SRC/SKILL.md" ]; then
    echo -e "${RED}✗ 源文件不存在：$SKILL_SRC/SKILL.md${NC}"
    echo "  请确认在 eket 项目根目录下运行此脚本"
    exit 1
  fi

  # 目标已存在时处理
  if [ -d "$SKILL_DEST" ]; then
    if [ "$force" = "true" ]; then
      echo "  → 强制更新，删除旧版本..."
      rm -rf "$SKILL_DEST"
    else
      echo -e "${YELLOW}  ⚠ ~/.claude/skills/eket/ 已存在${NC}"
      read -rp "  覆盖安装？[y/N] " ans
      if [[ "$ans" =~ ^[Yy]$ ]]; then
        rm -rf "$SKILL_DEST"
      else
        echo "  取消安装"
        exit 0
      fi
    fi
  fi

  # 创建目标目录
  mkdir -p "$HOME/.claude/skills"

  # 复制 skill 文件
  cp -r "$SKILL_SRC" "$SKILL_DEST"
  echo "  ✓ 已复制到 $SKILL_DEST"

  # 移除 .gitkeep（不需要）
  rm -f "$SKILL_DEST/references/.gitkeep"
}

# ─────────────────────────────────────────────
# 卸载
# ─────────────────────────────────────────────
do_remove() {
  if [ ! -d "$SKILL_DEST" ]; then
    echo "  ~/.claude/skills/eket/ 不存在，无需卸载"
    exit 0
  fi
  read -rp "  确认删除 ~/.claude/skills/eket/？[y/N] " ans
  if [[ "$ans" =~ ^[Yy]$ ]]; then
    rm -rf "$SKILL_DEST"
    echo -e "${GREEN}  ✓ 已卸载${NC}"
  else
    echo "  取消"
  fi
}

# ─────────────────────────────────────────────
# 状态
# ─────────────────────────────────────────────
do_status() {
  echo -e "${BLUE}EKET Skill 安装状态${NC}"
  echo ""
  if [ -d "$SKILL_DEST" ]; then
    echo -e "  状态：${GREEN}已安装${NC}"
    echo "  路径：$SKILL_DEST"
    echo "  文件："
    find "$SKILL_DEST" -type f | sort | while read -r f; do
      local rel="${f#$SKILL_DEST/}"
      local size
      size=$(wc -l < "$f" 2>/dev/null || echo "?")
      printf "    %-40s %s 行\n" "$rel" "$size"
    done
    echo ""
    # 检查是否与源版本一致
    if diff -rq "$SKILL_SRC" "$SKILL_DEST" --exclude=".gitkeep" >/dev/null 2>&1; then
      echo -e "  版本：${GREEN}与项目源文件一致${NC}"
    else
      echo -e "  版本：${YELLOW}与项目源文件不一致，建议运行 --update${NC}"
    fi
  else
    echo -e "  状态：${YELLOW}未安装${NC}"
    echo "  运行 ./scripts/install-skill.sh 安装"
  fi
}

# ─────────────────────────────────────────────
# 主流程
# ─────────────────────────────────────────────
main() {
  local mode="install"

  for arg in "$@"; do
    case "$arg" in
      --update|-u) mode="update" ;;
      --remove|-r) mode="remove" ;;
      --status|-s) mode="status" ;;
      --help|-h)
        head -14 "$0" | grep "^#" | sed 's/^# \?//'
        exit 0
        ;;
    esac
  done

  echo -e "${BLUE}═══════════════════════════════════${NC}"
  echo -e "${BLUE}  EKET Skill Installer v1.0.0${NC}"
  echo -e "${BLUE}═══════════════════════════════════${NC}\n"

  case "$mode" in
    install) do_install false ;;
    update)  do_install true  ;;
    remove)  do_remove        ;;
    status)  do_status; exit 0 ;;
  esac

  if [ "$mode" != "remove" ]; then
    echo ""
    echo -e "${GREEN}✓ EKET skill 已安装到 ~/.claude/skills/eket/${NC}"
    echo ""
    echo "现在可以在任意项目中使用："
    echo "  /eket            # 启动 EKET skill"
    echo "  system:doctor    # 系统诊断"
    echo ""
    echo "更新 skill："
    echo "  ./scripts/install-skill.sh --update"
  fi
}

main "$@"
