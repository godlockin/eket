#!/bin/bash

set -e

# EKET 测试环境启动脚本
# 用于启动 Docker Redis 和运行测试

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NODE_DIR="$(dirname "$SCRIPT_DIR")"
PROJECT_ROOT="$(dirname "$NODE_DIR")"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 检查 Docker
check_docker() {
    if ! command -v docker &> /dev/null; then
        log_error "Docker 未安装"
        exit 1
    fi

    if ! docker info &> /dev/null; then
        log_error "Docker 未运行"
        exit 1
    fi

    log_info "Docker 检查通过"
}

# 检查 Docker Compose
check_docker_compose() {
    if command -v docker-compose &> /dev/null; then
        DOCKER_COMPOSE_CMD="docker-compose"
    elif docker compose version &> /dev/null; then
        DOCKER_COMPOSE_CMD="docker compose"
    else
        log_error "Docker Compose 未安装"
        exit 1
    fi

    log_info "Docker Compose 检查通过 ($DOCKER_COMPOSE_CMD)"
}

# 启动测试环境
start_test_env() {
    local compose_file="$PROJECT_ROOT/docker-compose.test.yml"

    if [[ ! -f "$compose_file" ]]; then
        log_error "未找到 docker-compose.test.yml: $compose_file"
        exit 1
    fi

    log_info "启动测试环境..."

    cd "$PROJECT_ROOT"
    $DOCKER_COMPOSE_CMD -f "$compose_file" up -d redis

    log_info "等待 Redis 就绪..."

    # 等待 Redis 健康检查通过
    local max_attempts=30
    local attempt=0

    while [[ $attempt -lt $max_attempts ]]; do
        if docker exec eket-test-redis redis-cli ping &> /dev/null; then
            log_info "Redis 已就绪"
            break
        fi

        attempt=$((attempt + 1))
        sleep 1
    done

    if [[ $attempt -eq $max_attempts ]]; then
        log_error "Redis 启动超时"
        exit 1
    fi
}

# 停止测试环境
stop_test_env() {
    local compose_file="$PROJECT_ROOT/docker-compose.test.yml"

    log_info "停止测试环境..."

    cd "$PROJECT_ROOT"
    $DOCKER_COMPOSE_CMD -f "$compose_file" down
}

# 运行测试
run_tests() {
    local test_args="$@"

    cd "$NODE_DIR"

    log_info "运行测试..."

    if [[ -n "$test_args" ]]; then
        npm test -- $test_args
    else
        npm test
    fi
}

# 清理测试环境
cleanup() {
    log_info "清理测试环境..."
    stop_test_env
}

# 显示帮助
show_help() {
    cat << EOF
EKET 测试环境启动脚本

用法：$(basename "$0") [命令] [选项]

命令:
    start       启动测试环境（Redis）
    stop        停止测试环境
    restart     重启测试环境
    test        运行测试（自动启动环境）
    clean       清理测试环境并删除容器
    help        显示帮助

选项:
    -w, --watch     监视模式运行测试
    -c, --coverage  生成覆盖率报告
    -t, --test      指定测试文件模式
    -h, --help      显示帮助

示例:
    $(basename "$0") start
    $(basename "$0") test -- --testPathPattern=cache-layer
    $(basename "$0") test -- --coverage
    $(basename "$0") stop
EOF
}

# 主函数
main() {
    check_docker
    check_docker_compose

    case "${1:-}" in
        start)
            start_test_env
            ;;
        stop)
            stop_test_env
            ;;
        restart)
            stop_test_env
            start_test_env
            ;;
        test)
            shift
            start_test_env
            run_tests "$@"
            ;;
        clean)
            cleanup
            ;;
        help|--help|-h)
            show_help
            ;;
        *)
            # 默认启动
            start_test_env
            ;;
    esac
}

main "$@"
