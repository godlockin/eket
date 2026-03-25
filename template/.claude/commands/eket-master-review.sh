#!/bin/bash
# template/.claude/commands/eket-master-review.sh - Master 节点 Review 命令（支持 Subagent 初始化）

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
SCRIPTS_DIR="$PROJECT_ROOT/scripts"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo "========================================"
echo "EKET Master Review (v0.9.0)"
echo "========================================"
echo ""

# 显示帮助
if [ "$1" = "-h" ] || [ "$1" = "--help" ]; then
    echo "用法：/eket-master-review [command] [options]"
    echo ""
    echo "命令:"
    echo "  init <ticket-id>     初始化 Subagents"
    echo "  status <ticket-id>   查看审查状态"
    echo "  finalize <ticket-id> 汇总审查结果"
    echo "  full <ticket-id>     完整流程 (init + 等待 + finalize)"
    echo ""
    echo "示例:"
    echo "  /eket-master-review init FEAT-001"
    echo "  /eket-master-review full FEAT-001"
    exit 0
fi

COMMAND="${1:-}"
TICKET_ID="${2:-}"

if [ -z "$COMMAND" ]; then
    echo -e "${RED}错误：请提供命令${NC}"
    echo "用法：/eket-master-review <command> [ticket-id]"
    echo "使用 -h 或 --help 查看帮助"
    exit 1
fi

case "$COMMAND" in
    init)
        if [ -z "$TICKET_ID" ]; then
            echo -e "${RED}错误：请提供任务 ID${NC}"
            exit 1
        fi
        echo -e "${BLUE}## 初始化 Subagents${NC}"
        echo ""
        bash "$SCRIPTS_DIR/init-review-subagents.sh" "$TICKET_ID"
        ;;

    status)
        if [ -z "$TICKET_ID" ]; then
            echo -e "${RED}错误：请提供任务 ID${NC}"
            exit 1
        fi
        SHARED_MEMORY_DIR=".eket/state/shared-memory/reviews/${TICKET_ID}"
        if [ ! -d "$SHARED_MEMORY_DIR" ]; then
            echo -e "${RED}错误：Review 未初始化${NC}"
            exit 1
        fi
        echo -e "${BLUE}## Review 状态：$TICKET_ID${NC}"
        echo ""
        cat "$SHARED_MEMORY_DIR/coordinator.yml"
        ;;

    finalize)
        if [ -z "$TICKET_ID" ]; then
            echo -e "${RED}错误：请提供任务 ID${NC}"
            exit 1
        fi
        echo -e "${BLUE}## 汇总审查结果${NC}"
        echo ""
        bash "$SCRIPTS_DIR/finalize-review.sh" "$TICKET_ID"
        ;;

    full)
        if [ -z "$TICKET_ID" ]; then
            echo -e "${RED}错误：请提供任务 ID${NC}"
            exit 1
        fi
        echo -e "${BLUE}## 完整 Review 流程${NC}"
        echo ""
        echo "步骤 1: 初始化 Subagents"
        bash "$SCRIPTS_DIR/init-review-subagents.sh" "$TICKET_ID"
        echo ""
        echo "步骤 2: 等待 Subagents 审查..."
        echo "提示：在实际使用中，这里会等待各 Subagent 完成审查"
        echo "按任意键继续..."
        read -n 1 -s
        echo ""
        echo ""
        echo "步骤 3: 汇总审查结果"
        bash "$SCRIPTS_DIR/finalize-review.sh" "$TICKET_ID"
        ;;

    *)
        echo -e "${RED}错误：未知命令：$COMMAND${NC}"
        echo "使用 -h 或 --help 查看帮助"
        exit 1
        ;;
esac

echo "========================================"
