#!/bin/bash
# EKET Common Functions - 所有命令共用的函数库
# Version: 2.0.0

# 颜色定义
export RED='\033[0;31m'
export GREEN='\033[0;32m'
export YELLOW='\033[1;33m'
export BLUE='\033[0;34m'
export CYAN='\033[0;36m'
export GRAY='\033[0;90m'
export NC='\033[0m'

# 获取当前 session 的 instance ID
get_my_instance_id() {
    local pid=$$
    local parent_pid=$PPID
    
    # 先尝试当前进程
    local session_file=".eket/session_ids/pid_${pid}.id"
    if [ -f "$session_file" ]; then
        cat "$session_file"
        return 0
    fi
    
    # 尝试父进程（如果是在子 shell 中调用）
    session_file=".eket/session_ids/pid_${parent_pid}.id"
    if [ -f "$session_file" ]; then
        cat "$session_file"
        return 0
    fi
    
    # 尝试环境变量
    if [ -n "$EKET_INSTANCE_ID" ]; then
        echo "$EKET_INSTANCE_ID"
        return 0
    fi
    
    echo ""
    return 1
}

# 保存 instance ID 到 session 文件
save_my_instance_id() {
    local instance_id=$1
    local pid=$$
    
    mkdir -p .eket/session_ids
    echo "$instance_id" > ".eket/session_ids/pid_${pid}.id"
    
    # 同时设置环境变量（仅当前 session）
    export EKET_INSTANCE_ID="$instance_id"
}

# 获取当前角色
get_my_role() {
    local instance_id=$(get_my_instance_id)
    
    if [ -z "$instance_id" ]; then
        echo "unknown"
        return 1
    fi
    
    local identity_file=".eket/instances/$instance_id/identity.yml"
    if [ ! -f "$identity_file" ]; then
        echo "unknown"
        return 1
    fi
    
    grep "^role:" "$identity_file" | awk '{print $2}'
}

# 获取当前专长
get_my_specialty() {
    local instance_id=$(get_my_instance_id)
    
    if [ -z "$instance_id" ]; then
        echo "none"
        return 1
    fi
    
    local identity_file=".eket/instances/$instance_id/identity.yml"
    if [ ! -f "$identity_file" ]; then
        echo "none"
        return 1
    fi
    
    grep "^specialty:" "$identity_file" | awk '{print $2}'
}

# 更新心跳
update_heartbeat() {
    local instance_id=$(get_my_instance_id)
    
    if [ -z "$instance_id" ]; then
        return 1
    fi
    
    local instance_dir=".eket/instances/$instance_id"
    if [ ! -d "$instance_dir" ]; then
        return 1
    fi
    
    date +%s > "$instance_dir/heartbeat.txt"
}

# 记录日志
log_action() {
    local action=$1
    local instance_id=$(get_my_instance_id)
    
    if [ -z "$instance_id" ]; then
        return 1
    fi
    
    local log_file=".eket/instances/$instance_id/session.log"
    echo "[$(date -Iseconds)] $action" >> "$log_file"
    
    # 更新心跳
    update_heartbeat
}

# 检查是否为 Master
check_master() {
    local role=$(get_my_role)
    
    if [ "$role" != "master" ]; then
        echo -e "${RED}✗ 错误: 此命令仅限 Master 使用${NC}"
        echo "当前角色: $role"
        return 1
    fi
    
    return 0
}

# 检查是否为 Slaver
check_slaver() {
    local role=$(get_my_role)
    
    if [ "$role" != "slaver" ]; then
        echo -e "${RED}✗ 错误: 此命令仅限 Slaver 使用${NC}"
        echo "当前角色: $role"
        return 1
    fi
    
    return 0
}

# 清理过期的 session 文件（>24 小时）
cleanup_stale_sessions() {
    if [ ! -d ".eket/session_ids" ]; then
        return
    fi
    
    local now=$(date +%s)
    local threshold=$((24 * 3600))  # 24 小时
    
    for session_file in .eket/session_ids/pid_*.id; do
        [ ! -f "$session_file" ] && continue
        
        local modified=$(stat -f "%m" "$session_file" 2>/dev/null || stat -c "%Y" "$session_file" 2>/dev/null)
        local diff=$((now - modified))
        
        if [ $diff -gt $threshold ]; then
            rm -f "$session_file"
        fi
    done
}

# 显示当前实例信息
show_my_info() {
    local instance_id=$(get_my_instance_id)
    
    if [ -z "$instance_id" ]; then
        echo -e "${YELLOW}⚠ 未初始化${NC}"
        echo "运行 /eket-init 初始化"
        return 1
    fi
    
    local role=$(get_my_role)
    local specialty=$(get_my_specialty)
    
    echo -e "${CYAN}实例 ID:${NC} $instance_id"
    echo -e "${CYAN}角色:${NC} $role"
    if [ "$specialty" != "none" ]; then
        echo -e "${CYAN}专长:${NC} $specialty"
    fi
    echo -e "${CYAN}进程 ID:${NC} $$"
}
