#!/bin/bash
# template/.claude/commands/eket-board.sh - Ticket 看板命令

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
SCRIPTS_DIR="$PROJECT_ROOT/scripts"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo "========================================"
echo "EKET Ticket 看板 (v0.9.0)"
echo "========================================"
echo ""

# 显示帮助
if [ "$1" = "-h" ] || [ "$1" = "--help" ]; then
    echo "用法：/eket-board [command] [options]"
    echo ""
    echo "命令:"
    echo "  list [status]     列出所有 tickets (可按状态过滤)"
    echo "  summary           显示统计摘要"
    echo "  board             显示看板视图"
    echo "  stats             快速统计"
    echo "  export [file]     导出为 Markdown 文件"
    echo ""
    echo "示例:"
    echo "  /eket-board list                   # 列出所有 tickets"
    echo "  /eket-board list in_progress       # 列出进行中的 tickets"
    echo "  /eket-board summary                # 显示统计摘要"
    echo "  /eket-board board                  # 显示看板视图"
    echo "  /eket-board stats                  # 快速统计"
    echo "  /eket-board export board.md        # 导出到 board.md"
    exit 0
fi

COMMAND="${1:-list}"

case "$COMMAND" in
    list)
        status_filter="${2:-}"
        bash "$SCRIPTS_DIR/ticket-board.sh" list "$status_filter"
        ;;

    summary)
        bash "$SCRIPTS_DIR/ticket-board.sh" summary
        ;;

    board)
        bash "$SCRIPTS_DIR/ticket-board.sh" board
        ;;

    stats)
        bash "$SCRIPTS_DIR/quick-stats.sh"
        ;;

    export)
        bash "$SCRIPTS_DIR/ticket-board.sh" export "$2"
        ;;

    full)
        # 完整报告
        echo -e "${BLUE}## 快速统计${NC}"
        echo ""
        bash "$SCRIPTS_DIR/quick-stats.sh"
        echo ""
        echo -e "${BLUE}## 统计摘要${NC}"
        echo ""
        bash "$SCRIPTS_DIR/ticket-board.sh" summary
        ;;

    *)
        echo -e "${RED}错误：未知命令：$COMMAND${NC}"
        echo "使用 -h 或 --help 查看帮助"
        exit 1
        ;;
esac

echo "========================================"
