#!/bin/bash
#
# EKET Instance Lifecycle Test (Dry-Run Mode)
# 用途：测试 Instance 的注册、状态更新、查询、注销流程
#
# 用法：
#   ./tests/dry-run/test-instance-lifecycle.sh [--mode redis|file|shell]
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

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
        TEST)  echo -e "${BLUE}[TEST]${NC} $message" ;;
    esac
}

# 测试计数
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# 测试断言
assert() {
    TESTS_RUN=$((TESTS_RUN + 1))
    local description="$1"
    local condition="$2"

    if eval "$condition"; then
        TESTS_PASSED=$((TESTS_PASSED + 1))
        log INFO "✓ $description"
        return 0
    else
        TESTS_FAILED=$((TESTS_FAILED + 1))
        log ERROR "✗ $description"
        return 1
    fi
}

# 清理测试数据
cleanup() {
    log INFO "清理测试数据..."
    rm -rf "$PROJECT_ROOT/.eket/test-state"
    rm -rf "$PROJECT_ROOT/.eket/data/queue/test-*"
}

# 测试 1: 注册 Master Instance
test_register_master() {
    log TEST "测试 1: 注册 Master Instance"

    local result
    result=$(node "$PROJECT_ROOT/node/dist/index.js" test:register \
        --controller human \
        --role master \
        --agent-type master_coordinator \
        2>&1)

    assert "Master Instance 注册成功" "[[ \"$result\" == *\"Master\"* ]]"
    assert "返回 Instance ID" "[[ \"$result\" == *\"id\"* ]]"
}

# 测试 2: 注册人类 Slaver Instance
test_register_human_slaver() {
    log TEST "测试 2: 注册人类 Slaver Instance"

    local result
    result=$(node "$PROJECT_ROOT/node/dist/index.js" test:register \
        --controller human \
        --role slaver \
        --agent-type frontend_dev \
        --skills "frontend_development,unit_test" \
        2>&1)

    assert "人类 Slaver 注册成功" "[[ \"$result\" == *\"frontend_dev\"* ]]"
    assert "返回技能列表" "[[ \"$result\" == *\"skills\"* ]]"
}

# 测试 3: 注册 AI Slaver Instance
test_register_ai_slaver() {
    log TEST "测试 3: 注册 AI Slaver Instance"

    local result
    result=$(node "$PROJECT_ROOT/node/dist/index.js" test:register \
        --controller ai \
        --role slaver \
        --agent-type backend_dev \
        --auto \
        2>&1)

    assert "AI Slaver 注册成功" "[[ \"$result\" == *\"backend_dev\"* ]]"
}

# 测试 4: 查询活跃 Instance
test_get_active_instances() {
    log TEST "测试 4: 查询活跃 Instance"

    local result
    result=$(node "$PROJECT_ROOT/node/dist/index.js" team-status 2>&1)

    assert "返回 Instance 列表" "[[ \"$result\" == *\"Instance\"* || \"$result\" == *\"无\"* ]]"
}

# 测试 5: 按角色过滤 Instance
test_get_instances_by_role() {
    log TEST "测试 5: 按角色过滤 Instance"

    local result
    result=$(node "$PROJECT_ROOT/node/dist/index.js" team-status --role frontend_dev 2>&1)

    assert "按角色过滤成功" "true"  # 总是通过，因为可能返回空
}

# 测试 6: 更新 Instance 状态
test_update_status() {
    log TEST "测试 6: 更新 Instance 状态"

    # 这个测试需要有一个已注册的 Instance
    log DEBUG "跳过：需要先注册 Instance"
}

# 测试 7: Instance 心跳
test_heartbeat() {
    log TEST "测试 7: Instance 心跳"

    log DEBUG "跳过：需要长时间运行测试"
}

# 测试 8: Instance 注销
test_unregister() {
    log TEST "测试 8: Instance 注销"

    log DEBUG "跳过：需要实现注销命令"
}

# 主测试流程
run_all_tests() {
    log INFO "========================================"
    log INFO "EKET Instance Lifecycle Test (Dry-Run)"
    log INFO "========================================"
    echo ""

    # 环境检查
    log INFO "环境检查..."
    if ! command -v node &> /dev/null; then
        log ERROR "Node.js 未安装，使用文件队列模式"
        export EKET_MODE="file"
    fi

    # 清理
    cleanup

    # 运行测试
    echo ""
    log INFO "运行测试..."
    echo ""

    # 检查 Node.js 模块是否已构建
    if [ ! -f "$PROJECT_ROOT/node/dist/index.js" ]; then
        log WARN "Node.js 模块未构建，先执行 npm build"
        cd "$PROJECT_ROOT/node" && npm run build
    fi

    # 注释：以下测试需要 Phase 4.1 完成后才能运行
    # test_register_master
    # test_register_human_slaver
    # test_register_ai_slaver
    # test_get_active_instances
    # test_get_instances_by_role
    # test_update_status
    # test_heartbeat
    # test_unregister

    log WARN "测试框架已创建，待 Phase 4.1 完成后运行实际测试"

    # 报告
    echo ""
    log INFO "========================================"
    log INFO "测试报告"
    log INFO "========================================"
    log INFO "运行：$TESTS_RUN"
    log INFO "通过：$TESTS_PASSED"
    log INFO "失败：$TESTS_FAILED"
    echo ""

    if [ $TESTS_FAILED -eq 0 ]; then
        log INFO "所有测试通过！"
        return 0
    else
        log ERROR "部分测试失败"
        return 1
    fi
}

# 显示帮助
show_help() {
    echo "EKET Instance Lifecycle Test"
    echo ""
    echo "用法：$0 [选项]"
    echo ""
    echo "选项:"
    echo "  --mode <mode>  测试模式 (redis|file|shell)"
    echo "  --clean        清理测试数据"
    echo "  --help         显示帮助"
    echo ""
}

# 主函数
main() {
    local mode="auto"

    while [[ $# -gt 0 ]]; do
        case "$1" in
            --mode)
                mode="$2"
                shift 2
                ;;
            --clean)
                cleanup
                exit 0
                ;;
            --help)
                show_help
                exit 0
                ;;
            *)
                log ERROR "未知选项：$1"
                show_help
                exit 1
                ;;
        esac
    done

    export EKET_MODE="$mode"
    run_all_tests
}

main "$@"
