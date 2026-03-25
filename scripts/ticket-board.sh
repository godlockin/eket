#!/bin/bash
# scripts/ticket-board.sh - Ticket 看板管理

# 不使用 set -e，避免在可恢复错误处退出

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# 显示帮助
if [ "$1" = "-h" ] || [ "$1" = "--help" ]; then
    echo "用法：$0 [command] [options]"
    echo ""
    echo "命令:"
    echo "  list [status]     列出所有 tickets (可按状态过滤)"
    echo "  summary           显示统计摘要"
    echo "  board             显示看板视图"
    echo "  export [file]     导出为 Markdown 文件"
    echo ""
    echo "示例:"
    echo "  $0 list                    # 列出所有 tickets"
    echo "  $0 list in_progress        # 列出进行中的 tickets"
    echo "  $0 summary                 # 显示统计摘要"
    echo "  $0 board                   # 显示看板视图"
    echo "  $0 export board.md         # 导出到 board.md"
    exit 0
fi

# 查找所有 ticket 文件
find_tickets() {
    local status_filter="$1"
    local tickets=()

    # 查找 jira/tickets 目录下的所有 ticket
    if [ -d "jira/tickets" ]; then
        for type_dir in jira/tickets/*/; do
            if [ -d "$type_dir" ]; then
                for ticket_file in "$type_dir"*.md; do
                    if [ -f "$ticket_file" ]; then
                        if [ -n "$status_filter" ]; then
                            ticket_status=$(grep -E "^status:" "$ticket_file" 2>/dev/null | cut -d: -f2 | tr -d ' ')
                            if [ "$ticket_status" = "$status_filter" ]; then
                                tickets+=("$ticket_file")
                            fi
                        else
                            tickets+=("$ticket_file")
                        fi
                    fi
                done
            fi
        done
    fi

    # 返回结果
    printf '%s\n' "${tickets[@]}"
}

# 解析 ticket 信息
parse_ticket() {
    local file="$1"
    local ticket_id=$(basename "$file" .md)
    local title=$(grep -E "^标题:|^title:" "$file" 2>/dev/null | head -1 | cut -d: -f2 | sed 's/^ *//')
    local type=$(grep -E "^类型:|^type:" "$file" 2>/dev/null | head -1 | cut -d: -f2 | tr -d ' ')
    local priority=$(grep -E "^优先级:|^priority:" "$file" 2>/dev/null | head -1 | cut -d: -f2 | tr -d ' ')
    local status=$(grep -E "^状态:|^status:" "$file" 2>/dev/null | head -1 | cut -d: -f2 | tr -d ' ')
    local assignee=$(grep -E "^负责人:|^assignee:" "$file" 2>/dev/null | head -1 | cut -d: -f2 | tr -d ' ')
    local created=$(grep -E "^创建时间:|^created_at:" "$file" 2>/dev/null | head -1 | cut -d: -f2 | tr -d ' ')

    echo "$ticket_id|$title|$type|$priority|$status|$assignee|$created"
}

# 显示统计摘要
show_summary() {
    echo -e "${BLUE}========================================"
    echo "Ticket 统计摘要"
    echo "========================================${NC}"
    echo ""

    # 按状态统计
    declare -A status_count
    local total=0

    for status in backlog analysis approved design ready in_progress test review passed changes_requested done; do
        count=$(find_tickets "$status" | wc -l | tr -d ' ')
        if [ "$count" -gt 0 ]; then
            status_count[$status]=$count
            total=$((total + count))
        fi
    done

    echo -e "${CYAN}## 按状态统计${NC}"
    echo ""
    printf "%-20s %s\n" "状态" "数量"
    printf "%-20s %s\n" "----" "----"

    for status in "${!status_count[@]}"; do
        local bar=""
        local count=${status_count[$status]}
        local bar_len=$((count * 2))
        for ((i=0; i<bar_len; i++)); do bar+="█"; done
        printf "%-20s %3d %s\n" "$status" "$count" "$bar"
    done
    echo ""
    printf "%-20s %3d\n" "总计" "$total"
    echo ""

    # 按类型统计
    echo -e "${CYAN}## 按类型统计${NC}"
    echo ""

    local feature_count=$(find_tickets | xargs -I {} grep -l -E "^类型:feature|^type:feature" {} 2>/dev/null | wc -l | tr -d ' ')
    local bugfix_count=$(find_tickets | xargs -I {} grep -l -E "^类型:bugfix|^type:bugfix" {} 2>/dev/null | wc -l | tr -d ' ')
    local task_count=$(find_tickets | xargs -I {} grep -l -E "^类型:task|^type:task" {} 2>/dev/null | wc -l | tr -d ' ')
    local improvement_count=$(find_tickets | xargs -I {} grep -l -E "^类型:improvement|^type:improvement" {} 2>/dev/null | wc -l | tr -d ' ')

    printf "%-15s %s\n" "类型" "数量"
    printf "%-15s %s\n" "----" "----"
    printf "%-15s %3d\n" "Feature" "$feature_count"
    printf "%-15s %3d\n" "Bugfix" "$bugfix_count"
    printf "%-15s %3d\n" "Task" "$task_count"
    printf "%-15s %3d\n" "Improvement" "$improvement_count"
    echo ""

    # 按优先级统计
    echo -e "${CYAN}## 按优先级统计${NC}"
    echo ""

    local p0_count=$(find_tickets | xargs -I {} grep -l -E "^优先级:P0|^priority:P0" {} 2>/dev/null | wc -l | tr -d ' ')
    local p1_count=$(find_tickets | xargs -I {} grep -l -E "^优先级:P1|^priority:P1" {} 2>/dev/null | wc -l | tr -d ' ')
    local p2_count=$(find_tickets | xargs -I {} grep -l -E "^优先级:P2|^priority:P2" {} 2>/dev/null | wc -l | tr -d ' ')
    local p3_count=$(find_tickets | xargs -I {} grep -l -E "^优先级:P3|^priority:P3" {} 2>/dev/null | wc -l | tr -d ' ')

    printf "%-10s %s\n" "优先级" "数量"
    printf "%-10s %s\n" "------" "----"
    printf "%-10s %3d\n" "P0 (紧急)" "$p0_count"
    printf "%-10s %3d\n" "P1 (高)" "$p1_count"
    printf "%-10s %3d\n" "P2 (中)" "$p2_count"
    printf "%-10s %3d\n" "P3 (低)" "$p3_count"
    echo ""

    # 时间追踪
    echo -e "${CYAN}## 时间追踪${NC}"
    echo ""

    local in_progress_count=${status_count[in_progress]:-0}
    local review_count=${status_count[review]:-0}
    local done_count=${status_count[done]:-0}

    echo "进行中任务：$in_progress_count"
    echo "Review 中任务：$review_count"
    echo "已完成任务：$done_count"
    echo ""
}

# 显示看板视图
show_board() {
    echo -e "${BLUE}========================================"
    echo "Ticket 看板"
    echo "========================================${NC}"
    echo ""

    # 定义看板列
    declare -a columns=(
        "backlog:待办"
        "ready:就绪"
        "in_progress:进行中"
        "test:测试中"
        "review:审查中"
        "done:已完成"
    )

    for col_info in "${columns[@]}"; do
        IFS=':' read -r status name <<< "$col_info"

        tickets=$(find_tickets "$status")

        if [ -n "$tickets" ]; then
            echo -e "${CYAN}## $name ($status)${NC}"
            echo ""

            while IFS= read -r ticket_file; do
                if [ -n "$ticket_file" ] && [ -f "$ticket_file" ]; then
                    ticket_id=$(basename "$ticket_file" .md)
                    title=$(grep -E "^标题:|^title:" "$ticket_file" 2>/dev/null | head -1 | cut -d: -f2 | sed 's/^ *//')
                    priority=$(grep -E "^优先级:|^priority:" "$ticket_file" 2>/dev/null | head -1 | cut -d: -f2 | tr -d ' ')

                    # 优先级图标
                    case $priority in
                        P0) icon="🔴" ;;
                        P1) icon="🟠" ;;
                        P2) icon="🟡" ;;
                        P3) icon="🟢" ;;
                        *) icon="⚪" ;;
                    esac

                    echo "  $icon [$ticket_id] $title"
                fi
            done <<< "$tickets"

            echo ""
        fi
    done
}

# 导出看板
export_board() {
    local output_file="${1:-ticket-board.md}"

    cat > "$output_file" << EOF
# Ticket 看板

**生成时间**: $(date -Iseconds)

---

## 统计摘要

EOF

    # 添加统计信息
    show_summary >> "$output_file"

    echo "" >> "$output_file"
    echo "---" >> "$output_file"
    echo "" >> "$output_file"

    # 添加看板视图
    echo "## 看板视图" >> "$output_file"
    echo "" >> "$output_file"

    # 定义看板列
    declare -a columns=(
        "backlog:待办"
        "ready:就绪"
        "in_progress:进行中"
        "test:测试中"
        "review:审查中"
        "done:已完成"
    )

    for col_info in "${columns[@]}"; do
        IFS=':' read -r status name <<< "$col_info"

        tickets=$(find_tickets "$status")

        if [ -n "$tickets" ]; then
            echo "### $name" >> "$output_file"
            echo "" >> "$output_file"
            echo "| ID | 标题 | 优先级 |" >> "$output_file"
            echo "|----|------|--------|" >> "$output_file"

            while IFS= read -r ticket_file; do
                if [ -n "$ticket_file" ] && [ -f "$ticket_file" ]; then
                    ticket_id=$(basename "$ticket_file" .md)
                    title=$(grep -E "^标题:|^title:" "$ticket_file" 2>/dev/null | head -1 | cut -d: -f2 | sed 's/^ *//' | cut -c1-50)
                    priority=$(grep -E "^优先级:|^priority:" "$ticket_file" 2>/dev/null | head -1 | cut -d: -f2 | tr -d ' ')

                    echo "| $ticket_id | $title | $priority |" >> "$output_file"
                fi
            done <<< "$tickets"

            echo "" >> "$output_file"
        fi
    done

    echo -e "${GREEN}✓ 看板已导出到：$output_file${NC}"
}

# 主程序
COMMAND="${1:-list}"

case "$COMMAND" in
    list)
        status_filter="${2:-}"
        echo -e "${BLUE}## Tickets 列表${NC}"
        if [ -n "$status_filter" ]; then
            echo "过滤条件：status = $status_filter"
        fi
        echo ""

        tickets=$(find_tickets "$status_filter")

        if [ -n "$tickets" ]; then
            printf "%-15s %-40s %-12s %-8s %-12s\n" "ID" "标题" "类型" "优先级" "状态"
            printf "%-15s %-40s %-12s %-8s %-12s\n" "----" "----" "----" "----" "----"

            while IFS= read -r ticket_file; do
                if [ -n "$ticket_file" ] && [ -f "$ticket_file" ]; then
                    data=$(parse_ticket "$ticket_file")
                    IFS='|' read -r id title type priority status assignee created <<< "$data"
                    title_display="${title:0:38}"
                    if [ ${#title} -gt 38 ]; then
                        title_display="${title_display}..."
                    fi
                    printf "%-15s %-40s %-12s %-8s %-12s\n" "$id" "$title_display" "${type:--}" "${priority:--}" "${status:--}"
                fi
            done <<< "$tickets"
        else
            echo "暂无 tickets"
        fi
        ;;

    summary)
        show_summary
        ;;

    board)
        show_board
        ;;

    export)
        export_board "$2"
        ;;

    *)
        echo -e "${RED}错误：未知命令：$COMMAND${NC}"
        echo "使用 -h 或 --help 查看帮助"
        exit 1
        ;;
esac

echo ""
