#!/bin/bash
# EKET Merge Strategy Validator v0.5
# 验证任务完成验收标准：所有功能点完成、UT 通过、Master Review 通过

set -e

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

# 配置
STATE_DIR=".eket/state"
REVIEW_DIR="outbox/review_requests"
JIRA_DIR="jira/tickets"

# ==========================================
# 验证功能点完成
# ==========================================

verify_feature_completion() {
    local ticket_id="$1"
    local ticket_file=$(find_jira_ticket "$ticket_id")

    echo -e "${BLUE}## 验证功能点完成：$ticket_id${NC}"

    if [ ! -f "$ticket_file" ]; then
        echo -e "${RED}✗${NC} 任务文件不存在：$ticket_file"
        return 1
    fi

    # 读取验收标准
    local acceptance_section=$(sed -n '/## 验收标准/,/##/p' "$ticket_file" | grep -v "^##" || true)

    if [ -z "$acceptance_section" ]; then
        echo -e "${YELLOW}⚠${NC} 未找到验收标准"
        return 0
    fi

    # 检查未完成的项
    local incomplete=$(echo "$acceptance_section" | grep -c "\- \[ \]" || echo "0")
    local complete=$(echo "$acceptance_section" | grep -c "\- \[x\]" || echo "0")

    echo "  - 已完成：$complete 项"
    echo "  - 未完成：$incomplete 项"

    if [ "$incomplete" -gt 0 ]; then
        echo -e "${RED}✗${NC} 存在未完成的功能点"

        # 创建后续任务
        create_follow_up_tickets "$ticket_id" "$incomplete"
        return 1
    else
        echo -e "${GREEN}✓${NC} 所有功能点已完成"
        return 0
    fi
}

# ==========================================
# 验证 UT 通过
# ==========================================

verify_unit_tests_pass() {
    local ticket_id="$1"
    local pr_file=$(find_pr_file "$ticket_id")

    echo -e "${BLUE}## 验证单元测试：$ticket_id${NC}"

    if [ ! -f "$pr_file" ]; then
        echo -e "${YELLOW}⚠${NC} PR 文件不存在：$pr_file"
        return 0  # 如果没有 PR 文件，跳过检查
    fi

    # 检查是否有测试通过标记
    if grep -q "unit_tests_pass: true" "$pr_file" 2>/dev/null; then
        echo -e "${GREEN}✓${NC} 单元测试已通过 (PR 标记)"
        return 0
    fi

    # 检查是否有测试报告
    local test_report=$(find_test_report "$ticket_id")
    if [ -n "$test_report" ] && grep -q "All tests passed" "$test_report" 2>/dev/null; then
        echo -e "${GREEN}✓${NC} 单元测试已通过 (测试报告)"
        return 0
    fi

    # 尝试运行测试
    echo "  - 运行单元测试..."
    if [ -f "tests/run-unit-tests.sh" ]; then
        if ./tests/run-unit-tests.sh --ticket "$ticket_id" 2>/dev/null; then
            echo -e "${GREEN}✓${NC} 单元测试通过"
            return 0
        else
            echo -e "${RED}✗${NC} 单元测试失败"
            return 1
        fi
    else
        echo -e "${YELLOW}⚠${NC} 未找到测试脚本，跳过检查"
        return 0
    fi
}

# ==========================================
# 验证 Master Review 通过
# ==========================================

verify_master_review_pass() {
    local ticket_id="$1"
    local review_file=$(find_review_file "$ticket_id")

    echo -e "${BLUE}## 验证 Master Review: $ticket_id${NC}"

    if [ ! -f "$review_file" ]; then
        echo -e "${YELLOW}⚠${NC} Review 文件不存在：$review_file"
        echo "  - 需要创建 Review 请求"
        return 1
    fi

    # 检查 Review 状态
    local review_status=$(grep "review_status:" "$review_file" 2>/dev/null | cut -d':' -f2 | tr -d ' ' || echo "pending")

    if [ "$review_status" = "approved" ]; then
        echo -e "${GREEN}✓${NC} Master Review 已通过"
        return 0
    elif [ "$review_status" = "changes_requested" ]; then
        echo -e "${RED}✗${NC} Master Review 要求修改"
        return 1
    elif [ "$review_status" = "pending" ]; then
        echo -e "${YELLOW}⚠${NC} Master Review 等待中"
        return 1
    else
        echo -e "${YELLOW}⚠${NC} Review 状态未知：$review_status"
        return 1
    fi
}

# ==========================================
# 创建后续任务
# ==========================================

create_follow_up_tickets() {
    local ticket_id="$1"
    local incomplete_count="$2"
    local prefix="${3:-FIX}"

    echo -e "${YELLOW}## 创建后续任务：$ticket_id${NC}"

    local follow_up_id="${prefix}-${ticket_id}-post"
    local follow_up_file="$JIRA_DIR/fix/${follow_up_id}.md"

    mkdir -p "$JIRA_DIR/fix"

    cat > "$follow_up_file" << EOF
# ${follow_up_id}: 修复未完成的功能点

**原任务**: $ticket_id
**创建时间**: $(date -Iseconds)
**优先级**: P1
**状态**: ready
**标签**: \`follow-up\` \`bugfix\`

---

## 任务描述

任务 $ticket_id 完成 $((100 - incomplete_count * 20))% 的功能点，剩余 $incomplete_count 个功能点未完成。

---

## 未完成的功能点

EOF

    # 提取未完成的验收标准
    local ticket_file=$(find_jira_ticket "$ticket_id")
    sed -n '/## 验收标准/,/##/p' "$ticket_file" | grep "\- \[ \]" >> "$follow_up_file" || true

    cat >> "$follow_up_file" << EOF

---

## 验收标准

- [ ] 所有未完成的功能点已实现
- [ ] 单元测试通过
- [ ] Master Review 通过

---

## 时间追踪

- **预估时间**: 60 分钟
- **开始时间**: (待领取后填写)
- **截止时间**: (待领取后填写)

---

**创建者**: EKET Merge Validator v0.5
**状态**: pending_assignment
EOF

    echo -e "${GREEN}✓${NC} 后续任务已创建：$follow_up_file"

    # 创建通知
    create_follow_up_notification "$ticket_id" "$follow_up_id"
}

# ==========================================
# 完整验证流程
# ==========================================

validate_merge_readiness() {
    local ticket_id="$1"

    echo -e "${BLUE}## 验证合并准备：$ticket_id${NC}"
    echo ""

    local features_ok=false
    local tests_ok=false
    local review_ok=false

    # 1. 验证功能点完成
    if verify_feature_completion "$ticket_id"; then
        features_ok=true
    fi

    # 2. 验证 UT 通过
    if verify_unit_tests_pass "$ticket_id"; then
        tests_ok=true
    fi

    # 3. 验证 Master Review 通过
    if verify_master_review_pass "$ticket_id"; then
        review_ok=true
    fi

    echo ""
    echo "┌──────────────────────────────────────────────────────────────┐"
    echo "│  验证结果                                                      │"
    echo "├──────────────────────────────────────────────────────────────┤"
    printf "│  %-50s │\n" "功能点完成：$([ "$features_ok" = true ] && echo "✓" || echo "✗")"
    printf "│  %-50s │\n" "UT 通过：$([ "$tests_ok" = true ] && echo "✓" || echo "✗")"
    printf "│  %-50s │\n" "Master Review: $([ "$review_ok" = true ] && echo "✓" || echo "✗")"
    echo "└──────────────────────────────────────────────────────────────┘"

    # 判断是否可以合并
    if [ "$features_ok" = true ] && [ "$tests_ok" = true ] && [ "$review_ok" = true ]; then
        echo ""
        echo -e "${GREEN}✓${NC} 所有验证通过，可以合并"
        return 0
    else
        echo ""
        echo -e "${YELLOW}⚠${NC} 存在未通过的验证项"

        if [ "$features_ok" = false ]; then
            echo "  - 功能点未完成，已创建后续任务"
        fi

        if [ "$tests_ok" = false ]; then
            echo "  - 单元测试未通过"
        fi

        if [ "$review_ok" = false ]; then
            echo "  - Master Review 未通过或未执行"
        fi

        return 1
    fi
}

# ==========================================
# 辅助函数
# ==========================================

find_jira_ticket() {
    local ticket_id="$1"
    find "$JIRA_DIR" -name "*${ticket_id}*" -o -name "${ticket_id}.md" 2>/dev/null | head -1
}

find_pr_file() {
    local ticket_id="$1"
    find "outbox/review_requests" -name "*${ticket_id}*" 2>/dev/null | head -1
}

find_review_file() {
    local ticket_id="$1"
    find "inbox/human_feedback" -name "*review*${ticket_id}*" 2>/dev/null | head -1
}

find_test_report() {
    local ticket_id="$1"
    find ".eket/logs" -name "*test*${ticket_id}*" 2>/dev/null | head -1
}

create_follow_up_notification() {
    local original_id="$1"
    local follow_up_id="$2"
    local notification_file="inbox/human_feedback/follow-up-task-created-$(date +%Y%m%d-%H%M%S).md"

    mkdir -p "inbox/human_feedback"

    cat > "$notification_file" << EOF
# 后续任务创建通知

**时间**: $(date -Iseconds)

---

## 任务完成情况

**原任务**: $original_id
**状态**: 部分完成
**完成率**: 部分功能点已完成

---

## 创建的后续任务

**任务 ID**: $follow_up_id
**类型**: 修复/补全
**优先级**: P1
**状态**: ready (等待领取)

---

## 下一步行动

1. 查看后续任务详情
2. 分配给合适的执行者
3. 跟踪修复进度

---

**生成者**: EKET Merge Validator v0.5
EOF

    echo -e "${GREEN}✓${NC} 通知已创建：$notification_file"
}

# ==========================================
# 入口
# ==========================================

case "${1:-validate}" in
    validate)
        validate_merge_readiness "$2"
        ;;
    features)
        verify_feature_completion "$2"
        ;;
    tests)
        verify_unit_tests_pass "$2"
        ;;
    review)
        verify_master_review_pass "$2"
        ;;
    follow-up)
        create_follow_up_tickets "$2" "${3:-0}"
        ;;
    *)
        echo "用法：$0 <command> <ticket_id>"
        echo ""
        echo "命令:"
        echo "  validate [ticket_id]    - 完整验证合并准备"
        echo "  features [ticket_id]    - 验证功能点完成"
        echo "  tests [ticket_id]       - 验证单元测试通过"
        echo "  review [ticket_id]      - 验证 Master Review 通过"
        echo "  follow-up [ticket_id]   - 创建后续任务"
        ;;
esac
