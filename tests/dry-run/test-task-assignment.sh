#!/bin/bash
#
# EKET Task Assignment Test (Dry-Run Mode)
# 用途：测试基于角色的任务分配逻辑
#
# 用法：
#   ./tests/dry-run/test-task-assignment.sh [--mode redis|file|shell]
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
    rm -rf "$PROJECT_ROOT/jira/tickets/test-*"
    rm -rf "$PROJECT_ROOT/.eket/data/queue/test-*"
}

# 测试 1: 创建测试任务
test_create_task() {
    log TEST "测试 1: 创建测试任务"

    # 创建前端开发任务
    cat > "$PROJECT_ROOT/jira/tickets/feature/test-feat-001.yml" << 'EOF'
id: test-feat-001
type: feature
title: 测试任务 - 前端开发
status: ready
priority: high
required_role: frontend_dev
tags:
  - frontend
  - react
  - ui
description: |
  这是一个测试任务
assignee: null
EOF

    assert "前端任务创建成功" "[ -f '$PROJECT_ROOT/jira/tickets/feature/test-feat-001.yml' ]"

    # 创建后端开发任务
    cat > "$PROJECT_ROOT/jira/tickets/feature/test-feat-002.yml" << 'EOF'
id: test-feat-002
type: feature
title: 测试任务 - 后端开发
status: ready
priority: medium
required_role: backend_dev
tags:
  - backend
  - api
  - database
description: |
  这是一个测试任务
assignee: null
EOF

    assert "后端任务创建成功" "[ -f '$PROJECT_ROOT/jira/tickets/feature/test-feat-002.yml' ]"
}

# 测试 2: 按角色匹配 Instance
test_match_by_role() {
    log TEST "测试 2: 按角色匹配 Instance"

    log DEBUG "待 Phase 4.3 完成后实现"
}

# 测试 3: 任务分配给空闲 Instance
test_assign_to_idle() {
    log TEST "测试 3: 任务分配给空闲 Instance"

    log DEBUG "待 Phase 4.3 完成后实现"
}

# 测试 4: 人类主动领取任务
test_human_claim() {
    log TEST "测试 4: 人类主动领取任务"

    log DEBUG "待 Phase 4.3 完成后实现"
}

# 测试 5: AI 自动领取任务
test_ai_auto_claim() {
    log TEST "测试 5: AI 自动领取任务"

    log DEBUG "待 Phase 4.3 完成后实现"
}

# 测试 6: 负载均衡
test_load_balancing() {
    log TEST "测试 6: 负载均衡"

    log DEBUG "待 Phase 4.3 完成后实现"
}

# 主测试流程
run_all_tests() {
    log INFO "========================================"
    log INFO "EKET Task Assignment Test (Dry-Run)"
    log INFO "========================================"
    echo ""

    # 环境检查
    log INFO "环境检查..."

    # 清理
    cleanup

    # 运行测试
    echo ""
    log INFO "运行测试..."
    echo ""

    # 创建测试任务
    test_create_task

    # 注释：以下测试需要 Phase 4.3 完成后才能运行
    # test_match_by_role
    # test_assign_to_idle
    # test_human_claim
    # test_ai_auto_claim
    # test_load_balancing

    log WARN "测试框架已创建，待 Phase 4.3 完成后运行实际测试"

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
    echo "EKET Task Assignment Test"
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
