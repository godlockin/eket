#!/bin/bash
#
# EKET Checkpoint 验证器 v0.5.1
# 用途：验证各 Checkpoint 的完成标准
#
# 用法:
#   ./scripts/checkpoint-validator.sh <checkpoint_type> [ticket_id]
#

# 不使用 set -e，避免在可恢复错误处退出

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
JIRA_DIR="$PROJECT_ROOT/jira/tickets"
CONFIG_DIR="$PROJECT_ROOT/.eket/config"
SRC_DIR="$PROJECT_ROOT/src"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
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
    local config_file="$CONFIG_DIR/process.yml"

    if [ -f "$config_file" ]; then
        STRICT_MODE=$(grep "strict_mode:" "$config_file" 2>/dev/null | head -1 | awk '{print $2}' || echo "false")
    else
        STRICT_MODE=false
    fi
}

# 验证 task_start checkpoint
verify_task_start() {
    local ticket_id="$1"
    local errors=0

    log_info "验证 Checkpoint: task_start"

    # 检查依赖是否定义
    log_info "检查依赖定义..."
    local ticket_file="$JIRA_DIR"/*/"${ticket_id}.md"
    if [ -f "$ticket_file" ]; then
        local has_deps=$(grep -c "^dependencies:" "$ticket_file" 2>/dev/null || echo "0")
        if [ "$has_deps" -gt 0 ]; then
            log_info "✓ 依赖已定义"
        else
            log_warn "⚠ 未定义依赖 (可选)"
        fi
    fi

    # 检查分支是否创建
    log_info "检查分支创建..."
    local branch_name=$(git -C "$PROJECT_ROOT" branch --list "feature/*${ticket_id}*" 2>/dev/null | head -1)
    if [ -n "$branch_name" ]; then
        log_info "✓ 分支已创建：$branch_name"
    else
        log_error "✗ 分支未创建"
        ((errors++))
    fi

    # 检查计时器是否启动
    log_info "检查计时器启动..."
    local state_file="$PROJECT_ROOT/.eket/state/slaver-${ticket_id}.yml"
    if [ -f "$state_file" ]; then
        local has_start=$(grep -c "^started_at:" "$state_file" 2>/dev/null || echo "0")
        if [ "$has_start" -gt 0 ]; then
            log_info "✓ 计时器已启动"
        else
            log_error "✗ 计时器未启动"
            ((errors++))
        fi
    else
        log_warn "⚠ 状态文件不存在 (可选)"
    fi

    # 检查 Agent Profile 是否加载
    log_info "检查 Agent Profile..."
    local profile_file="$PROJECT_ROOT/.eket/state/agent-profile-${ticket_id}.yml"
    if [ -f "$profile_file" ]; then
        log_info "✓ Agent Profile 已加载"
    else
        log_warn "⚠ Agent Profile 未加载 (可选)"
    fi

    return $errors
}

# 验证 task_dev_complete checkpoint
verify_task_dev_complete() {
    local ticket_id="$1"
    local errors=0

    log_info "验证 Checkpoint: task_dev_complete"

    # 运行单元测试
    log_info "运行单元测试..."
    if [ -f "$PROJECT_ROOT/scripts/run-unit-tests.sh" ]; then
        if "$PROJECT_ROOT/scripts/run-unit-tests.sh" --ticket "$ticket_id" 2>/dev/null; then
            log_info "✓ 单元测试通过"
        else
            log_error "✗ 单元测试失败"
            ((errors++))
        fi
    else
        log_warn "⚠ 测试脚本不存在 (跳过)"
    fi

    # 运行 Lint 检查
    log_info "运行 Lint 检查..."
    if command -v npm &> /dev/null && [ -f "$PROJECT_ROOT/package.json" ]; then
        if npm run lint 2>/dev/null; then
            log_info "✓ Lint 检查通过"
        else
            log_error "✗ Lint 检查失败"
            ((errors++))
        fi
    else
        log_warn "⚠ NPM 不可用 (跳过)"
    fi

    # 检查代码覆盖率
    log_info "检查代码覆盖率..."
    if [ -f "$PROJECT_ROOT/coverage/coverage-summary.json" ]; then
        local coverage=$(cat "$PROJECT_ROOT/coverage/coverage-summary.json" | grep -o '"pct":[0-9.]*' | head -1 | cut -d':' -f2)
        local min_coverage=80

        # 根据任务类型调整阈值
        local ticket_file="$JIRA_DIR"/*/"${ticket_id}.md"
        if [ -f "$ticket_file" ]; then
            local ticket_type=$(grep "^type:" "$ticket_file" 2>/dev/null | cut -d':' -f2 | tr -d ' ')
            case "$ticket_type" in
                bugfix) min_coverage=85 ;;
                hotfix) min_coverage=70 ;;
                critical) min_coverage=95 ;;
            esac
        fi

        if (( $(echo "$coverage >= $min_coverage" | bc -l 2>/dev/null || echo "0") )); then
            log_info "✓ 代码覆盖率：${coverage}% (≥${min_coverage}%)"
        else
            log_error "✗ 代码覆盖率：${coverage}% (<${min_coverage}%)"
            ((errors++))
        fi
    else
        log_warn "⚠ 覆盖率报告不存在 (跳过)"
    fi

    return $errors
}

# 验证 task_test_complete checkpoint
verify_task_test_complete() {
    local ticket_id="$1"
    local errors=0

    log_info "验证 Checkpoint: task_test_complete"

    # 运行 E2E 测试
    log_info "运行 E2E 测试..."
    if [ -f "$PROJECT_ROOT/scripts/run-e2e-tests.sh" ]; then
        if "$PROJECT_ROOT/scripts/run-e2e-tests.sh" --ticket "$ticket_id" 2>/dev/null; then
            log_info "✓ E2E 测试通过"
        else
            log_error "✗ E2E 测试失败"
            ((errors++))
        fi
    else
        log_warn "⚠ E2E 测试脚本不存在 (跳过)"
    fi

    # 检查 PR 是否创建
    log_info "检查 PR 创建..."
    local pr_file="$PROJECT_ROOT/outbox/review_requests/${ticket_id}.md"
    if [ -f "$pr_file" ]; then
        log_info "✓ PR 已创建"
    else
        log_error "✗ PR 未创建"
        ((errors++))
    fi

    return $errors
}

# 验证 task_complete checkpoint
verify_task_complete() {
    local ticket_id="$1"
    local errors=0

    log_info "验证 Checkpoint: task_complete"

    # 验证所有功能完成
    log_info "验证功能完成..."
    local ticket_file="$JIRA_DIR"/*/"${ticket_id}.md"
    if [ -f "$ticket_file" ]; then
        # 检查验收标准
        local criteria_total=$(grep -c "^\- \[ \]" "$ticket_file" 2>/dev/null || echo "0")
        local criteria_done=$(grep -c "^\- \[x\]" "$ticket_file" 2>/dev/null || echo "0")

        if [ "$criteria_total" -eq 0 ] || [ "$criteria_done" -ge "$criteria_total" ]; then
            log_info "✓ 验收标准完成：$criteria_done/$criteria_total"
        else
            log_error "✗ 验收标准未完成：$criteria_done/$criteria_total"
            ((errors++))
        fi

        # 检查状态
        local status=$(grep "^status:" "$ticket_file" 2>/dev/null | cut -d':' -f2 | tr -d ' ')
        if [ "$status" = "done" ] || [ "$status" = "completed" ]; then
            log_info "✓ 任务状态：$status"
        else
            log_error "✗ 任务状态：$status (应为 done)"
            ((errors++))
        fi
    fi

    # 检查后续任务是否创建
    log_info "检查后续任务..."
    local followup_count=$(grep -c "FIX-${ticket_id}" "$JIRA_DIR"/*/*.md 2>/dev/null || echo "0")
    if [ "$followup_count" -gt 0 ]; then
        log_info "✓ 已创建 $followup_count 个后续任务"
    else
        log_warn "⚠ 无后续任务 (可选)"
    fi

    # 检查文档是否更新
    log_info "检查文档更新..."
    local doc_updated=$(grep -c "update_documentation" "$PROJECT_ROOT/.eket/state/${ticket_id}-checkpoints.yml" 2>/dev/null || echo "0")
    if [ "$doc_updated" -gt 0 ]; then
        log_info "✓ 文档已更新"
    else
        log_warn "⚠ 文档未更新 (可选)"
    fi

    return $errors
}

# 主函数
main() {
    local checkpoint_type="${1:-}"
    local ticket_id="${2:-}"

    if [ -z "$checkpoint_type" ]; then
        echo "用法：$0 <checkpoint_type> [ticket_id]"
        echo ""
        echo "Checkpoint 类型:"
        echo "  task_start        - 任务开始"
        echo "  task_dev_complete - 开发完成"
        echo "  task_test_complete - 测试完成"
        echo "  task_complete     - 任务完成"
        exit 1
    fi

    log_info "开始验证 Checkpoint: $checkpoint_type"

    # 加载配置
    load_config

    local errors=0

    case "$checkpoint_type" in
        task_start)
            verify_task_start "$ticket_id" || errors=$?
            ;;
        task_dev_complete)
            verify_task_dev_complete "$ticket_id" || errors=$?
            ;;
        task_test_complete)
            verify_task_test_complete "$ticket_id" || errors=$?
            ;;
        task_complete)
            verify_task_complete "$ticket_id" || errors=$?
            ;;
        *)
            log_error "未知的 Checkpoint 类型：$checkpoint_type"
            exit 1
            ;;
    esac

    echo ""
    if [ $errors -eq 0 ]; then
        log_info "✅ Checkpoint 验证通过"
        return 0
    else
        log_error "❌ Checkpoint 验证失败：$errors 个错误"

        if [ "$STRICT_MODE" = "true" ]; then
            log_error "严格模式下，阻塞流程"
            return 1
        else
            log_warn "非严格模式下，继续流程"
            return 0
        fi
    fi
}

main "$@"
