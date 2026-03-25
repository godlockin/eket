#!/bin/bash
#
# EKET 合并策略执行脚本 v0.5.1
# 用途：根据功能完成情况执行灵活的合并策略
#
# 用法:
#   ./scripts/merge-strategy.sh <ticket_id> [--auto]
#

# 不使用 set -e，避免在可恢复错误处退出

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
JIRA_DIR="$PROJECT_ROOT/jira/tickets"
CONFIG_DIR="$PROJECT_ROOT/.eket/config"

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
    local config_file="$CONFIG_DIR/review_merge.yml"

    if [ -f "$config_file" ]; then
        ALLOW_PARTIAL_MERGE=$(grep "allow_partial_merge:" "$config_file" 2>/dev/null | head -1 | awk '{print $2}' || echo "false")
        MIN_COMPLETION_PERCENT=$(grep "min_completion_percent:" "$config_file" 2>/dev/null | head -1 | awk '{print $2}' || echo "80")
        REQUIRE_FEATURE_FLAGS=$(grep "require_feature_flags:" "$config_file" 2>/dev/null | head -1 | awk '{print $2}' || echo "true")
    else
        ALLOW_PARTIAL_MERGE=false
        MIN_COMPLETION_PERCENT=80
        REQUIRE_FEATURE_FLAGS=true
    fi
}

# 计算功能完成率
calculate_completion_percent() {
    local ticket_id="$1"
    local ticket_file="$JIRA_DIR"/*/"${ticket_id}.md"

    if [ ! -f "$ticket_file" ]; then
        echo "0"
        return 1
    fi

    # 统计验收标准
    local total=$(grep -c "^\- \[" "$ticket_file" 2>/dev/null || echo "0")
    local completed=$(grep -c "^\- \[x\]" "$ticket_file" 2>/dev/null || echo "0")

    if [ "$total" -eq 0 ]; then
        echo "100"
        return 0
    fi

    local percent=$((completed * 100 / total))
    echo "$percent"
}

# 分析未完成的功能
analyze_incomplete_features() {
    local ticket_id="$1"
    local ticket_file="$JIRA_DIR"/*/"${ticket_id}.md"

    local incomplete=()

    while IFS= read -r line; do
        if [[ "$line" == *"[ ]"* ]] || [[ "$line" == *"[x]"* ]]; then
            if [[ "$line" != *"[x]"* ]]; then
                incomplete+=("$line")
            fi
        fi
    done < "$ticket_file"

    printf '%s\n' "${incomplete[@]}"
}

# 判断是否可以部分合并
can_partial_merge() {
    local ticket_id="$1"
    local completion_percent="$2"

    # 检查配置是否允许
    if [ "$ALLOW_PARTIAL_MERGE" != "true" ]; then
        return 1
    fi

    # 检查完成率是否达到阈值
    if [ "$completion_percent" -lt "$MIN_COMPLETION_PERCENT" ]; then
        log_warn "完成率 ${completion_percent}% < 阈值 ${MIN_COMPLETION_PERCENT}%"
        return 1
    fi

    # 检查是否有功能标志
    if [ "$REQUIRE_FEATURE_FLAGS" = "true" ]; then
        local ticket_file="$JIRA_DIR"/*/"${ticket_id}.md"
        if grep -q "feature_flag\|feature-flag\|feature_flag" "$ticket_file" 2>/dev/null; then
            log_info "检测到功能标志，允许部分合并"
            return 0
        else
            log_warn "需要功能标志才能部分合并"
            return 1
        fi
    fi

    return 0
}

# 执行全部合并
do_full_merge() {
    local ticket_id="$1"
    local feature_branch="$2"

    log_info "执行全部合并..."

    # 合并到 testing
    log_info "合并到 testing 分支..."
    git -C "$PROJECT_ROOT" checkout testing 2>/dev/null
    git -C "$PROJECT_ROOT" merge --no-ff "$feature_branch" -m "Merge $feature_branch into testing" 2>/dev/null || {
        log_error "合并到 testing 失败"
        return 1
    }

    # 运行集成测试
    log_info "运行集成测试..."
    if [ -f "$PROJECT_ROOT/scripts/run-integration-tests.sh" ]; then
        "$PROJECT_ROOT/scripts/run-integration-tests.sh" || {
            log_error "集成测试失败"
            return 1
        }
    fi

    # 合并到 main
    log_info "合并到 main 分支..."
    git -C "$PROJECT_ROOT" checkout main 2>/dev/null
    git -C "$PROJECT_ROOT" merge --no-ff testing -m "Merge testing into main (includes $ticket_id)" 2>/dev/null || {
        log_error "合并到 main 失败"
        return 1
    }

    # 推送远程
    log_info "推送远程仓库..."
    git -C "$PROJECT_ROOT" push origin main testing 2>/dev/null || {
        log_warn "推送失败 (可选)"
    }

    log_info "✅ 全部合并完成"
    return 0
}

# 执行部分合并 (cherry-pick)
do_partial_merge() {
    local ticket_id="$1"
    local feature_branch="$2"

    log_info "执行部分合并 (cherry-pick)..."

    # 获取已完成的提交
    local commits=()
    while IFS= read -r commit; do
        commits+=("$commit")
    done < <(git -C "$PROJECT_ROOT" log "$feature_branch" --oneline --grep="$ticket_id" 2>/dev/null || true)

    if [ ${#commits[@]} -eq 0 ]; then
        log_warn "未找到相关提交"
        return 1
    fi

    # Cherry-pick 到 testing
    log_info "Cherry-pick 到 testing..."
    git -C "$PROJECT_ROOT" checkout testing 2>/dev/null

    for commit in "${commits[@]}"; do
        local commit_hash=$(echo "$commit" | cut -d' ' -f1)
        log_info "Cherry-pick: $commit_hash"
        git -C "$PROJECT_ROOT" cherry-pick "$commit_hash" 2>/dev/null || {
            log_warn "Cherry-pick 失败：$commit_hash"
        }
    done

    # 创建后续任务
    create_follow_up_ticket "$ticket_id"

    log_info "✅ 部分合并完成"
    return 0
}

# 创建后续任务
create_follow_up_ticket() {
    local original_ticket_id="$1"
    local timestamp=$(date +%Y%m%d_%H%M%S)
    local followup_id="FIX-${original_ticket_id}-post-${timestamp}"
    local followup_file="$JIRA_DIR/fix/${followup_id}.md"

    mkdir -p "$(dirname "$followup_file")"

    # 分析未完成的功能
    local incomplete_features=$(analyze_incomplete_features "$original_ticket_id")

    cat > "$followup_file" << EOF
# ${followup_id}: 完成 ${original_ticket_id} 的未完成功能

**类型**: Fix
**原任务**: ${original_ticket_id}
**优先级**: P1
**状态**: ready
**标签**: \`follow-up\` \`partial-merge\`

---

## 任务描述

任务 ${original_ticket_id} 已部分合并，以下功能尚未完成：

${incomplete_features}

---

## 验收标准

- [ ] 完成上述所有功能
- [ ] 通过单元测试
- [ ] 通过集成测试
- [ ] 更新文档

---

## 时间追踪

- **预估时间**: 120 分钟
- **开始时间**: (待领取后填写)
- **截止时间**: (待领取后填写)

---

**创建时间**: $(date -Iseconds)
**创建者**: EKET Merge Strategy v0.5.1
EOF

    log_info "后续任务已创建：$followup_file"
}

# 主函数
main() {
    local ticket_id="${1:-}"
    local auto_mode=false

    # 解析参数
    while [[ $# -gt 0 ]]; do
        case $1 in
            --auto|-a)
                auto_mode=true
                shift
                ;;
            *)
                shift
                ;;
        esac
    done

    if [ -z "$ticket_id" ]; then
        echo "用法：$0 <ticket_id> [--auto]"
        exit 1
    fi

    log_info "执行合并策略：$ticket_id"

    # 加载配置
    load_config

    # 计算完成率
    local completion_percent=$(calculate_completion_percent "$ticket_id")
    log_info "功能完成率：${completion_percent}%"

    # 获取分支名
    local feature_branch=$(git -C "$PROJECT_ROOT" branch --list "feature/*${ticket_id}*" 2>/dev/null | head -1 | tr -d ' ')

    if [ -z "$feature_branch" ]; then
        log_error "未找到功能分支"
        exit 1
    fi

    # 决策合并策略
    if [ "$completion_percent" -eq 100 ]; then
        log_info "所有功能已完成，执行全部合并"
        do_full_merge "$ticket_id" "$feature_branch"
    elif can_partial_merge "$ticket_id" "$completion_percent"; then
        log_info "满足部分合并条件"

        if [ "$auto_mode" = true ]; then
            do_partial_merge "$ticket_id" "$feature_branch"
        else
            # 询问用户
            echo ""
            echo "选择合并策略:"
            echo "  1. 部分合并 (cherry-pick 已完成功能)"
            echo "  2. 等待全部完成"
            echo "  3. 取消"
            echo ""
            read -p "请选择 (1/2/3): " choice

            case "$choice" in
                1) do_partial_merge "$ticket_id" "$feature_branch" ;;
                2) log_info "等待全部完成后重试" ;;
                3) log_info "已取消" ;;
                *) log_error "无效选择" ;;
            esac
        fi
    else
        log_error "不满足合并条件"
        echo ""
        echo "建议:"
        echo "  1. 完成剩余功能"
        echo "  2. 或者添加功能标志后重试"
        exit 1
    fi
}

main "$@"
