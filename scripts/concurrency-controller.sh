#!/bin/bash
#
# EKET 并发控制器 v0.5.1
# 用途：控制并发 Slaver 数量和任务数量
#
# 用法：
#   ./scripts/concurrency-controller.sh check|acquire|release [slaver_id]
#

# 不使用 set -e，避免在可恢复错误处退出

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
STATE_DIR="$PROJECT_ROOT/.eket/state"
CONFIG_DIR="$PROJECT_ROOT/.eket/config"
LOCK_FILE="$STATE_DIR/concurrency.lock"

# 确保目录存在
mkdir -p "$STATE_DIR"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 加载配置
load_config() {
    local config_file="$CONFIG_DIR/monitoring.yml"

    if [ -f "$config_file" ]; then
        MAX_CONCURRENT_SLAVERS=$(grep "max_concurrent_slavers:" "$config_file" 2>/dev/null | head -1 | awk '{print $2}' || echo "3")
        MAX_CONCURRENT_TASKS=$(grep "max_concurrent_tasks:" "$config_file" 2>/dev/null | head -1 | awk '{print $2}' || echo "5")
    else
        # 默认值
        MAX_CONCURRENT_SLAVERS=3
        MAX_CONCURRENT_TASKS=5
    fi

    log_info "最大并发 Slaver 数：$MAX_CONCURRENT_SLAVERS"
    log_info "最大并发任务数：$MAX_CONCURRENT_TASKS"
}

# 获取文件锁
acquire_lock() {
    local timeout=10
    local start=$(date +%s)

    while [ -f "$LOCK_FILE" ]; do
        local now=$(date +%s)
        local elapsed=$((now - start))

        if [ $elapsed -gt $timeout ]; then
            log_error "获取锁超时 (${timeout}秒)"
            return 1
        fi

        sleep 0.5
    done

    # 创建锁文件
    echo $$ > "$LOCK_FILE"
    return 0
}

# 释放文件锁
release_lock() {
    rm -f "$LOCK_FILE"
}

# 捕获退出信号
cleanup() {
    release_lock
}

trap cleanup EXIT

# 计算当前并发数
count_active_slavers() {
    local count=0

    # 查找活跃的 Slaver 状态文件
    for state_file in "$STATE_DIR"/slaver-*.yml; do
        if [ -f "$state_file" ]; then
            local status=$(grep "status:" "$state_file" 2>/dev/null | head -1 | cut -d':' -f2 | tr -d ' ')
            if [ "$status" = "active" ] || [ "$status" = "working" ]; then
                ((count++))
            fi
        fi
    done

    echo $count
}

# 计算当前任务数
count_active_tasks() {
    local count=0

    # 查找进行中的任务
    for ticket_file in "$PROJECT_ROOT/jira/tickets"/*/*.md; do
        if [ -f "$ticket_file" ]; then
            local status=$(grep "^status:" "$ticket_file" 2>/dev/null | cut -d':' -f2 | tr -d ' ')
            if [ "$status" = "in_progress" ] || [ "$status" = "dev" ]; then
                ((count++))
            fi
        fi
    done

    echo $count
}

# 检查是否可以领取任务
check_can_claim() {
    load_config

    local slaver_count=$(count_active_slavers)
    local task_count=$(count_active_tasks)

    log_info "当前并发 Slaver 数：$slaver_count / $MAX_CONCURRENT_SLAVERS"
    log_info "当前并发任务数：$task_count / $MAX_CONCURRENT_TASKS"

    if [ $slaver_count -ge $MAX_CONCURRENT_SLAVERS ]; then
        log_warn "已达最大并发 Slaver 数限制"
        return 1
    fi

    if [ $task_count -ge $MAX_CONCURRENT_TASKS ]; then
        log_warn "已达最大并发任务数限制"
        return 1
    fi

    log_info "可以领取新任务"
    return 0
}

# 获取并发槽位
acquire_slot() {
    local slaver_id="$1"

    if ! acquire_lock; then
        return 1
    fi

    if ! check_can_claim; then
        release_lock
        return 1
    fi

    # 创建 Slaver 状态文件
    local state_file="$STATE_DIR/slaver-${slaver_id}.yml"
    cat > "$state_file" << EOF
# Slaver 状态文件

slaver_id: $slaver_id
status: active
started_at: $(date -Iseconds)
last_heartbeat: $(date -Iseconds)
EOF

    release_lock
    log_info "Slaver $slaver_id 已获取并发槽位"
    return 0
}

# 释放并发槽位
release_slot() {
    local slaver_id="$1"

    if ! acquire_lock; then
        return 1
    fi

    local state_file="$STATE_DIR/slaver-${slaver_id}.yml"

    if [ -f "$state_file" ]; then
        # 更新状态为 inactive
        sed -i.bak "s/^status:.*$/status: inactive/" "$state_file"
        echo "stopped_at: $(date -Iseconds)" >> "$state_file"
        rm -f "$state_file.bak"

        log_info "Slaver $slaver_id 已释放并发槽位"
    else
        log_warn "Slaver $slaver_id 状态文件不存在"
    fi

    release_lock
    return 0
}

# 等待可用槽位
wait_for_slot() {
    local max_wait_seconds=${1:-300}
    local wait_interval=10
    local waited=0

    log_info "等待可用并发槽位..."

    while [ $waited -lt $max_wait_seconds ]; do
        if check_can_claim; then
            log_info "发现可用槽位"
            return 0
        fi

        log_info "等待 ${wait_interval}秒..."
        sleep $wait_interval
        waited=$((waited + wait_interval))
    done

    log_error "等待槽位超时 (${max_wait_seconds}秒)"
    return 1
}

# 显示当前状态
show_status() {
    load_config

    echo ""
    echo "=== 并发控制状态 ==="
    echo ""
    echo "配置:"
    echo "  最大并发 Slaver 数：$MAX_CONCURRENT_SLAVERS"
    echo "  最大并发任务数：$MAX_CONCURRENT_TASKS"
    echo ""
    echo "当前状态:"
    echo "  活跃 Slaver 数：$(count_active_slavers)"
    echo "  活跃任务数：$(count_active_tasks)"
    echo ""

    # 显示活跃 Slaver
    echo "活跃 Slaver:"
    for state_file in "$STATE_DIR"/slaver-*.yml; do
        if [ -f "$state_file" ]; then
            local slaver_id=$(basename "$state_file" .yml | sed 's/slaver-//')
            local status=$(grep "status:" "$state_file" 2>/dev/null | head -1 | cut -d':' -f2 | tr -d ' ')
            local started=$(grep "started_at:" "$state_file" 2>/dev/null | cut -d':' -f2- | tr -d ' ')
            echo "  - $slaver_id: $status (从 $started)"
        fi
    done
    echo ""
}

# 主函数
main() {
    local action="${1:-status}"
    local slaver_id="${2:-}"

    case "$action" in
        check)
            check_can_claim
            ;;
        acquire)
            if [ -z "$slaver_id" ]; then
                log_error "需要指定 slaver_id"
                exit 1
            fi
            acquire_slot "$slaver_id"
            ;;
        release)
            if [ -z "$slaver_id" ]; then
                log_error "需要指定 slaver_id"
                exit 1
            fi
            release_slot "$slaver_id"
            ;;
        wait)
            wait_for_slot "${2:-300}"
            ;;
        status)
            show_status
            ;;
        *)
            echo "用法：$0 {check|acquire|release|wait|status} [slaver_id]"
            exit 1
            ;;
    esac
}

main "$@"
