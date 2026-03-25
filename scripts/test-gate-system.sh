#!/bin/bash
#
# EKET 全阶段测试门禁系统 v0.5.1
# 用途：根据项目进度状态执行必须的测试步骤
#
# 用法:
#   ./scripts/test-gate-system.sh <gate_name> [ticket_id]
#

# 不使用 set -e，避免在可恢复错误处退出

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SRC_DIR="$PROJECT_ROOT/src"
TESTS_DIR="$PROJECT_ROOT/tests"
CONFIG_DIR="$PROJECT_ROOT/.eket/config"
OUTPUT_DIR="$PROJECT_ROOT/outbox/test-reports"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 加载配置
load_config() {
    local config_file="$CONFIG_DIR/testing.yml"

    if [ -f "$config_file" ]; then
        GATE_ENABLED=$(grep -A5 "gate_system:" "$config_file" 2>/dev/null | grep "enabled:" | head -1 | awk '{print $2}' || echo "true")
    else
        GATE_ENABLED=true
    fi
}

# 单元测试门禁
gate_unit_test() {
    local ticket_id="$1"
    local errors=0

    log_info "=== 门禁：单元测试 ==="

    # 检查测试脚本是否存在
    if [ -f "$TESTS_DIR/run-unit-tests.sh" ]; then
        log_info "运行单元测试..."
        if "$TESTS_DIR/run-unit-tests.sh" --ticket "$ticket_id" 2>/dev/null; then
            log_info "✓ 单元测试通过"
        else
            log_error "✗ 单元测试失败"
            ((errors++))
        fi
    else
        log_warn "⚠ 测试脚本不存在，跳过"
    fi

    # 检查覆盖率
    log_info "检查代码覆盖率..."
    local coverage_file="$PROJECT_ROOT/coverage/coverage-summary.json"

    if [ -f "$coverage_file" ]; then
        local coverage=$(cat "$coverage_file" 2>/dev/null | grep -o '"pct":[0-9.]*' | head -1 | cut -d':' -f2 || echo "0")
        local min_coverage=$(get_min_coverage "$ticket_id")

        if [ -n "$min_coverage" ] && [ "$(echo "$coverage >= $min_coverage" | bc -l 2>/dev/null || echo "0")" -eq 1 ]; then
            log_info "✓ 覆盖率：${coverage}% (≥${min_coverage}%)"
        else
            log_warn "⚠ 覆盖率：${coverage}% (<${min_coverage}%)，可选"
        fi
    else
        log_warn "⚠ 覆盖率报告不存在"
    fi

    return $errors
}

# 获取最低覆盖率要求
get_min_coverage() {
    local ticket_id="$1"
    local ticket_file="$JIRA_DIR"/*/"${ticket_id}.md"

    if [ -f "$ticket_file" ]; then
        local priority=$(grep "^priority:" "$ticket_file" 2>/dev/null | cut -d':' -f2 | tr -d ' ')
        local type=$(grep "^type:" "$ticket_file" 2>/dev/null | cut -d':' -f2 | tr -d ' ')

        case "$priority" in
            P0|urgent) echo "95" ;;
            P1|high) echo "90" ;;
            P2|normal) echo "80" ;;
            *)
                case "$type" in
                    feature) echo "80" ;;
                    bugfix) echo "85" ;;
                    hotfix) echo "70" ;;
                    *) echo "80" ;;
                esac
                ;;
        esac
    else
        echo "80"
    fi
}

# Lint 检查门禁
gate_lint() {
    log_info "=== 门禁：Lint 检查 ==="

    if command -v npm &> /dev/null && [ -f "$PROJECT_ROOT/package.json" ]; then
        log_info "运行 Lint 检查..."
        if npm run lint 2>/dev/null; then
            log_info "✓ Lint 检查通过"
            return 0
        else
            log_error "✗ Lint 检查失败"
            return 1
        fi
    else
        log_warn "⚠ NPM 不可用，跳过"
        return 0
    fi
}

# 集成测试门禁
gate_integration_test() {
    local ticket_id="$1"
    local errors=0

    log_info "=== 门禁：集成测试 ==="

    if [ -f "$TESTS_DIR/run-integration-tests.sh" ]; then
        log_info "运行集成测试..."
        if "$TESTS_DIR/run-integration-tests.sh" --ticket "$ticket_id" 2>/dev/null; then
            log_info "✓ 集成测试通过"
        else
            log_error "✗ 集成测试失败"
            ((errors++))
        fi
    else
        log_warn "⚠ 集成测试脚本不存在，跳过"
    fi

    return $errors
}

# E2E 测试门禁
gate_e2e_test() {
    local ticket_id="$1"
    local errors=0

    log_info "=== 门禁：E2E 测试 ==="

    if [ -f "$TESTS_DIR/run-e2e-tests.sh" ]; then
        log_info "运行 E2E 测试..."
        if "$TESTS_DIR/run-e2e-tests.sh" --ticket "$ticket_id" 2>/dev/null; then
            log_info "✓ E2E 测试通过"
        else
            log_error "✗ E2E 测试失败"
            ((errors++))
        fi
    else
        log_warn "⚠ E2E 测试脚本不存在，跳过"
    fi

    return $errors
}

# 验收测试门禁
gate_acceptance_test() {
    local ticket_id="$1"
    local errors=0

    log_info "=== 门禁：验收测试 ==="

    local ticket_file="$JIRA_DIR"/*/"${ticket_id}.md"

    if [ -f "$ticket_file" ]; then
        # 检查验收标准
        local criteria_total=$(grep -c "^\- \[" "$ticket_file" 2>/dev/null || echo "0")
        local criteria_done=$(grep -c "^\- \[x\]" "$ticket_file" 2>/dev/null || echo "0")

        if [ "$criteria_total" -eq 0 ] || [ "$criteria_done" -ge "$criteria_total" ]; then
            log_info "✓ 验收标准完成：$criteria_done/$criteria_total"
        else
            log_error "✗ 验收标准未完成：$criteria_done/$criteria_total"
            ((errors++))
        fi
    else
        log_warn "⚠ 任务文件不存在"
    fi

    return $errors
}

# UI/UX 测试门禁
gate_ui_ux_test() {
    local ticket_id="$1"
    local errors=0

    log_info "=== 门禁：UI/UX 测试 ==="

    # 检查是否是前端任务
    local ticket_file="$JIRA_DIR"/*/"${ticket_id}.md"
    local is_frontend=false

    if [ -f "$ticket_file" ]; then
        if grep -qiE "frontend|ui|ux|react|vue|angular" "$ticket_file" 2>/dev/null; then
            is_frontend=true
        fi
    fi

    if [ "$is_frontend" = true ]; then
        log_info "前端任务，需要 UI/UX 测试"

        # 检查是否有视觉回归测试
        if [ -f "$TESTS_DIR/run-visual-tests.sh" ]; then
            if "$TESTS_DIR/run-visual-tests.sh" --ticket "$ticket_id" 2>/dev/null; then
                log_info "✓ 视觉回归测试通过"
            else
                log_error "✗ 视觉回归测试失败"
                ((errors++))
            fi
        else
            log_warn "⚠ 视觉回归测试脚本不存在"
        fi
    else
        log_info "非前端任务，跳过 UI/UX 测试"
    fi

    return $errors
}

# 代码 Review 门禁
gate_code_review() {
    local ticket_id="$1"
    local errors=0

    log_info "=== 门禁：代码 Review ==="

    # 检查 PR 是否创建
    local pr_file="$PROJECT_ROOT/outbox/review_requests/${ticket_id}.md"

    if [ -f "$pr_file" ]; then
        log_info "✓ PR 已创建"

        # 检查 Review 状态
        local review_status=$(grep -i "review.*status\|status.*review" "$pr_file" 2>/dev/null | head -1 || echo "")

        if grep -qi "approved\|通过" "$pr_file" 2>/dev/null; then
            log_info "✓ Review 通过"
        else
            log_warn "⚠ Review 状态：待审核"
        fi
    else
        log_error "✗ PR 未创建"
        ((errors++))
    fi

    return $errors
}

# 性能测试门禁
gate_performance_test() {
    local ticket_id="$1"
    local errors=0

    log_info "=== 门禁：性能测试 ==="

    # 检查是否需要性能测试
    local ticket_file="$JIRA_DIR"/*/"${ticket_id}.md"
    local needs_perf_test=false

    if [ -f "$ticket_file" ]; then
        if grep -qiE "performance|性能 | 优化|benchmark" "$ticket_file" 2>/dev/null; then
            needs_perf_test=true
        fi
    fi

    if [ "$needs_perf_test" = true ]; then
        log_info "需要性能测试"

        if [ -f "$TESTS_DIR/run-performance-tests.sh" ]; then
            if "$TESTS_DIR/run-performance-tests.sh" --ticket "$ticket_id" 2>/dev/null; then
                log_info "✓ 性能测试通过"
            else
                log_error "✗ 性能测试失败"
                ((errors++))
            fi
        else
            log_warn "⚠ 性能测试脚本不存在"
        fi
    else
        log_info "无需性能测试，跳过"
    fi

    return $errors
}

# 安全性测试门禁
gate_security_test() {
    local ticket_id="$1"
    local errors=0

    log_info "=== 门禁：安全性测试 ==="

    # 检查是否需要安全测试
    local ticket_file="$JIRA_DIR"/*/"${ticket_id}.md"
    local needs_security_test=false

    if [ -f "$ticket_file" ]; then
        if grep -qiE "auth|security|权限 | 认证|安全|injection|xss|csrf" "$ticket_file" 2>/dev/null; then
            needs_security_test=true
        fi
    fi

    if [ "$needs_security_test" = true ]; then
        log_info "需要安全性测试"

        if [ -f "$TESTS_DIR/run-security-tests.sh" ]; then
            if "$TESTS_DIR/run-security-tests.sh" --ticket "$ticket_id" 2>/dev/null; then
                log_info "✓ 安全性测试通过"
            else
                log_error "✗ 安全性测试失败"
                ((errors++))
            fi
        else
            log_warn "⚠ 安全性测试脚本不存在"
        fi
    else
        log_info "无需安全性测试，跳过"
    fi

    return $errors
}

# 生成测试报告
generate_test_report() {
    local ticket_id="$1"
    local results=("$@")
    local report_file="$OUTPUT_DIR/test-gate-report-${ticket_id}-$(date +%Y%m%d_%H%M%S).md"

    mkdir -p "$OUTPUT_DIR"

    cat > "$report_file" << EOF
# 测试门禁报告

**任务 ID**: $ticket_id
**生成时间**: $(date -Iseconds)

## 门禁结果

| 门禁 | 状态 |
|------|------|
| 单元测试 | ${results[0]:-未执行} |
| Lint 检查 | ${results[1]:-未执行} |
| 集成测试 | ${results[2]:-未执行} |
| E2E 测试 | ${results[3]:-未执行} |
| 验收测试 | ${results[4]:-未执行} |
| UI/UX 测试 | ${results[5]:-未执行} |
| 代码 Review | ${results[6]:-未执行} |
| 性能测试 | ${results[7]:-未执行} |
| 安全性测试 | ${results[8]:-未执行} |

## 总结

$(if [[ " ${results[*]} " =~ "✗" ]]; then
    echo "**结果**: 存在失败的门禁，需要修复"
else
    echo "**结果**: 所有门禁通过"
fi)

---

**生成者**: EKET Test Gate System v0.5.1
EOF

    log_info "测试报告已生成：$report_file"
}

# 主函数
main() {
    local gate_name="${1:-all}"
    local ticket_id="${2:-}"

    if [ -z "$ticket_id" ]; then
        echo "用法：$0 <gate_name> <ticket_id>"
        echo ""
        echo "门禁名称:"
        echo "  all              - 所有门禁"
        echo "  unit_test        - 单元测试"
        echo "  lint             - Lint 检查"
        echo "  integration_test - 集成测试"
        echo "  e2e_test         - E2E 测试"
        echo "  acceptance_test  - 验收测试"
        echo "  ui_ux_test       - UI/UX 测试"
        echo "  code_review      - 代码 Review"
        echo "  performance_test - 性能测试"
        echo "  security_test    - 安全性测试"
        exit 1
    fi

    log_info "执行测试门禁：$gate_name"

    # 加载配置
    load_config

    local errors=0
    local results=()

    case "$gate_name" in
        all)
            gate_unit_test "$ticket_id" || errors=$?
            results+=($([ $errors -eq 0 ] && echo "✓" || echo "✗"))

            gate_lint || errors=$?
            results+=($([ $errors -eq 0 ] && echo "✓" || echo "✗"))

            gate_integration_test "$ticket_id" || errors=$?
            results+=($([ $errors -eq 0 ] && echo "✓" || echo "✗"))

            gate_e2e_test "$ticket_id" || errors=$?
            results+=($([ $errors -eq 0 ] && echo "✓" || echo "✗"))

            gate_acceptance_test "$ticket_id" || errors=$?
            results+=($([ $errors -eq 0 ] && echo "✓" || echo "✗"))

            gate_ui_ux_test "$ticket_id" || errors=$?
            results+=($([ $errors -eq 0 ] && echo "✓" || echo "✗"))

            gate_code_review "$ticket_id" || errors=$?
            results+=($([ $errors -eq 0 ] && echo "✓" || echo "✗"))

            gate_performance_test "$ticket_id" || errors=$?
            results+=($([ $errors -eq 0 ] && echo "✓" || echo "✗"))

            gate_security_test "$ticket_id" || errors=$?
            results+=($([ $errors -eq 0 ] && echo "✓" || echo "✗"))

            generate_test_report "$ticket_id" "${results[@]}"
            ;;
        unit_test)
            gate_unit_test "$ticket_id"
            ;;
        lint)
            gate_lint
            ;;
        integration_test)
            gate_integration_test "$ticket_id"
            ;;
        e2e_test)
            gate_e2e_test "$ticket_id"
            ;;
        acceptance_test)
            gate_acceptance_test "$ticket_id"
            ;;
        ui_ux_test)
            gate_ui_ux_test "$ticket_id"
            ;;
        code_review)
            gate_code_review "$ticket_id"
            ;;
        performance_test)
            gate_performance_test "$ticket_id"
            ;;
        security_test)
            gate_security_test "$ticket_id"
            ;;
        *)
            log_error "未知的门禁名称：$gate_name"
            exit 1
            ;;
    esac

    echo ""
    if [ $errors -eq 0 ]; then
        log_info "✅ 所有门禁通过"
        return 0
    else
        log_error "❌ 存在失败的门禁：$errors 个错误"
        return 1
    fi
}

main "$@"
