#!/bin/bash
#
# EKET Enable Advanced Features Script
# 用途：安装 Node.js 依赖，启用高级功能
#
# 用法：
#   ./scripts/enable-advanced.sh [--clean]
#
# 选项：
#   --clean    清理并重新安装
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
NODE_DIR="$PROJECT_ROOT/node"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() {
    local level="$1"
    local message="$2"
    case "$level" in
        INFO)  echo -e "${GREEN}[INFO]${NC} $message" ;;
        WARN)  echo -e "${YELLOW}[WARN]${NC} $message" ;;
        ERROR) echo -e "${RED}[ERROR]${NC} $message" ;;
    esac
}

# 检查 Node.js 是否安装
check_prerequisites() {
    if ! command -v node &> /dev/null; then
        log ERROR "Node.js 未安装"
        echo ""
        echo "请先安装 Node.js (>= 18.0.0):"
        echo "  macOS:  brew install node@20"
        echo "  Ubuntu: curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt-get install -y nodejs"
        echo "  Windows: 从 https://nodejs.org 下载安装包"
        echo ""
        exit 1
    fi

    local node_version=$(node -v 2>/dev/null | cut -d'.' -f1 | tr -d 'v')
    if [ "$node_version" -lt 18 ]; then
        log ERROR "Node.js 版本过旧 (当前：$node_version，需要：>= 18)"
        echo "请升级 Node.js 到 18.0.0 或更高版本"
        exit 1
    fi

    if ! command -v npm &> /dev/null; then
        log ERROR "npm 未安装"
        echo "请确保 npm 已正确安装"
        exit 1
    fi

    log INFO "Node.js 版本：$(node -v)"
    log INFO "npm 版本：$(npm -v)"
}

# 安装依赖
install_dependencies() {
    local clean="$1"

    cd "$NODE_DIR"

    if [ "$clean" = "true" ] && [ -d "node_modules" ]; then
        log INFO "清理旧的 node_modules..."
        rm -rf node_modules
    fi

    if [ -f "package-lock.json" ] && [ "$clean" = "true" ]; then
        log INFO "清理 package-lock.json..."
        rm package-lock.json
    fi

    log INFO "安装 Node.js 依赖..."
    echo ""

    # 使用镜像源加速安装（如果在中国）
    if command -v curl &> /dev/null; then
        local response=$(curl -s -o /dev/null -w "%{http_code}" https://registry.npmmirror.com 2>/dev/null || echo "000")
        if [ "$response" = "200" ]; then
            log INFO "检测到中国网络，使用 npmmirror 镜像源..."
            npm config set registry https://registry.npmmirror.com
        fi
    fi

    npm install

    echo ""
    log INFO "依赖安装完成"
}

# 构建项目
build_project() {
    cd "$NODE_DIR"

    log INFO "构建 TypeScript 项目..."
    npm run build

    if [ $? -eq 0 ]; then
        log INFO "构建成功"
    else
        log ERROR "构建失败"
        exit 1
    fi
}

# 验证安装
verify_installation() {
    cd "$NODE_DIR"

    log INFO "验证安装..."

    # 运行检查命令
    node dist/index.js check

    if [ $? -eq 0 ]; then
        echo ""
        log INFO "✓ Node.js 高级功能已启用"
        echo ""
        echo "可用的命令:"
        echo "  - redis:check          检查 Redis 连接"
        echo "  - redis:list-slavers   列出活跃 Slaver"
        echo "  - sqlite:check         检查 SQLite 数据库"
        echo "  - sqlite:list-retros   列出 Retrospective"
        echo "  - sqlite:search        搜索 Retrospective"
        echo "  - sqlite:report        生成统计报告"
        echo "  - doctor               系统诊断"
        echo ""
        echo "使用方法:"
        echo "  ./lib/adapters/hybrid-adapter.sh redis:check"
        echo "  node node/dist/index.js sqlite:report"
        echo ""
    else
        log WARN "验证失败，但安装可能已成功"
    fi
}

# 显示使用说明
show_usage() {
    echo ""
    echo "========================================"
    echo "  EKET 高级功能已启用"
    echo "========================================"
    echo ""
    echo "下一步:"
    echo "  1. 启动 Redis: ./scripts/docker-redis.sh start"
    echo "  2. 启动 SQLite: ./scripts/docker-sqlite.sh init"
    echo "  3. 测试连接：./lib/adapters/hybrid-adapter.sh doctor"
    echo ""
}

# 主函数
main() {
    local clean="false"

    if [ "$1" = "--clean" ]; then
        clean="true"
        log INFO "执行清理安装..."
    fi

    echo ""
    echo "========================================"
    echo "  EKET 高级功能安装向导"
    echo "========================================"
    echo ""

    check_prerequisites
    install_dependencies "$clean"
    build_project
    verify_installation
    show_usage
}

main "$@"
