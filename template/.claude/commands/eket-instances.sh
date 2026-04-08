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

# 获取实例状态
get_instance_status() {
    local instance_dir=$1
    
    if [ ! -f "$instance_dir/heartbeat.txt" ]; then
        echo "unknown"
        return
    fi
    
    local now=$(date +%s)
    local last_heartbeat=$(cat "$instance_dir/heartbeat.txt")
    local diff=$((now - last_heartbeat))
    
    if [ $diff -lt 60 ]; then
        echo "active"
    elif [ $diff -lt 300 ]; then
        echo "idle"
    else
        echo "stale"
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
    
    # 表头
    printf "${CYAN}%-40s %-10s %-15s %-10s${NC}\n" "实例 ID" "角色" "专长" "状态"
    echo "──────────────────────────────────────────────────────────────────────────"
    
    # 遍历实例
    for instance_dir in .eket/instances/*/; do
        [ ! -d "$instance_dir" ] && continue
        
        local instance_id=$(basename "$instance_dir")
        
        if [ ! -f "$instance_dir/identity.yml" ]; then
            continue
        fi
        
        local role=$(grep "^role:" "$instance_dir/identity.yml" | awk '{print $2}')
        local specialty=$(grep "^specialty:" "$instance_dir/identity.yml" | awk '{print $2}')
        local status=$(get_instance_status "$instance_dir")
        
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
        printf "${marker}%-40s ${role_color}%-10s${NC} %-15s ${status_color}%-10s${NC}\n" \
            "$instance_id" "$role" "${specialty:-none}" "$status"
    done
    
    echo ""
    echo -e "${GREEN}→${NC} 表示当前实例"
    echo ""
    echo -e "${BLUE}════════════════════════════════════════════════════════════════${NC}"
}

main "$@"
