#!/bin/bash
# EKET Status - 查看状态和任务列表
# Version: 2.0.0

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
GRAY='\033[0;90m'
NC='\033[0m'

# 获取当前实例信息
get_instance_info() {
    if [ ! -f ".eket/.instance_id" ]; then
        echo "未初始化"
        return
    fi
    
    local instance_id=$(cat .eket/.instance_id)
    echo "$instance_id"
}

# 获取角色
get_role() {
    local instance_id=$(get_instance_info)
    
    if [ "$instance_id" = "未初始化" ]; then
        echo "unknown"
        return
    fi
    
    local identity_file=".eket/instances/$instance_id/identity.yml"
    if [ ! -f "$identity_file" ]; then
        echo "unknown"
        return
    fi
    
    grep "^role:" "$identity_file" | awk '{print $2}'
}

# 获取可领取的任务（Slaver）
get_available_tasks() {
    local role=$(get_role)
    local specialty=""
    
    if [ "$role" = "slaver" ]; then
        local instance_id=$(get_instance_info)
        specialty=$(grep "^specialty:" ".eket/instances/$instance_id/identity.yml" 2>/dev/null | awk '{print $2}')
    fi
    
    if [ ! -d "jira/tickets" ]; then
        return
    fi
    
    # 查找 ready 状态的任务
    find jira/tickets -name "*.md" -type f 2>/dev/null | while read -r task_file; do
        local status=$(grep -i "^status:" "$task_file" | awk '{print $2}' | tr -d '"')
        local tags=$(grep -i "^tags:" "$task_file" | sed 's/tags://i' | tr -d '[]"' | tr ',' ' ')
        
        if [ "$status" = "ready" ] || [ "$status" = "backlog" ]; then
            # 如果有专长，匹配标签
            if [ -n "$specialty" ] && [ "$specialty" != "none" ]; then
                if echo "$tags" | grep -qi "$specialty"; then
                    echo "$task_file"
                fi
            else
                echo "$task_file"
            fi
        fi
    done
}

# 获取我领取的任务
get_my_tasks() {
    local instance_id=$(get_instance_info)
    
    if [ ! -f ".eket/instances/$instance_id/claimed_tasks.txt" ]; then
        return
    fi
    
    cat ".eket/instances/$instance_id/claimed_tasks.txt"
}

# 显示任务信息
show_task() {
    local task_file=$1
    local index=$2
    
    local task_id=$(basename "$task_file" .md)
    local title=$(grep "^# " "$task_file" | head -1 | sed 's/^# //')
    local status=$(grep -i "^status:" "$task_file" | awk '{print $2}' | tr -d '"')
    local priority=$(grep -i "^priority:" "$task_file" | awk '{print $2}' | tr -d '"')
    
    echo -e "${CYAN}$index)${NC} ${GREEN}$task_id${NC}"
    echo -e "   标题: $title"
    echo -e "   状态: $status"
    [ -n "$priority" ] && echo -e "   优先级: $priority"
    echo ""
}

main() {
    echo -e "${BLUE}════════════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}                     EKET 状态查看                              ${NC}"
    echo -e "${BLUE}════════════════════════════════════════════════════════════════${NC}"
    echo ""
    
    # 实例信息
    local instance_id=$(get_instance_info)
    local role=$(get_role)
    
    if [ "$instance_id" = "未初始化" ]; then
        echo -e "${YELLOW}⚠ 项目未初始化${NC}"
        echo ""
        echo "运行 /eket-init 初始化项目"
        exit 0
    fi
    
    echo -e "${CYAN}实例 ID:${NC} $instance_id"
    echo -e "${CYAN}角色:${NC} $role"
    
    if [ "$role" = "slaver" ]; then
        local specialty=$(grep "^specialty:" ".eket/instances/$instance_id/identity.yml" | awk '{print $2}')
        echo -e "${CYAN}专长:${NC} $specialty"
    fi
    echo ""
    
    # 根据角色显示不同内容
    if [ "$role" = "master" ]; then
        echo -e "${CYAN}═══ Master 概览 ═══${NC}"
        echo ""
        echo "运行 ${GREEN}/eket-check-progress${NC} 查看详细进度"
        echo "运行 ${GREEN}/eket-instances${NC} 查看所有实例"
        echo ""
        
        # 快速统计
        if [ -d "jira/tickets" ]; then
            local total=$(find jira/tickets -name "*.md" | wc -l | tr -d ' ')
            echo -e "总任务数: ${GREEN}$total${NC}"
        fi
        
    elif [ "$role" = "slaver" ]; then
        echo -e "${CYAN}═══ 我的任务 ═══${NC}"
        echo ""
        
        local my_tasks=$(get_my_tasks)
        if [ -z "$my_tasks" ]; then
            echo -e "${GRAY}暂无领取的任务${NC}"
        else
            while IFS= read -r task_id; do
                [ -z "$task_id" ] && continue
                local task_file="jira/tickets/$task_id.md"
                if [ -f "$task_file" ]; then
                    show_task "$task_file" "●"
                fi
            done <<< "$my_tasks"
        fi
        echo ""
        
        echo -e "${CYAN}═══ 可领取的任务 ═══${NC}"
        echo ""
        
        local available=$(get_available_tasks)
        if [ -z "$available" ]; then
            echo -e "${GRAY}暂无可领取的任务${NC}"
            echo ""
            echo "等待 Master 创建新任务，或运行 ${GREEN}/eket-start -a${NC} 进入自动模式"
        else
            local index=1
            while IFS= read -r task_file; do
                [ -z "$task_file" ] && continue
                show_task "$task_file" "$index"
                index=$((index + 1))
            done <<< "$available"
            
            echo -e "运行 ${GREEN}/eket-claim <task-id>${NC} 领取任务"
        fi
        echo ""
    fi
    
    echo -e "${BLUE}════════════════════════════════════════════════════════════════${NC}"
}

main "$@"
