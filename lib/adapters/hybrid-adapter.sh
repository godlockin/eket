#!/bin/bash
#
# EKET Hybrid Adapter v0.7.0
# 用途：路由命令到 Shell 或 Node.js 实现，支持降级
#
# 用法：
#   ./lib/adapters/hybrid-adapter.sh <command> [args...]
#
# 降级逻辑：
#   1. 尝试使用 Node.js 实现
#   2. 如果 Node.js 不可用，降级到 Shell 实现
#   3. 如果 Shell 实现不可用，使用文件队列降级模式
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
NODE_DIR="$PROJECT_ROOT/node"
NODE_BIN="$NODE_DIR/dist/index.js"

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
        DEBUG) echo -e "${BLUE}[DEBUG]${NC} $message" ;;
    esac
}

# 检查 Node.js 是否可用
check_node_available() {
    if ! command -v node &> /dev/null; then
        return 1
    fi

    # 检查 Node.js 版本 (>= 18.0.0)
    local node_version=$(node -v 2>/dev/null | cut -d'.' -f1 | tr -d 'v')
    if [ "$node_version" -lt 18 ]; then
        return 1
    fi

    # 检查是否已构建
    if [ ! -f "$NODE_BIN" ]; then
        return 1
    fi

    # 检查关键模块是否存在
    if ! node -e "require('ioredis')" &>/dev/null; then
        return 1
    fi

    return 0
}

# 检查 Shell 实现是否存在
check_shell_impl() {
    local cmd="$1"
    local shell_script="$PROJECT_ROOT/scripts/${cmd}.sh"
    if [ -f "$shell_script" ]; then
        return 0
    fi
    return 1
}

# 执行 Node.js 命令
exec_node() {
    local cmd="$1"
    shift

    if check_node_available; then
        node "$NODE_BIN" "$cmd" "$@"
        return $?
    else
        return 1
    fi
}

# 执行 Shell 命令
exec_shell() {
    local cmd="$1"
    shift

    if check_shell_impl "$cmd"; then
        bash "$PROJECT_ROOT/scripts/${cmd}.sh" "$@"
        return $?
    else
        return 1
    fi
}

# 降级到文件队列模式
exec_fallback() {
    local cmd="$1"
    shift

    log WARN "Node.js 和 Shell 实现均不可用，使用文件队列降级模式"

    local queue_dir="$PROJECT_ROOT/.eket/data/queue"
    mkdir -p "$queue_dir"

    local msg_file="$queue_dir/${cmd}_$(date +%s).msg"
    cat > "$msg_file" << EOF
{
  "command": "$cmd",
  "args": $@,
  "timestamp": "$(date -Iseconds)",
  "status": "pending"
}
EOF

    log INFO "命令已写入队列文件：$msg_file"
    log INFO "待 Node.js 或 Shell 实现可用后执行"
}

# 主路由逻辑
route_command() {
    local cmd="$1"
    shift

    log DEBUG "路由命令：$cmd"

    # 定义每个命令的首选执行方式
    case "$cmd" in
        # Node.js 优先的命令（复杂功能）
        "redis:check"|"redis:list-slavers")
            if exec_node "$cmd" "$@"; then
                return 0
            elif exec_shell "docker-redis" "$@"; then
                return 0
            fi
            ;;

        "sqlite:check"|"sqlite:list-retros"|"sqlite:search"|"sqlite:report")
            if exec_node "$cmd" "$@"; then
                return 0
            elif exec_shell "docker-sqlite" "$@"; then
                return 0
            fi
            ;;

        "check"|"doctor")
            if exec_node "$cmd" "$@"; then
                return 0
            fi
            ;;

        # Shell 优先的命令（基础功能）
        "start"|"launch")
            if exec_shell "start" "$@"; then
                return 0
            elif exec_node "start" "$@"; then
                return 0
            fi
            ;;

        "status")
            if exec_shell "manage" "status" "$@"; then
                return 0
            fi
            ;;

        "claim")
            if check_shell_impl "claim-task"; then
                bash "$PROJECT_ROOT/scripts/claim-task.sh" "$@"
                return $?
            elif exec_node "claim" "$@"; then
                return 0
            fi
            ;;

        # 未知命令
        *)
            if exec_node "$cmd" "$@" 2>/dev/null; then
                return 0
            elif exec_shell "$cmd" "$@" 2>/dev/null; then
                return 0
            fi
            ;;
    esac

    # 所有方式都失败
    log ERROR "命令不可用：$cmd"
    echo ""
    echo "可用的命令:"
    echo "  Node.js: redis:*, sqlite:*, check, doctor"
    echo "  Shell:   start, status, claim, docker-redis, docker-sqlite"
    echo ""
    echo "提示：运行 './scripts/enable-advanced.sh' 启用更多功能"
    return 1
}

# 显示帮助
show_help() {
    echo "EKET Hybrid Adapter v0.7.0"
    echo ""
    echo "用法：$0 <command> [args...]"
    echo ""
    echo "可用命令:"
    echo ""
    echo "  Redis 相关 (Node.js):"
    echo "    redis:check          - 检查 Redis 连接状态"
    echo "    redis:list-slavers   - 列出所有活跃 Slaver"
    echo ""
    echo "  SQLite 相关 (Node.js):"
    echo "    sqlite:check         - 检查 SQLite 数据库状态"
    echo "    sqlite:list-retros   - 列出所有 Retrospective"
    echo "    sqlite:search        - 搜索 Retrospective"
    echo "    sqlite:report        - 生成统计报告"
    echo ""
    echo "  系统命令:"
    echo "    check                - 检查 Node.js 模块可用性"
    echo "    doctor               - 诊断系统状态"
    echo ""
    echo "  Shell 命令:"
    echo "    start                - 启动 Agent 实例"
    echo "    status               - 查看状态"
    echo "    claim                - 领取任务"
    echo ""
    echo "降级策略:"
    echo "  1. 优先使用 Node.js 实现（高级功能）"
    echo "  2. 降级到 Shell 实现（基础功能）"
    echo "  3. 使用文件队列（离线模式）"
    echo ""
}

# 主函数
main() {
    if [ $# -eq 0 ]; then
        show_help
        exit 0
    fi

    local cmd="$1"
    shift

    if [ "$cmd" = "help" ] || [ "$cmd" = "--help" ] || [ "$cmd" = "-h" ]; then
        show_help
        exit 0
    fi

    route_command "$cmd" "$@"
}

main "$@"
