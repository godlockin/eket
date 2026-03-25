#!/bin/bash
# scripts/generate-stats.sh - 生成项目统计报告

# 不使用 set -e，避免在可恢复错误处退出

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

echo "========================================"
echo "项目统计报告"
echo "========================================"
echo ""

# 输出格式 (markdown 或 console)
OUTPUT_FORMAT="${1:-console}"
OUTPUT_FILE="${2:-}"

# 查找所有 ticket 文件
find_all_tickets() {
    local tickets=()
    if [ -d "jira/tickets" ]; then
        for type_dir in jira/tickets/*/; do
            if [ -d "$type_dir" ]; then
                for ticket_file in "$type_dir"*.md; do
                    if [ -f "$ticket_file" ]; then
                        tickets+=("$ticket_file")
                    fi
                done
            fi
        done
    fi
    printf '%s\n' "${tickets[@]}"
}

# 解析单字段
get_field() {
    local file="$1"
    local field="$2"
    grep -E "^${field}:|^${field}_at:" "$file" 2>/dev/null | head -1 | cut -d: -f2- | sed 's/^ *//'
}

# 统计函数
generate_stats() {
    local tickets
    mapfile -t tickets < <(find_all_tickets)

    local total=${#tickets[@]}
    local by_status=()
    local by_type=()
    local by_priority=()

    # 按状态统计
    declare -A status_map
    declare -A type_map
    declare -A priority_map
    declare -A assignee_map

    for ticket in "${tickets[@]}"; do
        if [ -n "$ticket" ] && [ -f "$ticket" ]; then
            # 状态
            status=$(get_field "$ticket" "状态")
            if [ -z "$status" ]; then
                status=$(get_field "$ticket" "status")
            fi
            status_map["$status"]=$((${status_map["$status"]:-0} + 1))

            # 类型
            type=$(get_field "$ticket" "类型")
            if [ -z "$type" ]; then
                type=$(get_field "$ticket" "type")
            fi
            type_map["$type"]=$((${type_map["$type"]:-0} + 1))

            # 优先级
            priority=$(get_field "$ticket" "优先级")
            if [ -z "$priority" ]; then
                priority=$(get_field "$ticket" "priority")
            fi
            priority_map["$priority"]=$((${priority_map["$priority"]:-0} + 1))

            # 负责人
            assignee=$(get_field "$ticket" "负责人")
            if [ -z "$assignee" ]; then
                assignee=$(get_field "$ticket" "assignee")
            fi
            if [ -n "$assignee" ]; then
                assignee_map["$assignee"]=$((${assignee_map["$assignee"]:-0} + 1))
            fi
        fi
    done

    # 生成报告
    if [ "$OUTPUT_FORMAT" = "markdown" ]; then
        generate_markdown_report "$total" status_map type_map priority_map assignee_map
    else
        generate_console_report "$total" status_map type_map priority_map assignee_map
    fi
}

# 生成控制台报告
generate_console_report() {
    local total="$1"
    declare -n status_ref="$2"
    declare -n type_ref="$3"
    declare -n priority_ref="$4"
    declare -n assignee_ref="$5"

    echo -e "${BLUE}## 总体统计${NC}"
    echo ""
    echo "总 Ticket 数：$total"
    echo ""

    # 按状态统计
    echo -e "${CYAN}## 按状态统计${NC}"
    echo ""
    printf "%-20s %10s %s\n" "状态" "数量" "进度条"
    printf "%-20s %10s %s\n" "--------------------" "----------" "--------------------"

    for status in "${!status_ref[@]}"; do
        count=${status_ref[$status]}
        local pct=0
        if [ "$total" -gt 0 ]; then
            pct=$((count * 100 / total))
        fi
        local bar_len=$((pct / 5))
        local bar=""
        for ((i=0; i<bar_len; i++)); do bar+="█"; done
        printf "%-20s %10d %s (%d%%)\n" "$status" "$count" "$bar" "$pct"
    done
    echo ""

    # 按类型统计
    echo -e "${CYAN}## 按类型统计${NC}"
    echo ""
    printf "%-20s %10s %s\n" "类型" "数量" "占比"
    printf "%-20s %10s %s\n" "--------------------" "----------" "----------"

    for type in "${!type_ref[@]}"; do
        count=${type_ref[$type]}
        local pct=0
        if [ "$total" -gt 0 ]; then
            pct=$((count * 100 / total))
        fi
        printf "%-20s %10d %d%%\n" "$type" "$count" "$pct"
    done
    echo ""

    # 按优先级统计
    echo -e "${CYAN}## 按优先级统计${NC}"
    echo ""
    printf "%-15s %10s %s\n" "优先级" "数量" "图标"
    printf "%-15s %10s %s\n" "---------------" "----------" "----------"

    for p in P0 P1 P2 P3; do
        count=${priority_ref[$p]:-0}
        case $p in
            P0) icon="🔴" ;;
            P1) icon="🟠" ;;
            P2) icon="🟡" ;;
            P3) icon="🟢" ;;
        esac
        printf "%-15s %10d %s\n" "$p" "$count" "$icon"
    done
    echo ""

    # 按负责人统计
    echo -e "${CYAN}## 按负责人统计${NC}"
    echo ""
    printf "%-20s %10s\n" "负责人" "数量"
    printf "%-20s %10s\n" "--------------------" "----------"

    for assignee in "${!assignee_ref[@]}"; do
        count=${assignee_ref[$assignee]}
        printf "%-20s %10d\n" "$assignee" "$count"
    done
    echo ""

    # 趋势分析
    echo -e "${CYAN}## 趋势分析${NC}"
    echo ""

    # 本周创建
    local this_week=0
    local last_week=0
    local now=$(date +%s)
    local week_secs=$((7 * 24 * 60 * 60))

    for ticket in "${tickets[@]}"; do
        if [ -n "$ticket" ] && [ -f "$ticket" ]; then
            created=$(get_field "$ticket" "创建时间")
            if [ -z "$created" ]; then
                created=$(get_field "$ticket" "created_at")
            fi
            if [ -n "$created" ]; then
                created_ts=$(date -d "$created" +%s 2>/dev/null || echo 0)
                if [ "$created_ts" -gt 0 ]; then
                    local diff=$((now - created_ts))
                    if [ "$diff" -lt "$week_secs" ]; then
                        this_week=$((this_week + 1))
                    elif [ "$diff" -lt $((week_secs * 2)) ]; then
                        last_week=$((last_week + 1))
                    fi
                fi
            fi
        fi
    done

    echo "本周创建：$this_week"
    echo "上周创建：$last_week"

    if [ "$last_week" -gt 0 ]; then
        local change=$((this_week - last_week))
        local pct=$((change * 100 / last_week))
        if [ "$change" -gt 0 ]; then
            echo "趋势：↑ ${pct}% 增长"
        elif [ "$change" -lt 0 ]; then
            echo "趋势：↓ ${pct#-}% 下降"
        else
            echo "趋势：→ 持平"
        fi
    fi
    echo ""

    # 完成率
    echo -e "${CYAN}## 完成率${NC}"
    echo ""

    local done_count=${status_ref[done]:-0}
    local completion_rate=0
    if [ "$total" -gt 0 ]; then
        completion_rate=$((done_count * 100 / total))
    fi

    echo "已完成：$done_count / $total ($completion_rate%)"

    # 进度条
    local bar_len=$((completion_rate / 5))
    local bar=""
    for ((i=0; i<bar_len; i++)); do bar+="█"; done
    for ((i=bar_len; i<20; i++)); do bar+="░"; done

    echo "[$bar] $completion_rate%"
    echo ""
}

# 生成 Markdown 报告
generate_markdown_report() {
    local total="$1"
    declare -n status_ref="$2"
    declare -n type_ref="$3"
    declare -n priority_ref="$4"
    declare -n assignee_ref="$5"

    cat << EOF
# 项目统计报告

**生成时间**: $(date -Iseconds)
**总 Ticket 数**: $total

---

## 按状态统计

| 状态 | 数量 | 占比 |
|------|------|------|
EOF

    for status in "${!status_ref[@]}"; do
        count=${status_ref[$status]}
        pct=$((count * 100 / total))
        echo "| $status | $count | $pct% |"
    done

    cat << EOF

---

## 按类型统计

| 类型 | 数量 | 占比 |
|------|------|------|
EOF

    for type in "${!type_ref[@]}"; do
        count=${type_ref[$type]}
        pct=$((count * 100 / total))
        echo "| $type | $count | $pct% |"
    done

    cat << EOF

---

## 按优先级统计

| 优先级 | 数量 | 图标 |
|--------|------|------|
EOF

    for p in P0 P1 P2 P3; do
        count=${priority_ref[$p]:-0}
        case $p in
            P0) icon="🔴" ;;
            P1) icon="🟠" ;;
            P2) icon="🟡" ;;
            P3) icon="🟢" ;;
        esac
        echo "| $p | $count | $icon |"
    done

    cat << EOF

---

## 按负责人统计

| 负责人 | 数量 |
|--------|------|
EOF

    for assignee in "${!assignee_ref[@]}"; do
        count=${assignee_ref[$assignee]}
        echo "| $assignee | $count |"
    done

    cat << EOF

---

## 趋势分析

EOF

    # 简单的趋势分析
    local done_count=${status_ref[done]:-0}
    local completion_rate=0
    if [ "$total" -gt 0 ]; then
        completion_rate=$((done_count * 100 / total))
    fi

    echo "- **完成率**: $completion_rate%"
    echo "- **已完成**: $done_count / $total"
}

# 主程序
generate_stats

echo ""

# 如果指定了输出文件，则写入文件
if [ -n "$OUTPUT_FILE" ]; then
    generate_stats > "$OUTPUT_FILE"
    echo -e "${GREEN}✓ 报告已保存到：$OUTPUT_FILE${NC}"
fi
