#!/bin/bash
# scripts/recommend-tasks.sh - 任务推荐 (手动模式)

set -e

JIRA_DIR="jira/tickets"

echo "正在分析任务..."
echo ""

# 检查目录是否存在
if [ ! -d "$JIRA_DIR" ]; then
    echo "错误：Jira 目录不存在：$JIRA_DIR"
    exit 1
fi

# 临时文件存储任务信息
TEMP_FILE=$(mktemp)
trap "rm -f $TEMP_FILE" EXIT

for file in "$JIRA_DIR"/feature/*.md "$JIRA_DIR"/task/*.md "$JIRA_DIR"/bugfix/*.md; do
    if [ -f "$file" ]; then
        TASK_ID=$(basename "$file" .md)
        STATUS=$(grep "^status:" "$file" 2>/dev/null | cut -d' ' -f2 | tr -d ' ')

        # 只处理 ready 或 backlog 状态的任务
        if [ "$STATUS" != "ready" ] && [ "$STATUS" != "backlog" ]; then
            continue
        fi

        PRIORITY=$(grep "^priority:" "$file" 2>/dev/null | cut -d' ' -f2 | tr -d ' ')
        TITLE=$(grep "^title:" "$file" 2>/dev/null | cut -d':' -f2 | xargs)
        DEPS=$(grep "^dependencies:" "$file" 2>/dev/null | cut -d':' -f2 | xargs)
        TASK_TYPE="feature"
        if [[ "$file" == *"/bugfix/"* ]]; then
            TASK_TYPE="bugfix"
        fi

        # 计算优先级分数
        case "$PRIORITY" in
            urgent) SCORE=100 ;;
            high) SCORE=75 ;;
            normal) SCORE=50 ;;
            low) SCORE=25 ;;
            *) SCORE=50 ;;
        esac

        # Bugfix +10 分
        if [ "$TASK_TYPE" = "bugfix" ]; then
            SCORE=$((SCORE + 10))
        fi

        # 有依赖的任务 -20 分
        if [ -n "$DEPS" ] && [ "$DEPS" != "none" ] && [ "$DEPS" != "[]" ]; then
            SCORE=$((SCORE - 20))
        fi

        # 存储任务信息到临时文件
        echo "$SCORE|$TASK_ID|$PRIORITY|$TITLE|$DEPS|$STATUS|$TASK_TYPE" >> "$TEMP_FILE"
    fi
done

# 排序
SORT_FILE=$(mktemp)
sort -t'|' -k1 -rn "$TEMP_FILE" > "$SORT_FILE"

# 生成推荐
echo "┌──────────────────────────────────────────────────────────────┐"
echo "│              推荐优先处理的任务                               │"
echo "├──────────────────────────────────────────────────────────────┤"

RECOMMENDATION=1
TOP_TASK=""

while IFS='|' read -r SCORE TASK_ID PRIORITY TITLE DEPS STATUS TASK_TYPE; do
    if [ "$RECOMMENDATION" -le 3 ]; then
        # 记录第一个任务作为推荐
        if [ -z "$TOP_TASK" ]; then
            TOP_TASK="$TASK_ID"
        fi

        # 分析推荐理由
        REASON=""
        if [ "$TASK_TYPE" = "bugfix" ]; then
            REASON="缺陷修复类任务，影响用户体验，应优先处理"
        elif [ "$PRIORITY" = "urgent" ]; then
            REASON="紧急任务，业务优先级最高"
        elif [ "$PRIORITY" = "high" ]; then
            REASON="高优先级任务，对业务影响较大"
        elif [ -z "$DEPS" ] || [ "$DEPS" = "none" ] || [ "$DEPS" = "[]" ]; then
            REASON="无依赖任务，可以独立开始执行"
        else
            REASON="任务已就绪，按优先级排序推荐"
        fi

        # 截断标题
        DISPLAY_TITLE="${TITLE:0:48}"

        echo "│                                                              │"
        echo "│  【推荐 $RECOMMENDATION】$(printf '%-40s' "$TASK_ID")│"
        echo "│  标题：$(printf '%-48s' "$DISPLAY_TITLE")│"
        echo "│  优先级：$PRIORITY"
        echo "│  当前状态：$STATUS"
        echo "│  依赖：${DEPS:-无}"
        echo "│                                                              │"
        echo "│  推荐理由：                                                  │"
        echo "│  $REASON"
        echo "│                                                              │"

        if [ "$RECOMMENDATION" -lt 3 ]; then
            echo "│──────────────────────────────────────────────────────────────│"
        fi

        RECOMMENDATION=$((RECOMMENDATION + 1))
    fi
done < "$SORT_FILE"

echo "└──────────────────────────────────────────────────────────────┘"
echo ""

# 显示领取命令
echo "领取任务命令:"
echo "  /eket-claim <task-id>"
echo ""

if [ -n "$TOP_TASK" ]; then
    echo "示例:"
    echo "  /eket-claim $TOP_TASK"
fi
echo ""

# 检查是否有依赖
HAS_DEPS=false
while IFS='|' read -r SCORE TASK_ID PRIORITY TITLE DEPS STATUS TASK_TYPE; do
    if [ -n "$DEPS" ] && [ "$DEPS" != "none" ] && [ "$DEPS" != "[]" ]; then
        HAS_DEPS=true
        break
    fi
done < "$SORT_FILE"

if [ "$HAS_DEPS" = true ]; then
    echo "┌──────────────────────────────────────────────────────────────┐"
    echo "│  提示：部分任务存在依赖关系                                   │"
    echo "│  建议先完成无依赖的任务，再处理有依赖的任务                   │"
    echo "└──────────────────────────────────────────────────────────────┘"
    echo ""
fi

rm -f "$SORT_FILE"
