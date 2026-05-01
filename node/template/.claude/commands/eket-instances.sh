#!/bin/bash
# EKET Instances - 查看所有活跃实例
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

# 清理过期实例（心跳超过 5 分钟）
cleanup_stale_instances() {
    local now=$(date +%s)
    local stale_threshold=300  # 5 分钟
    
    if [ ! -d ".eket/instances" ]; then
        return
    fi
    
    for instance_dir in .eket/instances/*/; do
        if [ ! -f "$instance_dir/heartbeat.txt" ]; then
            continue
        fi
        
        local last_heartbeat=$(cat "$instance_dir/heartbeat.txt")
        local diff=$((now - last_heartbeat))
        
        if [ $diff -gt $stale_threshold ]; then
            local instance_id=$(basename "$instance_dir")
            echo -e "${GRAY}[过期] $instance_id (离线 ${diff}s)${NC}"
        fi
    done
}

# 获取实例状态
get_instance_status() {
    local instance_dir=$1
    local instance_id=$(basename "$instance_dir")
    
    if [ ! -f "$instance_dir/identity.yml" ]; then
        echo "unknown"
        return
    fi
    
    # 检查心跳
    if [ -f "$instance_dir/heartbeat.txt" ]; then
        local now=$(date +%s)
        local last_heartbeat=$(cat "$instance_dir/heartbeat.txt")
        local diff=$((now - last_heartbeat))
        
        if [ $diff -lt 60 ]; then
            echo "active"  # 活跃（<1分钟）
        elif [ $diff -lt 300 ]; then
            echo "idle"    # 空闲（<5分钟）
        else
            echo "stale"   # 过期（>5分钟）
        fi
    else
        echo "unknown"
    fi
}

# 获取实例领取的任务
get_claimed_tasks() {
    local instance_dir=$1
    
    if [ -f "$instance_dir/claimed_tasks.txt" ]; then
        local count=$(grep -c "^" "$instance_dir/claimed_tasks.txt" 2>/dev/null || echo "0")
        echo "$count"
    else
        echo "0"
    fi
}

# 主函数
main() {
    echo -e "${BLUE}════════════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}                  EKET 活跃实例列表                             ${NC}"
    echo -e "${BLUE}════════════════════════════════════════════════════════════════${NC}"
    echo ""
    
    if [ ! -d ".eket/instances" ] || [ -z "$(ls -A .eket/instances 2>/dev/null)" ]; then
        echo -e "${YELLOW}⚠ 没有活跃实例${NC}"
        echo ""
        echo "运行 /eket-init 创建新实例"
        exit 0
    fi
    
    # 当前实例
    local current_instance=""
    if [ -f ".eket/.instance_id" ]; then
        current_instance=$(cat .eket/.instance_id)
    fi
    
    # 统计
    local total=0
    local masters=0
    local slavers=0
    local active=0
    
    # 表头
    printf "${CYAN}%-40s %-10s %-15s %-10s %-10s${NC}\n" "实例 ID" "角色" "专长" "状态" "任务数"
    echo "────────────────────────────────────────────────────────────────────────────"
    
    # 遍历实例
    for instance_dir in .eket/instances/*/; do
        local instance_id=$(basename "$instance_dir")
        
        if [ ! -f "$instance_dir/identity.yml" ]; then
            continue
        fi
        
        # 读取身份信息
        local role=$(grep "^role:" "$instance_dir/identity.yml" | awk '{print $2}')
        local specialty=$(grep "^specialty:" "$instance_dir/identity.yml" | awk '{print $2}')
        local status=$(get_instance_status "$instance_dir")
        local tasks=$(get_claimed_tasks "$instance_dir")
        
        # 统计
        total=$((total + 1))
        if [ "$role" = "master" ]; then
            masters=$((masters + 1))
        else
            slavers=$((slavers + 1))
        fi
        
        if [ "$status" = "active" ]; then
            active=$((active + 1))
        fi
        
        # 颜色
        local role_color=$GREEN
        [ "$role" = "master" ] && role_color=$CYAN
        
        local status_color=$GREEN
        case $status in
            "active") status_color=$GREEN ;;
            "idle") status_color=$YELLOW ;;
            "stale") status_color=$RED ;;
            *) status_color=$GRAY ;;
        esac
        
        # 当前实例标记
        local marker=""
        if [ "$instance_id" = "$current_instance" ]; then
            marker="${GREEN}→ ${NC}"
        else
            marker="  "
        fi
        
        # 显示
        printf "${marker}%-40s ${role_color}%-10s${NC} %-15s ${status_color}%-10s${NC} %-10s\n" \
            "$instance_id" "$role" "${specialty:-none}" "$status" "$tasks"
    done
    
    echo ""
    echo -e "${CYAN}统计:${NC}"
    echo -e "  总实例: ${GREEN}$total${NC}"
    echo -e "  Master: ${CYAN}$masters${NC}"
    echo -e "  Slaver: ${GREEN}$slavers${NC}"
    echo -e "  活跃: ${GREEN}$active${NC}"
    echo ""
    
    if [ -n "$current_instance" ]; then
        echo -e "${GREEN}→${NC} 表示当前实例"
        echo ""
    fi
    
    # 显示过期实例
    echo -e "${GRAY}检查过期实例...${NC}"
    cleanup_stale_instances
    echo ""
    
    echo -e "${CYAN}提示:${NC}"
    echo "  - active: 活跃（<1分钟未活动）"
    echo "  - idle: 空闲（<5分钟未活动）"
    echo "  - stale: 过期（>5分钟未活动）"
    echo ""
    
    echo -e "${BLUE}════════════════════════════════════════════════════════════════${NC}"
}

main "$@"
