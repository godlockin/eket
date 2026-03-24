#!/bin/bash
# /eket-review - 请求 Review

set -e

# 动态路径配置 (v0.6.1)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
SCRIPTS_DIR="$PROJECT_ROOT/scripts"

echo "========================================"
echo "EKET Review 请求"
echo "========================================"
echo ""

# 检查参数
TASK_ID="${1:-}"

if [ -z "$TASK_ID" ]; then
    echo "用法：/eket-review [task-id]"
    echo ""
    echo "待 Review 的任务:"
    if [ -d "tasks" ] && [ "$(ls -A tasks 2>/dev/null)" ]; then
        for task_file in tasks/*.md; do
            if [ -f "$task_file" ]; then
                status=$(grep -E "^status:" "$task_file" 2>/dev/null | cut -d: -f2 | tr -d ' ')
                echo "  - $(basename "$task_file" .md) [status: $status]"
            fi
        done
    else
        echo "  暂无任务"
    fi
else
    # 创建 Review 请求
    TASK_FILE="tasks/${TASK_ID}.md"

    if [ ! -f "$TASK_FILE" ]; then
        echo "✗ 任务不存在：$TASK_FILE"
        exit 1
    fi

    REVIEW_DIR="outbox/review_requests"
    mkdir -p "$REVIEW_DIR"

    REVIEW_FILE="$REVIEW_DIR/review-${TASK_ID}-$(date +%Y%m%d-%H%M%S).md"

    cat > "$REVIEW_FILE" << EOF
# Review Request

**任务 ID**: $TASK_ID
**请求时间**: $(date -Iseconds)
**状态**: pending_review

---

## 变更内容

<!-- 请在此描述本次变更的内容 -->

## Review 意见

- [ ] 通过 - 可以合并
- [ ] 需要修改 - 请说明原因

## 反馈意见

<!-- 如有需要修改的地方，请在此说明 -->

EOF

    echo "✓ Review 请求已创建：$REVIEW_FILE"
    echo ""
    echo "等待人类 Review 后，将反馈放入 inbox/human_feedback/"
fi

echo "========================================"
