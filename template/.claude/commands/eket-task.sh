#!/bin/bash
# /eket-task - 创建或查看任务

echo "========================================"
echo "EKET 任务管理"
echo "========================================"
echo ""

# 检查参数
if [ $# -eq 0 ]; then
    echo "用法：/eket-task [任务描述]"
    echo ""
    echo "当前任务列表:"
    if [ -d "tasks" ] && [ "$(ls -A tasks 2>/dev/null)" ]; then
        for task_file in tasks/*.md; do
            if [ -f "$task_file" ]; then
                echo "  - $(basename "$task_file" .md)"
            fi
        done
    else
        echo "  暂无任务"
    fi
else
    # 创建新任务
    TASK_DESC="$*"
    TASK_ID="task-$(date +%Y%m%d-%H%M%S)"
    TASK_FILE="tasks/${TASK_ID}.md"

    cat > "$TASK_FILE" << EOF
# Task: $TASK_DESC

id: $TASK_ID
status: backlog
priority: normal
created_at: $(date -Iseconds)

---

## 描述

$TASK_DESC

## 验收标准

- [ ]

## 备注

EOF

    echo "✓ 任务已创建：$TASK_FILE"
    echo ""
    echo "编辑任务文件以添加更多详情"
fi

echo "========================================"
