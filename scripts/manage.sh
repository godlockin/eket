#!/bin/bash
# EKET 框架管理脚本

# 不使用 set -e，避免在可恢复错误处退出

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# PID 文件目录
PID_DIR="$ROOT_DIR/.pids"

# 显示使用方法
show_usage() {
    echo "用法：$0 <command> [options]"
    echo ""
    echo "命令:"
    echo "  status              显示所有智能体状态"
    echo "  agents              列出已注册的智能体"
    echo "  wake <agent>        唤醒指定智能体"
    echo "  sleep <agent>       使指定智能体休眠"
    echo "  restart <agent>     重启指定智能体"
    echo "  logs <agent>        查看智能体日志"
    echo "  queue               显示消息队列状态"
    echo "  tickets             显示 Jira tickets 状态"
    echo "  clean               清理临时文件"
    echo ""
    echo "示例:"
    echo "  $0 status                    # 显示状态"
    echo "  $0 wake requirement_analyst  # 唤醒智能体"
    echo "  $0 logs scheduler            # 查看日志"
    echo "  $0 queue                     # 查看消息队列"
    echo ""
}

# 显示智能体状态
show_status() {
    echo "========================================"
    echo "智能体运行状态"
    echo "========================================"
    echo ""

    if [ -d "$PID_DIR" ]; then
        for pid_file in "$PID_DIR"/*.pid; do
            if [ -f "$pid_file" ]; then
                name=$(basename "$pid_file" .pid)
                pid=$(cat "$pid_file")

                if ps -p "$pid" > /dev/null 2>&1; then
                    echo -e "${GREEN}●${NC} $name (PID: $pid)"
                else
                    echo -e "${RED}○${NC} $name (PID: $pid) - 已停止"
                fi
            fi
        done
    else
        echo "没有运行的服务"
    fi

    echo ""
    echo "========================================"
    echo "消息队列状态"
    echo "========================================"
    echo ""

    queue_dir="$ROOT_DIR/shared/message_queue"

    if [ -d "$queue_dir" ]; then
        inbox_count=$(find "$queue_dir/inbox" -name "*.json" 2>/dev/null | wc -l | tr -d ' ')
        outbox_count=$(find "$queue_dir/outbox" -name "*.json" 2>/dev/null | wc -l | tr -d ' ')
        broadcast_count=$(find "$queue_dir/broadcast" 2>/dev/null | wc -l | tr -d ' ')

        echo "  Inbox:     $inbox_count 消息"
        echo "  Outbox:    $outbox_count 消息"
        echo "  Broadcast: $broadcast_count 消息"
    else
        echo "  消息队列未初始化"
    fi

    echo ""
}

# 列出已注册的智能体
list_agents() {
    echo "========================================"
    echo "已注册的智能体"
    echo "========================================"
    echo ""

    # 从配置文件读取
    config_file="$ROOT_DIR/config/system.yml"

    if [ -f "$config_file" ]; then
        echo "协调智能体:"
        grep -A 10 "coordinators:" "$config_file" | grep "name:" | sed 's/.*- name: "/  - /' | sed 's/"$//'

        echo ""
        echo "执行智能体:"
        grep -A 30 "executors:" "$config_file" | grep "name:" | sed 's/.*- name: "/  - /' | sed 's/"$//'
    else
        echo "配置文件不存在：$config_file"
    fi

    echo ""
}

# 唤醒智能体
wake_agent() {
    local agent_name="$1"

    if [ -z "$agent_name" ]; then
        echo "错误：请指定智能体名称"
        exit 1
    fi

    # 创建唤醒消息
    timestamp=$(date -Iseconds)
    msg_id="msg_$(date +%Y%m%d%H%M%S)"

    inbox_dir="$ROOT_DIR/shared/message_queue/inbox"
    mkdir -p "$inbox_dir"

    cat > "$inbox_dir/${msg_id}.json" << EOF
{
  "id": "$msg_id",
  "timestamp": "$timestamp",
  "from": "admin",
  "to": "$agent_name",
  "type": "wake_up",
  "priority": "high",
  "payload": {}
}
EOF

    echo -e "${GREEN}✓${NC} 已发送唤醒消息给 $agent_name"
}

# 使智能体休眠
sleep_agent() {
    local agent_name="$1"

    if [ -z "$agent_name" ]; then
        echo "错误：请指定智能体名称"
        exit 1
    fi

    # 创建休眠消息
    timestamp=$(date -Iseconds)
    msg_id="msg_$(date +%Y%m%d%H%M%S)"

    inbox_dir="$ROOT_DIR/shared/message_queue/inbox"
    mkdir -p "$inbox_dir"

    cat > "$inbox_dir/${msg_id}.json" << EOF
{
  "id": "$msg_id",
  "timestamp": "$timestamp",
  "from": "admin",
  "to": "$agent_name",
  "type": "shutdown",
  "priority": "high",
  "payload": {}
}
EOF

    echo -e "${GREEN}✓${NC} 已发送休眠消息给 $agent_name"
}

# 重启智能体
restart_agent() {
    local agent_name="$1"

    if [ -z "$agent_name" ]; then
        echo "错误：请指定智能体名称"
        exit 1
    fi

    pid_file="$PID_DIR/${agent_name}.pid"

    # 停止
    if [ -f "$pid_file" ]; then
        pid=$(cat "$pid_file")
        if ps -p "$pid" > /dev/null 2>&1; then
            kill "$pid" 2>/dev/null || true
            echo -e "${YELLOW}~${NC} $agent_name 停止中..."
            sleep 1
        fi
        rm "$pid_file"
    fi

    # 启动
    echo -e "${GREEN}✓${NC} $agent_name 已重启"
    wake_agent "$agent_name"
}

# 查看日志
view_logs() {
    local agent_name="$1"
    local lines="${2:-50}"

    if [ -z "$agent_name" ]; then
        echo "错误：请指定智能体名称"
        exit 1
    fi

    log_file="$ROOT_DIR/logs/agents/${agent_name}.log"

    if [ ! -f "$log_file" ]; then
        log_file="$ROOT_DIR/logs/${agent_name}.log"
    fi

    if [ -f "$log_file" ]; then
        echo "=== 日志：$agent_name (最后 $lines 行) ==="
        echo ""
        tail -n "$lines" "$log_file"
    else
        echo "日志文件不存在：$log_file"
    fi
}

# 显示消息队列
show_queue() {
    echo "========================================"
    echo "消息队列详情"
    echo "========================================"
    echo ""

    queue_dir="$ROOT_DIR/shared/message_queue"

    if [ -d "$queue_dir" ]; then
        echo "Inbox (待处理消息):"
        echo "----------------------------------------"
        for msg_file in "$queue_dir/inbox"/*.json; do
            if [ -f "$msg_file" ]; then
                to=$(cat "$msg_file" | grep -o '"to": "[^"]*"' | cut -d'"' -f4)
                type=$(cat "$msg_file" | grep -o '"type": "[^"]*"' | cut -d'"' -f4)
                echo "  → $to : $type"
            fi
        done

        echo ""
        echo "Outbox (已发送消息):"
        echo "----------------------------------------"
        for msg_file in "$queue_dir/outbox"/*.json; do
            if [ -f "$msg_file" ]; then
                to=$(cat "$msg_file" | grep -o '"to": "[^"]*"' | cut -d'"' -f4)
                type=$(cat "$msg_file" | grep -o '"type": "[^"]*"' | cut -d'"' -f4)
                echo "  ← $to : $type"
            fi
        done

        echo ""
        echo "Broadcast (广播消息):"
        echo "----------------------------------------"
        bc_count=$(find "$queue_dir/broadcast" -name "*.json" 2>/dev/null | wc -l | tr -d ' ')
        echo "  $bc_count 条广播消息"
    else
        echo "消息队列目录不存在"
    fi

    echo ""
}

# 显示 Jira tickets
show_tickets() {
    echo "========================================"
    echo "Jira Tickets"
    echo "========================================"
    echo ""

    tickets_dir="$ROOT_DIR/shared/jira/tickets"

    if [ -d "$tickets_dir" ]; then
        for ticket_file in "$tickets_dir"/*.json; do
            if [ -f "$ticket_file" ]; then
                id=$(cat "$ticket_file" | grep -o '"id": "[^"]*"' | cut -d'"' -f4)
                title=$(cat "$ticket_file" | grep -o '"title": "[^"]*"' | cut -d'"' -f4)
                status=$(cat "$ticket_file" | grep -o '"status": "[^"]*"' | cut -d'"' -f4)
                echo "  [$id] $title"
                echo "       状态：$status"
                echo ""
            fi
        done
    else
        echo "Tickets 目录不存在"
    fi
}

# 清理临时文件
clean() {
    echo "清理临时文件..."

    # 清理过期的消息文件
    queue_dir="$ROOT_DIR/shared/message_queue"
    if [ -d "$queue_dir" ]; then
        find "$queue_dir" -name "*.json" -mmin +60 -delete 2>/dev/null || true
        echo -e "${GREEN}✓${NC} 清理过期消息"
    fi

    # 清理日志（保留最近 7 天）
    logs_dir="$ROOT_DIR/logs"
    if [ -d "$logs_dir" ]; then
        find "$logs_dir" -name "*.log" -mtime +7 -delete 2>/dev/null || true
        echo -e "${GREEN}✓${NC} 清理旧日志"
    fi

    # 清理 PID 文件
    if [ -d "$PID_DIR" ]; then
        for pid_file in "$PID_DIR"/*.pid; do
            if [ -f "$pid_file" ]; then
                pid=$(cat "$pid_file")
                if ! ps -p "$pid" > /dev/null 2>&1; then
                    rm "$pid_file"
                fi
            fi
        done
        echo -e "${GREEN}✓${NC} 清理无效 PID"
    fi

    echo -e "${GREEN}完成${NC}"
}

# 主流程
main() {
    case "${1:-}" in
        status)
            show_status
            ;;
        agents)
            list_agents
            ;;
        wake)
            wake_agent "$2"
            ;;
        sleep)
            sleep_agent "$2"
            ;;
        restart)
            restart_agent "$2"
            ;;
        logs)
            view_logs "$2" "${3:-50}"
            ;;
        queue)
            show_queue
            ;;
        tickets)
            show_tickets
            ;;
        clean)
            clean
            ;;
        *)
            show_usage
            ;;
    esac
}

main "$@"
