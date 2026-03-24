#!/bin/bash
#
# EKET Docker Redis 容器管理脚本 v0.6.0
# 用途：启动/停止/管理 Redis 容器，用于 Slaver 心跳存储
#
# 用法：
#   ./scripts/docker-redis.sh start    - 启动 Redis 容器
#   ./scripts/docker-redis.sh stop     - 停止 Redis 容器
#   ./scripts/docker-redis.sh restart  - 重启 Redis 容器
#   ./scripts/docker-redis.sh status   - 查看容器状态
#   ./scripts/docker-redis.sh logs     - 查看容器日志
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

# 容器配置
CONTAINER_NAME="eket-redis"
IMAGE_NAME="redis:7-alpine"

# 数据卷配置
DATA_DIR="$PROJECT_ROOT/.eket/data/redis"
mkdir -p "$DATA_DIR"

# 端口配置（可从配置文件读取）
PORT="${REDIS_PORT:-6380}"
PASSWORD="${REDIS_PASSWORD:-eket_redis_2026}"

# Redis 配置文件
REDIS_CONFIG="$DATA_DIR/redis.conf"

log() {
    local level="$1"
    local message="$2"
    case "$level" in
        INFO)  echo -e "${GREEN}[INFO]${NC} $message" ;;
        WARN)  echo -e "${YELLOW}[WARN]${NC} $message" ;;
        ERROR) echo -e "${RED}[ERROR]${NC} $message" ;;
        DEBUG) echo -e "${BLUE}[DEBUG]${NC} $message" ;;
    esac
}

# 检查 Docker 是否可用
check_docker() {
    if ! command -v docker &>/dev/null || ! docker info &>/dev/null; then
        log ERROR "Docker 不可用"
        return 1
    fi
    return 0
}

# 获取容器状态
get_container_status() {
    if docker ps -q --filter "name=$CONTAINER_NAME" &>/dev/null; then
        echo "running"
    elif docker ps -aq --filter "name=$CONTAINER_NAME" &>/dev/null; then
        echo "stopped"
    else
        echo "not_found"
    fi
}

# 创建 Redis 配置文件
create_redis_config() {
    cat > "$REDIS_CONFIG" << EOF
# EKET Redis 配置文件
# 自动生成于 $(date -Iseconds)

# 网络配置
port 6379
bind 0.0.0.0

# 安全配置
requirepass $PASSWORD

# 持久化配置
appendonly yes
appendfsync everysec

# 内存配置
maxmemory 256mb
maxmemory-policy allkeys-lru

# 日志配置
loglevel notice
EOF

    log INFO "Redis 配置文件已创建：$REDIS_CONFIG"
}

# 启动 Redis 容器
start_container() {
    log INFO "启动 Redis 容器..."

    local status=$(get_container_status)

    if [ "$status" = "running" ]; then
        log INFO "容器已在运行"
        return 0
    elif [ "$status" = "stopped" ]; then
        log INFO "启动已存在的容器..."
        docker start "$CONTAINER_NAME"
        log INFO "容器已启动"
        return 0
    fi

    # 创建配置文件
    create_redis_config

    log INFO "使用配置:"
    log INFO "  端口：$PORT (容器内：6379)"
    log INFO "  密码：$PASSWORD"
    log INFO "  数据目录：$DATA_DIR"

    # 启动容器
    docker run -d \
        --name "$CONTAINER_NAME" \
        -v "$REDIS_CONFIG:/usr/local/etc/redis/redis.conf" \
        -v "$DATA_DIR/data:/data" \
        -p "$PORT:6379" \
        --restart unless-stopped \
        "$IMAGE_NAME" \
        redis-server /usr/local/etc/redis/redis.conf

    # 等待容器启动
    sleep 2

    # 验证容器状态
    if docker ps --filter "name=$CONTAINER_NAME" --format "{{.Status}}" &>/dev/null; then
        log INFO "Redis 容器启动成功"
        log INFO "  容器名称：$CONTAINER_NAME"
        log INFO "  镜像：$IMAGE_NAME"
        log INFO "  外部端口：$PORT"
        log INFO "  内部端口：6379"
        log INFO "  密码：$PASSWORD"
        log INFO "  数据目录：$DATA_DIR"

        # 测试连接
        test_connection
        return 0
    else
        log ERROR "Redis 容器启动失败"
        return 1
    fi
}

# 测试 Redis 连接
test_connection() {
    log INFO "测试 Redis 连接..."

    if command -v redis-cli &>/dev/null; then
        if redis-cli -p "$PORT" -a "$PASSWORD" ping 2>/dev/null | grep -q "PONG"; then
            log INFO "Redis 连接测试成功 (PONG)"
            return 0
        fi
    else
        # 使用 docker exec 测试
        if docker exec "$CONTAINER_NAME" redis-cli -a "$PASSWORD" ping 2>/dev/null | grep -q "PONG"; then
            log INFO "Redis 连接测试成功 (PONG)"
            return 0
        fi
    fi

    log WARN "Redis 连接测试失败"
    return 1
}

# 停止容器
stop_container() {
    log INFO "停止 Redis 容器..."

    if docker stop "$CONTAINER_NAME" &>/dev/null; then
        log INFO "容器已停止"
        return 0
    else
        log WARN "容器未运行或停止失败"
        return 1
    fi
}

# 重启容器
restart_container() {
    log INFO "重启 Redis 容器..."
    stop_container
    sleep 1
    start_container
}

# 查看容器状态
show_status() {
    echo "========================================"
    echo "EKET Redis 容器状态"
    echo "========================================"
    echo ""

    local status=$(get_container_status)
    echo "容器名称：$CONTAINER_NAME"
    echo "状态：$status"
    echo ""

    if [ "$status" = "running" ]; then
        echo "容器信息:"
        docker inspect --format '
  容器 ID: {{.Id}}
  镜像：{{.Config.Image}}
  启动时间：{{.State.StartedAt}}
' "$CONTAINER_NAME" 2>/dev/null || echo "  无法获取详细信息"

        echo ""
        echo "端口映射:"
        docker port "$CONTAINER_NAME" 2>/dev/null || echo "  无端口映射"

        echo ""
        echo "数据卷:"
        docker inspect --format '{{range .Mounts}}  {{.Source}} -> {{.Destination}}{{end}}' "$CONTAINER_NAME" 2>/dev/null || echo "  无数据卷"

        echo ""
        echo "Redis 信息:"
        echo "  外部端口：$PORT"
        echo "  密码：$PASSWORD"
        echo "  连接命令：redis-cli -p $PORT -a $PASSWORD"
    fi

    echo ""
}

# 查看日志
show_logs() {
    local lines="${2:-50}"

    if [ "$(get_container_status)" != "running" ]; then
        log ERROR "容器未运行"
        return 1
    fi

    docker logs --tail "$lines" "$CONTAINER_NAME"
}

# 删除容器
remove_container() {
    log WARN "删除 Redis 容器..."

    docker stop "$CONTAINER_NAME" 2>/dev/null || true
    docker rm "$CONTAINER_NAME" 2>/dev/null || true

    log INFO "容器已删除"
    log WARN "数据文件保留在：$DATA_DIR"
}

# 导出配置
export_config() {
    local config_file="$PROJECT_ROOT/.eket/config/docker-redis.yml"
    mkdir -p "$(dirname "$config_file")"

    cat > "$config_file" << EOF
# EKET Docker Redis 配置
# 自动生成于 $(date -Iseconds)

redis:
  container_name: $CONTAINER_NAME
  image: $IMAGE_NAME
  port: $PORT
  password: $PASSWORD
  data_dir: $DATA_DIR
  config_file: $REDIS_CONFIG
  status: $(get_container_status)

connection:
  host: localhost
  port: $PORT
  password: $PASSWORD
  url: redis://:$PASSWORD@localhost:$PORT
EOF

    log INFO "配置已导出：$config_file"
}

# 清空数据
flush_data() {
    log WARN "清空 Redis 所有数据..."

    if [ "$(get_container_status)" != "running" ]; then
        log ERROR "容器未运行"
        return 1
    fi

    if command -v redis-cli &>/dev/null; then
        redis-cli -p "$PORT" -a "$PASSWORD" FLUSHALL 2>/dev/null
    else
        docker exec "$CONTAINER_NAME" redis-cli -a "$PASSWORD" FLUSHALL 2>/dev/null
    fi

    log INFO "数据已清空"
}

# 主函数
main() {
    case "${1:-}" in
        start)
            check_docker || exit 1
            start_container
            export_config
            ;;
        stop)
            check_docker || exit 1
            stop_container
            ;;
        restart)
            check_docker || exit 1
            restart_container
            ;;
        status)
            show_status
            ;;
        logs)
            show_logs "$@"
            ;;
        remove)
            check_docker || exit 1
            remove_container
            ;;
        export)
            export_config
            ;;
        flush)
            check_docker || exit 1
            flush_data
            ;;
        --help|-h)
            echo "用法：$0 {start|stop|restart|status|logs|remove|export|flush}"
            echo ""
            echo "命令:"
            echo "  start   - 启动 Redis 容器"
            echo "  stop    - 停止 Redis 容器"
            echo "  restart - 重启 Redis 容器"
            echo "  status  - 查看容器状态"
            echo "  logs    - 查看容器日志"
            echo "  remove  - 删除容器（保留数据）"
            echo "  export  - 导出配置到文件"
            echo "  flush   - 清空所有数据"
            ;;
        *)
            echo "用法：$0 {start|stop|restart|status|logs|remove|export|flush}"
            exit 1
            ;;
    esac
}

main "$@"
