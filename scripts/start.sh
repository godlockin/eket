#!/bin/bash
# EKET 框架启动脚本

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# PID 文件目录
PID_DIR="$ROOT_DIR/.pids"
mkdir -p "$PID_DIR"

# 启动协调智能体小组
start_coordinators() {
    echo "启动顶层协调智能体小组..."

    coordinators=(
        "requirement_analyst"
        "tech_manager"
        "project_manager"
        "doc_monitor"
    )

    for agent in "${coordinators[@]}"; do
        start_agent "$agent" "coordinator"
    done

    echo -e "${GREEN}✓${NC} 协调智能体小组已启动"
}

# 启动单个智能体
start_agent() {
    local agent_name="$1"
    local agent_type="${2:-executor}"

    pid_file="$PID_DIR/${agent_name}.pid"

    # 检查是否已在运行
    if [ -f "$pid_file" ]; then
        pid=$(cat "$pid_file")
        if ps -p "$pid" > /dev/null 2>&1; then
            echo -e "${YELLOW}⚠${NC} $agent_name 已在运行 (PID: $pid)"
            return 0
        fi
    fi

    # 启动 Python 进程
    cd "$ROOT_DIR"
    nohup python3 -c "
import sys
sys.path.insert(0, '$ROOT_DIR')
from agents.runtime.agent_process import AgentProcess, AgentConfig

config = AgentConfig(
    name='$agent_name',
    agent_type='$agent_type',
    capabilities=['$agent_name'],
    lifecycle_mode='persistent',
    spawn_method='process',
    wakeup_triggers=[],
    decision_policy={'auto_decide': True}
)

# 这里需要实际的智能体实现
# 目前仅作为占位启动
print(f'Starting agent: $agent_name')
" > "$ROOT_DIR/logs/agents/${agent_name}.log" 2>&1 &

    echo $! > "$pid_file"
    echo -e "${GREEN}✓${NC} $agent_name 已启动 (PID: $!)"
}

# 启动调度器
start_scheduler() {
    echo "启动主调度器..."

    pid_file="$PID_DIR/scheduler.pid"

    if [ -f "$pid_file" ]; then
        pid=$(cat "$pid_file")
        if ps -p "$pid" > /dev/null 2>&1; then
            echo -e "${YELLOW}⚠${NC} 调度器已在运行 (PID: $pid)"
            return 0
        fi
    fi

    cd "$ROOT_DIR"
    nohup python3 -c "
import sys
sys.path.insert(0, '$ROOT_DIR')
from runtime.scheduler.main_scheduler import get_scheduler
from pathlib import Path

scheduler = get_scheduler(Path('$ROOT_DIR'))
scheduler.start()

# 保持运行
import time
while True:
    time.sleep(1)
" > "$ROOT_DIR/logs/scheduler.log" 2>&1 &

    echo $! > "$pid_file"
    echo -e "${GREEN}✓${NC} 调度器已启动 (PID: $!)"
}

# 启动消息总线
start_message_bus() {
    echo "启动消息总线..."

    pid_file="$PID_DIR/message_bus.pid"

    if [ -f "$pid_file" ]; then
        pid=$(cat "$pid_file")
        if ps -p "$pid" > /dev/null 2>&1; then
            echo -e "${YELLOW}⚠${NC} 消息总线已在运行 (PID: $pid)"
            return 0
        fi
    fi

    cd "$ROOT_DIR"
    nohup python3 -c "
import sys
sys.path.insert(0, '$ROOT_DIR')
from agents.runtime.message_bus import MessageBus
from pathlib import Path

message_bus = MessageBus(Path('$ROOT_DIR'))

# 保持运行
import time
while True:
    message_bus.process_messages('scheduler')
    time.sleep(1)
" > "$ROOT_DIR/logs/message_bus.log" 2>&1 &

    echo $! > "$pid_file"
    echo -e "${GREEN}✓${NC} 消息总线已启动 (PID: $!)"
}

# 显示使用方法
show_usage() {
    echo "用法：$0 [command] [options]"
    echo ""
    echo "命令:"
    echo "  coordinator    启动顶层协调智能体小组"
    echo "  scheduler      启动主调度器"
    echo "  message-bus    启动消息总线"
    echo "  all            启动所有服务（默认）"
    echo "  status         显示运行状态"
    echo ""
    echo "选项:"
    echo "  --agent NAME   启动指定智能体"
    echo ""
    echo "示例:"
    echo "  $0 all                     # 启动所有服务"
    echo "  $0 coordinator             # 仅启动协调智能体"
    echo "  $0 --agent frontend_dev    # 启动指定智能体"
    echo ""
}

# 显示状态
show_status() {
    echo "========================================"
    echo "EKET 运行状态"
    echo "========================================"
    echo ""

    # 检查 PID 文件
    if [ -d "$PID_DIR" ]; then
        for pid_file in "$PID_DIR"/*.pid; do
            if [ -f "$pid_file" ]; then
                name=$(basename "$pid_file" .pid)
                pid=$(cat "$pid_file")

                if ps -p "$pid" > /dev/null 2>&1; then
                    echo -e "${GREEN}✓${NC} $name (PID: $pid) - 运行中"
                else
                    echo -e "${RED}✗${NC} $name (PID: $pid) - 已停止"
                fi
            fi
        done
    else
        echo "没有运行的服务"
    fi

    echo ""
}

# 停止服务
stop_service() {
    local name="$1"
    pid_file="$PID_DIR/${name}.pid"

    if [ -f "$pid_file" ]; then
        pid=$(cat "$pid_file")
        if ps -p "$pid" > /dev/null 2>&1; then
            kill "$pid"
            echo -e "${GREEN}✓${NC} $name 已停止"
        fi
        rm "$pid_file"
    fi
}

# 主流程
main() {
    case "${1:-all}" in
        coordinator)
            start_coordinators
            ;;
        scheduler)
            start_scheduler
            ;;
        message-bus)
            start_message_bus
            ;;
        all)
            start_message_bus
            start_scheduler
            start_coordinators
            echo ""
            echo -e "${GREEN}========================================${NC}"
            echo -e "${GREEN}所有服务已启动${NC}"
            echo -e "${GREEN}========================================${NC}"
            ;;
        status)
            show_status
            ;;
        stop)
            echo "停止所有服务..."
            for pid_file in "$PID_DIR"/*.pid; do
                if [ -f "$pid_file" ]; then
                    name=$(basename "$pid_file" .pid)
                    stop_service "$name"
                fi
            done
            ;;
        --agent)
            if [ -n "$2" ]; then
                start_agent "$2" "executor"
            else
                echo "错误：请指定智能体名称"
                show_usage
                exit 1
            fi
            ;;
        *)
            show_usage
            ;;
    esac
}

main "$@"
