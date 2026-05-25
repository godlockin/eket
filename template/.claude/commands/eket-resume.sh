#!/bin/bash
#
# /eket-resume - 恢复之前保存的会话状态
#
# 用法:
#   /eket-resume                  # 恢复最近的会话
#   /eket-resume <session-file>   # 恢复指定会话
#   /eket-resume --list           # 列出所有保存的会话
#
# 功能:
#   - 加载之前保存的会话上下文
#   - 显示未完成的任务
#   - 显示上次的工作状态
#   - 提供继续工作的建议
#

set -euo pipefail

# 颜色
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
RED='\033[0;31m'
NC='\033[0m'
BOLD='\033[1m'

# 配置
SESSION_DIR=".eket/sessions"
ARG="${1:-}"

# ─────────────────────────────────────────────
# 帮助
# ─────────────────────────────────────────────
show_help() {
  echo "用法: /eket-resume [选项]"
  echo ""
  echo "选项:"
  echo "  (无参数)        恢复最近的会话"
  echo "  <file>          恢复指定的会话文件"
  echo "  --list, -l      列出所有保存的会话"
  echo "  --help, -h      显示帮助"
  echo ""
  echo "示例:"
  echo "  /eket-resume"
  echo "  /eket-resume .eket/sessions/20260519-143000.md"
  echo "  /eket-resume --list"
}

# ─────────────────────────────────────────────
# 列出会话
# ─────────────────────────────────────────────
list_sessions() {
  echo -e "${BLUE}═══════════════════════════════════════════${NC}"
  echo -e "${BLUE}  已保存的会话${NC}"
  echo -e "${BLUE}═══════════════════════════════════════════${NC}"
  echo ""

  if [ ! -d "$SESSION_DIR" ] || [ -z "$(ls -A "$SESSION_DIR" 2>/dev/null)" ]; then
    echo -e "${YELLOW}暂无保存的会话${NC}"
    echo ""
    echo "运行 /eket-save 保存当前会话"
    return
  fi

  echo -e "${CYAN}最近的会话:${NC}"
  echo ""

  # 列出会话文件，最新的在前
  ls -1t "$SESSION_DIR"/*.md 2>/dev/null | head -10 | while read -r file; do
    local basename
    basename=$(basename "$file")
    local date_part="${basename:0:15}"  # YYYYMMDD-HHMMSS
    local name_part="${basename:16}"
    name_part="${name_part%.md}"

    # 提取会话摘要（第一行备注或检查点名称）
    local checkpoint
    checkpoint=$(grep "检查点名称" "$file" 2>/dev/null | head -1 | sed 's/.*: //' || echo "")

    echo -e "  ${GREEN}→${NC} $basename"
    if [ -n "$checkpoint" ] && [ "$checkpoint" != "自动保存" ]; then
      echo "    名称: $checkpoint"
    fi
    # 显示文件大小和行数
    local lines
    lines=$(wc -l < "$file" 2>/dev/null || echo "?")
    echo "    行数: $lines"
    echo ""
  done

  echo -e "${CYAN}恢复命令:${NC}"
  echo "  /eket-resume <文件名>"
}

# ─────────────────────────────────────────────
# 恢复会话
# ─────────────────────────────────────────────
resume_session() {
  local session_file="$1"

  if [ ! -f "$session_file" ]; then
    echo -e "${RED}✗ 会话文件不存在: $session_file${NC}"
    return 1
  fi

  echo -e "${BLUE}═══════════════════════════════════════════${NC}"
  echo -e "${BLUE}  EKET 会话恢复${NC}"
  echo -e "${BLUE}═══════════════════════════════════════════${NC}"
  echo ""

  echo -e "${CYAN}加载会话: $(basename "$session_file")${NC}"
  echo ""

  # 显示会话内容
  echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  cat "$session_file"
  echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo ""

  # 提取关键信息并给出建议
  echo -e "${GREEN}═══════════════════════════════════════════${NC}"
  echo -e "${GREEN}  继续工作建议${NC}"
  echo -e "${GREEN}═══════════════════════════════════════════${NC}"
  echo ""

  # 检查当前 git 状态是否有变化
  local current_branch
  current_branch=$(git branch --show-current 2>/dev/null || echo "unknown")
  local saved_branch
  saved_branch=$(grep "分支" "$session_file" | head -1 | sed 's/.*`\(.*\)`.*/\1/' || echo "")

  if [ -n "$saved_branch" ] && [ "$current_branch" != "$saved_branch" ]; then
    echo -e "${YELLOW}⚠ 当前分支 ($current_branch) 与保存时 ($saved_branch) 不同${NC}"
    echo "  建议: git checkout $saved_branch"
    echo ""
  fi

  # 检查是否有未完成的任务
  local pending_tasks
  pending_tasks=$(grep -E "^\- \[ \]" "$session_file" 2>/dev/null | head -5 || echo "")
  if [ -n "$pending_tasks" ]; then
    echo -e "${CYAN}待完成任务:${NC}"
    echo "$pending_tasks" | while read -r task; do
      echo "  $task"
    done
    echo ""
  fi

  # 显示最近修改的文件（如果会话中有记录）
  echo -e "${CYAN}下一步操作:${NC}"
  echo "  1. 检查 git status 确认工作区状态"
  echo "  2. 继续处理待完成任务"
  echo "  3. 完成后运行 /eket-save 保存进度"
  echo ""

  echo -e "${GREEN}✓ 会话上下文已加载${NC}"
}

# ─────────────────────────────────────────────
# 主流程
# ─────────────────────────────────────────────
main() {
  case "$ARG" in
    --help|-h)
      show_help
      ;;
    --list|-l)
      list_sessions
      ;;
    "")
      # 恢复最近的会话
      if [ ! -d "$SESSION_DIR" ] || [ -z "$(ls -A "$SESSION_DIR" 2>/dev/null)" ]; then
        echo -e "${YELLOW}暂无保存的会话${NC}"
        echo ""
        echo "运行 /eket-save 保存当前会话"
        exit 0
      fi

      local latest
      latest=$(ls -1t "$SESSION_DIR"/*.md 2>/dev/null | head -1)
      if [ -n "$latest" ]; then
        resume_session "$latest"
      else
        echo -e "${YELLOW}未找到会话文件${NC}"
      fi
      ;;
    *)
      # 恢复指定会话
      if [ -f "$ARG" ]; then
        resume_session "$ARG"
      elif [ -f "$SESSION_DIR/$ARG" ]; then
        resume_session "$SESSION_DIR/$ARG"
      else
        echo -e "${RED}✗ 会话文件不存在: $ARG${NC}"
        echo ""
        echo "运行 /eket-resume --list 查看可用会话"
        exit 1
      fi
      ;;
  esac
}

main
