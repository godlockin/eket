#!/bin/bash
# scripts/prioritize-tasks.sh - 任务优先级排序 (自动模式)

set -e

JIRA_DIR="jira/tickets"
AUTO_MODE=false

# 检查参数
while getopts "a" opt; do
    case $opt in
        a)
            AUTO_MODE=true
            ;;
    esac
done

# 检查目录是否存在
if [ ! -d "$JIRA_DIR" ]; then
    echo "错误：Jira 目录不存在：$JIRA_DIR"
    exit 1
fi

echo "分析任务优先级..."
echo ""

# 临时文件存储任务信息
TEMP_FILE=$(mktemp)
trap "rm -f $TEMP_FILE" EXIT

# 读取任务文件
for file in "$JIRA_DIR"/feature/*.md "$JIRA_DIR"/task/*.md "$JIRA_DIR"/bugfix/*.md; do
    if [ -f "$file" ]; then
        TASK_ID=$(basename "$file" .md)
        STATUS=$(grep "^status:" "$file" 2>/dev/null | cut -d' ' -f2 | tr -d ' ')

        # 只处理 ready 或 backlog 状态的任务
        if [ "$STATUS" != "ready" ] && [ "$STATUS" != "backlog" ]; then
            continue
        fi

        PRIORITY=$(grep "^priority:" "$file" 2>/dev/null | cut -d' ' -f2 | tr -d ' ')
        DEPS=$(grep "^dependencies:" "$file" 2>/dev/null | cut -d':' -f2 | xargs)

        # 优先级分数
        case "$PRIORITY" in
            urgent) SCORE=100 ;;
            high) SCORE=75 ;;
            normal) SCORE=50 ;;
            low) SCORE=25 ;;
            *) SCORE=50 ;;
        esac

        # Bugfix 优先级 +10
        if [[ "$file" == *"/bugfix/"* ]]; then
            SCORE=$((SCORE + 10))
        fi

        # 有依赖的任务 -20 分
        if [ -n "$DEPS" ] && [ "$DEPS" != "none" ] && [ "$DEPS" != "[]" ]; then
            SCORE=$((SCORE - 20))
        fi

        # 存储任务信息到临时文件
        echo "$SCORE|$TASK_ID|$STATUS|$DEPS" >> "$TEMP_FILE"
    fi
done

# 按优先级排序
echo "任务优先级排序结果:"
echo ""
echo "┌──────────────────────────────────────────────────────────────┐"
echo "│  优先级  │  任务 ID  │  状态  │  分数  │  依赖               │"
echo "├──────────────────────────────────────────────────────────────┤"

# 排序并输出
sort -t'|' -k1 -rn "$TEMP_FILE" | while IFS='|' read -r SCORE TASK_ID STATUS DEPS; do
    if [ "$SCORE" -ge 80 ]; then
        PRIORITY_LABEL="紧急"
    elif [ "$SCORE" -ge 60 ]; then
        PRIORITY_LABEL="高"
    else
        PRIORITY_LABEL="中"
    fi

    printf "│  %-8s│  %-15s│  %-8s│  %-6s│  %-15s│\n" \
        "$PRIORITY_LABEL" \
        "$TASK_ID" \
        "${STATUS:-unknown}" \
        "$SCORE" \
        "${DEPS:0:15}"
    echo "│                                                                │"
done

echo "└──────────────────────────────────────────────────────────────┘"
echo ""

# 自动模式：领取最高优先级任务
if [ "$AUTO_MODE" = true ]; then
    # 获取最高优先级任务
    TOP_LINE=$(sort -t'|' -k1 -rn "$TEMP_FILE" | head -1)
    TOP_SCORE=$(echo "$TOP_LINE" | cut -d'|' -f1)
    TOP_TASK=$(echo "$TOP_LINE" | cut -d'|' -f2)

    if [ -n "$TOP_TASK" ]; then
        echo "┌──────────────────────────────────────────────────────────────┐"
        echo "│  自动模式：领取任务                                          │"
        echo "├──────────────────────────────────────────────────────────────┤"
        echo "│  已选择：$TOP_TASK"
        echo "│  优先级分数：$TOP_SCORE"
        echo "│                                                              │"
        echo "│  正在更新任务状态..."

        # 查找任务文件
        TASK_FILE=""
        for dir in feature task bugfix; do
            if [ -f "$JIRA_DIR/$dir/$TOP_TASK.md" ]; then
                TASK_FILE="$JIRA_DIR/$dir/$TOP_TASK.md"
                break
            fi
        done

        if [ -n "$TASK_FILE" ] && [ -f "$TASK_FILE" ]; then
            sed -i.bak "s/^status:.*/status: in_progress/" "$TASK_FILE"
            echo "assigned_to: agent-$(date +%Y%m%d%H%M%S)" >> "$TASK_FILE"
            rm -f "$TASK_FILE.bak"

            echo "│  ✓ 任务状态已更新为 in_progress"
            echo "│                                                              │"
            echo "│  正在加载对应 profile 和 skills..."
            echo ""

            # 调用 Agent Profile 加载脚本
            if [ -x "scripts/load-agent-profile.sh" ]; then
                ./scripts/load-agent-profile.sh "$TOP_TASK"
            else
                echo "│  ⚠ load-agent-profile.sh 不存在"
            fi

            echo "│                                                              │"
            echo "│  准备开始处理任务"
        fi

        echo "└──────────────────────────────────────────────────────────────┘"
    fi
fi
