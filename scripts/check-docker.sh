#!/bin/bash
#
# EKET Docker 检测工具 v0.6.0
# 用途：检测 Docker 是否安装并运行，支持 Docker Compose 检测
#
# 用法：
#   ./scripts/check-docker.sh [--verbose]
#
# 返回值:
#   0 - Docker 可用
#   1 - Docker 未安装
#   2 - Docker 未运行
#   3 - Docker Compose 不可用
#

set -e

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

VERBOSE=false
if [ "$1" = "--verbose" ] || [ "$1" = "-v" ]; then
    VERBOSE=true
fi

log() {
    local level="$1"
    local message="$2"
    case "$level" in
        INFO)  echo -e "${GREEN}[INFO]${NC} $message" ;;
        WARN)  echo -e "${YELLOW}[WARN]${NC} $message" ;;
        ERROR) echo -e "${RED}[ERROR]${NC} $message" ;;
        DEBUG) [ "$VERBOSE" = true ] && echo -e "${BLUE}[DEBUG]${NC} $message" ;;
    esac
}

# 检查 Docker 是否安装
check_docker_installed() {
    log DEBUG "检查 Docker 是否安装..."

    if command -v docker &>/dev/null; then
        local version=$(docker --version 2>/dev/null)
        log INFO "Docker 已安装：$version"
        return 0
    else
        log ERROR "Docker 未安装"
        log INFO "请安装 Docker Desktop: https://www.docker.com/products/docker-desktop"
        return 1
    fi
}

# 检查 Docker 是否运行
check_docker_running() {
    log DEBUG "检查 Docker 是否运行..."

    if docker info &>/dev/null; then
        log INFO "Docker 服务正在运行"
        return 0
    else
        log ERROR "Docker 服务未运行"
        log INFO "请启动 Docker Desktop 应用"
        return 2
    fi
}

# 检查 Docker Compose 是否可用
check_docker_compose() {
    log DEBUG "检查 Docker Compose 是否可用..."

    # 检查新版 docker compose 插件
    if command -v docker-compose &>/dev/null; then
        local version=$(docker-compose --version 2>/dev/null)
        log INFO "Docker Compose 已安装 (standalone): $version"
        return 0
    elif docker compose version &>/dev/null; then
        local version=$(docker compose version 2>/dev/null)
        log INFO "Docker Compose 已安装 (plugin): $version"
        return 0
    else
        log WARN "Docker Compose 未安装"
        log INFO "某些功能可能需要 Docker Compose"
        return 3
    fi
}

# 获取 Docker Compose 命令
get_compose_cmd() {
    if command -v docker-compose &>/dev/null; then
        echo "docker-compose"
    elif docker compose version &>/dev/null; then
        echo "docker compose"
    else
        echo ""
    fi
}

# 检查 Docker 网络
check_docker_network() {
    log DEBUG "检查 Docker 网络..."

    if docker network ls &>/dev/null; then
        log INFO "Docker 网络正常"
        return 0
    else
        log WARN "Docker 网络访问异常"
        return 1
    fi
}

# 完整检查
full_check() {
    local errors=0

    echo "========================================"
    echo "EKET Docker 环境检查"
    echo "========================================"
    echo ""

    # 检查 Docker 安装
    if ! check_docker_installed; then
        ((errors++))
        echo ""
        echo "========================================"
        echo -e "${RED}Docker 检查失败${NC}"
        echo "========================================"
        return 1
    fi

    # 检查 Docker 运行状态
    if ! check_docker_running; then
        ((errors++))
        echo ""
        echo "========================================"
        echo -e "${RED}Docker 服务未运行${NC}"
        echo "========================================"
        return 2
    fi

    # 检查 Docker Compose
    if ! check_docker_compose; then
        log WARN "Docker Compose 不可用，部分功能受限"
    fi

    # 检查 Docker 网络
    if ! check_docker_network; then
        log WARN "Docker 网络访问异常"
    fi

    echo ""
    echo "========================================"
    echo -e "${GREEN}Docker 环境检查通过${NC}"
    echo "========================================"

    # 输出 Docker 信息
    echo ""
    echo "Docker 信息:"
    echo "  版本：$(docker --version)"
    echo "  Compose: $(get_compose_cmd || echo '未安装')"
    echo "  运行容器数：$(docker ps -q 2>/dev/null | wc -l | tr -d ' ')"
    echo ""

    return 0
}

# 静默检查（仅返回状态）
silent_check() {
    if command -v docker &>/dev/null && docker info &>/dev/null; then
        return 0
    fi
    return 1
}

# 主函数
main() {
    case "${1:-}" in
        --silent|-s)
            silent_check
            ;;
        --verbose|-v)
            full_check
            ;;
        --help|-h)
            echo "用法：$0 [--verbose|--silent|--help]"
            echo ""
            echo "选项:"
            echo "  --verbose, -v   显示详细信息"
            echo "  --silent, -s    静默模式，仅返回状态码"
            echo "  --help, -h      显示帮助信息"
            echo ""
            echo "返回值:"
            echo "  0 - Docker 可用"
            echo "  1 - Docker 未安装"
            echo "  2 - Docker 未运行"
            ;;
        *)
            full_check
            ;;
    esac
}

main "$@"
