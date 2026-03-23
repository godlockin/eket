#!/bin/bash
# EKET 任务时间追踪和超时重制机制 v0.5
# 实现任务时间追踪、超时监控、状态重置

set -e

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

# 配置文件
CONFIG_FILE=".eket/config.yml"
STATE_DIR=".eket/state"
TASK_STATE_FILE="$STATE_DIR/task-timing.yml"

# ==========================================
# 读取配置
# ==========================================

read_config() {
    if [ -f "$CONFIG_FILE" ]; then
        TIMEOUT_MINUTES=$(grep "timeout_minutes:" "$CONFIG_FILE" | head -1 | cut -d':' -f2 | tr -d ' ' || echo "180")
        NO_RESPONSE_MINUTES=$(grep "no_response_timeout_minutes:" "$CONFIG_FILE" | cut -d':' -f2 | tr -d ' ' || echo "30")
        DEFAULT_ESTIMATED=$(grep "default_estimated_minutes:" "$CONFIG_FILE" | cut -d':' -f2 | tr -d ' ' || echo "120")
    else
        TIMEOUT_MINUTES=180
        NO_RESPONSE_MINUTES=30
        DEFAULT_ESTIMATED=120
    fi
}

# ==========================================
# 任务开始计时
# ==========================================

start_task_timer() {
    local ticket_id="$1"
    local slaver_name="$2"
    local estimated_minutes="${3:-$DEFAULT_ESTIMATED}"

    local now=$(date -Iseconds)
    local deadline=$(date -Iseconds -d "+$estimated_minutes minutes" 2>/dev/null || date -v+${estimated_minutes}M -Iseconds 2>/dev/null || echo "")

    local ticket_file=$(find_jira_ticket "$ticket_id")

    if [ ! -f "$ticket_file" ]; then
        echo -e "${RED}✗${NC} 未找到任务文件：$ticket_id"
        return 1
    fi

    # 更新 ticket 时间信息
    update_ticket_time "$ticket_file" "$slaver_name" "$now" "$deadline" "$estimated_minutes"

    echo -e "${GREEN}✓${NC} 任务计时开始"
    echo "  - Ticket: $ticket_id"
    echo "  - Slaver: $slaver_name"
    echo "  - 开始时间：$now"
    echo "  - 截止时间：$deadline"
    echo "  - 预估时长：$estimated_minutes 分钟"

    # 记录到状态文件
    record_task_state "$ticket_id" "$slaver_name" "$now" "$deadline"
}

# ==========================================
# 更新任务心跳
# ==========================================

update_heartbeat() {
    local ticket_id="$1"
    local slaver_name="$2"
    local update_message="${3:-}"

    local now=$(date -Iseconds)
    local ticket_file=$(find_jira_ticket "$ticket_id")

    if [ ! -f "$ticket_file" ]; then
        echo -e "${RED}✗${NC} 未找到任务文件：$ticket_id"
        return 1
    fi

    # 更新最后更新时间
    if grep -q "最后更新:" "$ticket_file"; then
        sed -i '' "s/最后更新:.*/最后更新：$now/" "$ticket_file" 2>/dev/null || \
        sed -i "s/最后更新:.*/最后更新：$now/" "$ticket_file"
    else
        # 如果没有字段，添加
        echo "- **最后更新**: $now" >> "$ticket_file"
    fi

    # 更新心跳
    if grep -q "最后心跳:" "$ticket_file"; then
        sed -i '' "s/最后心跳:.*/最后心跳：$now/" "$ticket_file" 2>/dev/null || \
        sed -i "s/最后心跳:.*/最后心跳：$now/" "$ticket_file"
    else
        echo "- **最后心跳**: $now" >> "$ticket_file"
    fi

    # 记录执行日志
    if [ -n "$update_message" ]; then
        append_execution_log "$ticket_file" "$now" "$slaver_name" "$update_message"
    fi

    # 更新状态文件
    update_task_state "$ticket_id" "$now"

    echo -e "${GREEN}✓${NC} 心跳更新：$ticket_id @ $now"
}

# ==========================================
# 超时检查
# ==========================================

check_task_timeout() {
    local ticket_id="$1"
    local ticket_file=$(find_jira_ticket "$ticket_id")

    if [ ! -f "$ticket_file" ]; then
        return 0
    fi

    # 读取任务状态
    local status=$(grep "^status:" "$ticket_file" | cut -d' ' -f2 | tr -d ' ')
    local slaver=$(grep "^slaver:" "$ticket_file" | cut -d':' -f2 | tr -d ' ' || echo "")

    if [ "$status" != "in_progress" ] && [ "$status" != "dev" ]; then
        return 0
    fi

    # 读取时间信息
    local deadline=$(grep "截止时间:" "$ticket_file" | cut -d':' -f2- | tr -d ' ')
    local last_heartbeat=$(grep "最后心跳:" "$ticket_file" | cut -d':' -f2- | tr -d ' ')

    local now_ts=$(date +%s)
    local deadline_ts=$(date -d "$deadline" +%s 2>/dev/null || date -j -f "%Y-%m-%dT%H:%M:%S" "$deadline" +%s 2>/dev/null || echo 0)
    local heartbeat_ts=$(date -d "$last_heartbeat" +%s 2>/dev/null || date -j -f "%Y-%m-%dT%H:%M:%S" "$last_heartbeat" +%s 2>/dev/null || echo 0)

    # 检查是否超时
    local elapsed_minutes=$(( (now_ts - heartbeat_ts) / 60 ))
    local remaining_minutes=$(( (deadline_ts - now_ts) / 60 ))

    if [ "$remaining_minutes" -lt 0 ]; then
        echo -e "${RED}⚠${NC} 任务已超时：$ticket_id"
        echo "  - Slaver: $slaver"
        echo "  - 超时时长：$((- remaining_minutes)) 分钟"
        handle_timeout "$ticket_id" "$slaver" "$elapsed_minutes"
        return 1
    elif [ "$remaining_minutes" -lt 15 ]; then
        echo -e "${YELLOW}⚠${NC} 任务即将超时：$ticket_id"
        echo "  - 剩余时间：$remaining_minutes 分钟"
        create_timeout_warning "$ticket_id" "$slaver" "$remaining_minutes"
    fi

    # 检查无响应
    if [ "$elapsed_minutes" -gt "$NO_RESPONSE_MINUTES" ]; then
        echo -e "${RED}⚠${NC} 任务无响应超时：$ticket_id"
        echo "  - Slaver: $slaver"
        echo "  - 无响应时长：$elapsed_minutes 分钟"
        handle_no_response "$ticket_id" "$slaver" "$elapsed_minutes"
        return 1
    fi

    return 0
}

# ==========================================
# 超时处理
# ==========================================

handle_timeout() {
    local ticket_id="$1"
    local slaver="$2"
    local elapsed="$3"

    # 检查 Slaver 是否存活
    if slaver_is_alive "$slaver"; then
        echo -e "${YELLOW}⚠${NC} Slaver 存活但任务超时，需要更新 ticket 或请求仲裁"
        create_arbitration_request "$ticket_id" "$slaver" "$elapsed"
    else
        echo -e "${RED}⚠${NC} Slaver 无响应，重置任务状态"
        reset_ticket_status "$ticket_id"
    fi
}

handle_no_response() {
    local ticket_id="$1"
    local slaver="$2"
    local elapsed="$3"

    # 检查 Slaver 是否存活
    if slaver_is_alive "$slaver"; then
        echo -e "${YELLOW}⚠${NC} Slaver 存活但无响应"
        send_heartbeat_request "$slaver" "$ticket_id"
    else
        echo -e "${RED}⚠${NC} Slaver 无响应，重置任务状态"
        reset_ticket_status "$ticket_id"
    fi
}

# ==========================================
# 重置任务状态
# ==========================================

reset_ticket_status() {
    local ticket_id="$1"
    local ticket_file=$(find_jira_ticket "$ticket_id")

    if [ ! -f "$ticket_file" ]; then
        echo -e "${RED}✗${NC} 未找到任务文件：$ticket_id"
        return 1
    fi

    # 重置状态
    sed -i '' "s/status: in_progress/status: ready/" "$ticket_file" 2>/dev/null || \
    sed -i "s/status: in_progress/status: ready/" "$ticket_file"

    sed -i '' "s/status: dev/status: ready/" "$ticket_file" 2>/dev/null || \
    sed -i "s/status: dev/status: ready/" "$ticket_file"

    # 移除归属
    sed -i '' "s/负责人: .*/负责人: /" "$ticket_file" 2>/dev/null || \
    sed -i "s/负责人: .*/负责人: /" "$ticket_file"

    sed -i '' "s/Slaver: .*/Slaver: /" "$ticket_file" 2>/dev/null || \
    sed -i "s/Slaver: .*/Slaver: /" "$ticket_file"

    echo -e "${GREEN}✓${NC} 任务状态已重置：$ticket_id"
    echo "  - 新状态：ready"
    echo "  - 负责人：(空)"

    # 创建通知
    create_reset_notification "$ticket_id"
}

# ==========================================
# Slaver 存活检查
# ==========================================

slaver_is_alive() {
    local slaver="$1"
    local heartbeat_file="$STATE_DIR/slaver-heartbeat.yml"

    if [ ! -f "$heartbeat_file" ]; then
        return 1
    fi

    # 检查 Slaver 最近心跳
    local last_seen=$(grep -A 3 "$slaver:" "$heartbeat_file" | grep "last_seen:" | cut -d':' -f2- | tr -d ' ')

    if [ -z "$last_seen" ] || [ "$last_seen" = "null" ]; then
        return 1
    fi

    local now_ts=$(date +%s)
    local seen_ts=$(date -d "$last_seen" +%s 2>/dev/null || date -j -f "%Y-%m-%dT%H:%M:%S" "$last_seen" +%s 2>/dev/null || echo 0)
    local diff_minutes=$(( (now_ts - seen_ts) / 60 ))

    if [ "$diff_minutes" -gt 5 ]; then
        return 1
    fi

    return 0
}

# ==========================================
# Slaver 复活检查
# ==========================================

slaver_revive_check() {
    local slaver="$1"
    local ticket_id="$2"
    local ticket_file=$(find_jira_ticket "$ticket_id")

    if [ ! -f "$ticket_file" ]; then
        return 0
    fi

    # 读取任务状态
    local status=$(grep "^status:" "$ticket_file" | cut -d' ' -f2 | tr -d ' ')
    local assigned=$(grep "^负责人:" "$ticket_file" | cut -d':' -f2 | tr -d ' ')

    # 如果状态被更改或负责人被改变，放弃任务
    if [ "$status" != "in_progress" ] && [ "$status" != "dev" ]; then
        echo -e "${YELLOW}⚠${NC} 任务状态已变更，Slaver 应放弃任务"
        echo "  - 当前状态：$status"
        echo "  - 原负责人：$assigned"
        return 1
    fi

    if [ "$assigned" != "$slaver" ] && [ -n "$assigned" ]; then
        echo -e "${YELLOW}⚠${NC} 任务已被分配给其他 Slaver，当前 Slaver 应放弃"
        return 1
    fi

    return 0
}

# ==========================================
# 辅助函数
# ==========================================

find_jira_ticket() {
    local ticket_id="$1"
    find jira/tickets -name "*${ticket_id}*" -o -name "${ticket_id}.md" 2>/dev/null | head -1
}

update_ticket_time() {
    local ticket_file="$1"
    local slaver="$2"
    local start_time="$3"
    local deadline="$4"
    local estimated="$5"

    # 更新时间字段
    if grep -q "开始时间:" "$ticket_file"; then
        sed -i '' "s/开始时间:.*/开始时间：$start_time/" "$ticket_file" 2>/dev/null || \
        sed -i "s/开始时间:.*/开始时间：$start_time/" "$ticket_file"
    fi

    if grep -q "截止时间:" "$ticket_file"; then
        sed -i '' "s/截止时间:.*/截止时间：$deadline/" "$ticket_file" 2>/dev/null || \
        sed -i "s/截止时间:.*/截止时间：$deadline/" "$ticket_file"
    fi

    if grep -q "预估时间:" "$ticket_file"; then
        sed -i '' "s/预估时间:.*/预估时间：$estimated 分钟/" "$ticket_file" 2>/dev/null || \
        sed -i "s/预估时间:.*/预估时间：$estimated 分钟/" "$ticket_file"
    fi
}

record_task_state() {
    local ticket_id="$1"
    local slaver="$2"
    local start_time="$3"
    local deadline="$4"

    mkdir -p "$STATE_DIR"
    echo "$ticket_id:$slaver:$start_time:$deadline" >> "$STATE_DIR/active-tasks.log"
}

update_task_state() {
    local ticket_id="$1"
    local now="$2"

    # 更新状态文件中的时间戳
    if [ -f "$STATE_DIR/active-tasks.log" ]; then
        grep -v "^$ticket_id:" "$STATE_DIR/active-tasks.log" > "$STATE_DIR/active-tasks.tmp" || true
        mv "$STATE_DIR/active-tasks.tmp" "$STATE_DIR/active-tasks.log"
    fi
}

append_execution_log() {
    local ticket_file="$1"
    local timestamp="$2"
    local slaver="$3"
    local message="$4"

    # 在执行日志部分添加记录
    if grep -q "## 执行日志" "$ticket_file"; then
        sed -i '' "/## 执行日志/a\\- [$timestamp] $slaver: $message" "$ticket_file" 2>/dev/null || \
        sed -i "/## 执行日志/a\\- [$timestamp] $slaver: $message" "$ticket_file"
    fi
}

create_timeout_warning() {
    local ticket_id="$1"
    local slaver="$2"
    local remaining="$3"

    local alert_file="inbox/human_feedback/timeout-warning-$(date +%Y%m%d-%H%M%S).md"
    cat > "$alert_file" << EOF
# 超时警告

**任务**: $ticket_id
**Slaver**: $slaver
**剩余时间**: $remaining 分钟

请 Slaver 注意时间，尽快完成任务或请求延期。
EOF
}

create_arbitration_request() {
    local ticket_id="$1"
    local slaver="$2"
    local elapsed="$3"

    local alert_file="inbox/human_feedback/arbitration-request-$(date +%Y%m%d-%H%M%S).md"
    cat > "$alert_file" << EOF
# 仲裁请求

**任务**: $ticket_id
**Slaver**: $slaver
**已运行时长**: $elapsed 分钟

Slaver 已超时但仍存活，需要：
1. 更新 ticket 说明进度
2. 添加依赖资源请求
3. 或请求 Master 仲裁决策
EOF
}

send_heartbeat_request() {
    local slaver="$1"
    local ticket_id="$2"

    local alert_file="inbox/human_feedback/heartbeat-request-$(date +%Y%m%d-%H%M%S).md"
    cat > "$alert_file" << EOF
# 心跳请求

**Slaver**: $slaver
**任务**: $ticket_id

超过 $NO_RESPONSE_MINUTES 分钟未收到心跳，请 Slaver 立即响应。
EOF
}

create_reset_notification() {
    local ticket_id="$1"

    local alert_file="inbox/human_feedback/task-reset-$(date +%Y%m%d-%H%M%S).md"
    cat > "$alert_file" << EOF
# 任务重置通知

**任务**: $ticket_id

任务已因超时/无响应被重置：
- 状态：ready
- 负责人：(空)

其他 Slaver 可以重新领取此任务。
EOF
}

# ==========================================
# 主循环 - Master 监控
# ==========================================

master_monitor_loop() {
    echo -e "${BLUE}## 启动 Master 任务监控${NC}"

    while true; do
        for ticket_file in jira/tickets/*/*.md; do
            if [ -f "$ticket_file" ]; then
                local ticket_id=$(basename "$ticket_file" .md)
                check_task_timeout "$ticket_id"
            fi
        done

        sleep 60  # 每分钟检查一次
    done
}

# ==========================================
# 入口
# ==========================================

read_config

case "${1:-}" in
    start)
        start_task_timer "$2" "$3" "$4"
        ;;
    heartbeat)
        update_heartbeat "$2" "$3" "$4"
        ;;
    check)
        check_task_timeout "$2"
        ;;
    revive)
        slaver_revive_check "$2" "$3"
        ;;
    reset)
        reset_ticket_status "$2"
        ;;
    monitor)
        master_monitor_loop
        ;;
    *)
        echo "用法：$0 <command> [args]"
        echo ""
        echo "命令:"
        echo "  start <ticket_id> <slaver_name> [estimated_minutes]  - 开始任务计时"
        echo "  heartbeat <ticket_id> <slaver_name> [message]        - 更新心跳"
        echo "  check <ticket_id>                                     - 检查超时"
        echo "  revive <slaver_name> <ticket_id>                      - Slaver 复活检查"
        echo "  reset <ticket_id>                                     - 重置任务状态"
        echo "  monitor                                               - 启动 Master 监控"
        ;;
esac
