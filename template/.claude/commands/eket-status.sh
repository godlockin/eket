#!/bin/bash
# /eket-status - 查看智能体状态和任务列表

echo "========================================"
echo "EKET 智能体状态"
echo "========================================"
echo ""

# 检查任务目录
echo "## 任务列表"
if [ -d "tasks" ] && [ "$(ls -A tasks 2>/dev/null)" ]; then
    for task_file in tasks/*.md; do
        if [ -f "$task_file" ]; then
            echo ""
            echo "### $(basename "$task_file")"
            grep -E "^title:|^status:|^priority:" "$task_file" 2>/dev/null || cat "$task_file" | head -10
        fi
    done
else
    echo "暂无任务"
fi

echo ""
echo "## 输入信箱"
if [ -f "inbox/human_input.md" ]; then
    echo "✓ human_input.md 存在"
    grep -E "^timestamp:|^priority:" "inbox/human_input.md" 2>/dev/null
else
    echo "○ human_input.md 不存在"
fi

echo ""
echo "## 输出信箱"
if [ -d "outbox/review_requests" ] && [ "$(ls -A outbox/review_requests 2>/dev/null)" ]; then
    echo "有待处理的 Review 请求:"
    ls -1 outbox/review_requests/
else
    echo "○ 无 Review 请求"
fi

echo ""
echo "========================================"
