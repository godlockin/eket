#!/bin/bash
# EKET Check Progress - Master 检查所有 Slaver 任务进度
# Version: 2.0.0

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
GRAY='\033[0;90m'
NC='\033[0m'

# 检查是否为 Master
check_master() {
    if [ ! -f ".eket/.instance_id" ]; then
        echo -e "${RED}✗ 错误: 未找到实例 ID${NC}"
        echo "请先运行 /eket-init"
        exit 1
    fi
    
    local instance_id=$(cat .eket/.instance_id)
    local identity_file=".eket/instances/$instance_id/identity.yml"
    
    if [ ! -f "$identity_file" ]; then
        echo -e "${RED}✗ 错误: 身份文件不存在${NC}"
        exit 1
    fi
    
    local role=$(grep "^role:" "$identity_file" | awk '{print $2}')
    if [ "$role" != "master" ]; then
        echo -e "${RED}✗ 错误: 此命令仅限 Master 使用${NC}"
        echo "当前角色: $role"
        exit 1
    fi
}

# 获取所有任务状态
get_all_tasks() {
    if [ ! -d "jira/tickets" ]; then
        echo ""
        return
    fi
    
    find jira/tickets -name "*.md" -type f 2>/dev/null
}

# 解析任务状态
parse_task_status() {
    local task_file=$1
    
    if [ ! -f "$task_file" ]; then
        echo "unknown"
        return
    fi
    
    # 查找状态字段
    local status=$(grep -i "^status:" "$task_file" | head -1 | awk '{print $2}' | tr -d '"')
    echo "${status:-unknown}"
}

# 获取任务负责人
get_task_owner() {
    local task_file=$1
    
    if [ ! -f "$task_file" ]; then
        echo "unassigned"
        return
    fi
    
    local owner=$(grep -i "^assigned_to:" "$task_file" | head -1 | awk '{print $2}' | tr -d '"')
    echo "${owner:-unassigned}"
}

# 获取任务ID
get_task_id() {
    local task_file=$1
    local filename=$(basename "$task_file" .md)
    echo "$filename"
}

# 获取任务标题
get_task_title() {
    local task_file=$1
    
    # 查找第一个 # 标题
    local title=$(grep "^# " "$task_file" | head -1 | sed 's/^# //')
    echo "${title:-无标题}"
}

# 显示 Slaver 实例状态
show_slaver_status() {
    echo -e "${CYAN}═══ Slaver 实例状态 ═══${NC}"
    echo ""
    
    if [ ! -d ".eket/instances" ]; then
        echo -e "${YELLOW}⚠ 没有 Slaver 实例${NC}"
        return
    fi
    
    local slavers_found=false
    local now=$(date +%s)
    
    printf "${CYAN}%-40s %-15s %-10s %-15s${NC}\n" "Slaver ID" "专长" "状态" "最后活动"
    echo "──────────────────────────────────────────────────────────────────────────────"
    
    for instance_dir in .eket/instances/*/; do
        if [ ! -f "$instance_dir/identity.yml" ]; then
            continue
        fi
        
        local role=$(grep "^role:" "$instance_dir/identity.yml" | awk '{print $2}')
        
        if [ "$role" != "slaver" ]; then
            continue
        fi
        
        slavers_found=true
        
        local instance_id=$(basename "$instance_dir")
        local specialty=$(grep "^specialty:" "$instance_dir/identity.yml" | awk '{print $2}')
        
        # 检查心跳
        local status="unknown"
        local last_activity="N/A"
        if [ -f "$instance_dir/heartbeat.txt" ]; then
            local last_heartbeat=$(cat "$instance_dir/heartbeat.txt")
            local diff=$((now - last_heartbeat))
            
            if [ $diff -lt 60 ]; then
                status="${GREEN}活跃${NC}"
                last_activity="${diff}秒前"
            elif [ $diff -lt 300 ]; then
                status="${YELLOW}空闲${NC}"
                last_activity="$((diff / 60))分钟前"
            else
                status="${RED}离线${NC}"
                last_activity="$((diff / 60))分钟前"
            fi
        fi
        
        printf "%-40s %-15s %-24s %-15s\n" \
            "$instance_id" "${specialty:-none}" "$status" "$last_activity"
    done
    
    if [ "$slavers_found" = false ]; then
        echo -e "${YELLOW}⚠ 没有活跃的 Slaver${NC}"
    fi
    
    echo ""
}

# 显示任务进度
show_task_progress() {
    echo -e "${CYAN}═══ 任务进度总览 ═══${NC}"
    echo ""
    
    local tasks=$(get_all_tasks)
    
    if [ -z "$tasks" ]; then
        echo -e "${YELLOW}⚠ 没有任务${NC}"
        echo ""
        echo "提示: 运行 /eket-analyze 分析需求并创建任务"
        return
    fi
    
    # 统计
    local total=0
    local backlog=0
    local in_progress=0
    local review=0
    local done=0
    local blocked=0
    
    printf "${CYAN}%-15s %-40s %-20s %-15s${NC}\n" "任务 ID" "标题" "负责人" "状态"
    echo "────────────────────────────────────────────────────────────────────────────────────────"
    
    while IFS= read -r task_file; do
        if [ -z "$task_file" ]; then
            continue
        fi
        
        local task_id=$(get_task_id "$task_file")
        local title=$(get_task_title "$task_file")
        local owner=$(get_task_owner "$task_file")
        local status=$(parse_task_status "$task_file")
        
        total=$((total + 1))
        
        # 统计状态
        case $status in
            backlog) backlog=$((backlog + 1)) ;;
            in_progress|dev|development) in_progress=$((in_progress + 1)) ;;
            review|testing) review=$((review + 1)) ;;
            done|completed) done=$((done + 1)) ;;
            blocked) blocked=$((blocked + 1)) ;;
        esac
        
        # 状态颜色
        local status_color=$NC
        case $status in
            backlog) status_color=$GRAY ;;
            in_progress|dev) status_color=$YELLOW ;;
            review|testing) status_color=$CYAN ;;
            done|completed) status_color=$GREEN ;;
            blocked) status_color=$RED ;;
        esac
        
        # 截断标题
        if [ ${#title} -gt 37 ]; then
            title="${title:0:37}..."
        fi
        
        printf "%-15s %-40s %-20s ${status_color}%-15s${NC}\n" \
            "$task_id" "$title" "$owner" "$status"
    done <<< "$tasks"
    
    echo ""
    echo -e "${CYAN}统计:${NC}"
    echo -e "  总任务: ${GREEN}$total${NC}"
    echo -e "  待开始: ${GRAY}$backlog${NC}"
    echo -e "  进行中: ${YELLOW}$in_progress${NC}"
    echo -e "  待审核: ${CYAN}$review${NC}"
    echo -e "  已完成: ${GREEN}$done${NC}"
    if [ $blocked -gt 0 ]; then
        echo -e "  阻塞: ${RED}$blocked${NC}"
    fi
    echo ""
    
    # 进度百分比
    if [ $total -gt 0 ]; then
        local progress=$((done * 100 / total))
        echo -e "${CYAN}整体进度:${NC} ${GREEN}$progress%${NC} ($done/$total)"
        
        # 进度条
        local bar_width=50
        local filled=$((progress * bar_width / 100))
        local empty=$((bar_width - filled))
        
        printf "["
        for ((i=0; i<filled; i++)); do printf "█"; done
        for ((i=0; i<empty; i++)); do printf "░"; done
        printf "]\n"
        echo ""
    fi
}

# 显示待审核 PR
show_pending_prs() {
    echo -e "${CYAN}═══ 待审核 PR ═══${NC}"
    echo ""
    
    if [ ! -d "outbox/review_requests" ]; then
        echo -e "${GRAY}没有待审核 PR${NC}"
        return
    fi
    
    local prs=$(find outbox/review_requests -name "pr-*.md" -type f 2>/dev/null)
    
    if [ -z "$prs" ]; then
        echo -e "${GRAY}没有待审核 PR${NC}"
        return
    fi
    
    local count=0
    while IFS= read -r pr_file; do
        if [ -z "$pr_file" ]; then
            continue
        fi
        
        count=$((count + 1))
        local pr_name=$(basename "$pr_file" .md)
        local task_id=$(echo "$pr_name" | sed 's/^pr-//')
        
        echo -e "${YELLOW}●${NC} $pr_name"
        echo -e "  文件: $pr_file"
        echo -e "  运行: ${GREEN}/eket-review-pr $task_id${NC} 进行审核"
        echo ""
    done <<< "$prs"
    
    if [ $count -gt 0 ]; then
        echo -e "${YELLOW}⚠ 有 $count 个 PR 待审核${NC}"
        echo ""
    fi
}

# 显示人类输入状态
show_human_input() {
    echo -e "${CYAN}═══ 人类输入状态 ═══${NC}"
    echo ""
    
    if [ ! -f "inbox/human_input.md" ]; then
        echo -e "${GRAY}inbox/human_input.md 不存在${NC}"
        return
    fi
    
    # 检查文件修改时间
    local modified=$(stat -f "%Sm" -t "%Y-%m-%d %H:%M" inbox/human_input.md 2>/dev/null || stat -c "%y" inbox/human_input.md 2>/dev/null | cut -d'.' -f1)
    echo -e "最后修改: ${CYAN}$modified${NC}"
    
    # 显示前几行
    echo ""
    echo -e "${GRAY}───────────────────────────────────────${NC}"
    head -10 inbox/human_input.md | sed 's/^/  /'
    echo -e "${GRAY}───────────────────────────────────────${NC}"
    echo ""
}

# 主函数
main() {
    echo -e "${BLUE}════════════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}                  Master 进度检查                               ${NC}"
    echo -e "${BLUE}════════════════════════════════════════════════════════════════${NC}"
    echo ""
    
    # 检查 Master 权限
    check_master
    
    # 显示各部分
    show_slaver_status
    echo ""
    show_task_progress
    echo ""
    show_pending_prs
    echo ""
    show_human_input
    
    echo -e "${BLUE}════════════════════════════════════════════════════════════════${NC}"
    echo ""
    echo -e "${CYAN}Master 操作:${NC}"
    echo -e "  /eket-review-pr <id>    审核 PR"
    echo -e "  /eket-merge-pr <id>     合并 PR"
    echo -e "  /eket-analyze           分析新需求"
    echo -e "  /eket-instances         查看所有实例"
    echo ""
}

main "$@"
