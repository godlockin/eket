#!/bin/bash
#
# EKET Slaver 进程注册和心跳脚本 v0.6.0
# 用途：Slaver 进程注册到文件、心跳上传、支持 Redis 备份
#
# 用法：
#   ./scripts/slaver-heartbeat.sh register <slaver-name> <task-id> <port>  - 注册进程
#   ./scripts/slaver-heartbeat.sh heartbeat <slaver-name>                   - 发送心跳
#   ./scripts/slaver-heartbeat.sh status <slaver-name>                      - 查询状态
#   ./scripts/slaver-heartbeat.sh list                                       - 列出所有 Slaver
#   ./scripts/slaver-heartbeat.sh cleanup                                    - 清理超时 Slaver
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# 目录配置
STATE_DIR="$PROJECT_ROOT/.eket/state/slavers"
CONFIG_DIR="$PROJECT_ROOT/.eket/config"
LOGS_DIR="$PROJECT_ROOT/logs"

# 确保目录存在
mkdir -p "$STATE_DIR" "$CONFIG_DIR" "$LOGS_DIR"

# 配置文件
REDIS_CONFIG="$CONFIG_DIR/docker-redis.yml"
SQLITE_CONFIG="$CONFIG_DIR/docker-sqlite.yml"

# 心跳配置
HEARTBEAT_INTERVAL="${HEARTBEAT_INTERVAL:-30}"  # 心跳间隔（秒）
HEARTBEAT_TIMEOUT="${HEARTBEAT_TIMEOUT:-300}"   # 超时阈值（秒）

log() {
    local level="$1"
    local message="$2"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[$timestamp] [$level] $message" >> "$LOGS_DIR/slaver-heartbeat.log"

    case "$level" in
        INFO)  echo -e "${GREEN}[INFO]${NC} $message" ;;
        WARN)  echo -e "${YELLOW}[WARN]${NC} $message" ;;
        ERROR) echo -e "${RED}[ERROR]${NC} $message" ;;
        DEBUG) echo -e "${BLUE}[DEBUG]${NC} $message" ;;
    esac
}

# 获取 Redis 配置
get_redis_config() {
    if [ -f "$REDIS_CONFIG" ]; then
        REDIS_HOST=$(grep "host:" "$REDIS_CONFIG" 2>/dev/null | head -1 | awk '{print $2}' || echo "localhost")
        REDIS_PORT=$(grep "port:" "$REDIS_CONFIG" 2>/dev/null | head -1 | awk '{print $2}' || echo "6380")
        REDIS_PASSWORD=$(grep "password:" "$REDIS_CONFIG" 2>/dev/null | head -1 | awk '{print $2}' || echo "")
        return 0
    fi
    return 1
}

# 获取 SQLite 配置
get_sqlite_config() {
    if [ -f "$SQLITE_CONFIG" ]; then
        SQLITE_DB=$(grep "database:" "$SQLITE_CONFIG" 2>/dev/null | head -1 | awk '{print $2}' || echo "")
        return 0
    fi
    return 1
}

# Redis 命令
redis_cmd() {
    local key="$1"
    local field="$2"
    local value="$3"

    if get_redis_config && command -v redis-cli &>/dev/null; then
        if [ -n "$REDIS_PASSWORD" ]; then
            redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" -a "$REDIS_PASSWORD" "$key" "$field" "$value" &>/dev/null
        else
            redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" "$key" "$field" "$value" &>/dev/null
        fi
    elif get_redis_config && docker ps --filter "name=eket-redis" &>/dev/null; then
        docker exec eket-redis redis-cli -a "$REDIS_PASSWORD" "$key" "$field" "$value" &>/dev/null
    fi
}

# 注册 Slaver 进程
register_slaver() {
    local slaver_name="$1"
    local task_id="$2"
    local port="$3"

    if [ -z "$slaver_name" ]; then
        log ERROR "缺少 slaver_name 参数"
        return 1
    fi

    local pid=$$
    local host=$(hostname)
    local timestamp=$(date -Iseconds)
    local state_file="$STATE_DIR/${slaver_name}.yml"

    log INFO "注册 Slaver 进程..."
    log INFO "  Slaver 名称：$slaver_name"
    log INFO "  任务 ID: ${task_id:-未分配}"
    log INFO "  进程 PID: $pid"
    log INFO "  主机：$host"
    log INFO "  端口：${port:-未指定}"

    # 创建状态文件
    cat > "$state_file" << EOF
# Slaver 进程状态文件
# 创建于：$timestamp

slaver_name: $slaver_name
pid: $pid
task_id: ${task_id:-null}
host: $host
port: ${port:-null}
status: active
started_at: $timestamp
last_heartbeat: $timestamp
heartbeat_count: 0

# 资源配置
resources:
  cpu_usage: 0
  memory_usage: 0

# 元数据
metadata:
  hostname: $host
  username: $(whoami)
  working_dir: $(pwd)
EOF

    log INFO "状态文件已创建：$state_file"

    # 注册到 Redis（如果可用）
    if get_redis_config 2>/dev/null; then
        log INFO "注册到 Redis..."
        redis_cmd HSET "slaver:$slaver_name" "pid" "$pid"
        redis_cmd HSET "slaver:$slaver_name" "task_id" "${task_id:-null}"
        redis_cmd HSET "slaver:$slaver_name" "host" "$host"
        redis_cmd HSET "slaver:$slaver_name" "port" "${port:-null}"
        redis_cmd HSET "slaver:$slaver_name" "status" "active"
        redis_cmd HSET "slaver:$slaver_name" "started_at" "$timestamp"
        redis_cmd HSET "slaver:$slaver_name" "last_heartbeat" "$timestamp"
        redis_cmd EXPIRE "slaver:$slaver_name" "$HEARTBEAT_TIMEOUT"
        log INFO "已注册到 Redis"
    fi

    # 注册到 SQLite（如果可用）
    if get_sqlite_config 2>/dev/null && [ -f "$SQLITE_DB" ]; then
        log INFO "注册到 SQLite..."
        python3 << PYTHON_SCRIPT
import sqlite3
from datetime import datetime

try:
    conn = sqlite3.connect('$SQLITE_DB')
    cursor = conn.cursor()

    cursor.execute('''
        INSERT OR REPLACE INTO slaver_processes
        (slaver_name, pid, task_id, host, port, started_at, last_heartbeat, status, metadata)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (
        '$slaver_name',
        $pid,
        '${task_id}',
        '$host',
        ${port:-null},
        '$timestamp',
        '$timestamp',
        'active',
        '{"hostname": "$host", "username": "$(whoami)", "working_dir": "$(pwd)"}'
    ))

    conn.commit()
    conn.close()
    print("已注册到 SQLite")
except Exception as e:
    print(f"SQLite 注册失败：{e}")
PYTHON_SCRIPT
    fi

    # 发送初始心跳
    send_heartbeat "$slaver_name"

    log INFO "Slaver 注册完成"
}

# 发送心跳
send_heartbeat() {
    local slaver_name="$1"
    local state_file="$STATE_DIR/${slaver_name}.yml"

    if [ ! -f "$state_file" ]; then
        log ERROR "Slaver 未注册：$slaver_name"
        return 1
    fi

    local timestamp=$(date -Iseconds)
    local heartbeat_count=$(grep "heartbeat_count:" "$state_file" 2>/dev/null | cut -d':' -f2 | tr -d ' ' || echo "0")
    heartbeat_count=$((heartbeat_count + 1))

    # 更新状态文件
    sed -i.bak "s/^last_heartbeat:.*/last_heartbeat: $timestamp/" "$state_file"
    sed -i.bak "s/^heartbeat_count:.*/heartbeat_count: $heartbeat_count/" "$state_file"
    rm -f "$state_file.bak"

    # 更新 CPU/内存使用率
    local cpu_usage=$(top -l 1 -s 0 2>/dev/null | grep -E "^CPU" | head -1 || echo "0")
    local memory_usage=$(memory_pressure 2>/dev/null | grep -E "System-wide memory" || echo "0")

    log DEBUG "心跳更新：$slaver_name (count: $heartbeat_count)"

    # 更新到 Redis
    if get_redis_config 2>/dev/null; then
        redis_cmd HSET "slaver:$slaver_name" "last_heartbeat" "$timestamp"
        redis_cmd HSET "slaver:$slaver_name" "heartbeat_count" "$heartbeat_count"
        redis_cmd EXPIRE "slaver:$slaver_name" "$HEARTBEAT_TIMEOUT"
    fi

    # 更新到 SQLite
    if get_sqlite_config 2>/dev/null && [ -f "$SQLITE_DB" ]; then
        python3 << PYTHON_SCRIPT
import sqlite3

try:
    conn = sqlite3.connect('$SQLITE_DB')
    cursor = conn.cursor()
    cursor.execute('''
        UPDATE slaver_processes
        SET last_heartbeat = ?, heartbeat_count = ?
        WHERE slaver_name = ?
    ''', ('$timestamp', $heartbeat_count, '$slaver_name'))
    conn.commit()
    conn.close()
except Exception as e:
    print(f"SQLite 更新失败：{e}")
PYTHON_SCRIPT
    fi
}

# 查询 Slaver 状态
get_status() {
    local slaver_name="$1"
    local state_file="$STATE_DIR/${slaver_name}.yml"

    if [ ! -f "$state_file" ]; then
        log ERROR "Slaver 未注册：$slaver_name"
        return 1
    fi

    echo "========================================"
    echo "Slaver 状态：$slaver_name"
    echo "========================================"
    echo ""
    cat "$state_file"
}

# 列出所有 Slaver
list_slavers() {
    echo "========================================"
    echo "已注册的 Slaver 列表"
    echo "========================================"
    echo ""

    local count=0
    for state_file in "$STATE_DIR"/*.yml; do
        if [ -f "$state_file" ]; then
            local name=$(basename "$state_file" .yml)
            local status=$(grep "^status:" "$state_file" 2>/dev/null | cut -d':' -f2 | tr -d ' ' || echo "unknown")
            local task=$(grep "^task_id:" "$state_file" 2>/dev/null | cut -d':' -f2 | tr -d ' ' || echo "未分配")
            local last_hb=$(grep "^last_heartbeat:" "$state_file" 2>/dev/null | cut -d':' -f2- | tr -d ' ' || echo "无记录")

            echo "  - $name"
            echo "    状态：$status"
            echo "    任务：$task"
            echo "    最后心跳：$last_hb"
            echo ""
            ((count++))
        fi
    done

    if [ $count -eq 0 ]; then
        echo "  暂无注册的 Slaver"
    else
        echo "总计：$count 个 Slaver"
    fi
}

# 清理超时的 Slaver
cleanup_timeout_slavers() {
    log INFO "清理超时 Slaver..."

    local now=$(date +%s)
    local cleaned=0

    for state_file in "$STATE_DIR"/*.yml; do
        if [ -f "$state_file" ]; then
            local slaver_name=$(basename "$state_file" .yml)
            local last_hb=$(grep "^last_heartbeat:" "$state_file" 2>/dev/null | cut -d':' -f2- | tr -d ' ' || echo "")

            if [ -n "$last_hb" ]; then
                local last_ts=$(date -d "$last_hb" +%s 2>/dev/null || echo "0")
                local elapsed=$((now - last_ts))

                if [ "$elapsed" -gt "$HEARTBEAT_TIMEOUT" ]; then
                    log WARN "Slaver $slaver_name 心跳超时 (${elapsed}s > ${HEARTBEAT_TIMEOUT}s)"

                    # 尝试杀死进程
                    local pid=$(grep "^pid:" "$state_file" 2>/dev/null | cut -d':' -f2 | tr -d ' ' || echo "")
                    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
                        log WARN "杀死进程：$pid"
                        kill "$pid" 2>/dev/null || true
                    fi

                    # 从 Redis 删除
                    if get_redis_config 2>/dev/null; then
                        redis_cmd DEL "slaver:$slaver_name"
                    fi

                    # 从 SQLite 删除
                    if get_sqlite_config 2>/dev/null && [ -f "$SQLITE_DB" ]; then
                        python3 -c "
import sqlite3
conn = sqlite3.connect('$SQLITE_DB')
cursor = conn.cursor()
cursor.execute('DELETE FROM slaver_processes WHERE slaver_name = ?', ['$slaver_name'])
conn.commit()
conn.close()
" 2>/dev/null
                    fi

                    # 删除状态文件
                    rm -f "$state_file"
                    log INFO "已清理 Slaver: $slaver_name"
                    ((cleaned++))
                fi
            fi
        fi
    done

    log INFO "清理完成，共清理 $cleaned 个超时 Slaver"
}

# 启动心跳守护进程
start_heartbeat_daemon() {
    local slaver_name="$1"

    if [ -z "$slaver_name" ]; then
        log ERROR "缺少 slaver_name 参数"
        return 1
    fi

    log INFO "启动心跳守护进程..."
    log INFO "  Slaver: $slaver_name"
    log INFO "  间隔：${HEARTBEAT_INTERVAL}秒"

    # 后台运行
    (
        while true; do
            send_heartbeat "$slaver_name" 2>/dev/null || true
            sleep "$HEARTBEAT_INTERVAL"
        done
    ) &

    local daemon_pid=$!
    echo $daemon_pid > "$STATE_DIR/${slaver_name}.daemon.pid"
    log INFO "心跳守护进程已启动 (PID: $daemon_pid)"
}

# 停止心跳守护进程
stop_heartbeat_daemon() {
    local slaver_name="$1"
    local pid_file="$STATE_DIR/${slaver_name}.daemon.pid"

    if [ -f "$pid_file" ]; then
        local pid=$(cat "$pid_file")
        kill "$pid" 2>/dev/null && log INFO "心跳守护进程已停止"
        rm -f "$pid_file"
    fi
}

# 主函数
main() {
    case "${1:-}" in
        register)
            register_slaver "$2" "$3" "$4"
            ;;
        heartbeat)
            send_heartbeat "$2"
            ;;
        status)
            get_status "$2"
            ;;
        list)
            list_slavers
            ;;
        cleanup)
            cleanup_timeout_slavers
            ;;
        start-daemon)
            start_heartbeat_daemon "$2"
            ;;
        stop-daemon)
            stop_heartbeat_daemon "$2"
            ;;
        --help|-h)
            echo "用法：$0 {register|heartbeat|status|list|cleanup|start-daemon|stop-daemon}"
            echo ""
            echo "命令:"
            echo "  register <name> [task-id] [port]  - 注册 Slaver 进程"
            echo "  heartbeat <name>                   - 发送心跳"
            echo "  status <name>                      - 查询状态"
            echo "  list                               - 列出所有 Slaver"
            echo "  cleanup                            - 清理超时 Slaver"
            echo "  start-daemon <name>                - 启动心跳守护进程"
            echo "  stop-daemon <name>                 - 停止心跳守护进程"
            echo ""
            echo "环境变量:"
            echo "  HEARTBEAT_INTERVAL  心跳间隔（默认：30 秒）"
            echo "  HEARTBEAT_TIMEOUT   超时阈值（默认：300 秒）"
            ;;
        *)
            echo "用法：$0 {register|heartbeat|status|list|cleanup|start-daemon|stop-daemon}"
            exit 1
            ;;
    esac
}

main "$@"
